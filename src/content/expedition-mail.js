import { ExpeditionMailController } from '../shared/expedition-mail-controller.js';
import { mercLog } from '../shared/merc-log.js';
import { isContextValid } from './helpers.js';

const controller = new ExpeditionMailController({
    send: command => { if (isContextValid()) window.postMessage(command, '*'); },
    log: message => mercLog('[COR3 Helper] ' + message),
    onStatus: status => {
        if (isContextValid()) chrome.storage.local.set({ expeditionMailStatus: { ...status, updatedAt: Date.now() } });
    }
});

async function updateSettings() {
    if (!isContextValid()) return;
    try {
        const settings = await chrome.storage.sync.get(['autoClaimExpeditionMail', 'helperMode']);
        controller.setEnabled(!!settings.autoClaimExpeditionMail && !settings.helperMode);
    } catch { /* Extension was reloaded. */ }
}

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && (changes.autoClaimExpeditionMail || changes.helperMode)) updateSettings();
});
window.addEventListener('message', event => {
    if (event.source !== window || !isContextValid()) return;
    const data = event.data;
    if (data?.type === 'COR3_EXPEDITION_MAIL_RESPONSE') controller.receive(data);
    if (data?.type === 'COR3_MAIL_OFFLINE') controller.offline();
    if (['COR3_WS_COLLECTED_ALL', 'COR3_WS_EXPEDITION_ARCHIVED', 'COR3_INITIAL_FETCH_DONE'].includes(data?.type)) {
        controller.refreshSoon();
    }
});
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action !== 'checkExpeditionMail') return;
    const status = controller.request();
    sendResponse({ enabled: controller.enabled, status });
});
setInterval(() => { if (isContextValid()) controller.request(); }, 60000);
mercLog('[COR3 Helper] Mercenaries debug logging ready. Recent 200 entries are retained. Mail timer fix 1 active.');
updateSettings();
