import { getCor3Tab } from './utils.js';
import { state as popupState } from './state.js';
import { savePinnedState, renderPinnedTimers } from './pinned-timers.js';
import { EXPEDITION_KEYS, SALE_MODES, normalizeExpeditionSettings, expeditionEnabled, saleModeLabel } from '../shared/expedition-settings.js';
import { DRONE_MATERIALS } from '../shared/selective-loot-policy.js';
import { itemQuantity, isDroneMaterial, lootName } from '../shared/expedition-sale-policy.js';
import { mercList } from '../shared/expedition-workflow.js';

const byId = id => document.getElementById(id);
const root = byId('expeditionsSection');
let settings = normalizeExpeditionSettings(), cache = {};
const localKeys = ['expeditionsData', 'expeditionsDataUpdatedAt', 'expeditionDecisions', 'mercenariesData', 'usolMercenariesData',
    'mercConfigData', 'mercenariesUpdatedAt', 'usolMercenariesUpdatedAt', 'stashData', 'stashDataUpdatedAt', 'specialistsData',
    'archivedExpeditionsData', 'archivedExpeditionsUpdatedAt', 'expeditionModuleStatus', 'expeditionDispatchStatus', 'expeditionMailStatus',
    'expeditionSaleStatus', 'periodicMercNextCheckAt', 'periodicMercDispatchStatus', 'lastExpeditionDispatchAt', 'mercDebugLogs'];
const toggleSettings = {
    autoSendMercenaryToggle: ['autoSendMerc', 'enabled'], applyMercCostLimiterToggle: ['autoSendMerc', 'applyMercCostLimiter'],
    autoChooseMercToggle: ['autoSendMerc', 'autoChooseMerc'], autoChooseUsolFirstToggle: ['autoSendMerc', 'autoChooseUsolFirst'],
    ignoreEliteMercToggle: ['autoSendMerc', 'ignoreEliteMerc'], periodicMercDispatchToggle: ['periodicMercDispatchEnabled'],
    autoClaimExpeditionMailToggle: ['autoClaimExpeditionMail'], autoChooseCheckbox: ['decisionModifiers', 'autoChoose'],
    noWaitAutoChooseCheckbox: ['decisionModifiers', 'noWaitAutoChoose'], modifiersEnabledToggle: ['decisionModifiers', 'enabled'],
    getRidOfVeteransToggle: ['decisionModifiers', 'getRidOfVeterans']
};
function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
}
function remaining(end) {
    const ms = new Date(end).getTime() - Date.now();
    if (!Number.isFinite(ms)) return '时间未知';
    if (ms <= 0) return '等待状态刷新';
    const minutes = Math.ceil(ms / 60000), hours = Math.floor(minutes / 60);
    return (hours ? hours + ' 小时 ' : '') + minutes % 60 + ' 分钟';
}
const number = value => Number.isFinite(value) ? value.toLocaleString() : '--';
const names = { RUNNING: 'Running', IN_PROGRESS: 'Running', EVENT: 'Awaiting decision', COMPLETED: 'Completed', FAILED: 'Failed',
    AVAILABLE: 'Available', RESTING: 'Resting', CONTRACTED: 'Contracted', VETERAN: 'Veteran', RECRUIT: 'Recruit', EXPERIENCED: 'Experienced',
    FULL_SUCCESS: 'Full success', SUCCESS: 'Success', PARTIAL_SUCCESS: 'Partial success', FAILURE: 'Failure', DEATH: 'Death',
    COMMON: 'Common', UNCOMMON: 'Uncommon', RARE: 'Rare', EPIC: 'Epic', LEGENDARY: 'Legendary', QUEST: 'Quest' };
const translated = value => names[String(value).toUpperCase()] || value || '未知';
function detail(label, value) { return node('div', 'detail-row', label + '：' + value); }
function actionButton(text, action, data) {
    const button = node('button', 'refresh-btn-small', text);
    button.type = 'button'; button.dataset.expAction = '';
    button.disabled = !expeditionEnabled(settings);
    button.addEventListener('click', () => send(action, data, button));
    return button;
}
async function send(action, data = {}, button) {
    if (button) button.disabled = true;
    try {
        const tab = await getCor3Tab();
        if (!tab) throw new Error('请先打开 cor3.gg 游戏标签页');
        const result = await chrome.tabs.sendMessage(tab.id, { action, ...data });
        byId('expeditionActionStatus').textContent = result?.message || '请求已发送，请查看日志';
    } catch (error) { byId('expeditionActionStatus').textContent = '无法连接游戏：' + error.message + '；更新扩展后请刷新游戏。'; }
    finally { if (button) button.disabled = !expeditionEnabled(settings); }
}
async function saveMerc(patch) {
    const data = await chrome.storage.sync.get('autoSendMerc');
    const autoSendMerc = { ...(data.autoSendMerc || {}), ...patch };
    if (patch.enabled === true) autoSendMerc.disabledReason = null;
    await chrome.storage.sync.set({ autoSendMerc });
}
for (const [id, path] of Object.entries(toggleSettings)) {
    byId(id).addEventListener('change', async () => {
        const checked = byId(id).checked;
        if (path[0] === 'autoSendMerc') await saveMerc({ [path[1]]: checked });
        else if (path[0] === 'decisionModifiers') {
            const { decisionModifiers = {} } = await chrome.storage.sync.get('decisionModifiers');
            await chrome.storage.sync.set({ decisionModifiers: { loot: 1, risk: -5, ...decisionModifiers, [path[1]]: checked } });
        } else await chrome.storage.sync.set({ [path[0]]: checked });
    });
}
byId('expeditionModuleToggle').addEventListener('change', () => {
    chrome.storage.sync.set({ expeditionModuleEnabled: byId('expeditionModuleToggle').checked });
});
byId('saveMercCostBtn').addEventListener('click', async () => {
    const value = Number(byId('maxMercCostInput').value);
    if (!Number.isFinite(value) || value < 0) { byId('expeditionActionStatus').textContent = '费用上限必须是非负数字'; return; }
    await saveMerc({ maxMercCost: Math.floor(value) });
    byId('expeditionActionStatus').textContent = '佣兵费用上限已保存';
});
byId('saveDecisionModifiersBtn').addEventListener('click', async () => {
    const loot = Number(byId('lootModifier').value), risk = Number(byId('riskModifier').value);
    if (!Number.isFinite(loot) || !Number.isFinite(risk)) { byId('expeditionActionStatus').textContent = '评分权重必须是数字'; return; }
    const { decisionModifiers = {} } = await chrome.storage.sync.get('decisionModifiers');
    await chrome.storage.sync.set({ decisionModifiers: { ...decisionModifiers, loot, risk } });
    byId('expeditionActionStatus').textContent = '决策权重已保存';
});
for (const mode of SALE_MODES) {
    byId('expSale_' + mode.value).addEventListener('change', async () => {
        const selected = byId('expSale_' + mode.value).checked ? mode.value : 'off';
        // Render synchronously so there is never a frame with two active switches.
        settings.expeditionSaleMode = selected; renderSettings();
        await chrome.storage.sync.set({ expeditionSaleMode: selected });
    });
}
for (const [id, action, data] of [
    ['refreshExpeditionBtn', 'expeditionRefresh', { mercs: false }], ['refreshMercenariesBtn', 'expeditionRefresh', { mercs: true }],
    ['refreshInventoryBtn', 'expeditionRefresh', { mercs: false }], ['refreshArchivedBtn', 'expeditionRefresh', { mercs: false }],
    ['checkExpeditionMailBtn', 'checkExpeditionMail'], ['expeditionCheckNowBtn', 'expeditionCheckNow']
]) byId(id).addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); send(action, data, byId(id)); });

// Native details keep keyboard navigation and contain their own complete bodies.
for (const panel of root.querySelectorAll('details.exp-panel')) {
    const key = 'expeditionPanel_' + panel.id, defaultOpen = panel.hasAttribute('open');
    let restoring = true;
    chrome.storage.local.get(key, data => { panel.open = data[key] ?? defaultOpen; setTimeout(() => { restoring = false; }, 0); });
    panel.addEventListener('toggle', () => { if (!restoring) chrome.storage.local.set({ [key]: panel.open }); });
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes[key] && panel.open !== changes[key].newValue) panel.open = !!changes[key].newValue;
    });
}

function renderSettings() {
    byId('expeditionModuleToggle').checked = settings.expeditionModuleEnabled;
    for (const [id, path] of Object.entries(toggleSettings)) {
        let value = path.length === 1 ? settings[path[0]] : settings[path[0]]?.[path[1]];
        if (id === 'modifiersEnabledToggle') value = value !== false;
        byId(id).checked = !!value;
    }
    if (document.activeElement !== byId('maxMercCostInput')) byId('maxMercCostInput').value = settings.autoSendMerc.maxMercCost;
    if (document.activeElement !== byId('lootModifier')) byId('lootModifier').value = settings.decisionModifiers?.loot ?? 1;
    if (document.activeElement !== byId('riskModifier')) byId('riskModifier').value = settings.decisionModifiers?.risk ?? -5;
    for (const mode of SALE_MODES) byId('expSale_' + mode.value).checked = settings.expeditionSaleMode === mode.value;
    byId('expeditionSaleModeBadge').textContent = saleModeLabel(settings.expeditionSaleMode) + (expeditionEnabled(settings) ? '' : ' · 已暂停');
    byId('selectedMercenaryName').textContent = settings.autoSendMerc.mercenaryName || (settings.autoSendMerc.autoChooseMerc ? '按费用与筛选条件自动选择' : '未选择');
    root.querySelectorAll('[data-exp-action]').forEach(button => { button.disabled = !expeditionEnabled(settings); });
    byId('checkExpeditionMailBtn').disabled = !expeditionEnabled(settings) || !settings.autoClaimExpeditionMail;
    renderSummary();
}

function renderSummary() {
    const enabled = expeditionEnabled(settings), status = cache.expeditionModuleStatus;
    const exps = Array.isArray(cache.expeditionsData) ? cache.expeditionsData : [];
    const exp = exps.find(exp => !['COMPLETED', 'FAILED'].includes(exp.status));
    let text;
    if (!settings.expeditionModuleEnabled) text = '已暂停 · 开启总开关后恢复已保存的远征设置';
    else if (settings.helperMode) text = '已暂停 · Helper-Only 模式正在禁用自动操作';
    else if (status?.phase === 'error') text = status.message;
    else if (['queued', 'collecting', 'claiming', 'selling', 'launching', 'mercenaries', 'decision'].includes(status?.phase)) text = status.message;
    else if (exp) text = `${translated(exp.status)} · ${exp.mercenary?.callsign || '佣兵未知'}${exp.endTime ? ' · 剩余 ' + remaining(exp.endTime) : ''}`;
    else text = ((settings.autoSendMerc.enabled || settings.periodicMercDispatchEnabled) && cache.expeditionDispatchStatus?.message)
        || status?.message || '等待游戏数据 · 开启子功能后按设置运行';
    byId('expeditionSummary').textContent = text;
    const next = cache.periodicMercNextCheckAt;
    let nextText = !enabled ? '定时检查已暂停（设置已保留）' : settings.periodicMercDispatchEnabled && next
        ? '下次派遣检查：' + new Date(next).toLocaleTimeString('zh-CN', { hour12: false }) + ' · ' + remaining(next)
        : enabled && settings.periodicMercDispatchEnabled ? '正在建立 30 分钟检查计划' : '30 分钟检查未开启';
    if (cache.lastExpeditionDispatchAt) nextText += ' · 上次派遣 ' + new Date(cache.lastExpeditionDispatchAt).toLocaleTimeString('zh-CN', { hour12: false });
    byId('expeditionNextCheck').textContent = nextText;
    byId('periodicMercDispatchStatus').textContent = !enabled ? '远征模块已暂停' : status?.message || '等待首次检查';
    byId('periodicMercDispatchSchedule').textContent = nextText;
    byId('expeditionMailStatus').textContent = !enabled ? '远征模块已暂停，邮件设置已保留' : !settings.autoClaimExpeditionMail ? '自动领取已关闭' : cache.expeditionMailStatus?.message || '等待检查远征奖励邮件';
    byId('expeditionSaleStatus').textContent = !enabled ? '远征模块已暂停，出售模式已保留' : settings.expeditionSaleMode === 'off' ? '不自动出售' : cache.expeditionSaleStatus?.message || '等待检查仓库';
    root.querySelectorAll('[data-exp-end]').forEach(element => { element.textContent = remaining(element.dataset.expEnd); });
}

function renderActive() {
    const container = byId('expeditionInfoContainer'); container.replaceChildren();
    const exps = Array.isArray(cache.expeditionsData) ? cache.expeditionsData : [];
    if (!exps.length) container.appendChild(node('div', 'no-decisions', '当前没有远征。'));
    for (const exp of exps) {
        const card = node('div', 'expedition-card');
        const header = node('div', 'exp-header');
        header.append(node('span', 'exp-title', `📍 ${exp.locationName || '地点未知'} — ${exp.zoneName || '区域未知'}`), node('span', 'exp-status', translated(exp.status)));
        card.append(header, detail('佣兵', exp.mercenary?.callsign || '未知'), detail('总费用', number(exp.totalCost) + ' CR'),
            detail('保险', exp.hasInsurance ? '有' : '无'), detail('风险评分', exp.riskScore ?? '--'));
        if (exp.endTime) {
            popupState.expeditionEndTimes[exp.id] = exp.endTime;
            const row = node('div', 'exp-timer-row'), timer = node('span', 'exp-timer', remaining(exp.endTime));
            timer.dataset.expEnd = exp.endTime;
            const pin = node('button', 'refresh-btn-small pin-btn', '📌'); pin.title = '固定远征倒计时'; pin.type = 'button';
            pin.classList.toggle('pinned', !!popupState.pinnedTimers['exp_' + exp.id]);
            pin.addEventListener('click', async () => {
                popupState.pinnedTimers['exp_' + exp.id] = !popupState.pinnedTimers['exp_' + exp.id];
                await savePinnedState(); renderPinnedTimers(); renderActive();
            }); row.append(timer, pin); card.append(row);
        }
        const items = Array.isArray(exp.containerData) ? exp.containerData : exp.containerData?.items || [];
        for (const item of items) card.append(detail('奖励', `${item.name || item.item?.name || '未知物品'} ×${item.quantity ?? 1}`));
        const pay = exp.messages?.find(message => message.actionType === 'pay_and_open');
        if (pay && !exp.containerOpenedAt) card.append(detail('容器开启费用', number(pay.actionData?.cost) + ' CR'));
        if (['COMPLETED', 'FAILED'].includes(exp.status)) card.append(actionButton('处理本轮奖励', 'expeditionCollectNow'));
        container.append(card);
    }
    byId('expeditionLastUpdated').textContent = cache.expeditionsDataUpdatedAt ? '状态更新时间：' + new Date(cache.expeditionsDataUpdatedAt).toLocaleTimeString('zh-CN', { hour12: false }) : '尚未读取服务器状态';
    renderDecisions(exps);
}
function renderDecisions(exps) {
    const container = byId('decisionsContainer'); container.replaceChildren();
    const decisions = exps.flatMap(exp => (exp.messages || []).filter(message => Array.isArray(message.decisionOptions)).map(message => ({ ...message, expedition: exp })));
    const pending = decisions.filter(message => !message.isResolved);
    byId('decisionsCount').textContent = pending.length ? `${pending.length} 项待处理` : '无待处理';
    if (!decisions.length) container.append(node('div', 'no-decisions', '没有待处理的决策。'));
    for (const message of decisions) {
        const card = node('div', 'decision-card');
        card.append(detail('佣兵', message.expedition.mercenary?.callsign || '未知'), node('div', 'msg-content', message.content || ''));
        if (message.decisionDeadline) { const timer = detail('决策剩余时间', remaining(message.decisionDeadline)); card.append(timer); }
        for (const opt of message.decisionOptions) {
            const row = node('div', 'option-row' + (message.selectedOption === opt.id ? ' option-selected' : ''));
            row.append(node('div', 'option-label', opt.label + (message.selectedOption === opt.id ? ' ✓' : '')),
                detail('风险 / 收益', `${opt.riskModifier >= 0 ? '+' : ''}${opt.riskModifier} / ${opt.lootModifier >= 0 ? '+' : ''}${opt.lootModifier}`));
            if (!message.isResolved && new Date(message.decisionDeadline).getTime() > Date.now()) row.append(actionButton('选择此项', 'expeditionManualDecision', {
                data: { expeditionId: message.expedition.id, messageId: message.id, selectedOption: opt.id }
            })); card.append(row);
        }
        container.append(card);
    }
}

function renderMercs() {
    const container = byId('mercenariesContainer'); container.replaceChildren();
    for (const [key, label] of [['mercenariesData', 'CORE'], ['usolMercenariesData', 'USOL']]) {
        const data = cache[key], mercs = mercList(data), eliteIds = new Set((data?.eliteSlots || []).map(slot => slot.mercenary?.id));
        const details = node('details', 'exp-material-details'), summary = node('summary', '', `${label} 佣兵（${mercs.length}）`);
        details.append(summary);
        for (const merc of mercs) {
            const cfg = cache.mercConfigData?.[merc.id], selected = settings.autoSendMerc.mercenaryId === merc.id;
            const card = node('div', 'merc-card' + (selected ? ' selected' : ''));
            if (merc.avatarSeed?.startsWith('https://')) { const img = node('img', 'merc-avatar'); img.src = merc.avatarSeed; img.alt = merc.callsign || ''; img.loading = 'lazy'; card.append(img); }
            const body = node('div', 'merc-details');
            body.append(node('div', 'merc-name', (merc.callsign || merc.name || '未知佣兵') + (eliteIds.has(merc.id) ? ' · 精英' : '')),
                detail('状态', translated(merc.status)), detail('等级 / 完成任务', `${translated(merc.rank)} / ${merc.missionsCompleted ?? '--'}`));
            if (merc.restUntil && merc.status === 'RESTING') { const timer = node('div', 'exp-hint', remaining(merc.restUntil)); timer.dataset.expEnd = merc.restUntil; body.append(timer); }
            body.append(detail('阵营', label), detail('专长', merc.specializationName || merc.specialization || '--'), detail('特质', merc.traitName || merc.trait || '--'));
            if (merc.specializationDescription) body.append(node('div', 'exp-hint', merc.specializationDescription));
            if (merc.traitDescription) body.append(node('div', 'exp-hint', merc.traitDescription));
            if (merc.reputationRequirement !== undefined) body.append(detail('所需声望', merc.reputationRequirement));
            if (cfg) {
                body.append(detail('实际费用', number(cfg.totalCost) + ' CR'), detail('风险评分', cfg.riskScore ?? '--'));
                if (cfg.outcomeChances) body.append(detail('失败存活 / 阵亡概率', `${cfg.outcomeChances.failureSurviveChance ?? '--'}% / ${cfg.outcomeChances.deathChance ?? '--'}%`));
            } else body.append(node('div', 'exp-hint', '费用尚未确认；自动派遣不会使用未知费用。'));
            if (!settings.autoSendMerc.autoChooseMerc) {
                const select = node('button', 'refresh-btn-small', selected ? '已选择' : '选择此佣兵'); select.type = 'button';
                select.addEventListener('click', () => saveMerc({ mercenaryId: merc.id, mercenaryName: merc.callsign || merc.name || merc.id })); body.append(select);
            }
            card.append(body); details.append(card);
        }
        container.append(details);
    }
}
function renderMaterials() {
    const counts = new Map();
    for (const item of cache.stashData?.items || []) counts.set(item.itemConfigId, (counts.get(item.itemConfigId) || 0) + itemQuantity(item));
    const table = node('table', 'exp-material-table'), head = node('tr');
    head.append(node('th', '', '无人机材料'), node('th', '', '持有数量')); table.append(head);
    for (const item of DRONE_MATERIALS) { const row = node('tr'); row.append(node('td', '', item.name), node('td', '', counts.get(item.id) || 0)); table.append(row); }
    byId('personalDroneContainer').replaceChildren(table);
}
function renderInventory() {
    const container = byId('inventoryContainer'); container.replaceChildren();
    const stash = cache.stashData;
    byId('spaceInfo').textContent = stash ? `${stash.currentUsage ?? '?'} / ${stash.maxCapacity ?? '?'}` : '-- / --';
    const items = stash?.items || [];
    const total = items.filter(item => item.canSell && Number.isFinite(item.sellPrice)).reduce((sum, item) => sum + item.sellPrice * itemQuantity(item), 0);
    byId('totalValue').textContent = `可售物品按当前单价合计：${number(total)} CR`;
    for (const item of [...items].sort((a, b) => (b.sellPrice || 0) - (a.sellPrice || 0))) {
        const details = node('details', 'exp-material-details'), summary = node('summary', '', `${lootName(item)} ×${itemQuantity(item)}${isDroneMaterial(item) ? ' · 无人机材料' : ''}`);
        details.append(summary);
        const body = node('div', 'exp-item-detail');
        if (item.imageUrl?.startsWith('https://')) { const img = node('img'); img.src = item.imageUrl; img.alt = lootName(item); img.style.cssText = 'width:40px;height:40px;object-fit:contain;'; body.append(img); }
        body.append(detail('品质', translated(item.tier)), detail('可出售', item.canSell ? '是' : '否'));
        if (item.description) body.append(node('div', '', item.description));
        if (item.canSell) body.append(detail('单价', number(item.sellPrice) + ' CR'));
        if (item.canCraft) body.append(detail('可用于制作', '是'));
        if (item.canUse) body.append(detail('可使用', '是'));
        if (item.canSell && !item.locked && !item.pinned) {
            const button = node('button', 'refresh-btn-small', '手动出售 1 件'); button.type = 'button'; button.dataset.expAction = '';
            button.disabled = !expeditionEnabled(settings); let confirming = false;
            button.addEventListener('click', () => {
                if (!confirming) { confirming = true; button.textContent = '再次点击确认出售'; setTimeout(() => { confirming = false; button.textContent = '手动出售 1 件'; }, 3000); return; }
                confirming = false; send('expeditionManualSell', { itemId: item.id }, button);
            }); body.append(button);
        }
        details.append(body); container.append(details);
    }
    renderSpecialists(); renderMaterials();
}
function renderSpecialists() {
    const container = byId('specialistTimerInfo'); container.replaceChildren();
    for (const specialist of cache.specialistsData?.specialists || []) for (const temp of specialist.temporary || []) {
        if (!temp.owned || !temp.expiresAt) continue;
        const card = node('div', 'expedition-card');
        card.append(detail('临时仓库扩容', `${temp.bonusSlots ?? '?'} 格`));
        const end = temp.status === 'IN_GRACE' ? temp.gracePeriodEndAt : temp.expiresAt;
        const timer = node('div', 'exp-hint', remaining(end)); timer.dataset.expEnd = end; card.append(timer);
        if (temp.status === 'IN_GRACE') card.append(node('div', 'exp-hint', '租期已结束，请留意游戏内的宽限期与物品损失提示。'));
        const price = temp.prices?.find(price => !price.items?.length) || temp.prices?.[0];
        if (price?.id) card.append(actionButton(`续租（${number(price.credits)} CR）`, 'expeditionExtendStash', { data: {
            specialistType: specialist.specialistType || 'ENGINEER', kind: temp.kind || 'TEMPORARY', level: temp.level, priceId: price.id
        } }));
        container.append(card);
    }
}
function renderArchive() {
    const container = byId('archivedExpContainer'); container.replaceChildren();
    const data = cache.archivedExpeditionsData;
    const items = Array.isArray(data) ? data : data?.items || data?.data || data?.allItems || [];
    if (!Array.isArray(items) || !items.length) { container.append(node('div', 'no-decisions', '尚无历史远征数据。')); return; }
    for (const exp of items) {
        const card = node('div', 'archived-exp-card');
        card.append(node('div', 'exp-title', `${exp.mercenary?.callsign || '未知佣兵'} · ${translated(exp.outcome || exp.status)}`),
            detail('地点', `${exp.locationName || '--'} / ${exp.zoneName || '--'}`), detail('费用 / 风险', `${number(exp.totalCost)} CR / ${exp.riskScore ?? '--'}`));
        const raw = exp.containerData || exp.container;
        const loot = Array.isArray(raw) ? raw : raw?.items || [];
        if (loot.length) {
            const details = node('details', 'exp-material-details'); details.append(node('summary', '', `战利品（${loot.length} 项）`));
            for (const row of loot) { const item = row.item || row; details.append(detail(item.name || '未知物品', `×${item.quantity ?? 1}${item.isCollected ? ' · 已领取' : ''}${item.isDeleted ? ' · 已删除' : ''}`)); }
            card.append(details);
        }
        if (exp.completedAt) card.append(detail('完成时间', new Date(exp.completedAt).toLocaleString('zh-CN', { hour12: false })));
        container.append(card);
    }
}
function renderLogs() {
    const body = byId('mercDebugLogsBody'), follow = body.scrollHeight - body.scrollTop - body.clientHeight < 30;
    const fragment = document.createDocumentFragment();
    const logs = cache.mercDebugLogs || [];
    if (!logs.length) fragment.append(node('div', 'no-decisions', '等待游戏活动。更新扩展后请刷新游戏标签页。'));
    for (const log of logs) {
        const row = node('div', 'debug-log-row log-' + (log.level || 'info'));
        row.append(node('span', 'log-time', '[' + new Date(log.timestamp).toLocaleTimeString('zh-CN', { hour12: false }) + '] '), document.createTextNode(log.msg)); fragment.append(row);
    }
    body.replaceChildren(fragment); if (follow) body.scrollTop = body.scrollHeight;
}
function showLogs(enabled) { byId('mercDebugToggle').checked = enabled; byId('mercDebugConsole').style.display = enabled ? '' : 'none'; }
byId('mercDebugToggle').addEventListener('change', () => {
    showLogs(byId('mercDebugToggle').checked); chrome.storage.sync.set({ mercDebugConsoleEnabled: byId('mercDebugToggle').checked });
});
byId('copyMercLogsBtn').addEventListener('click', async () => {
    const button = byId('copyMercLogsBtn');
    try { await navigator.clipboard.writeText((cache.mercDebugLogs || []).map(log => `[${log.timestamp}] ${log.msg}`).join('\n')); button.textContent = '已复制'; }
    catch { button.textContent = '复制失败'; }
    setTimeout(() => { button.textContent = '📋 复制'; }, 2000);
});
for (const item of DRONE_MATERIALS) byId('droneMaterialsKeepList').append(node('li', '', item.name));
chrome.storage.sync.get([...EXPEDITION_KEYS, 'mercDebugConsoleEnabled'], data => {
    settings = normalizeExpeditionSettings(data); showLogs(data.mercDebugConsoleEnabled !== false); renderSettings(); renderMercs();
});
chrome.storage.local.get(localKeys, data => { cache = data; renderActive(); renderMercs(); renderInventory(); renderArchive(); renderLogs(); renderSummary(); });
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync') {
        if (EXPEDITION_KEYS.some(key => changes[key])) {
            for (const key of EXPEDITION_KEYS) if (changes[key]) settings[key] = changes[key].newValue;
            settings = normalizeExpeditionSettings(settings); renderSettings(); renderMercs(); renderActive(); renderInventory();
        }
        if (changes.mercDebugConsoleEnabled) showLogs(changes.mercDebugConsoleEnabled.newValue !== false);
    }
    if (area === 'local') {
        for (const key of localKeys) if (changes[key]) cache[key] = changes[key].newValue;
        if (changes.expeditionsData) renderActive();
        if (changes.mercenariesData || changes.usolMercenariesData || changes.mercConfigData) renderMercs();
        if (changes.stashData || changes.specialistsData) renderInventory();
        if (changes.archivedExpeditionsData) renderArchive();
        if (changes.mercDebugLogs) renderLogs();
        renderSummary();
    }
});
setInterval(renderSummary, 1000);
