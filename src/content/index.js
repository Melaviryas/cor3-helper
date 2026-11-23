// content.js — modular entry point

// Import all modules (side-effects: intervals, storage listeners, auto-start solvers, DOM tweaks)
import './helpers.js';
import './expedition-module.js';
import './merc-logs.js';
import './failed-jobs-cleanup.js';
import './auto-job-loadout-settings.js';
import './auto-update-markets.js';
import './auto-send.js';
import './auto-refresh.js';
import './solvers.js';
import './dom-tweaks.js';
import './log-writers.js';

// Setup functions (register listeners)
import { setupWsRelay } from './ws-relay.js';
import { setupMessageListener } from './message-listener.js';
import { setupEngineRelay } from './engine-relay.js';

setupWsRelay();
setupMessageListener();
setupEngineRelay();

// Capture extension errors to IndexedDB for DevTools panel
window.addEventListener('error', (e) => {
    if (typeof cor3LogEntry === 'function') {
        cor3LogEntry('error-logs', (e.filename || '') + ':' + (e.lineno || 0) + ' ' + (e.message || ''), 'error');
    }
});
window.addEventListener('unhandledrejection', (e) => {
    if (typeof cor3LogEntry === 'function') {
        var msg = e.reason ? (e.reason.stack || e.reason.message || String(e.reason)) : 'Unhandled rejection';
        cor3LogEntry('error-logs', msg, 'error');
    }
});

// Clean up auto-jobs state on page reload — always start fresh
// (autoJobsLockedJobs is preserved — the solver reads and clears it on next start)
chrome.storage.local.remove('initialFetchDoneAt');
chrome.storage.local.get('autoJobsRunning', (data) => {
    if (data.autoJobsRunning) {
        console.log('[COR3 Helper] Page reloaded — clearing stale auto-jobs state');
        chrome.storage.local.set({ autoJobsRunning: false, autoJobsQueue: [] });
    }
});
