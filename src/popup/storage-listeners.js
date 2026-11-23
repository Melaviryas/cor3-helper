import { loadCachedDailyOps } from './daily-ops.js';
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.dailyOpsData) loadCachedDailyOps();
});
