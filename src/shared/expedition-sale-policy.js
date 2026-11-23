import catalogue from './expedition-loot-catalogue.json';
import { itemQuantity, isDroneMaterial } from './selective-loot-policy.js';
export { itemQuantity, isDroneMaterial };
const known = new Map(catalogue.items.filter(item => item.canSell).map(item => [item.id, item]));
export function canSellExpeditionItem(item, mode) {
    return ['full', 'non-drone', 'all'].includes(mode) && !!item && typeof item.id === 'string' && !!item.id
        && known.has(item.itemConfigId) && item.canSell === true && itemQuantity(item) > 0
        && !item.locked && !item.isLocked && !item.pinned && !item.isPinned
        && (item.location === undefined || ['stash', 'inventory'].includes(item.location))
        && (mode === 'all' || !isDroneMaterial(item));
}
export function lootName(item) { return item?.name || known.get(item?.itemConfigId)?.name || '未知物品'; }
export function stashSpace(stash) {
    if (!Number.isFinite(stash?.maxCapacity) || !Number.isFinite(stash?.currentUsage)
        || stash.maxCapacity <= 0 || stash.currentUsage < 0) return null;
    return Math.max(0, stash.maxCapacity - stash.currentUsage);
}
export function saleCandidates(stash, mode) {
    const candidates = (stash?.items || []).filter(item => canSellExpeditionItem(item, mode));
    if (mode === 'full') return candidates.filter(item => Number.isFinite(item.sellPrice) && item.sellPrice > 0)
        .sort((a, b) => a.sellPrice - b.sellPrice || a.id.localeCompare(b.id));
    return candidates;
}
