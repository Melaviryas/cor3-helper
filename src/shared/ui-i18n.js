import pairs from './ui-catalogue.json';

export const UI_LANGUAGE_KEY = 'uiLanguage';
export const DEFAULT_UI_LANGUAGE = 'en';
export function normalizeUiLanguage(value) { return value === 'zh-CN' || value === 'zh' ? 'zh-CN' : 'en'; }
const normalize = value => value.replace(/\s+/g, ' ').trim();
const english = new Map(), chinese = new Map();
for (const [en, zh] of pairs) {
    english.set(normalize(en).toLowerCase(), zh);
    if (!chinese.has(normalize(zh))) chinese.set(normalize(zh), en);
}
function exact(value, language) {
    const key = normalize(value);
    if (language === 'zh-CN') return english.get(key.toLowerCase()) ?? (chinese.has(key) ? key : null);
    return chinese.get(key) ?? (english.has(key.toLowerCase()) ? value : null);
}
const templates = [];
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function template(en, zh) {
    const compile = text => {
        const indices = [];
        const source = text.split(/(\{\d+\})/g).map(part => {
            const match = /^\{(\d+)\}$/.exec(part);
            if (!match) return escape(part).replace(/\s+/g, '\\s*');
            indices.push(Number(match[1])); return '([\\s\\S]+?)';
        }).join('');
        return { regex: new RegExp('^' + source + '$', 'i'), indices };
    };
    templates.push({ en, zh, enMatch: compile(en), zhMatch: compile(zh) });
}

template('Updated {0}m ago', '{0} 分钟前更新');
template('Market-{0}', '市场 {0}');
template('Reputation — Level {0}', '声望 — 等级 {0}');
template('Expand {0}', '展开 {0}');
template('Collapse {0}', '收起 {0}');
template('{0} Market', '{0} 市场');
template('{0}m {1}s', '{0} 分钟 {1} 秒');
template('{0} entries', '{0} 条记录');
template('({0} entries)', '（{0} 条记录）');
template('{0}-now', '{0}-现在');
template('Updated {0}h {1}m ago', '{0} 小时 {1} 分钟前更新');
template('{0}h:{1}m:{2}s', '{0}小时:{1}分钟:{2}秒');
template('{0}h {1}m {2}s', '{0}小时 {1}分钟 {2}秒');
template('{0}h {1}m', '{0} 小时 {1} 分钟');
template('{0} min', '{0} 分钟');
template('{0}m remaining', '剩余 {0} 分钟');
template('{0}m ago', '{0} 分钟前');
template('{0} pending', '{0} 项待处理');
template('({0} pending)', '（{0} 项待处理）');
template('({0} servers)', '（{0} 台服务器）');
template('({0} files)', '（{0} 个文件）');
template('({0} logs)', '（{0} 条日志）');
template('({0}, {1} in-progress)', '（{0}，{1} 个执行中）');
template('Items List ({0})', '物品列表（{0}）');
template('Jobs List ({0})', '任务列表（{0}）');
template('Loot ({0} items)', '战利品（{0} 项）');
template('Loot ({0})', '战利品（{0} 项）');
template('{0} mercenaries ({1})', '{0} 佣兵（{1}）');
template('Renew ({0} CR)', '续租（{0} CR）');
template('Sellable stock at current prices: {0} CR', '可售物品按当前单价合计：{0} CR');
template('Next dispatch check: {0}', '下次派遣检查：{0}');
template('Last dispatch {0}', '上次派遣 {0}');
template('Remaining {0}', '剩余 {0}');
template('State updated at: {0}', '状态更新时间：{0}');
template('Total cost: {0}', '总费用：{0}');
template('Risk score: {0}', '风险评分：{0}');
template('Logs copied ({0} MB)', '日志已复制（{0} MB）');
template('Aim for {0} system version!', '建议达到系统版本 {0}！');
template('Refreshing Market-{0}...', '正在刷新市场 {0}…');
template('Setting Market-{0} endpoint...', '正在连接市场 {0} 节点…');
template('Delayed — waiting for "{0}" to finish', '已延后，等待“{0}”完成');
template('Select {0}', '选择 {0}');
template('Unequip {0}', '卸下 {0}');
template('Equip {0}', '装备 {0}');
template('Install {0}', '安装 {0}');
template('Uninstall {0}', '卸载 {0}');
template('Pulling map: {0}', '正在获取地图：{0}');
template('Map loaded: {0}', '地图已加载：{0}');
template('Connecting to {0}', '正在连接 {0}');
template('Testing reachability to {0}', '正在测试到 {0} 的可达性');
template('Clearing failed jobs from {0}...', '正在清理 {0} 的失败任务…');
template('Dismissed {0} failed job(s) from {1} market', '已从 {1} 市场清理 {0} 个失败任务');
template('Clean up {0} failed jobs', '清理 {0} 个失败任务');
template('Loadout: equipping {0}', '配置：正在装备 {0}');
template('Loadout: requesting fresh data via WS...', '配置：正在通过 WebSocket 请求最新数据…');
template('Job completed: {0}', '任务已完成：{0}');
template('Job failed: {0}', '任务失败：{0}');
template('Seller error: {0}', '出售程序错误：{0}');
template('Minigame locked (~{0}m remaining)', '小游戏已锁定（约剩余 {0} 分钟）');
template('Minigame lock (~{0}m remaining)', '小游戏锁定（约剩余 {0} 分钟）');
template('{0} (expired)', '{0}（已过期）');
template('Game unavailable: {0}; refresh the game after updating the extension.', '无法连接游戏：{0}；更新扩展后请刷新游戏。');
template('Server confirmed expedition {0}', '服务器已确认远征 {0}');
template('Dispatch successful: {0}', '派遣成功：{0}');
template('Refreshing {0} mercenaries and actual costs', '正在刷新 {0} 佣兵与实际费用');
template('Sending {0}, cost {1} CR; awaiting server confirmation', '正在派遣 {0}，费用 {1} CR；等待服务器确认');
template('Selling {0} ×{1}; awaiting server confirmation', '正在出售 {0} ×{1}，等待服务器确认');
template('Sale confirmed: {0} ×{1}', '出售已确认：{0} ×{1}');
template('Expedition mail claim confirmed: {0}', '远征奖励领取已确认：{0}');
template('Confirmed claims for {0} expedition reward message(s)', '已确认领取 {0} 封远征奖励邮件');
template('Sale check complete: {0} unit(s) sold; {1} CR at server prices; {2} drone-material unit(s) remain', '出售检查完成：已售 {0} 件；按服务器单价合计 {1} CR；仓库剩余无人机材料 {2} 件');
template('Sale check complete: {0} unit(s) sold; {1} CR at server prices (some prices unknown); {2} drone-material unit(s) remain', '出售检查完成：已售 {0} 件；按服务器单价合计 {1} CR（部分售价未知）；仓库剩余无人机材料 {2} 件');
template('Submitting automatic decision: {0} (score {1})', '正在提交自动决策：{0}（评分 {1}）');
template('USOL mercenary refresh unavailable; using fresh CORE data only: {0}', 'USOL 佣兵刷新不可用，仅使用本轮确认的 CORE 佣兵：{0}');
template('Expedition operation {0} completed', '远征操作 {0} 已完成');
template('Expedition operation {0} failed: {1}', '远征操作 {0} 失败：{1}');
template('Check stopped: {0}', '本轮停止：{0}');
template('Expedition check failed: {0}', '远征检查失败：{0}');
template('Expedition module initialization failed: {0}', '远征模块初始化失败：{0}');
template('Expedition settings update failed: {0}', '远征设置更新失败：{0}');
template('Checking {0} markets: {1}/4 received.', '正在检查 {0} 市场：已收到 {1}/4。');
template('Cleanup verified: {0} failed job(s) dismissed; {1} remaining or unverified.', '清理已复核：已清除 {0} 个失败任务；剩余或未确认 {1} 个。');
template('Cleanup stopped: {0}. No cached jobs are removed locally.', '清理已停止：{0}。未在本地删除任务缓存。');

export function translateUiText(value, language = DEFAULT_UI_LANGUAGE, depth = 0) {
    if (typeof value !== 'string' || !value.trim() || depth > 5) return value;
    language = normalizeUiLanguage(language);
    const white = /^(\s*)([\s\S]*?)(\s*)$/.exec(value);
    const source = white[2];
    let text = exact(source, language);
    if (text !== null) return white[1] + text + white[3];
    const hours = (language === 'zh-CN' ? /^(\d+)h$/i : /^(\d+)\s*小时$/).exec(source);
    if (hours) return white[1] + hours[1] + (language === 'en' ? 'h' : ' 小时') + white[3];
    // Message bodies, names, IDs, filenames and user-entered values never go through a broad word substitution.
    for (const item of templates) {
        const rule = language === 'en' ? item.zhMatch : item.enMatch;
        const match = rule.regex.exec(source);
        if (!match) continue;
        const values = new Map(rule.indices.map((index, i) => [index, match[i + 1]]));
        text = (language === 'en' ? item.en : item.zh).replace(/\{(\d+)\}/g,
            (_, index) => translateUiText(values.get(Number(index)), language, depth + 1));
        return white[1] + text + white[3];
    }
    const prefixed = /^(\[[^\]]+\]\s*)([\s\S]+)$/.exec(source);
    if (prefixed) {
        const result = translateUiText(prefixed[2], language, depth + 1);
        if (result !== prefixed[2]) return white[1] + prefixed[1] + result + white[3];
    }
    // Preserve icons, arrows and their spacing around a recognized label.
    const decorated = /^([^A-Za-z0-9\u3400-\u9fff]+)([\s\S]+)$/.exec(source);
    if (decorated) {
        const result = translateUiText(decorated[2], language, depth + 1);
        if (result !== decorated[2]) return white[1] + decorated[1] + result + white[3];
    }
    const label = /^([^:：=]+)([:：=])(\s*)([\s\S]*)$/.exec(source);
    if (label) {
        const translated = exact(label[1], language);
        if (translated !== null) {
            const separator = label[2] === '=' ? '=' : language === 'en' ? ': ' : '：';
            return white[1] + translated.replace(/[:：]$/, '') + separator
                + translateUiText(label[4], language, depth + 1) + white[3];
        }
    }
    // Composite status lines are translated part by part, retaining values and identifiers.
    if (/[·；\n]/.test(source) || /\s\/\s/.test(source)) {
        const parts = source.split(/(\s*·\s*|\s*；\s*|\s\/\s|\n)/);
        const result = parts.map((part, i) => i % 2 ? (language === 'en' ? part.replace('；', '; ') : part)
            : translateUiText(part, language, depth + 1)).join('');
        if (result !== source) return white[1] + result + white[3];
    }
    const trailing = /^(.*?)([.:：!！…]+)$/.exec(source);
    if (trailing && trailing[1]) {
        const result = exact(trailing[1], language);
        if (result !== null) return white[1] + result + (language === 'en' ? trailing[2].replace('：', ':').replace('！', '!') : trailing[2].replace(':', '：')) + white[3];
    }
    return value;
}

export const UI_TEXT_PAIRS = pairs;
