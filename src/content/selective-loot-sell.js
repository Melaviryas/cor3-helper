import { SelectiveLootController } from '../shared/selective-loot-controller.js';
import { canSelectivelySell } from '../shared/selective-loot-policy.js';
import { mercLog } from '../shared/merc-log.js';
import { isContextValid, _automationEnqueue, _automationFinish, _broadcastQueueStatus,
    getAutomationQueue, setAutomationQueue } from './helpers.js';

const TYPE = 'selective-loot-sell';
let scheduleTimer = null;
let queued = false;
let retryNotBefore = 0;
let settingsRevision = 0;

function schedule(delay = 1000) {
    clearTimeout(scheduleTimer);
    if (!controller.enabled || !isContextValid()) return;
    scheduleTimer = setTimeout(queueCheck, Math.max(delay, retryNotBefore - Date.now()));
}

const controller = new SelectiveLootController({
    send: command => { if (isContextValid()) window.postMessage(command, '*'); },
    log: message => mercLog('[COR3 Helper] ' + message),
    onStatus: status => {
        if (isContextValid()) chrome.storage.local.set({ selectiveLootSellStatus: { ...status, updatedAt: Date.now() } });
    },
    onFinish: () => {
        if (controller.status.phase === 'error') retryNotBefore = Date.now() + 60000;
        _automationFinish(TYPE);
        schedule(60000);
    }
});

function queueCheck() {
    scheduleTimer = null;
    if (!controller.enabled || controller.running || queued || !isContextValid()) return;
    if (Date.now() < retryNotBefore) { schedule(retryNotBefore - Date.now()); return; }
    queued = true;
    const result = _automationEnqueue(TYPE, () => {
        queued = false;
        if (!controller.enabled || !controller.start()) _automationFinish(TYPE);
    });
    if (result === 'queued') controller.report('waiting', 'Selective sell queued behind the current automation. Drone materials remain protected.');
}

async function updateSettings() {
    const revision = ++settingsRevision;
    if (!isContextValid()) return;
    try {
        const data = await chrome.storage.sync.get(['selectiveLootSellEnabled', 'helperMode']);
        if (revision !== settingsRevision || !isContextValid()) return;
        const enabled = data.selectiveLootSellEnabled === true && !data.helperMode;
        window.postMessage({ type: 'COR3_SELECTIVE_CONFIG', enabled }, '*');
        if (!enabled) {
            clearTimeout(scheduleTimer);
            queued = false;
            setAutomationQueue(getAutomationQueue().filter(task => task.type !== TYPE));
            _broadcastQueueStatus();
        }
        controller.setEnabled(enabled);
        if (enabled) schedule(500);
    } catch { /* Extension was reloaded. */ }
}

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && (changes.selectiveLootSellEnabled || changes.helperMode)) updateSettings();
});
window.addEventListener('message', event => {
    if (event.source !== window || !isContextValid()) return;
    const data = event.data;
    if (data?.type === 'COR3_SELECTIVE_STASH_RESPONSE') {
        const wasRunning = controller.running;
        controller.receive(data);
        if (!wasRunning && !data.error && Array.isArray(data.data?.items)
            && data.data.items.some(canSelectivelySell)) schedule(1000);
    }
    if (data?.type === 'COR3_INITIAL_FETCH_DONE'
        || (data?.type === 'COR3_EXPEDITION_MAIL_RESPONSE' && data.action === 'claim.all' && !data.error)) schedule(1500);
});
setInterval(() => schedule(0), 60000);
updateSettings();
