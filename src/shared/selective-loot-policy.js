import catalogue from './expedition-loot-catalogue.json';

export const DRONE_MATERIALS = catalogue.items.filter(item => item.droneMaterial);
export const SELECTIVE_SALE_ITEMS = catalogue.items.filter(item => item.canSell && !item.droneMaterial);
const allowedIds = new Set(SELECTIVE_SALE_ITEMS.map(item => item.id));
const protectedIds = new Set(DRONE_MATERIALS.map(item => item.id));

export function itemQuantity(item) {
    const quantity = item?.quantity === undefined ? 1 : item.quantity;
    return Number.isSafeInteger(quantity) && quantity > 0 ? quantity : 0;
}

export function isDroneMaterial(item) {
    return protectedIds.has(item?.itemConfigId);
}

export function canSelectivelySell(item) {
    return !!item && typeof item.id === 'string' && !!item.id
        && allowedIds.has(item.itemConfigId) && !protectedIds.has(item.itemConfigId)
        && item.canSell === true && itemQuantity(item) > 0
        && !item.locked && !item.pinned
        && (item.location === undefined || ['stash', 'inventory'].includes(item.location));
}

export function selectiveSaleName(item) {
    return SELECTIVE_SALE_ITEMS.find(known => known.id === item?.itemConfigId)?.name || 'Unknown item';
}
