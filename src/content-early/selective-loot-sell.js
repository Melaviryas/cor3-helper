import { wsSend, joinRoom } from './ws-send.js';
import { OrigWebSocket, trackedSockets } from './state.js';
import { canSelectivelySell, itemQuantity } from '../shared/selective-loot-policy.js';

let enabled = false;
let latestStash = null;

function fail(action, message) {
    window.postMessage({ type: 'COR3_SELECTIVE_STASH_RESPONSE', action, error: { message } }, '*');
}

window.addEventListener('message', event => {
    if (event.source !== window) return;
    const command = event.data;
    if (command?.type === 'COR3_SELECTIVE_CONFIG') { enabled = command.enabled === true; return; }
    if (!['COR3_SELECTIVE_REQUEST_STASH', 'COR3_SELECTIVE_SELL_ITEM'].includes(command?.type)) return;
    const action = command.type === 'COR3_SELECTIVE_REQUEST_STASH' ? 'get.state' : 'sell.item';
    if (!enabled) { fail(action, 'Selective auto-sell is disabled'); return; }
    if (!trackedSockets.some(socket => socket.readyState === OrigWebSocket.OPEN)) {
        fail(action, 'Game connection is offline'); return;
    }
    if (action === 'get.state') {
        joinRoom('stash');
        wsSend('42' + JSON.stringify(['event', { event: { name: 'stash', action }, data: {} }]));
        return;
    }
    // Revalidate against server data in MAIN as well as in the isolated controller.
    const item = latestStash?.items?.find(item => item?.id === command.itemId);
    if (!canSelectivelySell(item) || item.itemConfigId !== command.itemConfigId
        || !Number.isSafeInteger(command.quantity) || command.quantity < 1
        || command.quantity > itemQuantity(item)) {
        fail(action, 'Item no longer qualifies for selective sale; fresh Stash data is required');
        return;
    }
    wsSend('42' + JSON.stringify(['event', {
        event: { name: 'stash', action }, data: { itemId: item.id, quantity: command.quantity }
    }]));
});

export function relaySelectiveStash(payload) {
    if (Array.isArray(payload?.data?.items)) latestStash = payload.data;
    window.postMessage({ type: 'COR3_SELECTIVE_STASH_RESPONSE', action: payload?.event?.action,
        data: payload?.data, error: payload?.error || null }, '*');
}
