const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { buildSync } = require('esbuild');
const code = buildSync({ entryPoints: ['src/shared/periodic-merc-controller.js'], bundle: true, platform: 'node', format: 'cjs', write: false }).outputFiles[0].text;
const mod = { exports: {} };
vm.runInNewContext(code, { module: mod, exports: mod.exports, setTimeout, clearTimeout, Date });
const { PeriodicMercController, pickPeriodicMerc, PERIODIC_MERC_MINUTES } = mod.exports;
const config = { locations: [{ id: 'loc', name: 'Skylift Remains', zones: [{ id: 'zone', goals: [{ id: 'goal' }] }] }] };
const merc = (id, status = 'AVAILABLE') => ({ id, callsign: id, status });
function fixture(extra = {}) {
  const sent = [], statuses = [], done = [], timers = new Map(); let serial = 0;
  const c = new PeriodicMercController({ send: m => sent.push(m), onStatus: s => statuses.push(s), onDone: d => done.push(d),
    later(fn, ms) { timers.set(++serial, { fn, ms }); return serial; }, cancel(id) { timers.delete(id); } });
  const settings = { periodicMercDispatchEnabled: true, autoSendMerc: { enabled: false, autoChooseMerc: true, ignoreEliteMerc: true, applyMercCostLimiter: true, maxMercCost: 3000 }, ...extra };
  c.setSettings(settings);
  const fresh = exps => c.receive({ type: 'COR3_PERIODIC_EXPEDITIONS_RESULT', requestId: c.requestId, expeditions: exps });
  const core = (mercs = [merc('Jolt'), merc('Zero')]) => {
    c.receive({ type: 'COR3_WS_MERCENARIES', data: { mercenaries: mercs } });
    c.receive({ type: 'COR3_WS_EXPEDITION_CONFIG', data: config });
    for (const m of mercs) c.receive({ type: 'COR3_WS_MERC_CONFIGURE', mercenaryId: m.id, data: { totalCost: 1995, riskScore: m.id === 'Zero' ? 5 : 21 } });
    c.receive({ type: 'COR3_CORE_MERCS_DONE' });
  };
  const usolUnavailable = () => c.receive({ type: 'COR3_WS_USOL_MARKET_UNREACHABLE' });
  const launches = () => sent.filter(m => m.type === 'COR3_LAUNCH_EXPEDITION');
  return { c, settings, sent, statuses, done, timers, fresh, core, usolUnavailable, launches };
}
test('30-minute interval; default-off and Helper mode never start', () => {
  assert.equal(PERIODIC_MERC_MINUTES, 30);
  assert.equal(fixture({ periodicMercDispatchEnabled: false }).c.start(), false);
  assert.equal(fixture({ helperMode: true }).c.start(), false);
});
test('independent check uses fresh data even when original auto-send is OFF; lower risk breaks equal-price tie', () => {
  const f = fixture(); assert.equal(f.c.start(), true); assert.equal(f.c.start(), false);
  f.fresh([]); f.core(); f.usolUnavailable();
  assert.equal(f.launches().length, 0); // must recheck expedition status after merc refresh
  f.fresh([]); assert.equal(f.launches().length, 1); assert.equal(f.launches()[0].config.mercenaryId, 'Zero');
  assert.equal(f.done.length, 0); // sending is not success
  f.c.receive({ type: 'COR3_WS_EXPEDITION_LAUNCHED', data: { id: 'exp', status: 'IN_PROGRESS' } });
  assert.equal(f.done[0].expedition.id, 'exp'); assert.equal(f.c.running, false);
});
test('fresh active/completed/unknown status prevents launch, regardless of old empty cache', () => {
  for (const status of ['IN_PROGRESS', 'COMPLETED', 'FAILED', 'AWAITING_DECISION']) {
    const f = fixture(); f.c.start(); f.fresh([{ id: 'old', status }]);
    assert.equal(f.c.running, false); assert.equal(f.launches().length, 0);
    assert.equal(f.sent.some(m => m.type === 'COR3_REQUEST_MERCENARIES'), false);
  }
});
test('a manually started expedition during merc refresh prevents a second launch', () => {
  const f = fixture(); f.c.start(); f.fresh([]); f.core(); f.usolUnavailable();
  f.fresh([{ id: 'manual', status: 'IN_PROGRESS' }]); assert.equal(f.launches().length, 0);
});
test('all mercs RESTING causes no launch; next full check can launch when fresh status becomes AVAILABLE', () => {
  const f = fixture(); f.c.start(); f.fresh([]); f.core([merc('Zero', 'RESTING')]); f.usolUnavailable();
  assert.equal(f.c.running, false); assert.equal(f.launches().length, 0);
  f.c.start(); f.fresh([]); f.core(); f.usolUnavailable(); f.fresh([]); assert.equal(f.launches().length, 1);
});
test('cost cap, elites and unknown prices are excluded; USOL-first and selected-only are respected', () => {
  const markets = { core: { mercenaries: [merc('Jolt'), merc('Pulse'), merc('unknown'), merc('elite')], eliteSlots: [{ mercenary: merc('elite') }] }, usol: { mercenaries: [merc('USOL')] } };
  const prices = { Jolt: { totalCost: 1995 }, Pulse: { totalCost: 5466 }, elite: { totalCost: 1 }, USOL: { totalCost: 2500 } };
  const s = fixture().settings.autoSendMerc;
  assert.equal(pickPeriodicMerc(markets, prices, s).id, 'Jolt');
  assert.equal(pickPeriodicMerc(markets, prices, { ...s, autoChooseUsolFirst: true }).id, 'USOL');
  assert.equal(pickPeriodicMerc(markets, prices, { ...s, autoChooseMerc: false, mercenaryId: 'Pulse' }), null);
  assert.equal(pickPeriodicMerc(markets, prices, { ...s, maxMercCost: 1900 }), null);
});
test('disable/helper/cost-limit change before launch prevents dispatch', () => {
  for (const update of [{ periodicMercDispatchEnabled: false }, { helperMode: true }, { autoSendMerc: { autoChooseMerc: true, applyMercCostLimiter: true, maxMercCost: 1000 } }]) {
    const f = fixture(); f.c.start(); f.fresh([]); f.core(); f.usolUnavailable();
    f.c.setSettings({ ...f.settings, ...update }); f.fresh([]); assert.equal(f.launches().length, 0);
  }
});
test('missing core data and stale request ids fail closed', () => {
  const f = fixture(); f.c.start();
  f.c.receive({ type: 'COR3_PERIODIC_EXPEDITIONS_RESULT', requestId: 'stale', expeditions: [] });
  assert.equal(f.c.phase, 'idle-check'); f.fresh([]);
  f.c.receive({ type: 'COR3_CORE_MERCS_DONE' }); assert.equal(f.c.running, false); assert.equal(f.launches().length, 0);
});
test('offline, timeout, and server rejection finish without retrying launch in the same check', () => {
  const offline = fixture(); offline.c.start(); offline.c.receive({ type: 'COR3_PERIODIC_EXPEDITIONS_RESULT', requestId: offline.c.requestId, error: 'offline' });
  assert.equal(offline.c.running, false);
  const timed = fixture(); timed.c.start(); [...timed.timers.values()][0].fn(); assert.equal(timed.c.running, false);
  for (const type of ['COR3_WS_MERC_NOT_AVAILABLE', 'COR3_WS_INSUFFICIENT_CREDITS', 'COR3_WS_EXPEDITION_RETRY_LAUNCH']) {
    const f = fixture(); f.c.start(); f.fresh([]); f.core(); f.usolUnavailable(); f.fresh([]);
    f.c.receive({ type }); assert.equal(f.c.running, false); assert.equal(f.launches().length, 1); assert.equal(f.done[0].expedition, null);
  }
});
test('USOL timeout can still use fresh CORE data; no old USOL prices are reused', () => {
  const f = fixture(); f.c.start(); f.fresh([]); f.core();
  [...f.timers.values()][0].fn(); f.fresh([]); assert.equal(f.launches().length, 1);
});
test('a sent launch retains queue ownership if disabled until result arrives', () => {
  const f = fixture(); f.c.start(); f.fresh([]); f.core(); f.usolUnavailable(); f.fresh([]);
  f.c.setSettings({ ...f.settings, periodicMercDispatchEnabled: false }); assert.equal(f.c.running, true);
  f.c.receive({ type: 'COR3_WS_EXPEDITION_LAUNCHED', data: { id: 'exp' } }); assert.equal(f.c.running, false);
});
