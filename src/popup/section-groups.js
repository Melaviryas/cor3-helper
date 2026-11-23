// The popout layout distributes these sections across separate cards.
// Hide the group's content and secondary cards, leaving its title available to reopen it.
const groups = [
    { name: 'markets', label: 'Markets', buttonId: 'marketsGroupToggle', key: 'marketsGroupCollapsed' },
    { name: 'loadout', label: 'Loadout', buttonId: 'loadoutGroupToggle', key: 'loadoutGroupCollapsed' },
    { name: 'automation', label: 'Automation/QoL Toggles', buttonId: 'automationGroupToggle', key: 'automationGroupCollapsed' },
    { name: 'daily', label: 'Daily Ops', buttonId: 'dailyGroupToggle', key: 'dailyGroupCollapsed' },
    { name: 'expeditions', label: '远征', buttonId: 'expeditionsGroupToggle', key: 'expeditionsGroupCollapsed' }
];

for (const group of groups) {
    const button = document.getElementById(group.buttonId);
    if (!button) continue;
    const content = [...document.querySelectorAll('[data-section-group-content="' + group.name + '"]')];
    const cards = [...document.querySelectorAll('[data-section-group-card="' + group.name + '"]')];
    const arrow = button.querySelector('.group-collapse-arrow');
    let collapsed = false;
    let touched = false;

    button.setAttribute('aria-controls', content.map(element => element.id).filter(Boolean).join(' '));
    function render(value) {
        collapsed = value === true;
        button.setAttribute('aria-expanded', String(!collapsed));
        button.title = group.name === 'expeditions' ? (collapsed ? '展开远征' : '收起远征') : (collapsed ? 'Expand ' : 'Collapse ') + group.label;
        arrow.textContent = collapsed ? '▶' : '▼';
        for (const element of content) element.classList.toggle('section-group-hidden', collapsed);
        for (const card of cards) {
            card.classList.toggle('section-group-hidden', collapsed && !card.contains(button));
        }
    }

    render(false);
    chrome.storage.local.get(group.key, data => {
        if (!touched) render(data[group.key]);
    });
    button.addEventListener('click', () => {
        touched = true;
        render(!collapsed);
        chrome.storage.local.set({ [group.key]: collapsed });
    });
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes[group.key]) render(changes[group.key].newValue);
    });
}
