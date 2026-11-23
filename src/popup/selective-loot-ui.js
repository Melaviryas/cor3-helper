import { DRONE_MATERIALS } from '../shared/selective-loot-policy.js';
import { state } from './state.js';

const toggle = document.getElementById('selectiveLootSellToggle');
const status = document.getElementById('selectiveLootSellStatus');
const list = document.getElementById('droneMaterialsKeepList');
let runtimeStatus = null;

for (const item of DRONE_MATERIALS) {
    const row = document.createElement('li');
    row.textContent = item.name;
    list.appendChild(row);
}

function renderStatus() {
    status.textContent = toggle.checked
        ? runtimeStatus?.message || 'Checking existing Stash loot; all 22 drone-material types are kept.'
        : 'Off. Enable to sell eligible non-drone loot already in Stash and from future expeditions.';
}
chrome.storage.sync.get('selectiveLootSellEnabled', data => {
    toggle.checked = data.selectiveLootSellEnabled === true;
    renderStatus();
});
chrome.storage.local.get('selectiveLootSellStatus', data => {
    runtimeStatus = data.selectiveLootSellStatus || null;
    renderStatus();
});
toggle.addEventListener('change', () => {
    if (state.isHelper) { toggle.checked = false; renderStatus(); return; }
    runtimeStatus = null;
    chrome.storage.sync.set({ selectiveLootSellEnabled: toggle.checked });
    renderStatus();
});
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.selectiveLootSellEnabled) {
        toggle.checked = changes.selectiveLootSellEnabled.newValue === true;
        renderStatus();
    }
    if (area === 'local' && changes.selectiveLootSellStatus) {
        runtimeStatus = changes.selectiveLootSellStatus.newValue || null;
        renderStatus();
    }
});
