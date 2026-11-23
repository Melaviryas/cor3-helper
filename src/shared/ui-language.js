import { DEFAULT_UI_LANGUAGE, UI_LANGUAGE_KEY, normalizeUiLanguage, translateUiText } from './ui-i18n.js';

let currentLanguage = DEFAULT_UI_LANGUAGE;
export const getUiLanguage = () => currentLanguage;
export const uiText = text => translateUiText(text, currentLanguage);

// Only presentation nodes/attributes are localized. IDs, values, data attributes, storage
// settings, raw WS/JSON messages and automation commands remain unchanged.
export function installUiLanguage({ document: doc = document, storage = typeof chrome !== 'undefined' ? chrome.storage : null,
    Observer = typeof MutationObserver === 'function' ? MutationObserver : null } = {}) {
    const textSources = new WeakMap(), attributeSources = new WeakMap();
    const pending = new Set(); let scheduled = false, destroyed = false, revision = 0;
    const attributes = ['title', 'placeholder', 'aria-label'];
    const rawContents = 'script, style, textarea, pre, code, #detailBody';
    const excluded = '[data-i18n-skip], [translate="no"], .msg-event, .msg-action, .msg-server, .msg-preview, .loadout-hw-name, .loadout-sw-name, .replace-name';
    const skip = element => element?.nodeType === 1 && element.matches(excluded);
    function textNode(node) {
        const value = node.data;
        let entry = textSources.get(node);
        if (!entry || value !== entry.output) entry = { source: value };
        const output = translateUiText(entry.source, currentLanguage);
        entry.output = output; textSources.set(node, entry);
        if (value !== output) node.data = output;
    }
    function attribute(element, name) {
        if (!element.hasAttribute(name)) return;
        const value = element.getAttribute(name);
        const entries = attributeSources.get(element) || {};
        let entry = entries[name];
        if (!entry || value !== entry.output) entry = { source: value };
        const output = translateUiText(entry.source, currentLanguage);
        entry.output = output; entries[name] = entry; attributeSources.set(element, entries);
        if (value !== output) element.setAttribute(name, output);
    }
    function walk(node) {
        if (skip(node)) return;
        if (node.nodeType === 3) { textNode(node); return; }
        if (node.nodeType === 1) for (const name of attributes) attribute(node, name);
        if (node.nodeType === 1 && node.matches(rawContents)) return;
        for (const child of [...(node.childNodes || [])]) walk(child);
    }
    function applyLanguage(language) {
        currentLanguage = normalizeUiLanguage(language);
        doc.documentElement.lang = currentLanguage;
        const select = doc.getElementById('uiLanguageSelect');
        if (select) select.value = currentLanguage;
        walk(doc.body);
        if (doc.title) doc.title = translateUiText(doc.title, currentLanguage);
    }
    function enqueue(node) {
        if (!node || destroyed) return;
        pending.add(node);
        if (scheduled) return;
        scheduled = true;
        Promise.resolve().then(() => {
            scheduled = false;
            const roots = [...pending]; pending.clear();
            if (destroyed) return;
            for (const root of roots) {
                if (root.nodeType === 3) {
                    if (root.parentNode && !root.parentElement?.closest(excluded + ', ' + rawContents)) textNode(root);
                } else if (!root.closest?.(excluded) && !root.parentElement?.closest(rawContents)) walk(root);
            }
        });
    }
    const observer = Observer ? new Observer(records => {
        for (const record of records) {
            if (record.type === 'characterData') {
                if (textSources.get(record.target)?.output !== record.target.data) enqueue(record.target);
            } else if (record.type === 'attributes') {
                if (attributeSources.get(record.target)?.[record.attributeName]?.output !== record.target.getAttribute(record.attributeName)) enqueue(record.target);
            } else for (const node of record.addedNodes || []) enqueue(node);
        }
    }) : null;

    let select = doc.getElementById('uiLanguageSelect');
    if (!select) {
        const host = doc.querySelector('.toolbar');
        if (host) {
            const label = doc.createElement('label'); label.setAttribute('data-i18n-skip', '');
            label.textContent = 'Language / 语言 ';
            select = doc.createElement('select'); select.id = 'uiLanguageSelect'; select.setAttribute('aria-label', 'Language / 语言');
            for (const [value, name] of [['en', 'English'], ['zh-CN', '简体中文']]) {
                const option = doc.createElement('option'); option.value = value; option.textContent = name; select.appendChild(option);
            }
            label.appendChild(select); host.appendChild(label);
        }
    }
    const onSelect = () => {
        revision++;
        applyLanguage(select.value);
        if (storage?.sync) storage.sync.set({ [UI_LANGUAGE_KEY]: currentLanguage });
    };
    select?.addEventListener('change', onSelect);
    const changed = (changes, area) => {
        if (area === 'sync' && changes[UI_LANGUAGE_KEY]) { revision++; applyLanguage(changes[UI_LANGUAGE_KEY].newValue); }
    };
    storage?.onChanged?.addListener(changed);
    const initialRevision = revision;
    if (storage?.sync) storage.sync.get(UI_LANGUAGE_KEY, data => {
        if (!destroyed && initialRevision === revision) applyLanguage(data[UI_LANGUAGE_KEY]);
    });
    applyLanguage(currentLanguage);
    observer?.observe(doc.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: attributes });
    return { get language() { return currentLanguage; }, setLanguage: applyLanguage,
        refresh: () => walk(doc.body), destroy() { destroyed = true; observer?.disconnect(); select?.removeEventListener('change', onSelect); storage?.onChanged?.removeListener?.(changed); } };
}
