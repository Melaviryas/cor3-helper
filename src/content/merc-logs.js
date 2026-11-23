import { isContextValid } from './helpers.js';
import { mercLog } from '../shared/merc-log.js';

const pending = [];
let timer = null;
let flushing = false;

async function flush() {
    timer = null;
    if (flushing || !pending.length || !isContextValid()) return;
    flushing = true;
    const batch = pending.splice(0);
    try {
        const data = await chrome.storage.local.get('mercDebugLogs');
        const logs = Array.isArray(data.mercDebugLogs) ? data.mercDebugLogs : [];
        await chrome.storage.local.set({ mercDebugLogs: [...logs, ...batch].slice(-200) });
    } catch { /* An extension reload must not interrupt the game. */ }
    finally {
        flushing = false;
        if (pending.length && isContextValid()) timer = setTimeout(flush, 100);
    }
}

window.addEventListener('message', event => {
    if (event.source !== window || event.data?.type !== 'COR3_MERC_LOG' || !isContextValid()) return;
    const data = event.data;
    if (typeof data.msg !== 'string') return;
    pending.push({
        timestamp: Number.isFinite(Date.parse(data.timestamp)) ? data.timestamp : new Date().toISOString(),
        msg: data.msg.slice(0, 2000),
        level: ['info', 'success', 'warn', 'error'].includes(data.level) ? data.level : 'info'
    });
    if (pending.length > 200) pending.splice(0, pending.length - 200);
    if (!timer && !flushing) timer = setTimeout(flush, 100);
});

function logSettings(settings) {
    const merc = settings.autoSendMerc || {};
    const yes = value => value ? '开' : '关';
    const modes = { off: '关闭', full: '仓库满出售', 'non-drone': '出售非无人机', all: '全出售' };
    mercLog('远征设置：总开关=' + yes(settings.expeditionModuleEnabled)
        + '；结束后派遣=' + yes(merc.enabled) + '；30 分钟检查=' + yes(settings.periodicMercDispatchEnabled)
        + '；选择最便宜=' + yes(merc.autoChooseMerc) + '；USOL 优先=' + yes(merc.autoChooseUsolFirst)
        + '；排除精英=' + yes(merc.ignoreEliteMerc) + '；费用上限=' + (merc.applyMercCostLimiter ? merc.maxMercCost : '关闭')
        + '；已选=' + (merc.mercenaryName || '未选择') + '；出售=' + (modes[settings.expeditionSaleMode] || '关闭')
        + '；自动领取=' + yes(settings.autoClaimExpeditionMail));
}
const settingKeys = ['expeditionModuleEnabled', 'expeditionSaleMode', 'autoSendMerc', 'autoClaimExpeditionMail', 'periodicMercDispatchEnabled', 'helperMode'];
chrome.storage.sync.get(settingKeys, logSettings);
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && settingKeys.some(key => changes[key]) && isContextValid()) {
        chrome.storage.sync.get(settingKeys, logSettings);
    }
});
