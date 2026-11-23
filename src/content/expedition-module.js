import { ExpeditionWorkflow } from '../shared/expedition-workflow.js';
import { EXPEDITION_KEYS, normalizeExpeditionSettings, expeditionEnabled, dispatchEnabled } from '../shared/expedition-settings.js';
import { mercLog } from '../shared/merc-log.js';
import { isContextValid, _automationEnqueue, _automationFinish, getAutomationQueue,
    setAutomationQueue, _broadcastQueueStatus } from './helpers.js';

const TYPE = 'expedition-workflow';
let settings = {}, ready = false, queued = false, starting = false, pending = null, lastRun = 0, retryAt = 0, updating = Promise.resolve();
let bridgeConfig = '', serial = 0, rerun = false, lastExpSignature = '';
function report(value) {
    if (isContextValid()) chrome.storage.local.set({ expeditionModuleStatus: value,
        ...(['waiting', 'active', 'launching'].includes(value.phase) ? { expeditionDispatchStatus: value } : {}) });
}
function waitReply(type, requestId, timeout, trigger) {
    return new Promise((resolve, reject) => {
        const clean = () => { clearTimeout(timer); window.removeEventListener('message', listener); };
        const listener = event => {
            if (event.source !== window) return;
            if (event.data?.type === 'COR3_TOKEN_EXPIRED') { clean(); reject(new Error('游戏会话已过期，等待重新连接')); return; }
            if (event.data?.type !== type || event.data.requestId !== requestId) return;
            clean();
            if (event.data.error) reject(new Error(event.data.error));
            else resolve(event.data.data);
        };
        const timer = setTimeout(() => { clean(); reject(new Error('游戏响应超时，请刷新游戏后检查')); }, timeout);
        window.addEventListener('message', listener);
        trigger();
    });
}
async function readSettings() {
    settings = normalizeExpeditionSettings(await chrome.storage.sync.get(EXPEDITION_KEYS));
    return settings;
}
async function syncBridge() {
    await readSettings();
    const merc = settings.autoSendMerc;
    const config = { enabled: expeditionEnabled(settings), saleMode: settings.expeditionSaleMode,
        claimMail: settings.autoClaimExpeditionMail, dispatch: dispatchEnabled(settings),
        costLimited: !!merc.applyMercCostLimiter, maxMercCost: merc.maxMercCost };
    const json = JSON.stringify(config);
    if (json === bridgeConfig) return;
    const requestId = 'config-' + (++serial);
    await waitReply('COR3_EXPEDITION_MODULE_READY', requestId, 5000, () => {
        window.postMessage({ type: 'COR3_EXPEDITION_MODULE_CONFIG', requestId, config }, '*');
    });
    bridgeConfig = json;
}
const workflow = new ExpeditionWorkflow({
    rpc: (room, action, data, options) => {
        const requestId = 'exp-' + Date.now() + '-' + (++serial);
        const timeout = action === 'merc.refresh' ? 115000 : action === 'launch.confirmed' ? 140000 : 30000;
        return waitReply('COR3_EXPEDITION_RPC_RESULT', requestId, timeout, () => {
            window.postMessage({ type: 'COR3_EXPEDITION_RPC', requestId, room, action, data, options }, '*');
        });
    },
    settings: readSettings,
    store: values => chrome.storage.local.set(values),
    status: value => report(value),
    log: (message, level) => mercLog(message, level)
});

async function request(options = {}) {
    if (!isContextValid()) return { success: false, message: '扩展已重载，请刷新游戏' };
    await updating;
    await readSettings();
    if (!expeditionEnabled(settings)) return { success: false, message: '远征模块已暂停' };
    if (!ready) { report({ phase: 'waiting', message: '等待游戏初始刷新完成', updatedAt: Date.now() }); return { success: false, message: '等待游戏初始刷新完成' }; }
    if (workflow.running || starting) return { success: false, message: '远征流程正在执行，请稍后检查日志' };
    if (Date.now() < retryAt && !options.manualRequest) return { success: false, message: '等待重试冷却' };
    if (queued) {
        if (options.manual) return { success: false, message: '远征操作已排队，请稍后重试' };
        pending = { ...pending, ...options, dispatch: !!(pending.dispatch || options.dispatch),
            mercs: !!(pending.mercs || options.mercs), readOnly: !!(pending.readOnly && options.readOnly) };
        return { success: true, message: '已合并到等待中的远征检查' };
    }
    queued = true; pending = options;
    report({ phase: 'queued', message: '远征检查已排队，等待当前任务完成', updatedAt: Date.now() });
    _automationEnqueue(TYPE, async () => {
        starting = true;
        const runOptions = pending || {};
        queued = false; pending = null;
        try {
            await syncBridge();
            if (!expeditionEnabled(settings)) return;
            lastRun = Date.now();
            const success = await workflow.run(runOptions);
            retryAt = success ? 0 : Date.now() + 60000;
        } catch (error) {
            retryAt = Date.now() + 60000;
            report({ phase: 'error', message: error.message, updatedAt: Date.now() });
            mercLog('远征检查失败：' + error.message, 'error');
        } finally {
            starting = false;
            _automationFinish(TYPE);
            if (rerun) { rerun = false; setTimeout(() => request({ dispatch: true }), 1000); }
        }
    });
    return { success: true, message: '已请求远征检查，请查看运行摘要与日志' };
}

async function initialize() {
    const data = await chrome.storage.sync.get([...EXPEDITION_KEYS, 'selectiveLootSellEnabled', 'autoSellCheapest']);
    const defaults = {};
    if (data.expeditionModuleEnabled === undefined) defaults.expeditionModuleEnabled = false;
    if (data.expeditionSaleMode === undefined) defaults.expeditionSaleMode = data.selectiveLootSellEnabled ? 'non-drone' : data.autoSellCheapest ? 'full' : 'off';
    if (Object.keys(defaults).length) await chrome.storage.sync.set(defaults);
    await syncBridge();
    if (!expeditionEnabled(settings)) report({ phase: 'paused', message: '远征模块已暂停；AutoJobs 不受影响', updatedAt: Date.now() });
}
updating = initialize().catch(error => mercLog('远征模块初始化失败：' + error.message, 'error'));

chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync' || !EXPEDITION_KEYS.some(key => changes[key])) return;
    if (changes.expeditionModuleEnabled?.newValue === false || changes.helperMode?.newValue === true) workflow.cancel();
    updating = updating.then(async () => {
        await syncBridge();
        if (!expeditionEnabled(settings)) {
            queued = false; pending = null; rerun = false;
            setAutomationQueue(getAutomationQueue().filter(task => task.type !== TYPE));
            _broadcastQueueStatus();
            report({ phase: 'paused', message: '远征模块已暂停；已发出的操作等待服务器结果', updatedAt: Date.now() });
        } else if (workflow.running) rerun = true;
        else setTimeout(() => request({ dispatch: true, mercs: changes.expeditionModuleEnabled?.newValue === true, manualRequest: true }), 0);
    }).catch(error => mercLog('远征设置更新失败：' + error.message, 'error'));
});

window.addEventListener('message', event => {
    if (event.source !== window || !isContextValid()) return;
    const message = event.data;
    if (message?.type === 'COR3_INITIAL_FETCH_DONE') {
        ready = true;
        chrome.runtime.sendMessage({ action: 'periodicMercReady' }).catch(() => {});
        request({ dispatch: true, mercs: true }).catch(() => {});
    }
    if (message?.type === 'COR3_TOKEN_EXPIRED') { ready = false; workflow.cancel(); bridgeConfig = ''; }
    if (message?.type === 'COR3_WS_EXPEDITIONS') {
        const signature = JSON.stringify((message.expeditions || []).map(exp => [exp.id, exp.status, exp.containerOpenedAt]));
        if (signature === lastExpSignature) return;
        lastExpSignature = signature;
        if (workflow.running || queued || !expeditionEnabled(settings)) return;
        const completed = message.expeditions?.some(exp => ['COMPLETED', 'FAILED'].includes(exp.status));
        if (completed && dispatchEnabled(settings)) request({ dispatch: !!settings.autoSendMerc.enabled }).catch(() => {});
    }
});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
    let options;
    if (message.action === 'periodicMercDispatch') options = { dispatch: true };
    if (message.action === 'expeditionCheckNow') options = { dispatch: true, manualRequest: true };
    if (message.action === 'checkExpeditionMail') options = { manualRequest: true };
    if (message.action === 'expeditionRefresh') options = { readOnly: true, mercs: message.mercs !== false, manualRequest: true };
    if (message.action === 'expeditionManualDecision') options = { manual: { room: 'expeditions', action: 'respond.event', data: message.data }, manualRequest: true };
    if (message.action === 'expeditionCollectNow') options = { collect: true, manualRequest: true };
    if (message.action === 'expeditionManualSell') options = { manual: { room: 'stash', action: 'sell.item', data: { itemId: message.itemId, quantity: 1 } }, manualRequest: true };
    if (message.action === 'expeditionExtendStash') options = { manual: { room: 'specialists', action: 'purchase', data: message.data }, manualRequest: true };
    if (!options) return;
    request(options).then(respond).catch(error => respond({ success: false, message: error.message }));
    return true;
});

// Housekeeping observes completion/decisions/mail. Only the 30-minute alarm or an end/enable event requests idle dispatch.
setInterval(() => {
    if (ready && expeditionEnabled(settings) && Date.now() - lastRun >= 55000) request({}).catch(() => {});
}, 60000);
