const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const path = require('node:path');
const { buildSync } = require('esbuild');
const code = buildSync({ stdin: { contents: "export * from './src/shared/selective-loot-controller.js'; export * from './src/shared/selective-loot-policy.js';", resolveDir: path.resolve(__dirname, '..') }, bundle: true, write: false, platform: 'node', format: 'cjs' }).outputFiles[0].text;
const mod = { exports: {} };
vm.runInNewContext(code, { module: mod, exports: mod.exports, setTimeout, clearTimeout });
const { SelectiveLootController, DRONE_MATERIALS, SELECTIVE_SALE_ITEMS, canSelectivelySell } = mod.exports;
const known = SELECTIVE_SALE_ITEMS[0], keep = DRONE_MATERIALS[0];
const loot = (id = 'loot', extra = {}) => ({ id, itemConfigId: known.id, name: '本地化名称', quantity: 1, canSell: true, sellPrice: 100, location: 'stash', ...extra });
const material = extra => loot('material', { itemConfigId: keep.id, quantity: 99, ...extra });
const state = (items, action = 'get.state') => ({ action, data: { items } });
function fixture() {
 let time = 0, serial = 0, finishes = 0;
 const timers = new Map(), sent = [], logs = [], statuses = [];
 const controller = new SelectiveLootController({ send: command => sent.push(command), log: message => logs.push(message), onStatus: status => statuses.push(status), onFinish: () => finishes++, now: () => time,
  later: (fn, ms) => { timers.set(++serial, { fn, at: time + ms }); return serial; }, cancel: id => timers.delete(id) });
 return { controller, sent, logs, statuses, get finishes() { return finishes; }, sales() { return sent.filter(command => command.type === 'COR3_SELECTIVE_SELL_ITEM'); }, advance(ms) {
  const end = time + ms;
  while (true) { const next = [...timers].filter(([,value]) => value.at <= end).sort((a,b) => a[1].at - b[1].at)[0]; if (!next) break; time = next[1].at; timers.delete(next[0]); next[1].fn(); }
  time = end;
 } };
}

test('catalogue protects all 22 drone material IDs and allows only 11 other types', () => {
 assert.equal(DRONE_MATERIALS.length, 22); assert.equal(SELECTIVE_SALE_ITEMS.length, 11);
 for (const item of DRONE_MATERIALS) assert.equal(canSelectivelySell(loot('keep', { itemConfigId: item.id })), false, item.name);
 for (const item of SELECTIVE_SALE_ITEMS) assert.equal(canSelectivelySell(loot('sell', { itemConfigId: item.id })), true, item.name);
 assert.equal(new Set([...DRONE_MATERIALS, ...SELECTIVE_SALE_ITEMS].map(item => item.id)).size, 33);
});
test('recognition is by config ID, independent of display name and translation', () => {
 assert.equal(canSelectivelySell(loot()), true);
 assert.equal(canSelectivelySell(loot('unknown', { itemConfigId: 'unknown', name: known.name })), false);
 assert.equal(canSelectivelySell(material({ name: known.name })), false);
});
test('unsellable, unknown, locked, pinned, sorting-table, loot and invalid quantities are skipped', () => {
 for (const extra of [{ canSell: false }, { canSell: 'true' }, { itemConfigId: 'new-type' }, { locked: true }, { pinned: true }, { location: 'sorting_table' }, { location: 'loot' }, { quantity: 0 }, { quantity: -1 }, { quantity: 1.5 }, { quantity: null }]) assert.equal(canSelectivelySell(loot('x', extra)), false, JSON.stringify(extra));
});
test('disabled by default and cached data never initiates a sale', () => {
 const f = fixture(); f.controller.receive(state([loot()])); assert.equal(f.controller.start(), false); assert.equal(f.sent.length, 0);
 f.controller.setEnabled(true); f.controller.start(); assert.equal(f.sent.length, 1); assert.equal(f.sales().length, 0);
 assert.equal(f.sent[0].type, 'COR3_SELECTIVE_REQUEST_STASH');
});
test('all quantities of materials are retained and eligible stacks are sold one at a time', () => {
 const f = fixture(); f.controller.setEnabled(true); f.controller.start();
 f.controller.receive(state([material(), loot('one', { quantity: 3 }), loot('two')]));
 assert.equal(f.sales().length, 1); assert.equal(f.sales()[0].quantity, 3); assert.equal(f.sales()[0].itemId, 'one');
 f.controller.receive(state([material(), loot('two')], 'sell.item'));
 assert.equal(f.sales().length, 1); f.advance(1000); assert.equal(f.sales().length, 2);
 f.controller.receive(state([material()], 'sell.item')); f.advance(1000);
 assert.equal(f.controller.running, false); assert.equal(f.controller.sold, 4); assert.equal(f.finishes, 1);
 assert.ok(f.controller.status.message.includes('99 drone-material unit(s) kept'));
});
test('unrelated or unchanged replies cannot report a sale as successful', () => {
 const f = fixture(); f.controller.setEnabled(true); f.controller.start(); f.controller.receive(state([loot()]));
 f.controller.receive(state([loot(), material()], 'sell.item')); assert.equal(f.controller.sold, 0);
 f.controller.receive(state([], 'update.state')); assert.equal(f.controller.sold, 0);
 f.advance(15001); assert.equal(f.controller.status.phase, 'error'); assert.ok(f.controller.status.message.includes('result unknown'));
});
test('a sale timeout requires fresh state and blocks that item for two minutes', () => {
 const f = fixture(); f.controller.setEnabled(true); f.controller.start(); f.controller.receive(state([loot()])); f.advance(15001);
 f.controller.start(); assert.equal(f.sales().length, 1); f.controller.receive(state([loot()])); assert.equal(f.sales().length, 1);
 f.advance(120001); f.controller.start(); f.controller.receive(state([loot()])); assert.equal(f.sales().length, 2);
});
test('server errors stop the batch without guessing success or moving to another item', () => {
 const f = fixture(); f.controller.setEnabled(true); f.controller.start(); f.controller.receive(state([loot(), loot('second')]));
 f.controller.receive({ action: 'sell.item', error: { message: 'item-locked' } });
 f.advance(30000); assert.equal(f.sales().length, 1); assert.equal(f.controller.sold, 0); assert.equal(f.controller.running, false);
});
test('turning off cancels both pending work and the delay before the next sale', () => {
 const f = fixture(); f.controller.setEnabled(true); f.controller.start(); f.controller.receive(state([loot(), loot('second')]));
 f.controller.receive(state([loot('second')], 'sell.item')); f.controller.setEnabled(false); f.advance(30000);
 assert.equal(f.sales().length, 1); assert.equal(f.controller.status.phase, 'disabled'); assert.equal(f.finishes, 1);
});
test('missing or malformed fresh inventory times out without issuing a sale', () => {
 const f = fixture(); f.controller.setEnabled(true); f.controller.start();
 for (const data of [null, {}, { items: 'unknown' }]) f.controller.receive({ action: 'get.state', data });
 f.advance(15001); assert.equal(f.sales().length, 0); assert.equal(f.controller.running, false);
});
test('new inventory updates revalidate pinned/locked state before the next sale', () => {
 const f = fixture(); f.controller.setEnabled(true); f.controller.start(); f.controller.receive(state([loot(), loot('second')]));
 f.controller.receive(state([loot('second')], 'sell.item'));
 f.controller.receive(state([loot('second', { locked: true })], 'update.state')); f.advance(1000);
 assert.equal(f.sales().length, 1); assert.equal(f.controller.running, false);
});
test('default timers keep valid Window-style receivers through the sale lifecycle', () => {
 const timers = new Map(); let serial = 0;
 function timeout(fn, ms) { 'use strict'; if (this && this.setTimeout !== timeout) throw TypeError('Illegal invocation'); timers.set(++serial, fn); return serial; }
 function clear(id) { 'use strict'; if (this && this.clearTimeout !== clear) throw TypeError('Illegal invocation'); timers.delete(id); }
 const local = { exports: {} }; vm.runInNewContext(code, { module: local, exports: local.exports, setTimeout: timeout, clearTimeout: clear });
 const c = new local.exports.SelectiveLootController({ send() {}, log() {} });
 c.setEnabled(true); c.start(); c.receive(state([loot()])); c.receive(state([], 'sell.item')); c.setEnabled(false);
 assert.equal(timers.size, 0);
});
