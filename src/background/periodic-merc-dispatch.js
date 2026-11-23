import { getCor3Tab } from './helpers.js';
import { PERIODIC_MERC_MINUTES } from '../shared/periodic-merc-controller.js';

const ALARM = 'periodicMercDispatch';
let changes = Promise.resolve();
async function enabled() {
    const data = await chrome.storage.sync.get(['periodicMercDispatchEnabled', 'expeditionModuleEnabled', 'helperMode']);
    return data.expeditionModuleEnabled === true && data.periodicMercDispatchEnabled === true && !data.helperMode;
}
async function publishSchedule() {
    const alarm = await chrome.alarms.get(ALARM);
    await chrome.storage.local.set({ periodicMercNextCheckAt: alarm?.scheduledTime || null });
}
async function run() {
    if (!await enabled()) return;
    await publishSchedule();
    const tab = await getCor3Tab();
    try {
        if (!tab) throw new Error('No game tab is open');
        await chrome.tabs.sendMessage(tab.id, { action: 'periodicMercDispatch' });
    } catch {
        await chrome.storage.local.set({ periodicMercDispatchStatus: {
            checkedAt: Date.now(), message: '游戏标签页不可用，请打开或刷新 cor3.gg；下次检查仍按计划执行。'
        } });
    }
}
async function schedule(reset = false) {
    if (!await enabled()) {
        await chrome.alarms.clear(ALARM);
        await publishSchedule();
        return;
    }
    const existing = await chrome.alarms.get(ALARM);
    if (reset || !existing || existing.periodInMinutes !== PERIODIC_MERC_MINUTES) {
        await chrome.alarms.create(ALARM, { delayInMinutes: PERIODIC_MERC_MINUTES, periodInMinutes: PERIODIC_MERC_MINUTES });
    }
    await publishSchedule();
    if (reset) await run();
}
chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === ALARM) run().catch(console.error);
});
chrome.storage.onChanged.addListener((event, area) => {
    if (area === 'sync' && (event.periodicMercDispatchEnabled || event.expeditionModuleEnabled || event.helperMode)) {
        changes = changes.then(() => schedule(true)).catch(console.error);
    }
});
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action !== 'periodicMercReady') return;
    // Content owns duplicate suppression, including the enable/startup race.
    changes = changes.then(() => schedule()).then(run).catch(console.error);
    sendResponse({ success: true });
});
changes = changes.then(() => schedule()).catch(console.error);
