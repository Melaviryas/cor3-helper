export const PERIODIC_MERC_TYPE = 'periodic-merc-dispatch';
export const PERIODIC_MERC_MINUTES = 30;
export const CORE_MERC_MARKET = '019d3ea4-85bd-7389-904d-8f7c85841134';
const USOL_MERC_MARKET = '019e4065-6ae8-760d-8724-58ab4f2cf7d7';

// Use only responses collected during this check, never cached availability or prices.
export function pickPeriodicMerc(markets, prices, settings = {}) {
    let eligible = [];
    for (const market of ['core', 'usol']) {
        const data = markets[market];
        const elite = new Set((data?.eliteSlots || []).map(slot => slot.mercenary?.id));
        const mercs = [...(Array.isArray(data) ? data : data?.mercenaries || [])];
        for (const slot of data?.eliteSlots || []) {
            if (slot.mercenary && !mercs.some(m => m.id === slot.mercenary.id)) mercs.push(slot.mercenary);
        }
        for (const merc of mercs) {
            const price = prices[merc.id];
            if (merc.status !== 'AVAILABLE' || !Number.isFinite(price?.totalCost) || price.totalCost < 0) continue;
            if (settings.ignoreEliteMerc && (elite.has(merc.id) || merc._isElite)) continue;
            if (settings.applyMercCostLimiter && price.totalCost > (settings.maxMercCost ?? 15000)) continue;
            if (!settings.autoChooseMerc && merc.id !== settings.mercenaryId) continue;
            eligible.push({ ...merc, market, cost: price.totalCost, risk: price.riskScore ?? 0 });
        }
    }
    eligible.sort((a, b) => {
        if (settings.autoChooseUsolFirst && a.market !== b.market) return a.market === 'usol' ? -1 : 1;
        return a.cost - b.cost || a.risk - b.risk || (a.market === 'usol' ? -1 : 1);
    });
    return eligible[0] || null;
}

export class PeriodicMercController {
    constructor({ send, onStatus = () => {}, onDone = () => {},
        later = (fn, ms) => setTimeout(fn, ms), cancel = id => clearTimeout(id) }) {
        Object.assign(this, { send, onStatus, onDone, later, cancel });
        this.running = false;
        this.serial = 0;
        this.settings = {};
    }
    setSettings(settings) {
        this.settings = settings;
        if (this.running && (!settings.periodicMercDispatchEnabled || settings.helperMode)
            && this.phase !== 'launching') this.finish('Check cancelled: periodic dispatch is off.');
    }
    start() {
        if (this.running || !this.settings.periodicMercDispatchEnabled || this.settings.helperMode) return false;
        this.running = true;
        this.markets = {};
        this.configs = {};
        this.prices = {};
        this.requestExpeditions('idle-check');
        return true;
    }
    status(message) { this.onStatus({ message, checkedAt: Date.now() }); }
    wait(phase, message, ms = 90000) {
        this.cancel(this.timer);
        this.phase = phase;
        this.status(message);
        this.timer = this.later(() => {
            if (phase === 'usol') {
                this.send({ type: 'COR3_PERIODIC_CANCEL_MERC_FETCH' });
                delete this.markets.usol;
                delete this.configs.usol;
                this.status('USOL refresh timed out; using fresh CORE candidates only.');
                this.choose();
            } else this.finish(phase === 'launching'
                ? 'Launch response timed out; outcome unknown. Check the game before retrying.'
                : 'Check timed out; no expedition was sent. Will retry at the next 30-minute check.');
        }, ms);
    }
    requestExpeditions(phase) {
        this.wait(phase, 'Checking fresh expedition status…', 25000);
        this.requestId = 'periodic-' + Date.now() + '-' + (++this.serial);
        this.send({ type: 'COR3_PERIODIC_REQUEST_EXPEDITIONS', requestId: this.requestId });
    }
    finish(message, expedition = null) {
        if (!this.running) return;
        this.running = false;
        this.cancel(this.timer);
        this.send({ type: 'COR3_PERIODIC_CANCEL_EXPEDITIONS', requestId: this.requestId,
            cancelMercs: ['core', 'usol', 'before-launch'].includes(this.phase) });
        this.status(message);
        this.onDone({ message, expedition });
    }
    receive(message) {
        if (!this.running) return;
        const type = message?.type;
        if (type === 'COR3_TOKEN_EXPIRED') { this.finish('Game session expired; sign in again.'); return; }
        if (type === 'COR3_PERIODIC_EXPEDITIONS_RESULT' && message.requestId === this.requestId
            && ['idle-check', 'before-launch'].includes(this.phase)) {
            if (message.error || !Array.isArray(message.expeditions)) {
                this.finish('Cannot read fresh expedition status: ' + (message.error || 'invalid response')); return;
            }
            if (message.expeditions.length) {
                const completed = message.expeditions.every(exp => ['COMPLETED', 'FAILED'].includes(exp?.status));
                this.finish(completed ? 'Previous expedition awaits collection/archive; no new dispatch.'
                    : 'An expedition is already active; no new dispatch.'); return;
            }
            if (this.phase === 'idle-check') {
                this.wait('core', 'Refreshing CORE mercenaries and costs…');
                this.send({ type: 'COR3_REQUEST_MERCENARIES', marketId: CORE_MERC_MARKET });
            } else this.launch();
            return;
        }
        if (type === 'COR3_WS_MERC_CONFIGURE' && message.mercenaryId && ['core', 'usol'].includes(this.phase)) {
            this.prices[message.mercenaryId] = message.data;
        }
        if (this.phase === 'core') {
            if (type === 'COR3_WS_MERCENARIES') this.markets.core = message.data;
            if (type === 'COR3_WS_EXPEDITION_CONFIG') this.configs.core = message.data;
            if (type === 'COR3_CORE_MERCS_DONE') {
                if (!this.markets.core || !this.configs.core) {
                    this.finish('CORE refresh did not return fresh data; no expedition was sent.'); return;
                }
                this.wait('usol', 'Refreshing USOL mercenaries and costs…');
                this.send({ type: 'COR3_REQUEST_USOL_MERCENARIES' });
            }
        } else if (this.phase === 'usol') {
            if (type === 'COR3_WS_USOL_MERCENARIES') this.markets.usol = message.data;
            if (type === 'COR3_WS_USOL_EXPEDITION_CONFIG') this.configs.usol = message.data;
            if (type === 'COR3_WS_USOL_MARKET_UNREACHABLE') {
                delete this.markets.usol;
                delete this.configs.usol;
                this.choose();
            } else if (type === 'COR3_USOL_MERCS_DONE') this.choose();
        } else if (this.phase === 'launching') {
            if (type === 'COR3_WS_EXPEDITION_LAUNCHED' && message.data?.id) {
                this.finish('Expedition launched successfully: ' + this.selected.callsign + '.', message.data);
            } else if (['COR3_WS_EXPEDITION_LAUNCH_ERROR', 'COR3_WS_MERC_NOT_AVAILABLE',
                'COR3_WS_INSUFFICIENT_CREDITS', 'COR3_WS_EXPEDITION_ELITE_REQUIRED',
                'COR3_WS_EXPEDITION_RETRY_LAUNCH'].includes(type)) {
                this.finish('Dispatch stopped: ' + (message.error || type.replace('COR3_WS_', '')) + '. Next check in 30 minutes.');
            }
        }
    }
    choose() {
        // Incomplete USOL data cannot supply a candidate, even if an old cache exists elsewhere.
        if (!this.configs.usol) delete this.markets.usol;
        if (!pickPeriodicMerc(this.markets, this.prices, this.settings.autoSendMerc)) {
            this.finish('No eligible AVAILABLE mercenary. Waiting for the next 30-minute check.'); return;
        }
        // Mercenary configuration can take time: recheck for a manually started expedition.
        this.requestExpeditions('before-launch');
    }
    launch() {
        if (!this.settings.periodicMercDispatchEnabled || this.settings.helperMode) {
            this.finish('Check cancelled: periodic dispatch is off.'); return;
        }
        const selected = pickPeriodicMerc(this.markets, this.prices, this.settings.autoSendMerc);
        if (!selected) { this.finish('No eligible AVAILABLE mercenary under the current filters.'); return; }
        const locations = this.configs[selected.market]?.locations || [];
        const loc = locations.find(loc => ['Skylift Remains', 'Koute Mining and Reprocessing Outpost'].includes(loc.name)) || locations[0];
        const zone = loc?.zones?.[0], goal = zone?.goals?.[0];
        if (!loc?.id || !zone?.id || !goal?.id) { this.finish('Fresh location configuration is incomplete; no dispatch.'); return; }
        this.selected = selected;
        this.wait('launching', 'Sending ' + selected.callsign + ' (cost ' + selected.cost + '); awaiting server confirmation…', 75000);
        this.send({ type: 'COR3_LAUNCH_EXPEDITION', config: {
            mercenaryId: selected.id, marketId: selected.market === 'usol' ? USOL_MERC_MARKET : CORE_MERC_MARKET,
            locationConfigId: loc.id, zoneConfigId: zone.id, goalId: goal.id, hasInsurance: false
        } });
    }
}
