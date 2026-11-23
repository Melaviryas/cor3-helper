import { MARKET_IDS } from './server-constants.js';
export const JOB_MARKETS = ['home', 'dark', 'soyuz', 'usol'];
export function findFailedJobs(snapshots) {
    const candidates = new Map();
    for (const key of JOB_MARKETS) {
        for (const job of snapshots[key]?.recentJobs || []) {
            if (job?.status !== 'FAILED' || typeof job.id !== 'string' || !job.id) continue;
            if (!candidates.has(job.id)) candidates.set(job.id, []);
            candidates.get(job.id).push({ key, job });
        }
    }
    const jobs = [], ambiguous = [];
    for (const [jobId, rows] of candidates) {
        const explicit = [...new Set(rows.map(row => row.job.marketId).filter(Boolean))];
        let key = explicit.length === 1 ? JOB_MARKETS.find(key => MARKET_IDS[key] === explicit[0]) : null;
        if (explicit.length > 1 || (explicit.length && !key)) { ambiguous.push(jobId); continue; }
        if (!key) {
            const owners = JOB_MARKETS.filter(key => snapshots[key]?.jobs?.some(job => job.id === jobId));
            key = owners.length === 1 ? owners[0] : rows.length === 1 ? rows[0].key : null;
        }
        if (!key || !snapshots[key]) { ambiguous.push(jobId); continue; }
        // If a newer owner-specific snapshot contradicts a global recentJobs entry, skip it.
        const ownerRow = snapshots[key].recentJobs?.find(job => job.id === jobId);
        if (!ownerRow || ownerRow.status !== 'FAILED') continue;
        jobs.push({ jobId, marketId: MARKET_IDS[key], marketKey: key });
    }
    return { jobs, ambiguous };
}
export function verifyDismissals(jobs, snapshots) {
    return JOB_MARKETS.map(marketKey => {
        const selected = jobs.filter(job => job.marketKey === marketKey);
        const snapshot = snapshots[marketKey];
        if (!snapshot) return { marketKey, removed: 0, remaining: 0, unverified: selected.length };
        const ids = new Set(snapshot.recentJobs.map(job => job.id));
        const removed = selected.filter(job => !ids.has(job.jobId)).length;
        return { marketKey, removed, remaining: selected.length - removed, unverified: 0 };
    });
}
