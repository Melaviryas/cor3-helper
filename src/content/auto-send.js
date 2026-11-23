// Compatibility state for engine reconnect notifications. All dispatch now belongs to expedition-module.js.
export let _initialFetchDone = true;
export const autoSendInProgress = false;
export function setInitialFetchDone(value) { _initialFetchDone = value; }
export function checkAutoSendOnExpeditionData() {}
export function setAutoSendInProgress() {}
export function setAutoSendExpeditionId() {}
export function setAutoSendAwaitingMercenaries() {}
export function setAutoSendAwaitingUsolMercs() {}
export function setAutoSendDeferredWaiting() {}
export function setAutoSendUsolSkipped() {}
export function setAutoSendMercRetryCount() {}
