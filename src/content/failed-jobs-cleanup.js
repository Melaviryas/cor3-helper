import { isContextValid, _automationEnqueue, _automationFinish } from './helpers.js';
import { JOB_MARKETS, findFailedJobs, verifyDismissals } from '../shared/failed-jobs-policy.js';

const TYPE = 'dismiss-all-failed-jobs';
const names = { home: 'CORE', dark: 'BMI-ZEN', soyuz: 'SOYUZ', usol: 'USOL' };
function log(msg, level = 'info') {
    window.postMessage({ type: 'COR3_AUTOJOB_LOG', msg, level }, '*');
}
function status(phase, message, busy = true) {
    chrome.storage.local.set({ failedJobsCleanupStatus: { phase, message, busy, updatedAt: Date.now() } });
    log('🧹 ' + message, phase === 'error' ? 'error' : 'info');
}
async function checkAllowed() {
    if (!isContextValid()) throw new Error('Extension was reloaded');
    const data = await chrome.storage.sync.get('helperMode');
    if (data.helperMode) throw new Error('Cleanup paused by Helper-Only mode');
}
function waitForReply(test, ms, trigger) {
    return new Promise((resolve, reject) => {
        const clean = () => { clearTimeout(timer); window.removeEventListener('message', listener); };
        const listener = event => {
            if (event.source !== window) return;
            if (event.data?.type === 'COR3_TOKEN_EXPIRED') { clean(); reject(new Error('Game session expired')); return; }
            if (test(event.data)) { clean(); resolve(event.data); }
        };
        const timer = setTimeout(() => { clean(); reject(new Error('Server response timed out')); }, ms);
        window.addEventListener('message', listener);
        try { trigger(); } catch (error) { clean(); reject(error); }
    });
}
async function refreshMarkets(phase) {
    await checkAllowed();
    const snapshots = {};
    status(phase, phase === 'refreshing' ? 'Refreshing all four markets before checking failed jobs…'
        : 'Refreshing all four markets again to verify dismissals…');
    function onSnapshot(event) {
        const packet = event.data;
        if (event.source !== window || packet?.type !== 'COR3_MARKET_JOBS_SNAPSHOT'
            || !JOB_MARKETS.includes(packet.marketKey) || !Array.isArray(packet.data?.recentJobs)) return;
        snapshots[packet.marketKey] = packet.data;
        status(phase, (phase === 'refreshing' ? 'Refreshing' : 'Verifying') + ' markets: '
            + Object.keys(snapshots).length + '/4 received.');
    }
    window.addEventListener('message', onSnapshot);
    try {
        await waitForReply(packet => packet?.type === 'COR3_ALL_MARKETS_REFRESHED', 300000, () => {
            window.postMessage({ type: 'COR3_REFRESH_ALL_MARKETS_SEQ', skipLots: true }, '*');
        });
    } finally { window.removeEventListener('message', onSnapshot); }
    const missing = JOB_MARKETS.filter(key => !snapshots[key]);
    if (missing.length) log('🧹 No fresh job data from ' + missing.map(key => names[key]).join(', ') + '; those markets are skipped.', 'warn');
    return snapshots;
}
async function runCleanup() {
    try {
        const before = await refreshMarkets('refreshing');
        await checkAllowed();
        const { jobs, ambiguous } = findFailedJobs(before);
        if (ambiguous.length) log('🧹 Skipped ' + ambiguous.length + ' failed job(s) with unconfirmed market ownership.', 'warn');
        if (!jobs.length) {
            const partial = Object.keys(before).length !== 4;
            status('done', partial ? 'No FAILED jobs found in refreshed markets; some markets could not be checked.'
                : 'All markets refreshed. No FAILED jobs to dismiss.', false);
            return;
        }
        const attempted = [];
        for (const job of jobs) {
            await checkAllowed();
            status('dismissing', 'Dismissing failed jobs: ' + (attempted.length + 1) + '/' + jobs.length
                + ' (' + names[job.marketKey] + ')…');
            attempted.push(job);
            try {
                const response = await waitForReply(packet => packet?.type === 'COR3_JOB_DISMISS_RESULT'
                    && (!packet.data?.jobId || packet.data.jobId === job.jobId)
                    && (!packet.data?.id || packet.data.id === job.jobId), 12000, () => {
                    window.postMessage({ type: 'COR3_AUTOJOB_CMD', cmd: 'job.dismiss',
                        data: { marketId: job.marketId, jobId: job.jobId } }, '*');
                });
                if (response.error) log('🧹 Server rejected dismissal: ' + (response.error.message || 'Unknown error'), 'warn');
            } catch (error) {
                log('🧹 Dismissal outcome unknown: ' + error.message + '; verifying before any further requests.', 'warn');
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        const after = await refreshMarkets('verifying');
        const summary = verifyDismissals(attempted, after);
        for (const row of summary) {
            if (!attempted.some(job => job.marketKey === row.marketKey)) continue;
            log('🧹 ' + names[row.marketKey] + ': ' + row.removed + ' dismissed, ' + row.remaining
                + ' still listed, ' + row.unverified + ' unverified.');
        }
        const total = summary.reduce((sum, row) => sum + row.removed, 0);
        const remaining = summary.reduce((sum, row) => sum + row.remaining + row.unverified, jobs.length - attempted.length);
        status('done', 'Cleanup verified: ' + total + ' failed job(s) dismissed; ' + remaining
            + ' remaining or unverified' + (Object.keys(before).length < 4 || Object.keys(after).length < 4 ? ' (some markets unavailable).' : '.'), false);
    } catch (error) {
        status('error', 'Cleanup stopped: ' + error.message + '. No cached jobs are removed locally.', false);
    } finally { _automationFinish(TYPE); }
}
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action !== 'dismissAllFailedJobs') return;
    const result = _automationEnqueue(TYPE, runCleanup);
    if (result === 'queued') status('queued', 'Cleanup queued behind the current automation; all markets will refresh when it starts.');
    sendResponse({ success: true, queueResult: result });
});
chrome.storage.local.get('failedJobsCleanupStatus', data => {
    if (data.failedJobsCleanupStatus?.busy) status('error', 'Previous cleanup was interrupted. Click All Failed to refresh and try again.', false);
});
