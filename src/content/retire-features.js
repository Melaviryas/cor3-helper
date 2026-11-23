// Stop settings left enabled in the previous edition; do not alter job/loadout preferences.
chrome.storage.sync.get(['autoSendMerc', 'decisionModifiers'], data => {
    const changes = { periodicMercDispatchEnabled: false, autoClaimExpeditionMail: false,
        selectiveLootSellEnabled: false, autoSellCheapest: false, alarms: [] };
    if (data.autoSendMerc) changes.autoSendMerc = { ...data.autoSendMerc, enabled: false };
    if (data.decisionModifiers) changes.decisionModifiers = { ...data.decisionModifiers, autoChoose: false, enabled: false };
    chrome.storage.sync.set(changes);
});
