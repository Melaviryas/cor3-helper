chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.autoJobLoadoutMode) window.postMessage({
        type: 'COR3_AUTOJOB_LOADOUT_MODE', mode: changes.autoJobLoadoutMode.newValue === 'software' ? 'software' : 'auto'
    }, '*');
});
