import { isExpeditionMail, pendingAttachments } from './expedition-mail-policy.js';

// Dependency injection keeps server replies, timeouts and duplicate updates testable offline.
export class ExpeditionMailController {
    constructor({ send, log, onStatus = () => {}, now = Date.now,
        later = (callback, delay) => setTimeout(callback, delay),
        cancel = timer => clearTimeout(timer) }) {
        // Window timers reject a controller instance as their receiver in Chrome.
        // Wrappers preserve a normal global call instead of invoking this.setTimeout().
        Object.assign(this, { send, log, onStatus, now, later, cancel });
        this.enabled = false;
        this.messages = [];
        this.cooldowns = new Map();
        this.pending = null;
        this.waitingSince = null;
        this.pausedUntil = 0;
        this.refreshTimer = null;
        this.lastSummary = '';
        this.stateTimer = null;
        this.pauseReason = null;
        this.status = { phase: 'disabled', message: 'Auto-claim is off.' };
    }

    report(phase, message) {
        this.status = { phase, message };
        this.onStatus(this.status);
        return this.status;
    }

    setEnabled(enabled) {
        if (this.enabled === enabled) return;
        this.enabled = enabled;
        this.waitingSince = null;
        this.cancel(this.stateTimer);
        if (!enabled) {
            this.cancel(this.refreshTimer);
            if (this.pending) this.cancel(this.pending.timer);
            this.pending = null;
            this.messages = [];
            this.log('Mail auto-claim disabled.');
            this.report('disabled', 'Auto-claim is off.');
        } else {
            this.log('Mail auto-claim enabled: checking expedition reward mail.');
            this.request();
        }
    }

    request() {
        if (!this.enabled) return this.report('disabled', 'Enable auto-claim first.');
        if (this.pending) return this.report('claiming', 'Waiting for the game to confirm the reward claim.');
        if (this.now() < this.pausedUntil) {
            return this.report('waiting', 'Mail check paused; retry in ' + Math.ceil((this.pausedUntil - this.now()) / 1000) + 's.');
        }
        if (this.waitingSince !== null && this.now() - this.waitingSince < 15000) return this.status;
        if (this.waitingSince !== null) this.log('Mail state request timed out; requesting fresh state.');
        this.waitingSince = this.now();
        this.cancel(this.stateTimer);
        this.report('checking', 'Checking Stash mailbox; waiting for game data.');
        this.log('Mail check requested; waiting for Stash mailbox state.');
        this.stateTimer = this.later(() => {
            this.waitingSince = null;
            this.log('Mail state request timed out: no mailbox reply from the game.');
            this.report('error', 'No mailbox reply within 15s. See Logs; refresh the game if this continues.');
        }, 15000);
        this.send({ type: 'COR3_REQUEST_EXPEDITION_MAIL' });
        return this.status;
    }

    refreshSoon() {
        this.cancel(this.refreshTimer);
        this.refreshTimer = this.later(() => this.request(), 1500);
    }

    finishPending(message, phase = 'claimed') {
        const pending = this.pending;
        if (!pending) return;
        this.cancel(pending.timer);
        // Even a stale update cannot resubmit this claim immediately.
        this.cooldowns.set(pending.messageId, this.now() + 120000);
        this.pending = null;
        this.log(message);
        this.report(phase, message);
        this.refreshSoon();
    }

    offline() {
        if (!this.enabled) return;
        this.pausedUntil = this.now() + 60000;
        this.pauseReason = 'offline';
        this.waitingSince = null;
        this.cancel(this.stateTimer);
        if (this.pending) this.finishPending('Mail claim not sent: game connection is offline; retrying after 60s.', 'offline');
        else {
            this.log('Mail check skipped: game connection is offline; retrying after 60s.');
            this.report('offline', 'Game connection is not ready; retrying automatically.');
        }
    }

    receive({ action, data, error }) {
        if (!this.enabled) return;
        if (error) {
            const reason = error.message || error.key || String(error);
            this.pausedUntil = this.now() + 60000;
            this.pauseReason = 'error';
            this.waitingSince = null;
            this.cancel(this.stateTimer);
            if (action === 'claim.all' && this.pending) this.finishPending('Mail claim failed: ' + reason + '; retry delayed.', 'error');
            else {
                this.log('Mail ' + action + ' failed: ' + reason + '; retry delayed.');
                this.report('error', 'Mail ' + action + ' failed: ' + reason + '.');
            }
            return;
        }
        if (action === 'get.state' || action === 'update.state') {
            this.waitingSince = null;
            this.cancel(this.stateTimer);
            if (!Array.isArray(data?.messages)) {
                this.log('Mail state has an unknown format; no claim sent.');
                this.report('error', 'Unknown mailbox data format; no reward claim sent.');
                return;
            }
            if (this.pauseReason === 'offline') {
                this.pausedUntil = 0;
                this.pauseReason = null;
            }
            this.messages = data.messages.filter(message => message && typeof message.id === 'string');
            const summary = 'Mail state: ' + this.messages.filter(message => pendingAttachments(message).length).length
                + ' pending message(s), ' + this.messages.filter(isExpeditionMail).length + ' recognized expedition reward mail(s).';
            if (summary !== this.lastSummary) { this.log(summary); this.lastSummary = summary; }
            let verified = false;
            if (this.pending) {
                const current = this.messages.find(message => message.id === this.pending.messageId);
                const remaining = new Set(pendingAttachments(current).map(item => item.id));
                if (![...this.pending.ids].some(id => remaining.has(id))) {
                    this.finishPending('Mail claim verified: no pending reward attachments remain.');
                    verified = true;
                }
            }
            this.pump();
            if (!this.pending && !verified) {
                const rewards = this.messages.filter(isExpeditionMail).length;
                this.report(rewards ? 'waiting' : 'idle', rewards
                    ? rewards + ' reward mail(s) waiting for retry cooldown.'
                    : 'No unclaimed expedition reward mail found.');
            }
            return;
        }
        if (action !== 'claim.all' || !this.pending) return;
        const results = Array.isArray(data?.results) ? data.results : data ? [data] : [];
        const matched = results.filter(item => item && this.pending.ids.has(item.attachmentId));
        if (!matched.length) return; // Another UI action's acknowledgement is not our success.
        const claimed = matched.filter(item => item.status === 'claimed').length;
        const skipped = matched.filter(item => item.status === 'skipped').length;
        const other = matched.length - claimed - skipped;
        this.finishPending('Mail result: ' + claimed + ' attachment(s) claimed, ' + skipped
            + ' skipped' + (skipped ? ' (no stash space; retry in 2m)' : '')
            + (other ? ', ' + other + ' already claimed, missing, or unknown' : '') + '.', skipped ? 'waiting' : claimed ? 'claimed' : 'waiting');
    }

    pump() {
        if (!this.enabled || this.pending || this.now() < this.pausedUntil) return;
        for (const [key, until] of this.cooldowns) if (until <= this.now()) this.cooldowns.delete(key);
        const message = this.messages.find(item => isExpeditionMail(item)
            && !this.cooldowns.has(item.id));
        if (!message) return;
        const ids = new Set(pendingAttachments(message).map(item => item.id));
        this.pending = { messageId: message.id, ids, timer: null };
        this.pending.timer = this.later(() => {
            this.finishPending('Mail claim timed out; result unknown. Checking fresh state before any retry (2m cooldown).', 'error');
        }, 15000);
        this.log('Claiming expedition mail ' + message.id + ' (' + ids.size + ' attachment(s)).');
        this.report('claiming', 'Claiming ' + ids.size + ' reward attachment(s); waiting for game confirmation.');
        this.send({ type: 'COR3_CLAIM_EXPEDITION_MAIL', messageId: message.id });
    }
}
