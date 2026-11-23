import { renderDebugJobs, renderDebugLogs } from './auto-job-solver-ui.js';
import { loadPinnedState } from './pinned-timers.js';
import { updateAutoUpdateMarketsStatus } from './ui-toggles.js';
import { state } from './state.js';

const automationKeys = ['autoRefresh', 'autoJobSolverEnabled', 'autoFinishAllJobsEnabled',
    'autoJobsDebugConsoleEnabled', 'autoUpdateMarkets'];
const helperModeToggle = document.getElementById('helperModeToggle');
export async function applyHelperMode(helper, mode) {
    state.isHelper = !!helper;
    if (mode === 'update') {
        if (state.isHelper) {
            const oldValues = await chrome.storage.sync.get(automationKeys);
            await chrome.storage.sync.set({ oldValues });
            await chrome.storage.sync.set(Object.fromEntries(automationKeys.map(key => [key,
                key === 'autoRefresh' ? { dark_jobs: false, home_jobs: false, soyuz_jobs: false, usol_jobs: false } : false])));
        } else {
            const { oldValues = {} } = await chrome.storage.sync.get('oldValues');
            await chrome.storage.sync.set(Object.fromEntries(automationKeys.map(key => [key,
                oldValues[key] ?? (key === 'autoRefresh' ? {} : false)])));
        }
        const toggles = await chrome.storage.sync.get(automationKeys);
        for (const [id, key] of [['autoRefreshCore', 'home_jobs'], ['autoRefreshDark', 'dark_jobs'],
            ['autoRefreshSoyuz', 'soyuz_jobs'], ['autoRefreshUsol', 'usol_jobs']]) {
            document.getElementById(id).checked = !!toggles.autoRefresh?.[key];
        }
        for (const [id, key] of [['autoJobSolverToggle', 'autoJobSolverEnabled'],
            ['autoUpdateMarketsToggle', 'autoUpdateMarkets'], ['autoFinishAllJobsToggle', 'autoFinishAllJobsEnabled'],
            ['autoJobsDebugToggle', 'autoJobsDebugConsoleEnabled']]) document.getElementById(id).checked = !!toggles[key];
        document.getElementById('autoJobSolverSection').style.display = toggles.autoJobSolverEnabled ? '' : 'none';
        document.getElementById('autoJobsDebugConsole').style.display = toggles.autoJobsDebugConsoleEnabled ? '' : 'none';
        document.getElementById('autoJobSolverStatus').textContent = toggles.autoJobSolverEnabled ? 'Active' : 'Off';
        document.getElementById('autoJobSolverStatus').style.color = toggles.autoJobSolverEnabled ? 'var(--accent-green)' : 'var(--text-dim)';
        if (toggles.autoJobsDebugConsoleEnabled) { renderDebugJobs(); renderDebugLogs(); }
        loadPinnedState();
        updateAutoUpdateMarketsStatus();
        chrome.runtime.sendMessage({ action: 'scheduleAutoFinishAll' }).catch(() => {});
    }
    document.querySelectorAll('.pinned-auto-refresh').forEach(el => { el.style.display = state.isHelper ? 'none' : 'flex'; });
    for (const id of ['autoJobSolverToggle', 'autoValuableSellerToggle', 'autoUpdateMarketsToggle']) {
        document.getElementById(id).closest('.auto-decrypt-row').style.display = state.isHelper ? 'none' : 'flex';
    }
}
if (helperModeToggle) {
    chrome.storage.sync.get('helperMode', data => {
        helperModeToggle.checked = !!data.helperMode;
        applyHelperMode(helperModeToggle.checked, 'render');
    });
    helperModeToggle.addEventListener('change', () => {
        chrome.storage.sync.set({ helperMode: helperModeToggle.checked });
        applyHelperMode(helperModeToggle.checked, 'update');
    });
}
