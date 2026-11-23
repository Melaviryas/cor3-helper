import { state, sendCmd, delay, waitForEvent, log } from './state.js';
import { safeTimeout, safeClearTimeout, humanDelay } from '../shared/ws-utils.js';
import { getServerTypeName } from '../shared/loadout-resolver.js';
import { chooseBestLoadout, normalizeFileType, normalizeLoadoutMode, hardwareMatches,
    softwareMatches, hardwareTransition, targetPower } from '../shared/loadout-optimizer.js';

let fetching = null;
export function invalidateLoadoutCache() { state._cachedLoadout = null; state._cachedLoadoutAt = 0; }
const mode = () => normalizeLoadoutMode(state.solverSettings.loadoutMode);
function fullLoadout(data) {
    return !!data?.equippedHardware && Array.isArray(data.equippedSoftware) && Array.isArray(data.ownedSoftware);
}
function remember(data) { state._cachedLoadout = data; state._cachedLoadoutAt = Date.now(); return data; }
function command(cmd, data, action, accepts = () => true, expectedMode = null) {
    return new Promise((resolve, reject) => {
        let done = false, timer = null, abortTimer = null;
        function finish(error, value) {
            if (done) return;
            done = true;
            safeClearTimeout(timer); safeClearTimeout(abortTimer);
            window.removeEventListener('message', onMessage);
            if (error) { invalidateLoadoutCache(); reject(error); } else resolve(remember(value));
        }
        function check() {
            if (state.abortFlag) { finish(new Error('Aborted')); return; }
            if (expectedMode !== null && mode() !== expectedMode) { finish(new Error('Loadout mode changed; stopping this swap')); return; }
            if (!done) abortTimer = safeTimeout(check, 300);
        }
        function onMessage(event) {
            if (event.source !== window || event.data?.action !== action) return;
            const packet = event.data;
            if (packet.type === 'COR3_WS_LOADOUT_ERROR' || (packet.type === 'COR3_AUTOJOB_LOADOUT' && packet.error)) {
                finish(new Error('Loadout ' + action + ' rejected: ' + (packet.error?.message || 'unknown server error'))); return;
            }
            if (packet.type !== 'COR3_AUTOJOB_LOADOUT' || !fullLoadout(packet.data)) return;
            if (!accepts(packet.data)) { finish(new Error('Server did not confirm the requested loadout change (' + action + ')')); return; }
            finish(null, packet.data);
        }
        window.addEventListener('message', onMessage);
        timer = safeTimeout(() => finish(new Error('Loadout ' + action + ' timed out; configuration is unconfirmed')), 10000);
        check();
        if (!done) sendCmd(cmd, data);
    });
}
export async function getLoadoutData(forceRefresh = false) {
    if (!forceRefresh && state._cachedLoadout && Date.now() - state._cachedLoadoutAt < 60000) return state._cachedLoadout;
    if (fetching) return fetching;
    fetching = (async () => {
        const remaining = state.LOADOUT_COOLDOWN_MS - (Date.now() - state._lastLoadoutFetchAt);
        if (remaining > 0) await delay(remaining);
        state._lastLoadoutFetchAt = Date.now();
        log('Loadout: requesting fresh owned hardware/software and equipped state');
        return command('loadout.get', {}, 'get.options');
    })();
    try { return await fetching; } finally { fetching = null; }
}

export async function applyLoadoutChange(loadout, targetHw, targetSwIds) {
    const selectedMode = mode();
    if (selectedMode === 'software' && !hardwareMatches(loadout.equippedHardware, targetHw)) {
        throw new Error('Software-only mode cannot change hardware');
    }
    const sequence = hardwareTransition(loadout.equippedHardware, targetHw);
    if (!sequence) throw new Error('No safe hardware switching order fits the PSU');
    let actual = loadout;
    let changed = false;
    const checkMode = () => {
        if (state.abortFlag) throw new Error('Aborted');
        if (mode() !== selectedMode) throw new Error('Loadout mode changed; recheck on the next task');
    };
    // During a hardware swap, remove all software first so intermediate hardware
    // does not have to satisfy the resource demands of the previous tool.
    const remove = actual.equippedSoftware.filter(sw => sequence.length || !targetSwIds.includes(sw.id)).map(sw => sw.id);
    for (const id of remove) {
        checkMode();
        const expected = actual.equippedSoftware.filter(sw => sw.id !== id).map(sw => sw.id);
        const hw = actual.equippedHardware;
        log('Loadout: unequipping software ' + id);
        actual = await command('loadout.unequip.software', { moduleConfigId: id }, 'unequip.software',
            value => hardwareMatches(value.equippedHardware, hw) && softwareMatches(value.equippedSoftware, expected), selectedMode);
        changed = true;
        await delay(300);
    }
    for (const slot of sequence) {
        checkMode();
        const expectedHw = { ...actual.equippedHardware, [slot]: targetHw[slot] };
        log('Loadout: equipping ' + slot.toUpperCase() + ': ' + targetHw[slot].name);
        actual = await command('loadout.equip.hardware', { moduleConfigId: targetHw[slot].id }, 'equip.hardware',
            value => hardwareMatches(value.equippedHardware, expectedHw) && softwareMatches(value.equippedSoftware, []), selectedMode);
        changed = true;
        await delay(humanDelay());
    }
    for (const id of targetSwIds) {
        if (actual.equippedSoftware.some(sw => sw.id === id)) continue;
        checkMode();
        const expected = [...actual.equippedSoftware.map(sw => sw.id), id];
        const hw = actual.equippedHardware;
        log('Loadout: equipping software ' + id);
        actual = await command('loadout.equip.software', { moduleConfigId: id }, 'equip.software',
            value => hardwareMatches(value.equippedHardware, hw) && softwareMatches(value.equippedSoftware, expected), selectedMode);
        changed = true;
        await delay(300);
    }
    checkMode();
    if (changed) actual = await getLoadoutData(true);
    if (!hardwareMatches(actual.equippedHardware, targetHw) || !softwareMatches(actual.equippedSoftware, targetSwIds)) {
        throw new Error('Final loadout verification failed; task stopped before using an unconfirmed configuration');
    }
    return actual;
}

export function decryptFileType(job, error = '') {
    if (job.fileType) return normalizeFileType(job.fileType);
    const conditions = Array.isArray(job.conditions) ? job.conditions : job.conditions?.items || [];
    for (const condition of conditions) {
        if (condition.details?.fileExtension) return normalizeFileType(condition.details.fileExtension);
    }
    const files = [job.fileInfo, ...conditions.flatMap(condition => condition.details?.files || [])];
    for (const file of files) {
        const name = file?.name || file?.fileName;
        if (typeof name === 'string' && name.lastIndexOf('.') >= 0) return normalizeFileType(name.slice(name.lastIndexOf('.')));
    }
    return normalizeFileType(error.match(/decrypt\s+(\.\w+)\s+extension/i)?.[1]);
}
function select(loadout, type, target, requiredPower = 0) {
    const result = chooseBestLoadout(loadout, { type, target, mode: mode(), requiredPower });
    const scores = result.candidates.map(tool => tool.name + ': ' + (tool.power === null ? 'cannot boot' : tool.power)).join('; ');
    log('Loadout: ' + type + ' ' + target + ' actual Power (' + mode() + '): ' + (scores || 'no compatible owned tools'));
    if (!result.best || !result.meetsRequirement) throw new Error('Loadout: ' + result.reason);
    log('Loadout: selected ' + result.best.software.name + ' — actual ' + type + ' Power ' + result.best.power);
    return result.best;
}
async function applyPlan(loadout, plan) {
    const actual = await applyLoadoutChange(loadout, plan.hardware, [plan.software.id]);
    const power = targetPower(actual, plan.software.id, plan.type, plan.target);
    if (power === null || power < plan.power) throw new Error('Loadout metadata changed during the swap; fresh selection is required');
    log('Loadout: verified ' + plan.software.name + ' equipped; computed ' + plan.type + ' Power ' + power);
    return actual;
}
export async function ensureLoadoutForJob(job) {
    if (!job.serverId) return true;
    const serverType = getServerTypeName(job.serverId);
    state._lastLoadoutServerType = serverType || state._lastLoadoutServerType;
    try {
        const waiting = waitForEvent('COR3_AUTOJOB_SAI_LOGIN_STATUS', 5000);
        sendCmd('get.login.status', { serverId: job.serverId });
        const login = await waiting;
        if (login.data?.activeAccesses?.length) { log('Loadout: existing access — HACK loadout unchanged'); return true; }
    } catch (error) {
        if (state.abortFlag) throw error;
        log('Loadout: login pre-check unavailable; checking HACK tools', 'warn');
    }
    if (!serverType) { log('Loadout: unknown server type; HACK selection deferred', 'warn'); return true; }
    const loadout = await getLoadoutData(true);
    const plan = select(loadout, 'HACK', serverType);
    await applyPlan(loadout, plan);
    return true;
}
export async function ensureDecryptOnlyLoadout(job) {
    const target = decryptFileType(job);
    if (!target) throw new Error('Cannot identify file extension for safe DECRYPT selection');
    job.fileType = target;
    const loadout = await getLoadoutData(true);
    const plan = select(loadout, 'DECRYPT', target, job._decryptRequiredPower || 0);
    await applyPlan(loadout, plan);
}
export async function checkDecryptPowerViaAnalysis(fileId, job) {
    const waiting = waitForEvent('COR3_AUTOJOB_FILE_ANALYSIS', 8000);
    sendCmd('get.file.analysis', { fileId });
    const result = await waiting;
    if (result.error || !result.data || typeof result.data.canDecrypt !== 'boolean') {
        throw new Error('File analysis could not confirm decryption eligibility');
    }
    if (result.data.isEncrypted === false) { log('Loadout: file is already decrypted; no decrypt Power is required'); return true; }
    const observed = Number(result.data.decryptPower);
    if (Number.isFinite(observed)) log('Loadout: server-reported DECRYPT Power ' + observed);
    const required = Number(result.data.requiredDecryptPower ?? result.data.requiredPower ?? result.data.required);
    if (Number.isFinite(required) && required > 0) job._decryptRequiredPower = required;
    log('Loadout: server file analysis — ' + (result.data.canDecrypt ? 'can decrypt' : 'cannot decrypt'), result.data.canDecrypt ? 'info' : 'warn');
    return result.data.canDecrypt;
}
export async function tryLoadoutSwapForError(errorMsg, job, errorObj = {}) {
    if (!errorMsg) return false;
    const hack = /sai-no-hack-software|sai-hack-impossible/.test(errorMsg);
    const decrypt = /missing-software|File is encrypted|insufficient[_-]power/.test(errorMsg);
    if (!hack && !decrypt) return false;
    const target = hack ? getServerTypeName(job.serverId) : decryptFileType(job, errorMsg);
    if (!target) { log('Loadout: retry target unknown; no speculative swap', 'warn'); return false; }
    const required = hack ? 0 : Number(errorObj?.required) || job._decryptRequiredPower || 0;
    try {
        const loadout = await getLoadoutData(true);
        const plan = select(loadout, hack ? 'HACK' : 'DECRYPT', target, required);
        if (hardwareMatches(loadout.equippedHardware, plan.hardware) && softwareMatches(loadout.equippedSoftware, [plan.software.id])) {
            log('Loadout: best actual-Power combination already equipped; no repeated swap is possible', 'warn'); return false;
        }
        await applyPlan(loadout, plan);
        return true;
    } catch (error) {
        if (state.abortFlag) throw error;
        log('Loadout: retry stopped — ' + error.message, 'warn');
        return false;
    }
}
