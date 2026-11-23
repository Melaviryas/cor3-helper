import { wsSend, joinRoom } from './ws-send.js';
import { OrigWebSocket, trackedSockets, USOL_SERVER_ID } from './state.js';
import { cancelMercenaryFetches } from './expeditions.js';
import { canSellExpeditionItem, itemQuantity } from '../shared/expedition-sale-policy.js';
import { isExpeditionMail } from '../shared/expedition-mail-policy.js';

let config = { enabled: false, saleMode: 'off' }, revision = 0, publicBusy = false;
let latestStash = null, latestMail = null;
const waiters = new Set();
const reads = new Set(['expeditions:get.active', 'expeditions:get.archived', 'stash:get.state', 'mail:get.state', 'specialists:get.state']);
const writes = new Set(['expeditions:respond.event', 'expeditions:open.container', 'expeditions:collect.all', 'expeditions:dismiss',
    'stash:sell.item', 'mail:claim.all', 'specialists:purchase']);
const online = () => trackedSockets.some(socket => socket.readyState === OrigWebSocket.OPEN);
const enabled = () => config.enabled === true && online();

export function relayExpeditionModule(room, payload) {
    const action = payload?.event?.action;
    if (room === 'stash' && Array.isArray(payload?.data?.items)) latestStash = payload.data;
    if (room === 'mail' && Array.isArray(payload?.data?.messages)) latestMail = payload.data;
    for (const waiter of [...waiters]) if (waiter.room === room && waiter.action === action) waiter.receive(payload);
}

function direct(room, action, data = {}, guard = () => enabled(), timeout = 25000) {
    return new Promise((resolve, reject) => {
        if (!guard()) { reject(new Error('远征模块已暂停或游戏连接已断开')); return; }
        const clean = () => { clearTimeout(timer); waiters.delete(waiter); };
        const waiter = { room, action, receive(payload) {
            if (data.expeditionId && payload.data?.id && payload.data.id !== data.expeditionId) return;
            clean();
            if (payload.error) reject(new Error(payload.error.message || payload.error.key || '服务器拒绝操作'));
            else resolve(payload.data);
        } };
        const timer = setTimeout(() => { clean(); reject(new Error('服务器响应超时，结果待确认')); }, timeout);
        waiters.add(waiter);
        wsSend('42' + JSON.stringify(['event', { event: { name: room, action }, data }]), guard);
    });
}

function refreshMercs(market, runGuard) {
    return new Promise((resolve, reject) => {
        const guard = () => !settled && runGuard();
        let mercenaries = null, configData = null;
        const prices = {};
        let settled = false;
        const clean = () => {
            clearTimeout(timer); window.removeEventListener('message', listener);
            if (window.__cor3ExpeditionMercGuard === guard) window.__cor3ExpeditionMercGuard = null;
            cancelMercenaryFetches();
        };
        const done = error => {
            if (settled) return;
            const allowed = guard();
            settled = true; clean();
            if (error) reject(error);
            else if (!allowed) reject(new Error('远征设置已更改，佣兵刷新已取消'));
            else if (!mercenaries || !configData) reject(new Error('佣兵刷新未返回本轮完整数据'));
            else resolve({ mercenaries, config: configData, prices });
        };
        const listener = event => {
            if (event.source !== window) return;
            const message = event.data;
            if (message?.type === 'COR3_EXPEDITION_MODULE_CONFIG' && !guard()) { done(new Error('远征模块或设置已更改')); return; }
            if (message?.type === (market === 'core' ? 'COR3_WS_MERCENARIES' : 'COR3_WS_USOL_MERCENARIES')) mercenaries = message.data;
            if (message?.type === (market === 'core' ? 'COR3_WS_EXPEDITION_CONFIG' : 'COR3_WS_USOL_EXPEDITION_CONFIG')) configData = message.data;
            if (message?.type === 'COR3_WS_MERC_CONFIGURE' && message.mercenaryId && Number.isFinite(message.data?.totalCost)) prices[message.mercenaryId] = message.data;
            if (market === 'usol' && message?.type === 'COR3_WS_USOL_MARKET_UNREACHABLE' && message.cached)
                done(new Error('USOL 路径处于维护或不可达'));
        };
        const timer = setTimeout(() => done(new Error('佣兵刷新超时，未使用旧缓存')), 110000);
        window.addEventListener('message', listener);
        window.__cor3ExpeditionMercGuard = guard;
        window.__cor3PendingMercConfigures = [];
        if (market === 'core') window.__cor3RequestMercenaries('019d3ea4-85bd-7389-904d-8f7c85841134', error => done(error));
        else window.__cor3RequestUsolMercenaries(error => done(error));
    });
}

window.addEventListener('message', async event => {
    if (event.source !== window) return;
    const command = event.data;
    if (command?.type === 'COR3_EXPEDITION_MODULE_CONFIG') {
        config = command.config || { enabled: false, saleMode: 'off' };
        revision++;
        window.postMessage({ type: 'COR3_EXPEDITION_MODULE_READY', requestId: command.requestId }, '*');
        return;
    }
    if (command?.type !== 'COR3_EXPEDITION_RPC' || typeof command.requestId !== 'string') return;
    const reply = (data, error) => window.postMessage({ type: 'COR3_EXPEDITION_RPC_RESULT', requestId: command.requestId, data, error }, '*');
    if (publicBusy) { reply(null, '远征任务正在执行，请稍后重试'); return; }
    if (!enabled()) { reply(null, '远征模块未启用或游戏连接已断开'); return; }
    const runRevision = revision;
    let runActive = true;
    const guard = () => runActive && enabled() && revision === runRevision;
    publicBusy = true;
    try {
        const { room, action, data = {}, options = {} } = command;
        if (room === 'expeditions' && action === 'merc.refresh') {
            if (!['core', 'usol'].includes(data.market)) throw new Error('未知佣兵市场');
            reply(await refreshMercs(data.market, guard));
            return;
        }
        if (room === 'expeditions' && action === 'launch.confirmed') {
            if (!config.dispatch) throw new Error('自动派遣已关闭');
            if (!data.mercenaryId || !data.locationConfigId || !data.zoneConfigId || !data.goalId) throw new Error('派遣参数不完整');
            if (data.marketId === '019e4065-6ae8-760d-8724-58ab4f2cf7d7')
                await direct('network-map', 'set.endpoint', { serverId: USOL_SERVER_ID }, guard);
            const price = await direct('expeditions', 'configure', data, guard);
            if (!Number.isFinite(price?.totalCost) || price.totalCost < 0) throw new Error('无法确认佣兵最新费用');
            if (config.costLimited && price.totalCost > config.maxMercCost) throw new Error('最新费用超过上限，未派遣');
            if (!guard() || !config.dispatch) throw new Error('自动派遣已暂停');
            const fresh = await direct('expeditions', 'get.active', {}, guard);
            if (!Array.isArray(fresh) || fresh.length) throw new Error('已有远征或状态无法确认，未派遣');
            reply(await direct('expeditions', 'launch', data, guard, 75000));
            return;
        }
        const key = room + ':' + action;
        if (!reads.has(key) && !writes.has(key)) throw new Error('不支持的远征操作');
        if (key === 'stash:sell.item') {
            const item = latestStash?.items?.find(item => item.id === data.itemId);
            const qualifies = options.manual === true
                ? item?.canSell === true && !item.locked && !item.pinned && !item.isLocked && !item.isPinned
                : config.saleMode === options.saleMode && canSellExpeditionItem(item, config.saleMode);
            if (!qualifies || (options.manual !== true && item.itemConfigId !== options.itemConfigId)
                || !Number.isSafeInteger(data.quantity)
                || data.quantity < 1 || data.quantity > itemQuantity(item)) throw new Error('该物品不符合当前出售策略');
        }
        if (key === 'mail:claim.all') {
            if (!config.claimMail || !isExpeditionMail(latestMail?.messages?.find(mail => mail.id === data.messageId)))
                throw new Error('自动领取未开启或未确认是远征奖励邮件');
        }
        if (key === 'specialists:purchase' && options.manual !== true) throw new Error('仓库续租仅允许手动操作');
        if (room === 'expeditions' && ['open.container', 'collect.all', 'dismiss'].includes(action) && !data.expeditionId)
            throw new Error('缺少远征编号');
        if (reads.has(key) && room !== 'specialists') joinRoom(room);
        reply(await direct(room, action, data, guard));
    } catch (error) { reply(null, error.message || '远征操作失败'); }
    finally { runActive = false; publicBusy = false; }
});
