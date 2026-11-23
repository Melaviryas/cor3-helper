import { expeditionEnabled, dispatchEnabled, normalizeExpeditionSettings } from './expedition-settings.js';
import { saleCandidates, stashSpace, itemQuantity, isDroneMaterial, lootName } from './expedition-sale-policy.js';
import { isExpeditionMail, pendingAttachments } from './expedition-mail-policy.js';
import { pickPeriodicMerc, CORE_MERC_MARKET } from './periodic-merc-controller.js';

export const USOL_MERC_MARKET = '019e4065-6ae8-760d-8724-58ab4f2cf7d7';
export function activeList(data) {
    const list = Array.isArray(data) ? data : data?.id ? [data] : null;
    if (!list || list.some(exp => !exp || typeof exp.id !== 'string' || typeof exp.status !== 'string'))
        throw new Error('远征状态格式无法识别，已停止操作');
    return list;
}
export function mercList(data) {
    const mercs = Array.isArray(data) ? [...data] : [...(data?.mercenaries || [])];
    for (const slot of data?.eliteSlots || []) if (slot.mercenary && !mercs.some(merc => merc.id === slot.mercenary.id)) mercs.push(slot.mercenary);
    return mercs;
}
export function chooseLocation(config) {
    const locations = config?.locations || [];
    const loc = locations.find(loc => ['Skylift Remains', 'Koute Mining and Reprocessing Outpost'].includes(loc.name)) || locations[0];
    const zone = loc?.zones?.[0], goal = zone?.goals?.[0];
    if (!loc?.id || !zone?.id || !goal?.id) throw new Error('远征地点配置不完整');
    return { locationConfigId: loc.id, zoneConfigId: zone.id, goalId: goal.id };
}
export function decisionChoice(decision, expedition, mods = {}, now = Date.now()) {
    if (!mods.autoChoose || decision.isResolved || !decision.decisionDeadline || !Array.isArray(decision.decisionOptions)) return null;
    const remaining = new Date(decision.decisionDeadline).getTime() - now;
    if (!Number.isFinite(remaining) || remaining <= 0 || (!mods.noWaitAutoChoose && remaining > 60000)) return null;
    const veteran = mods.getRidOfVeterans && expedition?.mercenary?.rank === 'VETERAN';
    const loot = veteran ? 1 : mods.enabled === false ? 1 : mods.loot ?? 1;
    const risk = veteran ? 10 : mods.enabled === false ? -1 : mods.risk ?? -5;
    return decision.decisionOptions.map(opt => ({ ...opt, score: Math.round(opt.lootModifier * loot
        + opt.riskModifier * risk * (((expedition.riskScore + Math.abs(opt.riskModifier)) / 10) || 1)) }))
        .filter(opt => Number.isFinite(opt.score)).sort((a, b) => b.score - a.score)[0] || null;
}

// A single awaited sequence owns the shared automation queue from fresh state through launch acknowledgement.
// rpc rejects on server errors/timeout. No optimistic cache mutation or automatic unknown-outcome retry.
export class ExpeditionWorkflow {
    constructor({ rpc, settings, store = async () => {}, status = () => {}, log = () => {}, pause = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
        Object.assign(this, { rpc, readSettings: settings, store, status, log, pause });
        this.running = false;
        this.token = 0;
        this.itemCooldowns = new Map();
        this.mailCooldowns = new Map();
    }
    async settings() { return normalizeExpeditionSettings(await this.readSettings()); }
    async allowed() {
        if (this.running && this.activeToken !== this.token) throw new Error('远征模块已暂停，本轮操作已取消');
        const settings = await this.settings();
        if (!expeditionEnabled(settings)) throw new Error('远征模块已暂停');
        return settings;
    }
    report(phase, message, extra = {}) {
        this.status({ phase, message, updatedAt: Date.now(), ...extra });
        this.log(message, phase === 'error' ? 'error' : 'info');
    }
    async call(room, action, data = {}, options = {}) {
        await this.allowed();
        const result = await this.rpc(room, action, data, options);
        return result;
    }
    async expeditions() {
        const exps = activeList(await this.call('expeditions', 'get.active'));
        await this.store({ expeditionsData: exps, expeditionsDataUpdatedAt: Date.now() });
        return exps;
    }
    async stash() {
        const stash = await this.call('stash', 'get.state');
        if (!Array.isArray(stash?.items)) throw new Error('未获得有效仓库数据');
        await this.store({ stashData: stash, stashDataUpdatedAt: Date.now() });
        return stash;
    }
    async sell({ requiredSpace = 0, forceFull = false } = {}) {
        let settings = await this.allowed();
        const mode = settings.expeditionSaleMode;
        let stash = await this.stash();
        const stats = { soldUnits: 0, revenue: 0, unknownPrice: false };
        if (mode === 'off') return stash;
        if (mode === 'full' && !forceFull) requiredSpace = Math.max(requiredSpace, 1);
        this.report('selling', '正在按出售模式检查仓库');
        let steps = 0;
        while (++steps <= 1000) {
            settings = await this.allowed();
            if (settings.expeditionSaleMode !== mode) throw new Error('出售模式已更改，本批操作停止；将按新模式重新检查');
            if (mode === 'full') {
                const free = stashSpace(stash);
                if (free === null) throw new Error('仓库容量未知，无法判断需要出售多少物品');
                if (free >= requiredSpace) break;
            }
            const candidates = saleCandidates(stash, mode);
            const item = candidates.find(item => (this.itemCooldowns.get(item.id) || 0) <= Date.now());
            if (!item) {
                if (candidates.length) throw new Error('部分出售结果尚待确认，冷却结束后再检查');
                if (mode === 'full' && stashSpace(stash) < requiredSpace) throw new Error('非无人机远征掉落不足以腾出所需空间；已保留无人机材料');
                break;
            }
            const before = itemQuantity(item);
            // Sell the whole cheapest stack to actually release its occupied slot.
            this.report('selling', `正在出售 ${lootName(item)} ×${before}，等待服务器确认`);
            try {
                const result = await this.call('stash', 'sell.item', { itemId: item.id, quantity: before },
                    { saleMode: mode, itemConfigId: item.itemConfigId });
                if (!Array.isArray(result?.items)) throw new Error('出售响应缺少库存，结果未知');
                const remainingItem = result.items.find(current => current.id === item.id);
                if (remainingItem && itemQuantity(remainingItem) === 0) throw new Error('出售后数量格式无效');
                const remaining = remainingItem ? itemQuantity(remainingItem) : 0;
                if (remaining > 0) throw new Error('服务器尚未确认整组物品已售出');
                stats.soldUnits += before;
                if (Number.isFinite(item.sellPrice)) stats.revenue += item.sellPrice * before;
                else stats.unknownPrice = true;
                await this.store({ stashData: result, stashDataUpdatedAt: Date.now() });
                this.log(`出售已确认：${lootName(item)} ×${before}`, 'success');
                // Re-read to avoid selling from the acknowledgement's stale or partial inventory.
                await this.pause(600);
                stash = await this.stash();
            } catch (error) {
                this.itemCooldowns.set(item.id, Date.now() + 120000);
                throw error;
            }
        }
        if (steps > 1000) throw new Error('本批出售达到操作上限，等待下一次检查');
        const kept = stash.items.filter(isDroneMaterial).reduce((sum, item) => sum + itemQuantity(item), 0);
        const message = `出售检查完成：已售 ${stats.soldUnits} 件；按服务器单价合计 ${stats.revenue.toLocaleString()} CR${stats.unknownPrice ? '（部分售价未知）' : ''}；仓库剩余无人机材料 ${kept} 件`;
        await this.store({ expeditionSaleStatus: { ...stats, message, updatedAt: Date.now() } });
        this.log(message, 'success');
        return stash;
    }
    async claimMail() {
        if (!(await this.allowed()).autoClaimExpeditionMail) return;
        this.report('claiming', '正在检查远征奖励邮件');
        let state = await this.call('mail', 'get.state');
        if (!Array.isArray(state?.messages)) throw new Error('邮箱数据格式无法识别');
        let claimed = 0;
        const visited = new Set();
        while (true) {
            if (!(await this.allowed()).autoClaimExpeditionMail) throw new Error('自动领取已关闭，本轮停止');
            const message = state.messages.find(mail => isExpeditionMail(mail) && !visited.has(mail.id));
            if (!message) break;
            if ((this.mailCooldowns.get(message.id) || 0) > Date.now()) throw new Error('上次邮件领取结果待确认，稍后重试');
            visited.add(message.id);
            const ids = new Set(pendingAttachments(message).map(item => item.id));
            const receive = () => this.call('mail', 'claim.all', { messageId: message.id });
            let result;
            try { result = await receive(); } catch (error) {
                this.mailCooldowns.set(message.id, Date.now() + 120000); throw error;
            }
            const results = (Array.isArray(result?.results) ? result.results : [result]).filter(row => ids.has(row?.attachmentId));
            if (!results.length) throw new Error('邮件领取响应无法对应当前附件，已停止后续操作');
            if (results.some(row => row.status === 'skipped')) {
                // Only explicit no-space rejection permits a fresh-space/sale/retry path.
                // It is the required exception to claim-before-sale: nothing was received for these attachments.
                const needed = results.filter(row => row.status === 'skipped').length;
                if ((await this.allowed()).expeditionSaleMode === 'off') throw new Error('仓库空间不足，奖励尚未全部领取；出售模式为关闭');
                this.log('奖励领取因空间不足被拒绝；先腾出所需空间，再重新读取邮箱', 'warn');
                await this.sell({ requiredSpace: needed, forceFull: true });
                state = await this.call('mail', 'get.state');
                if (!Array.isArray(state?.messages)) throw new Error('刷新邮箱失败');
                const current = state.messages.find(row => row.id === message.id);
                const stillPending = pendingAttachments(current);
                if (stillPending.length) {
                    const retry = await receive();
                    const rows = (Array.isArray(retry?.results) ? retry.results : [retry]).filter(row => stillPending.some(item => item.id === row?.attachmentId));
                    if (!rows.length || rows.some(row => !['claimed', 'already-claimed', 'not-found'].includes(row.status)))
                        throw new Error('腾出空间后仍未确认全部奖励领取，本轮停止');
                }
            } else if (results.some(row => !['claimed', 'already-claimed', 'not-found'].includes(row.status))) {
                throw new Error('邮件返回未知领取结果，本轮停止');
            }
            state = await this.call('mail', 'get.state');
            if (!Array.isArray(state?.messages)) throw new Error('无法复核邮箱状态');
            if (pendingAttachments(state.messages.find(row => row.id === message.id)).some(item => ids.has(item.id))) {
                this.mailCooldowns.set(message.id, Date.now() + 120000);
                throw new Error('邮箱仍有待领取附件，已停止派遣');
            }
            claimed++;
            this.log(`远征奖励领取已确认：${message.title}`, 'success');
        }
        const message = claimed ? `已确认领取 ${claimed} 封远征奖励邮件` : '未发现未领取的远征奖励邮件';
        await this.store({ expeditionMailStatus: { message, updatedAt: Date.now() } });
        this.log(message);
    }
    async finishCompleted(exps, force = false) {
        let processed = false;
        for (const exp of exps) {
            if (!['COMPLETED', 'FAILED'].includes(exp.status)) continue;
            if (!force && !dispatchEnabled(await this.allowed())) continue;
            this.report('collecting', '正在处理已结束远征');
            const failed = ['DEATH', 'FAILURE', 'FAILED'].includes(exp.outcome) || exp.status === 'FAILED';
            const existingLoot = Array.isArray(exp.containerData) ? exp.containerData : exp.containerData?.items || exp.containerItems || [];
            const rewardContainer = exp.messages?.some(message => message.actionType === 'pay_and_open');
            if (failed && exp.hasInsurance) throw new Error('失败远征含保险赔付，请先在游戏中处理；未自动关闭以免损失奖励');
            if (failed && !existingLoot.length && !rewardContainer) {
                await this.call('expeditions', 'dismiss', { expeditionId: exp.id });
            } else {
                let current = exp;
                if (!exp.containerOpenedAt) current = await this.call('expeditions', 'open.container', { expeditionId: exp.id });
                if (!current?.id || current.id !== exp.id) throw new Error('奖励容器响应不匹配');
                const contents = Array.isArray(current.containerData) ? current.containerData : current.containerData?.items || current.containerItems || [];
                const needed = contents.length || 2;
                const stash = await this.stash();
                if (stashSpace(stash) !== null && stashSpace(stash) < needed) {
                    if ((await this.allowed()).expeditionSaleMode === 'off') throw new Error('仓库空间不足，暂停领取与派遣');
                    await this.sell({ requiredSpace: needed, forceFull: true });
                }
                await this.call('expeditions', 'collect.all', { expeditionId: exp.id });
            }
            const after = await this.expeditions();
            if (after.some(current => current.id === exp.id)) throw new Error('上轮远征尚未完成归档，暂停派遣；下次刷新复核');
            processed = true;
        }
        return processed;
    }
    async refreshMercs() {
        const markets = {}, configs = {}, prices = {};
        for (const market of ['core', 'usol']) {
            this.report('mercenaries', `正在刷新 ${market === 'core' ? 'CORE' : 'USOL'} 佣兵与实际费用`);
            try {
                const fresh = await this.call('expeditions', 'merc.refresh', { market });
                if (!fresh?.mercenaries || !fresh.config) throw new Error('佣兵刷新返回不完整');
                markets[market] = fresh.mercenaries;
                configs[market] = fresh.config;
                Object.assign(prices, fresh.prices);
                const keys = market === 'core' ? ['mercenariesData', 'expeditionConfigData', 'mercenariesUpdatedAt']
                    : ['usolMercenariesData', 'usolExpeditionConfigData', 'usolMercenariesUpdatedAt'];
                await this.store({ [keys[0]]: fresh.mercenaries, [keys[1]]: fresh.config, [keys[2]]: Date.now() });
            } catch (error) {
                if (market === 'core' || error.unknownOutcome || !expeditionEnabled(await this.settings())) throw error;
                this.log('USOL 佣兵刷新不可用，仅使用本轮确认的 CORE 佣兵：' + error.message, 'warn');
            }
        }
        await this.store({ mercConfigData: prices });
        return { markets, configs, prices };
    }
    async decisions(exps) {
        for (const exp of exps) for (const message of exp.messages || []) {
            const mods = (await this.allowed()).decisionModifiers;
            const opt = decisionChoice(message, exp, mods);
            if (!opt) continue;
            this.report('decision', `正在提交自动决策：${opt.label}（评分 ${opt.score}）`);
            await this.call('expeditions', 'respond.event', { expeditionId: exp.id, messageId: message.id, selectedOption: opt.id });
        }
    }
    async run(options = {}) {
        if (this.running) return false;
        this.running = true;
        this.activeToken = this.token;
        try {
            await this.allowed();
            let exps = await this.expeditions();
            if (options.manual) {
                const { room, action, data } = options.manual;
                if (room === 'stash') await this.stash();
                await this.call(room, action, data, { manual: true });
                exps = await this.expeditions();
            }
            if (options.readOnly) {
                await this.stash();
                if (options.mercs) await this.refreshMercs();
                const archive = await this.call('expeditions', 'get.archived', { cursor: null, limit: 20 });
                await this.store({ archivedExpeditionsData: archive, archivedExpeditionsUpdatedAt: Date.now() });
                const specialists = await this.call('specialists', 'get.state');
                await this.store({ specialistsData: specialists, specialistsDataUpdatedAt: Date.now() });
                this.report('idle', '远征信息已刷新');
                return true;
            }
            await this.decisions(exps);
            const finished = await this.finishCompleted(exps, options.collect === true);
            await this.claimMail();
            const stash = await this.sell();
            if (options.mercs || finished) {
                const archive = await this.call('expeditions', 'get.archived', { cursor: null, limit: 20 });
                await this.store({ archivedExpeditionsData: archive, archivedExpeditionsUpdatedAt: Date.now() });
            }
            let settings = await this.allowed();
            if (!dispatchEnabled(settings) || (!options.dispatch && !(finished && settings.autoSendMerc.enabled))) {
                if (options.mercs) await this.refreshMercs();
                this.report('idle', '本轮检查完成'); return true;
            }
            exps = await this.expeditions();
            if (exps.length) { this.report('active', '已有远征进行中或等待处理，本轮不重复派遣'); return true; }
            if (stashSpace(stash) === null || stashSpace(stash) < 1) throw new Error('仓库没有可确认的空位，暂停派遣');
            const { markets, configs, prices } = await this.refreshMercs();
            settings = await this.allowed();
            if (!dispatchEnabled(settings)) throw new Error('自动派遣已关闭');
            let selected = pickPeriodicMerc(markets, prices, settings.autoSendMerc);
            if (!selected) { this.report('waiting', '暂无符合费用与筛选条件的可用佣兵，等待下次检查'); return true; }
            if ((await this.expeditions()).length) { this.report('active', '检测到新远征，取消重复派遣'); return true; }
            settings = await this.allowed();
            if (!dispatchEnabled(settings)) throw new Error('自动派遣已关闭');
            selected = pickPeriodicMerc(markets, prices, settings.autoSendMerc);
            if (!selected) throw new Error('佣兵筛选条件已更改，本轮停止');
            const config = { mercenaryId: selected.id, marketId: selected.market === 'core' ? CORE_MERC_MARKET : USOL_MERC_MARKET,
                ...chooseLocation(configs[selected.market]), hasInsurance: false };
            this.report('launching', `正在派遣 ${selected.callsign}，费用 ${selected.cost.toLocaleString()} CR；等待服务器确认`);
            const expedition = await this.call('expeditions', 'launch.confirmed', config);
            if (!expedition?.id || expedition.mercenary?.id !== selected.id) throw new Error('派遣响应无法对应所选佣兵，结果待确认');
            await this.store({ expeditionsData: [expedition], expeditionsDataUpdatedAt: Date.now(), lastExpeditionLaunchData: config,
                lastExpeditionDispatchAt: Date.now() });
            this.report('active', `派遣成功：${selected.callsign}`, { lastDispatchAt: Date.now() });
            this.log(`服务器已确认远征 ${expedition.id}`, 'success');
            return true;
        } catch (error) {
            this.report('error', '本轮停止：' + error.message);
            return false;
        } finally { this.running = false; }
    }
    cancel() { this.token++; }
}
