const assert = require('node:assert/strict');
const vm = require('node:vm');
const { buildSync } = require('esbuild');
const path = require('node:path');
const code = buildSync({ entryPoints: [path.resolve(__dirname, '../src/shared/expedition-mail-controller.js')], bundle: true, write: false, platform: 'node', format: 'cjs' }).outputFiles[0].text;
require('node:test')('Chrome Window-style timer receivers allow the full claim lifecycle', () => {
const timers = new Map(); let serial = 0;
function strictTimeout(fn, ms) {
  'use strict';
  if (this !== undefined && this !== null && this.setTimeout !== strictTimeout) throw new TypeError('Illegal invocation');
  timers.set(++serial, { fn, ms }); return serial;
}
function strictClear(id) {
  'use strict';
  if (this !== undefined && this !== null && this.clearTimeout !== strictClear) throw new TypeError('Illegal invocation');
  timers.delete(id);
}
const mod = { exports: {} };
vm.runInNewContext(code, { module: mod, exports: mod.exports, setTimeout: strictTimeout, clearTimeout: strictClear });
const sent = [], logs = [], statuses = [];
const c = new mod.exports.ExpeditionMailController({ send: command => sent.push(command), log: message => logs.push(message), onStatus: status => statuses.push(status) });
c.setEnabled(true);
c.receive({ action: 'get.state', data: { messages: [{ id: 'reward', title: 'EXPEDITION LOOT', sender: 'Expedition team', status: 'PENDING', attachments: [{ id: 'item', claimedAt: null }] }] } });
assert.equal(sent.filter(command => command.type === 'COR3_CLAIM_EXPEDITION_MAIL').length, 1);
c.refreshSoon();
c.receive({ action: 'claim.all', data: { results: [{ attachmentId: 'item', status: 'claimed' }] } });
assert.equal(c.pending, null);
c.setEnabled(false);
assert.equal(timers.size, 0);
assert.ok(statuses.some(status => status.phase === 'claiming'));
assert.ok(statuses.some(status => status.phase === 'claimed'));
});
