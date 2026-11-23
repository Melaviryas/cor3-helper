// Initial data fetch orchestration on page load / reconnect
import { humanDelay } from './ws-send.js';

// Auto-fetch all data on page load (called when WS opens)
var initialFetchDone = false;
window.__cor3ResetInitialFetch = function () {
    initialFetchDone = false;
    console.log('[COR3 Helper] Reset initial fetch flag for reconnect');
};
// Flag: initial merc fetch complete (markets + mercs all done)
window.__cor3InitialMercsFetchDone = false;

window.__cor3InitialFetch = function () {
    if (initialFetchDone) return;
    initialFetchDone = true;
    window.__cor3InitialMercsFetchDone = false;
    window.__cor3InitialFetchInProgress = true;
    console.log('[COR3 Helper] Running initial data fetch (page load)');

    // Trigger daily ops fetch via content script
    window.postMessage({ type: 'COR3_FETCH_DAILY_OPS' }, '*');

    // Refresh the four markets, then Loadout and Updater.
    window.__cor3RequestMarket(function () {
        console.log('[COR3 Helper] Initial: HOME done, starting D4RK');
        window.__cor3RequestDarkMarket(function () {
            console.log('[COR3 Helper] Initial: D4RK done, starting SOYUZ');
            window.__cor3RequestSoyuzMarket(function () {
                console.log('[COR3 Helper] Initial: SOYUZ done, starting USOL');
                window.__cor3RequestUsolMarket(function () {
                    console.log('[COR3 Helper] Initial: All markets fetched');
                    // Retired expedition/stash/mercenary requests are not part of startup.
                    window.__cor3InitialMercsFetchDone = true;
                    window.__cor3RequestLoadout();
                    setTimeout(function () {
                        window.__cor3RequestUpdater();
                        window.__cor3InitialFetchInProgress = false;
                        console.log('[COR3 Helper] Initial data fetch complete');
                        window.postMessage({ type: 'COR3_INITIAL_FETCH_DONE' }, '*');
                    }, 1500);
                });
            });
        });
    });
};

window.__cor3KeepAlive = function () {
    console.log('[COR3 Helper] Keeping service worker alive!');
};
