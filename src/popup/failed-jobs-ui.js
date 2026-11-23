import { getCor3Tab } from './utils.js';
const button = document.getElementById('dismissAllFailedJobsBtn');
const refresh = document.getElementById('refreshAutoJobsBtn');
const line = document.getElementById('failedJobsCleanupStatus');
function render(value) {
    button.disabled = !!value?.busy;
    refresh.disabled = !!value?.busy;
    button.textContent = value?.busy ? '⏳ All Failed' : '🧹 All Failed';
    line.textContent = value?.message || '';
    line.style.display = value?.message ? '' : 'none';
}
chrome.storage.local.get('failedJobsCleanupStatus', data => render(data.failedJobsCleanupStatus));
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.failedJobsCleanupStatus) render(changes.failedJobsCleanupStatus.newValue);
});
button.addEventListener('click', async () => {
    render({ busy: true, message: 'Requesting market refresh and failed-job cleanup…' });
    try {
        const tab = await getCor3Tab();
        if (!tab) throw new Error('Open cor3.gg first');
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'dismissAllFailedJobs' });
        if (!response?.success) throw new Error('Game tab unavailable; refresh it and try again');
    } catch (error) { render({ message: error.message }); }
});
