// Auto Job Solver — helper functions: tracker, map fetch, loadout orchestration, priority.

import { MARKET_DISPLAY_NAMES, JOB_TYPE_PRIORITY, LOG_JOB_TYPES, getMarketNameById } from '../shared/server-constants.js';
import { humanDelay, safeTimeout, safeClearTimeout } from '../shared/ws-utils.js';
import { formatMinigameLockError, ensureDecryptSolverEnabled, ensureIceWallSolverEnabled, ensureSimpleDecryptSolverEnabled } from '../shared/hack-utils.js';
import { state, serverMap, sendCmd, delay, waitForEvent, log, SERVER_PRIORITY, SERVER_PATH_MAP } from './state.js';

// ---- Priority helpers ----

export function isJobBugged(job) {
    return job.serverName === 'D4RK RM7CE' && LOG_JOB_TYPES.indexOf(job.type || job.name) >= 0;
}

export function getServerPriority(serverName) {
    if (!serverName || serverName === 'None') return -1;
    if (serverMap.isReady()) {
        return serverMap.getServerPriorityIndex(serverName);
    }
    var idx = SERVER_PRIORITY.indexOf(serverName);
    return idx >= 0 ? idx : SERVER_PRIORITY.length;
}

export function getJobTypePriority(typeName) {
    var idx = JOB_TYPE_PRIORITY.indexOf(typeName);
    return idx >= 0 ? idx : JOB_TYPE_PRIORITY.length;
}

// ---- Tracker / persistence ----

export function updateTracker() {
    window.postMessage({ type: 'COR3_AUTOJOB_TRACKER_UPDATE', tracker: state.jobQueue }, '*');
}

export function saveCompletedResultsIncremental() {
    var results = state.jobQueue.filter(function (j) { return j.status === 'done' || j.status === 'failed' || j.status === 'skipped' || j.status === 'bugged'; }).map(function (j) {
        return {
            jobId: j.jobId, name: j.name, type: j.type, serverName: j.serverName,
            marketKey: j.marketKey, status: j.status, reward: j.reward || null,
            error: j.error || null, completedAt: Date.now(),
            maintenanceEndsAt: j.maintenanceEndsAt || null,
            lockExpiresAt: j.lockExpiresAt || null
        };
    });
    window.postMessage({ type: 'COR3_AUTOJOB_SAVE_COMPLETED', jobs: results }, '*');
}

export function signalDone() {
    state.running = false;
    state._currentJobRef = null;
    window.postMessage({ type: 'COR3_AUTOJOB_DONE', tokenExpired: state.tokenExpired }, '*');
}

// ---- Network map fetch ----

export async function fetchMapData(forceRefresh) {
    if (!forceRefresh && state._cachedMapData) return state._cachedMapData;
    var oldFingerprint = serverMap.isReady() ? serverMap.getMaintenanceFingerprint() : null;
    var fullDataPromise = new Promise(function (resolve) {
        var t;
        function onFullMap(evt) {
            if (evt.data && evt.data.type === 'COR3_WS_MAP_DATA' && evt.data.servers) {
                window.removeEventListener('message', onFullMap);
                clearTimeout(t);
                resolve({ servers: evt.data.servers, connections: evt.data.connections || [] });
            }
        }
        window.addEventListener('message', onFullMap);
        t = setTimeout(function () { window.removeEventListener('message', onFullMap); resolve(null); }, 12000);
    });
    sendCmd('get.map', {});
    var mapData = await waitForEvent('COR3_WS_NETWORK_MAP', 10000);
    if (mapData && mapData.servers) {
        state._cachedMapData = mapData;
        var fullData = await fullDataPromise;
        if (fullData) {
            serverMap.update(fullData);
            var newFingerprint = serverMap.getMaintenanceFingerprint();
            if (oldFingerprint !== null && oldFingerprint !== newFingerprint) {
                log('Server state changed — path cache refreshed');
            }
        }
    }
    return mapData;
}

export async function checkPathMaintenance(serverName) {
    if (serverMap.isReady()) {
        return serverMap.checkPathMaintenance(serverName);
    }
    var path = SERVER_PATH_MAP[serverName];
    if (!path) return { blocked: false };
    var mapData = await fetchMapData();
    if (!mapData || !mapData.servers) return { blocked: false };
    for (var i = 0; i < path.length; i++) {
        var srv = path[i];
        var srvInfo = mapData.servers[srv.id];
        if (srvInfo && srvInfo.isInMaintenance) {
            var remaining = srvInfo.maintenanceEndsAt ? new Date(srvInfo.maintenanceEndsAt).getTime() - Date.now() : 0;
            if (remaining > 0) {
                return { blocked: true, blockerName: srv.name, endsAt: srvInfo.maintenanceEndsAt, remainingMs: remaining };
            }
        }
    }
    return { blocked: false };
}

// ---- Server name/path lookups ----

export function getServerNameById(serverId) {
    if (serverMap.isReady()) {
        var s = serverMap.getServer(serverId);
        if (s) return s.name;
    }
    for (var name in SERVER_PATH_MAP) {
        var path = SERVER_PATH_MAP[name];
        for (var i = 0; i < path.length; i++) {
            if (path[i].id === serverId) return path[i].name;
        }
    }
    return null;
}

export function getPathForServerId(serverId) {
    if (serverMap.isReady()) {
        var path = serverMap.getShortestPath(serverId);
        if (path) return path;
    }
    for (var name in SERVER_PATH_MAP) {
        var path = SERVER_PATH_MAP[name];
        if (path.length > 0 && path[path.length - 1].id === serverId) {
            return path;
        }
    }
    return null;
}

// ---- Shared actual-Power loadout orchestration ----
export { invalidateLoadoutCache, getLoadoutData, applyLoadoutChange, ensureLoadoutForJob,
    ensureDecryptOnlyLoadout, checkDecryptPowerViaAnalysis, tryLoadoutSwapForError } from './loadout.js';

// ---- Job label formatting ----

export function jobLabel(job) {
    var parts = [job.name || job.type];
    if (job.serverName && job.serverName !== 'None') parts.push('on ' + job.serverName);
    var mkt = MARKET_DISPLAY_NAMES[job.marketKey] || '';
    if (mkt) parts.push('[' + mkt + ']');
    return parts.join(' ');
}

export function jobConditionsRequireDecrypt(job) {
    if (!job.conditions) return false;
    for (var i = 0; i < job.conditions.length; i++) {
        var cond = job.conditions[i];
        if (cond.type === 'DecryptFile' || cond.type === 'DecryptDownloadedFile') return true;
    }
    return false;
}

export function extractFileInfoFromConditions(job) {
    if (!job.conditions) return null;
    for (var i = 0; i < job.conditions.length; i++) {
        var cond = job.conditions[i];
        if ((cond.type === 'DecryptFile' || cond.type === 'DecryptDownloadedFile') && cond.details && cond.details.files && cond.details.files.length > 0) {
            return cond.details.files[0];
        }
    }
    return null;
}

// ---- Shared minigame helpers (used by multiple solvers) ----

export function waitForMinigameOrError(timeoutMs) {
    return new Promise(function (resolve) {
        var done = false;
        var timer = safeTimeout(function () { if (!done) { done = true; cleanup(); resolve({ timeout: true }); } }, timeoutMs);
        function onDesktopFile(evt) {
            if (!evt.data || done) return;
            if (evt.data.type === 'COR3_AUTOJOB_DESKTOP_FILE' && evt.data.error) {
                done = true; cleanup(); resolve({ error: evt.data.error });
            }
        }
        function onMinigame(evt) {
            if (!evt.data || done) return;
            if (evt.data.type === 'COR3_AUTOJOB_MINIGAME_LOCKED') {
                done = true; cleanup(); resolve({ locked: evt.data.data });
            } else if (evt.data.type === 'COR3_AUTOJOB_MINIGAME_START') {
                done = true; cleanup(); resolve({ minigame: evt.data });
            }
        }
        function cleanup() { safeClearTimeout(timer); window.removeEventListener('message', onDesktopFile); window.removeEventListener('message', onMinigame); }
        window.addEventListener('message', onDesktopFile);
        window.addEventListener('message', onMinigame);
    });
}

export function throwMinigameLockError(lockData) {
    var lockInfo = formatMinigameLockError(lockData);
    if (lockInfo) {
        log('🔒 Minigame locked — ' + lockInfo.message, 'warn');
        var lockErr = new Error('minigame-locked: ' + lockInfo.message);
        lockErr.lockExpiresAt = lockInfo.lockExpiresAt;
        lockErr.remainingMs = lockInfo.remainingMs;
        throw lockErr;
    }
}
