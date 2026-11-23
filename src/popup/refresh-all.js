import { _noData } from './dom-helpers.js';
import { getCor3Tab, humanDelay, waitForStorageKey } from './utils.js';
import { refreshAllTimestamps } from './timestamps.js';
import { fetchDailyOps } from './daily-ops.js';
import { loadMarket, loadDarkMarket, loadSoyuzMarket, loadUsolMarket, refreshMarket1Only, setDarkMarketEndpoint, refreshMarket2Only, refreshMarket3Only, refreshMarket4Only } from './markets.js';
import { loadLoadout } from './loadout.js';

const refreshAllBtn = document.getElementById('refreshAllBtn');
const refreshDailyBtn = document.getElementById('refreshDailyBtn');
let isRefreshing = false;

async function refreshLoadoutOnly() {
    try {
        const tab = await getCor3Tab();
        if (tab) await chrome.tabs.sendMessage(tab.id, { action: "requestLoadout" });
    } catch (e) {}
    await waitForStorageKey('loadoutData', 5000);
    await loadLoadout();
    refreshAllTimestamps();
}

refreshAllBtn.addEventListener('click', async () => {
    if (isRefreshing) return;
    isRefreshing = true;
    refreshAllBtn.classList.add('spinning');

    try {
        await executeRefreshStep('dailyOps', fetchDailyOps);
        await humanDelay();

        await executeRefreshStep('market1', refreshMarket1Only);
        await humanDelay();

        await executeRefreshStep('setDarkEndpoint', setDarkMarketEndpoint);
        await humanDelay();

        await executeRefreshStep('market2', refreshMarket2Only);
        await humanDelay();

        await executeRefreshStep('market3', refreshMarket3Only);
        await humanDelay();

        await executeRefreshStep('market4', refreshMarket4Only);
        await humanDelay();

        await executeRefreshStep('loadout', refreshLoadoutOnly);
        const expedition = await chrome.storage.sync.get(['expeditionModuleEnabled', 'helperMode']);
        if (expedition.expeditionModuleEnabled && !expedition.helperMode) {
            const tab = await getCor3Tab();
            if (tab) await chrome.tabs.sendMessage(tab.id, { action: 'expeditionRefresh', mercs: true });
        }

    } catch (e) {
        console.log('[COR3 Helper] Refresh All error:', e);
        cor3LogError('popup.js', e, { action: 'refreshAll' });
    }

    refreshAllBtn.classList.remove('spinning');
    isRefreshing = false;
    refreshAllTimestamps();
});

async function executeRefreshStep(name, operation) {
    try {
        console.log(`[COR3 Helper] Refresh All: Starting ${name}`);
        await operation();
        console.log(`[COR3 Helper] Refresh All: Completed ${name}`);
    } catch (error) {
        console.log(`[COR3 Helper] Refresh All: Failed ${name}:`, error);
        cor3LogError('popup.js', error, { action: 'refreshStep-' + name });
    }
}
