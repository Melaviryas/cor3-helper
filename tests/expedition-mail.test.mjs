import test from 'node:test';
import assert from 'node:assert/strict';
import { ExpeditionMailController } from '../src/shared/expedition-mail-controller.js';
import { isExpeditionMail } from '../src/shared/expedition-mail-policy.js';

const mail = (id = 'reward-1', title = '远征战利品', ids = ['item-1']) => ({ id, title, status: 'PENDING', attachments: ids.map(id => ({ id, claimedAt: null })) });
const state = messages => ({ action: 'get.state', data: { messages } });
function fixture() {
    let time = 0, serial = 0;
    const timers = new Map(), commands = [], logs = [];
    const controller = new ExpeditionMailController({
        send: command => commands.push(command), log: message => logs.push(message), now: () => time,
        later: (fn, delay) => { timers.set(++serial, { fn, at: time + delay }); return serial; },
        cancel: id => timers.delete(id)
    });
    return { controller, commands, logs, advance(ms) {
        const target = time + ms;
        while (true) {
            const next = [...timers].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
            if (!next) break;
            time = next[1].at; timers.delete(next[0]); next[1].fn();
        }
        time = target;
    }, claims() { return commands.filter(command => command.type === 'COR3_CLAIM_EXPEDITION_MAIL'); } };
}

test('only known expedition titles with unclaimed valid attachments qualify', () => {
    for (const title of ['远征战利品', '遠征戰利品', 'Expedition Loot', 'Expedition rewards']) assert.ok(isExpeditionMail(mail('m', title)));
    for (const title of ['Daily rewards', 'Compensation', 'Drone loot', 'Expedition notice', '<img src=x onerror=alert(1)>']) assert.equal(isExpeditionMail(mail('m', title)), false);
    assert.equal(isExpeditionMail({ ...mail(), status: 'CLAIMED' }), false);
    assert.equal(isExpeditionMail({ ...mail(), attachments: [{ id: 'x', claimedAt: '2026-11-11' }] }), false);
    assert.equal(isExpeditionMail({ ...mail(), attachments: [null, {}, { id: '', claimedAt: null }] }), false);
});

test('disabled by default and never claims global inbox', () => {
    const f = fixture(); f.controller.receive(state([mail()])); f.controller.request();
    assert.equal(f.commands.length, 0);
    f.controller.setEnabled(true);
    f.controller.receive(state([mail('unrelated', 'Daily rewards'), mail()]));
    assert.deepEqual(f.claims(), [{ type: 'COR3_CLAIM_EXPEDITION_MAIL', messageId: 'reward-1' }]);
});

test('duplicate state broadcasts and repeated requests do not duplicate claim', () => {
    const f = fixture(); f.controller.setEnabled(true);
    for (let i = 0; i < 20; i++) { f.controller.receive(state([mail()])); f.controller.request(); }
    assert.equal(f.claims().length, 1);
});

test('claim results require matching attachment IDs and are reported honestly', () => {
    const f = fixture(); f.controller.setEnabled(true); f.controller.receive(state([mail()]));
    f.controller.receive({ action: 'claim.all', data: { results: [{ attachmentId: 'someone-else', status: 'claimed' }] } });
    assert.ok(f.controller.pending);
    f.controller.receive({ action: 'claim.all', data: { results: [{ attachmentId: 'item-1', status: 'claimed' }] } });
    assert.equal(f.controller.pending, null);
    assert.ok(f.logs.some(log => log.includes('1 attachment(s) claimed')));
    f.controller.receive(state([mail()]));
    assert.equal(f.claims().length, 1);
});

test('partial claim and full stash pause the same message for two minutes', () => {
    const f = fixture(); f.controller.setEnabled(true); f.controller.receive(state([mail('m', 'Expedition Loot', ['a', 'b'])]));
    f.controller.receive({ action: 'claim.all', data: { results: [{ attachmentId: 'a', status: 'claimed' }, { attachmentId: 'b', status: 'skipped', reason: 'no-space' }] } });
    f.controller.receive(state([mail('m', 'Expedition Loot', ['b'])]));
    assert.equal(f.claims().length, 1);
    assert.ok(f.logs.some(log => log.includes('no stash space')));
    f.advance(120001); f.controller.receive(state([mail('m', 'Expedition Loot', ['b'])]));
    assert.equal(f.claims().length, 2);
});

test('missing acknowledgement is not success and requires fresh state before retry', () => {
    const f = fixture(); f.controller.setEnabled(true); f.controller.receive(state([mail()]));
    f.advance(16000);
    assert.ok(f.logs.some(log => log.includes('result unknown')));
    assert.ok(!f.logs.some(log => log.includes('attachment(s) claimed')));
    f.controller.receive(state([mail()])); assert.equal(f.claims().length, 1);
    f.advance(120000); f.controller.request(); assert.equal(f.claims().length, 1);
    f.controller.receive(state([mail()])); assert.equal(f.claims().length, 2);
});

test('fresh state can confirm claim when acknowledgement was lost', () => {
    const f = fixture(); f.controller.setEnabled(true); f.controller.receive(state([mail()]));
    f.controller.receive(state([{ ...mail(), status: 'CLAIMED', attachments: [] }]));
    assert.equal(f.controller.pending, null);
    assert.ok(f.logs.some(log => log.includes('verified')));
});

test('turning off cancels timers and ignores all later replies', () => {
    const f = fixture(); f.controller.setEnabled(true); f.controller.receive(state([mail()]));
    f.controller.setEnabled(false); const count = f.commands.length;
    f.advance(180000); f.controller.receive(state([mail('new')])); f.controller.request();
    assert.equal(f.commands.length, count);
    assert.equal(f.controller.pending, null);
});

test('offline and server errors back off without selling or deleting anything', () => {
    const f = fixture(); f.controller.setEnabled(true); f.controller.offline(); const count = f.commands.length;
    f.controller.request(); assert.equal(f.commands.length, count);
    f.advance(60001); f.controller.receive(state([mail()]));
    f.controller.receive({ action: 'claim.all', error: { message: 'stash.error.insufficient_capacity' } });
    assert.equal(f.controller.pending, null);
    f.controller.receive(state([mail()])); assert.equal(f.claims().length, 1);
    assert.ok(f.commands.every(command => ['COR3_REQUEST_EXPEDITION_MAIL', 'COR3_CLAIM_EXPEDITION_MAIL'].includes(command.type)));
});

test('malformed server state cannot initiate a claim', () => {
    const f = fixture(); f.controller.setEnabled(true);
    for (const data of [null, {}, { messages: 'unexpected' }]) f.controller.receive({ action: 'get.state', data });
    assert.equal(f.claims().length, 0);
});

test('multiple reward messages are claimed one at a time', () => {
    const f = fixture(); f.controller.setEnabled(true);
    f.controller.receive(state([mail('one', 'Expedition Loot', ['a']), mail('two', 'Expedition Loot', ['b'])]));
    assert.equal(f.claims().length, 1);
    f.controller.receive({ action: 'claim.all', data: { attachmentId: 'a', status: 'claimed' } });
    f.controller.receive(state([mail('two', 'Expedition Loot', ['b'])]));
    assert.equal(f.claims().length, 2); assert.equal(f.claims()[1].messageId, 'two');
});


test('mailbox data arriving after initial offline detection resumes claiming immediately', () => {
    const f = fixture(); f.controller.setEnabled(true); f.controller.offline();
    assert.equal(f.controller.status.phase, 'offline');
    f.controller.receive(state([mail('reconnected', 'EXPEDITION LOOT')]));
    assert.equal(f.claims().length, 1);
    assert.equal(f.controller.status.phase, 'claiming');
});

test('mailbox response timeout is visible and the next request can recover', () => {
    const f = fixture(); f.controller.setEnabled(true);
    assert.equal(f.controller.status.phase, 'checking');
    f.advance(15001);
    assert.equal(f.controller.status.phase, 'error');
    assert.ok(f.controller.status.message.includes('15s'));
    assert.equal(f.controller.request().phase, 'checking');
    f.controller.receive(state([]));
    assert.equal(f.controller.status.phase, 'idle');
});
