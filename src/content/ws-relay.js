import { mercLog } from '../shared/merc-log.js';
// WS message relay from content-early.js (MAIN world) → chrome.storage
// This is the first window message listener in content.js

import { isContextValid, _automationFinish, _broadcastQueueStatus, getAutomationActive, setAutomationActive } from './helpers.js';
import { setMarketRefreshInProgress, setAutoUpdateMarketsLastRefresh, setSeqRefreshRunning } from './auto-update-markets.js';

function fetchDailyRewards(token) {
    fetch('https://svc-corie.cor3.gg/api/user-daily-claim/rewards', {
        headers: { 'Authorization': token }
    })
    .then(r => r.ok ? r.json() : null)
    .then(data => {
        if (data && Array.isArray(data)) {
            chrome.storage.local.set({ dailyRewardsData: data });
        }
    })
    .catch(() => {});
}

export function setupWsRelay() {
    window.addEventListener('message', (event) => {
        if (event.source !== window) return;
        if (!isContextValid()) return;
        const now = Date.now();

        // WS message logging
        if (event.data && event.data.type === 'COR3_WS_LOG') {
            cor3LogWsMessage(event.data.direction, event.data.message);
        }

        if (event.data && event.data.type === 'COR3_WS_EXPEDITIONS') {
            chrome.storage.local.set({ expeditionsData: event.data.expeditions, expeditionsDataUpdatedAt: now });
            var exps = event.data.expeditions || [];
            var hasActive = exps.some(function (e) { return e.status === 'IN_PROGRESS'; });
            if (!hasActive) {
                chrome.storage.local.get('expeditionLaunchError', function (result) {
                    if (result.expeditionLaunchError && !result.expeditionLaunchError.noRetry) {
                        console.log('[COR3 Helper] No active expeditions — clearing expedition launch error');
                        chrome.storage.local.remove('expeditionLaunchError');
                    }
                });
            }
        }
        if (event.data && event.data.type === 'COR3_WS_DECISIONS') {
            chrome.storage.local.set({ expeditionDecisions: event.data.decisions });
        }
        if (event.data && event.data.type === 'COR3_WS_SPECIALISTS') {
            chrome.storage.local.set({ specialistsData: event.data.data, specialistsDataUpdatedAt: now });
        }
        if (event.data && event.data.type === 'COR3_WS_STASH') {
            chrome.storage.local.set({ stashData: event.data.stash, stashDataUpdatedAt: now });

        }
        if (event.data && event.data.type === 'COR3_WS_MARKET') {
            chrome.storage.local.set({ marketData: event.data.market, marketDataUpdatedAt: now });
        }
        if (event.data && event.data.type === 'COR3_WS_DARK_MARKET') {
            chrome.storage.local.set({ darkMarketData: event.data.market, darkMarketAvailable: true, darkMarketDataUpdatedAt: now });
        }
        if (event.data && event.data.type === 'COR3_WS_SOYUZ_MARKET') {
            chrome.storage.local.set({ soyuzMarketData: event.data.market, soyuzMarketAvailable: true, soyuzMarketDataUpdatedAt: now });
        }
        if (event.data && event.data.type === 'COR3_WS_USOL_MARKET') {
            chrome.storage.local.set({ usolMarketData: event.data.market, usolMarketAvailable: true, usolMarketDataUpdatedAt: now });
        }
        if (event.data && event.data.type === 'COR3_WS_LOADOUT') {
            chrome.storage.local.set({ loadoutData: event.data.loadout, loadoutAction: event.data.action, loadoutUpdatedAt: now, loadoutError: null });
        }
        if (event.data && event.data.type === 'COR3_WS_LOADOUT_ERROR') {
            chrome.storage.local.set({ loadoutError: event.data.error, loadoutErrorAction: event.data.action, loadoutUpdatedAt: now });
        }
        if (event.data && event.data.type === 'COR3_WS_DARK_MARKET_UNREACHABLE') {
            chrome.storage.local.set({ darkMarketAvailable: false, darkMarketDataUpdatedAt: now, darkMarketMaintenanceEndsAt: event.data.maintenanceEndsAt || null, darkMarketBlockerServer: event.data.blockerServerName || null });
        }
        if (event.data && event.data.type === 'COR3_WS_SOYUZ_MARKET_UNREACHABLE') {
            chrome.storage.local.set({ soyuzMarketAvailable: false, soyuzMarketDataUpdatedAt: now, soyuzMarketMaintenanceEndsAt: event.data.maintenanceEndsAt || null, soyuzMarketBlockerServer: event.data.blockerServerName || null });
        }
        if (event.data && event.data.type === 'COR3_WS_USOL_MARKET_UNREACHABLE') {
            chrome.storage.local.set({ usolMarketAvailable: false, usolMarketDataUpdatedAt: now, usolMarketMaintenanceEndsAt: event.data.maintenanceEndsAt || null, usolMarketBlockerServer: event.data.blockerServerName || null });
        }
        if (event.data && event.data.type === 'COR3_BEARER_TOKEN') {
            chrome.storage.local.get('bearerToken', (prev) => {
                const isNew = !prev.bearerToken || prev.bearerToken !== event.data.token;
                chrome.storage.local.set({ bearerToken: event.data.token });
                if (isNew) {
                    fetch('https://svc-corie.cor3.gg/api/user-daily-claim', {
                        headers: { 'Authorization': event.data.token }
                    })
                    .then(r => r.ok ? r.json() : null)
                    .then(data => { if (data) chrome.storage.local.set({ dailyOpsData: data, dailyOpsUpdatedAt: Date.now(), dailyOpsError: null }); })
                    .catch(() => {});
                }
            });
        }
        if (event.data && event.data.type === 'COR3_WEB_VERSION') {
            chrome.storage.local.set({ webVersion: event.data.version });
        }
        if (event.data && event.data.type === 'COR3_SYSTEM_VERSION') {
            chrome.storage.local.set({ systemVersion: event.data.version });
        }
        if (event.data && event.data.type === 'COR3_PATCH_VERSION') {
            chrome.storage.local.set({ patchVersion: event.data.version });
        }
        if (event.data && event.data.type === 'COR3_DAILY_REWARDS') {
            chrome.storage.local.set({ dailyRewardsData: event.data.rewards });
        }
        if (event.data && event.data.type === 'COR3_WS_ARCHIVED_EXPEDITIONS') {
            chrome.storage.local.set({ archivedExpeditionsData: event.data.data, archivedExpeditionsUpdatedAt: now });
        }
        if (event.data && event.data.type === 'COR3_WS_MERCENARIES') {
            chrome.storage.local.set({ mercenariesData: event.data.data, mercenariesUpdatedAt: now });
        }
        if (event.data && event.data.type === 'COR3_CORE_MERCS_DONE') {
            chrome.storage.local.set({ coreMercsDone: Date.now() });
        }
        if (event.data && event.data.type === 'COR3_USOL_MERCS_DONE') {
            chrome.storage.local.set({ usolMercsDone: Date.now() });
        }
        if (event.data && event.data.type === 'COR3_WS_USOL_MERCENARIES') {
            chrome.storage.local.set({ usolMercenariesData: event.data.data, usolMercenariesUpdatedAt: now });
        }
        if (event.data && event.data.type === 'COR3_WS_MERC_CONFIGURE' && event.data.mercenaryId) {
            chrome.storage.local.get('mercConfigData', (result) => {
                const configs = result.mercConfigData || {};
                configs[event.data.mercenaryId] = event.data.data;
                chrome.storage.local.set({ mercConfigData: configs, mercConfigUpdatedAt: now });
            });
        }
        if (event.data && event.data.type === 'COR3_WS_EXPEDITION_ARCHIVED') {
            const archivedId = event.data.data && (event.data.data.expeditionId || event.data.data.id);
            if (archivedId) {
                chrome.storage.local.get('expeditionsData', (result) => {
                    const exps = result.expeditionsData || [];
                    const filtered = exps.filter(e => e.id !== archivedId);
                    chrome.storage.local.set({ expeditionsData: filtered, expeditionsDataUpdatedAt: now });
                });
            }
        }
        if (event.data && event.data.type === 'COR3_WS_EXPEDITION_CONFIG') {
            chrome.storage.local.set({ expeditionConfigData: event.data.data });
        }
        if (event.data && event.data.type === 'COR3_WS_USOL_EXPEDITION_CONFIG') {
            chrome.storage.local.set({ usolExpeditionConfigData: event.data.data });
        }
        // Daily hack log relay
        if (event.data && event.data.type === 'COR3_DAILY_HACK_LOG') {
            chrome.storage.local.set({
                dailyHackLog: event.data.message,
                dailyHackLogUpdatedAt: Date.now()
            });
        }
        // Auto-disable daily hack toggle
        if (event.data && event.data.type === 'COR3_DAILY_HACK_DISABLE_TOGGLE') {
            chrome.storage.sync.set({ autoDailyHackEnabled: false });
        }
        // Auto-fetch daily ops on page load
        if (event.data && event.data.type === 'COR3_FETCH_DAILY_OPS') {
            console.log('[COR3 Helper] Requesting daily ops data');
            chrome.storage.local.get('bearerToken', (result) => {
                const token = result.bearerToken;
                if (!token) return;
                fetch('https://svc-corie.cor3.gg/api/user-daily-claim', {
                    headers: { 'Authorization': token }
                })
                .then(r => {
                    if (r.ok) return r.json();
                    if (r.status === 400 || r.status === 401 || r.status === 403) {
                        chrome.storage.local.set({ dailyOpsError: 'token_expired', dailyOpsErrorUpdatedAt: Date.now() });
                        return null;
                    }
                    return null;
                })
                .then(data => {
                    if (data) {
                        chrome.storage.local.set({ dailyOpsData: data, dailyOpsUpdatedAt: Date.now(), dailyOpsError: null });
                        fetchDailyRewards(token);
                    }
                })
                .catch(() => {});
            });
        }
    });
}
