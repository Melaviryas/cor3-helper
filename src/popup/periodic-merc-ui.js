import { state } from './state.js';

const toggle = document.getElementById('periodicMercDispatchToggle');
const status = document.getElementById('periodicMercDispatchStatus');
const schedule = document.getElementById('periodicMercDispatchSchedule');
let current = null, next = null;
function render() {
    status.textContent = toggle.checked ? current?.message || 'Checking available mercenaries…'
        : 'Off. Enable for an immediate check, then every 30 minutes.';
    if (!toggle.checked || !next) { schedule.textContent = ''; return; }
    const minutes = Math.max(0, Math.ceil((next - Date.now()) / 60000));
    schedule.textContent = 'Next check: ' + new Date(next).toLocaleTimeString()
        + (minutes ? ' (in ' + minutes + ' min)' : ' (due; Chrome may delay while asleep)');
}
chrome.storage.sync.get('periodicMercDispatchEnabled', data => {
    toggle.checked = data.periodicMercDispatchEnabled === true; render();
});
chrome.storage.local.get(['periodicMercDispatchStatus', 'periodicMercNextCheckAt'], data => {
    current = data.periodicMercDispatchStatus; next = data.periodicMercNextCheckAt; render();
});
toggle.addEventListener('change', () => {
    if (state.isHelper) toggle.checked = false;
    current = null;
    chrome.storage.sync.set({ periodicMercDispatchEnabled: toggle.checked }); render();
});
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.periodicMercDispatchEnabled) toggle.checked = changes.periodicMercDispatchEnabled.newValue === true;
    if (area === 'local' && changes.periodicMercDispatchStatus) current = changes.periodicMercDispatchStatus.newValue;
    if (area === 'local' && changes.periodicMercNextCheckAt) next = changes.periodicMercNextCheckAt.newValue;
    render();
});
setInterval(render, 1000);
