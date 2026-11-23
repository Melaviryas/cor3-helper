import { wsSend, joinRoom } from './ws-send.js';
import { OrigWebSocket, trackedSockets } from './state.js';

// The public game MailRoom uses mail.get.state and mail.claim.all({ messageId }).
// Never omit messageId: omission would claim unrelated mail as well.
window.addEventListener('message', event => {
    if (event.source !== window) return;
    const command = event.data;
    if (command?.type !== 'COR3_REQUEST_EXPEDITION_MAIL' && command?.type !== 'COR3_CLAIM_EXPEDITION_MAIL') return;
    if (!trackedSockets.some(socket => socket.readyState === OrigWebSocket.OPEN)) {
        window.postMessage({ type: 'COR3_MAIL_OFFLINE' }, '*');
        return;
    }
    if (command.type === 'COR3_REQUEST_EXPEDITION_MAIL') {
        // Rejoin idempotently so closing the game's stash window cannot leave us unsubscribed.
        joinRoom('mail');
        wsSend('42' + JSON.stringify(['event', { event: { name: 'mail', action: 'get.state' }, data: {} }]));
    } else if (typeof command.messageId === 'string' && command.messageId) {
        wsSend('42' + JSON.stringify(['event', {
            event: { name: 'mail', action: 'claim.all' }, data: { messageId: command.messageId }
        }]));
    }
});

export function relayExpeditionMail(payload) {
    const action = payload?.event?.action;
    if (action !== 'get.state' && action !== 'update.state' && action !== 'claim.all') return;
    window.postMessage({ type: 'COR3_EXPEDITION_MAIL_RESPONSE', action,
        data: payload.data, error: payload.error || null }, '*');
}
