import { calculateAnalysis, normSpecs, RESOURCE_KEYS } from './loadout-resolver.js';

export const HARDWARE_SLOTS = ['cpu', 'gpu', 'ram', 'psu'];
export function normalizeFileType(value) {
    if (typeof value !== 'string' || !value.trim()) return null;
    value = value.trim().toLowerCase();
    return value.startsWith('.') ? value : '.' + value;
}
export function normalizeLoadoutMode(mode) { return mode === 'software' ? 'software' : 'auto'; }
function matches(spec, type, target) {
    if (spec?.type !== type) return false;
    const supported = type === 'DECRYPT' ? spec.fileTypes : spec.serverTypes;
    if (!Array.isArray(supported)) return false;
    return supported.some(value => type === 'DECRYPT' ? normalizeFileType(value) === target
        : typeof value === 'string' && value.toLowerCase() === target.toLowerCase());
}
function validPower(spec) {
    return Array.isArray(spec?.power) && spec.power.length >= 2
        && spec.power.every(Number.isFinite) && spec.power[0] >= 0 && spec.power[1] >= spec.power[0];
}
function validSoftware(sw) {
    if (!sw?.id || !sw.consuming || typeof sw.consuming !== 'object') return false;
    return RESOURCE_KEYS.every(key => sw.consuming[key] == null || (Array.isArray(sw.consuming[key])
        && [2, 3].includes(sw.consuming[key].length) && sw.consuming[key].every(Number.isFinite)));
}
const fields = { cpu: ['cpuFrequency', 'cpuCores', 'cpuConsuming'], gpu: ['gpuPower', 'gpuMemory', 'gpuConsuming'],
    ram: ['ramFrequency', 'ramMemory'], psu: ['psuPower'] };
function validHardware(hw, slot) {
    return !!hw?.id && fields[slot].every(key => Number.isFinite(hw.specs?.[key]) && hw.specs[key] >= 0);
}
export function hardwareMatches(actual, target) {
    return HARDWARE_SLOTS.every(slot => actual?.[slot]?.id === target?.[slot]?.id);
}
export function softwareMatches(actual, ids) {
    const installed = (actual || []).map(sw => sw.id).sort();
    return installed.length === ids.length && installed.every((id, i) => id === [...ids].sort()[i]);
}
export function targetPower(loadout, softwareId, type, target) {
    const selected = loadout.ownedSoftware?.find(sw => sw.id === softwareId);
    if (!validSoftware(selected)) return null;
    const analysis = calculateAnalysis({ ...loadout, ownedSoftware: [{ ...selected, specs: normSpecs(selected).filter(validPower) }] }, [softwareId]);
    if (!analysis.canBoot) return null;
    const powers = (analysis.swAnalysis[softwareId]?.abilities || []).filter(spec => matches(spec, type, target))
        .map(spec => spec.computedPower).filter(Number.isFinite);
    return powers.length ? Math.max(...powers) : null;
}
function hardwareOptions(loadout, mode) {
    const current = loadout.equippedHardware || {};
    if (mode === 'software') return HARDWARE_SLOTS.every(slot => validHardware(current[slot], slot)) ? [current] : [];
    const bySlot = Object.fromEntries(HARDWARE_SLOTS.map(slot => [slot, new Map()]));
    for (const hw of loadout.ownedHardware || []) {
        const slot = hw?.category?.toLowerCase();
        if (bySlot[slot] && validHardware(hw, slot)) bySlot[slot].set(hw.id, hw);
    }
    // Equipped components are owned even when an API version omits them from ownedHardware.
    for (const slot of HARDWARE_SLOTS) if (validHardware(current[slot], slot)) bySlot[slot].set(current[slot].id, current[slot]);
    if (HARDWARE_SLOTS.some(slot => !bySlot[slot].size)) return [];
    const psus = [...bySlot.psu.values()].sort((a, b) => Number(b.id === current.psu?.id) - Number(a.id === current.psu?.id)
        || a.specs.psuPower - b.specs.psuPower || a.id.localeCompare(b.id));
    const options = [];
    for (const cpu of bySlot.cpu.values()) for (const gpu of bySlot.gpu.values()) {
        const demand = cpu.specs.cpuConsuming + gpu.specs.gpuConsuming;
        // PSU capacity has no Power multiplier in the game's resource model. Among
        // sufficient PSUs, retaining the current PSU minimizes swaps without losing Power.
        const psu = psus.find(psu => psu.specs.psuPower >= demand);
        if (!psu) continue;
        for (const ram of bySlot.ram.values()) options.push({ cpu, gpu, ram, psu });
    }
    return options;
}
function changesFor(loadout, hw, softwareId) {
    const hardware = HARDWARE_SLOTS.filter(slot => loadout.equippedHardware?.[slot]?.id !== hw[slot].id).length;
    const ids = (loadout.equippedSoftware || []).map(sw => sw.id);
    const software = hardware ? ids.length + 1 : ids.filter(id => id !== softwareId).length + Number(!ids.includes(softwareId));
    return { hardware, commands: hardware + software };
}
function isBetter(a, b) {
    if (!b) return true;
    return a.power > b.power || (a.power === b.power && (a.changes.commands < b.changes.commands
        || (a.changes.commands === b.changes.commands && (a.changes.hardware < b.changes.hardware
        || (a.changes.hardware === b.changes.hardware && (a.draw < b.draw
        || (a.draw === b.draw && a.key < b.key)))))));
}
export function chooseBestLoadout(loadout, { type, target, mode = 'auto', requiredPower = 0 } = {}) {
    target = type === 'DECRYPT' ? normalizeFileType(target) : target;
    const result = { best: null, candidates: [], reason: null, meetsRequirement: false };
    if (!['HACK', 'DECRYPT'].includes(type) || typeof target !== 'string' || !target) {
        result.reason = 'Unknown operation or target type'; return result;
    }
    const hardware = hardwareOptions(loadout, normalizeLoadoutMode(mode));
    if (!hardware.length) { result.reason = 'No complete, known hardware combination fits this mode'; return result; }
    const owned = new Map((loadout.ownedSoftware || []).filter(sw => sw?.id).map(sw => [sw.id, sw]));
    for (const sw of owned.values()) {
        if (!validSoftware(sw)) continue;
        const specs = normSpecs(sw).filter(validPower);
        if (!specs.some(spec => matches(spec, type, target))) continue;
        const sanitized = { ...sw, specs };
        let bestForTool = null;
        for (const hw of hardware) {
            const power = targetPower({ equippedHardware: hw, ownedSoftware: [sanitized] }, sw.id, type, target);
            if (power === null) continue;
            const plan = { software: sanitized, hardware: hw, power, type, target,
                changes: changesFor(loadout, hw, sw.id), draw: hw.cpu.specs.cpuConsuming + hw.gpu.specs.gpuConsuming,
                key: sw.id + ':' + HARDWARE_SLOTS.map(slot => hw[slot].id).join(':') };
            if (isBetter(plan, bestForTool)) bestForTool = plan;
        }
        if (!bestForTool) { result.candidates.push({ id: sw.id, name: sw.name, power: null }); continue; }
        result.candidates.push({ id: sw.id, name: sw.name, power: bestForTool.power });
        if (isBetter(bestForTool, result.best)) result.best = bestForTool;
    }
    result.meetsRequirement = !!result.best && result.best.power >= requiredPower;
    result.reason = !result.best ? 'No owned compatible software can boot' : !result.meetsRequirement
        ? 'Best actual Power ' + result.best.power + ' is below required ' + requiredPower : null;
    return result;
}

// Change only one component at a time and validate every intermediate power draw.
// Lower draw first / PSU upgrade first naturally emerge from this small permutation search.
export function hardwareTransition(current, target) {
    if (HARDWARE_SLOTS.some(slot => current?.[slot] && !validHardware(current[slot], slot))) return null;
    const changed = HARDWARE_SLOTS.filter(slot => current?.[slot]?.id !== target?.[slot]?.id);
    function search(hw, remaining, steps) {
        if (!remaining.length) return steps;
        for (const slot of remaining) {
            const next = { ...hw, [slot]: target[slot] };
            const demand = (next.cpu?.specs?.cpuConsuming || 0) + (next.gpu?.specs?.gpuConsuming || 0);
            if (!Number.isFinite(next.psu?.specs?.psuPower) || demand > next.psu.specs.psuPower) continue;
            const found = search(next, remaining.filter(key => key !== slot), [...steps, slot]);
            if (found) return found;
        }
        return null;
    }
    return search(current || {}, changed, []);
}
