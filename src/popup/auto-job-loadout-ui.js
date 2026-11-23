import { normalizeLoadoutMode } from '../shared/loadout-optimizer.js';
const select = document.getElementById('autoJobLoadoutMode');
const hint = document.getElementById('autoJobLoadoutModeHint');
function render(value) {
    select.value = normalizeLoadoutMode(value);
    hint.textContent = select.value === 'software'
        ? 'Compare owned tools by actual Power on your current hardware. Hardware stays unchanged. Changes apply from the next job.'
        : 'Compare owned software + hardware by actual HACK/DECRYPT Power. Equal Power favors fewer swaps. Changes apply from the next job.';
}
chrome.storage.sync.get('autoJobLoadoutMode', data => render(data.autoJobLoadoutMode));
select.addEventListener('change', () => {
    chrome.storage.sync.set({ autoJobLoadoutMode: normalizeLoadoutMode(select.value) });
    render(select.value);
});
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.autoJobLoadoutMode) render(changes.autoJobLoadoutMode.newValue);
});
