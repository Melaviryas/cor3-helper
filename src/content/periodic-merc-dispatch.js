import { PeriodicMercController, PERIODIC_MERC_TYPE as TYPE } from '../shared/periodic-merc-controller.js';
import { mercLog } from '../shared/merc-log.js';
import { isContextValid, _automationEnqueue, _automationFinish, getAutomationActive,
    getAutomationQueue, setAutomationQueue, _broadcastQueueStatus } from './helpers.js';
import { autoSendInProgress, _initialFetchDone, setAutoSendExpeditionBlocked,
    setAutoSendInProgress, setAutoSendAwaitingMercenaries, setAutoSendAwaitingUsolMercs,
    setAutoSendExpeditionId, setAutoSendNeedsFreshState } from './auto-send.js';

const keys = ['periodicMercDispatchEnabled', 'helperMode', 'autoSendMerc'];
let settings = {}, queued = false, starting = false, lastStart = 0;
const controller = new PeriodicMercController({
    send: command => {
        if (command.type === 'COR3_LAUNCH_EXPEDITION') {
            setAutoSendNeedsFreshState(true);
            chrome.storage.local.set({ lastExpeditionLaunchData: command.config });
        }
        window.postMessage(command, '*');
    },
    onStatus: status => {
        if (!isContextValid()) return;
        chrome.storage.local.set({ periodicMercDispatchStatus: status });
        mercLog('[COR3 Helper] 30-min dispatch: ' + status.message);
    },
    onDone: async ({ expedition }) => {
        // Keep queue ownership until fresh launch data is stored, so the old auto-send
        // cannot restart from its formerly empty expedition cache.
        try {
            if (expedition) {
                setAutoSendExpeditionBlocked(true);
                await chrome.storage.local.set({ autoSendExpeditionBlocked: true,
                    expeditionsData: [expedition], expeditionsDataUpdatedAt: Date.now() });
            }
        } finally { _automationFinish(TYPE); }
    }
});

async function updateSettings() {
    try {
        settings = await chrome.storage.sync.get(keys);
        controller.setSettings(settings);
        if (!settings.periodicMercDispatchEnabled || settings.helperMode) {
            queued = false;
            setAutomationQueue(getAutomationQueue().filter(task => task.type !== TYPE));
            _broadcastQueueStatus();
        }
    } catch { /* Extension context was reloaded. */ }
}

async function check() {
    if (starting || queued || controller.running || !isContextValid()) return;
    starting = true;
    try {
        await updateSettings();
        if (!settings.periodicMercDispatchEnabled || settings.helperMode || Date.now() - lastStart < 60000) return;
        if (!_initialFetchDone) { controller.status('Waiting for initial game data.'); return; }
        const active = getAutomationActive();
        if (autoSendInProgress || active?.type === 'auto-send') {
            if (active?.type !== 'auto-send' || Date.now() - active.startedAt > 5 * 60000) {
                // Old event-driven runs have no overall watchdog. Recover a stale owner,
                // then query the server before considering any new launch.
                setAutoSendInProgress(false);
                setAutoSendAwaitingMercenaries(false);
                setAutoSendAwaitingUsolMercs(false);
                setAutoSendExpeditionId(null);
                setAutomationQueue(getAutomationQueue().filter(task => task.type !== 'auto-send'));
                window.postMessage({ type: 'COR3_PERIODIC_CANCEL_MERC_FETCH' }, '*');
                _automationFinish('auto-send');
                mercLog('[COR3 Helper] 30-min dispatch: recovered an auto-send stalled for over 5 minutes.');
            } else {
                controller.status('Existing auto-send is running; skipping this duplicate check.'); return;
            }
        }
        queued = true;
        controller.status('Check queued; waiting for the current automation.');
        _automationEnqueue(TYPE, async () => {
            queued = false;
            await updateSettings();
            if (!settings.periodicMercDispatchEnabled || settings.helperMode) { _automationFinish(TYPE); return; }
            lastStart = Date.now();
            controller.start();
        });
    } finally { starting = false; }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action !== 'periodicMercDispatch') return;
    check().catch(error => controller.status('Check failed: ' + error.message));
    sendResponse({ success: true });
});
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.periodicMercDispatchEnabled?.newValue === true) lastStart = 0;
    if (area === 'sync' && keys.some(key => changes[key])) updateSettings();
});
window.addEventListener('message', event => {
    if (event.source !== window || !isContextValid()) return;
    // Legacy retry handlers must see queue ownership before a failed periodic run releases it.
    // Defer this consumer to the next task; the WS relay runs synchronously first.
    const message = event.data;
    if (controller.running) setTimeout(() => controller.receive(message), 0);
    if (message?.type === 'COR3_INITIAL_FETCH_DONE') announceReady();
});
function announceReady() {
    if (!isContextValid()) return;
    chrome.runtime.sendMessage({ action: 'periodicMercReady' }).catch(() => {});
}
setTimeout(announceReady, 5000);
updateSettings();
