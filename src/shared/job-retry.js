export const LOCK_RETRY_BUFFER_MS = 15000;
export function retryAt(result) {
    if (result?.status !== 'skipped') return null;
    const lock = Date.parse(result.lockExpiresAt);
    if (Number.isFinite(lock)) return lock + LOCK_RETRY_BUFFER_MS;
    const maintenance = Date.parse(result.maintenanceEndsAt);
    return Number.isFinite(maintenance) ? maintenance + 3 * 60000 : null;
}
export function excludeJobResult(result, now = Date.now()) {
    if (result?.status === 'failed' || result?.status === 'bugged') return true;
    if (result?.status !== 'skipped') return false;
    const at = retryAt(result);
    return at === null || at > now;
}
