import { showLastUpdated } from './utils.js';

const dailyLastUpdated = document.getElementById('dailyLastUpdated');
const coreMarketLastUpdated = document.getElementById('coreMarketLastUpdated');
const darkMarketLastUpdated = document.getElementById('darkMarketLastUpdated');
const soyuzMarketLastUpdated = document.getElementById('soyuzMarketLastUpdated');
const usolMarketLastUpdated = document.getElementById('usolMarketLastUpdated');
const loadoutLastUpdated = document.getElementById('loadoutLastUpdated');

export function refreshAllTimestamps() {
    showLastUpdated(dailyLastUpdated, 'dailyOpsUpdatedAt');
    showLastUpdated(coreMarketLastUpdated, 'marketDataUpdatedAt');
    showLastUpdated(darkMarketLastUpdated, 'darkMarketDataUpdatedAt');
    showLastUpdated(soyuzMarketLastUpdated, 'soyuzMarketDataUpdatedAt');
    showLastUpdated(usolMarketLastUpdated, 'usolMarketDataUpdatedAt');
    if (loadoutLastUpdated) showLastUpdated(loadoutLastUpdated, 'loadoutUpdatedAt');
}
