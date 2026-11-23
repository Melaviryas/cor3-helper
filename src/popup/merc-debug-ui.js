import { getCor3Tab } from './utils.js';
import { state } from './state.js';

const toggle = document.getElementById('mercDebugToggle');
const panel = document.getElementById('mercDebugConsole');
const body = document.getElementById('mercDebugLogsBody');
const copy = document.getElementById('copyMercLogsBtn');
const claimToggle = document.getElementById('autoClaimExpeditionMailToggle');
const check = document.getElementById('checkExpeditionMailBtn');
const status = document.getElementById('expeditionMailStatus');
let logs = [];
let runtimeMailStatus = null;

function renderLogs() {
    const follow = body.scrollHeight - body.scrollTop - body.clientHeight < 30;
    const fragment = document.createDocumentFragment();
    if (!logs.length) {
        const empty = document.createElement('div');
        empty.className = 'no-decisions';
        empty.textContent = 'Waiting for game activity. Refresh the game after updating the extension.';
        fragment.appendChild(empty);
    }
    for (const log of logs) {
        const row = document.createElement('div');
        row.className = 'debug-log-row' + (['warn', 'error', 'success'].includes(log.level) ? ' log-' + log.level : '');
        const time = document.createElement('span');
        time.className = 'log-time';
        const date = new Date(log.timestamp);
        time.textContent = '[' + (Number.isFinite(date.getTime()) ? date.toLocaleTimeString([], { hour12: false }) : '--:--:--') + ']';
        time.title = log.timestamp || '';
        row.append(time, document.createTextNode(' ' + log.msg));
        fragment.appendChild(row);
    }
    body.replaceChildren(fragment);
    if (follow) body.scrollTop = body.scrollHeight;
}

function showDebug(enabled) {
    toggle.checked = enabled;
    panel.style.display = enabled ? '' : 'none';
    if (enabled) { renderLogs(); body.scrollTop = body.scrollHeight; }
}
function showClaim(enabled) {
    claimToggle.checked = enabled;
    check.disabled = !enabled;
    renderMailStatus();
}

function renderMailStatus() {
    status.textContent = claimToggle.checked
        ? runtimeMailStatus?.message || 'Checks every 60s while the game is open. Expedition reward mail only.'
        : 'Auto-claim is off.';
}

chrome.storage.sync.get(['mercDebugConsoleEnabled', 'autoClaimExpeditionMail'], data => {
    showDebug(data.mercDebugConsoleEnabled !== false);
    showClaim(!!data.autoClaimExpeditionMail);
});
chrome.storage.local.get(['mercDebugLogs', 'expeditionMailStatus'], data => {
    logs = Array.isArray(data.mercDebugLogs) ? data.mercDebugLogs : [];
    renderLogs();
    runtimeMailStatus = data.expeditionMailStatus || null;
    renderMailStatus();
});
toggle.addEventListener('change', () => {
    chrome.storage.sync.set({ mercDebugConsoleEnabled: toggle.checked });
    showDebug(toggle.checked);
});
claimToggle.addEventListener('change', () => {
    if (state.isHelper) { showClaim(false); return; }
    chrome.storage.sync.set({ autoClaimExpeditionMail: claimToggle.checked });
    runtimeMailStatus = null;
    showClaim(claimToggle.checked);
});
check.addEventListener('click', async () => {
    try {
        const tab = await getCor3Tab();
        if (!tab) throw new Error('Open the game first.');
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'checkExpeditionMail' });
        runtimeMailStatus = response?.status || null;
        status.textContent = response?.enabled
            ? runtimeMailStatus?.message || 'Game script is outdated. Update content.js and refresh the game.'
            : 'Enable auto-claim first.';
    } catch {
        status.textContent = 'Cannot reach the game. Open or refresh the cor3.gg tab.';
    }
});
copy.addEventListener('click', async () => {
    try {
        await navigator.clipboard.writeText(logs.map(log => '[' + log.timestamp + '] [' + log.level + '] ' + log.msg).join('\n'));
        copy.textContent = 'Copied';
    } catch { copy.textContent = 'Copy failed'; }
    setTimeout(() => { copy.textContent = '📋 Copy'; }, 2000);
});
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.mercDebugLogs) {
        logs = Array.isArray(changes.mercDebugLogs.newValue) ? changes.mercDebugLogs.newValue : [];
        renderLogs();
    }
    if (area === 'local' && changes.expeditionMailStatus) {
        runtimeMailStatus = changes.expeditionMailStatus.newValue || null;
        renderMailStatus();
    }
    if (area === 'sync' && changes.mercDebugConsoleEnabled) showDebug(changes.mercDebugConsoleEnabled.newValue !== false);
    if (area === 'sync' && changes.autoClaimExpeditionMail) showClaim(!!changes.autoClaimExpeditionMail.newValue);
});
