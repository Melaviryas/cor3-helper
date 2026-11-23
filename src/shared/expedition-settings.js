export const EXPEDITION_KEYS = ['expeditionModuleEnabled', 'expeditionSaleMode', 'autoSendMerc',
    'periodicMercDispatchEnabled', 'autoClaimExpeditionMail', 'decisionModifiers', 'helperMode'];
export const SALE_MODES = [
    { value: 'off', label: '关闭', description: '不自动出售。' },
    { value: 'full', label: '仓库满出售', description: '空间不足时出售最便宜的非无人机远征掉落，腾够空间即停止。' },
    { value: 'non-drone', label: '出售非无人机', description: '自动出售所有可售的非无人机远征掉落，保留全部无人机材料。' },
    { value: 'all', label: '全出售', description: '自动出售全部可售远征掉落，包括无人机材料。' }
];
export function normalizeExpeditionSettings(data = {}) {
    const merc = data.autoSendMerc || {};
    const cap = Number(merc.maxMercCost ?? 15000);
    return { ...data, expeditionModuleEnabled: data.expeditionModuleEnabled === true,
        expeditionSaleMode: SALE_MODES.some(mode => mode.value === data.expeditionSaleMode) ? data.expeditionSaleMode : 'off',
        autoSendMerc: { ...merc, enabled: merc.enabled === true,
            maxMercCost: Number.isFinite(cap) && cap >= 0 ? cap : 15000 },
        periodicMercDispatchEnabled: data.periodicMercDispatchEnabled === true,
        autoClaimExpeditionMail: data.autoClaimExpeditionMail === true };
}
export function expeditionEnabled(settings) {
    return settings?.expeditionModuleEnabled === true && !settings.helperMode;
}
export function dispatchEnabled(settings) {
    return expeditionEnabled(settings) && (settings.autoSendMerc?.enabled === true || settings.periodicMercDispatchEnabled === true);
}
export function saleModeLabel(mode) { return SALE_MODES.find(item => item.value === mode)?.label || '关闭'; }
