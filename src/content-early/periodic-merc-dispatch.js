import { wsSend, joinRoom } from './ws-send.js';
import { OrigWebSocket, trackedSockets } from './state.js';
import { cancelMercenaryFetches } from './expeditions.js';

let requestId = null;
window.addEventListener('message', event => {
    if (event.source !== window) return;
    const command = event.data;
    if (command?.type === 'COR3_PERIODIC_CANCEL_EXPEDITIONS') {
        if (command.requestId === requestId) requestId = null;
        if (command.cancelMercs) cancelMercenaryFetches();
    }
    if (command?.type === 'COR3_PERIODIC_CANCEL_MERC_FETCH') cancelMercenaryFetches();
    if (command?.type !== 'COR3_PERIODIC_REQUEST_EXPEDITIONS' || typeof command.requestId !== 'string') return;
    requestId = command.requestId;
    if (!trackedSockets.some(socket => socket.readyState === OrigWebSocket.OPEN)) {
        relayPeriodicExpeditions({ error: { message: 'Game connection is offline' } }); return;
    }
    joinRoom('expeditions');
    // Always send get.active: a cached room membership must not suppress the check.
    wsSend('42' + JSON.stringify(['event', { event: { name: 'expeditions', action: 'get.active' } }]));
});

export function relayPeriodicExpeditions(payload) {
    if (!requestId) return;
    const id = requestId;
    requestId = null;
    const data = payload?.data;
    const expeditions = Array.isArray(data) ? data : data?.id ? [data] : null;
    window.postMessage({ type: 'COR3_PERIODIC_EXPEDITIONS_RESULT', requestId: id,
        expeditions, error: payload?.error?.message || (!expeditions ? 'Invalid expedition response' : null) }, '*');
}
