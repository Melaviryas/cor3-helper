import { canSelectivelySell, isDroneMaterial, itemQuantity, selectiveSaleName } from './selective-loot-policy.js';

export class SelectiveLootController {
    constructor({ send, log, onStatus = () => {}, onFinish = () => {}, now = Date.now,
        later = (fn, delay) => setTimeout(fn, delay), cancel = id => clearTimeout(id) }) {
        Object.assign(this, { send, log, onStatus, onFinish, now, later, cancel });
        this.enabled = false;
        this.running = false;
        this.stash = null;
        this.pending = null;
        this.timer = null;
        this.cooldowns = new Map();
        this.sold = 0;
        this.status = { phase: 'disabled', message: 'Selective auto-sell is off.' };
    }

    report(phase, message) {
        this.status = { phase, message, soldUnits: this.sold };
        this.onStatus(this.status);
        return this.status;
    }

    setEnabled(enabled) {
        if (this.enabled === enabled) return;
        this.enabled = enabled;
        if (!enabled) {
            this.finish('disabled', 'Selective auto-sell stopped. Drone materials are kept while Select mode is on.');
        } else {
            this.log('Selective auto-sell enabled: keeping all 22 drone-material types.');
            this.report('waiting', 'Waiting to check Stash; keeping all 22 drone-material types.');
        }
    }

    start() {
        if (!this.enabled || this.running) return false;
        this.running = true;
        this.stash = null; // A stored or previous snapshot must never initiate sales.
        this.sold = 0;
        this.pending = { kind: 'stash' };
        this.report('checking', 'Checking fresh Stash data before selling non-drone loot.');
        this.timer = this.later(() => this.finish('error', 'Selective sell: no fresh Stash reply within 15s; no sale sent.'), 15000);
        this.send({ type: 'COR3_SELECTIVE_REQUEST_STASH' });
        return true;
    }

    finish(phase, message) {
        this.cancel(this.timer);
        this.timer = null;
        const wasRunning = this.running;
        this.running = false;
        this.pending = null;
        this.report(phase, message);
        if (message && phase !== 'disabled') this.log(message);
        if (wasRunning) this.onFinish();
    }

    receive({ action, data, error }) {
        if (!this.enabled || !this.running) return;
        if (error) {
            if (this.pending?.kind === 'sale' && action !== 'sell.item') return;
            if (this.pending?.kind === 'sale') this.cooldowns.set(this.pending.id, this.now() + 120000);
            this.finish('error', 'Selective sell failed: ' + (error.message || error.key || String(error)) + '; retry delayed.');
            return;
        }
        if (!Array.isArray(data?.items)) return;
        this.stash = data;
        if (this.pending?.kind === 'stash') {
            this.cancel(this.timer);
            this.pending = null;
            this.step();
        } else if (this.pending?.kind === 'sale') {
            const pending = this.pending;
            if (action !== 'sell.item') return;
            const item = data.items.find(item => item?.id === pending.id);
            if (item && itemQuantity(item) === 0) return;
            const remaining = item ? itemQuantity(item) : 0;
            if (remaining > pending.before - pending.quantity) return;
            this.cancel(this.timer);
            this.sold += pending.quantity;
            this.log('Selective sale completed (verified): ' + pending.name + ' ×' + pending.quantity + '.');
            this.report('selling', 'Sold ' + pending.name + ' ×' + pending.quantity + '; checking remaining loot.');
            this.pending = null;
            this.timer = this.later(() => this.step(), 1000);
        }
    }

    step() {
        if (!this.enabled || !this.running || this.pending) return;
        const items = this.stash?.items || [];
        for (const [id, until] of this.cooldowns) if (until <= this.now()) this.cooldowns.delete(id);
        const item = items.find(item => canSelectivelySell(item) && !this.cooldowns.has(item.id));
        if (!item) {
            const kept = items.filter(isDroneMaterial).reduce((sum, item) => sum + itemQuantity(item), 0);
            const delayed = items.some(item => canSelectivelySell(item) && this.cooldowns.has(item.id));
            this.finish(delayed ? 'waiting' : 'idle', 'Selective sell complete: ' + this.sold + ' unit(s) sold; '
                + kept + ' drone-material unit(s) kept.' + (delayed ? ' Some items await retry cooldown.' : ' No eligible non-drone loot remains.'));
            return;
        }
        const quantity = itemQuantity(item);
        this.pending = { kind: 'sale', id: item.id, before: quantity, quantity, name: selectiveSaleName(item) };
        this.report('selling', 'Selling ' + this.pending.name + ' ×' + quantity + '; waiting for game confirmation.');
        this.log('Selective sell request: ' + this.pending.name + ' ×' + quantity + '.');
        this.timer = this.later(() => {
            if (this.pending?.kind === 'sale') this.cooldowns.set(this.pending.id, this.now() + 120000);
            this.finish('error', 'Selective sale timed out; result unknown. Fresh Stash data is required before retry (2m item cooldown).');
        }, 15000);
        this.send({ type: 'COR3_SELECTIVE_SELL_ITEM', itemId: item.id, itemConfigId: item.itemConfigId, quantity });
    }
}
