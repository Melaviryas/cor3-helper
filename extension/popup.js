(() => {
  // src/popup/state.js
  var state = {
    isHelper: false,
    expeditionEndTimes: {},
    modifiersEnabled: true,
    savedLootMod: 1,
    savedRiskMod: -5,
    dailyNextTaskTime: null,
    coreMarketName: null,
    darkMarketName: null,
    soyuzMarketName: null,
    usolMarketName: null,
    coreNextJobsResetAt: null,
    bmiNextJobsResetAt: null,
    soyuzNextJobsResetAt: null,
    usolNextJobsResetAt: null,
    isRefreshing: false,
    refreshQueue: [],
    isProcessingQueue: false,
    pinnedTimers: { daily: false, home_jobs: false, dark_jobs: false, soyuz_jobs: false, usol_jobs: false },
    autoRefresh: { home_jobs: false, dark_jobs: false, soyuz_jobs: false, usol_jobs: false },
    autoRefreshRetry: { home_jobs: null, dark_jobs: null, soyuz_jobs: null, usol_jobs: null },
    lastTimerSeconds: { home_jobs: null, dark_jobs: null, soyuz_jobs: null, usol_jobs: null },
    cachedLoadoutData: null,
    selectedMercenaryId: null,
    mercRestTimers: {},
    autoJobsRunning: false,
    autoFinishAllActive: false,
    autoJobsSelectedTypes: { home: [], dark: [], soyuz: [], usol: [] },
    autoJobsDebugLogs: [],
    autoJobsTracker: [],
    valuableSearchRunning: false,
    valuableSellerRunning: false,
    valuableDebugLogs: [],
    _cachedExpeditionsForVeteranCheck: null,
    autoChosenDecisions: /* @__PURE__ */ new Set(),
    _specialistTimerInterval: null,
    _renderDebugJobsId: 0,
    _maintTimerInterval: null
  };
  var zoomList = {
    "Lyapun AA8": 2.1,
    "A/Bver 410": 2.1,
    "RE-nova v3.0": 2.1,
    "D-Badger v2.2": 2.1,
    "Porter-triX lr8": 2.1,
    "H0pp3R ced/p 03": 1.8,
    "Screener Pro r10": 1.8,
    "5CRYPt0L 0J": 2.3,
    "OmniFlow 12.35X": 2.575,
    "8Pro Series 1870": 2.5,
    "I-Partner C16-10": 2.6
  };

  // src/popup/theme.js
  var themeToggleBtn = document.getElementById("themeToggleBtn");
  var themeDropdown = document.getElementById("themeDropdown");
  var themeOptions = themeDropdown.querySelectorAll(".theme-option");
  function applyTheme(themeName) {
    document.body.classList.forEach((cls) => {
      if (cls.startsWith("theme-")) document.body.classList.remove(cls);
    });
    if (themeName) {
      document.body.classList.add("theme-" + themeName);
    }
    themeOptions.forEach((opt) => {
      opt.classList.toggle("active", opt.dataset.theme === themeName);
    });
  }
  chrome.storage.sync.get("selectedTheme", (data) => {
    applyTheme(data.selectedTheme || "default");
  });
  themeToggleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    themeDropdown.classList.toggle("open");
  });
  themeOptions.forEach((opt) => {
    opt.addEventListener("click", async (e) => {
      e.stopPropagation();
      const theme = opt.dataset.theme;
      applyTheme(theme);
      await chrome.storage.sync.set({ selectedTheme: theme });
      themeDropdown.classList.remove("open");
    });
  });
  document.addEventListener("click", () => {
    themeDropdown.classList.remove("open");
  });

  // src/popup/utils.js
  async function getCor3Tab() {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab && activeTab.url && (activeTab.url.includes("cor3.gg") || activeTab.url.includes("os.cor3.gg"))) {
      return activeTab;
    }
    const allTabs = await chrome.tabs.query({ url: ["https://cor3.gg/*", "https://os.cor3.gg/*"] });
    return allTabs.length > 0 ? allTabs[0] : null;
  }
  function formatTimeAgo(ts) {
    if (!ts) return "";
    const diff = Date.now() - ts;
    if (diff < 6e4) return "Updated just now";
    const mins = Math.floor(diff / 6e4);
    if (mins < 60) return `Updated ${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `Updated ${hrs}h ${remMins}m ago`;
  }
  function showLastUpdated(el, tsKey) {
    chrome.storage.local.get(tsKey, (result) => {
      const ts = result[tsKey];
      el.textContent = ts ? formatTimeAgo(ts) : "";
    });
  }
  function formatTimeRemaining(dateStr) {
    if (!dateStr) return "--";
    const diff = new Date(dateStr).getTime() - Date.now();
    if (diff <= 0) return "Expired";
    const totalSec = Math.floor(diff / 1e3);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor(totalSec % 3600 / 60);
    const s = totalSec % 60;
    return `${h}h:${m}m:${s}s`;
  }
  function humanDelay(min = 400, max = 900) {
    return new Promise((r) => setTimeout(r, min + Math.floor(Math.random() * (max - min))));
  }
  function waitForStorageKey(key, timeoutMs = 8e3) {
    return new Promise((resolve) => {
      let done = false;
      const poll = setInterval(async () => {
        const data = await chrome.storage.local.get(key);
        if (data[key]) {
          clearInterval(poll);
          if (!done) {
            done = true;
            resolve(true);
          }
        }
      }, 400);
      setTimeout(() => {
        clearInterval(poll);
        if (!done) {
          done = true;
          resolve(false);
        }
      }, timeoutMs);
    });
  }
  function updateSelectAllState(selectAllCb, checkboxes) {
    if (checkboxes.length === 0) {
      selectAllCb.checked = false;
      selectAllCb.indeterminate = false;
      return;
    }
    const checkedCount = checkboxes.filter((cb) => cb.checked).length;
    selectAllCb.checked = checkedCount === checkboxes.length;
    selectAllCb.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
  }

  // src/popup/panel-controls.js
  var statusDiv = document.getElementById("status");
  var popOutBtn = document.getElementById("popOutBtn");
  var sidePanelBtn = document.getElementById("sidePanelBtn");
  (function detectMode() {
    const params = new URLSearchParams(window.location.search);
    const isPopout = params.get("mode") === "popout";
    const isSidePanel = params.get("mode") === "sidepanel";
    if (!isPopout && !isSidePanel) return;
    document.body.classList.add(isPopout ? "mode-popout" : "mode-sidepanel");
    const mainView = document.getElementById("mainView");
    if (!mainView) return;
    function makeCard(elements) {
      const card = document.createElement("div");
      card.className = "popout-card";
      for (const el of elements) card.appendChild(el);
      return card;
    }
    const grid = document.createElement("div");
    grid.id = "popoutGrid";
    const headerRow = mainView.querySelector(".header-row");
    const insertRef = headerRow ? headerRow.nextSibling : mainView.firstChild;
    const wrappedEls = /* @__PURE__ */ new Set();
    function addCard(elements) {
      if (!elements || elements.length === 0) return;
      const filtered = elements.filter(Boolean);
      if (filtered.length === 0) return;
      const card = makeCard(filtered);
      grid.appendChild(card);
      for (const el of filtered) wrappedEls.add(el);
      return card;
    }
    function addGroupCard(elements, group) {
      const card = addCard(elements);
      if (card) card.dataset.sectionGroupCard = group;
    }
    function addExpeditionCard(elements) {
      if (elements.some((element) => element.dataset.sectionGroupContent === "expeditions" || element.id === "expeditionsGroupToggle")) addGroupCard(elements, "expeditions");
      else addCard(elements);
    }
    const helperDiv = mainView.querySelector("#helperModeToggle")?.closest('div[style*="justify-content"]');
    const pinned = document.getElementById("pinnedTimersSection");
    addCard([document.getElementById("uiLanguageRow"), helperDiv, pinned].filter(Boolean));
    addCard([document.getElementById("autoJobSolverSection")].filter(Boolean));
    addCard([document.getElementById("autoValuableSellerSection")].filter(Boolean));
    const allSections = mainView.querySelectorAll(":scope > .section");
    let marketsSection = null;
    for (const s of allSections) {
      if (s.querySelector("#marketContainer")) {
        marketsSection = s;
        break;
      }
    }
    if (marketsSection) {
      wrappedEls.add(marketsSection);
      const mTitle = marketsSection.querySelector(":scope > .section-title");
      const subSections = marketsSection.querySelectorAll(":scope > .sub-section");
      const overlays = [
        marketsSection.querySelector("#marketInfoOverlay"),
        marketsSection.querySelector("#marketInfoPopup")
      ].filter(Boolean);
      if (subSections.length > 0) {
        const firstGroup = [mTitle, subSections[0]].filter(Boolean);
        if (subSections.length === 1) firstGroup.push(...overlays);
        addGroupCard(firstGroup, "markets");
        for (let mi = 1; mi < subSections.length; mi++) {
          const group = [subSections[mi]];
          if (mi === subSections.length - 1) group.push(...overlays);
          addGroupCard(group, "markets");
        }
      } else {
        addGroupCard([marketsSection], "markets");
      }
    }
    let expeditionsSection = null;
    for (const s of allSections) {
      if (s.querySelector("#expeditionInfoContainer") || s.querySelector("#activeExpeditionSection")) {
        expeditionsSection = s;
        break;
      }
    }
    if (expeditionsSection) {
      wrappedEls.add(expeditionsSection);
      addCard([expeditionsSection]);
    }
    let loadoutSection = null;
    for (const s of allSections) {
      if (s.querySelector("#refreshLoadoutBtn") || s.querySelector("#loadoutHwContainer")) {
        loadoutSection = s;
        break;
      }
    }
    if (loadoutSection) {
      wrappedEls.add(loadoutSection);
      const ldChildren = Array.from(loadoutSection.children);
      const swToggleIdx = ldChildren.findIndex((el) => el.querySelector("#loadoutSwToggle") || el.id === "loadoutSwToggle");
      const ovToggleIdx = ldChildren.findIndex((el) => el.querySelector("#loadoutOverviewToggle") || el.id === "loadoutOverviewToggle");
      const ldSplits = [swToggleIdx, ovToggleIdx].filter((i) => i >= 0).sort((a, b) => a - b);
      if (ldSplits.length > 0) {
        addGroupCard(ldChildren.slice(0, ldSplits[0]), "loadout");
        for (let li = 0; li < ldSplits.length; li++) {
          const start = ldSplits[li];
          const end = li + 1 < ldSplits.length ? ldSplits[li + 1] : ldChildren.length;
          addGroupCard(ldChildren.slice(start, end), "loadout");
        }
      } else {
        addGroupCard([loadoutSection], "loadout");
      }
    }
    addCard([document.getElementById("alarmsSection")].filter(Boolean));
    addCard([document.getElementById("automationSection")].filter(Boolean));
    const versionEls = [];
    const vi = document.getElementById("versionInfoSection");
    if (vi) {
      const p = vi.closest('div[style*="border-top"]');
      if (p) versionEls.push(p);
    }
    const cb = document.getElementById("checkUpdateBtn");
    if (cb) {
      const p = cb.closest('div[style*="text-align:center"]');
      if (p) versionEls.push(p);
    }
    const st = document.getElementById("status");
    if (st) versionEls.push(st);
    const modifiedNote = document.getElementById("modifiedVersionNote");
    if (modifiedNote) versionEls.push(modifiedNote);
    addCard(versionEls);
    if (marketsSection) marketsSection.remove();
    if (loadoutSection) loadoutSection.remove();
    const remaining2 = Array.from(mainView.children).filter(
      (el) => !wrappedEls.has(el) && el !== headerRow && !el.classList.contains("theme-dropdown") && el !== grid
    );
    for (const el of remaining2) {
      if (el.nodeType !== 1) continue;
      if (el.id === "popoutGrid") continue;
      const card = document.createElement("div");
      card.className = "popout-card";
      card.appendChild(el);
      grid.appendChild(card);
    }
    mainView.insertBefore(grid, insertRef);
  })();
  if (popOutBtn) {
    popOutBtn.addEventListener("click", () => {
      chrome.windows.create({
        url: chrome.runtime.getURL("popup.html?mode=popout"),
        type: "popup",
        width: 360,
        height: 700
      });
      window.close();
    });
  }
  if (sidePanelBtn) {
    sidePanelBtn.addEventListener("click", async () => {
      try {
        const tab = await getCor3Tab();
        if (!tab) {
          statusDiv.textContent = "No cor3.gg tab found.";
          return;
        }
        await chrome.sidePanel.open({ tabId: tab.id });
        window.close();
      } catch (e) {
        statusDiv.textContent = "Side panel not supported in this browser.";
      }
    });
  }

  // src/popup/section-groups.js
  var groups = [
    { name: "markets", label: "Markets", buttonId: "marketsGroupToggle", key: "marketsGroupCollapsed" },
    { name: "loadout", label: "Loadout", buttonId: "loadoutGroupToggle", key: "loadoutGroupCollapsed" },
    { name: "automation", label: "Automation/QoL Toggles", buttonId: "automationGroupToggle", key: "automationGroupCollapsed" },
    { name: "daily", label: "Daily Ops", buttonId: "dailyGroupToggle", key: "dailyGroupCollapsed" },
    { name: "expeditions", label: "\u8FDC\u5F81", buttonId: "expeditionsGroupToggle", key: "expeditionsGroupCollapsed" }
  ];
  for (const group of groups) {
    let render3 = function(value) {
      collapsed = value === true;
      button2.setAttribute("aria-expanded", String(!collapsed));
      button2.title = group.name === "expeditions" ? collapsed ? "\u5C55\u5F00\u8FDC\u5F81" : "\u6536\u8D77\u8FDC\u5F81" : (collapsed ? "Expand " : "Collapse ") + group.label;
      arrow.textContent = collapsed ? "\u25B6" : "\u25BC";
      for (const element of content) element.classList.toggle("section-group-hidden", collapsed);
      for (const card of cards) {
        card.classList.toggle("section-group-hidden", collapsed && !card.contains(button2));
      }
    };
    render4 = render3;
    const button2 = document.getElementById(group.buttonId);
    if (!button2) continue;
    const content = [...document.querySelectorAll('[data-section-group-content="' + group.name + '"]')];
    const cards = [...document.querySelectorAll('[data-section-group-card="' + group.name + '"]')];
    const arrow = button2.querySelector(".group-collapse-arrow");
    let collapsed = false;
    let touched = false;
    button2.setAttribute("aria-controls", content.map((element) => element.id).filter(Boolean).join(" "));
    render3(false);
    chrome.storage.local.get(group.key, (data) => {
      if (!touched) render3(data[group.key]);
    });
    button2.addEventListener("click", () => {
      touched = true;
      render3(!collapsed);
      chrome.storage.local.set({ [group.key]: collapsed });
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes[group.key]) render3(changes[group.key].newValue);
    });
  }
  var render4;

  // src/popup/timestamps.js
  var dailyLastUpdated = document.getElementById("dailyLastUpdated");
  var coreMarketLastUpdated = document.getElementById("coreMarketLastUpdated");
  var darkMarketLastUpdated = document.getElementById("darkMarketLastUpdated");
  var soyuzMarketLastUpdated = document.getElementById("soyuzMarketLastUpdated");
  var usolMarketLastUpdated = document.getElementById("usolMarketLastUpdated");
  var loadoutLastUpdated = document.getElementById("loadoutLastUpdated");
  function refreshAllTimestamps() {
    showLastUpdated(dailyLastUpdated, "dailyOpsUpdatedAt");
    showLastUpdated(coreMarketLastUpdated, "marketDataUpdatedAt");
    showLastUpdated(darkMarketLastUpdated, "darkMarketDataUpdatedAt");
    showLastUpdated(soyuzMarketLastUpdated, "soyuzMarketDataUpdatedAt");
    showLastUpdated(usolMarketLastUpdated, "usolMarketDataUpdatedAt");
    if (loadoutLastUpdated) showLastUpdated(loadoutLastUpdated, "loadoutUpdatedAt");
  }

  // src/popup/dom-helpers.js
  function _h(tag, attrs, ...children) {
    const e = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (k === "className") e.className = v;
        else if (k === "textContent") e.textContent = v;
        else if (k === "title") e.title = v;
        else if (k.startsWith("on")) e.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === "style" && typeof v === "string") e.style.cssText = v;
        else if (k === "dataset" && typeof v === "object") {
          for (const [dk, dv] of Object.entries(v)) e.dataset[dk] = dv;
        } else e.setAttribute(k, v);
      }
    }
    for (const c of children) {
      if (c == null || c === false) continue;
      if (typeof c === "string" || typeof c === "number") e.appendChild(document.createTextNode(String(c)));
      else if (c instanceof Node) e.appendChild(c);
      else if (Array.isArray(c)) c.forEach((x) => {
        if (x instanceof Node) e.appendChild(x);
        else if (x != null && x !== false) e.appendChild(document.createTextNode(String(x)));
      });
    }
    return e;
  }
  function _noData(...parts) {
    const d = document.createElement("div");
    d.className = "no-decisions";
    parts.forEach((p, i) => {
      if (i > 0) d.appendChild(document.createElement("br"));
      d.appendChild(document.createTextNode(p));
    });
    return d;
  }
  function _clearEl(el) {
    el.textContent = "";
  }
  function _safeSetHtml(el, html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    el.replaceChildren(...doc.body.childNodes);
  }

  // src/popup/daily-ops.js
  var dailyTimerLine = document.getElementById("dailyTimerLine");
  var dailyStatusLine = document.getElementById("dailyStatusLine");
  var dailyClaimed = document.getElementById("dailyClaimed");
  var dailyStreak = document.getElementById("dailyStreak");
  var dailyDifficulty = document.getElementById("dailyDifficulty");
  var dailyStreakBonus = document.getElementById("dailyStreakBonus");
  var refreshDailyBtn = document.getElementById("refreshDailyBtn");
  function updateDailyTimer() {
    if (!state.dailyNextTaskTime) {
      dailyTimerLine.textContent = "\u23F3 Next Task: --:--:--";
      return;
    }
    const now = Date.now();
    const diff = state.dailyNextTaskTime - now;
    if (diff <= 0) {
      dailyTimerLine.textContent = "\u23F3 Next Task: 0h:0m:0s";
      return;
    }
    const totalSec = Math.floor(diff / 1e3);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor(totalSec % 3600 / 60);
    const s = totalSec % 60;
    dailyTimerLine.textContent = `\u23F3 Next Task: ${h}h:${m}m:${s}s`;
  }
  function calcStreakBonus(streak, rewardsData) {
    if (!rewardsData || !Array.isArray(rewardsData) || streak === void 0 || streak === null) return "--";
    const dayEntry = rewardsData.find((r) => r.day === streak);
    if (dayEntry && dayEntry.amount !== void 0) return (dayEntry.amount / 100).toFixed(2);
    const sorted = rewardsData.filter((r) => r.day <= streak).sort((a, b) => b.day - a.day);
    if (sorted.length > 0 && sorted[0].amount !== void 0) return (sorted[0].amount / 100).toFixed(2);
    return "--";
  }
  async function displayDailyOpsData(data) {
    if (!data) return;
    state.dailyNextTaskTime = data.nextTaskTime ? new Date(data.nextTaskTime).getTime() : null;
    dailyClaimed.textContent = data.hasClaimedToday ? "Yes" : "No";
    dailyStreak.textContent = data.currentStreak ?? "--";
    dailyDifficulty.textContent = data.difficulty ? data.difficulty.charAt(0).toUpperCase() + data.difficulty.slice(1) : "--";
    const { dailyRewardsData } = await chrome.storage.local.get("dailyRewardsData");
    const bonus = calcStreakBonus(data.currentStreak, dailyRewardsData);
    dailyStreakBonus.textContent = bonus;
    updateDailyTimer();
  }
  async function fetchDailyOps() {
    dailyStatusLine.style.display = "";
    dailyStatusLine.replaceChildren(_h("span", { style: "color:var(--accent-cyan);" }, "\u23F3 Refreshing daily ops..."));
    try {
      const tab = await getCor3Tab();
      if (!tab) {
        dailyStatusLine.style.display = "";
        dailyStatusLine.replaceChildren(_h("span", { style: "color:var(--accent-red);" }, "\u26A0\uFE0F No cor3.gg tab found"));
        return;
      }
      console.log("[COR3 Helper] Sending fetchDailyOps message to content script");
      const response = await chrome.tabs.sendMessage(tab.id, { action: "fetchDailyOps" });
      if (response && response.error && (response.error === "token_expired" || response.error.includes("Invalid access token"))) {
        dailyStatusLine.style.display = "";
        dailyStatusLine.replaceChildren(_h("span", { style: "color:var(--accent-red);" }, "\u26A0\uFE0F Access token expired. Page refresh required."));
        return;
      }
      if (response && response.data) {
        console.log("[COR3 Helper] Daily ops data received:", response.data);
        await displayDailyOpsData(response.data);
        dailyStatusLine.style.display = "none";
        refreshAllTimestamps();
      } else if (response === void 0) {
        console.log("[COR3 Helper] No response from content script, trying cached data");
        const { dailyOpsData } = await chrome.storage.local.get("dailyOpsData");
        if (dailyOpsData) {
          await displayDailyOpsData(dailyOpsData);
          dailyStatusLine.style.display = "";
          dailyStatusLine.replaceChildren(_h("span", { style: "color:var(--accent-orange);" }, "\u26A0\uFE0F Using cached data (content script not responding)"));
        } else {
          dailyStatusLine.style.display = "";
          dailyStatusLine.replaceChildren(_h("span", { style: "color:var(--accent-red);" }, "\u26A0\uFE0F No data available. Refresh the page."));
        }
      } else {
        const { dailyOpsData } = await chrome.storage.local.get("dailyOpsData");
        if (dailyOpsData) await displayDailyOpsData(dailyOpsData);
      }
    } catch (e) {
      console.log("[COR3 Helper] Daily ops fetch error:", e);
      cor3LogError("popup.js", e, { action: "fetchDailyOps" });
      try {
        const { dailyOpsData } = await chrome.storage.local.get("dailyOpsData");
        if (dailyOpsData) {
          await displayDailyOpsData(dailyOpsData);
          dailyStatusLine.style.display = "";
          dailyStatusLine.replaceChildren(_h("span", { style: "color:var(--accent-orange);" }, "\u26A0\uFE0F Using cached data (error occurred)"));
        } else {
          dailyStatusLine.style.display = "";
          dailyStatusLine.replaceChildren(_h("span", { style: "color:var(--accent-red);" }, "\u26A0\uFE0F Failed to load daily ops"));
        }
      } catch (e2) {
        dailyStatusLine.style.display = "";
        dailyStatusLine.replaceChildren(_h("span", { style: "color:var(--accent-red);" }, "\u26A0\uFE0F Failed to load daily ops"));
      }
    }
  }
  async function loadCachedDailyOps() {
    try {
      const { dailyOpsData, dailyOpsError } = await chrome.storage.local.get(["dailyOpsData", "dailyOpsError"]);
      if (dailyOpsError === "token_expired") {
        dailyStatusLine.style.display = "";
        dailyStatusLine.replaceChildren(_h("span", { style: "color:var(--accent-red);" }, "\u26A0\uFE0F Access token expired. Page refresh required."));
      }
      if (dailyOpsData) await displayDailyOpsData(dailyOpsData);
    } catch (e) {
    }
  }
  function initDailyOps() {
    loadCachedDailyOps();
    refreshDailyBtn.addEventListener("click", () => fetchDailyOps());
  }
  initDailyOps();

  // src/popup/dev-tcs.js
  var devTcsSection = document.getElementById("devTcsSection");
  var reachPullBtn = document.getElementById("devTcReachPullBtn");
  var reachSelect = document.getElementById("devTcReachSelect");
  var reachToggle = document.getElementById("devTcReachToggle");
  var reachLog = document.getElementById("devTcReachLog");
  var _reachMapCache = null;
  function reachLogMsg(msg, color) {
    if (!reachLog) return;
    reachLog.style.display = "";
    const line2 = document.createElement("div");
    line2.textContent = "[" + (/* @__PURE__ */ new Date()).toLocaleTimeString() + "] " + msg;
    if (color) line2.style.color = color;
    reachLog.appendChild(line2);
    reachLog.scrollTop = reachLog.scrollHeight;
  }
  function clearReachLog() {
    if (reachLog) {
      reachLog.innerHTML = "";
      reachLog.style.display = "none";
    }
  }
  if (reachPullBtn) {
    reachPullBtn.addEventListener("click", async () => {
      reachPullBtn.disabled = true;
      reachPullBtn.textContent = "...";
      clearReachLog();
      reachLogMsg("Sending get.map...");
      const tab = await getCor3Tab();
      if (!tab) {
        reachLogMsg("No cor3.gg tab found", "var(--accent-red)");
        reachPullBtn.disabled = false;
        reachPullBtn.textContent = "\u{1F504}";
        return;
      }
      chrome.tabs.sendMessage(tab.id, { action: "requestNetworkMap" });
      const waitStart = Date.now();
      const poll = setInterval(async () => {
        const data = await chrome.storage.local.get("serverMaintenanceMap");
        if (data.serverMaintenanceMap && Object.keys(data.serverMaintenanceMap).length > 0) {
          clearInterval(poll);
          _reachMapCache = data.serverMaintenanceMap;
          populateReachSelect(data.serverMaintenanceMap);
          reachLogMsg("Map loaded: " + Object.keys(data.serverMaintenanceMap).length + " servers", "var(--accent-green)");
          reachPullBtn.disabled = false;
          reachPullBtn.textContent = "\u{1F504}";
        } else if (Date.now() - waitStart > 1e4) {
          clearInterval(poll);
          reachLogMsg("Timeout waiting for map data", "var(--accent-red)");
          reachPullBtn.disabled = false;
          reachPullBtn.textContent = "\u{1F504}";
        }
      }, 500);
    });
  }
  function populateReachSelect(servers) {
    if (!reachSelect) return;
    reachSelect.innerHTML = "";
    const defaultOpt = document.createElement("option");
    defaultOpt.value = "";
    defaultOpt.textContent = "\u2014 select server \u2014";
    reachSelect.appendChild(defaultOpt);
    const sorted = Object.entries(servers).sort((a, b) => (a[1].serverName || "").localeCompare(b[1].serverName || ""));
    for (const [id, info] of sorted) {
      const opt = document.createElement("option");
      opt.value = id;
      let label = info.serverName || id.substring(0, 8);
      if (info.isInMaintenance) label += " \u26D4";
      opt.textContent = label;
      reachSelect.appendChild(opt);
    }
  }
  if (reachToggle) {
    reachToggle.addEventListener("change", async () => {
      if (!reachToggle.checked) return;
      reachToggle.disabled = true;
      const serverId = reachSelect ? reachSelect.value : "";
      if (!serverId) {
        reachLogMsg("No server selected", "var(--accent-red)");
        reachToggle.checked = false;
        reachToggle.disabled = false;
        return;
      }
      const serverName = _reachMapCache && _reachMapCache[serverId] ? _reachMapCache[serverId].serverName : serverId.substring(0, 8);
      clearReachLog();
      reachLogMsg("Testing reachability to " + serverName + "...");
      const tab = await getCor3Tab();
      if (!tab) {
        reachLogMsg("No cor3.gg tab found", "var(--accent-red)");
        reachToggle.checked = false;
        reachToggle.disabled = false;
        return;
      }
      reachLogMsg("Connecting to " + serverName + "...");
      chrome.tabs.sendMessage(tab.id, { action: "devTcTestReachability", serverId });
      const resultKey = "_devTcReachResult";
      const progressKey = "_devTcReachProgress";
      await chrome.storage.local.remove([resultKey, progressKey]);
      let lastLogCount = 0;
      const waitStart = Date.now();
      const poll = setInterval(async () => {
        const progressData = await chrome.storage.local.get(progressKey);
        if (progressData[progressKey] && progressData[progressKey].log) {
          const lines = progressData[progressKey].log;
          for (let i = lastLogCount; i < lines.length; i++) {
            reachLogMsg(lines[i].msg, lines[i].color || null);
          }
          lastLogCount = lines.length;
        }
        const data = await chrome.storage.local.get(resultKey);
        if (data[resultKey]) {
          clearInterval(poll);
          const result = data[resultKey];
          for (let i = lastLogCount; i < (result.log || []).length; i++) {
            reachLogMsg(result.log[i].msg, result.log[i].color || null);
          }
          if (result.reachable) {
            reachLogMsg("Reachable: YES", "var(--accent-green)");
          } else {
            reachLogMsg("Reachable: NO \u2014 " + (result.reason || "unknown"), "var(--accent-red)");
          }
          chrome.storage.local.remove([resultKey, progressKey]);
          reachToggle.checked = false;
          reachToggle.disabled = false;
        } else if (Date.now() - waitStart > 3e5) {
          clearInterval(poll);
          reachLogMsg("Timeout waiting for reachability result (5m)", "var(--accent-red)");
          chrome.storage.local.remove([resultKey, progressKey]);
          reachToggle.checked = false;
          reachToggle.disabled = false;
        }
      }, 500);
    });
  }

  // src/popup/pinned-timers.js
  var pinnedTimersSection = document.getElementById("pinnedTimersSection");
  var pinnedTimersContainer = document.getElementById("pinnedTimersContainer");
  var pinDailyBtn = document.getElementById("pinDailyBtn");
  var pinCoreMarketBtn = document.getElementById("pinCoreMarketBtn");
  var pinDarkMarketBtn = document.getElementById("pinDarkMarketBtn");
  var pinSoyuzMarketBtn = document.getElementById("pinSoyuzMarketBtn");
  var pinUsolMarketBtn = document.getElementById("pinUsolMarketBtn");
  async function loadPinnedState() {
    const data = await chrome.storage.sync.get(["pinnedTimers", "autoRefresh"]);
    if (data.pinnedTimers) state.pinnedTimers = data.pinnedTimers;
    if (data.autoRefresh) state.autoRefresh = data.autoRefresh;
    updatePinButtons();
    renderPinnedTimers();
  }
  async function savePinnedState() {
    await chrome.storage.sync.set({ pinnedTimers: state.pinnedTimers, autoRefresh: state.autoRefresh });
  }
  function updatePinButtons() {
    pinDailyBtn.classList.toggle("pinned", !!state.pinnedTimers.daily);
    pinCoreMarketBtn.classList.toggle("pinned", !!state.pinnedTimers.home_jobs);
    pinDarkMarketBtn.classList.toggle("pinned", !!state.pinnedTimers.dark_jobs);
    pinSoyuzMarketBtn.classList.toggle("pinned", !!state.pinnedTimers.soyuz_jobs);
    pinUsolMarketBtn.classList.toggle("pinned", !!state.pinnedTimers.usol_jobs);
  }
  function renderPinnedTimers() {
    let anyPinned = state.pinnedTimers.daily || state.pinnedTimers.home_jobs || state.pinnedTimers.dark_jobs || state.pinnedTimers.soyuz_jobs || state.pinnedTimers.usol_jobs;
    if (!anyPinned) {
      for (const key of Object.keys(state.pinnedTimers)) {
        if (key.startsWith("exp_") && state.pinnedTimers[key]) {
          anyPinned = true;
          break;
        }
      }
    }
    pinnedTimersSection.style.display = anyPinned ? "" : "none";
    _clearEl(pinnedTimersContainer);
    if (state.pinnedTimers.daily) {
      const row = _h(
        "div",
        { className: "pinned-timer-row" },
        _h("div", null, _h("span", { className: "pinned-timer-symbol-daily" }, "\u{1F4C5} "), _h("span", { className: "pinned-timer-label" }, "Daily Ops")),
        _h("span", { className: "pinned-timer-value", id: "pinnedDailyValue" }, "--:--:--")
      );
      pinnedTimersContainer.appendChild(row);
    }
    function _buildJobRow(pinKey, symbolCls, symbol, name, valueId, autoRefreshId) {
      const row = _h(
        "div",
        { className: "pinned-timer-row" },
        _h("div", { style: "width: 200%;" }, _h("span", { className: symbolCls }, symbol + " "), _h("span", { className: "pinned-timer-label" }, name + " Jobs")),
        _h("span", { className: "pinned-timer-value", id: valueId }, "--:--:--")
      );
      if (!state.isHelper) {
        const cb = _h("input", { type: "checkbox", id: autoRefreshId });
        if (state.autoRefresh[pinKey]) cb.checked = true;
        row.appendChild(_h("label", { className: "pinned-auto-refresh", title: "Auto-refresh jobs when timer hits 0" }, cb, " Auto"));
        pinnedTimersContainer.appendChild(row);
        cb.addEventListener("change", async () => {
          state.autoRefresh[pinKey] = cb.checked;
          await savePinnedState();
          sendAutoRefreshToContent();
        });
      } else {
        pinnedTimersContainer.appendChild(row);
      }
    }
    if (state.pinnedTimers.home_jobs) _buildJobRow("home_jobs", "pinned-timer-symbol-core", "\u{1F3E0}", state.coreMarketName || "Market-1", "pinnedCoreJobsValue", "autoRefreshCore");
    if (state.pinnedTimers.dark_jobs) _buildJobRow("dark_jobs", "pinned-timer-symbol-dark", "\u{1F311}", state.darkMarketName || "Market-2", "pinnedDarkJobsValue", "autoRefreshDark");
    if (state.pinnedTimers.soyuz_jobs) _buildJobRow("soyuz_jobs", "pinned-timer-symbol-soyuz", "\u262D", state.soyuzMarketName || "Market-3", "pinnedSoyuzJobsValue", "autoRefreshSoyuz");
    if (state.pinnedTimers.usol_jobs) _buildJobRow("usol_jobs", "pinned-timer-symbol-usol", "\u262E", state.usolMarketName || "Market-4", "pinnedUsolJobsValue", "autoRefreshUsol");
    for (const key of Object.keys(state.pinnedTimers)) {
      if (!key.startsWith("exp_") || !state.pinnedTimers[key]) continue;
      const expId = key.substring(4);
      const endTime = state.expeditionEndTimes[expId];
      let expLabel = "Expedition";
      const row = _h(
        "div",
        { className: "pinned-timer-row" },
        _h("span", { className: "pinned-timer-label" }, "\u{1F3AF} ", _h("span", { className: "pinned-exp-label", dataset: { expId } }, expLabel)),
        _h("span", { className: "pinned-timer-value pinned-exp-timer", dataset: { expId } }, endTime ? formatTimeRemaining(endTime) : "--:--:--")
      );
      pinnedTimersContainer.appendChild(row);
    }
    chrome.storage.local.get("expeditionsData", async (result) => {
      const exps = result.expeditionsData || [];
      const activeExpIds = new Set(exps.map((e) => e.id));
      let staleRemoved = false;
      for (const key of Object.keys(state.pinnedTimers)) {
        if (key.startsWith("exp_") && state.pinnedTimers[key]) {
          const expId = key.substring(4);
          if (!activeExpIds.has(expId)) {
            delete state.pinnedTimers[key];
            delete state.expeditionEndTimes[expId];
            staleRemoved = true;
          }
        }
      }
      if (staleRemoved) {
        await savePinnedState();
        renderPinnedTimers();
        return;
      }
      for (const exp of exps) {
        if (exp.endTime) state.expeditionEndTimes[exp.id] = exp.endTime;
        const labelEl = pinnedTimersContainer.querySelector(`.pinned-exp-label[data-exp-id="${exp.id}"]`);
        if (labelEl) {
          labelEl.textContent = `${exp.locationName || "Expedition"} \u2014 ${exp.zoneName || ""}`;
        }
      }
    });
  }
  function updatePinnedTimerValues() {
    const pinnedDaily = document.getElementById("pinnedDailyValue");
    if (pinnedDaily) {
      if (!state.dailyNextTaskTime) {
        pinnedDaily.textContent = "--:--:--";
      } else {
        const diff = state.dailyNextTaskTime - Date.now();
        if (diff <= 0) {
          pinnedDaily.textContent = "0h:0m:0s";
        } else {
          const totalSec = Math.floor(diff / 1e3);
          const h = Math.floor(totalSec / 3600);
          const m = Math.floor(totalSec % 3600 / 60);
          const s = totalSec % 60;
          pinnedDaily.textContent = `${h}h:${m}m:${s}s`;
        }
      }
    }
    const pinnedCore = document.getElementById("pinnedCoreJobsValue");
    if (pinnedCore) {
      pinnedCore.textContent = state.coreNextJobsResetAt ? formatTimeRemaining(state.coreNextJobsResetAt) : "--:--:--";
    }
    const pinnedDark = document.getElementById("pinnedDarkJobsValue");
    if (pinnedDark) {
      pinnedDark.textContent = state.bmiNextJobsResetAt ? formatTimeRemaining(state.bmiNextJobsResetAt) : "--:--:--";
    }
    const pinnedSoyuz = document.getElementById("pinnedSoyuzJobsValue");
    if (pinnedSoyuz) {
      pinnedSoyuz.textContent = state.soyuzNextJobsResetAt ? formatTimeRemaining(state.soyuzNextJobsResetAt) : "--:--:--";
    }
    const pinnedUsol = document.getElementById("pinnedUsolJobsValue");
    if (pinnedUsol) {
      pinnedUsol.textContent = state.usolNextJobsResetAt ? formatTimeRemaining(state.usolNextJobsResetAt) : "--:--:--";
    }
    document.querySelectorAll(".pinned-exp-timer").forEach((el) => {
      const expId = el.dataset.expId;
      const endTime = state.expeditionEndTimes[expId];
      el.textContent = endTime ? formatTimeRemaining(endTime) : "--:--:--";
    });
  }
  async function sendAutoRefreshToContent() {
    const tab = await getCor3Tab();
    if (tab) {
      chrome.tabs.sendMessage(tab.id, {
        action: "updateAutoRefresh",
        autoRefresh: state.autoRefresh
      }).catch(() => {
      });
    }
  }
  function initPinnedTimers() {
    pinDailyBtn.addEventListener("click", async () => {
      state.pinnedTimers.daily = !state.pinnedTimers.daily;
      await savePinnedState();
      updatePinButtons();
      renderPinnedTimers();
    });
    pinCoreMarketBtn.addEventListener("click", async () => {
      state.pinnedTimers.home_jobs = !state.pinnedTimers.home_jobs;
      await savePinnedState();
      updatePinButtons();
      renderPinnedTimers();
    });
    pinDarkMarketBtn.addEventListener("click", async () => {
      state.pinnedTimers.dark_jobs = !state.pinnedTimers.dark_jobs;
      await savePinnedState();
      updatePinButtons();
      renderPinnedTimers();
    });
    pinSoyuzMarketBtn.addEventListener("click", async () => {
      state.pinnedTimers.soyuz_jobs = !state.pinnedTimers.soyuz_jobs;
      await savePinnedState();
      updatePinButtons();
      renderPinnedTimers();
    });
    pinUsolMarketBtn.addEventListener("click", async () => {
      state.pinnedTimers.usol_jobs = !state.pinnedTimers.usol_jobs;
      await savePinnedState();
      updatePinButtons();
      renderPinnedTimers();
    });
    loadPinnedState();
    chrome.storage.sync.get("autoRefresh", (data) => {
      if (data.autoRefresh) state.autoRefresh = data.autoRefresh;
      sendAutoRefreshToContent();
    });
  }
  initPinnedTimers();

  // src/shared/server-constants.js
  var HOME_SERVER_ID = "019c0a5b-eeeb-7d3e-b9c9-fd5c2ba7d399";
  var MARKET_IDS = {
    home: "019d3ea4-85bd-7389-904d-8f7c85841134",
    dark: "019d3ea4-85bd-7389-904d-908ba9194aa0",
    soyuz: "019da731-2db5-7d76-9447-1ea3b9b78001",
    usol: "019e4065-6ae8-760d-8724-58ab4f2cf7d7"
  };
  var MARKET_SERVER_IDS = {
    dark: "019d29c5-4b37-79bf-b23e-304d8ea03c15",
    soyuz: "019da6f1-16f7-75a6-b6d3-0b1d5f92a108",
    usol: "019e4052-c317-7388-9d71-883ffb1560cd"
  };
  var MARKET_SELL_ORDER = [
    { name: "USOL", id: MARKET_IDS.usol, serverId: MARKET_SERVER_IDS.usol },
    { name: "SOYUZ", id: MARKET_IDS.soyuz, serverId: MARKET_SERVER_IDS.soyuz },
    { name: "D4RK", id: MARKET_IDS.dark, serverId: MARKET_SERVER_IDS.dark },
    { name: "HOME", id: MARKET_IDS.home, serverId: null }
  ];
  var MARKET_RESET_DURATIONS_MS = {
    home: 6 * 60 * 60 * 1e3,
    dark: 12 * 60 * 60 * 1e3,
    soyuz: 10 * 60 * 60 * 1e3,
    usol: 8 * 60 * 60 * 1e3
  };

  // src/shared/server-map.js
  function ServerMap() {
    this._servers = {};
    this._adjacency = {};
    this._homeId = null;
    this._ready = false;
    this._pathCache = {};
    this._serverPriority = null;
  }
  ServerMap.prototype.update = function(mapData) {
    if (!mapData || !mapData.servers || !mapData.connections) return;
    this._servers = {};
    this._adjacency = {};
    this._pathCache = {};
    this._serverPriority = null;
    this._homeId = null;
    var servers = Array.isArray(mapData.servers) ? mapData.servers : [];
    var connections = Array.isArray(mapData.connections) ? mapData.connections : [];
    for (var i = 0; i < servers.length; i++) {
      var s = servers[i];
      this._servers[s.id] = {
        id: s.id,
        name: s.serverName,
        ip: s.serverIp,
        typeName: s.serverTypeName || null,
        cluster: s.serverCluster || null,
        faction: s.faction || null,
        defenceRate: s.serverDefenceRate || 0,
        isInMaintenance: !!s.isInMaintenance,
        maintenanceEndsAt: s.maintenanceEndsAt || null,
        timeUntilMaintenance: s.timeUntilMaintenance || null,
        isDiscovered: s.isDiscovered !== false,
        isAccessible: !!s.isAccessible,
        isReachable: !!s.isReachable,
        accessType: s.accessType || "none",
        hasAdminAccess: !!s.hasAdminAccess,
        isEndpoint: !!s.isEndpoint,
        canSetEndpoint: s.canSetEndpoint !== false,
        marketId: s.marketId || null,
        transitType: s.transitType || null
      };
      this._adjacency[s.id] = [];
      if (s.serverTypeName === "Home" || s.serverName === "Home Server" || s.id === HOME_SERVER_ID) {
        this._homeId = s.id;
      }
    }
    for (var j = 0; j < connections.length; j++) {
      var c = connections[j];
      if (this._adjacency[c.serverA] && this._adjacency[c.serverB]) {
        this._adjacency[c.serverA].push({ targetId: c.serverB, connectionId: c.id, isHidden: !!c.isHidden });
        this._adjacency[c.serverB].push({ targetId: c.serverA, connectionId: c.id, isHidden: !!c.isHidden });
      }
    }
    this._ready = true;
  };
  ServerMap.prototype.isReady = function() {
    return this._ready;
  };
  ServerMap.prototype.getServer = function(serverId) {
    return this._servers[serverId] || null;
  };
  ServerMap.prototype.getServerByName = function(name) {
    for (var id in this._servers) {
      if (this._servers[id].name === name) return this._servers[id];
    }
    return null;
  };
  ServerMap.prototype.getServerIdByName = function(name) {
    var s = this.getServerByName(name);
    return s ? s.id : null;
  };
  ServerMap.prototype.getAllServers = function() {
    return this._servers;
  };
  ServerMap.prototype.getHomeId = function() {
    return this._homeId;
  };
  ServerMap.prototype.findAllPaths = function(targetId, opts) {
    if (!this._ready || !this._homeId) return [];
    if (targetId === this._homeId) return [[]];
    var skipMaintenance = !opts || opts.skipMaintenance !== false;
    var maintFp = skipMaintenance ? this.getMaintenanceFingerprint() : "";
    var cacheKey = targetId + "|" + (skipMaintenance ? "sm:" + maintFp : "all");
    if (this._pathCache[cacheKey]) return this._pathCache[cacheKey];
    var allPaths = [];
    var visited = {};
    var self = this;
    function dfs(currentId, path) {
      if (currentId === targetId) {
        allPaths.push(path.slice());
        return;
      }
      var neighbors = self._adjacency[currentId];
      if (!neighbors) return;
      for (var i = 0; i < neighbors.length; i++) {
        var nb = neighbors[i];
        if (!visited[nb.targetId]) {
          if (skipMaintenance && nb.targetId !== targetId) {
            var srv = self._servers[nb.targetId];
            if (srv && srv.isInMaintenance) {
              var remaining2 = srv.maintenanceEndsAt ? new Date(srv.maintenanceEndsAt).getTime() - Date.now() : 0;
              if (remaining2 > 0) continue;
            }
          }
          visited[nb.targetId] = true;
          path.push({ id: nb.targetId, name: (self._servers[nb.targetId] || {}).name || nb.targetId, isHidden: nb.isHidden });
          dfs(nb.targetId, path);
          path.pop();
          visited[nb.targetId] = false;
        }
      }
    }
    visited[this._homeId] = true;
    dfs(this._homeId, []);
    allPaths.sort(function(a, b) {
      return a.length - b.length;
    });
    this._pathCache[cacheKey] = allPaths;
    return allPaths;
  };
  ServerMap.prototype.getShortestPath = function(targetId) {
    var paths = this.findAllPaths(targetId);
    return paths.length > 0 ? paths[0] : null;
  };
  ServerMap.prototype.getShortestPathByName = function(serverName) {
    var id = this.getServerIdByName(serverName);
    if (!id) return null;
    return this.getShortestPath(id);
  };
  ServerMap.prototype.findAllPathsByName = function(serverName) {
    var id = this.getServerIdByName(serverName);
    if (!id) return [];
    return this.findAllPaths(id);
  };
  ServerMap.prototype.checkPathMaintenance = function(targetServerNameOrId) {
    if (!this._ready) return { blocked: false };
    var targetId = this._servers[targetServerNameOrId] ? targetServerNameOrId : this.getServerIdByName(targetServerNameOrId);
    if (!targetId) return { blocked: false };
    var reachablePaths = this.findAllPaths(targetId);
    if (reachablePaths.length > 0) return { blocked: false, usedPath: reachablePaths[0] };
    var allPaths = this.findAllPaths(targetId, { skipMaintenance: false });
    if (allPaths.length === 0) return { blocked: true, blockerName: "no-path", endsAt: null, remainingMs: 0 };
    var firstBlocker = null;
    var firstPath = allPaths[0];
    for (var bi = 0; bi < firstPath.length; bi++) {
      var bsrv = this._servers[firstPath[bi].id];
      if (bsrv && bsrv.isInMaintenance) {
        var bRemaining = bsrv.maintenanceEndsAt ? new Date(bsrv.maintenanceEndsAt).getTime() - Date.now() : 0;
        if (bRemaining > 0) {
          firstBlocker = { blocked: true, blockerName: bsrv.name, endsAt: bsrv.maintenanceEndsAt, remainingMs: bRemaining };
          break;
        }
      }
    }
    return firstBlocker || { blocked: true, blockerName: "unknown", endsAt: null, remainingMs: 0 };
  };
  ServerMap.prototype.findBestReachablePath = function(targetServerNameOrId) {
    if (!this._ready) return null;
    var targetId = this._servers[targetServerNameOrId] ? targetServerNameOrId : this.getServerIdByName(targetServerNameOrId);
    if (!targetId) return null;
    var allPaths = this.findAllPaths(targetId);
    return allPaths.length > 0 ? allPaths[0] : null;
  };
  ServerMap.prototype.getMaintenanceFingerprint = function() {
    var parts = [];
    for (var id in this._servers) {
      var s = this._servers[id];
      if (s.isInMaintenance) {
        parts.push(id + ":M:" + (s.maintenanceEndsAt || ""));
      } else if (s.timeUntilMaintenance) {
        parts.push(id + ":U:" + s.timeUntilMaintenance);
      }
    }
    parts.sort();
    return parts.join("|");
  };
  ServerMap.prototype.getServerPriority = function() {
    if (this._serverPriority) return this._serverPriority;
    if (!this._ready || !this._homeId) return [];
    var result = [];
    for (var id in this._servers) {
      if (id === this._homeId) continue;
      var s = this._servers[id];
      var path = this.getShortestPath(id);
      if (path) {
        result.push({ id, name: s.name, pathLength: path.length });
      }
    }
    result.sort(function(a, b) {
      return b.pathLength - a.pathLength;
    });
    this._serverPriority = result.map(function(r) {
      return r.name;
    });
    return this._serverPriority;
  };
  ServerMap.prototype.getServerPriorityIndex = function(serverName) {
    if (!serverName || serverName === "None") return -1;
    var priority = this.getServerPriority();
    var idx = priority.indexOf(serverName);
    return idx >= 0 ? idx : priority.length;
  };
  ServerMap.prototype.getMaintenanceInfo = function() {
    var info = {};
    for (var id in this._servers) {
      var s = this._servers[id];
      info[id] = {
        serverName: s.name,
        isInMaintenance: s.isInMaintenance,
        maintenanceEndsAt: s.maintenanceEndsAt,
        timeUntilMaintenance: s.timeUntilMaintenance
      };
    }
    return info;
  };
  ServerMap.prototype.getServerTypeMap = function() {
    var map = {};
    for (var id in this._servers) {
      var s = this._servers[id];
      map[id] = {
        serverName: s.name,
        serverTypeName: s.typeName,
        serverDefenceRate: s.defenceRate
      };
    }
    return map;
  };
  ServerMap.prototype.toJSON = function() {
    return {
      servers: this._servers,
      adjacency: this._adjacency,
      homeId: this._homeId,
      ready: this._ready
    };
  };
  ServerMap.prototype.fromJSON = function(json) {
    if (!json) return;
    this._servers = json.servers || {};
    this._adjacency = json.adjacency || {};
    this._homeId = json.homeId || null;
    this._ready = !!json.ready;
    this._pathCache = {};
    this._serverPriority = null;
  };
  ServerMap.prototype.getPathForServer = function(serverName) {
    if (this._ready) {
      var id = this.getServerIdByName(serverName);
      if (id) {
        var path = this.getShortestPath(id);
        if (path) return path;
      }
    }
    return FALLBACK_PATH_MAP[serverName] || null;
  };
  ServerMap.prototype.getServerNameById = function(serverId) {
    if (this._ready) {
      var s = this._servers[serverId];
      if (s) return s.name;
    }
    for (var name in FALLBACK_PATH_MAP) {
      var path = FALLBACK_PATH_MAP[name];
      for (var i = 0; i < path.length; i++) {
        if (path[i].id === serverId) return path[i].name;
      }
    }
    return null;
  };
  ServerMap.prototype.getPathForServerId = function(serverId) {
    if (this._ready) {
      var path = this.getShortestPath(serverId);
      if (path) return path;
    }
    for (var name in FALLBACK_PATH_MAP) {
      var path = FALLBACK_PATH_MAP[name];
      if (path.length > 0 && path[path.length - 1].id === serverId) {
        return path;
      }
    }
    return null;
  };
  ServerMap.prototype.getServerIdByNameOrFallback = function(serverName) {
    if (this._ready) {
      var id = this.getServerIdByName(serverName);
      if (id) return id;
    }
    var fb = FALLBACK_PATH_MAP[serverName];
    if (fb && fb.length > 0) return fb[fb.length - 1].id;
    return null;
  };
  ServerMap.prototype.getAllServerIds = function() {
    if (this._ready) {
      var result = {};
      for (var id in this._servers) {
        result[id] = this._servers[id].name;
      }
      return result;
    }
    var result = {};
    for (var name in FALLBACK_PATH_MAP) {
      var path = FALLBACK_PATH_MAP[name];
      var last = path[path.length - 1];
      result[last.id] = name;
    }
    return result;
  };
  ServerMap.prototype.getPathLength = function(serverId) {
    if (this._ready) {
      var path = this.getShortestPath(serverId);
      if (path) return path.length;
    }
    for (var name in FALLBACK_PATH_MAP) {
      var p = FALLBACK_PATH_MAP[name];
      var last = p[p.length - 1];
      if (last.id === serverId) return p.length;
    }
    return 0;
  };
  var FALLBACK_PATH_MAP = {
    "RM7-E1L3": [
      { name: "RM7-E1L3", id: "019d1b0a-13a9-77dd-b41f-33f06f2df284" }
    ],
    "RM7-E1L5": [
      { name: "RM7-E1L5", id: "019d1b0a-13a9-77dd-b41f-374ee144bd07" }
    ],
    "RM7-E1L2CT": [
      { name: "RM7-E1L5", id: "019d1b0a-13a9-77dd-b41f-374ee144bd07" },
      { name: "RM7-E1L2CT", id: "019d53aa-5101-7f08-b3dd-378b0ddcf7d0" }
    ],
    "RM7-E1SCP": [
      { name: "RM7-E1L5", id: "019d1b0a-13a9-77dd-b41f-374ee144bd07" },
      { name: "RM7-E1SCP", id: "019d1b0a-13a9-77dd-b41f-3a21d490cb2d" }
    ],
    "RM7-S4L4": [
      { name: "RM7-E1L5", id: "019d1b0a-13a9-77dd-b41f-374ee144bd07" },
      { name: "RM7-E1SCP", id: "019d1b0a-13a9-77dd-b41f-3a21d490cb2d" },
      { name: "RM7-S4L4", id: "019d1b0a-13a9-77dd-b41f-3ffb5f671742" }
    ],
    "D4RK RM7CE": [
      { name: "RM7-E1L5", id: "019d1b0a-13a9-77dd-b41f-374ee144bd07" },
      { name: "RM7-E1SCP", id: "019d1b0a-13a9-77dd-b41f-3a21d490cb2d" },
      { name: "D4RK RM7CE", id: "019d29c5-4b37-7436-aef9-89af09560af3" }
    ],
    "D4RK RM7MI": [
      { name: "RM7-E1L5", id: "019d1b0a-13a9-77dd-b41f-374ee144bd07" },
      { name: "RM7-E1SCP", id: "019d1b0a-13a9-77dd-b41f-3a21d490cb2d" },
      { name: "D4RK RM7CE", id: "019d29c5-4b37-7436-aef9-89af09560af3" },
      { name: "D4RK RM7MI", id: "019d29c5-4b37-79bf-b23e-304d8ea03c15" }
    ],
    "D4RK 2IV2": [
      { name: "RM7-E1L5", id: "019d1b0a-13a9-77dd-b41f-374ee144bd07" },
      { name: "RM7-E1SCP", id: "019d1b0a-13a9-77dd-b41f-3a21d490cb2d" },
      { name: "D4RK RM7CE", id: "019d29c5-4b37-7436-aef9-89af09560af3" },
      { name: "D4RK 2IV2", id: "019d29c5-4b37-7de9-b46c-022179bcb5eb" }
    ],
    "RM7-N2ECP": [
      { name: "RM7-E1L3", id: "019d1b0a-13a9-77dd-b41f-33f06f2df284" },
      { name: "RM7-N2ECP", id: "019da6f1-16f7-75a6-b6d3-0b1d5f92a105" }
    ],
    "RM7-N2L2": [
      { name: "RM7-E1L3", id: "019d1b0a-13a9-77dd-b41f-33f06f2df284" },
      { name: "RM7-N2ECP", id: "019da6f1-16f7-75a6-b6d3-0b1d5f92a105" },
      { name: "RM7-N2L2", id: "019da6f1-16f7-75a6-b6d3-0b1d5f92a101" }
    ],
    "RM7-N2L3": [
      { name: "RM7-E1L3", id: "019d1b0a-13a9-77dd-b41f-33f06f2df284" },
      { name: "RM7-N2ECP", id: "019da6f1-16f7-75a6-b6d3-0b1d5f92a105" },
      { name: "RM7-N2L2", id: "019da6f1-16f7-75a6-b6d3-0b1d5f92a101" },
      { name: "RM7-N2L3", id: "019da6f1-16f7-75a6-b6d3-0b1d5f92a102" }
    ],
    "RM7-W3NCP": [
      { name: "RM7-E1L3", id: "019d1b0a-13a9-77dd-b41f-33f06f2df284" },
      { name: "RM7-N2ECP", id: "019da6f1-16f7-75a6-b6d3-0b1d5f92a105" },
      { name: "RM7-N2L2", id: "019da6f1-16f7-75a6-b6d3-0b1d5f92a101" },
      { name: "RM7-N2L3", id: "019da6f1-16f7-75a6-b6d3-0b1d5f92a102" },
      { name: "RM7-W3NCP", id: "019da6f1-16f7-75a6-b6d3-0b1d5f92a106" }
    ],
    "RM7-N1L1": [
      { name: "RM7-E1L3", id: "019d1b0a-13a9-77dd-b41f-33f06f2df284" },
      { name: "RM7-N2ECP", id: "019da6f1-16f7-75a6-b6d3-0b1d5f92a105" },
      { name: "RM7-N2L2", id: "019da6f1-16f7-75a6-b6d3-0b1d5f92a101" },
      { name: "RM7-N2L3", id: "019da6f1-16f7-75a6-b6d3-0b1d5f92a102" },
      { name: "RM7-W3NCP", id: "019da6f1-16f7-75a6-b6d3-0b1d5f92a106" },
      { name: "RM7-N1L1", id: "019da6f1-16f7-75a6-b6d3-0b1d5f92a104" }
    ],
    "RM7-S4L2": [
      { name: "RM7-E1L5", id: "019d1b0a-13a9-77dd-b41f-374ee144bd07" },
      { name: "RM7-E1SCP", id: "019d1b0a-13a9-77dd-b41f-3a21d490cb2d" },
      { name: "RM7-S4L2", id: "019e4052-c316-73aa-81f6-38c323c58eb2" }
    ],
    "RM7-S4L3": [
      { name: "RM7-E1L5", id: "019d1b0a-13a9-77dd-b41f-374ee144bd07" },
      { name: "RM7-E1SCP", id: "019d1b0a-13a9-77dd-b41f-3a21d490cb2d" },
      { name: "RM7-S4L2", id: "019e4052-c316-73aa-81f6-38c323c58eb2" },
      { name: "RM7-S4L3", id: "019e4052-c316-73aa-81f6-3dcef4d6873e" }
    ],
    "RM7-S4L1": [
      { name: "RM7-E1L5", id: "019d1b0a-13a9-77dd-b41f-374ee144bd07" },
      { name: "RM7-E1SCP", id: "019d1b0a-13a9-77dd-b41f-3a21d490cb2d" },
      { name: "RM7-S4L4", id: "019d1b0a-13a9-77dd-b41f-3ffb5f671742" },
      { name: "RM7-S4L1", id: "019e4052-c315-71df-80da-4e334b96c9e6" }
    ],
    "RM7-S4WCP": [
      { name: "RM7-E1L5", id: "019d1b0a-13a9-77dd-b41f-374ee144bd07" },
      { name: "RM7-E1SCP", id: "019d1b0a-13a9-77dd-b41f-3a21d490cb2d" },
      { name: "RM7-S4L2", id: "019e4052-c316-73aa-81f6-38c323c58eb2" },
      { name: "RM7-S4WCP", id: "019e4052-c316-73aa-81f6-448645a38c9e" }
    ],
    "D4RK RM7EG": [
      { name: "RM7-E1L5", id: "019d1b0a-13a9-77dd-b41f-374ee144bd07" },
      { name: "RM7-E1SCP", id: "019d1b0a-13a9-77dd-b41f-3a21d490cb2d" },
      { name: "D4RK RM7CE", id: "019d29c5-4b37-7436-aef9-89af09560af3" },
      { name: "D4RK RM7MI", id: "019d29c5-4b37-79bf-b23e-304d8ea03c15" },
      { name: "D4RK RM7EG", id: "019e4052-c316-73aa-81f6-483e50247e61" }
    ],
    "B43271N": [
      { name: "RM7-E1L5", id: "019d1b0a-13a9-77dd-b41f-374ee144bd07" },
      { name: "RM7-E1L2CT", id: "019d53aa-5101-7f08-b3dd-378b0ddcf7d0" },
      { name: "B43271N", id: "019e4052-c316-73aa-81f6-567c9a8f5738" }
    ],
    "B43272N": [
      { name: "RM7-E1L5", id: "019d1b0a-13a9-77dd-b41f-374ee144bd07" },
      { name: "RM7-E1L2CT", id: "019d53aa-5101-7f08-b3dd-378b0ddcf7d0" },
      { name: "B43271N", id: "019e4052-c316-73aa-81f6-567c9a8f5738" },
      { name: "B43272N", id: "019e4052-c316-73aa-81f6-5aa82fc72bdd" }
    ],
    "B43274N": [
      { name: "RM7-E1L5", id: "019d1b0a-13a9-77dd-b41f-374ee144bd07" },
      { name: "RM7-E1SCP", id: "019d1b0a-13a9-77dd-b41f-3a21d490cb2d" },
      { name: "D4RK RM7CE", id: "019d29c5-4b37-7436-aef9-89af09560af3" },
      { name: "D4RK RM7MI", id: "019d29c5-4b37-79bf-b23e-304d8ea03c15" },
      { name: "D4RK RM7EG", id: "019e4052-c316-73aa-81f6-483e50247e61" },
      { name: "B43274N", id: "019e4052-c316-73aa-81f6-60ec61b61f0a" }
    ],
    "URM7-S5L2": [
      { name: "RM7-E1L5", id: "019d1b0a-13a9-77dd-b41f-374ee144bd07" },
      { name: "RM7-E1SCP", id: "019d1b0a-13a9-77dd-b41f-3a21d490cb2d" },
      { name: "RM7-S4L2", id: "019e4052-c316-73aa-81f6-38c323c58eb2" },
      { name: "RM7-S4L3", id: "019e4052-c316-73aa-81f6-3dcef4d6873e" },
      { name: "URM7-S5L2", id: "019e4052-c317-7388-9d71-85b98a02d5fb" }
    ],
    "URM7-M": [
      { name: "RM7-E1L5", id: "019d1b0a-13a9-77dd-b41f-374ee144bd07" },
      { name: "RM7-E1SCP", id: "019d1b0a-13a9-77dd-b41f-3a21d490cb2d" },
      { name: "RM7-S4L2", id: "019e4052-c316-73aa-81f6-38c323c58eb2" },
      { name: "RM7-S4L3", id: "019e4052-c316-73aa-81f6-3dcef4d6873e" },
      { name: "URM7-S5L2", id: "019e4052-c317-7388-9d71-85b98a02d5fb" },
      { name: "URM7-M", id: "019e4052-c317-7388-9d71-883ffb1560cd" }
    ],
    "URM7-H": [
      { name: "RM7-E1L5", id: "019d1b0a-13a9-77dd-b41f-374ee144bd07" },
      { name: "RM7-E1SCP", id: "019d1b0a-13a9-77dd-b41f-3a21d490cb2d" },
      { name: "RM7-S4L4", id: "019d1b0a-13a9-77dd-b41f-3ffb5f671742" },
      { name: "RM7-S4L1", id: "019e4052-c315-71df-80da-4e334b96c9e6" },
      { name: "URM7-H", id: "019e4052-c317-7388-9d71-8fed6faaaf99" }
    ],
    "SRM7-M": [
      { name: "RM7-E1L3", id: "019d1b0a-13a9-77dd-b41f-33f06f2df284" },
      { name: "RM7-N2ECP", id: "019da6f1-16f7-75a6-b6d3-0b1d5f92a105" },
      { name: "RM7-N2L2", id: "019da6f1-16f7-75a6-b6d3-0b1d5f92a101" },
      { name: "RM7-N2L3", id: "019da6f1-16f7-75a6-b6d3-0b1d5f92a102" },
      { name: "RM7-W3NCP", id: "019da6f1-16f7-75a6-b6d3-0b1d5f92a106" },
      { name: "RM7-N1L1", id: "019da6f1-16f7-75a6-b6d3-0b1d5f92a104" },
      { name: "RM7-N3L1", id: "019da6f1-16f7-75a6-b6d3-0b1d5f92a107" },
      { name: "SRM7-M", id: "019da6f1-16f7-75a6-b6d3-0b1d5f92a108" }
    ],
    "SRM7-N3L2": [
      { name: "RM7-E1L3", id: "019d1b0a-13a9-77dd-b41f-33f06f2df284" },
      { name: "RM7-N2ECP", id: "019da6f1-16f7-75a6-b6d3-0b1d5f92a105" },
      { name: "RM7-N2L2", id: "019da6f1-16f7-75a6-b6d3-0b1d5f92a101" },
      { name: "RM7-N2L3", id: "019da6f1-16f7-75a6-b6d3-0b1d5f92a102" },
      { name: "RM7-W3NCP", id: "019da6f1-16f7-75a6-b6d3-0b1d5f92a106" },
      { name: "RM7-N1L1", id: "019da6f1-16f7-75a6-b6d3-0b1d5f92a104" },
      { name: "RM7-N3L1", id: "019da6f1-16f7-75a6-b6d3-0b1d5f92a107" },
      { name: "SRM7-M", id: "019da6f1-16f7-75a6-b6d3-0b1d5f92a108" },
      { name: "SRM7-N3L2", id: "019da6f1-16f7-75a6-b6d3-0b1d5f92a109" }
    ]
  };
  function findMaintenanceBlocker(serverMaintenanceMap, marketKey) {
    var pathKey = marketKey === "dark" ? "D4RK RM7MI" : marketKey === "soyuz" ? "SRM7-M" : marketKey === "usol" ? "URM7-M" : null;
    if (!pathKey || !serverMaintenanceMap) return null;
    var path = FALLBACK_PATH_MAP[pathKey];
    if (!path) return null;
    var now = Date.now();
    for (var i = 0; i < path.length; i++) {
      var info = serverMaintenanceMap[path[i].id];
      if (info && info.isInMaintenance && info.maintenanceEndsAt) {
        var remaining2 = new Date(info.maintenanceEndsAt).getTime() - now;
        if (remaining2 > 0) {
          return { blockerName: info.serverName || path[i].name, maintenanceEndsAt: info.maintenanceEndsAt };
        }
      }
    }
    return null;
  }

  // src/popup/markets.js
  var marketContainer = document.getElementById("marketContainer");
  var darkMarketContainer = document.getElementById("darkMarketContainer");
  var soyuzMarketContainer = document.getElementById("soyuzMarketContainer");
  var usolMarketContainer = document.getElementById("usolMarketContainer");
  var refreshMarketBtn = document.getElementById("refreshMarketBtn");
  var refreshDarkMarketBtn = document.getElementById("refreshDarkMarketBtn");
  var refreshSoyuzMarketBtn = document.getElementById("refreshSoyuzMarketBtn");
  var refreshUsolMarketBtn = document.getElementById("refreshUsolMarketBtn");
  var coreMarketLabel = document.getElementById("coreMarketLabel");
  var darkMarketLabel = document.getElementById("darkMarketLabel");
  var soyuzMarketLabel = document.getElementById("soyuzMarketLabel");
  var usolMarketLabel = document.getElementById("usolMarketLabel");
  function updateMarketLabel(labelEl, wsName, placeholder, icon) {
    const img = labelEl.querySelector("img.faction-icon");
    const text = wsName || placeholder;
    if (img) {
      labelEl.childNodes.forEach((n) => {
        if (n.nodeType === 3) n.remove();
      });
      labelEl.appendChild(document.createTextNode(" " + text));
    } else {
      if (icon == "\u262D") {
        labelEl.replaceChildren(_h("span", { style: "color:#c33b3b;margin-left:3px;margin-right:1px" }, "\u262D"), " " + text);
      } else if (icon == "\u262E") {
        labelEl.replaceChildren(_h("span", { style: "color:#2592A7;margin-right:1px" }, "\u262E"), " " + text);
      } else {
        labelEl.textContent = `${icon} ${text}`;
      }
    }
  }
  function showMarketInfoPopup(lot) {
    const popup = document.getElementById("marketInfoPopup");
    const overlay = document.getElementById("marketInfoOverlay");
    if (!popup || !overlay) return;
    const det = lot.details || {};
    const isAccess = (lot.category || "").toUpperCase() === "ACCESS";
    const INFO_SVG = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="color:currentColor"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5"/><path d="M12 17V12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="12" cy="8" r="0.75" fill="currentColor"/></svg>';
    let itemName;
    if (isAccess) {
      itemName = (det.serverName || "") + " " + (det.accessType || "") + " access";
    } else {
      itemName = det.name || "Unknown";
    }
    let h = '<div class="info-title">' + INFO_SVG + " " + itemName.toUpperCase() + "</div>";
    h += '<div class="info-desc">';
    const matchedSbstr = itemName ? Object.keys(zoomList).find((substring) => itemName.includes(substring)) : "";
    let zoomMarketImg = "";
    if (matchedSbstr) {
      zoomMarketImg = `style="transform:scale(${zoomList[matchedSbstr]});object-fit:contain;"`;
    }
    if (det.image) h += `<div style="overflow:clip;"><img ${zoomMarketImg} src="${det.image}" alt=""></div>`;
    h += "<span>" + (det.description || "No description available.") + "</span>";
    h += "</div>";
    h += '<div class="info-specs">';
    h += '<div class="info-spec-item"><div class="info-spec-label">Price</div><div class="info-spec-val">' + (lot.price ? lot.price.toLocaleString() : "--") + "</div></div>";
    if (lot.priceModifier) h += '<div class="info-spec-item"><div class="info-spec-label">Price Modifier</div><div class="info-spec-val">' + (lot.priceModifier > 0 ? "+" : "") + lot.priceModifier + "</div></div>";
    if (isAccess) {
      if (lot.accessLevel) h += '<div class="info-spec-item"><div class="info-spec-label">Access Level</div><div class="info-spec-val">' + lot.accessLevel + "</div></div>";
      if (det.durationHours !== void 0) h += '<div class="info-spec-item"><div class="info-spec-label">Duration</div><div class="info-spec-val">' + det.durationHours + "h</div></div>";
      if (det.accessType) h += '<div class="info-spec-item"><div class="info-spec-label">Access Type</div><div class="info-spec-val">' + det.accessType + "</div></div>";
      if (det.serverName) h += '<div class="info-spec-item"><div class="info-spec-label">Server</div><div class="info-spec-val">' + det.serverName + "</div></div>";
      h += '<div class="info-spec-item"><div class="info-spec-label">Available</div><div class="info-spec-val">' + (lot.availableCount !== void 0 ? lot.availableCount : "--") + "</div></div>";
      if (lot.lockedByQuest) h += '<div class="info-spec-item"><div class="info-spec-label">Locked By Quest</div><div class="info-spec-val">' + lot.lockedByQuest + "</div></div>";
      if (lot.unavailableReason) h += '<div class="info-spec-item"><div class="info-spec-label">Status</div><div class="info-spec-val">' + lot.unavailableReason + "</div></div>";
    } else {
      if (det.manufacturer) h += '<div class="info-spec-item"><div class="info-spec-label">Manufacturer</div><div class="info-spec-val">' + det.manufacturer + "</div></div>";
      if (det.tier) h += '<div class="info-spec-item"><div class="info-spec-label">Tier</div><div class="info-spec-val">' + det.tier + "</div></div>";
      if (det.itemVulnerability !== void 0) h += '<div class="info-spec-item"><div class="info-spec-label">Vulnerability</div><div class="info-spec-val">' + det.itemVulnerability + " %</div></div>";
      if (lot.accessLevel) h += '<div class="info-spec-item"><div class="info-spec-label">Access Level</div><div class="info-spec-val">' + lot.accessLevel + "</div></div>";
      if (det.specs && typeof det.specs === "object") {
        if (Array.isArray(det.specs)) {
          for (const spec of det.specs) {
            if (spec && typeof spec === "object") {
              if (spec.type) h += '<div class="info-spec-item"><div class="info-spec-label">Type</div><div class="info-spec-val">' + spec.type + "</div></div>";
              if (spec.power && Array.isArray(spec.power)) h += '<div class="info-spec-item"><div class="info-spec-label">Power</div><div class="info-spec-val">' + spec.power[0] + " \u2013 " + spec.power[1] + "</div></div>";
              if (spec.fileTypes && Array.isArray(spec.fileTypes)) h += '<div class="info-spec-item"><div class="info-spec-label">File Types</div><div class="info-spec-val">' + spec.fileTypes.join(", ") + "</div></div>";
              if (spec.serverTypes && Array.isArray(spec.serverTypes)) h += '<div class="info-spec-item"><div class="info-spec-label">Server Types</div><div class="info-spec-val">' + spec.serverTypes.join(", ") + "</div></div>";
              if (spec.remote !== void 0) h += '<div class="info-spec-item"><div class="info-spec-label">Remote</div><div class="info-spec-val">' + (spec.remote ? "Yes" : "No") + "</div></div>";
            }
          }
        } else {
          for (const [specKey, specVal] of Object.entries(det.specs)) {
            const label = specKey.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
            let displayVal;
            if (Array.isArray(specVal)) {
              displayVal = specVal.join(", ");
            } else if (specVal !== null && typeof specVal === "object") {
              displayVal = JSON.stringify(specVal);
            } else {
              displayVal = specVal;
            }
            h += '<div class="info-spec-item"><div class="info-spec-label">' + label + '</div><div class="info-spec-val">' + displayVal + "</div></div>";
          }
        }
      }
    }
    h += "</div>";
    _safeSetHtml(popup, h);
    popup.classList.add("open");
    overlay.classList.add("open");
    const close = () => {
      popup.classList.remove("open");
      overlay.classList.remove("open");
      overlay.removeEventListener("click", close);
    };
    overlay.addEventListener("click", close);
  }
  function renderMarketInto(container, data, labelPrefix, idPrefix) {
    var openSections = {};
    container.querySelectorAll(".expandable-header.open").forEach((hdr) => {
      var key = hdr.getAttribute("data-expand") || hdr.id;
      if (key) openSections[key] = true;
    });
    _clearEl(container);
    if (!data || !data.market) {
      container.replaceChildren(_noData("No market data available.", "Make sure you have the cor3.gg tab open."));
      return;
    }
    const md = data;
    const market = md.market;
    const rep = md.reputation;
    let html = "";
    if (idPrefix == "home") {
      html += '<img src="factions/core_faction-96x96.png" class="faction-icon" alt="">';
    } else if (idPrefix == "dark") {
      html += '<img src="factions/bmi_faction-96x96.png" class="faction-icon" alt="">';
    } else if (idPrefix == "soyuz") {
      html += '<img src="factions/soyuz_faction-96x96.png" class="faction-icon" alt="">';
    } else if (idPrefix == "usol") {
      html += '<img src="factions/usol_faction-96x96.png" class="faction-icon" alt="">';
    }
    if (md.userCredits !== void 0) {
      html += `<div style="font-size:11px;color:var(--accent-green);margin-bottom:4px;">\u{1F4B0} Credits: ${md.userCredits.toLocaleString()}</div>`;
    }
    if (rep) {
      const pct = rep.requiredReputation > 0 ? Math.min(100, Math.floor(rep.progress / rep.requiredReputation * 100)) : 0;
      html += `<div style="font-size:11px;color:var(--text-muted);margin-bottom:2px;">Reputation \u2014 Level ${rep.level}</div>`;
      html += `<div class="market-rep-bar"><div class="market-rep-fill" style="width:${pct}%"></div></div>`;
      html += `<div style="font-size:10px;color:var(--text-dim);margin-bottom:4px;">`;
      html += `Progress: ${rep.progress}/${rep.requiredReputation} \xB7 `;
      html += `Level Locked: ${rep.isLevelLocked ? "Yes" : "No"} \xB7 `;
      html += `Max Level: ${rep.isMaxLevel ? "Yes" : "No"}`;
      html += `</div>`;
    }
    const jobCount = md.jobs ? md.jobs.length : 0;
    const availableJobs = md.jobs ? md.jobs.filter((j) => !j.isCompleted && !j.isExpired).length : 0;
    if (md.nextJobsResetAt) {
      html += `<div class="${idPrefix}-reset-timer" style="font-size:11px;color:var(--accent-orange);margin-bottom:8px;">\u23F3 Jobs Reset: ${formatTimeRemaining(md.nextJobsResetAt)}</div>`;
    } else if (jobCount > 0) {
      html += `<div style="font-size:11px;color:var(--accent-orange);margin-bottom:8px;">Jobs: ${availableJobs}/${jobCount}</div>`;
    }
    html += `<div class="expandable-header" id="${idPrefix}ItemsToggle"><span class="expand-arrow">\u25B6</span><span class="expand-label">Items List (${(md.lots || []).length})</span></div>`;
    html += `<div class="expandable-body" id="${idPrefix}ItemsBody">`;
    if (md.lots && md.lots.length > 0) {
      const groups2 = {};
      for (const lot of md.lots) {
        const cat = lot.category || "OTHER";
        if (!groups2[cat]) groups2[cat] = [];
        groups2[cat].push(lot);
      }
      const INFO_BTN_SVG = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><g clip-path="url(#mi2)"><path d="M3.759 1.2H12.243c.703 0 1.3.246 1.81.75.502.503.748 1.095.748 1.797v8.495c0 .71-.246 1.305-.748 1.807-.51.505-1.107.751-1.81.751H3.76c-.71 0-1.306-.246-1.809-.749-.502-.502-.749-1.097-.749-1.808V3.747c0-.703.246-1.295.75-1.798.502-.503 1.098-.75 1.808-.75z" stroke="currentColor" stroke-width="0.8"/><path d="M6.994 3.837h2.002v1.992H6.994V3.837zM6.994 7.124h2.002v5.049H6.994V7.124z" fill="currentColor"/></g><defs><clipPath id="mi2"><rect width="16" height="16" fill="currentColor"/></clipPath></defs></svg>';
      var lotMap = [];
      for (const [cat, items] of Object.entries(groups2)) {
        html += `<div class="market-category-title">${cat.charAt(0) + cat.slice(1).toLowerCase()}</div>`;
        for (const lot of items) {
          const det = lot.details || {};
          const isAccess = cat === "ACCESS";
          const isBought = lot.availableCount === 0;
          const boughtTag = isBought && !isAccess ? '<span class="market-item-bought">BOUGHT</span>' : "";
          const matchedSubstring = det.name ? Object.keys(zoomList).find((substring) => det.name.includes(substring)) : "";
          let zoomLotImg = "";
          if (matchedSubstring) {
            zoomLotImg = `style="transform:scale(${zoomList[matchedSubstring]});object-fit:contain;"`;
          }
          const imgHtml = det.image ? `<div style="overflow:hidden;border-radius:6px;width:40px;height:40px;margin-top:6px;"><img src="${det.image}" alt="${det.name || ""}" loading="lazy" ${zoomLotImg}></div>` : "";
          let itemName;
          if (isAccess) {
            itemName = (det.serverName || "") + " " + (det.accessType || "") + " access";
          } else {
            itemName = det.name || "Unknown";
          }
          const unavailTag = lot.unavailableReason ? `<span class="market-item-bought" style="background:rgba(255,160,0,0.2);color:var(--accent-orange);">${lot.unavailableReason.toUpperCase()}</span>` : "";
          const lotIdx = lotMap.length;
          lotMap.push(lot);
          html += `<div class="market-item-card">`;
          html += imgHtml;
          html += `<div class="market-item-info">`;
          html += `<div class="market-item-header">`;
          html += `<div class="market-item-name">${itemName}${boughtTag}${unavailTag}</div>`;
          html += `<button class="market-item-info-btn" data-lot-idx="${lotIdx}">${INFO_BTN_SVG} INFO</button>`;
          html += `</div>`;
          html += `<div class="market-item-price">\u{1F4B0} ${lot.price ? lot.price.toLocaleString() : "--"}</div>`;
          const uid = idPrefix + "_mitem_" + lot.id;
          html += `<div class="expandable-header" data-expand="${uid}"><span class="expand-arrow">\u25B6</span><span class="expand-label">Details</span></div>`;
          html += `<div class="expandable-body" id="${uid}">`;
          if (isAccess) {
            if (lot.accessLevel) html += `<div class="detail-row"><span class="label">Access Level:</span> ${lot.accessLevel}</div>`;
            if (det.durationHours !== void 0) html += `<div class="detail-row"><span class="label">Duration:</span> ${det.durationHours}h</div>`;
            if (det.accessType) html += `<div class="detail-row"><span class="label">Access Type:</span> ${det.accessType}</div>`;
            if (det.serverName) html += `<div class="detail-row"><span class="label">Server:</span> ${det.serverName}</div>`;
            html += `<div class="detail-row"><span class="label">Available:</span> ${lot.availableCount !== void 0 ? lot.availableCount : "--"}</div>`;
            if (lot.lockedByQuest) html += `<div class="detail-row"><span class="label">Locked By Quest:</span> ${lot.lockedByQuest}</div>`;
            if (lot.unavailableReason) html += `<div class="detail-row"><span class="label">Status:</span> ${lot.unavailableReason}</div>`;
          } else {
            if (det.manufacturer) html += `<div class="detail-row"><span class="label">Manufacturer:</span> ${det.manufacturer}</div>`;
            if (det.tier) html += `<div class="detail-row"><span class="label">Tier:</span> ${det.tier}</div>`;
            if (det.itemVulnerability !== void 0) html += `<div class="detail-row"><span class="label">Vulnerability:</span> ${det.itemVulnerability}%</div>`;
            if (det.price) html += `<div class="detail-row"><span class="label">Base Price:</span> \u{1F4B0} ${det.price.toLocaleString()}</div>`;
            if (lot.priceModifier) html += `<div class="detail-row"><span class="label">Price Modifier:</span> ${lot.priceModifier > 0 ? "+" : ""}${lot.priceModifier}</div>`;
            if (lot.accessLevel) html += `<div class="detail-row"><span class="label">Access Level:</span> ${lot.accessLevel}</div>`;
            if (det.specs && typeof det.specs === "object") {
              if (Array.isArray(det.specs)) {
                for (const spec of det.specs) {
                  if (spec && typeof spec === "object") {
                    if (spec.type) html += `<div class="detail-row"><span class="label">Type:</span> ${spec.type}</div>`;
                    if (spec.power && Array.isArray(spec.power)) html += `<div class="detail-row"><span class="label">Power:</span> ${spec.power[0]} \u2013 ${spec.power[1]}</div>`;
                    if (spec.fileTypes && Array.isArray(spec.fileTypes)) html += `<div class="detail-row"><span class="label">File Types:</span> ${spec.fileTypes.join(", ")}</div>`;
                    if (spec.serverTypes && Array.isArray(spec.serverTypes)) html += `<div class="detail-row"><span class="label">Server Types:</span> ${spec.serverTypes.join(", ")}</div>`;
                    if (spec.remote !== void 0) html += `<div class="detail-row"><span class="label">Remote:</span> ${spec.remote ? "Yes" : "No"}</div>`;
                  }
                }
              } else {
                for (const [specKey, specVal] of Object.entries(det.specs)) {
                  const label = specKey.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
                  let displayVal;
                  if (Array.isArray(specVal)) {
                    displayVal = specVal.join(", ");
                  } else if (specVal !== null && typeof specVal === "object") {
                    displayVal = JSON.stringify(specVal);
                  } else {
                    displayVal = specVal;
                  }
                  html += `<div class="detail-row"><span class="label">${label}:</span> ${displayVal}</div>`;
                }
              }
            }
            if (det.description) html += `<div class="detail-row" style="color:var(--text-dim);font-style:italic;margin-top:2px;">${det.description}</div>`;
          }
          html += `</div>`;
          html += `</div></div>`;
        }
      }
    } else {
      html += '<div class="no-decisions">No items in market.</div>';
    }
    html += `</div>`;
    const openJobs = (md.jobs || []).filter((j) => !j.isCompleted && !j.isExpired).map((j) => ({ ...j, _status: "OPEN" }));
    const recentActive = (md.recentJobs || []).filter((j) => j.status === "TAKEN" || j.status === "FAILED").map((j) => ({ ...j, _status: j.status === "FAILED" ? "FAILED" : "IN PROGRESS" }));
    const completedJobs = (md.jobs || []).filter((j) => j.isCompleted || j.isExpired).map((j) => ({ ...j, _status: j.isCompleted ? "COMPLETED" : "EXPIRED" }));
    const allJobsList = [...openJobs, ...recentActive, ...completedJobs];
    const activeJobCount = openJobs.length + recentActive.length;
    html += `<div class="expandable-header" id="${idPrefix}JobsToggle"><span class="expand-arrow">\u25B6</span><span class="expand-label">Jobs List (${activeJobCount}/${allJobsList.length})</span></div>`;
    html += `<div class="expandable-body" id="${idPrefix}JobsBody">`;
    if (allJobsList.length > 0) {
      allJobsList.sort((a, b) => {
        const sA = (a.relatedServers && a.relatedServers[0] ? a.relatedServers[0].serverName : "") || "";
        const sB = (b.relatedServers && b.relatedServers[0] ? b.relatedServers[0].serverName : "") || "";
        return sA.localeCompare(sB);
      });
      html += `<table style="width:100%;font-size:10px;border-collapse:collapse;margin-bottom:4px;">`;
      html += `<tr style="color:var(--text-dim);border-bottom:1px solid var(--border);"><th style="text-align:left;padding:3px 4px;">Job</th><th style="text-align:left;padding:3px 4px;">Server</th><th style="text-align:center;padding:3px 4px;">Status</th><th style="text-align:right;padding:3px 4px;">Reward/Penalty</th></tr>`;
      for (const job of allJobsList) {
        const dimStyle = job._status === "COMPLETED" || job._status === "EXPIRED" ? "opacity:0.5;" : "";
        const jobName = job.name || job.id || "Unknown";
        const serverName = job.relatedServers && job.relatedServers[0] ? job.relatedServers[0].serverName : "N/A";
        let rewardStr = "--";
        let rewardColor = "var(--accent-green)";
        const isFailed = job._status === "FAILED" || job._status === "EXPIRED";
        if (isFailed) {
          if (job.reputationPenalty > 0) {
            rewardStr = `<span style="color:var(--accent-red,#f38ba8);">\u2B50 -${job.reputationPenalty.toLocaleString()}</span>`;
            rewardColor = "var(--accent-red, #f38ba8)";
          } else if (job.deposit > 0) {
            rewardStr = `<span style="color:var(--accent-red,#f38ba8);">\u{1F4B0} -${job.deposit.toLocaleString()}</span>`;
            rewardColor = "var(--accent-red, #f38ba8)";
          }
        } else {
          if (job.rewardCredits) {
            rewardStr = `\u{1F4B0} ${job.rewardCredits.toLocaleString()}`;
            if (job.deposit) rewardStr += ` <span style="color:var(--accent-red,#f38ba8);">(-${job.deposit.toLocaleString()})</span>`;
          }
          if (job.rewardReputation) {
            rewardStr += ` \xB7 \u2B50 ${job.rewardReputation}`;
          }
        }
        let statusColor, statusIcon;
        switch (job._status) {
          case "OPEN":
            statusColor = "var(--accent-blue, #89b4fa)";
            statusIcon = "\u{1F539}";
            break;
          case "IN PROGRESS":
            statusColor = "var(--accent-orange, #fab387)";
            statusIcon = "\u{1F504}";
            break;
          case "FAILED":
            statusColor = "var(--accent-red, #f38ba8)";
            statusIcon = "\u274C";
            break;
          case "COMPLETED":
            statusColor = "var(--accent-green, #a6e3a1)";
            statusIcon = "\u2705";
            break;
          case "EXPIRED":
            statusColor = "var(--text-dim, #6c7086)";
            statusIcon = "\u23F0";
            break;
          default:
            statusColor = "var(--text-dim)";
            statusIcon = "\u2014";
            break;
        }
        html += `<tr style="${dimStyle}border-bottom:1px solid var(--border);">`;
        html += `<td style="padding:3px 4px;color:var(--text-secondary);">${jobName}</td>`;
        html += `<td style="padding:3px 4px;color:var(--text-muted);">${serverName}</td>`;
        html += `<td style="padding:3px 4px;text-align:center;color:${statusColor};font-size:9px;">${statusIcon} ${job._status}</td>`;
        html += `<td style="padding:3px 4px;text-align:right;color:${rewardColor};">${rewardStr}</td>`;
        html += `</tr>`;
      }
      html += `</table>`;
    } else {
      html += '<div class="no-decisions">No jobs available.</div>';
    }
    html += `</div>`;
    _safeSetHtml(container, html);
    container.querySelectorAll(".expandable-header").forEach((hdr) => {
      var key = hdr.getAttribute("data-expand") || hdr.id;
      if (key && openSections[key]) {
        hdr.classList.add("open");
        var bodyId = hdr.getAttribute("data-expand") || hdr.id.replace("Toggle", "Body");
        var body = document.getElementById(bodyId);
        if (body) body.classList.add("open");
      }
      hdr.addEventListener("click", () => {
        hdr.classList.toggle("open");
        const targetId = hdr.getAttribute("data-expand") || hdr.id.replace("Toggle", "Body");
        const body2 = document.getElementById(targetId);
        if (body2) body2.classList.toggle("open");
      });
    });
    if (lotMap && lotMap.length > 0) {
      container.querySelectorAll(".market-item-info-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const idx = parseInt(btn.dataset.lotIdx, 10);
          if (!isNaN(idx) && lotMap[idx]) showMarketInfoPopup(lotMap[idx]);
        });
      });
    }
    const cleanupBtnMap = { home: "cleanupCoreMarketBtn", dark: "cleanupDarkMarketBtn", soyuz: "cleanupSoyuzMarketBtn", usol: "cleanupUsolMarketBtn" };
    const cleanupBtn = document.getElementById(cleanupBtnMap[idPrefix]);
    if (cleanupBtn) {
      const failedJobs = (md.recentJobs || []).filter((j) => j.status === "FAILED");
      cleanupBtn.style.display = failedJobs.length > 0 ? "" : "none";
    }
  }
  function renderMarket(data) {
    if (data && data.nextJobsResetAt) state.coreNextJobsResetAt = data.nextJobsResetAt;
    if (data && data.market && data.market.marketName) {
      state.coreMarketName = data.market.marketName;
      updateMarketLabel(coreMarketLabel, state.coreMarketName, "Market-1", "\u{1F3E0}");
      renderPinnedTimers();
    }
    renderMarketInto(marketContainer, data, "Market-1", "home");
  }
  function renderDarkMarket(data, available, maintenanceEndsAt, blockerServer) {
    if (available === false) {
      let timerHtml = "";
      if (blockerServer) timerHtml += " (" + blockerServer + " in maintenance";
      if (maintenanceEndsAt) {
        const diff = new Date(maintenanceEndsAt).getTime() - Date.now();
        if (diff > 0) {
          const mins = Math.ceil(diff / 6e4);
          timerHtml += (blockerServer ? ", " : " (") + "~" + mins + "m remaining";
        }
      }
      if (timerHtml) timerHtml += ")";
      const warningEl = _h("div", { className: "warning-banner" }, "\u26A0\uFE0F D4RK market server is currently unreachable" + timerHtml + ".");
      if (data && data.market) {
        if (data.nextJobsResetAt) state.bmiNextJobsResetAt = data.nextJobsResetAt;
        if (data.market.marketName) {
          state.darkMarketName = data.market.marketName;
          updateMarketLabel(darkMarketLabel, state.darkMarketName, "Market-2", "\u{1F311}");
        }
        renderMarketInto(darkMarketContainer, data, "Market-2 (cached)", "dark");
        darkMarketContainer.prepend(warningEl);
      } else {
        darkMarketContainer.replaceChildren(warningEl, _noData("No cached market data available."));
      }
      return;
    }
    if (data && data.nextJobsResetAt) state.bmiNextJobsResetAt = data.nextJobsResetAt;
    if (data && data.market && data.market.marketName) {
      state.darkMarketName = data.market.marketName;
      updateMarketLabel(darkMarketLabel, state.darkMarketName, "Market-2", "\u{1F311}");
      renderPinnedTimers();
    }
    renderMarketInto(darkMarketContainer, data, "Market-2", "dark");
  }
  function renderSoyuzMarket(data, available, maintenanceEndsAt, blockerServer) {
    if (available === false) {
      let timerHtml = "";
      if (blockerServer) timerHtml += " (" + blockerServer + " in maintenance";
      if (maintenanceEndsAt) {
        const diff = new Date(maintenanceEndsAt).getTime() - Date.now();
        if (diff > 0) {
          const mins = Math.ceil(diff / 6e4);
          timerHtml += (blockerServer ? ", " : " (") + "~" + mins + "m remaining";
        }
      }
      if (timerHtml) timerHtml += ")";
      const warningEl = _h("div", { className: "warning-banner" }, "\u26A0\uFE0F SOYUZ market server is currently unreachable" + timerHtml + ".");
      if (data && data.market) {
        if (data.nextJobsResetAt) state.soyuzNextJobsResetAt = data.nextJobsResetAt;
        if (data.market.marketName) {
          state.soyuzMarketName = data.market.marketName;
          updateMarketLabel(soyuzMarketLabel, state.soyuzMarketName, "Market-3", "\u262D");
        }
        renderMarketInto(soyuzMarketContainer, data, "Market-3 (cached)", "soyuz");
        soyuzMarketContainer.prepend(warningEl);
      } else {
        soyuzMarketContainer.replaceChildren(warningEl, _noData("No cached market data available."));
      }
      return;
    }
    if (data && data.nextJobsResetAt) state.soyuzNextJobsResetAt = data.nextJobsResetAt;
    if (data && data.market && data.market.marketName) {
      state.soyuzMarketName = data.market.marketName;
      updateMarketLabel(soyuzMarketLabel, state.soyuzMarketName, "Market-3", "\u262D");
      renderPinnedTimers();
    }
    renderMarketInto(soyuzMarketContainer, data, "Market-3", "soyuz");
  }
  function renderUsolMarket(data, available, maintenanceEndsAt, blockerServer) {
    if (available === false) {
      let timerHtml = "";
      if (blockerServer) timerHtml += " (" + blockerServer + " in maintenance";
      if (maintenanceEndsAt) {
        const diff = new Date(maintenanceEndsAt).getTime() - Date.now();
        if (diff > 0) {
          const mins = Math.ceil(diff / 6e4);
          timerHtml += (blockerServer ? ", " : " (") + "~" + mins + "m remaining";
        }
      }
      if (timerHtml) timerHtml += ")";
      const warningEl = _h("div", { className: "warning-banner" }, "\u26A0\uFE0F USOL market server is currently unreachable" + timerHtml);
      if (data && data.market) {
        if (data.nextJobsResetAt) state.usolNextJobsResetAt = data.nextJobsResetAt;
        if (data.market.marketName) {
          state.usolMarketName = data.market.marketName;
          updateMarketLabel(usolMarketLabel, state.usolMarketName, "Market-4", "\u262E");
        }
        renderMarketInto(usolMarketContainer, data, "Market-4 (cached)", "usol");
        usolMarketContainer.prepend(warningEl);
      } else {
        usolMarketContainer.replaceChildren(warningEl, _noData("No cached market data available."));
      }
      return;
    }
    if (data && data.nextJobsResetAt) state.usolNextJobsResetAt = data.nextJobsResetAt;
    if (data && data.market && data.market.marketName) {
      state.usolMarketName = data.market.marketName;
      updateMarketLabel(usolMarketLabel, state.usolMarketName, "Market-4", "\u262E");
      renderPinnedTimers();
    }
    renderMarketInto(usolMarketContainer, data, "Market-4", "usol");
  }
  async function loadMarket() {
    const { marketData } = await chrome.storage.local.get("marketData");
    renderMarket(marketData);
  }
  async function loadDarkMarket() {
    const { darkMarketData, darkMarketAvailable, darkMarketMaintenanceEndsAt, darkMarketBlockerServer } = await chrome.storage.local.get(["darkMarketData", "darkMarketAvailable", "darkMarketMaintenanceEndsAt", "darkMarketBlockerServer"]);
    renderDarkMarket(darkMarketData, darkMarketAvailable, darkMarketMaintenanceEndsAt, darkMarketBlockerServer);
  }
  async function loadSoyuzMarket() {
    const { soyuzMarketData, soyuzMarketAvailable, soyuzMarketMaintenanceEndsAt, soyuzMarketBlockerServer } = await chrome.storage.local.get(["soyuzMarketData", "soyuzMarketAvailable", "soyuzMarketMaintenanceEndsAt", "soyuzMarketBlockerServer"]);
    renderSoyuzMarket(soyuzMarketData, soyuzMarketAvailable, soyuzMarketMaintenanceEndsAt, soyuzMarketBlockerServer);
  }
  async function loadUsolMarket() {
    const { usolMarketData, usolMarketAvailable, usolMarketMaintenanceEndsAt, usolMarketBlockerServer } = await chrome.storage.local.get(["usolMarketData", "usolMarketAvailable", "usolMarketMaintenanceEndsAt", "usolMarketBlockerServer"]);
    renderUsolMarket(usolMarketData, usolMarketAvailable, usolMarketMaintenanceEndsAt, usolMarketBlockerServer);
  }
  function getMarketContainers() {
    return { marketContainer, darkMarketContainer, soyuzMarketContainer, usolMarketContainer };
  }
  function initMarketRefreshButtons() {
    refreshMarketBtn.addEventListener("click", async () => {
      marketContainer.replaceChildren(_noData("Refreshing market data..."));
      try {
        const tab = await getCor3Tab();
        if (!tab) throw new Error("No cor3.gg tab");
        await chrome.tabs.sendMessage(tab.id, { action: "refreshMarket" });
        setTimeout(() => {
          loadMarket();
          refreshAllTimestamps();
        }, 3e3);
      } catch (e) {
        setTimeout(() => {
          loadMarket();
          refreshAllTimestamps();
        }, 500);
      }
    });
    refreshDarkMarketBtn.addEventListener("click", async () => {
      darkMarketContainer.replaceChildren(_noData("Refreshing market data..."));
      try {
        const tab = await getCor3Tab();
        if (!tab) throw new Error("No cor3.gg tab");
        await chrome.tabs.sendMessage(tab.id, { action: "refreshDarkMarket" });
        setTimeout(() => {
          loadDarkMarket();
          refreshAllTimestamps();
        }, 3e3);
      } catch (e) {
        setTimeout(() => {
          loadDarkMarket();
          refreshAllTimestamps();
        }, 500);
      }
    });
    refreshSoyuzMarketBtn.addEventListener("click", async () => {
      soyuzMarketContainer.replaceChildren(_noData("Refreshing market data..."));
      try {
        const tab = await getCor3Tab();
        if (!tab) throw new Error("No cor3.gg tab");
        await chrome.tabs.sendMessage(tab.id, { action: "refreshSoyuzMarket" });
        setTimeout(() => {
          loadSoyuzMarket();
          refreshAllTimestamps();
        }, 5e3);
      } catch (e) {
        setTimeout(() => {
          loadSoyuzMarket();
          refreshAllTimestamps();
        }, 500);
      }
    });
    refreshUsolMarketBtn.addEventListener("click", async () => {
      usolMarketContainer.replaceChildren(_noData("Refreshing market data..."));
      try {
        const tab = await getCor3Tab();
        if (!tab) throw new Error("No cor3.gg tab");
        await chrome.tabs.sendMessage(tab.id, { action: "refreshUsolMarket" });
        setTimeout(() => {
          loadUsolMarket();
          refreshAllTimestamps();
        }, 5e3);
      } catch (e) {
        setTimeout(() => {
          loadUsolMarket();
          refreshAllTimestamps();
        }, 500);
      }
    });
  }
  async function refreshMarket1Only() {
    marketContainer.replaceChildren(_noData("Refreshing Market-1..."));
    await chrome.storage.local.remove("marketData");
    try {
      const tab = await getCor3Tab();
      if (tab) await chrome.tabs.sendMessage(tab.id, { action: "refreshMarket" });
    } catch (e) {
    }
    await waitForStorageKey("marketData", 8e3);
    await loadMarket();
    refreshAllTimestamps();
  }
  async function setDarkMarketEndpoint() {
    darkMarketContainer.replaceChildren(_noData("Setting Market-2 endpoint..."));
  }
  async function refreshMarket2Only() {
    darkMarketContainer.replaceChildren(_noData("Refreshing Market-2..."));
    await chrome.storage.local.remove(["darkMarketData", "darkMarketAvailable"]);
    try {
      const tab = await getCor3Tab();
      if (tab) await chrome.tabs.sendMessage(tab.id, { action: "refreshDarkMarket" });
    } catch (e) {
    }
    await new Promise((resolve) => {
      let done = false;
      const poll = setInterval(async () => {
        const data = await chrome.storage.local.get(["darkMarketData", "darkMarketAvailable"]);
        if (data.darkMarketData || data.darkMarketAvailable !== void 0) {
          clearInterval(poll);
          if (!done) {
            done = true;
            resolve();
          }
        }
      }, 400);
      setTimeout(() => {
        clearInterval(poll);
        if (!done) {
          done = true;
          resolve();
        }
      }, 1e4);
    });
    await loadDarkMarket();
    refreshAllTimestamps();
  }
  async function refreshMarket3Only() {
    soyuzMarketContainer.replaceChildren(_noData("Refreshing Market-3..."));
    await chrome.storage.local.remove(["soyuzMarketData", "soyuzMarketAvailable"]);
    try {
      const tab = await getCor3Tab();
      if (tab) await chrome.tabs.sendMessage(tab.id, { action: "refreshSoyuzMarket" });
    } catch (e) {
    }
    await new Promise((resolve) => {
      let done = false;
      const poll = setInterval(async () => {
        const data = await chrome.storage.local.get(["soyuzMarketData", "soyuzMarketAvailable"]);
        if (data.soyuzMarketData || data.soyuzMarketAvailable !== void 0) {
          clearInterval(poll);
          if (!done) {
            done = true;
            resolve();
          }
        }
      }, 400);
      setTimeout(() => {
        clearInterval(poll);
        if (!done) {
          done = true;
          resolve();
        }
      }, 15e3);
    });
    await loadSoyuzMarket();
    refreshAllTimestamps();
  }
  async function refreshMarket4Only() {
    usolMarketContainer.replaceChildren(_noData("Refreshing Market-4..."));
    await chrome.storage.local.remove(["usolMarketData", "usolMarketAvailable"]);
    try {
      const tab = await getCor3Tab();
      if (tab) await chrome.tabs.sendMessage(tab.id, { action: "refreshUsolMarket" });
    } catch (e) {
    }
    await new Promise((resolve) => {
      let done = false;
      const poll = setInterval(async () => {
        const data = await chrome.storage.local.get(["usolMarketData", "usolMarketAvailable"]);
        if (data.usolMarketData || data.usolMarketAvailable !== void 0) {
          clearInterval(poll);
          if (!done) {
            done = true;
            resolve();
          }
        }
      }, 400);
      setTimeout(() => {
        clearInterval(poll);
        if (!done) {
          done = true;
          resolve();
        }
      }, 15e3);
    });
    await loadUsolMarket();
    refreshAllTimestamps();
  }
  function initMarketStorageListener() {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes.marketData) {
        const md = changes.marketData.newValue;
        if (md) {
          if (md.nextJobsResetAt) state.coreNextJobsResetAt = md.nextJobsResetAt;
          if (md.market && md.market.marketName) {
            state.coreMarketName = md.market.marketName;
            updateMarketLabel(coreMarketLabel, state.coreMarketName, "Market-1", "\u{1F3E0}");
          }
          renderMarket(md);
          refreshAllTimestamps();
        }
      }
      if (changes.darkMarketData || changes.darkMarketAvailable) {
        loadDarkMarket();
        refreshAllTimestamps();
      }
      if (changes.soyuzMarketData || changes.soyuzMarketAvailable) {
        loadSoyuzMarket();
        refreshAllTimestamps();
      }
      if (changes.usolMarketData || changes.usolMarketAvailable) {
        loadUsolMarket();
        refreshAllTimestamps();
      }
      if (changes.serverMaintenanceMap) {
        chrome.storage.local.get(["darkMarketData", "darkMarketAvailable", "soyuzMarketData", "soyuzMarketAvailable", "usolMarketData", "usolMarketAvailable"], (r) => {
          const map = changes.serverMaintenanceMap.newValue;
          if (!r.darkMarketData && r.darkMarketAvailable === void 0) {
            const b = findMaintenanceBlocker(map, "dark");
            if (b) renderDarkMarket(null, false, b.maintenanceEndsAt, b.blockerName);
          }
          if (!r.soyuzMarketData && r.soyuzMarketAvailable === void 0) {
            const b = findMaintenanceBlocker(map, "soyuz");
            if (b) renderSoyuzMarket(null, false, b.maintenanceEndsAt, b.blockerName);
          }
          if (!r.usolMarketData && r.usolMarketAvailable === void 0) {
            const b = findMaintenanceBlocker(map, "usol");
            if (b) renderUsolMarket(null, false, b.maintenanceEndsAt, b.blockerName);
          }
        });
      }
    });
  }
  function initMarketCacheLoad() {
    chrome.storage.local.get(["marketData", "darkMarketData", "darkMarketAvailable", "darkMarketMaintenanceEndsAt", "darkMarketBlockerServer", "soyuzMarketData", "soyuzMarketAvailable", "soyuzMarketMaintenanceEndsAt", "soyuzMarketBlockerServer", "usolMarketData", "usolMarketAvailable", "usolMarketMaintenanceEndsAt", "usolMarketBlockerServer", "serverMaintenanceMap"], (result) => {
      if (result.marketData) {
        if (result.marketData.nextJobsResetAt) state.coreNextJobsResetAt = result.marketData.nextJobsResetAt;
        if (result.marketData.market && result.marketData.market.marketName) {
          state.coreMarketName = result.marketData.market.marketName;
          updateMarketLabel(coreMarketLabel, state.coreMarketName, "Market-1", "\u{1F3E0}");
        }
        renderMarket(result.marketData);
      } else {
        marketContainer.replaceChildren(_noData("No market data cached. Click \u{1F504} to refresh."));
      }
      if (result.darkMarketData || result.darkMarketAvailable === false) {
        if (result.darkMarketData) {
          if (result.darkMarketData.nextJobsResetAt) state.bmiNextJobsResetAt = result.darkMarketData.nextJobsResetAt;
          if (result.darkMarketData.market && result.darkMarketData.market.marketName) {
            state.darkMarketName = result.darkMarketData.market.marketName;
            updateMarketLabel(darkMarketLabel, state.darkMarketName, "Market-2", "\u{1F311}");
          }
        }
        renderDarkMarket(result.darkMarketData || null, result.darkMarketAvailable, result.darkMarketMaintenanceEndsAt, result.darkMarketBlockerServer);
      } else {
        const darkBlocker = findMaintenanceBlocker(result.serverMaintenanceMap, "dark");
        if (darkBlocker) {
          renderDarkMarket(null, false, darkBlocker.maintenanceEndsAt, darkBlocker.blockerName);
        } else {
          darkMarketContainer.replaceChildren(_noData("No market data cached. Click \u{1F504} to refresh."));
        }
      }
      if (result.soyuzMarketData || result.soyuzMarketAvailable === false) {
        if (result.soyuzMarketData) {
          if (result.soyuzMarketData.nextJobsResetAt) state.soyuzNextJobsResetAt = result.soyuzMarketData.nextJobsResetAt;
          if (result.soyuzMarketData.market && result.soyuzMarketData.market.marketName) {
            state.soyuzMarketName = result.soyuzMarketData.market.marketName;
            updateMarketLabel(soyuzMarketLabel, state.soyuzMarketName, "Market-3", "\u262D");
          }
        }
        renderSoyuzMarket(result.soyuzMarketData || null, result.soyuzMarketAvailable, result.soyuzMarketMaintenanceEndsAt, result.soyuzMarketBlockerServer);
      } else {
        const soyuzBlocker = findMaintenanceBlocker(result.serverMaintenanceMap, "soyuz");
        if (soyuzBlocker) {
          renderSoyuzMarket(null, false, soyuzBlocker.maintenanceEndsAt, soyuzBlocker.blockerName);
        } else {
          soyuzMarketContainer.replaceChildren(_noData("No market data cached. Click \u{1F504} to refresh."));
        }
      }
      if (result.usolMarketData || result.usolMarketAvailable === false) {
        if (result.usolMarketData) {
          if (result.usolMarketData.nextJobsResetAt) state.usolNextJobsResetAt = result.usolMarketData.nextJobsResetAt;
          if (result.usolMarketData.market && result.usolMarketData.market.marketName) {
            state.usolMarketName = result.usolMarketData.market.marketName;
            updateMarketLabel(usolMarketLabel, state.usolMarketName, "Market-4", "\u262E");
          }
        }
        renderUsolMarket(result.usolMarketData || null, result.usolMarketAvailable, result.usolMarketMaintenanceEndsAt, result.usolMarketBlockerServer);
      } else {
        const usolBlocker = findMaintenanceBlocker(result.serverMaintenanceMap, "usol");
        if (usolBlocker) {
          renderUsolMarket(null, false, usolBlocker.maintenanceEndsAt, usolBlocker.blockerName);
        } else {
          usolMarketContainer.replaceChildren(_noData("No market data cached. Click \u{1F504} to refresh."));
        }
      }
    });
  }
  initMarketRefreshButtons();
  initMarketCacheLoad();
  initMarketStorageListener();

  // src/popup/ui-toggles.js
  var autoDecryptToggle = document.getElementById("autoDecryptToggle");
  var decryptStatus = document.getElementById("decryptStatus");
  var autoIceWallToggle = document.getElementById("autoIceWallToggle");
  var iceWallStatus = document.getElementById("iceWallStatus");
  var iceWallSolverStatusLine = document.getElementById("iceWallSolverStatusLine");
  var autoSimpleDecryptToggle = document.getElementById("autoSimpleDecryptToggle");
  var simpleDecryptStatus = document.getElementById("simpleDecryptStatus");
  var simpleDecryptSolverStatusLine = document.getElementById("simpleDecryptSolverStatusLine");
  var autoDailyHackToggle = document.getElementById("autoDailyHackToggle");
  var dailyHackStatus = document.getElementById("dailyHackStatus");
  var dailyHackLogEl = document.getElementById("dailyHackLog");
  var disableBackgroundToggle = document.getElementById("disableBackgroundToggle");
  var backgroundStatus = document.getElementById("backgroundStatus");
  var disableNetworkFogToggle = document.getElementById("disableNetworkFogToggle");
  var networkFogStatus = document.getElementById("networkFogStatus");
  var moveNotificationsToggle = document.getElementById("moveNotificationsToggle");
  var moveNotificationsStatus = document.getElementById("moveNotificationsStatus");
  var autoUpdateMarketsToggle = document.getElementById("autoUpdateMarketsToggle");
  var autoUpdateMarketsStatus = document.getElementById("autoUpdateMarketsStatus");
  var secretFinderToggle = document.getElementById("secretFinderToggle");
  var secretFinderStatus = document.getElementById("secretFinderStatus");
  var secretFinderLogEl = document.getElementById("secretFinderLog");
  var togglesExtra = document.getElementById("togglesExtra");
  var togglesShowMoreBtn = document.getElementById("togglesShowMoreBtn");
  function statusLabel(el, enabled) {
    if (!el) return;
    el.textContent = enabled ? "Active" : "Off";
    el.style.color = enabled ? "var(--accent-green)" : "var(--text-dim)";
  }
  function renderSolverStatus(el, statusObj) {
    if (!el) return;
    if (!statusObj || !statusObj.message || Date.now() - statusObj.timestamp > 5 * 60 * 1e3) {
      el.style.display = "none";
      return;
    }
    const colorMap = { success: "var(--accent-green)", error: "var(--accent-red, #ff5555)", warn: "var(--accent-orange)", info: "var(--accent-cyan)" };
    el.textContent = statusObj.message;
    el.style.color = colorMap[statusObj.level] || "var(--text-dim)";
    el.style.display = "";
  }
  function updateDecryptStatusLabel(enabled) {
    statusLabel(decryptStatus, enabled);
  }
  function updateIceWallStatusLabel(enabled) {
    statusLabel(iceWallStatus, enabled);
  }
  function updateSimpleDecryptStatusLabel(enabled) {
    statusLabel(simpleDecryptStatus, enabled);
  }
  function updateDailyHackStatusLabel(enabled) {
    statusLabel(dailyHackStatus, enabled);
  }
  function updateBackgroundStatus() {
    if (disableBackgroundToggle) statusLabel(backgroundStatus, disableBackgroundToggle.checked);
  }
  function updateNetworkFogStatus() {
    if (disableNetworkFogToggle) statusLabel(networkFogStatus, disableNetworkFogToggle.checked);
  }
  function updateMoveNotificationsStatus() {
    if (moveNotificationsToggle) statusLabel(moveNotificationsStatus, moveNotificationsToggle.checked);
  }
  function updateAutoUpdateMarketsStatus() {
    if (autoUpdateMarketsToggle) statusLabel(autoUpdateMarketsStatus, autoUpdateMarketsToggle.checked);
  }
  function updateSecretFinderStatusLabel(enabled) {
    statusLabel(secretFinderStatus, enabled);
  }
  function initAutoDecrypt() {
    chrome.storage.sync.get("autoDecryptEnabled", (data) => {
      autoDecryptToggle.checked = !!data.autoDecryptEnabled;
      updateDecryptStatusLabel(autoDecryptToggle.checked);
    });
    autoDecryptToggle.addEventListener("change", async () => {
      const enabled = autoDecryptToggle.checked;
      await chrome.storage.sync.set({ autoDecryptEnabled: enabled });
      updateDecryptStatusLabel(enabled);
      const tab = await getCor3Tab();
      if (tab) chrome.tabs.sendMessage(tab.id, { action: "toggleDecryptSolver", enabled }).catch(() => {
      });
    });
  }
  function initAutoIceWall() {
    chrome.storage.sync.get("autoIceWallEnabled", (data) => {
      autoIceWallToggle.checked = !!data.autoIceWallEnabled;
      updateIceWallStatusLabel(autoIceWallToggle.checked);
    });
    autoIceWallToggle.addEventListener("change", async () => {
      const enabled = autoIceWallToggle.checked;
      await chrome.storage.sync.set({ autoIceWallEnabled: enabled });
      updateIceWallStatusLabel(enabled);
      const tab = await getCor3Tab();
      if (tab) chrome.tabs.sendMessage(tab.id, { action: "toggleIceWallSolver", enabled }).catch(() => {
      });
    });
    chrome.storage.local.get("iceWallSolverStatus", (data) => {
      renderSolverStatus(iceWallSolverStatusLine, data.iceWallSolverStatus);
    });
  }
  function initAutoSimpleDecrypt() {
    chrome.storage.sync.get("autoSimpleDecryptEnabled", (data) => {
      autoSimpleDecryptToggle.checked = !!data.autoSimpleDecryptEnabled;
      updateSimpleDecryptStatusLabel(autoSimpleDecryptToggle.checked);
    });
    autoSimpleDecryptToggle.addEventListener("change", async () => {
      const enabled = autoSimpleDecryptToggle.checked;
      await chrome.storage.sync.set({ autoSimpleDecryptEnabled: enabled });
      updateSimpleDecryptStatusLabel(enabled);
      const tab = await getCor3Tab();
      if (tab) chrome.tabs.sendMessage(tab.id, { action: "toggleSimpleDecryptSolver", enabled }).catch(() => {
      });
    });
    chrome.storage.local.get("simpleDecryptSolverStatus", (data) => {
      renderSolverStatus(simpleDecryptSolverStatusLine, data.simpleDecryptSolverStatus);
    });
  }
  function initAutoDailyHack() {
    chrome.storage.sync.get("autoDailyHackEnabled", (data) => {
      autoDailyHackToggle.checked = !!data.autoDailyHackEnabled;
      updateDailyHackStatusLabel(autoDailyHackToggle.checked);
    });
    chrome.storage.local.get(["dailyHackLog", "dailyHackLogUpdatedAt"], (data) => {
      if (data.dailyHackLog && dailyHackLogEl && autoDailyHackToggle.checked) {
        dailyHackLogEl.textContent = data.dailyHackLog;
        dailyHackLogEl.style.display = "";
      }
    });
    autoDailyHackToggle.addEventListener("change", async () => {
      const enabled = autoDailyHackToggle.checked;
      await chrome.storage.sync.set({ autoDailyHackEnabled: enabled });
      updateDailyHackStatusLabel(enabled);
      if (enabled && dailyHackLogEl) {
        dailyHackLogEl.textContent = "Starting daily hack solver...";
        dailyHackLogEl.style.display = "";
      }
      const tab = await getCor3Tab();
      if (tab) chrome.tabs.sendMessage(tab.id, { action: "toggleDailyHackSolver", enabled }).catch(() => {
      });
    });
  }
  function initBackgroundToggle() {
    if (!disableBackgroundToggle) return;
    disableBackgroundToggle.addEventListener("change", async () => {
      const isEnabled = disableBackgroundToggle.checked;
      chrome.storage.sync.set({ disableBackground: isEnabled });
      updateBackgroundStatus();
      try {
        const tab = await getCor3Tab();
        if (tab) await chrome.tabs.sendMessage(tab.id, { action: isEnabled ? "disableBackground" : "enableBackground" });
      } catch (e) {
        cor3LogError("popup.js", e, { action: "toggleBackground" });
      }
    });
  }
  function initNetworkFogToggle() {
    if (!disableNetworkFogToggle) return;
    disableNetworkFogToggle.addEventListener("change", async () => {
      const isEnabled = disableNetworkFogToggle.checked;
      chrome.storage.sync.set({ disableNetworkFog: isEnabled });
      updateNetworkFogStatus();
      try {
        const tab = await getCor3Tab();
        if (tab) await chrome.tabs.sendMessage(tab.id, { action: isEnabled ? "disableNetworkFog" : "enableNetworkFog" });
      } catch (e) {
        cor3LogError("popup.js", e, { action: "toggleNetworkFog" });
      }
    });
  }
  function initMoveNotificationsToggle() {
    if (!moveNotificationsToggle) return;
    moveNotificationsToggle.addEventListener("change", async () => {
      const isEnabled = moveNotificationsToggle.checked;
      chrome.storage.sync.set({ moveNotificationsLeft: isEnabled });
      updateMoveNotificationsStatus();
      try {
        const tab = await getCor3Tab();
        if (tab) await chrome.tabs.sendMessage(tab.id, { action: isEnabled ? "moveNotificationsLeft" : "moveNotificationsRight" });
      } catch (e) {
        cor3LogError("popup.js", e, { action: "toggleNotificationPosition" });
      }
    });
  }
  function initAutoUpdateMarketsToggle() {
    if (!autoUpdateMarketsToggle) return;
    autoUpdateMarketsToggle.addEventListener("change", () => {
      const isEnabled = autoUpdateMarketsToggle.checked;
      chrome.storage.sync.set({ autoUpdateMarkets: isEnabled });
      updateAutoUpdateMarketsStatus();
    });
  }
  function initSecretFinder() {
    chrome.storage.sync.get("secretFinderEnabled", (data) => {
      secretFinderToggle.checked = !!data.secretFinderEnabled;
      updateSecretFinderStatusLabel(secretFinderToggle.checked);
    });
    chrome.storage.local.get("secretFinderLog", (data) => {
      if (data.secretFinderLog && secretFinderLogEl && secretFinderToggle.checked) {
        _safeSetHtml(secretFinderLogEl, data.secretFinderLog);
        secretFinderLogEl.style.display = "";
      }
    });
    secretFinderToggle.addEventListener("change", async () => {
      const enabled = secretFinderToggle.checked;
      await chrome.storage.sync.set({ secretFinderEnabled: enabled });
      updateSecretFinderStatusLabel(enabled);
      if (enabled) {
        if (secretFinderLogEl) {
          secretFinderLogEl.replaceChildren(_h("span", { style: "color:var(--accent-cyan);" }, "Starting search..."));
          secretFinderLogEl.style.display = "";
        }
        try {
          const tab = await getCor3Tab();
          if (tab) {
            await chrome.tabs.sendMessage(tab.id, { action: "startIpSearch" });
          } else {
            if (secretFinderLogEl) secretFinderLogEl.replaceChildren(_h("span", { style: "color:var(--accent-red);" }, "No cor3.gg tab found"));
            secretFinderToggle.checked = false;
            await chrome.storage.sync.set({ secretFinderEnabled: false });
            updateSecretFinderStatusLabel(false);
          }
        } catch (e) {
          if (secretFinderLogEl) secretFinderLogEl.replaceChildren(_h("span", { style: "color:var(--accent-red);" }, "Error: " + e.message));
          secretFinderToggle.checked = false;
          await chrome.storage.sync.set({ secretFinderEnabled: false });
          updateSecretFinderStatusLabel(false);
        }
      }
    });
  }
  function initTogglesShowMore() {
    if (togglesShowMoreBtn && togglesExtra) {
      togglesShowMoreBtn.addEventListener("click", () => {
        const isHidden = togglesExtra.style.display === "none";
        togglesExtra.style.display = isHidden ? "" : "none";
        togglesShowMoreBtn.textContent = isHidden ? "Show Less \u25B2" : "Show More \u25BC";
      });
    }
  }
  function initSettingsLoad() {
    chrome.storage.sync.get(["disableBackground", "disableNetworkFog", "moveNotificationsLeft", "autoUpdateMarkets"], (result) => {
      if (disableBackgroundToggle) {
        disableBackgroundToggle.checked = result.disableBackground || false;
        updateBackgroundStatus();
      }
      if (disableNetworkFogToggle) {
        disableNetworkFogToggle.checked = result.disableNetworkFog || false;
        updateNetworkFogStatus();
      }
      if (moveNotificationsToggle) {
        moveNotificationsToggle.checked = result.moveNotificationsLeft || false;
        updateMoveNotificationsStatus();
      }
      if (autoUpdateMarketsToggle) {
        autoUpdateMarketsToggle.checked = result.autoUpdateMarkets || false;
        updateAutoUpdateMarketsStatus();
      }
    });
  }
  function initToggleStorageListeners() {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes.dailyHackLog) {
        const msg = changes.dailyHackLog.newValue;
        if (msg && dailyHackLogEl) {
          dailyHackLogEl.textContent = msg;
          dailyHackLogEl.style.display = "";
        }
      }
      if (area === "sync" && changes.autoDailyHackEnabled) {
        autoDailyHackToggle.checked = !!changes.autoDailyHackEnabled.newValue;
        updateDailyHackStatusLabel(autoDailyHackToggle.checked);
      }
      if (area === "sync" && changes.autoIceWallEnabled) {
        autoIceWallToggle.checked = !!changes.autoIceWallEnabled.newValue;
        updateIceWallStatusLabel(autoIceWallToggle.checked);
      }
      if (area === "local" && changes.iceWallSolverStatus) {
        renderSolverStatus(iceWallSolverStatusLine, changes.iceWallSolverStatus.newValue);
      }
      if (area === "sync" && changes.autoSimpleDecryptEnabled) {
        autoSimpleDecryptToggle.checked = !!changes.autoSimpleDecryptEnabled.newValue;
        updateSimpleDecryptStatusLabel(autoSimpleDecryptToggle.checked);
      }
      if (area === "local" && changes.simpleDecryptSolverStatus) {
        renderSolverStatus(simpleDecryptSolverStatusLine, changes.simpleDecryptSolverStatus.newValue);
      }
      if (area === "local" && changes.secretFinderLog) {
        const msg = changes.secretFinderLog.newValue;
        if (msg && secretFinderLogEl) {
          _safeSetHtml(secretFinderLogEl, msg);
          secretFinderLogEl.style.display = "";
        }
      }
      if (area === "sync" && changes.secretFinderEnabled) {
        secretFinderToggle.checked = !!changes.secretFinderEnabled.newValue;
        updateSecretFinderStatusLabel(secretFinderToggle.checked);
      }
    });
  }
  initAutoDecrypt();
  initAutoIceWall();
  initAutoSimpleDecrypt();
  initAutoDailyHack();
  initSettingsLoad();
  initBackgroundToggle();
  initNetworkFogToggle();
  initMoveNotificationsToggle();
  initAutoUpdateMarketsToggle();
  initSecretFinder();
  initTogglesShowMore();
  initToggleStorageListeners();

  // src/shared/expedition-settings.js
  var EXPEDITION_KEYS = [
    "expeditionModuleEnabled",
    "expeditionSaleMode",
    "autoSendMerc",
    "periodicMercDispatchEnabled",
    "autoClaimExpeditionMail",
    "decisionModifiers",
    "helperMode"
  ];
  var SALE_MODES = [
    { value: "off", label: "\u5173\u95ED", description: "\u4E0D\u81EA\u52A8\u51FA\u552E\u3002" },
    { value: "full", label: "\u4ED3\u5E93\u6EE1\u51FA\u552E", description: "\u7A7A\u95F4\u4E0D\u8DB3\u65F6\u51FA\u552E\u6700\u4FBF\u5B9C\u7684\u975E\u65E0\u4EBA\u673A\u8FDC\u5F81\u6389\u843D\uFF0C\u817E\u591F\u7A7A\u95F4\u5373\u505C\u6B62\u3002" },
    { value: "non-drone", label: "\u51FA\u552E\u975E\u65E0\u4EBA\u673A", description: "\u81EA\u52A8\u51FA\u552E\u6240\u6709\u53EF\u552E\u7684\u975E\u65E0\u4EBA\u673A\u8FDC\u5F81\u6389\u843D\uFF0C\u4FDD\u7559\u5168\u90E8\u65E0\u4EBA\u673A\u6750\u6599\u3002" },
    { value: "all", label: "\u5168\u51FA\u552E", description: "\u81EA\u52A8\u51FA\u552E\u5168\u90E8\u53EF\u552E\u8FDC\u5F81\u6389\u843D\uFF0C\u5305\u62EC\u65E0\u4EBA\u673A\u6750\u6599\u3002" }
  ];
  function normalizeExpeditionSettings(data = {}) {
    const merc = data.autoSendMerc || {};
    const cap = Number(merc.maxMercCost ?? 15e3);
    return {
      ...data,
      expeditionModuleEnabled: data.expeditionModuleEnabled === true,
      expeditionSaleMode: SALE_MODES.some((mode) => mode.value === data.expeditionSaleMode) ? data.expeditionSaleMode : "off",
      autoSendMerc: {
        ...merc,
        enabled: merc.enabled === true,
        maxMercCost: Number.isFinite(cap) && cap >= 0 ? cap : 15e3
      },
      periodicMercDispatchEnabled: data.periodicMercDispatchEnabled === true,
      autoClaimExpeditionMail: data.autoClaimExpeditionMail === true
    };
  }
  function expeditionEnabled(settings2) {
    return settings2?.expeditionModuleEnabled === true && !settings2.helperMode;
  }
  function saleModeLabel(mode) {
    return SALE_MODES.find((item) => item.value === mode)?.label || "\u5173\u95ED";
  }

  // src/shared/expedition-loot-catalogue.json
  var expedition_loot_catalogue_default = {
    sourceUrl: "https://github.com/3ncy/cor3/blob/main/Expeditions/Items.md",
    sourceSha: "535b06ae76c3a984cf9424074007e9a14e6f72dd",
    items: [
      {
        id: "01a08093-78f5-7804-83d2-0d18887ae667",
        name: "Airgap Unit",
        canSell: false,
        droneMaterial: false
      },
      {
        id: "019d719f-84f4-7c43-94f6-4d3fca8ddd6f",
        name: "Artificial milk",
        canSell: true,
        droneMaterial: true
      },
      {
        id: "019d719f-84f4-71e8-a58e-983a7207e73e",
        name: "Californium-252 slab",
        canSell: true,
        droneMaterial: true
      },
      {
        id: "019f5a01-0006-7a06-9006-101112131406",
        name: 'CCS "EVO5" miners gasmask',
        canSell: true,
        droneMaterial: false
      },
      {
        id: "019d719f-84f4-7112-91fe-e9e2207cd94d",
        name: 'CCS "Kaloshi" Utility boots',
        canSell: true,
        droneMaterial: true
      },
      {
        id: "019f5a01-0007-7a07-9007-101112131407",
        name: "CCS Class 2 gas filter canister",
        canSell: true,
        droneMaterial: false
      },
      {
        id: "019f5a01-0008-7a08-9008-101112131408",
        name: "CCS colonists cap",
        canSell: true,
        droneMaterial: false
      },
      {
        id: "019d719f-84f4-76e1-82fa-16d79b171b4f",
        name: "CCS Hydrogel Burn kit",
        canSell: true,
        droneMaterial: true
      },
      {
        id: "019d719f-84f4-7e32-b0fa-1898e62bb0b6",
        name: "CCS Painkiller inhaler",
        canSell: true,
        droneMaterial: true
      },
      {
        id: "019d719f-84f4-7351-8040-86e712e97825",
        name: "CCS small oxygen inhaler tank",
        canSell: true,
        droneMaterial: true
      },
      {
        id: "019d719f-84f4-7070-a07b-17da3a88c631",
        name: "Circuit components",
        canSell: true,
        droneMaterial: true
      },
      {
        id: "019d719f-84f4-7985-952a-5e39941f4536",
        name: 'Core tech NIC "Nano" package',
        canSell: true,
        droneMaterial: true
      },
      {
        id: "019d719f-84f4-7ff8-98f2-63eb5a113335",
        name: "Depleted Uranium Composites (DURC) container",
        canSell: true,
        droneMaterial: false
      },
      {
        id: "019d719f-84f4-7ccf-91b4-62ad4dbae7b9",
        name: "Fabricator magnet",
        canSell: true,
        droneMaterial: false
      },
      {
        id: "019d719f-84f4-7ae5-a18e-4d6e25e3ab0a",
        name: "FARLINE Universal Crimper",
        canSell: true,
        droneMaterial: true
      },
      {
        id: "019d719f-84f4-7a36-bb8a-7b6171502511",
        name: "High-load auxillary cable",
        canSell: true,
        droneMaterial: true
      },
      {
        id: "019d719f-84f4-7114-bd53-7867ad546099",
        name: "Holoscene Holographic cable",
        canSell: true,
        droneMaterial: true
      },
      {
        id: "019d719f-84f4-7d00-9248-9c9bc5f432da",
        name: "Holoscene Holographic processor",
        canSell: true,
        droneMaterial: true
      },
      {
        id: "019f5a01-000a-7a0a-900a-10111213140a",
        name: "Kalash Corp AK26 415mm barrel",
        canSell: true,
        droneMaterial: false
      },
      {
        id: "019f5a01-000b-7a0b-900b-10111213140b",
        name: "Kalash Corp AK26 factory bolt",
        canSell: true,
        droneMaterial: false
      },
      {
        id: "019d719f-84f4-7803-8770-274a795e38e4",
        name: "Kosmonavt Energy Bar",
        canSell: true,
        droneMaterial: true
      },
      {
        id: "019f1a2b-3c4d-7e5f-80c5-789abcdef012",
        name: "KTE-4417 Sealed Container",
        canSell: false,
        droneMaterial: false
      },
      {
        id: "019d719f-84f4-7645-aa0b-bd107fc57968",
        name: "METALIFE medical components",
        canSell: true,
        droneMaterial: true
      },
      {
        id: "019d719f-84f4-7601-a30b-50cc1cf91152",
        name: "Nergalium-79-B slab",
        canSell: true,
        droneMaterial: true
      },
      {
        id: "019d719f-84f4-7adb-82ba-8ea327b77723",
        name: 'NPO "Platforma" universal straps with backpack connector slot',
        canSell: true,
        droneMaterial: true
      },
      {
        id: "019d719f-84f4-7b3b-99d3-795a7d1a31c2",
        name: "Old Abibas beanie",
        canSell: true,
        droneMaterial: true
      },
      {
        id: "019f5a01-0005-7a05-9005-101112131405",
        name: 'Pack of old cigarettes "Space monkey"',
        canSell: true,
        droneMaterial: false
      },
      {
        id: "019d719f-84f4-7580-9dbc-f130c318394e",
        name: "Scalpel (CCS Field Surgeon Kit Mk2)",
        canSell: true,
        droneMaterial: true
      },
      {
        id: "019d719f-84f4-7d88-a0ea-ab3d4bbe9451",
        name: "Scissors (CCS Field Surgeon Kit Mk2)",
        canSell: true,
        droneMaterial: true
      },
      {
        id: "01a08093-78f5-7ccc-a927-a9c10dc8d066",
        name: "Sealed package",
        canSell: false,
        droneMaterial: false
      },
      {
        id: "019d719f-84f4-7393-a42e-3cb1607f993d",
        name: "Soylent green bar",
        canSell: true,
        droneMaterial: true
      },
      {
        id: "019d719f-84f4-765f-94f9-afd6fac3f7c4",
        name: 'SPI "Smartwrench" Powered adjustable wrench',
        canSell: true,
        droneMaterial: true
      },
      {
        id: "019d76f3-ceda-7c24-913b-146937d427af",
        name: "TX-71 board",
        canSell: false,
        droneMaterial: false
      },
      {
        id: "019f5a01-0009-7a09-9009-101112131409",
        name: "USOL Issued combat boots gen.6",
        canSell: true,
        droneMaterial: false
      },
      {
        id: "019d719f-84f4-7555-94c9-41e7c3267667",
        name: "Water vial",
        canSell: true,
        droneMaterial: true
      },
      {
        id: "019d719f-84f4-7a8b-9a82-8174aa4dc228",
        name: "XHI powerbank tester",
        canSell: true,
        droneMaterial: false
      },
      {
        id: "019d719f-84f4-7e07-b8a0-4d01fe9b95af",
        name: 'Zulu "TeamH" reinforced backpack',
        canSell: true,
        droneMaterial: false
      }
    ]
  };

  // src/shared/selective-loot-policy.js
  var DRONE_MATERIALS = expedition_loot_catalogue_default.items.filter((item) => item.droneMaterial);
  var SELECTIVE_SALE_ITEMS = expedition_loot_catalogue_default.items.filter((item) => item.canSell && !item.droneMaterial);
  var allowedIds = new Set(SELECTIVE_SALE_ITEMS.map((item) => item.id));
  var protectedIds = new Set(DRONE_MATERIALS.map((item) => item.id));
  function itemQuantity(item) {
    const quantity = item?.quantity === void 0 ? 1 : item.quantity;
    return Number.isSafeInteger(quantity) && quantity > 0 ? quantity : 0;
  }
  function isDroneMaterial(item) {
    return protectedIds.has(item?.itemConfigId);
  }

  // src/shared/expedition-sale-policy.js
  var known = new Map(expedition_loot_catalogue_default.items.filter((item) => item.canSell).map((item) => [item.id, item]));
  function lootName(item) {
    return item?.name || known.get(item?.itemConfigId)?.name || "\u672A\u77E5\u7269\u54C1";
  }

  // src/shared/expedition-workflow.js
  function mercList(data) {
    const mercs = Array.isArray(data) ? [...data] : [...data?.mercenaries || []];
    for (const slot of data?.eliteSlots || []) if (slot.mercenary && !mercs.some((merc) => merc.id === slot.mercenary.id)) mercs.push(slot.mercenary);
    return mercs;
  }

  // src/popup/expedition-ui.js
  var byId = (id) => document.getElementById(id);
  var root = byId("expeditionsSection");
  var settings = normalizeExpeditionSettings();
  var cache = {};
  var localKeys = [
    "expeditionsData",
    "expeditionsDataUpdatedAt",
    "expeditionDecisions",
    "mercenariesData",
    "usolMercenariesData",
    "mercConfigData",
    "mercenariesUpdatedAt",
    "usolMercenariesUpdatedAt",
    "stashData",
    "stashDataUpdatedAt",
    "specialistsData",
    "archivedExpeditionsData",
    "archivedExpeditionsUpdatedAt",
    "expeditionModuleStatus",
    "expeditionDispatchStatus",
    "expeditionMailStatus",
    "expeditionSaleStatus",
    "periodicMercNextCheckAt",
    "periodicMercDispatchStatus",
    "lastExpeditionDispatchAt",
    "mercDebugLogs"
  ];
  var toggleSettings = {
    autoSendMercenaryToggle: ["autoSendMerc", "enabled"],
    applyMercCostLimiterToggle: ["autoSendMerc", "applyMercCostLimiter"],
    autoChooseMercToggle: ["autoSendMerc", "autoChooseMerc"],
    autoChooseUsolFirstToggle: ["autoSendMerc", "autoChooseUsolFirst"],
    ignoreEliteMercToggle: ["autoSendMerc", "ignoreEliteMerc"],
    periodicMercDispatchToggle: ["periodicMercDispatchEnabled"],
    autoClaimExpeditionMailToggle: ["autoClaimExpeditionMail"],
    autoChooseCheckbox: ["decisionModifiers", "autoChoose"],
    noWaitAutoChooseCheckbox: ["decisionModifiers", "noWaitAutoChoose"],
    modifiersEnabledToggle: ["decisionModifiers", "enabled"],
    getRidOfVeteransToggle: ["decisionModifiers", "getRidOfVeterans"]
  };
  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== void 0) element.textContent = text;
    return element;
  }
  function remaining(end) {
    const ms = new Date(end).getTime() - Date.now();
    if (!Number.isFinite(ms)) return "\u65F6\u95F4\u672A\u77E5";
    if (ms <= 0) return "\u7B49\u5F85\u72B6\u6001\u5237\u65B0";
    const minutes = Math.ceil(ms / 6e4), hours = Math.floor(minutes / 60);
    return (hours ? hours + " \u5C0F\u65F6 " : "") + minutes % 60 + " \u5206\u949F";
  }
  var number = (value) => Number.isFinite(value) ? value.toLocaleString() : "--";
  var names = {
    RUNNING: "Running",
    IN_PROGRESS: "Running",
    EVENT: "Awaiting decision",
    COMPLETED: "Completed",
    FAILED: "Failed",
    AVAILABLE: "Available",
    RESTING: "Resting",
    CONTRACTED: "Contracted",
    VETERAN: "Veteran",
    RECRUIT: "Recruit",
    EXPERIENCED: "Experienced",
    FULL_SUCCESS: "Full success",
    SUCCESS: "Success",
    PARTIAL_SUCCESS: "Partial success",
    FAILURE: "Failure",
    DEATH: "Death",
    COMMON: "Common",
    UNCOMMON: "Uncommon",
    RARE: "Rare",
    EPIC: "Epic",
    LEGENDARY: "Legendary",
    QUEST: "Quest"
  };
  var translated = (value) => names[String(value).toUpperCase()] || value || "\u672A\u77E5";
  function detail(label, value) {
    return node("div", "detail-row", label + "\uFF1A" + value);
  }
  function actionButton(text, action, data) {
    const button2 = node("button", "refresh-btn-small", text);
    button2.type = "button";
    button2.dataset.expAction = "";
    button2.disabled = !expeditionEnabled(settings);
    button2.addEventListener("click", () => send(action, data, button2));
    return button2;
  }
  async function send(action, data = {}, button2) {
    if (button2) button2.disabled = true;
    try {
      const tab = await getCor3Tab();
      if (!tab) throw new Error("\u8BF7\u5148\u6253\u5F00 cor3.gg \u6E38\u620F\u6807\u7B7E\u9875");
      const result = await chrome.tabs.sendMessage(tab.id, { action, ...data });
      byId("expeditionActionStatus").textContent = result?.message || "\u8BF7\u6C42\u5DF2\u53D1\u9001\uFF0C\u8BF7\u67E5\u770B\u65E5\u5FD7";
    } catch (error) {
      byId("expeditionActionStatus").textContent = "\u65E0\u6CD5\u8FDE\u63A5\u6E38\u620F\uFF1A" + error.message + "\uFF1B\u66F4\u65B0\u6269\u5C55\u540E\u8BF7\u5237\u65B0\u6E38\u620F\u3002";
    } finally {
      if (button2) button2.disabled = !expeditionEnabled(settings);
    }
  }
  async function saveMerc(patch) {
    const data = await chrome.storage.sync.get("autoSendMerc");
    const autoSendMerc = { ...data.autoSendMerc || {}, ...patch };
    if (patch.enabled === true) autoSendMerc.disabledReason = null;
    await chrome.storage.sync.set({ autoSendMerc });
  }
  for (const [id, path] of Object.entries(toggleSettings)) {
    byId(id).addEventListener("change", async () => {
      const checked = byId(id).checked;
      if (path[0] === "autoSendMerc") await saveMerc({ [path[1]]: checked });
      else if (path[0] === "decisionModifiers") {
        const { decisionModifiers = {} } = await chrome.storage.sync.get("decisionModifiers");
        await chrome.storage.sync.set({ decisionModifiers: { loot: 1, risk: -5, ...decisionModifiers, [path[1]]: checked } });
      } else await chrome.storage.sync.set({ [path[0]]: checked });
    });
  }
  byId("expeditionModuleToggle").addEventListener("change", () => {
    chrome.storage.sync.set({ expeditionModuleEnabled: byId("expeditionModuleToggle").checked });
  });
  byId("saveMercCostBtn").addEventListener("click", async () => {
    const value = Number(byId("maxMercCostInput").value);
    if (!Number.isFinite(value) || value < 0) {
      byId("expeditionActionStatus").textContent = "\u8D39\u7528\u4E0A\u9650\u5FC5\u987B\u662F\u975E\u8D1F\u6570\u5B57";
      return;
    }
    await saveMerc({ maxMercCost: Math.floor(value) });
    byId("expeditionActionStatus").textContent = "\u4F63\u5175\u8D39\u7528\u4E0A\u9650\u5DF2\u4FDD\u5B58";
  });
  byId("saveDecisionModifiersBtn").addEventListener("click", async () => {
    const loot = Number(byId("lootModifier").value), risk = Number(byId("riskModifier").value);
    if (!Number.isFinite(loot) || !Number.isFinite(risk)) {
      byId("expeditionActionStatus").textContent = "\u8BC4\u5206\u6743\u91CD\u5FC5\u987B\u662F\u6570\u5B57";
      return;
    }
    const { decisionModifiers = {} } = await chrome.storage.sync.get("decisionModifiers");
    await chrome.storage.sync.set({ decisionModifiers: { ...decisionModifiers, loot, risk } });
    byId("expeditionActionStatus").textContent = "\u51B3\u7B56\u6743\u91CD\u5DF2\u4FDD\u5B58";
  });
  for (const mode of SALE_MODES) {
    byId("expSale_" + mode.value).addEventListener("change", async () => {
      const selected = byId("expSale_" + mode.value).checked ? mode.value : "off";
      settings.expeditionSaleMode = selected;
      renderSettings();
      await chrome.storage.sync.set({ expeditionSaleMode: selected });
    });
  }
  for (const [id, action, data] of [
    ["refreshExpeditionBtn", "expeditionRefresh", { mercs: false }],
    ["refreshMercenariesBtn", "expeditionRefresh", { mercs: true }],
    ["refreshInventoryBtn", "expeditionRefresh", { mercs: false }],
    ["refreshArchivedBtn", "expeditionRefresh", { mercs: false }],
    ["checkExpeditionMailBtn", "checkExpeditionMail"],
    ["expeditionCheckNowBtn", "expeditionCheckNow"]
  ]) byId(id).addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    send(action, data, byId(id));
  });
  for (const panel of root.querySelectorAll("details.exp-panel")) {
    const key = "expeditionPanel_" + panel.id, defaultOpen = panel.hasAttribute("open");
    let restoring = true;
    chrome.storage.local.get(key, (data) => {
      panel.open = data[key] ?? defaultOpen;
      setTimeout(() => {
        restoring = false;
      }, 0);
    });
    panel.addEventListener("toggle", () => {
      if (!restoring) chrome.storage.local.set({ [key]: panel.open });
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes[key] && panel.open !== changes[key].newValue) panel.open = !!changes[key].newValue;
    });
  }
  function renderSettings() {
    byId("expeditionModuleToggle").checked = settings.expeditionModuleEnabled;
    for (const [id, path] of Object.entries(toggleSettings)) {
      let value = path.length === 1 ? settings[path[0]] : settings[path[0]]?.[path[1]];
      if (id === "modifiersEnabledToggle") value = value !== false;
      byId(id).checked = !!value;
    }
    if (document.activeElement !== byId("maxMercCostInput")) byId("maxMercCostInput").value = settings.autoSendMerc.maxMercCost;
    if (document.activeElement !== byId("lootModifier")) byId("lootModifier").value = settings.decisionModifiers?.loot ?? 1;
    if (document.activeElement !== byId("riskModifier")) byId("riskModifier").value = settings.decisionModifiers?.risk ?? -5;
    for (const mode of SALE_MODES) byId("expSale_" + mode.value).checked = settings.expeditionSaleMode === mode.value;
    byId("expeditionSaleModeBadge").textContent = saleModeLabel(settings.expeditionSaleMode) + (expeditionEnabled(settings) ? "" : " \xB7 \u5DF2\u6682\u505C");
    byId("selectedMercenaryName").textContent = settings.autoSendMerc.mercenaryName || (settings.autoSendMerc.autoChooseMerc ? "\u6309\u8D39\u7528\u4E0E\u7B5B\u9009\u6761\u4EF6\u81EA\u52A8\u9009\u62E9" : "\u672A\u9009\u62E9");
    root.querySelectorAll("[data-exp-action]").forEach((button2) => {
      button2.disabled = !expeditionEnabled(settings);
    });
    byId("checkExpeditionMailBtn").disabled = !expeditionEnabled(settings) || !settings.autoClaimExpeditionMail;
    renderSummary();
  }
  function renderSummary() {
    const enabled = expeditionEnabled(settings), status = cache.expeditionModuleStatus;
    const exps = Array.isArray(cache.expeditionsData) ? cache.expeditionsData : [];
    const exp = exps.find((exp2) => !["COMPLETED", "FAILED"].includes(exp2.status));
    let text;
    if (!settings.expeditionModuleEnabled) text = "\u5DF2\u6682\u505C \xB7 \u5F00\u542F\u603B\u5F00\u5173\u540E\u6062\u590D\u5DF2\u4FDD\u5B58\u7684\u8FDC\u5F81\u8BBE\u7F6E";
    else if (settings.helperMode) text = "\u5DF2\u6682\u505C \xB7 Helper-Only \u6A21\u5F0F\u6B63\u5728\u7981\u7528\u81EA\u52A8\u64CD\u4F5C";
    else if (status?.phase === "error") text = status.message;
    else if (["queued", "collecting", "claiming", "selling", "launching", "mercenaries", "decision"].includes(status?.phase)) text = status.message;
    else if (exp) text = `${translated(exp.status)} \xB7 ${exp.mercenary?.callsign || "\u4F63\u5175\u672A\u77E5"}${exp.endTime ? " \xB7 \u5269\u4F59 " + remaining(exp.endTime) : ""}`;
    else text = (settings.autoSendMerc.enabled || settings.periodicMercDispatchEnabled) && cache.expeditionDispatchStatus?.message || status?.message || "\u7B49\u5F85\u6E38\u620F\u6570\u636E \xB7 \u5F00\u542F\u5B50\u529F\u80FD\u540E\u6309\u8BBE\u7F6E\u8FD0\u884C";
    byId("expeditionSummary").textContent = text;
    const next = cache.periodicMercNextCheckAt;
    let nextText = !enabled ? "\u5B9A\u65F6\u68C0\u67E5\u5DF2\u6682\u505C\uFF08\u8BBE\u7F6E\u5DF2\u4FDD\u7559\uFF09" : settings.periodicMercDispatchEnabled && next ? "\u4E0B\u6B21\u6D3E\u9063\u68C0\u67E5\uFF1A" + new Date(next).toLocaleTimeString("zh-CN", { hour12: false }) + " \xB7 " + remaining(next) : enabled && settings.periodicMercDispatchEnabled ? "\u6B63\u5728\u5EFA\u7ACB 30 \u5206\u949F\u68C0\u67E5\u8BA1\u5212" : "30 \u5206\u949F\u68C0\u67E5\u672A\u5F00\u542F";
    if (cache.lastExpeditionDispatchAt) nextText += " \xB7 \u4E0A\u6B21\u6D3E\u9063 " + new Date(cache.lastExpeditionDispatchAt).toLocaleTimeString("zh-CN", { hour12: false });
    byId("expeditionNextCheck").textContent = nextText;
    byId("periodicMercDispatchStatus").textContent = !enabled ? "\u8FDC\u5F81\u6A21\u5757\u5DF2\u6682\u505C" : status?.message || "\u7B49\u5F85\u9996\u6B21\u68C0\u67E5";
    byId("periodicMercDispatchSchedule").textContent = nextText;
    byId("expeditionMailStatus").textContent = !enabled ? "\u8FDC\u5F81\u6A21\u5757\u5DF2\u6682\u505C\uFF0C\u90AE\u4EF6\u8BBE\u7F6E\u5DF2\u4FDD\u7559" : !settings.autoClaimExpeditionMail ? "\u81EA\u52A8\u9886\u53D6\u5DF2\u5173\u95ED" : cache.expeditionMailStatus?.message || "\u7B49\u5F85\u68C0\u67E5\u8FDC\u5F81\u5956\u52B1\u90AE\u4EF6";
    byId("expeditionSaleStatus").textContent = !enabled ? "\u8FDC\u5F81\u6A21\u5757\u5DF2\u6682\u505C\uFF0C\u51FA\u552E\u6A21\u5F0F\u5DF2\u4FDD\u7559" : settings.expeditionSaleMode === "off" ? "\u4E0D\u81EA\u52A8\u51FA\u552E" : cache.expeditionSaleStatus?.message || "\u7B49\u5F85\u68C0\u67E5\u4ED3\u5E93";
    root.querySelectorAll("[data-exp-end]").forEach((element) => {
      element.textContent = remaining(element.dataset.expEnd);
    });
  }
  function renderActive() {
    const container = byId("expeditionInfoContainer");
    container.replaceChildren();
    const exps = Array.isArray(cache.expeditionsData) ? cache.expeditionsData : [];
    if (!exps.length) container.appendChild(node("div", "no-decisions", "\u5F53\u524D\u6CA1\u6709\u8FDC\u5F81\u3002"));
    for (const exp of exps) {
      const card = node("div", "expedition-card");
      const header = node("div", "exp-header");
      header.append(node("span", "exp-title", `\u{1F4CD} ${exp.locationName || "\u5730\u70B9\u672A\u77E5"} \u2014 ${exp.zoneName || "\u533A\u57DF\u672A\u77E5"}`), node("span", "exp-status", translated(exp.status)));
      card.append(
        header,
        detail("\u4F63\u5175", exp.mercenary?.callsign || "\u672A\u77E5"),
        detail("\u603B\u8D39\u7528", number(exp.totalCost) + " CR"),
        detail("\u4FDD\u9669", exp.hasInsurance ? "\u6709" : "\u65E0"),
        detail("\u98CE\u9669\u8BC4\u5206", exp.riskScore ?? "--")
      );
      if (exp.endTime) {
        state.expeditionEndTimes[exp.id] = exp.endTime;
        const row = node("div", "exp-timer-row"), timer = node("span", "exp-timer", remaining(exp.endTime));
        timer.dataset.expEnd = exp.endTime;
        const pin = node("button", "refresh-btn-small pin-btn", "\u{1F4CC}");
        pin.title = "\u56FA\u5B9A\u8FDC\u5F81\u5012\u8BA1\u65F6";
        pin.type = "button";
        pin.classList.toggle("pinned", !!state.pinnedTimers["exp_" + exp.id]);
        pin.addEventListener("click", async () => {
          state.pinnedTimers["exp_" + exp.id] = !state.pinnedTimers["exp_" + exp.id];
          await savePinnedState();
          renderPinnedTimers();
          renderActive();
        });
        row.append(timer, pin);
        card.append(row);
      }
      const items = Array.isArray(exp.containerData) ? exp.containerData : exp.containerData?.items || [];
      for (const item of items) card.append(detail("\u5956\u52B1", `${item.name || item.item?.name || "\u672A\u77E5\u7269\u54C1"} \xD7${item.quantity ?? 1}`));
      const pay = exp.messages?.find((message) => message.actionType === "pay_and_open");
      if (pay && !exp.containerOpenedAt) card.append(detail("\u5BB9\u5668\u5F00\u542F\u8D39\u7528", number(pay.actionData?.cost) + " CR"));
      if (["COMPLETED", "FAILED"].includes(exp.status)) card.append(actionButton("\u5904\u7406\u672C\u8F6E\u5956\u52B1", "expeditionCollectNow"));
      container.append(card);
    }
    byId("expeditionLastUpdated").textContent = cache.expeditionsDataUpdatedAt ? "\u72B6\u6001\u66F4\u65B0\u65F6\u95F4\uFF1A" + new Date(cache.expeditionsDataUpdatedAt).toLocaleTimeString("zh-CN", { hour12: false }) : "\u5C1A\u672A\u8BFB\u53D6\u670D\u52A1\u5668\u72B6\u6001";
    renderDecisions(exps);
  }
  function renderDecisions(exps) {
    const container = byId("decisionsContainer");
    container.replaceChildren();
    const decisions = exps.flatMap((exp) => (exp.messages || []).filter((message) => Array.isArray(message.decisionOptions)).map((message) => ({ ...message, expedition: exp })));
    const pending = decisions.filter((message) => !message.isResolved);
    byId("decisionsCount").textContent = pending.length ? `${pending.length} \u9879\u5F85\u5904\u7406` : "\u65E0\u5F85\u5904\u7406";
    if (!decisions.length) container.append(node("div", "no-decisions", "\u6CA1\u6709\u5F85\u5904\u7406\u7684\u51B3\u7B56\u3002"));
    for (const message of decisions) {
      const card = node("div", "decision-card");
      card.append(detail("\u4F63\u5175", message.expedition.mercenary?.callsign || "\u672A\u77E5"), node("div", "msg-content", message.content || ""));
      if (message.decisionDeadline) {
        const timer = detail("\u51B3\u7B56\u5269\u4F59\u65F6\u95F4", remaining(message.decisionDeadline));
        card.append(timer);
      }
      for (const opt of message.decisionOptions) {
        const row = node("div", "option-row" + (message.selectedOption === opt.id ? " option-selected" : ""));
        row.append(
          node("div", "option-label", opt.label + (message.selectedOption === opt.id ? " \u2713" : "")),
          detail("\u98CE\u9669 / \u6536\u76CA", `${opt.riskModifier >= 0 ? "+" : ""}${opt.riskModifier} / ${opt.lootModifier >= 0 ? "+" : ""}${opt.lootModifier}`)
        );
        if (!message.isResolved && new Date(message.decisionDeadline).getTime() > Date.now()) row.append(actionButton("\u9009\u62E9\u6B64\u9879", "expeditionManualDecision", {
          data: { expeditionId: message.expedition.id, messageId: message.id, selectedOption: opt.id }
        }));
        card.append(row);
      }
      container.append(card);
    }
  }
  function renderMercs() {
    const container = byId("mercenariesContainer");
    container.replaceChildren();
    for (const [key, label] of [["mercenariesData", "CORE"], ["usolMercenariesData", "USOL"]]) {
      const data = cache[key], mercs = mercList(data), eliteIds = new Set((data?.eliteSlots || []).map((slot) => slot.mercenary?.id));
      const details = node("details", "exp-material-details"), summary = node("summary", "", `${label} \u4F63\u5175\uFF08${mercs.length}\uFF09`);
      details.append(summary);
      for (const merc of mercs) {
        const cfg = cache.mercConfigData?.[merc.id], selected = settings.autoSendMerc.mercenaryId === merc.id;
        const card = node("div", "merc-card" + (selected ? " selected" : ""));
        if (merc.avatarSeed?.startsWith("https://")) {
          const img = node("img", "merc-avatar");
          img.src = merc.avatarSeed;
          img.alt = merc.callsign || "";
          img.loading = "lazy";
          card.append(img);
        }
        const body = node("div", "merc-details");
        body.append(
          node("div", "merc-name", (merc.callsign || merc.name || "\u672A\u77E5\u4F63\u5175") + (eliteIds.has(merc.id) ? " \xB7 \u7CBE\u82F1" : "")),
          detail("\u72B6\u6001", translated(merc.status)),
          detail("\u7B49\u7EA7 / \u5B8C\u6210\u4EFB\u52A1", `${translated(merc.rank)} / ${merc.missionsCompleted ?? "--"}`)
        );
        if (merc.restUntil && merc.status === "RESTING") {
          const timer = node("div", "exp-hint", remaining(merc.restUntil));
          timer.dataset.expEnd = merc.restUntil;
          body.append(timer);
        }
        body.append(detail("\u9635\u8425", label), detail("\u4E13\u957F", merc.specializationName || merc.specialization || "--"), detail("\u7279\u8D28", merc.traitName || merc.trait || "--"));
        if (merc.specializationDescription) body.append(node("div", "exp-hint", merc.specializationDescription));
        if (merc.traitDescription) body.append(node("div", "exp-hint", merc.traitDescription));
        if (merc.reputationRequirement !== void 0) body.append(detail("\u6240\u9700\u58F0\u671B", merc.reputationRequirement));
        if (cfg) {
          body.append(detail("\u5B9E\u9645\u8D39\u7528", number(cfg.totalCost) + " CR"), detail("\u98CE\u9669\u8BC4\u5206", cfg.riskScore ?? "--"));
          if (cfg.outcomeChances) body.append(detail("\u5931\u8D25\u5B58\u6D3B / \u9635\u4EA1\u6982\u7387", `${cfg.outcomeChances.failureSurviveChance ?? "--"}% / ${cfg.outcomeChances.deathChance ?? "--"}%`));
        } else body.append(node("div", "exp-hint", "\u8D39\u7528\u5C1A\u672A\u786E\u8BA4\uFF1B\u81EA\u52A8\u6D3E\u9063\u4E0D\u4F1A\u4F7F\u7528\u672A\u77E5\u8D39\u7528\u3002"));
        if (!settings.autoSendMerc.autoChooseMerc) {
          const select2 = node("button", "refresh-btn-small", selected ? "\u5DF2\u9009\u62E9" : "\u9009\u62E9\u6B64\u4F63\u5175");
          select2.type = "button";
          select2.addEventListener("click", () => saveMerc({ mercenaryId: merc.id, mercenaryName: merc.callsign || merc.name || merc.id }));
          body.append(select2);
        }
        card.append(body);
        details.append(card);
      }
      container.append(details);
    }
  }
  function renderMaterials() {
    const counts = /* @__PURE__ */ new Map();
    for (const item of cache.stashData?.items || []) counts.set(item.itemConfigId, (counts.get(item.itemConfigId) || 0) + itemQuantity(item));
    const table = node("table", "exp-material-table"), head = node("tr");
    head.append(node("th", "", "\u65E0\u4EBA\u673A\u6750\u6599"), node("th", "", "\u6301\u6709\u6570\u91CF"));
    table.append(head);
    for (const item of DRONE_MATERIALS) {
      const row = node("tr");
      row.append(node("td", "", item.name), node("td", "", counts.get(item.id) || 0));
      table.append(row);
    }
    byId("personalDroneContainer").replaceChildren(table);
  }
  function renderInventory() {
    const container = byId("inventoryContainer");
    container.replaceChildren();
    const stash = cache.stashData;
    byId("spaceInfo").textContent = stash ? `${stash.currentUsage ?? "?"} / ${stash.maxCapacity ?? "?"}` : "-- / --";
    const items = stash?.items || [];
    const total = items.filter((item) => item.canSell && Number.isFinite(item.sellPrice)).reduce((sum, item) => sum + item.sellPrice * itemQuantity(item), 0);
    byId("totalValue").textContent = `\u53EF\u552E\u7269\u54C1\u6309\u5F53\u524D\u5355\u4EF7\u5408\u8BA1\uFF1A${number(total)} CR`;
    for (const item of [...items].sort((a, b) => (b.sellPrice || 0) - (a.sellPrice || 0))) {
      const details = node("details", "exp-material-details"), summary = node("summary", "", `${lootName(item)} \xD7${itemQuantity(item)}${isDroneMaterial(item) ? " \xB7 \u65E0\u4EBA\u673A\u6750\u6599" : ""}`);
      details.append(summary);
      const body = node("div", "exp-item-detail");
      if (item.imageUrl?.startsWith("https://")) {
        const img = node("img");
        img.src = item.imageUrl;
        img.alt = lootName(item);
        img.style.cssText = "width:40px;height:40px;object-fit:contain;";
        body.append(img);
      }
      body.append(detail("\u54C1\u8D28", translated(item.tier)), detail("\u53EF\u51FA\u552E", item.canSell ? "\u662F" : "\u5426"));
      if (item.description) body.append(node("div", "", item.description));
      if (item.canSell) body.append(detail("\u5355\u4EF7", number(item.sellPrice) + " CR"));
      if (item.canCraft) body.append(detail("\u53EF\u7528\u4E8E\u5236\u4F5C", "\u662F"));
      if (item.canUse) body.append(detail("\u53EF\u4F7F\u7528", "\u662F"));
      if (item.canSell && !item.locked && !item.pinned) {
        const button2 = node("button", "refresh-btn-small", "\u624B\u52A8\u51FA\u552E 1 \u4EF6");
        button2.type = "button";
        button2.dataset.expAction = "";
        button2.disabled = !expeditionEnabled(settings);
        let confirming = false;
        button2.addEventListener("click", () => {
          if (!confirming) {
            confirming = true;
            button2.textContent = "\u518D\u6B21\u70B9\u51FB\u786E\u8BA4\u51FA\u552E";
            setTimeout(() => {
              confirming = false;
              button2.textContent = "\u624B\u52A8\u51FA\u552E 1 \u4EF6";
            }, 3e3);
            return;
          }
          confirming = false;
          send("expeditionManualSell", { itemId: item.id }, button2);
        });
        body.append(button2);
      }
      details.append(body);
      container.append(details);
    }
    renderSpecialists();
    renderMaterials();
  }
  function renderSpecialists() {
    const container = byId("specialistTimerInfo");
    container.replaceChildren();
    for (const specialist of cache.specialistsData?.specialists || []) for (const temp of specialist.temporary || []) {
      if (!temp.owned || !temp.expiresAt) continue;
      const card = node("div", "expedition-card");
      card.append(detail("\u4E34\u65F6\u4ED3\u5E93\u6269\u5BB9", `${temp.bonusSlots ?? "?"} \u683C`));
      const end = temp.status === "IN_GRACE" ? temp.gracePeriodEndAt : temp.expiresAt;
      const timer = node("div", "exp-hint", remaining(end));
      timer.dataset.expEnd = end;
      card.append(timer);
      if (temp.status === "IN_GRACE") card.append(node("div", "exp-hint", "\u79DF\u671F\u5DF2\u7ED3\u675F\uFF0C\u8BF7\u7559\u610F\u6E38\u620F\u5185\u7684\u5BBD\u9650\u671F\u4E0E\u7269\u54C1\u635F\u5931\u63D0\u793A\u3002"));
      const price = temp.prices?.find((price2) => !price2.items?.length) || temp.prices?.[0];
      if (price?.id) card.append(actionButton(`\u7EED\u79DF\uFF08${number(price.credits)} CR\uFF09`, "expeditionExtendStash", { data: {
        specialistType: specialist.specialistType || "ENGINEER",
        kind: temp.kind || "TEMPORARY",
        level: temp.level,
        priceId: price.id
      } }));
      container.append(card);
    }
  }
  function renderArchive() {
    const container = byId("archivedExpContainer");
    container.replaceChildren();
    const data = cache.archivedExpeditionsData;
    const items = Array.isArray(data) ? data : data?.items || data?.data || data?.allItems || [];
    if (!Array.isArray(items) || !items.length) {
      container.append(node("div", "no-decisions", "\u5C1A\u65E0\u5386\u53F2\u8FDC\u5F81\u6570\u636E\u3002"));
      return;
    }
    for (const exp of items) {
      const card = node("div", "archived-exp-card");
      card.append(
        node("div", "exp-title", `${exp.mercenary?.callsign || "\u672A\u77E5\u4F63\u5175"} \xB7 ${translated(exp.outcome || exp.status)}`),
        detail("\u5730\u70B9", `${exp.locationName || "--"} / ${exp.zoneName || "--"}`),
        detail("\u8D39\u7528 / \u98CE\u9669", `${number(exp.totalCost)} CR / ${exp.riskScore ?? "--"}`)
      );
      const raw = exp.containerData || exp.container;
      const loot = Array.isArray(raw) ? raw : raw?.items || [];
      if (loot.length) {
        const details = node("details", "exp-material-details");
        details.append(node("summary", "", `\u6218\u5229\u54C1\uFF08${loot.length} \u9879\uFF09`));
        for (const row of loot) {
          const item = row.item || row;
          details.append(detail(item.name || "\u672A\u77E5\u7269\u54C1", `\xD7${item.quantity ?? 1}${item.isCollected ? " \xB7 \u5DF2\u9886\u53D6" : ""}${item.isDeleted ? " \xB7 \u5DF2\u5220\u9664" : ""}`));
        }
        card.append(details);
      }
      if (exp.completedAt) card.append(detail("\u5B8C\u6210\u65F6\u95F4", new Date(exp.completedAt).toLocaleString("zh-CN", { hour12: false })));
      container.append(card);
    }
  }
  function renderLogs() {
    const body = byId("mercDebugLogsBody"), follow = body.scrollHeight - body.scrollTop - body.clientHeight < 30;
    const fragment = document.createDocumentFragment();
    const logs = cache.mercDebugLogs || [];
    if (!logs.length) fragment.append(node("div", "no-decisions", "\u7B49\u5F85\u6E38\u620F\u6D3B\u52A8\u3002\u66F4\u65B0\u6269\u5C55\u540E\u8BF7\u5237\u65B0\u6E38\u620F\u6807\u7B7E\u9875\u3002"));
    for (const log of logs) {
      const row = node("div", "debug-log-row log-" + (log.level || "info"));
      row.append(node("span", "log-time", "[" + new Date(log.timestamp).toLocaleTimeString("zh-CN", { hour12: false }) + "] "), document.createTextNode(log.msg));
      fragment.append(row);
    }
    body.replaceChildren(fragment);
    if (follow) body.scrollTop = body.scrollHeight;
  }
  function showLogs(enabled) {
    byId("mercDebugToggle").checked = enabled;
    byId("mercDebugConsole").style.display = enabled ? "" : "none";
  }
  byId("mercDebugToggle").addEventListener("change", () => {
    showLogs(byId("mercDebugToggle").checked);
    chrome.storage.sync.set({ mercDebugConsoleEnabled: byId("mercDebugToggle").checked });
  });
  byId("copyMercLogsBtn").addEventListener("click", async () => {
    const button2 = byId("copyMercLogsBtn");
    try {
      await navigator.clipboard.writeText((cache.mercDebugLogs || []).map((log) => `[${log.timestamp}] ${log.msg}`).join("\n"));
      button2.textContent = "\u5DF2\u590D\u5236";
    } catch {
      button2.textContent = "\u590D\u5236\u5931\u8D25";
    }
    setTimeout(() => {
      button2.textContent = "\u{1F4CB} \u590D\u5236";
    }, 2e3);
  });
  for (const item of DRONE_MATERIALS) byId("droneMaterialsKeepList").append(node("li", "", item.name));
  chrome.storage.sync.get([...EXPEDITION_KEYS, "mercDebugConsoleEnabled"], (data) => {
    settings = normalizeExpeditionSettings(data);
    showLogs(data.mercDebugConsoleEnabled !== false);
    renderSettings();
    renderMercs();
  });
  chrome.storage.local.get(localKeys, (data) => {
    cache = data;
    renderActive();
    renderMercs();
    renderInventory();
    renderArchive();
    renderLogs();
    renderSummary();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync") {
      if (EXPEDITION_KEYS.some((key) => changes[key])) {
        for (const key of EXPEDITION_KEYS) if (changes[key]) settings[key] = changes[key].newValue;
        settings = normalizeExpeditionSettings(settings);
        renderSettings();
        renderMercs();
        renderActive();
        renderInventory();
      }
      if (changes.mercDebugConsoleEnabled) showLogs(changes.mercDebugConsoleEnabled.newValue !== false);
    }
    if (area === "local") {
      for (const key of localKeys) if (changes[key]) cache[key] = changes[key].newValue;
      if (changes.expeditionsData) renderActive();
      if (changes.mercenariesData || changes.usolMercenariesData || changes.mercConfigData) renderMercs();
      if (changes.stashData || changes.specialistsData) renderInventory();
      if (changes.archivedExpeditionsData) renderArchive();
      if (changes.mercDebugLogs) renderLogs();
      renderSummary();
    }
  });
  setInterval(renderSummary, 1e3);

  // src/popup/loadout.js
  var loadoutError = document.getElementById("loadoutError");
  var loadoutHwContainer = document.getElementById("loadoutHwContainer");
  var loadoutOverviewContainer = document.getElementById("loadoutOverviewContainer");
  var loadoutSwContainer = document.getElementById("loadoutSwContainer");
  var loadoutSwCount = document.getElementById("loadoutSwCount");
  var refreshLoadoutBtn = document.getElementById("refreshLoadoutBtn");
  var loadoutHwToggle = document.getElementById("loadoutHwToggle");
  var loadoutHwBody = document.getElementById("loadoutHwBody");
  var loadoutOverviewToggle = document.getElementById("loadoutOverviewToggle");
  var loadoutOverviewBody = document.getElementById("loadoutOverviewBody");
  var loadoutSwToggle = document.getElementById("loadoutSwToggle");
  var loadoutSwBody = document.getElementById("loadoutSwBody");
  var loadoutSwSort = document.getElementById("loadoutSwSort");
  var loadoutSwSearch = document.getElementById("loadoutSwSearch");
  var cachedLoadoutData = null;
  loadoutHwToggle.addEventListener("click", () => {
    loadoutHwToggle.classList.toggle("open");
    loadoutHwBody.classList.toggle("open");
  });
  loadoutOverviewToggle.addEventListener("click", () => {
    loadoutOverviewToggle.classList.toggle("open");
    loadoutOverviewBody.classList.toggle("open");
  });
  loadoutSwToggle.addEventListener("click", () => {
    loadoutSwToggle.classList.toggle("open");
    loadoutSwBody.classList.toggle("open");
  });
  var LOADOUT_SPEC_MAP = {
    cpuFrequency: "CPU Frequency",
    cpuCores: "CPU Cores",
    cpuConsuming: "Power Consuming",
    gpuPower: "GPU Power",
    gpuMemory: "GPU Memory",
    gpuConsuming: "Power Consuming",
    ramFrequency: "RAM Frequency",
    ramMemory: "RAM Memory",
    psuPower: "PSU Power",
    psuProtection: "PSU Protection",
    cpu_frequency: "CPU Frequency",
    cpu_cores: "CPU Cores",
    gpu_power: "GPU Power",
    gpu_memory: "GPU Memory",
    ram_frequency: "RAM Frequency",
    ram_memory: "RAM Memory",
    psu_power: "PSU Power",
    psu_total: "PSU Total"
  };
  var LOADOUT_UNIT_MAP = {
    cpu_frequency: "GHz",
    cpuFrequency: "GHz",
    cpu_cores: "Count",
    cpuCores: "Count",
    gpu_power: "PFLOPS",
    gpuPower: "PFLOPS",
    gpu_memory: "TB",
    gpuMemory: "TB",
    ram_frequency: "GHz",
    ramFrequency: "GHz",
    ram_memory: "TB",
    ramMemory: "TB",
    psu_power: "kW",
    psuPower: "kW",
    psu_total: "kW",
    cpuConsuming: "kW",
    gpuConsuming: "kW"
  };
  function loadoutSpecLabel(key) {
    return LOADOUT_SPEC_MAP[key] || key;
  }
  function loadoutUnitLabel(key) {
    return LOADOUT_UNIT_MAP[key] || "";
  }
  var LOADOUT_INFO_SVG = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="color:currentColor"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5"/><path d="M12 17V12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="12" cy="8" r="0.75" fill="currentColor"/></svg>';
  var LOADOUT_INFO_SQUARE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none"><g clip-path="url(#li)"><path d="M3.759 1.2H12.243c.703 0 1.3.246 1.81.75.502.503.748 1.095.748 1.797v8.495c0 .71-.246 1.305-.748 1.807-.51.505-1.107.751-1.81.751H3.76c-.71 0-1.306-.246-1.809-.749-.502-.502-.749-1.097-.749-1.808V3.747c0-.703.246-1.295.75-1.798.502-.503 1.098-.75 1.808-.75z" stroke="currentColor" stroke-width="0.8"/><path d="M6.994 3.837h2.002v1.992H6.994V3.837zM6.994 7.124h2.002v5.049H6.994V7.124z" fill="currentColor"/></g><defs><clipPath id="li"><rect width="16" height="16" fill="currentColor"/></clipPath></defs></svg>';
  var LOADOUT_CHANGE_SVG = '<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg"><mask id="mc" maskUnits="userSpaceOnUse" x="0" y="0" width="15" height="15" style="mask-type:alpha"><rect width="15" height="15" fill="#D9D9D9"/></mask><g mask="url(#mc)"><path d="M4.375 13.125L1.25 10L4.375 6.875L5.26562 7.75L3.64062 9.375H13.125V10.625H3.64062L5.26562 12.25L4.375 13.125ZM10.625 8.125L9.73438 7.25L11.3594 5.625H1.875V4.375H11.3594L9.73438 2.75L10.625 1.875L13.75 5L10.625 8.125Z" fill="#76C1D1"/></g></svg>';
  var LOADOUT_INSTALL_SVG = '<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg"><mask id="mi" maskUnits="userSpaceOnUse" x="0" y="0" width="15" height="15" style="mask-type:alpha"><rect width="15" height="15" fill="#D9D9D9"/></mask><g mask="url(#mi)"><path d="M7.5 9.894L3.95 6.345l1.167-1.18L6.67 6.728V2.2h1.656v4.528l1.554-1.563 1.167 1.18L7.5 9.894zM3.855 12.8c-.461 0-.853-.16-1.174-.482A1.614 1.614 0 012.2 11.144V9.27h1.656v1.875h7.288V9.27H12.8v1.875c0 .461-.16.853-.482 1.174-.321.322-.713.482-1.174.482H3.855z" fill="#00CDAB"/></g></svg>';
  var LOADOUT_UNINSTALL_SVG = '<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg"><mask id="mu" maskUnits="userSpaceOnUse" x="0" y="0" width="15" height="15" style="mask-type:alpha"><rect width="15" height="15" fill="#D9D9D9"/></mask><g mask="url(#mu)"><path d="M4.277 13.425a1.614 1.614 0 01-1.174-.482 1.614 1.614 0 01-.482-1.174V3.847H1.793V2.191h3.628V1.363H9.56v.828h3.646v1.656h-.828v7.922c0 .461-.16.853-.482 1.174-.321.322-.713.482-1.174.482H4.277zm6.445-9.578H4.277v7.922h6.445V3.847zM5.466 10.616h1.453V4.991H5.466v5.625zm2.614 0h1.453V4.991H8.08v5.625z" fill="#FF5050"/></g></svg>';
  var HW_SPEC_DISPLAY = {
    cpuFrequency: ["Frequency", "GHz"],
    cpuCores: ["Cores count", "count"],
    cpuConsuming: ["Power consuming", "kW"],
    gpuPower: ["Power", "PFLOPS"],
    gpuMemory: ["Memory", "TB"],
    gpuConsuming: ["Power consuming", "kW"],
    ramFrequency: ["Frequency", "GHz"],
    ramMemory: ["Memory", "TB"],
    psuPower: ["Power", "kW"],
    psuProtection: ["Protection", "%"]
  };
  function hwSpecRows(specs, vuln) {
    let h = "";
    Object.entries(specs).forEach(([k, v]) => {
      const d = HW_SPEC_DISPLAY[k];
      if (!d) return;
      h += '<div class="loadout-hw-stat-row"><span>' + d[0] + " " + d[1] + '</span><span class="stat-val">' + v + "</span></div>";
    });
    if (vuln !== void 0 && vuln !== null) {
      h += '<div class="loadout-hw-stat-row"><span>Vulnerability %</span><span class="stat-val">' + vuln + "</span></div>";
    }
    return h;
  }
  function hwSpecRowsSmall(specs, vuln, cls) {
    let h = "";
    Object.entries(specs).forEach(([k, v]) => {
      const d = HW_SPEC_DISPLAY[k];
      if (!d) return;
      h += '<div class="' + cls + '"><span>' + d[0] + " " + d[1] + '</span><span class="stat-val">' + v + "</span></div>";
    });
    if (vuln !== void 0 && vuln !== null) {
      h += '<div class="' + cls + '"><span>Vulnerability %</span><span class="stat-val">' + vuln + "</span></div>";
    }
    return h;
  }
  function showHwInfoPopup(item) {
    const popup = document.getElementById("hwInfoPopup");
    const overlay = document.getElementById("hwInfoOverlay");
    let h = '<div class="info-title">' + LOADOUT_INFO_SVG + " " + (item.name || "").toUpperCase() + "</div>";
    h += '<div class="info-desc">';
    const matchedSubstr = item.name ? Object.keys(zoomList).find((substring) => item.name.includes(substring)) : "";
    let zoomHWImg = "";
    if (matchedSubstr) {
      zoomHWImg = `style="transform:scale(${zoomList[matchedSubstr]});object-fit:contain;"`;
    }
    if (item.image) h += `<div style="overflow:clip;"><img ${zoomHWImg} src="${item.image}" alt=""></div>`;
    h += "<span>" + (item.description || "No description available.") + "</span>";
    h += "</div>";
    h += '<div class="info-specs">';
    const specs = item.specs || {};
    Object.entries(specs).forEach(([k, v]) => {
      const d = HW_SPEC_DISPLAY[k];
      if (!d) return;
      h += '<div class="info-spec-item"><div class="info-spec-label">' + d[0] + '</div><div class="info-spec-val">' + v + " " + d[1] + "</div></div>";
    });
    if (item.itemVulnerability !== void 0) {
      h += '<div class="info-spec-item"><div class="info-spec-label">Vulnerability</div><div class="info-spec-val">' + item.itemVulnerability + " %</div></div>";
    }
    h += "</div>";
    _safeSetHtml(popup, h);
    popup.classList.add("open");
    overlay.classList.add("open");
    const close = () => {
      popup.classList.remove("open");
      overlay.classList.remove("open");
      overlay.removeEventListener("click", close);
    };
    overlay.addEventListener("click", close);
  }
  function renderLoadoutHardware(data) {
    if (!data || !data.equippedHardware) {
      loadoutHwContainer.replaceChildren(_noData("No hardware data"));
      return;
    }
    const hw = data.equippedHardware;
    const avail = data.ownedHardware || [];
    const cats = ["cpu", "gpu", "ram", "psu"];
    let html = "";
    cats.forEach((cat) => {
      const item = hw[cat];
      if (!item) return;
      const replacements = avail.filter((a) => a.category && a.category.toLowerCase() === cat && a.id !== item.id);
      html += '<div class="loadout-hw-card">';
      html += '<div class="loadout-hw-left">';
      html += '<div class="loadout-hw-header">';
      html += '<div class="loadout-hw-cat">' + (item.category || cat.toUpperCase()) + "</div>";
      html += '<div class="loadout-hw-name">' + (item.name || "Unknown") + "</div>";
      html += "</div>";
      html += '<div class="loadout-hw-stats">' + hwSpecRows(item.specs || {}, item.itemVulnerability) + "</div>";
      html += "</div>";
      html += '<div class="loadout-hw-right">';
      html += '<button class="loadout-hw-change-btn" data-cat="' + cat + '">' + LOADOUT_CHANGE_SVG + "CHANGE</button>";
      html += '<button class="loadout-hw-info-btn" data-hw-cat="' + cat + '">' + LOADOUT_INFO_SVG + "INFO</button>";
      html += "</div>";
      html += "</div>";
      html += '<div class="loadout-hw-replace-list" data-cat="' + cat + '">';
      html += '<input type="text" class="loadout-hw-replace-search" placeholder="Search..." data-cat="' + cat + '">';
      html += '<div class="replace-items-wrap" data-cat="' + cat + '">';
      replacements.forEach((r) => {
        html += '<div class="loadout-hw-replace-item" data-search-name="' + (r.name || "").toLowerCase() + '">';
        html += '<div class="replace-left">';
        html += '<div class="replace-header">';
        html += '<div class="replace-cat">' + (r.category || cat.toUpperCase()) + "</div>";
        html += '<div class="replace-name">' + (r.name || "") + "</div>";
        html += "</div>";
        html += '<div class="replace-stats">' + hwSpecRowsSmall(r.specs || {}, r.itemVulnerability, "replace-stat-row") + "</div>";
        html += "</div>";
        html += '<div class="replace-right">';
        html += '<button class="replace-btn" data-id="' + r.id + '">' + LOADOUT_CHANGE_SVG + "CHANGE</button>";
        html += '<button class="replace-info-btn" data-hw-id="' + r.id + '">' + LOADOUT_INFO_SVG + '<span style="margin-top: 1px;">INFO</span></button>';
        html += "</div>";
        html += "</div>";
      });
      html += "</div>";
      html += "</div>";
    });
    if (html) {
      _safeSetHtml(loadoutHwContainer, html);
    } else {
      loadoutHwContainer.replaceChildren(_noData("No hardware equipped"));
    }
    loadoutHwContainer.querySelectorAll(".loadout-hw-change-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const cat = btn.dataset.cat;
        const list = loadoutHwContainer.querySelector('.loadout-hw-replace-list[data-cat="' + cat + '"]');
        if (list) list.classList.toggle("open");
      });
    });
    loadoutHwContainer.querySelectorAll(".loadout-hw-replace-search").forEach((input) => {
      input.addEventListener("input", () => {
        const cat = input.dataset.cat;
        const val = input.value.toLowerCase().trim();
        const wrap = loadoutHwContainer.querySelector('.replace-items-wrap[data-cat="' + cat + '"]');
        if (!wrap) return;
        wrap.querySelectorAll(".loadout-hw-replace-item").forEach((item) => {
          item.style.display = !val || item.dataset.searchName.includes(val) ? "" : "none";
        });
      });
    });
    loadoutHwContainer.querySelectorAll(".replace-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        clearLoadoutError();
        const moduleConfigId = btn.dataset.id;
        btn.disabled = true;
        btn.textContent = "...";
        try {
          const tab = await getCor3Tab();
          if (tab) await chrome.tabs.sendMessage(tab.id, { action: "equipHardware", moduleConfigId });
        } catch (err) {
          showLoadoutError("Equip failed: " + err.message);
        }
      });
    });
    loadoutHwContainer.querySelectorAll(".loadout-hw-info-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const cat = btn.dataset.hwCat;
        const item = hw[cat];
        if (item) showHwInfoPopup(item);
      });
    });
    loadoutHwContainer.querySelectorAll(".replace-info-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.dataset.hwId;
        const item = avail.find((a) => a.id === id);
        if (item) showHwInfoPopup(item);
      });
    });
  }
  function renderLoadoutOverview(data) {
    if (!data || !data.resources) {
      loadoutOverviewContainer.replaceChildren(_noData("No resource data"));
      return;
    }
    const res = data.resources;
    const supply = res.supply || {};
    const demand = res.demand || {};
    const TOTAL_CELLS = 20;
    const UNIT_LABELS = { cpu_frequency: "GHZ", cpu_cores: "COUNT", gpu_power: "PFLOPS", gpu_memory: "TB", ram_frequency: "GHZ", ram_memory: "TB", psu_power: "KW" };
    let html = '<div class="loadout-res-stats">';
    html += '<div class="loadout-res-header"><div class="loadout-res-header-cell">Type</div><div class="loadout-res-header-cell">Usage / Available</div></div>';
    const keys = ["cpu_frequency", "cpu_cores", "gpu_power", "gpu_memory", "ram_frequency", "ram_memory", "psu_power"];
    keys.forEach((key) => {
      const s = supply[key];
      const d = demand[key] || demand[key === "psu_power" ? "psu_total" : key] || 0;
      if (s === void 0) return;
      const ratio = s > 0 ? Math.min(d / s, 1) : 0;
      let colorFill = "";
      if (ratio > 0.95) {
        colorFill = "red";
      } else if (ratio > 0.75) {
        colorFill = "yellow";
      } else {
        colorFill = "blue";
      }
      const filledCount = Math.round(ratio * TOTAL_CELLS);
      const unit = UNIT_LABELS[key] || "";
      html += '<div class="loadout-res-row">';
      html += '<div class="loadout-res-name">' + loadoutSpecLabel(key) + "</div>";
      html += '<div class="loadout-res-bar-wrap">';
      html += '<div class="loadout-res-bar-edge ' + colorFill + '"></div>';
      html += '<div class="loadout-res-bar-cells">';
      for (let i = 0; i < TOTAL_CELLS; i++) {
        html += '<div class="loadout-res-bar-cell ' + (i < filledCount ? "filled-" : "empty-") + colorFill + '"></div>';
      }
      html += "</div>";
      html += '<div class="loadout-res-bar-edge ' + colorFill + '"></div>';
      html += "</div>";
      const dFmt = Number.isInteger(d) ? d : parseFloat(d.toFixed(2));
      const sFmt = Number.isInteger(s) ? s : parseFloat(s.toFixed(2));
      html += '<div class="loadout-res-vals"><span class="res-highlight">' + dFmt + " / " + sFmt + "</span> " + unit + "</div>";
      html += "</div>";
    });
    html += "</div>";
    _safeSetHtml(loadoutOverviewContainer, html);
  }
  function loadoutToolSvg(type) {
    const t = (type || "").toUpperCase();
    if (t === "DECRYPT") return '<svg class="loadout-sw-tool-icon" width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M14.28 6.929c-.018.67.407 1.005 1.276 1.005h5.455L14.28 1.2V6.93zM4.428 1.2c-.96 0-1.439.475-1.439 1.425v18.75c0 .95.48 1.425 1.44 1.425h15.158c.95 0 1.425-.475 1.425-1.425V9.712h-5.456c-.94 0-1.633-.212-2.076-.638-.679-.47-1.004-1.204-.977-2.2V1.2H4.428zm3.88 10.169l1.046 1.059-2.579 2.593 2.592 2.593-1.058 1.06-3.637-3.653 3.637-3.652zm3.678 0h1.52l-1.466 7.304h-1.52l1.466-7.304zm2.66 1.059l1.072-1.06 3.637 3.653-3.664 3.652-1.045-1.059 2.606-2.579-2.606-2.607z" fill="#F1F4F5"/></svg>';
    if (t === "HACK") return '<svg class="loadout-sw-tool-icon" width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M11.259 11.23H6.067v6.844c0 .811.285 1.496.855 2.055.569.574 1.257.861 2.063.861h2.275V11.23zm6.674 0h-5.192v9.76h2.275c.811 0 1.499-.287 2.063-.861.57-.56.854-1.244.854-2.055V11.23zm1.965 3.203h-.862v1.594h.862c.866 0 1.3.436 1.3 1.307v3.936H22.8v-3.936c0-1.934-.967-2.9-2.902-2.9zm2.759-2h-3.598v1.217h3.598V12.44zm-1.466-5.955c0 .866-.431 1.3-1.293 1.3h-1.323v1.601h1.323c1.925 0 2.887-.967 2.887-2.9V2.73h-1.595v3.755zM4.964 14.433H4.102c-1.935 0-2.902.967-2.902 2.9v3.937h1.602v-3.936c0-.871.434-1.307 1.3-1.307h.862v-1.594zm-.023-1.994v-1.217H1.344v1.217h3.597zM5.425 9.386V7.784H4.102c-.862 0-1.293-.433-1.293-1.3V2.731H1.215v3.754c0 1.934.963 2.901 2.887 2.901h1.323zM6.725 6.334v3.143h10.55V6.334c0-.403-.063-.813-.189-1.232a3.063 3.063 0 00-.574-1.08c-.509-.509-1.129-.763-1.86-.763H9.347c-.73 0-1.35.254-1.859.763a3.063 3.063 0 00-.574 1.08c-.126.42-.189.83-.189 1.232z" fill="white"/></svg>';
    if (t === "SEARCH") return '<svg class="loadout-sw-tool-icon" width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M17.171 3.934C15.348 2.111 13.144 1.2 10.56 1.2 7.979 1.2 5.775 2.111 3.948 3.934 2.125 5.761 1.214 7.967 1.214 10.552c-.001 2.58.91 4.782 2.734 6.605 1.827 1.827 4.231 2.74 6.812 2.74 1.759 0 3.342-.422 4.749-1.267.278-.167.549-.351.812-.552l1.765 1.765-.001-.005 2.962 2.962 1.939-1.977-2.962-2.956.054-.06-.06.06-1.743-1.738c1.224-1.607 1.836-3.466 1.836-5.578 0-2.584-.914-4.69-2.74-6.517zm.574 6.617c0 1.983-.702 3.674-2.106 5.074-1.4 1.404-3.094 2.106-5.08 2.106-1.982 0-3.675-.702-5.079-2.106-1.4-1.4-2.101-3.091-2.101-5.074 0-1.986.7-3.681 2.101-5.085C6.884 4.066 8.577 3.366 10.56 3.366c1.986 0 3.679.7 5.079 2.1 1.404 1.405 2.106 3.1 2.106 5.085z" fill="white"/></svg>';
    return '<svg class="loadout-sw-tool-icon" width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="white" stroke-width="1.5"/><path d="M12 8v4l2 2" stroke="white" stroke-width="1.5" stroke-linecap="round"/></svg>';
  }
  function getSwToolGroup(sw) {
    const specs = sw.specs || [];
    const order = { hack: 0, decrypt: 1, search: 2, view: 3, load: 4 };
    let best = 99;
    specs.forEach((s) => {
      const t = (s.type || "").toLowerCase();
      if (order[t] !== void 0 && order[t] < best) best = order[t];
    });
    return best;
  }
  function swMatchesFilter(sw, filterVal) {
    if (filterVal === "all") return true;
    const specs = sw.specs || [];
    return specs.some((s) => (s.type || "").toLowerCase() === filterVal);
  }
  function renderLoadoutSoftware(data) {
    if (!data) {
      loadoutSwContainer.replaceChildren(_noData("No software data"));
      return;
    }
    const equipped = data.equippedSoftware || [];
    const available = data.ownedSoftware || [];
    const softwarePower = data.resources && data.resources.softwarePower || [];
    const equippedIds = new Set(equipped.map((s) => s.id));
    const all = [];
    equipped.forEach((s) => all.push({ ...s, installed: true }));
    available.filter((s) => !equippedIds.has(s.id)).forEach((s) => all.push({ ...s, installed: false }));
    const filterVal = loadoutSwSort.value;
    const searchVal = (loadoutSwSearch.value || "").toLowerCase().trim();
    let filtered = all.filter((s) => swMatchesFilter(s, filterVal));
    if (searchVal) filtered = filtered.filter((s) => (s.name || "").toLowerCase().includes(searchVal) || (s.manufacturer || "").toLowerCase().includes(searchVal));
    const installedItems = filtered.filter((s) => s.installed).sort((a, b) => getSwToolGroup(a) - getSwToolGroup(b));
    const uninstalledItems = filtered.filter((s) => !s.installed).sort((a, b) => getSwToolGroup(a) - getSwToolGroup(b));
    const sorted = [...installedItems, ...uninstalledItems];
    const installedCount = equipped.length;
    const totalCount = all.length;
    loadoutSwCount.textContent = "(" + installedCount + "/" + totalCount + ")";
    if (sorted.length === 0) {
      loadoutSwContainer.replaceChildren(_noData("No programs found"));
      return;
    }
    let html = "";
    sorted.forEach((sw) => {
      const pwInfo = softwarePower.find((p) => p.moduleId === sw.id);
      const specs = sw.specs || [];
      const consuming = sw.consuming || {};
      html += '<div class="loadout-sw-card' + (sw.installed ? " installed" : "") + '">';
      html += '<div class="loadout-sw-header">';
      html += '<div class="loadout-sw-row">';
      html += '<div style="overflow:hidden;border-radius:4px;width:40px;height:40px;">';
      html += '<img class="loadout-sw-img"';
      const matchedSubstring = Object.keys(zoomList).find((substring) => sw.name.includes(substring));
      if (matchedSubstring) {
        html += `style="transform:scale(${zoomList[matchedSubstring]});"`;
      }
      html += ' src="' + (sw.image || "") + '" alt="' + (sw.name || "") + '"></div>';
      html += '<div class="loadout-sw-name">' + (sw.name || "Unknown") + "</div>";
      html += "</div>";
      if (sw.installed) {
        html += '<button class="loadout-sw-install-btn uninstall" data-id="' + sw.id + '" data-action="uninstall">' + LOADOUT_UNINSTALL_SVG + "UNINSTALL</button>";
      } else {
        html += '<button class="loadout-sw-install-btn install" data-id="' + sw.id + '" data-action="install">' + LOADOUT_INSTALL_SVG + "INSTALL</button>";
      }
      html += "</div>";
      const funcLines = specs.map((spec) => {
        const typeLabel = (spec.type || "").toUpperCase();
        let line2 = "<div>";
        line2 += '<span class="func-label">FUNC:</span>';
        line2 += '<span class="func-tags">' + typeLabel;
        if (spec.power) line2 += " " + spec.power[0] + "/" + spec.power[1];
        line2 += "</span>";
        line2 += "</div>";
        return line2;
      });
      html += '<div class="loadout-sw-func">';
      html += '<div class="func-left">' + funcLines.join(" ") + "</div>";
      html += '<button class="loadout-sw-info-btn" data-sw-id="' + sw.id + '">' + LOADOUT_INFO_SVG + ' <span style="margin-top: 1px;">INFO</span></button>';
      html += "</div>";
      html += '<div class="loadout-sw-details" data-details-id="' + sw.id + '">';
      html += '<div class="loadout-sw-details-header">Basic Required</div>';
      const consumeKeys = ["cpu_frequency", "cpu_cores", "gpu_power", "gpu_memory", "ram_frequency", "ram_memory"];
      const noAllocKeys = /* @__PURE__ */ new Set(["cpu_frequency", "ram_frequency"]);
      const supply = data.resources && data.resources.supply || {};
      let hasConsume = false;
      if (sw.installed) {
        const rowList = [];
        let minPct = 100;
        let minPctIndex = 0;
        let counter = 0;
        consumeKeys.forEach((ck) => {
          const vals = consuming[ck];
          if (!vals || !Array.isArray(vals) || vals.length < 2) return;
          hasConsume = true;
          const unit = loadoutUnitLabel(ck);
          let allocV, minV, maxV;
          if (noAllocKeys.has(ck)) {
            allocV = null;
            minV = vals[0];
            maxV = vals[1];
          } else {
            allocV = vals[0];
            minV = vals.length >= 2 ? vals[1] : vals[0];
            maxV = vals.length >= 3 ? vals[2] : vals[vals.length - 1];
          }
          let otherBaseDemand = 0;
          equipped.forEach((otherSw) => {
            if (otherSw.id === sw.id) return;
            const otherVals = otherSw.consuming && otherSw.consuming[ck];
            if (!otherVals || !Array.isArray(otherVals)) return;
            otherBaseDemand += otherVals.length === 3 ? otherVals[0] : 0;
          });
          const availableV = (supply[ck] || 0) - otherBaseDemand;
          let pct;
          if (maxV > minV) {
            pct = Math.max(0, Math.min((availableV - minV) / (maxV - minV), 1)) * 100;
          } else {
            pct = availableV >= minV ? 100 : 0;
          }
          if (pct < minPct) {
            minPct = pct;
            minPctIndex = counter;
          }
          rowList.push({
            "label": loadoutSpecLabel(ck),
            "supplyV": supply[ck] || 0,
            "allocV": allocV,
            "unit": unit,
            "minV": minV,
            "maxV": maxV,
            "pct": pct
          });
          counter++;
        });
        counter = 0;
        let color = "blue";
        rowList.forEach((obj) => {
          html += '<div class="loadout-sw-stat-row">';
          html += '<span class="stat-name">' + obj["label"];
          if (obj["allocV"] !== null) {
            html += ' <span class="stat-alloc">(' + obj["allocV"].toFixed(2) + " " + obj["unit"] + ")</span>";
          } else if (obj["unit"]) {
            html += ' <span class="stat-alloc">(' + obj["unit"] + ")</span>";
          }
          html += "</span>";
          html += '<span class="stat-val">' + obj["minV"].toFixed(2) + "/" + obj["maxV"].toFixed(2) + "</span>";
          html += "</div>";
          if (counter === minPctIndex && obj["pct"] !== 100) {
            color = "yellow";
          } else {
            color = "blue";
          }
          html += '<div class="loadout-sw-stat-bar"><div class="stat-bar-fill-' + color + '" style="width:' + obj["pct"].toFixed(1) + '%"></div></div>';
          counter++;
        });
        if (!hasConsume) html += '<div style="font-size:9px;color:rgba(107,120,136,1);">No consumption data</div>';
      } else {
        consumeKeys.forEach((ck) => {
          const vals = consuming[ck];
          if (!vals || !Array.isArray(vals) || vals.length < 2) return;
          hasConsume = true;
          const unit = loadoutUnitLabel(ck);
          let minV, maxV;
          if (noAllocKeys.has(ck)) {
            minV = vals[0];
            maxV = vals[1];
          } else {
            minV = vals.length >= 2 ? vals[1] : vals[0];
            maxV = vals.length >= 3 ? vals[2] : vals[vals.length - 1];
          }
          html += '<div class="loadout-sw-stat-row">';
          html += '<span class="stat-name">' + loadoutSpecLabel(ck);
          if (unit) html += ' <span class="stat-alloc">(' + unit + ")</span>";
          html += "</span>";
          html += '<span class="stat-val">' + minV.toFixed(2) + "/" + maxV.toFixed(2) + "</span>";
          html += "</div>";
          html += '<div class="loadout-sw-stat-bar"><div class="stat-bar-fill"></div></div>';
        });
        if (!hasConsume) html += '<div style="font-size:9px;color:rgba(107,120,136,1);">No consumption data</div>';
      }
      html += '<div class="loadout-sw-tool-section">';
      specs.forEach((spec) => {
        const typeLabel = (spec.type || "").toUpperCase() + " TOOL";
        html += '<div class="loadout-sw-tool-row">';
        html += "<div>" + loadoutToolSvg(spec.type) + "</div>";
        html += "<div>";
        html += '<div class="loadout-sw-tool-name">' + typeLabel + "</div>";
        html += '<div class="loadout-sw-tool-detail">';
        if (spec.fileTypes && spec.fileTypes.length > 0) {
          html += spec.fileTypes.length + " files";
          html += ' <span class="info-tooltip">' + LOADOUT_INFO_SQUARE_SVG + '<span class="tooltip-text">' + spec.fileTypes.join(", ") + "</span></span>";
        }
        if (spec.serverTypes && spec.serverTypes.length > 0) {
          html += spec.serverTypes.length + " servers";
          html += ' <span class="info-tooltip">' + LOADOUT_INFO_SQUARE_SVG + '<span class="tooltip-text">' + spec.serverTypes.join(", ") + "</span></span>";
        }
        html += "</div>";
        html += "</div>";
        html += "</div>";
        if (spec.power) {
          const pwEntry = pwInfo && pwInfo.abilities ? pwInfo.abilities.find((a) => a.type === spec.type) : null;
          html += '<div class="loadout-sw-power-row">';
          html += '<span class="power-label">Power</span>';
          if (pwEntry) {
            html += '<span class="power-val" style="color:rgba(0,205,171,1);font-weight:bold;">' + pwEntry.computedPower + "/" + spec.power[1] + "</span>";
          } else {
            html += '<span class="power-val">' + spec.power[0] + "/" + spec.power[1] + "</span>";
          }
          html += "</div>";
          const pwPct = spec.power[1] > 0 ? Math.min((pwEntry ? pwEntry.computedPower : spec.power[0]) / spec.power[1] * 100, 100) : 0;
          if (sw.installed) {
            html += '<div class="loadout-sw-stat-bar"><div class="stat-bar-fill-blue" style="width:' + pwPct.toFixed(1) + '%"></div></div>';
          } else {
            html += '<div class="loadout-sw-stat-bar"><div class="stat-bar-fill"></div></div>';
          }
        }
      });
      html += "</div>";
      if (pwInfo && pwInfo.ratio !== void 0) {
        html += '<div class="loadout-sw-stat-row" style="margin-top:4px;border-top:1px solid rgba(44,52,62,1);padding-top:4px;"><span class="stat-name">Performance Ratio</span><span class="stat-val">' + (pwInfo.ratio * 100).toFixed(1) + "%</span></div>";
      }
      html += "</div>";
      html += "</div>";
    });
    _safeSetHtml(loadoutSwContainer, html);
    loadoutSwContainer.querySelectorAll(".loadout-sw-install-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        clearLoadoutError();
        const moduleConfigId = btn.dataset.id;
        const action = btn.dataset.action;
        btn.disabled = true;
        btn.textContent = "...";
        try {
          const tab = await getCor3Tab();
          if (tab) {
            if (action === "install") {
              await chrome.tabs.sendMessage(tab.id, { action: "equipSoftware", moduleConfigId });
            } else {
              await chrome.tabs.sendMessage(tab.id, { action: "unequipSoftware", moduleConfigId });
            }
          }
        } catch (err) {
          showLoadoutError((action === "install" ? "Install" : "Uninstall") + " failed: " + err.message);
        }
      });
    });
    loadoutSwContainer.querySelectorAll(".loadout-sw-info-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const swId = btn.dataset.swId;
        const card = btn.closest(".loadout-sw-card");
        if (!card) return;
        const details = card.querySelector('.loadout-sw-details[data-details-id="' + swId + '"]');
        if (details) details.classList.toggle("open");
      });
    });
  }
  function showLoadoutError(msg) {
    loadoutError.textContent = msg;
    loadoutError.style.display = "block";
    setTimeout(() => {
      loadoutError.style.display = "none";
    }, 1e4);
  }
  function clearLoadoutError() {
    loadoutError.textContent = "";
    loadoutError.style.display = "none";
  }
  function renderLoadout(data) {
    if (!data) {
      loadoutHwContainer.replaceChildren(_noData("No loadout data yet"));
      loadoutOverviewContainer.replaceChildren(_noData("No loadout data yet"));
      loadoutSwContainer.replaceChildren(_noData("No loadout data yet"));
      return;
    }
    cachedLoadoutData = data;
    renderLoadoutHardware(data);
    renderLoadoutOverview(data);
    renderLoadoutSoftware(data);
  }
  async function loadLoadout() {
    const { loadoutData, loadoutError: storedError } = await chrome.storage.local.get(["loadoutData", "loadoutError"]);
    if (storedError) showLoadoutError(storedError.message || JSON.stringify(storedError));
    renderLoadout(loadoutData || null);
  }
  async function refreshLoadout() {
    try {
      const tab = await getCor3Tab();
      if (!tab) throw new Error("No cor3.gg tab");
      await chrome.tabs.sendMessage(tab.id, { action: "requestLoadout" });
      setTimeout(() => {
        loadLoadout();
        refreshAllTimestamps();
      }, 3e3);
    } catch (e) {
      setTimeout(() => {
        loadLoadout();
        refreshAllTimestamps();
      }, 500);
    }
  }
  refreshLoadoutBtn.addEventListener("click", () => {
    clearLoadoutError();
    refreshLoadout();
  });
  loadoutSwSort.addEventListener("change", () => {
    if (cachedLoadoutData) renderLoadoutSoftware(cachedLoadoutData);
  });
  loadoutSwSearch.addEventListener("input", () => {
    if (cachedLoadoutData) renderLoadoutSoftware(cachedLoadoutData);
  });
  function initLoadoutStorageListener() {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes.loadoutData) {
        renderLoadout(changes.loadoutData.newValue);
        refreshAllTimestamps();
      }
      if (changes.loadoutError && changes.loadoutError.newValue) {
        showLoadoutError(changes.loadoutError.newValue.message || JSON.stringify(changes.loadoutError.newValue));
      }
    });
  }
  loadLoadout();
  initLoadoutStorageListener();

  // src/popup/auto-job-solver-ui.js
  var autoJobSolverToggle = document.getElementById("autoJobSolverToggle");
  var autoJobSolverStatus = document.getElementById("autoJobSolverStatus");
  var autoJobSolverSection = document.getElementById("autoJobSolverSection");
  var autoJobsTabHome = document.getElementById("autoJobsTabHome");
  var autoJobsTabDark = document.getElementById("autoJobsTabDark");
  var autoJobsTabSoyuz = document.getElementById("autoJobsTabSoyuz");
  var autoJobsTabUsol = document.getElementById("autoJobsTabUsol");
  var autoJobsContentHome = document.getElementById("autoJobsContentHome");
  var autoJobsContentDark = document.getElementById("autoJobsContentDark");
  var autoJobsContentSoyuz = document.getElementById("autoJobsContentSoyuz");
  var autoJobsContentUsol = document.getElementById("autoJobsContentUsol");
  var autoJobsStartBtn = document.getElementById("autoJobsStartBtn");
  var autoJobsDebugToggle = document.getElementById("autoJobsDebugToggle");
  var autoJobsDebugConsole = document.getElementById("autoJobsDebugConsole");
  var debugTabJobs = document.getElementById("debugTabJobs");
  var debugTabLogs = document.getElementById("debugTabLogs");
  var debugJobsBody = document.getElementById("debugJobsBody");
  var debugLogsBody = document.getElementById("debugLogsBody");
  var refreshAutoJobsBtn = document.getElementById("refreshAutoJobsBtn");
  var copyAllLogsBtn = document.getElementById("copyAllLogsBtn");
  var autoFinishAllJobsToggle = document.getElementById("autoFinishAllJobsToggle");
  var SUPPORTED_JOB_TYPES = [
    "File Decryption",
    "IP Injection",
    "Data Download",
    "Log Deletion",
    "Log Download",
    "Decrypt & Extract",
    "File Elimination",
    "Data Upload",
    "IP Cleanup"
  ];
  var MARKET_IDS2 = {
    home: "019d3ea4-85bd-7389-904d-8f7c85841134",
    dark: "019d3ea4-85bd-7389-904d-908ba9194aa0",
    soyuz: "019da731-2db5-7d76-9447-1ea3b9b78001",
    usol: "019e4065-6ae8-760d-8724-58ab4f2cf7d7"
  };
  var SERVER_PRIORITY = ["RM7-N1L1", "RM7-W3NCP", "RM7-N2L3", "RM7-N2L2", "RM7-N2ECP", "D4RK RM7CE", "RM7-S4L4", "RM7-E1SCP", "RM7-E1L2CT", "RM7-E1L5", "RM7-E1L3"];
  function getServerPriority(name) {
    const idx = SERVER_PRIORITY.indexOf(name);
    return idx >= 0 ? idx : SERVER_PRIORITY.length;
  }
  var JOB_TYPE_PRIORITY = [
    "IP Injection",
    "IP Cleanup",
    "Data Upload",
    "Data Download",
    "Log Deletion",
    "Log Download",
    "File Elimination",
    "File Decryption",
    "Decrypt & Extract"
  ];
  function getJobTypePriority(name) {
    const idx = JOB_TYPE_PRIORITY.indexOf(name);
    return idx >= 0 ? idx : JOB_TYPE_PRIORITY.length;
  }
  function resolveRecentJobMarket(recentJob, fallbackMarketKey, allMarketData) {
    if (recentJob.marketId) {
      for (const [key, id] of Object.entries(MARKET_IDS2)) {
        if (id === recentJob.marketId) return key;
      }
    }
    const jobId = recentJob.id;
    for (const [key, storageKey] of [["home", "marketData"], ["dark", "darkMarketData"], ["soyuz", "soyuzMarketData"], ["usol", "usolMarketData"]]) {
      const md = allMarketData[storageKey];
      if (md && md.jobs) {
        const match = md.jobs.find((j) => j.id === jobId);
        if (match) return key;
      }
    }
    return fallbackMarketKey;
  }
  var LOG_JOB_TYPES = ["Log Deletion", "Log Download"];
  function isJobBugged(job) {
    const serverName = job.relatedServers && job.relatedServers[0] ? job.relatedServers[0].serverName : job.serverName || "";
    return serverName === "D4RK RM7CE" && LOG_JOB_TYPES.includes(job.name || job.type);
  }
  var autoJobsRunning = false;
  var autoFinishAllActive = false;
  var autoJobsSelectedTypes = { home: [], dark: [], soyuz: [], usol: [] };
  var autoJobsDebugLogs = [];
  var AUTO_JOBS_MAX_LOGS = 200;
  var autoJobsTracker = [];
  function updateAutoJobSolverStatus(enabled) {
    autoJobSolverStatus.textContent = enabled ? "Active" : "Off";
    autoJobSolverStatus.style.color = enabled ? "var(--accent-green)" : "var(--text-dim)";
    autoJobSolverSection.style.display = enabled ? "" : "none";
    var card = autoJobSolverSection.closest(".popout-card");
    if (card) card.style.display = enabled ? "" : "none";
  }
  chrome.storage.sync.get("autoJobSolverEnabled", (data) => {
    const enabled = !!data.autoJobSolverEnabled;
    autoJobSolverToggle.checked = enabled;
    updateAutoJobSolverStatus(enabled);
    if (enabled) renderAutoJobsTabs();
  });
  autoJobSolverToggle.addEventListener("change", async () => {
    const enabled = autoJobSolverToggle.checked;
    await chrome.storage.sync.set({ autoJobSolverEnabled: enabled });
    updateAutoJobSolverStatus(enabled);
    if (enabled) renderAutoJobsTabs();
  });
  autoJobsTabHome.addEventListener("click", () => switchAutoJobsTab("home"));
  autoJobsTabDark.addEventListener("click", () => switchAutoJobsTab("dark"));
  autoJobsTabSoyuz.addEventListener("click", () => switchAutoJobsTab("soyuz"));
  autoJobsTabUsol.addEventListener("click", () => switchAutoJobsTab("usol"));
  function switchAutoJobsTab(market) {
    autoJobsTabHome.classList.toggle("active", market === "home");
    autoJobsTabDark.classList.toggle("active", market === "dark");
    autoJobsTabSoyuz.classList.toggle("active", market === "soyuz");
    autoJobsTabUsol.classList.toggle("active", market === "usol");
    autoJobsContentHome.classList.toggle("active", market === "home");
    autoJobsContentDark.classList.toggle("active", market === "dark");
    autoJobsContentSoyuz.classList.toggle("active", market === "soyuz");
    autoJobsContentUsol.classList.toggle("active", market === "usol");
  }
  async function renderAutoJobsTabs() {
    const { marketData, darkMarketData, darkMarketAvailable, darkMarketMaintenanceEndsAt, darkMarketBlockerServer, soyuzMarketData, soyuzMarketAvailable, soyuzMarketMaintenanceEndsAt, soyuzMarketBlockerServer, usolMarketData, usolMarketAvailable, usolMarketMaintenanceEndsAt, usolMarketBlockerServer, serverMaintenanceMap } = await chrome.storage.local.get(["marketData", "darkMarketData", "darkMarketAvailable", "darkMarketMaintenanceEndsAt", "darkMarketBlockerServer", "soyuzMarketData", "soyuzMarketAvailable", "soyuzMarketMaintenanceEndsAt", "soyuzMarketBlockerServer", "usolMarketData", "usolMarketAvailable", "usolMarketMaintenanceEndsAt", "usolMarketBlockerServer", "serverMaintenanceMap"]);
    renderAutoJobsMarket(autoJobsContentHome, marketData, "home");
    const darkB = darkMarketAvailable === false ? null : findMaintenanceBlocker(serverMaintenanceMap, "dark");
    renderAutoJobsMarket(autoJobsContentDark, darkMarketData, "dark", darkB ? false : darkMarketAvailable, darkB ? darkB.maintenanceEndsAt : darkMarketMaintenanceEndsAt, darkB ? darkB.blockerName : darkMarketBlockerServer);
    const soyuzB = soyuzMarketAvailable === false ? null : findMaintenanceBlocker(serverMaintenanceMap, "soyuz");
    renderAutoJobsMarket(autoJobsContentSoyuz, soyuzMarketData, "soyuz", soyuzB ? false : soyuzMarketAvailable, soyuzB ? soyuzB.maintenanceEndsAt : soyuzMarketMaintenanceEndsAt, soyuzB ? soyuzB.blockerName : soyuzMarketBlockerServer);
    const usolB = usolMarketAvailable === false ? null : findMaintenanceBlocker(serverMaintenanceMap, "usol");
    renderAutoJobsMarket(autoJobsContentUsol, usolMarketData, "usol", usolB ? false : usolMarketAvailable, usolB ? usolB.maintenanceEndsAt : usolMarketMaintenanceEndsAt, usolB ? usolB.blockerName : usolMarketBlockerServer);
    if (marketData && marketData.market && marketData.market.marketName) {
      autoJobsTabHome.textContent = "\u{1F3E0} " + marketData.market.marketName;
    }
    if (darkMarketData && darkMarketData.market && darkMarketData.market.marketName) {
      autoJobsTabDark.textContent = "\u{1F311} " + darkMarketData.market.marketName;
    }
    if (soyuzMarketData && soyuzMarketData.market && soyuzMarketData.market.marketName) {
      autoJobsTabSoyuz.replaceChildren(_h("span", { style: "color:#c33b3b;" }, "\u262D"), " " + soyuzMarketData.market.marketName);
    }
    if (usolMarketData && usolMarketData.market && usolMarketData.market.marketName) {
      autoJobsTabUsol.replaceChildren(_h("span", { style: "color:#2592A7;margin-right:1px" }, "\u262E"), " " + usolMarketData.market.marketName);
    }
  }
  function renderAutoJobsMarket(container, data, marketKey, marketAvailable, maintenanceEndsAt, blockerServer) {
    _clearEl(container);
    if (marketAvailable === false) {
      let timerHtml = "";
      if (blockerServer) timerHtml += " (" + blockerServer + " in maintenance";
      if (maintenanceEndsAt) {
        const diff = new Date(maintenanceEndsAt).getTime() - Date.now();
        if (diff > 0) {
          const mins = Math.ceil(diff / 6e4);
          timerHtml += (blockerServer ? ", " : " (") + "~" + mins + "m remaining";
        }
      }
      if (timerHtml) timerHtml += ")";
      const marketLabel = marketKey === "dark" ? "D4RK" : marketKey === "soyuz" ? "SOYUZ" : marketKey === "usol" ? "USOL" : "HOME";
      container.appendChild(_h("div", { className: "warning-banner" }, "\u26A0\uFE0F " + marketLabel + " market server is currently unreachable" + timerHtml + "."));
    }
    if (!data || !data.jobs && !data.recentJobs) {
      container.appendChild(_h("div", { className: "auto-jobs-no-jobs" }, "No jobs available. Click \u{1F504} to refresh market data."));
      return;
    }
    if (data.nextJobsResetAt) {
      const timerDiv = document.createElement("div");
      timerDiv.className = "auto-jobs-reset-timer";
      timerDiv.dataset.resetAt = data.nextJobsResetAt;
      timerDiv.textContent = "\u23F3 Jobs Reset: " + formatTimeRemaining(data.nextJobsResetAt);
      container.appendChild(timerDiv);
    }
    const openJobs = (data.jobs || []).filter((j) => !j.isCompleted && !j.isExpired);
    const takenJobs = (data.recentJobs || []).filter((j) => j.status === "TAKEN");
    for (const tj of takenJobs) {
      tj._isTaken = true;
    }
    const availableJobs = [...openJobs, ...takenJobs];
    if (availableJobs.length === 0) {
      const noJobsDiv = document.createElement("div");
      noJobsDiv.className = "auto-jobs-no-jobs";
      noJobsDiv.textContent = "All jobs completed or expired.";
      container.appendChild(noJobsDiv);
      return;
    }
    const typeMap = {};
    for (const job of availableJobs) {
      const typeName = job.name || "Unknown";
      if (!typeMap[typeName]) typeMap[typeName] = [];
      typeMap[typeName].push(job);
    }
    const checkboxes = [];
    for (const [typeName, jobs] of Object.entries(typeMap)) {
      const isSupported = SUPPORTED_JOB_TYPES.includes(typeName);
      const row = document.createElement("div");
      row.className = "auto-jobs-type-row";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.dataset.jobType = typeName;
      cb.dataset.market = marketKey;
      cb.disabled = !isSupported;
      if (isSupported && autoJobsSelectedTypes[marketKey] && autoJobsSelectedTypes[marketKey].includes(typeName)) {
        cb.checked = true;
      }
      cb.addEventListener("change", () => {
        updateAutoJobsSelectedTypes(marketKey, container);
        updateSelectAllState(selectAllCb, checkboxes);
      });
      const label = document.createElement("span");
      label.className = "job-type-label";
      label.textContent = typeName;
      const takenCount = jobs.filter((j) => j._isTaken).length;
      const buggedCount = jobs.filter((j) => isJobBugged(j)).length;
      const count = document.createElement("span");
      count.className = "job-type-count";
      let countText = `(${jobs.length}`;
      if (takenCount > 0) countText += `, ${takenCount} in-progress`;
      if (buggedCount > 0) countText += `, ${buggedCount} bugged`;
      countText += ")";
      count.textContent = countText;
      row.appendChild(label);
      if (!isSupported) {
        const tooltip = document.createElement("span");
        tooltip.className = "unsupported-tooltip";
        tooltip.textContent = "Not supported";
        tooltip.title = "This job type is currently not supported";
        row.appendChild(tooltip);
      } else if (buggedCount > 0 && buggedCount === jobs.length) {
        const tooltip = document.createElement("span");
        tooltip.className = "unsupported-tooltip";
        tooltip.style.color = "var(--accent-orange)";
        tooltip.textContent = "Bugged";
        tooltip.title = "Log jobs on D4RK RM7CE are bugged (logs tab unavailable)";
        row.appendChild(tooltip);
      }
      row.appendChild(count);
      row.appendChild(cb);
      container.appendChild(row);
      if (isSupported) checkboxes.push(cb);
    }
    const selectAllDiv = document.createElement("div");
    selectAllDiv.className = "auto-jobs-select-all";
    const selectAllCb = document.createElement("input");
    selectAllCb.type = "checkbox";
    selectAllCb.id = "selectAll_" + marketKey;
    const selectAllLabel = document.createElement("label");
    selectAllLabel.className = "job-type-label";
    selectAllLabel.setAttribute("for", selectAllCb.id);
    selectAllLabel.textContent = "Select All";
    const totalTaken = takenJobs.length;
    const selectAllCount = document.createElement("span");
    selectAllCount.className = "job-type-count";
    selectAllCount.textContent = totalTaken > 0 ? `(${availableJobs.length}, ${totalTaken} in-progress)` : `(${availableJobs.length})`;
    selectAllDiv.appendChild(selectAllLabel);
    selectAllDiv.appendChild(selectAllCount);
    selectAllDiv.appendChild(selectAllCb);
    container.appendChild(selectAllDiv);
    selectAllCb.addEventListener("change", () => {
      const checked = selectAllCb.checked;
      for (const cb of checkboxes) {
        cb.checked = checked;
      }
      updateAutoJobsSelectedTypes(marketKey, container);
    });
    updateSelectAllState(selectAllCb, checkboxes);
  }
  function updateAutoJobsSelectedTypes(marketKey, container) {
    const cbs = container.querySelectorAll('input[type="checkbox"][data-job-type]');
    autoJobsSelectedTypes[marketKey] = [];
    cbs.forEach((cb) => {
      if (cb.checked) autoJobsSelectedTypes[marketKey].push(cb.dataset.jobType);
    });
    chrome.storage.sync.set({ autoJobsSelectedTypes });
  }
  chrome.storage.sync.get("autoJobsSelectedTypes", (data) => {
    if (data.autoJobsSelectedTypes) {
      autoJobsSelectedTypes = data.autoJobsSelectedTypes;
    }
  });
  refreshAutoJobsBtn.addEventListener("click", async () => {
    autoJobsContentHome.replaceChildren(_h("div", { className: "auto-jobs-no-jobs" }, "Refreshing (sequential)..."));
    autoJobsContentDark.replaceChildren(_h("div", { className: "auto-jobs-no-jobs" }, "Refreshing (sequential)..."));
    autoJobsContentSoyuz.replaceChildren(_h("div", { className: "auto-jobs-no-jobs" }, "Refreshing (sequential)..."));
    autoJobsContentUsol.replaceChildren(_h("div", { className: "auto-jobs-no-jobs" }, "Refreshing (sequential)..."));
    try {
      const tab = await getCor3Tab();
      if (tab) {
        await chrome.tabs.sendMessage(tab.id, { action: "refreshAllMarketsSeq" });
      }
    } catch (e) {
    }
    await new Promise((r) => {
      let done = false;
      const listener = (changes, area) => {
        if (area === "local" && changes._allMarketsRefreshed) {
          done = true;
          chrome.storage.onChanged.removeListener(listener);
          clearTimeout(tmr);
          r();
        }
      };
      chrome.storage.onChanged.addListener(listener);
      const tmr = setTimeout(() => {
        if (!done) {
          chrome.storage.onChanged.removeListener(listener);
          r();
        }
      }, 3e4);
    });
    renderAutoJobsTabs();
  });
  copyAllLogsBtn.addEventListener("click", async () => {
    if (copyAllLogsBtn.dataset.busy === "true") return;
    copyAllLogsBtn.dataset.busy = "true";
    copyAllLogsBtn.textContent = "\u23F3";
    copyAllLogsBtn.title = "Collecting logs...";
    const MAX_COPY_BYTES = 10 * 1024 * 1024;
    try {
      const storageKeys = ["autoJobsDebugLogs", "valuableDebugLogs", "cor3_errors"];
      const storageData = await chrome.storage.local.get(storageKeys);
      const tab = await getCor3Tab();
      let wsLogs = [];
      let idbAutoJobLogs = [];
      let idbAutoValuableLogs = [];
      let idbErrorLogs = [];
      let idbPageConsoleLogs = [];
      let idbExtConsoleLogs = [];
      try {
        if (tab) {
          const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
              return new Promise((resolve) => {
                const req = indexedDB.open("cor3_ws_db");
                req.onsuccess = (e) => {
                  const db = e.target.result;
                  const result = { ws: [], autoJobs: [], autoValuable: [], errors: [], pageConsole: [], extConsole: [] };
                  const stores = [];
                  if (db.objectStoreNames.contains("messages")) stores.push("messages");
                  if (db.objectStoreNames.contains("logs")) stores.push("logs");
                  if (stores.length === 0) {
                    db.close();
                    resolve(result);
                    return;
                  }
                  const tx = db.transaction(stores, "readonly");
                  let pending = stores.length;
                  const done = () => {
                    if (--pending <= 0) {
                      resolve(result);
                      db.close();
                    }
                  };
                  if (stores.includes("messages")) {
                    const idx = tx.objectStore("messages").index("timestamp");
                    const cur = idx.openCursor();
                    cur.onsuccess = (ev) => {
                      const c = ev.target.result;
                      if (!c) {
                        done();
                        return;
                      }
                      result.ws.push({ timestamp: c.value.timestamp, direction: c.value.direction, message: c.value.message });
                      c.continue();
                    };
                    cur.onerror = () => done();
                  }
                  if (stores.includes("logs")) {
                    const idx2 = tx.objectStore("logs").index("timestamp");
                    const cur2 = idx2.openCursor();
                    cur2.onsuccess = (ev) => {
                      const c = ev.target.result;
                      if (!c) {
                        done();
                        return;
                      }
                      const v = c.value;
                      const entry = { timestamp: v.timestamp, level: v.level, message: v.message };
                      if (v.category === "auto-jobs") result.autoJobs.push(entry);
                      else if (v.category === "auto-valuable") result.autoValuable.push(entry);
                      else if (v.category === "error-logs") result.errors.push(entry);
                      else if (v.category === "page-console") result.pageConsole.push(entry);
                      else if (v.category === "ext-console") result.extConsole.push(entry);
                      c.continue();
                    };
                    cur2.onerror = () => done();
                  }
                };
                req.onerror = () => resolve({ ws: [], autoJobs: [], autoValuable: [], errors: [], pageConsole: [], extConsole: [] });
              });
            },
            args: []
          });
          if (results && results[0] && results[0].result) {
            const r = results[0].result;
            wsLogs = r.ws || [];
            idbAutoJobLogs = r.autoJobs || [];
            idbAutoValuableLogs = r.autoValuable || [];
            idbErrorLogs = r.errors || [];
            idbPageConsoleLogs = r.pageConsole || [];
            idbExtConsoleLogs = r.extConsole || [];
          }
        }
      } catch (e) {
        console.log("[COR3 Helper] Could not read logs from IndexedDB:", e);
      }
      const mergedAutoJobLogs = idbAutoJobLogs.length > 0 ? idbAutoJobLogs : storageData.autoJobsDebugLogs || [];
      const mergedAutoValuableLogs = idbAutoValuableLogs.length > 0 ? idbAutoValuableLogs : storageData.valuableDebugLogs || [];
      const mergedErrors = idbErrorLogs.length > 0 ? idbErrorLogs : storageData.cor3_errors || [];
      const payload = {
        exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
        extensionVersion: chrome.runtime.getManifest().version,
        autoJobSolverLogs: mergedAutoJobLogs,
        autoValuableSellerLogs: mergedAutoValuableLogs,
        extensionErrors: mergedErrors,
        wsLogs,
        pageConsoleLogs: idbPageConsoleLogs,
        extensionConsoleLogs: idbExtConsoleLogs
      };
      let json = JSON.stringify(payload, null, 2);
      if (json.length > MAX_COPY_BYTES) {
        const trimmableKeys = ["wsLogs", "autoJobSolverLogs", "autoValuableSellerLogs", "extensionErrors", "pageConsoleLogs", "extensionConsoleLogs"];
        const getTs = (entry) => entry.timestamp || entry.ts || "";
        const allTs = [];
        for (const key of trimmableKeys) {
          const arr = payload[key];
          if (arr && arr.length > 0) allTs.push(getTs(arr[0]));
        }
        if (allTs.length > 0) {
          allTs.sort();
          let lo = allTs[0];
          let hi = (/* @__PURE__ */ new Date()).toISOString();
          for (let i = 0; i < 20 && json.length > MAX_COPY_BYTES; i++) {
            const loMs = new Date(lo).getTime();
            const hiMs = new Date(hi).getTime();
            const midMs = loMs + Math.floor((hiMs - loMs) / 2);
            const cutoff = new Date(midMs).toISOString();
            for (const key of trimmableKeys) {
              const arr = payload[key];
              if (!arr || arr.length === 0) continue;
              const idx = arr.findIndex((e) => getTs(e) >= cutoff);
              if (idx > 0) arr.splice(0, idx);
            }
            json = JSON.stringify(payload, null, 2);
            if (json.length > MAX_COPY_BYTES) lo = cutoff;
            else break;
          }
          while (json.length > MAX_COPY_BYTES) {
            let largest = null, largestLen = 0;
            for (const key of trimmableKeys) {
              if (payload[key] && payload[key].length > largestLen) {
                largest = key;
                largestLen = payload[key].length;
              }
            }
            if (!largest || largestLen <= 1) break;
            const removeCount = Math.max(1, Math.floor(largestLen * 0.3));
            payload[largest].splice(0, removeCount);
            json = JSON.stringify(payload, null, 2);
          }
        }
        console.log("[COR3 Helper] Trimmed logs to " + (json.length / 1024 / 1024).toFixed(2) + " MB");
      }
      const wrapped = "```json\n" + json + "\n```";
      await navigator.clipboard.writeText(wrapped);
      const sizeMB = (wrapped.length / 1024 / 1024).toFixed(1);
      copyAllLogsBtn.textContent = "\u2705";
      copyAllLogsBtn.title = "Logs copied (" + sizeMB + " MB)";
      setTimeout(() => {
        copyAllLogsBtn.textContent = "\u{1F4CB}";
        copyAllLogsBtn.title = "Copy all debug logs to clipboard";
        copyAllLogsBtn.dataset.busy = "false";
      }, 2e3);
    } catch (e) {
      console.log("[COR3 Helper] Copy all logs failed:", e);
      cor3LogError("popup.js", e, { action: "copyAllLogs" });
      copyAllLogsBtn.textContent = "\u274C";
      copyAllLogsBtn.title = "Failed to copy logs";
      setTimeout(() => {
        copyAllLogsBtn.textContent = "\u{1F4CB}";
        copyAllLogsBtn.title = "Copy all debug logs to clipboard";
        copyAllLogsBtn.dataset.busy = "false";
      }, 2e3);
    }
  });
  autoJobsStartBtn.addEventListener("click", async () => {
    if (autoJobsRunning) {
      autoJobsRunning = false;
      autoJobsStartBtn.textContent = "\u25B6 Start Auto Jobs";
      autoJobsStartBtn.className = "auto-jobs-btn-start start";
      addAutoJobLog("Auto Jobs stopped by user.", "warn");
      try {
        const tab = await getCor3Tab();
        if (tab) await chrome.tabs.sendMessage(tab.id, { action: "stopAutoJobs" });
      } catch (e) {
      }
      await chrome.storage.local.set({ autoJobsRunning: false });
    } else {
      autoJobsRunning = true;
      autoJobsStartBtn.textContent = "\u25A0 Stop Auto Jobs";
      autoJobsStartBtn.className = "auto-jobs-btn-start stop";
      const { marketData, darkMarketData, soyuzMarketData, usolMarketData } = await chrome.storage.local.get(["marketData", "darkMarketData", "soyuzMarketData", "usolMarketData"]);
      const jobsToRun = [];
      const seenTakenJobIds = /* @__PURE__ */ new Set();
      for (const marketKey of ["home", "dark", "soyuz", "usol"]) {
        const md = marketKey === "home" ? marketData : marketKey === "dark" ? darkMarketData : marketKey === "usol" ? usolMarketData : soyuzMarketData;
        if (!md) continue;
        const selectedTypes = autoJobsSelectedTypes[marketKey] || [];
        if (selectedTypes.length === 0) continue;
        const openJobs = (md.jobs || []).filter((j) => !j.isCompleted && !j.isExpired && selectedTypes.includes(j.name));
        const takenJobs = (md.recentJobs || []).filter((j) => j.status === "TAKEN" && selectedTypes.includes(j.name));
        for (const job of openJobs) {
          const serverName = job.relatedServers && job.relatedServers[0] ? job.relatedServers[0].serverName : "None";
          const serverId = job.relatedServers && job.relatedServers[0] ? job.relatedServers[0].id : job.conditions && job.conditions.serverConfigId ? job.conditions.serverConfigId : null;
          jobsToRun.push({
            jobId: job.id,
            name: job.name,
            type: job.name,
            serverName,
            serverId,
            marketId: MARKET_IDS2[marketKey],
            marketKey,
            rewardCredits: job.rewardCredits,
            rewardReputation: job.rewardReputation,
            deposit: job.deposit || 0,
            conditions: job.conditions ? job.conditions.items || job.conditions : [],
            alreadyTaken: false,
            canComplete: false,
            status: "pending"
          });
        }
        for (const job of takenJobs) {
          if (seenTakenJobIds.has(job.id)) continue;
          seenTakenJobIds.add(job.id);
          const trueMarketKey = resolveRecentJobMarket(job, marketKey, { marketData, darkMarketData, soyuzMarketData, usolMarketData });
          const serverName = job.relatedServers && job.relatedServers[0] ? job.relatedServers[0].serverName : "None";
          const serverId = job.relatedServers && job.relatedServers[0] ? job.relatedServers[0].id : job.conditions && job.conditions.serverConfigId ? job.conditions.serverConfigId : null;
          if (!selectedTypes.includes(job.name) && trueMarketKey !== marketKey) continue;
          jobsToRun.push({
            jobId: job.id,
            name: job.name,
            type: job.name,
            serverName,
            serverId,
            marketId: MARKET_IDS2[trueMarketKey],
            marketKey: trueMarketKey,
            rewardCredits: job.rewardCredits,
            rewardReputation: job.rewardReputation,
            deposit: job.deposit || 0,
            conditions: job.conditions ? job.conditions.items || job.conditions : [],
            alreadyTaken: true,
            canComplete: !!job.canComplete,
            status: "pending"
          });
        }
      }
      jobsToRun.sort((a, b) => {
        const sp = getServerPriority(a.serverName) - getServerPriority(b.serverName);
        if (sp !== 0) return sp;
        return getJobTypePriority(a.type || a.name) - getJobTypePriority(b.type || b.name);
      });
      if (jobsToRun.length === 0) {
        addAutoJobLog("No jobs selected or available to run.", "warn");
        autoJobsRunning = false;
        autoJobsStartBtn.textContent = "\u25B6 Start Auto Jobs";
        autoJobsStartBtn.className = "auto-jobs-btn-start start";
        return;
      }
      const newJobIds = new Set(jobsToRun.map((j) => j.jobId));
      const previousJobs = autoJobsTracker.filter(
        (j) => !newJobIds.has(j.jobId) && (j.status === "done" || j.status === "failed")
      );
      autoJobsTracker = [...previousJobs, ...jobsToRun];
      renderDebugJobs();
      addAutoJobLog(`Starting auto jobs: ${jobsToRun.length} job(s) queued.`, "info");
      await chrome.storage.local.set({ autoJobsRunning: true, autoJobsQueue: jobsToRun, autoJobsTracker });
      try {
        const tab = await getCor3Tab();
        if (tab) {
          await chrome.tabs.sendMessage(tab.id, {
            action: "startAutoJobs",
            jobs: jobsToRun,
            settings: {}
          });
        }
      } catch (e) {
        addAutoJobLog("Failed to send auto jobs to content script: " + e.message, "error");
      }
    }
  });
  chrome.storage.sync.get("autoJobsDebugConsoleEnabled", (data) => {
    const enabled = !!data.autoJobsDebugConsoleEnabled;
    autoJobsDebugToggle.checked = enabled;
    autoJobsDebugConsole.style.display = enabled ? "" : "none";
    if (enabled) {
      renderDebugJobs();
      renderDebugLogs();
    }
  });
  autoJobsDebugToggle.addEventListener("change", () => {
    const enabled = autoJobsDebugToggle.checked;
    chrome.storage.sync.set({ autoJobsDebugConsoleEnabled: enabled });
    autoJobsDebugConsole.style.display = enabled ? "" : "none";
    if (enabled) {
      renderDebugJobs();
      renderDebugLogs();
    }
  });
  debugTabJobs.addEventListener("click", () => {
    debugTabJobs.classList.add("active");
    debugTabLogs.classList.remove("active");
    debugJobsBody.classList.add("active");
    debugLogsBody.classList.remove("active");
  });
  debugTabLogs.addEventListener("click", () => {
    debugTabLogs.classList.add("active");
    debugTabJobs.classList.remove("active");
    debugLogsBody.classList.add("active");
    debugJobsBody.classList.remove("active");
  });
  chrome.storage.sync.get("autoFinishAllJobsEnabled", (data) => {
    autoFinishAllActive = !!data.autoFinishAllJobsEnabled;
    autoFinishAllJobsToggle.checked = autoFinishAllActive;
  });
  autoFinishAllJobsToggle.addEventListener("change", async () => {
    autoFinishAllActive = autoFinishAllJobsToggle.checked;
    await chrome.storage.sync.set({ autoFinishAllJobsEnabled: autoFinishAllActive });
    if (autoFinishAllActive) {
      addAutoJobLog("\u{1F504} Auto Finish All Jobs enabled", "info");
    } else {
      addAutoJobLog("\u{1F504} Auto Finish All Jobs disabled", "warn");
    }
    chrome.runtime.sendMessage({ action: "scheduleAutoFinishAll" }).catch(() => {
    });
  });
  async function dismissFailedJobsForMarket(marketKey, btn) {
    const storageKey = { home: "marketData", dark: "darkMarketData", soyuz: "soyuzMarketData", usol: "usolMarketData" }[marketKey];
    const data = await chrome.storage.local.get(storageKey);
    const md = data[storageKey];
    if (!md || !md.recentJobs) return;
    const failedJobs = md.recentJobs.filter((j) => j.status === "FAILED");
    if (failedJobs.length === 0) return;
    const marketId = MARKET_IDS2[marketKey];
    if (!marketId) return;
    const tab = await getCor3Tab();
    if (!tab) return;
    const dismissList = failedJobs.map((j) => ({ marketId, jobId: j.id }));
    let resp;
    try {
      resp = await chrome.tabs.sendMessage(tab.id, {
        action: "dismissFailedJobs",
        jobs: dismissList,
        marketKey
      });
    } catch (e) {
      console.log("[COR3 Helper] dismissFailedJobs sendMessage error:", e);
      return;
    }
    if (resp && (resp.queueResult === "queued" || resp.queueResult === "already-running")) {
      const activeType = resp.queueStatus && resp.queueStatus.active ? resp.queueStatus.active : "another automation";
      const friendlyNames = { "auto-jobs": "Auto Job Solver", "auto-valuable": "Auto Valuable Seller", "auto-update-markets": "Auto Update Markets", "auto-send": "Auto Send Mercenary", "clear-failed-jobs": "Clear Failed Jobs" };
      const activeName = friendlyNames[activeType] || activeType;
      if (btn) {
        btn.title = 'Delayed \u2014 waiting for "' + activeName + '" to finish';
        btn.style.cursor = "help";
      }
    }
    while (true) {
      await new Promise((r) => setTimeout(r, 1500));
      const qs = await chrome.storage.local.get("automationQueueStatus");
      const status = qs.automationQueueStatus || {};
      if (status.active !== "clear-failed-jobs" && !(status.queued || []).includes("clear-failed-jobs")) break;
    }
    addAutoJobLog(`\u{1F9F9} Dismissed ${failedJobs.length} failed job(s) from ${marketKey} market`, "info");
  }
  ["home", "dark", "soyuz", "usol"].forEach((key) => {
    const btnId = { home: "cleanupCoreMarketBtn", dark: "cleanupDarkMarketBtn", soyuz: "cleanupSoyuzMarketBtn", usol: "cleanupUsolMarketBtn" }[key];
    const btn = document.getElementById(btnId);
    if (btn) {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        btn.textContent = "\u23F3";
        const origTitle = btn.title;
        try {
          await dismissFailedJobsForMarket(key, btn);
        } catch (e) {
          console.log("[COR3 Helper] Cleanup error:", e);
          cor3LogError("popup.js", e, { action: "dismissFailedJobs", market: key });
        }
        btn.disabled = false;
        btn.textContent = "\u{1F9F9}";
        btn.title = origTitle;
        btn.style.cursor = "";
      });
    }
  });
  function addAutoJobLog(msg, level = "info") {
    autoJobsDebugLogs.push({ timestamp: (/* @__PURE__ */ new Date()).toISOString(), msg, level });
    if (autoJobsDebugLogs.length > AUTO_JOBS_MAX_LOGS) {
      autoJobsDebugLogs.shift();
    }
    renderDebugLogs();
    chrome.storage.local.set({ autoJobsDebugLogs });
  }
  function renderDebugLogs() {
    if (autoJobsDebugLogs.length === 0) {
      debugLogsBody.replaceChildren(_h("div", { style: "color:var(--text-dim);" }, "No logs yet."));
      return;
    }
    const frag = document.createDocumentFragment();
    for (const log of autoJobsDebugLogs) {
      const row = document.createElement("div");
      let levelClass = "";
      if (log.level === "error") levelClass = " log-error";
      else if (log.level === "success") levelClass = " log-success";
      else if (log.level === "warn") levelClass = " log-warn";
      row.className = "debug-log-row" + levelClass;
      const displayTime = log.timestamp ? log.timestamp.slice(11, 19) : log.time || "";
      row.appendChild(_h("span", { className: "log-time" }, "[" + displayTime + "]"));
      row.appendChild(document.createTextNode(" " + log.msg));
      frag.appendChild(row);
    }
    debugLogsBody.replaceChildren(frag);
    debugLogsBody.scrollTop = debugLogsBody.scrollHeight;
  }
  var _renderDebugJobsId = 0;
  async function renderDebugJobs() {
    const renderId = ++_renderDebugJobsId;
    const storageData = await chrome.storage.local.get(["autoJobsCompletedResults", "marketData", "darkMarketData", "soyuzMarketData", "usolMarketData", "autoJobsTracker"]);
    if (renderId !== _renderDebugJobsId) return;
    const { autoJobsCompletedResults, marketData, darkMarketData, soyuzMarketData, usolMarketData } = storageData;
    if (storageData.autoJobsTracker) {
      autoJobsTracker = storageData.autoJobsTracker;
    }
    const completedMap = {};
    if (autoJobsCompletedResults) {
      for (const cj of autoJobsCompletedResults) {
        completedMap[cj.jobId] = cj;
      }
    }
    const trackerMap = {};
    for (const tj of autoJobsTracker) {
      trackerMap[tj.jobId] = tj;
    }
    const marketSources = [
      { key: "home", label: () => ["\u{1F3E0} HOME"], data: marketData },
      { key: "dark", label: () => ["\u{1F311} D4RK"], data: darkMarketData },
      { key: "soyuz", label: () => [_h("span", { style: "color:#c33b3b;margin-left:2px;margin-right:2px" }, "\u262D"), " SOYUZ"], data: soyuzMarketData },
      { key: "usol", label: () => [_h("span", { style: "color:#2592A7;margin-right:2px" }, "\u262E"), " USOL"], data: usolMarketData }
    ];
    let hasAny = false;
    const frag = document.createDocumentFragment();
    for (const ms of marketSources) {
      let resolveStatus = function(jobId, fallbackStatus) {
        const completed = completedMap[jobId];
        if (completed) return { status: completed.status, reward: completed.reward, error: completed.error, lockExpiresAt: completed.lockExpiresAt || null, maintenanceEndsAt: completed.maintenanceEndsAt || null };
        const tracked = trackerMap[jobId];
        if (tracked && tracked.status && tracked.status !== "pending") {
          return { status: tracked.status, reward: tracked.reward || null, error: tracked.error || null, lockExpiresAt: tracked.lockExpiresAt || null, maintenanceEndsAt: tracked.maintenanceEndsAt || null };
        }
        return { status: fallbackStatus, reward: tracked && tracked.reward || null, error: tracked && tracked.error || null, lockExpiresAt: tracked && tracked.lockExpiresAt || null, maintenanceEndsAt: tracked && tracked.maintenanceEndsAt || null };
      };
      const allJobs = [];
      const seenIds = /* @__PURE__ */ new Set();
      if (ms.data && ms.data.jobs) {
        for (const j of ms.data.jobs) {
          if (j.isCompleted || j.isExpired) continue;
          const sn = j.relatedServers && j.relatedServers[0] ? j.relatedServers[0].serverName : "None";
          const resolved = resolveStatus(j.id, "open");
          allJobs.push({ id: j.id, name: j.name, type: j.jobType || j.name, serverName: sn, status: resolved.status, reward: resolved.reward, error: resolved.error, lockExpiresAt: resolved.lockExpiresAt, maintenanceEndsAt: resolved.maintenanceEndsAt });
          seenIds.add(j.id);
        }
      }
      if (ms.data && ms.data.recentJobs) {
        for (const j of ms.data.recentJobs) {
          if (j.status !== "TAKEN" && j.status !== "COMPLETED" || seenIds.has(j.id)) continue;
          const sn = j.relatedServers && j.relatedServers[0] ? j.relatedServers[0].serverName : "None";
          const marketStatus = j.status === "COMPLETED" ? "done" : "in-progress";
          const resolved = resolveStatus(j.id, marketStatus);
          allJobs.push({ id: j.id, name: j.name, type: j.jobType || j.name, serverName: sn, status: resolved.status, reward: resolved.reward, error: resolved.error, lockExpiresAt: resolved.lockExpiresAt, maintenanceEndsAt: resolved.maintenanceEndsAt });
          seenIds.add(j.id);
        }
      }
      for (const tj of autoJobsTracker) {
        if ((tj.marketKey || "home") !== ms.key || seenIds.has(tj.jobId)) continue;
        const resolved = resolveStatus(tj.jobId, tj.status === "pending" ? "open" : tj.status || "open");
        allJobs.push({ id: tj.jobId, name: tj.name, type: tj.type || tj.name, serverName: tj.serverName || "None", status: resolved.status, reward: resolved.reward, error: resolved.error, lockExpiresAt: resolved.lockExpiresAt, maintenanceEndsAt: resolved.maintenanceEndsAt });
        seenIds.add(tj.jobId);
      }
      if (autoJobsCompletedResults) {
        for (const cj of autoJobsCompletedResults) {
          if (cj.marketKey !== ms.key || seenIds.has(cj.jobId)) continue;
          allJobs.push({
            id: cj.jobId,
            name: cj.name,
            type: cj.type || cj.name,
            serverName: cj.serverName || "None",
            status: cj.status,
            reward: cj.reward,
            error: cj.error,
            lockExpiresAt: cj.lockExpiresAt || null,
            maintenanceEndsAt: cj.maintenanceEndsAt || null
          });
          seenIds.add(cj.jobId);
        }
      }
      if (allJobs.length === 0) continue;
      hasAny = true;
      allJobs.sort((a, b) => {
        const sp = getServerPriority(a.serverName) - getServerPriority(b.serverName);
        if (sp !== 0) return sp;
        return getJobTypePriority(a.type || a.name) - getJobTypePriority(b.type || b.name);
      });
      const group = document.createElement("div");
      group.className = "debug-market-group";
      const title = document.createElement("div");
      title.className = "debug-market-group-title";
      title.replaceChildren(...ms.label(), " (" + allJobs.length + ")");
      group.appendChild(title);
      for (const job of allJobs) {
        group.appendChild(createDebugJobRow(job));
      }
      frag.appendChild(group);
    }
    if (!hasAny) {
      const empty = document.createElement("div");
      empty.style.color = "var(--text-dim)";
      empty.textContent = "No job data yet.";
      frag.appendChild(empty);
    }
    debugJobsBody.replaceChildren(frag);
  }
  function createDebugJobRow(job) {
    const row = document.createElement("div");
    row.className = "debug-job-row";
    const statusEl = document.createElement("span");
    let st = job.status || "open";
    if (st === "open" && isJobBugged(job)) st = "bugged";
    statusEl.className = "debug-job-status " + st;
    statusEl.textContent = st.toUpperCase();
    if (job.lockExpiresAt || job.maintenanceEndsAt) {
      const expiryDate = job.lockExpiresAt || job.maintenanceEndsAt;
      const label = job.lockExpiresAt ? "Minigame lock" : "Maintenance";
      const diff = new Date(expiryDate).getTime() - Date.now();
      const mins = diff > 0 ? Math.ceil(diff / 6e4) : 0;
      statusEl.title = mins > 0 ? `${label} (~${mins}m remaining)` : `${label} (expired)`;
      statusEl.style.cursor = "help";
    } else if (job.error) {
      statusEl.title = job.error;
      statusEl.style.cursor = "help";
    }
    row.appendChild(statusEl);
    const info = document.createElement("span");
    info.style.cssText = "font-size:10px;color:var(--text-secondary);flex:1;";
    info.textContent = `${job.name} \u2014 ${job.serverName}`;
    row.appendChild(info);
    if (job.status === "failed" || job.status === "skipped") {
      const penaltyVal = job.reputationPenalty || job.reward && job.reward.deposit || job.deposit || 0;
      if (penaltyVal > 0) {
        const penEl = document.createElement("span");
        penEl.style.cssText = "font-size:9px;color:var(--accent-red, #f38ba8);white-space:nowrap;";
        penEl.textContent = `-${penaltyVal}`;
        row.appendChild(penEl);
      }
    } else if (job.reward) {
      const rewardEl = document.createElement("span");
      rewardEl.style.cssText = "font-size:9px;color:var(--accent-green);white-space:nowrap;";
      const dep = job.reward.deposit ? ` (-${job.reward.deposit})` : "";
      rewardEl.textContent = `\u{1F4B0}${job.reward.credits}${dep} \u2B50${job.reward.reputation || 0} \u{1F3C5}${job.reward.renown || 0}`;
      row.appendChild(rewardEl);
    }
    return row;
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.autoJobsTracker) {
      autoJobsTracker = changes.autoJobsTracker.newValue || [];
      renderDebugJobs();
    }
    if (changes.autoJobsDebugLogs) {
      const newLogs = changes.autoJobsDebugLogs.newValue;
      if (Array.isArray(newLogs)) {
        autoJobsDebugLogs = newLogs;
        renderDebugLogs();
      }
    }
    if (changes.autoJobsRunning) {
      const running = changes.autoJobsRunning.newValue;
      autoJobsRunning = !!running;
      if (autoJobsRunning) {
        autoJobsStartBtn.textContent = "\u25A0 Stop Auto Jobs";
        autoJobsStartBtn.className = "auto-jobs-btn-start stop";
      } else {
        autoJobsStartBtn.textContent = "\u25B6 Start Auto Jobs";
        autoJobsStartBtn.className = "auto-jobs-btn-start start";
      }
    }
    if (changes.marketData || changes.darkMarketData || changes.soyuzMarketData || changes.usolMarketData) {
      const now = Date.now();
      const checkReset = (change, marketKey) => {
        if (!change) return false;
        const oldReset = change.oldValue && change.oldValue.nextJobsResetAt;
        const newReset = change.newValue && change.newValue.nextJobsResetAt;
        if (!newReset) return false;
        if (oldReset) {
          const oldMs = new Date(oldReset).getTime();
          const newMs = new Date(newReset).getTime();
          if (newMs - oldMs > 6e4) return true;
          const cycleDuration = MARKET_RESET_DURATIONS_MS[marketKey] || 0;
          if (oldMs < now && cycleDuration > 0 && now - oldMs < cycleDuration) return true;
        }
        return false;
      };
      const homeReset = checkReset(changes.marketData, "home");
      const darkReset = checkReset(changes.darkMarketData, "dark");
      const soyuzReset = checkReset(changes.soyuzMarketData, "soyuz");
      const usolReset = checkReset(changes.usolMarketData, "usol");
      if (homeReset || darkReset || soyuzReset || usolReset) {
        const resetMarkets = [homeReset && "HOME", darkReset && "D4RK", soyuzReset && "SOYUZ", usolReset && "USOL"].filter(Boolean).join(", ");
        addAutoJobLog("Job reset detected (" + resetMarkets + ") \u2014 clearing old tracker/results", "info");
        autoJobsTracker = autoJobsTracker.filter((j) => {
          if (homeReset && (j.marketKey || "home") === "home") return false;
          if (darkReset && j.marketKey === "dark") return false;
          if (soyuzReset && j.marketKey === "soyuz") return false;
          if (usolReset && j.marketKey === "usol") return false;
          return true;
        });
        chrome.storage.local.get("autoJobsCompletedResults", (result) => {
          let cr = Array.isArray(result.autoJobsCompletedResults) ? result.autoJobsCompletedResults : [];
          if (homeReset) cr = cr.filter((j) => j.marketKey !== "home");
          if (darkReset) cr = cr.filter((j) => j.marketKey !== "dark");
          if (soyuzReset) cr = cr.filter((j) => j.marketKey !== "soyuz");
          if (usolReset) cr = cr.filter((j) => j.marketKey !== "usol");
          chrome.storage.local.set({ autoJobsCompletedResults: cr, autoJobsTracker });
          if (autoJobSolverToggle.checked) renderAutoJobsTabs();
          if (autoJobsDebugToggle.checked) renderDebugJobs();
        });
      } else {
        if (autoJobSolverToggle.checked) renderAutoJobsTabs();
        if (autoJobsDebugToggle.checked) renderDebugJobs();
      }
    }
    if (changes.autoJobsCompletedResults) {
      if (autoJobsDebugToggle.checked) {
        renderDebugJobs();
      }
    }
    if (changes.darkMarketAvailable || changes.soyuzMarketAvailable || changes.usolMarketAvailable || changes.serverMaintenanceMap) {
      if (autoJobSolverToggle.checked) renderAutoJobsTabs();
    }
  });
  chrome.storage.local.get(["autoJobsDebugLogs", "autoJobsTracker", "autoJobsRunning"], (data) => {
    if (data.autoJobsDebugLogs) {
      autoJobsDebugLogs = data.autoJobsDebugLogs;
      renderDebugLogs();
    }
    if (data.autoJobsTracker) {
      autoJobsTracker = data.autoJobsTracker;
      renderDebugJobs();
    }
    if (data.autoJobsRunning) {
      autoJobsRunning = true;
      autoJobsStartBtn.textContent = "\u25A0 Stop Auto Jobs";
      autoJobsStartBtn.className = "auto-jobs-btn-start stop";
    }
  });

  // src/popup/failed-jobs-ui.js
  var button = document.getElementById("dismissAllFailedJobsBtn");
  var refresh = document.getElementById("refreshAutoJobsBtn");
  var line = document.getElementById("failedJobsCleanupStatus");
  function render(value) {
    button.disabled = !!value?.busy;
    refresh.disabled = !!value?.busy;
    button.textContent = value?.busy ? "\u23F3 All Failed" : "\u{1F9F9} All Failed";
    line.textContent = value?.message || "";
    line.style.display = value?.message ? "" : "none";
  }
  chrome.storage.local.get("failedJobsCleanupStatus", (data) => render(data.failedJobsCleanupStatus));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.failedJobsCleanupStatus) render(changes.failedJobsCleanupStatus.newValue);
  });
  button.addEventListener("click", async () => {
    render({ busy: true, message: "Requesting market refresh and failed-job cleanup\u2026" });
    try {
      const tab = await getCor3Tab();
      if (!tab) throw new Error("Open cor3.gg first");
      const response = await chrome.tabs.sendMessage(tab.id, { action: "dismissAllFailedJobs" });
      if (!response?.success) throw new Error("Game tab unavailable; refresh it and try again");
    } catch (error) {
      render({ message: error.message });
    }
  });

  // src/shared/loadout-optimizer.js
  function normalizeLoadoutMode(mode) {
    return mode === "software" ? "software" : "auto";
  }

  // src/popup/auto-job-loadout-ui.js
  var select = document.getElementById("autoJobLoadoutMode");
  var hint = document.getElementById("autoJobLoadoutModeHint");
  function render2(value) {
    select.value = normalizeLoadoutMode(value);
    hint.textContent = select.value === "software" ? "Compare owned tools by actual Power on your current hardware. Hardware stays unchanged. Changes apply from the next job." : "Compare owned software + hardware by actual HACK/DECRYPT Power. Equal Power favors fewer swaps. Changes apply from the next job.";
  }
  chrome.storage.sync.get("autoJobLoadoutMode", (data) => render2(data.autoJobLoadoutMode));
  select.addEventListener("change", () => {
    chrome.storage.sync.set({ autoJobLoadoutMode: normalizeLoadoutMode(select.value) });
    render2(select.value);
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes.autoJobLoadoutMode) render2(changes.autoJobLoadoutMode.newValue);
  });

  // src/popup/auto-valuable-seller-ui.js
  var valuableToggle = document.getElementById("autoValuableSellerToggle");
  var valuableStatus = document.getElementById("autoValuableSellerStatus");
  var valuableSection = document.getElementById("autoValuableSellerSection");
  var valuableTabServers = document.getElementById("valuableTabServers");
  var valuableTabDownloads = document.getElementById("valuableTabDownloads");
  var valuableTabMaintenance = document.getElementById("valuableTabMaintenance");
  var valuableContentServers = document.getElementById("valuableContentServers");
  var valuableContentDownloads = document.getElementById("valuableContentDownloads");
  var valuableContentMaintenance = document.getElementById("valuableContentMaintenance");
  var valuableSellerBtn = document.getElementById("valuableSellerBtn");
  var valuableSearchBtn = document.getElementById("valuableSearchBtn");
  var valuableDebugToggle = document.getElementById("valuableDebugToggle");
  var valuableDebugConsole = document.getElementById("valuableDebugConsole");
  var valuableDebugLogsBody = document.getElementById("valuableDebugLogsBody");
  var valuableSearchRunning = false;
  var valuableSellerRunning = false;
  var valuableDebugLogs = [];
  var VALUABLE_MAX_LOGS = 200;
  function updateValuableStatus(enabled) {
    valuableStatus.textContent = enabled ? "Active" : "Off";
    valuableStatus.style.color = enabled ? "var(--accent-green)" : "var(--text-dim)";
    valuableSection.style.display = enabled ? "" : "none";
    var card = valuableSection.closest(".popout-card");
    if (card) card.style.display = enabled ? "" : "none";
  }
  chrome.storage.sync.get("autoValuableSellerEnabled", (data) => {
    const enabled = !!data.autoValuableSellerEnabled;
    valuableToggle.checked = enabled;
    updateValuableStatus(enabled);
    if (enabled) renderValuableTabs();
  });
  valuableToggle.addEventListener("change", async () => {
    const enabled = valuableToggle.checked;
    await chrome.storage.sync.set({ autoValuableSellerEnabled: enabled });
    updateValuableStatus(enabled);
    if (enabled) renderValuableTabs();
  });
  function switchValuableTab(tab) {
    valuableTabServers.classList.toggle("active", tab === "servers");
    valuableTabDownloads.classList.toggle("active", tab === "downloads");
    valuableTabMaintenance.classList.toggle("active", tab === "maintenance");
    valuableContentServers.classList.toggle("active", tab === "servers");
    valuableContentDownloads.classList.toggle("active", tab === "downloads");
    valuableContentMaintenance.classList.toggle("active", tab === "maintenance");
  }
  valuableTabServers.addEventListener("click", () => switchValuableTab("servers"));
  valuableTabDownloads.addEventListener("click", () => switchValuableTab("downloads"));
  valuableTabMaintenance.addEventListener("click", () => switchValuableTab("maintenance"));
  async function renderValuableTabs() {
    const data = await chrome.storage.local.get(["valuableServersData", "valuableDownloadsData", "valuableMaintenanceData"]);
    renderValuableServers(data.valuableServersData);
    renderValuableDownloads(data.valuableDownloadsData);
    renderValuableMaintenance(data.valuableMaintenanceData);
  }
  function renderValuableServers(data) {
    _clearEl(valuableContentServers);
    if (!data || !data.servers || data.servers.length === 0) {
      valuableContentServers.replaceChildren(_h("div", { className: "auto-jobs-no-jobs" }, 'No valuable data yet. Click "Start Valuable Search" to scan servers.'));
      return;
    }
    const selectAllDiv = document.createElement("div");
    selectAllDiv.className = "auto-valuable-seller-select-all";
    const selectAllCb = document.createElement("input");
    selectAllCb.type = "checkbox";
    selectAllCb.id = "valuableSelectAllServers";
    const selectAllLabel = document.createElement("label");
    selectAllLabel.className = "job-type-label";
    selectAllLabel.setAttribute("for", selectAllCb.id);
    selectAllLabel.textContent = "Select All";
    const selectAllCount = document.createElement("span");
    selectAllCount.className = "job-type-count";
    selectAllCount.textContent = `(${data.servers.length} servers)`;
    selectAllDiv.appendChild(selectAllLabel);
    selectAllDiv.appendChild(selectAllCount);
    selectAllDiv.appendChild(selectAllCb);
    const checkboxes = [];
    for (const server of data.servers) {
      const row = document.createElement("div");
      row.className = "valuable-server-row";
      const header = document.createElement("div");
      header.className = "valuable-server-header";
      const arrow = document.createElement("span");
      arrow.className = "expand-arrow";
      arrow.textContent = "\u25B6";
      const nameSpan = document.createElement("span");
      nameSpan.className = "server-name";
      nameSpan.textContent = server.name;
      const countSpan = document.createElement("span");
      countSpan.className = "valuable-count";
      const totalValuables = (server.files || []).length + (server.logs || []).length;
      countSpan.textContent = `(${totalValuables})`;
      const statusSpan = document.createElement("span");
      const statusClass = (server.status || "open").toLowerCase().replace(/\s+/g, "-");
      statusSpan.className = "valuable-status " + statusClass;
      statusSpan.textContent = (server.status || "OPEN").toUpperCase();
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.dataset.serverId = server.id;
      cb.checked = !!server.selected;
      cb.addEventListener("change", () => {
        updateValuableServerSelection();
        updateSelectAllState(selectAllCb, checkboxes);
      });
      checkboxes.push(cb);
      header.appendChild(arrow);
      header.appendChild(nameSpan);
      header.appendChild(countSpan);
      header.appendChild(statusSpan);
      header.appendChild(cb);
      const detailDiv = document.createElement("div");
      detailDiv.className = "valuable-detail-table";
      if (totalValuables > 0) {
        let tableHtml = "<table><tr><th>Type</th><th>Name</th><th>Tags</th><th>Base Price</th><th>Detect Rate</th></tr>";
        for (const f of server.files || []) {
          const tags = (f.tags || []).map((t) => t.label || t.key || t).join(", ");
          tableHtml += `<tr><td>\u{1F4C4} File</td><td>${f.name || "\u2014"}</td><td>${tags || "\u2014"}</td><td>${f.basePrice || 0}</td><td>${f.detectRate || 0}</td></tr>`;
        }
        for (const l of server.logs || []) {
          const tags = (l.tags || []).map((t) => t.label || t.key || t).join(", ");
          tableHtml += `<tr><td>\u{1F4CB} Log</td><td>${l.message || "\u2014"}</td><td>${tags || "\u2014"}</td><td>${l.basePrice || 0}</td><td>${l.detectRate || 0}</td></tr>`;
        }
        tableHtml += "</table>";
        _safeSetHtml(detailDiv, tableHtml);
      }
      header.addEventListener("click", (e) => {
        if (e.target.tagName === "INPUT") return;
        arrow.classList.toggle("open");
        detailDiv.classList.toggle("open");
      });
      row.appendChild(header);
      row.appendChild(detailDiv);
      valuableContentServers.appendChild(row);
    }
    valuableContentServers.appendChild(selectAllDiv);
    selectAllCb.addEventListener("change", () => {
      for (const cb of checkboxes) cb.checked = selectAllCb.checked;
      updateValuableServerSelection();
    });
    updateSelectAllState(selectAllCb, checkboxes);
  }
  var VALUABLE_SERVER_PATH_LENGTHS = {
    "RM7-E1L3": 1,
    "RM7-E1L5": 1,
    "RM7-E1L2CT": 2,
    "RM7-E1SCP": 2,
    "RM7-N2ECP": 2,
    "RM7-S4L4": 3,
    "D4RK RM7CE": 3,
    "RM7-N2L2": 3,
    "RM7-S4L2": 3,
    "B43271N": 3,
    "RM7-N2L3": 4,
    "RM7-S4L3": 4,
    "RM7-S4L1": 4,
    "RM7-S4WCP": 4,
    "B43272N": 4,
    "RM7-W3NCP": 5,
    "URM7-S5L2": 5,
    "URM7-H": 5,
    "D4RK RM7EG": 5,
    "RM7-N1L1": 6,
    "URM7-M": 6,
    "B43274N": 6
  };
  function renderValuableDownloads(data) {
    _clearEl(valuableContentDownloads);
    if (!data || !data.files || data.files.length === 0) {
      valuableContentDownloads.replaceChildren(_h("div", { className: "auto-jobs-no-jobs" }, 'No download data yet. Click "Start Valuable Search" to scan.'));
      return;
    }
    const selectAllDiv = document.createElement("div");
    selectAllDiv.className = "auto-valuable-seller-select-all";
    const selectAllCb = document.createElement("input");
    selectAllCb.type = "checkbox";
    selectAllCb.id = "valuableSelectAllDownloads";
    const selectAllLabel = document.createElement("label");
    selectAllLabel.className = "job-type-label";
    selectAllLabel.setAttribute("for", selectAllCb.id);
    selectAllLabel.textContent = "Select All";
    const selectAllCount = document.createElement("span");
    selectAllCount.className = "job-type-count";
    selectAllCount.textContent = `(${data.files.length} files)`;
    selectAllDiv.appendChild(selectAllLabel);
    selectAllDiv.appendChild(selectAllCount);
    selectAllDiv.appendChild(selectAllCb);
    const checkboxes = [];
    const serverGroups = {};
    for (const file of data.files) {
      const source = file.source || "\u2014";
      if (!serverGroups[source]) serverGroups[source] = [];
      serverGroups[source].push(file);
    }
    const sortedSources = Object.keys(serverGroups).sort((a, b) => {
      const lenA = VALUABLE_SERVER_PATH_LENGTHS[a] || 99;
      const lenB = VALUABLE_SERVER_PATH_LENGTHS[b] || 99;
      return lenB - lenA;
    });
    for (const source of sortedSources) {
      const groupFiles = serverGroups[source];
      const groupDiv = document.createElement("div");
      groupDiv.className = "valuable-dl-server-group";
      const headerDiv = document.createElement("div");
      headerDiv.className = "valuable-dl-server-header";
      const nameSpan = document.createElement("span");
      nameSpan.className = "dl-server-name";
      nameSpan.textContent = source;
      const countSpan = document.createElement("span");
      countSpan.className = "dl-server-count";
      countSpan.textContent = `(${groupFiles.length})`;
      headerDiv.appendChild(nameSpan);
      headerDiv.appendChild(countSpan);
      groupDiv.appendChild(headerDiv);
      for (const file of groupFiles) {
        const row = document.createElement("div");
        row.className = "valuable-file-row";
        const nameEl = document.createElement("span");
        nameEl.className = "file-source";
        nameEl.textContent = file.name || file.id;
        const tagSpan = document.createElement("span");
        tagSpan.className = "file-tag";
        const tags = (file.tags || []).map((t) => t.label || t.key || t).join(", ");
        tagSpan.textContent = tags || "\u2014";
        const statusSpan = document.createElement("span");
        const statusClass = (file.status || "open").toLowerCase().replace(/\s+/g, "-");
        statusSpan.className = "valuable-status " + statusClass;
        statusSpan.textContent = (file.status || "OPEN").toUpperCase();
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.dataset.fileId = file.id;
        cb.checked = !!file.selected;
        cb.addEventListener("change", () => {
          updateValuableDownloadSelection();
          updateSelectAllState(selectAllCb, checkboxes);
        });
        checkboxes.push(cb);
        row.appendChild(nameEl);
        row.appendChild(tagSpan);
        row.appendChild(statusSpan);
        row.appendChild(cb);
        groupDiv.appendChild(row);
      }
      valuableContentDownloads.appendChild(groupDiv);
    }
    valuableContentDownloads.appendChild(selectAllDiv);
    selectAllCb.addEventListener("change", () => {
      for (const cb of checkboxes) cb.checked = selectAllCb.checked;
      updateValuableDownloadSelection();
    });
    updateSelectAllState(selectAllCb, checkboxes);
  }
  var _maintTimerInterval = null;
  function renderValuableMaintenance(data) {
    _clearEl(valuableContentMaintenance);
    if (_maintTimerInterval) {
      clearInterval(_maintTimerInterval);
      _maintTimerInterval = null;
    }
    if (!data || !data.servers || data.servers.length === 0) {
      valuableContentMaintenance.replaceChildren(_h("div", { className: "auto-jobs-no-jobs" }, 'Run "Start Valuable Search" to see the maintenance status of servers. If no servers are shown after the search, there is no upcoming or active maintenance.'));
      return;
    }
    const timerEls = [];
    let hasUpcoming = false;
    for (const srv of data.servers) {
      const row = document.createElement("div");
      row.className = "maint-row";
      const isUpcoming = srv.timeUntilMaintenance && !srv.maintenanceEndsAt;
      const nameEl = document.createElement("span");
      nameEl.className = "maint-name";
      nameEl.textContent = srv.serverName;
      const timerEl = document.createElement("span");
      timerEl.className = "maint-timer";
      timerEl.dataset.target = srv.maintenanceEndsAt || srv.timeUntilMaintenance || "";
      timerEls.push(timerEl);
      const statusEl = document.createElement("span");
      statusEl.className = "maint-status";
      statusEl.dataset.serverId = srv.id;
      if (srv.maintenanceEndsAt) {
        statusEl.classList.add("in-maintenance");
        statusEl.textContent = "IN MAINTENANCE";
      } else {
        statusEl.classList.add("upcoming");
        statusEl.textContent = "UPCOMING";
      }
      row.appendChild(nameEl);
      row.appendChild(timerEl);
      row.appendChild(statusEl);
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = "maint-checkbox";
      cb.dataset.serverId = srv.id;
      cb.dataset.serverName = srv.serverName;
      if (isUpcoming) {
        hasUpcoming = true;
        cb.disabled = false;
      } else {
        cb.disabled = true;
      }
      row.appendChild(cb);
      valuableContentMaintenance.appendChild(row);
    }
    if (hasUpcoming) {
      const bottomRow = document.createElement("div");
      bottomRow.className = "maint-force-selected-row";
      const batchBtn = document.createElement("button");
      batchBtn.className = "maint-force-selected-btn";
      batchBtn.id = "maintForceSelectedBtn";
      batchBtn.textContent = "Force selected!";
      batchBtn.title = "Force maintenance on all checked servers (furthest first)";
      batchBtn.addEventListener("click", () => handleForceMaintenanceBatch());
      bottomRow.appendChild(batchBtn);
      valuableContentMaintenance.appendChild(bottomRow);
    }
    function updateTimers() {
      for (const el of timerEls) {
        const target = el.dataset.target;
        if (!target) {
          el.textContent = "\u2014";
          continue;
        }
        const diff = new Date(target).getTime() - Date.now();
        if (diff <= 0) {
          el.textContent = "now";
          continue;
        }
        const h = Math.floor(diff / 36e5);
        const m = Math.floor(diff % 36e5 / 6e4);
        const s = Math.floor(diff % 6e4 / 1e3);
        el.textContent = (h > 0 ? h + "h " : "") + m + "m " + s + "s";
      }
    }
    updateTimers();
    _maintTimerInterval = setInterval(updateTimers, 1e3);
    chrome.storage.local.get("forceMaintenanceInProgress", (fmState) => {
      const fm = fmState.forceMaintenanceInProgress;
      const allCbs = valuableContentMaintenance.querySelectorAll(".maint-checkbox");
      const batchBtn = document.getElementById("maintForceSelectedBtn");
      if (fm && fm.batch) {
        allCbs.forEach((cb) => {
          cb.disabled = true;
        });
        if (batchBtn) {
          batchBtn.disabled = true;
          batchBtn.classList.add("in-progress");
          batchBtn.textContent = "In-progress...";
        }
        const batchIds = fm.serverIds || [];
        const currentId = fm.currentServerId || null;
        batchIds.forEach((sid) => {
          const statusEl = valuableContentMaintenance.querySelector(`.maint-status[data-server-id="${sid}"]`);
          if (statusEl && !statusEl.classList.contains("in-maintenance")) {
            statusEl.classList.remove("upcoming");
            statusEl.classList.add("in-progress");
            statusEl.style.background = sid === currentId ? "var(--accent-orange)" : "var(--accent-light-cyan)";
            statusEl.style.color = "var(--bg-primary)";
            statusEl.style.textAlign = "center";
            statusEl.style.justifySelf = "end";
            statusEl.style.width = "80px";
            statusEl.textContent = sid === currentId ? "FORCING..." : "QUEUED";
          }
        });
      }
    });
  }
  async function handleForceMaintenanceBatch() {
    const fmCheck = await chrome.storage.local.get("forceMaintenanceInProgress");
    if (fmCheck.forceMaintenanceInProgress && fmCheck.forceMaintenanceInProgress.batch) {
      addValuableLog("\u{1F527} Force maintenance already running", "warn");
      return;
    }
    const checkedCbs = valuableContentMaintenance.querySelectorAll(".maint-checkbox:checked");
    if (checkedCbs.length === 0) {
      addValuableLog("\u{1F527} No servers selected for batch force maintenance", "warn");
      return;
    }
    const selected = [];
    checkedCbs.forEach((cb) => {
      selected.push({ id: cb.dataset.serverId, name: cb.dataset.serverName });
    });
    const serverIds = selected.map((s) => s.id);
    const allCbs = valuableContentMaintenance.querySelectorAll(".maint-checkbox");
    const batchBtn = document.getElementById("maintForceSelectedBtn");
    allCbs.forEach((cb) => {
      cb.disabled = true;
    });
    if (batchBtn) {
      batchBtn.disabled = true;
      batchBtn.classList.add("in-progress");
      batchBtn.textContent = "In-progress...";
    }
    serverIds.forEach((sid) => {
      const statusEl = valuableContentMaintenance.querySelector(`.maint-status[data-server-id="${sid}"]`);
      if (statusEl && !statusEl.classList.contains("in-maintenance")) {
        statusEl.classList.remove("upcoming");
        statusEl.classList.add("in-progress");
        statusEl.style.background = "var(--accent-light-cyan)";
        statusEl.style.color = "var(--bg-primary)";
        statusEl.style.textAlign = "center";
        statusEl.style.justifySelf = "end";
        statusEl.style.width = "80px";
        statusEl.textContent = "QUEUED";
      }
    });
    await chrome.storage.local.set({ forceMaintenanceInProgress: { batch: true, serverIds, servers: selected, startedAt: Date.now() } });
    addValuableLog(`\u{1F527} Batch force maintenance: ${selected.length} server(s) selected \u2014 starting...`, "info");
    try {
      const tab = await getCor3Tab();
      if (tab) {
        await chrome.tabs.sendMessage(tab.id, {
          action: "forceMaintenanceBatch",
          servers: selected
        });
      }
    } catch (e) {
      addValuableLog(`\u{1F527} Batch force maintenance failed: ${e.message}`, "error");
      allCbs.forEach((cb) => {
        cb.disabled = false;
      });
      if (batchBtn) {
        batchBtn.disabled = false;
        batchBtn.classList.remove("in-progress");
        batchBtn.textContent = "Force selected!";
      }
      await chrome.storage.local.remove("forceMaintenanceInProgress");
    }
  }
  async function updateValuableServerSelection() {
    const cbs = valuableContentServers.querySelectorAll('input[type="checkbox"][data-server-id]');
    const selected = [];
    cbs.forEach((cb) => {
      if (cb.checked) selected.push(cb.dataset.serverId);
    });
    await chrome.storage.local.set({ valuableSelectedServers: selected });
  }
  async function updateValuableDownloadSelection() {
    const cbs = valuableContentDownloads.querySelectorAll('input[type="checkbox"][data-file-id]');
    const selected = [];
    cbs.forEach((cb) => {
      if (cb.checked) selected.push(cb.dataset.fileId);
    });
    await chrome.storage.local.set({ valuableSelectedDownloads: selected });
  }
  function updateValuableButtons() {
    if (valuableSearchRunning) {
      valuableSearchBtn.textContent = "\u25A0 Stop Valuable Search";
      valuableSearchBtn.className = "valuable-btn stop";
      valuableSellerBtn.disabled = true;
    } else if (valuableSellerRunning) {
      valuableSellerBtn.textContent = "\u25A0 Stop Valuable Seller";
      valuableSellerBtn.className = "valuable-btn stop";
      valuableSearchBtn.disabled = true;
    } else {
      valuableSearchBtn.textContent = "\u25B6 Start Valuable Search";
      valuableSearchBtn.className = "valuable-btn start";
      valuableSearchBtn.disabled = false;
      valuableSellerBtn.textContent = "\u25B6 Start Valuable Seller";
      valuableSellerBtn.className = "valuable-btn start";
      valuableSellerBtn.disabled = false;
    }
  }
  valuableSearchBtn.addEventListener("click", async () => {
    if (valuableSearchRunning) {
      valuableSearchRunning = false;
      updateValuableButtons();
      addValuableLog("Valuable Search stopped by user.", "warn");
      try {
        const tab = await getCor3Tab();
        if (tab) await chrome.tabs.sendMessage(tab.id, { action: "stopValuable" });
      } catch (e) {
      }
      await chrome.storage.local.set({ valuableSearchRunning: false, valuableSellerRunning: false });
    } else {
      valuableSearchRunning = true;
      updateValuableButtons();
      addValuableLog("Starting Valuable Search...", "info");
      await chrome.storage.local.set({ valuableSearchRunning: true, valuableSellerRunning: false });
      try {
        const tab = await getCor3Tab();
        if (tab) {
          await chrome.tabs.sendMessage(tab.id, {
            action: "startValuableSearch"
          });
        }
      } catch (e) {
        addValuableLog("Failed to start Valuable Search: " + e.message, "error");
      }
    }
  });
  valuableSellerBtn.addEventListener("click", async () => {
    if (valuableSellerRunning) {
      valuableSellerRunning = false;
      updateValuableButtons();
      addValuableLog("Valuable Seller stopped by user.", "warn");
      try {
        const tab = await getCor3Tab();
        if (tab) await chrome.tabs.sendMessage(tab.id, { action: "stopValuable" });
      } catch (e) {
      }
      await chrome.storage.local.set({ valuableSellerRunning: false, valuableSearchRunning: false });
    } else {
      const { valuableSelectedServers, valuableSelectedDownloads } = await chrome.storage.local.get(["valuableSelectedServers", "valuableSelectedDownloads"]);
      const selectedServers = valuableSelectedServers || [];
      const selectedDownloads = valuableSelectedDownloads || [];
      if (selectedServers.length === 0 && selectedDownloads.length === 0) {
        addValuableLog("No servers or downloads selected for selling.", "warn");
        return;
      }
      valuableSellerRunning = true;
      updateValuableButtons();
      addValuableLog(`Starting Valuable Seller: ${selectedServers.length} server(s), ${selectedDownloads.length} download(s) selected.`, "info");
      await chrome.storage.local.set({ valuableSellerRunning: true, valuableSearchRunning: false });
      try {
        const tab = await getCor3Tab();
        if (tab) {
          await chrome.tabs.sendMessage(tab.id, {
            action: "startValuableSeller",
            selectedServers,
            selectedDownloads
          });
        }
      } catch (e) {
        addValuableLog("Failed to start Valuable Seller: " + e.message, "error");
      }
    }
  });
  chrome.storage.sync.get("valuableDebugConsoleEnabled", (data) => {
    const enabled = !!data.valuableDebugConsoleEnabled;
    valuableDebugToggle.checked = enabled;
    valuableDebugConsole.style.display = enabled ? "" : "none";
    if (enabled) renderValuableDebugLogs();
  });
  valuableDebugToggle.addEventListener("change", () => {
    const enabled = valuableDebugToggle.checked;
    chrome.storage.sync.set({ valuableDebugConsoleEnabled: enabled });
    valuableDebugConsole.style.display = enabled ? "" : "none";
    if (enabled) renderValuableDebugLogs();
  });
  function addValuableLog(msg, level = "info") {
    valuableDebugLogs.push({ timestamp: (/* @__PURE__ */ new Date()).toISOString(), msg, level });
    if (valuableDebugLogs.length > VALUABLE_MAX_LOGS) valuableDebugLogs.shift();
    renderValuableDebugLogs();
    chrome.storage.local.set({ valuableDebugLogs });
  }
  function renderValuableDebugLogs() {
    if (valuableDebugLogs.length === 0) {
      valuableDebugLogsBody.replaceChildren(_h("div", { style: "color:var(--text-dim);" }, "No logs yet."));
      return;
    }
    const frag = document.createDocumentFragment();
    for (const log of valuableDebugLogs) {
      const row = document.createElement("div");
      let levelClass = "";
      if (log.level === "error") levelClass = " log-error";
      else if (log.level === "success") levelClass = " log-success";
      else if (log.level === "warn") levelClass = " log-warn";
      row.className = "debug-log-row" + levelClass;
      const displayTime = log.timestamp ? log.timestamp.slice(11, 19) : log.time || "";
      row.appendChild(_h("span", { className: "log-time" }, "[" + displayTime + "]"));
      row.appendChild(document.createTextNode(" " + log.msg));
      frag.appendChild(row);
    }
    valuableDebugLogsBody.replaceChildren(frag);
    valuableDebugLogsBody.scrollTop = valuableDebugLogsBody.scrollHeight;
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.valuableServersData) {
      renderValuableServers(changes.valuableServersData.newValue);
    }
    if (changes.valuableDownloadsData) {
      renderValuableDownloads(changes.valuableDownloadsData.newValue);
    }
    if (changes.valuableMaintenanceData) {
      renderValuableMaintenance(changes.valuableMaintenanceData.newValue);
    }
    if (changes.forceMaintenanceInProgress && changes.forceMaintenanceInProgress.newValue) {
      const fm = changes.forceMaintenanceInProgress.newValue;
      if (fm.batch && fm.currentServerId) {
        const batchIds = fm.serverIds || [];
        batchIds.forEach((sid) => {
          const statusEl = valuableContentMaintenance.querySelector(`.maint-status[data-server-id="${sid}"]`);
          if (statusEl && !statusEl.classList.contains("in-maintenance")) {
            statusEl.style.background = sid === fm.currentServerId ? "var(--accent-orange)" : "var(--accent-light-cyan)";
            statusEl.style.color = "var(--bg-primary)";
            statusEl.style.textAlign = "center";
            statusEl.style.justifySelf = "end";
            statusEl.style.width = "80px";
            statusEl.textContent = sid === fm.currentServerId ? "FORCING..." : "QUEUED";
          }
        });
      }
    }
    if (changes.valuableForceMaintenanceServerDone && changes.valuableForceMaintenanceServerDone.newValue) {
      const sd = changes.valuableForceMaintenanceServerDone.newValue;
      const statusEl = valuableContentMaintenance.querySelector(`.maint-status[data-server-id="${sd.serverId}"]`);
      if (statusEl) {
        statusEl.classList.remove("upcoming", "in-progress");
        statusEl.classList.add("in-maintenance");
        statusEl.style.background = "";
        statusEl.style.color = "";
        statusEl.style.textAlign = "";
        statusEl.style.justifySelf = "";
        statusEl.style.width = "";
        statusEl.textContent = "IN MAINTENANCE";
      }
    }
    if (changes.valuableForceMaintenanceDone) {
      chrome.storage.local.remove("forceMaintenanceInProgress");
      const allCbs = valuableContentMaintenance.querySelectorAll(".maint-checkbox");
      const batchBtn = document.getElementById("maintForceSelectedBtn");
      allCbs.forEach((cb) => {
        cb.disabled = false;
        cb.checked = false;
      });
      if (batchBtn) {
        batchBtn.disabled = false;
        batchBtn.classList.remove("in-progress");
        batchBtn.textContent = "Force selected!";
      }
    }
    if (changes.valuableSearchRunning) {
      valuableSearchRunning = !!changes.valuableSearchRunning.newValue;
      updateValuableButtons();
    }
    if (changes.valuableSellerRunning) {
      valuableSellerRunning = !!changes.valuableSellerRunning.newValue;
      updateValuableButtons();
    }
    if (changes.valuableDebugLogs) {
      valuableDebugLogs = changes.valuableDebugLogs.newValue || [];
      renderValuableDebugLogs();
    }
  });
  chrome.storage.local.get(["valuableDebugLogs", "valuableSearchRunning", "valuableSellerRunning", "forceMaintenanceInProgress"], (data) => {
    if (data.valuableDebugLogs) {
      valuableDebugLogs = data.valuableDebugLogs;
      renderValuableDebugLogs();
    }
    if (data.valuableSearchRunning) {
      valuableSearchRunning = true;
      updateValuableButtons();
    }
    if (data.valuableSellerRunning) {
      valuableSellerRunning = true;
      updateValuableButtons();
    }
    if (data.forceMaintenanceInProgress && data.forceMaintenanceInProgress.batch) {
      var fm = data.forceMaintenanceInProgress;
      var batchIds = fm.serverIds || [];
      setTimeout(() => {
        batchIds.forEach((sid) => {
          const statusEl = valuableContentMaintenance.querySelector(`.maint-status[data-server-id="${sid}"]`);
          if (statusEl && !statusEl.classList.contains("in-maintenance")) {
            statusEl.classList.remove("upcoming");
            statusEl.classList.add("in-progress");
            statusEl.style.background = sid === fm.currentServerId ? "var(--accent-orange)" : "var(--accent-light-cyan)";
            statusEl.style.color = "var(--bg-primary)";
            statusEl.style.textAlign = "center";
            statusEl.style.justifySelf = "end";
            statusEl.style.width = "80px";
            statusEl.textContent = sid === fm.currentServerId ? "FORCING..." : "QUEUED";
          }
        });
        const allCbs = valuableContentMaintenance.querySelectorAll(".maint-checkbox");
        const batchBtn = document.getElementById("maintForceSelectedBtn");
        allCbs.forEach((cb) => {
          cb.disabled = true;
        });
        if (batchBtn) {
          batchBtn.disabled = true;
          batchBtn.classList.add("in-progress");
          batchBtn.textContent = "Forcing...";
        }
      }, 100);
    }
  });

  // src/popup/helper-mode.js
  var automationKeys = [
    "autoRefresh",
    "autoJobSolverEnabled",
    "autoFinishAllJobsEnabled",
    "autoJobsDebugConsoleEnabled",
    "autoUpdateMarkets"
  ];
  var helperModeToggle = document.getElementById("helperModeToggle");
  async function applyHelperMode(helper, mode) {
    state.isHelper = !!helper;
    if (mode === "update") {
      if (state.isHelper) {
        const oldValues = await chrome.storage.sync.get(automationKeys);
        await chrome.storage.sync.set({ oldValues });
        await chrome.storage.sync.set(Object.fromEntries(automationKeys.map((key) => [
          key,
          key === "autoRefresh" ? { dark_jobs: false, home_jobs: false, soyuz_jobs: false, usol_jobs: false } : false
        ])));
      } else {
        const { oldValues = {} } = await chrome.storage.sync.get("oldValues");
        await chrome.storage.sync.set(Object.fromEntries(automationKeys.map((key) => [
          key,
          oldValues[key] ?? (key === "autoRefresh" ? {} : false)
        ])));
      }
      const toggles = await chrome.storage.sync.get(automationKeys);
      for (const [id, key] of [
        ["autoRefreshCore", "home_jobs"],
        ["autoRefreshDark", "dark_jobs"],
        ["autoRefreshSoyuz", "soyuz_jobs"],
        ["autoRefreshUsol", "usol_jobs"]
      ]) {
        document.getElementById(id).checked = !!toggles.autoRefresh?.[key];
      }
      for (const [id, key] of [
        ["autoJobSolverToggle", "autoJobSolverEnabled"],
        ["autoUpdateMarketsToggle", "autoUpdateMarkets"],
        ["autoFinishAllJobsToggle", "autoFinishAllJobsEnabled"],
        ["autoJobsDebugToggle", "autoJobsDebugConsoleEnabled"]
      ]) document.getElementById(id).checked = !!toggles[key];
      document.getElementById("autoJobSolverSection").style.display = toggles.autoJobSolverEnabled ? "" : "none";
      document.getElementById("autoJobsDebugConsole").style.display = toggles.autoJobsDebugConsoleEnabled ? "" : "none";
      document.getElementById("autoJobSolverStatus").textContent = toggles.autoJobSolverEnabled ? "Active" : "Off";
      document.getElementById("autoJobSolverStatus").style.color = toggles.autoJobSolverEnabled ? "var(--accent-green)" : "var(--text-dim)";
      if (toggles.autoJobsDebugConsoleEnabled) {
        renderDebugJobs();
        renderDebugLogs();
      }
      loadPinnedState();
      updateAutoUpdateMarketsStatus();
      chrome.runtime.sendMessage({ action: "scheduleAutoFinishAll" }).catch(() => {
      });
    }
    document.querySelectorAll(".pinned-auto-refresh").forEach((el) => {
      el.style.display = state.isHelper ? "none" : "flex";
    });
    for (const id of ["autoJobSolverToggle", "autoValuableSellerToggle", "autoUpdateMarketsToggle"]) {
      document.getElementById(id).closest(".auto-decrypt-row").style.display = state.isHelper ? "none" : "flex";
    }
  }
  if (helperModeToggle) {
    chrome.storage.sync.get("helperMode", (data) => {
      helperModeToggle.checked = !!data.helperMode;
      applyHelperMode(helperModeToggle.checked, "render");
    });
    helperModeToggle.addEventListener("change", () => {
      chrome.storage.sync.set({ helperMode: helperModeToggle.checked });
      applyHelperMode(helperModeToggle.checked, "update");
    });
  }

  // src/popup/version-info.js
  var checkUpdateBtn = document.getElementById("checkUpdateBtn");
  var updateResult = document.getElementById("updateResult");
  function compareVersions(v1, v2) {
    if (!v1 || !v2) return 0;
    const parse = (v) => {
      const stripped = String(v).replace(/^v/, "");
      const match = stripped.match(/^([\d.]+)(.*)$/);
      if (!match) return { parts: [0], suffix: stripped };
      return {
        parts: match[1].split(".").map((n) => parseInt(n) || 0),
        suffix: match[2] || ""
      };
    };
    const a = parse(v1);
    const b = parse(v2);
    const maxLength = Math.max(a.parts.length, b.parts.length);
    for (let i = 0; i < maxLength; i++) {
      const num1 = a.parts[i] || 0;
      const num2 = b.parts[i] || 0;
      if (num1 < num2) return -1;
      if (num1 > num2) return 1;
    }
    const hasSuffix1 = a.suffix.length > 0;
    const hasSuffix2 = b.suffix.length > 0;
    if (!hasSuffix1 && hasSuffix2) return -1;
    if (hasSuffix1 && !hasSuffix2) return 1;
    if (hasSuffix1 && hasSuffix2) return a.suffix.localeCompare(b.suffix);
    return 0;
  }
  checkUpdateBtn.addEventListener("click", async () => {
    updateResult.textContent = "Checking...";
    updateResult.style.color = "var(--text-dim)";
    try {
      const localManifest = chrome.runtime.getManifest();
      const localExtVersion = localManifest.version;
      const versionsResp = await fetch("https://raw.githubusercontent.com/Femtoce11/cor3-helper/main/versions.json", { cache: "no-store" });
      if (!versionsResp.ok) throw new Error("Failed to fetch remote versions");
      const remote = await versionsResp.json();
      let remoteExtVersion = null;
      try {
        const pkgResp = await fetch("https://raw.githubusercontent.com/Femtoce11/cor3-helper/main/package.json", { cache: "no-store" });
        if (pkgResp.ok) {
          const remotePkg = await pkgResp.json();
          remoteExtVersion = remotePkg.version || null;
        }
      } catch (e) {
      }
      const { webVersion, systemVersion } = await chrome.storage.local.get(["webVersion", "systemVersion"]);
      let messages = [];
      let extBehind = false;
      if (remoteExtVersion && compareVersions(localExtVersion, remoteExtVersion) < 0) {
        messages.push(`Extension: <b>v${localExtVersion}</b> \u2192 <b>v${remoteExtVersion}</b>`);
        extBehind = true;
      }
      if (messages.length > 0) {
        let html = `Updates detected:<br>${messages.join("<br>")}`;
        if (extBehind) {
          html += `<br><a href="https://github.com/Femtoce11/cor3-helper/releases" target="_blank" style="color:var(--accent-cyan);">Download from GitHub</a><br><span style="font-size:9px;color:var(--text-muted);">Download ZIP, extract, and reload on chrome://extensions</span>`;
        }
        _safeSetHtml(updateResult, html);
        updateResult.style.color = "var(--accent-orange)";
      } else {
        const localWeb = webVersion || null;
        const localSys = systemVersion || null;
        updateResult.textContent = `You're up to date!`;
        updateResult.style.color = "var(--accent-green)";
      }
    } catch (e) {
      console.log("[COR3 Helper] Check for updates error:", e);
      cor3LogError("popup.js", e, { action: "checkForUpdates" });
      updateResult.textContent = "Could not check for updates. Check your connection.";
      updateResult.style.color = "var(--accent-red)";
    }
  });
  async function displayVersionInfo(retryCount) {
    retryCount = retryCount || 0;
    const versionSection = document.getElementById("versionInfoSection");
    if (!versionSection) return;
    const extVersion = chrome.runtime.getManifest().version;
    const { webVersion, systemVersion, patchVersion } = await chrome.storage.local.get(["webVersion", "systemVersion", "patchVersion"]);
    let finalWebVersion = webVersion;
    let finalSystemVersion = systemVersion;
    let finalPatchVersion = patchVersion;
    if (!webVersion || !systemVersion || !patchVersion) {
      try {
        const tab = await getCor3Tab();
        if (tab) {
          const response = await chrome.tabs.sendMessage(tab.id, { action: "getVersionFallbacks" });
          if (response) {
            if (!finalWebVersion && response.webVersion) {
              finalWebVersion = response.webVersion;
              chrome.storage.local.set({ webVersion: response.webVersion });
            }
            if (!finalSystemVersion && response.systemVersion) {
              finalSystemVersion = response.systemVersion;
              chrome.storage.local.set({ systemVersion: response.systemVersion });
            }
            if (!finalPatchVersion && response.patchVersion) {
              finalPatchVersion = response.patchVersion;
              chrome.storage.local.set({ patchVersion: response.patchVersion });
            }
          }
        }
      } catch (e) {
        console.log("[COR3 Helper] Could not get version fallbacks:", e);
      }
    }
    let parts = [`Extension: v${extVersion}`];
    if (finalWebVersion) parts.push(`Web: ${finalWebVersion}`);
    if (finalSystemVersion) parts.push(`System: ${finalSystemVersion}`);
    if (finalPatchVersion) parts.push(`Patch: ${finalPatchVersion}`);
    versionSection.textContent = parts.join(" \xB7 ");
    versionSection.style.display = "block";
    if ((!finalWebVersion || !finalSystemVersion || !finalPatchVersion) && retryCount < 5) {
      setTimeout(() => displayVersionInfo(retryCount + 1), 2e3);
    }
  }
  displayVersionInfo(0);
  async function autoCheckWebsiteUpdated() {
    const webVersionNotice = document.getElementById("webVersionNotice");
    const webVersionData = document.getElementById("webVersionData");
    const systemVersionNotice = document.getElementById("systemVersionNotice");
    const systemVersionData = document.getElementById("systemVersionData");
    const patchVersionNotice = document.getElementById("patchVersionNotice");
    const patchVersionData = document.getElementById("patchVersionData");
    if (!webVersionNotice || !webVersionData || !systemVersionNotice || !systemVersionData) return;
    try {
      const resp = await fetch("https://raw.githubusercontent.com/Femtoce11/cor3-helper/main/versions.json", { cache: "no-store" });
      if (!resp.ok) return;
      const remote = await resp.json();
      const { webVersion, systemVersion, patchVersion } = await chrome.storage.local.get(["webVersion", "systemVersion", "patchVersion"]);
      if (webVersion && remote.web) {
        const comparison = compareVersions(webVersion, remote.web);
        if (comparison > 0) {
          webVersionNotice.textContent = "\u26A0\uFE0F Website is recently updated";
          webVersionNotice.style.display = "block";
          webVersionData.textContent = "Detected: " + webVersion + " \xB7 Old: " + remote.web;
          webVersionData.style.display = "block";
        }
      }
      if (systemVersion && remote.system) {
        const comparison = compareVersions(systemVersion, remote.system);
        if (comparison < 0) {
          systemVersionNotice.textContent = "\u26A0\uFE0F You are lagging behind in progress!";
          systemVersionNotice.style.display = "block";
          webVersionData.textContent = "Aim for " + remote.system + " system version!";
          webVersionData.style.display = "block";
        }
      }
      if (patchVersion && remote.patch && patchVersionNotice && patchVersionData) {
        const comparison = compareVersions(patchVersion, remote.patch);
        if (comparison > 0) {
          patchVersionNotice.textContent = "\u26A0\uFE0F Patch version is changed. Check patch notes!";
          patchVersionNotice.style.display = "block";
          patchVersionData.textContent = "Detected: " + patchVersion + " \xB7 Old: " + remote.patch;
          patchVersionData.style.display = "block";
        }
      }
    } catch (e) {
    }
  }
  autoCheckWebsiteUpdated();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.webVersion || changes.systemVersion || changes.patchVersion) {
      displayVersionInfo();
      autoCheckWebsiteUpdated();
    }
  });

  // src/popup/refresh-all.js
  var refreshAllBtn = document.getElementById("refreshAllBtn");
  var refreshDailyBtn2 = document.getElementById("refreshDailyBtn");
  var isRefreshing = false;
  async function refreshLoadoutOnly() {
    try {
      const tab = await getCor3Tab();
      if (tab) await chrome.tabs.sendMessage(tab.id, { action: "requestLoadout" });
    } catch (e) {
    }
    await waitForStorageKey("loadoutData", 5e3);
    await loadLoadout();
    refreshAllTimestamps();
  }
  refreshAllBtn.addEventListener("click", async () => {
    if (isRefreshing) return;
    isRefreshing = true;
    refreshAllBtn.classList.add("spinning");
    try {
      await executeRefreshStep("dailyOps", fetchDailyOps);
      await humanDelay();
      await executeRefreshStep("market1", refreshMarket1Only);
      await humanDelay();
      await executeRefreshStep("setDarkEndpoint", setDarkMarketEndpoint);
      await humanDelay();
      await executeRefreshStep("market2", refreshMarket2Only);
      await humanDelay();
      await executeRefreshStep("market3", refreshMarket3Only);
      await humanDelay();
      await executeRefreshStep("market4", refreshMarket4Only);
      await humanDelay();
      await executeRefreshStep("loadout", refreshLoadoutOnly);
      const expedition = await chrome.storage.sync.get(["expeditionModuleEnabled", "helperMode"]);
      if (expedition.expeditionModuleEnabled && !expedition.helperMode) {
        const tab = await getCor3Tab();
        if (tab) await chrome.tabs.sendMessage(tab.id, { action: "expeditionRefresh", mercs: true });
      }
    } catch (e) {
      console.log("[COR3 Helper] Refresh All error:", e);
      cor3LogError("popup.js", e, { action: "refreshAll" });
    }
    refreshAllBtn.classList.remove("spinning");
    isRefreshing = false;
    refreshAllTimestamps();
  });
  async function executeRefreshStep(name, operation) {
    try {
      console.log(`[COR3 Helper] Refresh All: Starting ${name}`);
      await operation();
      console.log(`[COR3 Helper] Refresh All: Completed ${name}`);
    } catch (error) {
      console.log(`[COR3 Helper] Refresh All: Failed ${name}:`, error);
      cor3LogError("popup.js", error, { action: "refreshStep-" + name });
    }
  }

  // src/popup/auto-refresh.js
  async function sendAutoRefreshToContent2() {
    const tab = await getCor3Tab();
    if (tab) {
      chrome.tabs.sendMessage(tab.id, {
        action: "updateAutoRefresh",
        autoRefresh: state.autoRefresh
      }).catch(() => {
      });
    }
  }
  chrome.storage.sync.get("autoRefresh", (data) => {
    if (data.autoRefresh) state.autoRefresh = data.autoRefresh;
    sendAutoRefreshToContent2();
  });
  function checkAutoRefreshFromPopup() {
  }
  var { marketContainer: marketContainer2, darkMarketContainer: darkMarketContainer2, soyuzMarketContainer: soyuzMarketContainer2, usolMarketContainer: usolMarketContainer2 } = getMarketContainers();
  setInterval(() => {
    updateDailyTimer();
    if (state.coreNextJobsResetAt) {
      const homeResetEl = marketContainer2.querySelector(".home-reset-timer");
      if (homeResetEl) {
        homeResetEl.textContent = `\u23F3 Jobs Reset: ${formatTimeRemaining(state.coreNextJobsResetAt)}`;
      }
    }
    if (state.bmiNextJobsResetAt) {
      const darkResetEl = darkMarketContainer2.querySelector(".dark-reset-timer");
      if (darkResetEl) {
        darkResetEl.textContent = `\u23F3 Jobs Reset: ${formatTimeRemaining(state.bmiNextJobsResetAt)}`;
      }
    }
    if (state.soyuzNextJobsResetAt) {
      const soyuzResetEl = soyuzMarketContainer2.querySelector(".soyuz-reset-timer");
      if (soyuzResetEl) {
        soyuzResetEl.textContent = `\u23F3 Jobs Reset: ${formatTimeRemaining(state.soyuzNextJobsResetAt)}`;
      }
    }
    if (state.usolNextJobsResetAt) {
      const usolResetEl = usolMarketContainer2.querySelector(".usol-reset-timer");
      if (usolResetEl) {
        usolResetEl.textContent = `\u23F3 Jobs Reset: ${formatTimeRemaining(state.usolNextJobsResetAt)}`;
      }
    }
    document.querySelectorAll(".exp-timer").forEach((el) => {
      const expId = el.dataset.expId;
      const endTime = state.expeditionEndTimes[expId];
      if (endTime) el.textContent = formatTimeRemaining(endTime);
    });
    document.querySelectorAll(".auto-jobs-reset-timer").forEach((el) => {
      const resetAt = el.dataset.resetAt;
      if (resetAt) el.textContent = "\u23F3 Jobs Reset: " + formatTimeRemaining(resetAt);
    });
    updatePinnedTimerValues();
    checkAutoRefreshFromPopup();
  }, 1e3);
  setInterval(() => refreshAllTimestamps(), 3e4);

  // src/popup/storage-listeners.js
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.dailyOpsData) loadCachedDailyOps();
  });

  // src/shared/ui-catalogue.json
  var ui_catalogue_default = [
    [
      "Language",
      "\u8BED\u8A00"
    ],
    [
      "(hides automation)",
      "\uFF08\u9690\u85CF\u81EA\u52A8\u529F\u80FD\uFF09"
    ],
    [
      "Helper-Only Mode",
      "\u4EC5\u8F85\u52A9\u6A21\u5F0F"
    ],
    [
      "Pinned Timers",
      "\u56FA\u5B9A\u5012\u8BA1\u65F6"
    ],
    [
      "Automation/QoL Toggles",
      "\u81EA\u52A8\u5316 / \u4FBF\u5229\u529F\u80FD\u5F00\u5173"
    ],
    [
      "Hack Automation Toggles",
      "\u5165\u4FB5\u81EA\u52A8\u5316\u5F00\u5173"
    ],
    [
      "Objective Automation Toggles",
      "\u4EFB\u52A1\u81EA\u52A8\u5316\u5F00\u5173"
    ],
    [
      "QoL Toggles",
      "\u4FBF\u5229\u529F\u80FD\u5F00\u5173"
    ],
    [
      "Auto Decrypt Hacking",
      "\u81EA\u52A8\u89E3\u5BC6\u5165\u4FB5"
    ],
    [
      "Auto ICE Wall Hacking",
      "\u81EA\u52A8\u7834\u89E3 ICE Wall"
    ],
    [
      "Auto Simple Decrypt Hacking",
      "\u81EA\u52A8\u7B80\u6613\u89E3\u5BC6\u5165\u4FB5"
    ],
    [
      "Auto Daily Hacking",
      "\u81EA\u52A8\u6BCF\u65E5\u5165\u4FB5"
    ],
    [
      "Auto Job Solver",
      "\u81EA\u52A8\u4EFB\u52A1\u6267\u884C\u5668"
    ],
    [
      "Auto Job Solver UI",
      "\u81EA\u52A8\u4EFB\u52A1\u6267\u884C\u5668\u754C\u9762"
    ],
    [
      "Auto Valuable Seller",
      "\u81EA\u52A8\u8D35\u91CD\u6587\u4EF6\u51FA\u552E"
    ],
    [
      "Auto Valuable Seller UI",
      "\u81EA\u52A8\u8D35\u91CD\u6587\u4EF6\u51FA\u552E\u754C\u9762"
    ],
    [
      "Auto Job Loadout",
      "\u81EA\u52A8\u4EFB\u52A1\u914D\u7F6E"
    ],
    [
      "Auto Update Markets",
      "\u81EA\u52A8\u66F4\u65B0\u5E02\u573A"
    ],
    [
      "Auto Finish All Jobs",
      "\u81EA\u52A8\u5B8C\u6210\u5168\u90E8\u4EFB\u52A1"
    ],
    [
      "Auto Finish All Jobs disabled",
      "\u5DF2\u5173\u95ED\u81EA\u52A8\u5B8C\u6210\u5168\u90E8\u4EFB\u52A1"
    ],
    [
      "Auto Finish All Jobs enabled",
      "\u5DF2\u5F00\u542F\u81EA\u52A8\u5B8C\u6210\u5168\u90E8\u4EFB\u52A1"
    ],
    [
      "Auto Send Mercenary",
      "\u81EA\u52A8\u6D3E\u9063\u4F63\u5175"
    ],
    [
      "Disable Desktop Glitch/Wave",
      "\u5173\u95ED\u684C\u9762\u6545\u969C / \u6CE2\u7EB9\u6548\u679C"
    ],
    [
      "Disable Network Fog",
      "\u5173\u95ED\u7F51\u7EDC\u8FF7\u96FE"
    ],
    [
      "Move Notifications To Left",
      "\u5C06\u901A\u77E5\u79FB\u5230\u5DE6\u4FA7"
    ],
    [
      "Secret Link/Server Finder",
      "\u9690\u85CF\u8FDE\u63A5 / \u670D\u52A1\u5668\u67E5\u627E\u5668"
    ],
    [
      "Debug Console",
      "\u8C03\u8BD5\u65E5\u5FD7"
    ],
    [
      "Start Auto Jobs",
      "\u5F00\u59CB\u81EA\u52A8\u4EFB\u52A1"
    ],
    [
      "Stop Auto Jobs",
      "\u505C\u6B62\u81EA\u52A8\u4EFB\u52A1"
    ],
    [
      "Start Valuable Seller",
      "\u5F00\u59CB\u8D35\u91CD\u6587\u4EF6\u51FA\u552E"
    ],
    [
      "Stop Valuable Seller",
      "\u505C\u6B62\u8D35\u91CD\u6587\u4EF6\u51FA\u552E"
    ],
    [
      "Start Valuable Search",
      "\u5F00\u59CB\u641C\u7D22\u8D35\u91CD\u6587\u4EF6"
    ],
    [
      "Stop Valuable Search",
      "\u505C\u6B62\u641C\u7D22\u8D35\u91CD\u6587\u4EF6"
    ],
    [
      "Servers",
      "\u670D\u52A1\u5668"
    ],
    [
      "Downloads",
      "\u4E0B\u8F7D"
    ],
    [
      "Maintenance",
      "\u7EF4\u62A4"
    ],
    [
      "Jobs",
      "\u4EFB\u52A1"
    ],
    [
      "Job",
      "\u4EFB\u52A1\u540D\u79F0"
    ],
    [
      "Logs",
      "\u65E5\u5FD7"
    ],
    [
      "Daily Ops",
      "\u6BCF\u65E5\u884C\u52A8"
    ],
    [
      "Markets",
      "\u5E02\u573A"
    ],
    [
      "Loadout",
      "\u914D\u7F6E"
    ],
    [
      "Hardwares",
      "\u786C\u4EF6"
    ],
    [
      "Softwares",
      "\u8F6F\u4EF6"
    ],
    [
      "System Overview",
      "\u7CFB\u7EDF\u6982\u89C8"
    ],
    [
      "Hardware",
      "\u786C\u4EF6"
    ],
    [
      "Software",
      "\u8F6F\u4EF6"
    ],
    [
      "Active",
      "\u5DF2\u542F\u7528"
    ],
    [
      "Off",
      "\u5173\u95ED"
    ],
    [
      "On",
      "\u5F00\u542F"
    ],
    [
      "All",
      "\u5168\u90E8"
    ],
    [
      "Auto",
      "\u81EA\u52A8"
    ],
    [
      "Default",
      "\u9ED8\u8BA4"
    ],
    [
      "Original",
      "\u539F\u7248"
    ],
    [
      "Abyss",
      "\u6DF1\u6E0A"
    ],
    [
      "Void",
      "\u865A\u7A7A"
    ],
    [
      "Nebula",
      "\u661F\u4E91"
    ],
    [
      "Tactical",
      "\u6218\u672F"
    ],
    [
      "Cyberpunk",
      "\u8D5B\u535A\u670B\u514B"
    ],
    [
      "Ocean",
      "\u6D77\u6D0B"
    ],
    [
      "Ember",
      "\u4F59\u70EC"
    ],
    [
      "Arctic",
      "\u6781\u5730"
    ],
    [
      "Show More \u25BC",
      "\u663E\u793A\u66F4\u591A \u25BC"
    ],
    [
      "Show Less \u25B2",
      "\u6536\u8D77 \u25B2"
    ],
    [
      "Open in separate window",
      "\u5728\u72EC\u7ACB\u7A97\u53E3\u4E2D\u6253\u5F00"
    ],
    [
      "Open as side panel",
      "\u4F5C\u4E3A\u4FA7\u8FB9\u680F\u6253\u5F00"
    ],
    [
      "Change theme",
      "\u5207\u6362\u4E3B\u9898"
    ],
    [
      "Refresh all data",
      "\u5237\u65B0\u5168\u90E8\u6570\u636E"
    ],
    [
      "Refresh job data",
      "\u5237\u65B0\u4EFB\u52A1\u6570\u636E"
    ],
    [
      "Refresh Market",
      "\u5237\u65B0\u5E02\u573A"
    ],
    [
      "Refresh Daily Ops",
      "\u5237\u65B0\u6BCF\u65E5\u884C\u52A8"
    ],
    [
      "Refresh Loadout",
      "\u5237\u65B0\u914D\u7F6E"
    ],
    [
      "Pin Market Timer",
      "\u56FA\u5B9A\u5E02\u573A\u5012\u8BA1\u65F6"
    ],
    [
      "Pin Daily Ops",
      "\u56FA\u5B9A\u6BCF\u65E5\u884C\u52A8\u5012\u8BA1\u65F6"
    ],
    [
      "Collapse Markets",
      "\u6536\u8D77\u5E02\u573A"
    ],
    [
      "Collapse Loadout",
      "\u6536\u8D77\u914D\u7F6E"
    ],
    [
      "Collapse Daily Ops",
      "\u6536\u8D77\u6BCF\u65E5\u884C\u52A8"
    ],
    [
      "Collapse Automation/QoL Toggles",
      "\u6536\u8D77\u81EA\u52A8\u5316 / \u4FBF\u5229\u529F\u80FD"
    ],
    [
      "Expand Markets",
      "\u5C55\u5F00\u5E02\u573A"
    ],
    [
      "Expand Loadout",
      "\u5C55\u5F00\u914D\u7F6E"
    ],
    [
      "Expand Daily Ops",
      "\u5C55\u5F00\u6BCF\u65E5\u884C\u52A8"
    ],
    [
      "Expand Automation/QoL Toggles",
      "\u5C55\u5F00\u81EA\u52A8\u5316 / \u4FBF\u5229\u529F\u80FD"
    ],
    [
      "Collapse",
      "\u6536\u8D77"
    ],
    [
      "Expand",
      "\u5C55\u5F00"
    ],
    [
      "Refresh",
      "\u5237\u65B0"
    ],
    [
      "Copy",
      "\u590D\u5236"
    ],
    [
      "Copied",
      "\u5DF2\u590D\u5236"
    ],
    [
      "Copy failed",
      "\u590D\u5236\u5931\u8D25"
    ],
    [
      "Copy all debug logs to clipboard",
      "\u590D\u5236\u5168\u90E8\u8C03\u8BD5\u65E5\u5FD7\u5230\u526A\u8D34\u677F"
    ],
    [
      "Copy to clipboard",
      "\u590D\u5236\u5230\u526A\u8D34\u677F"
    ],
    [
      "Collecting logs...",
      "\u6B63\u5728\u6536\u96C6\u65E5\u5FD7\u2026"
    ],
    [
      "Failed to copy logs",
      "\u590D\u5236\u65E5\u5FD7\u5931\u8D25"
    ],
    [
      "Refresh all markets, then dismiss failed jobs",
      "\u5148\u5237\u65B0\u5168\u90E8\u5E02\u573A\uFF0C\u518D\u6E05\u7406\u5931\u8D25\u4EFB\u52A1"
    ],
    [
      "Clear Failed Jobs",
      "\u6E05\u7406\u5931\u8D25\u4EFB\u52A1"
    ],
    [
      "Clear failed jobs - this button will disappear once cleanup is complete",
      "\u6E05\u7406\u5931\u8D25\u4EFB\u52A1\uFF1B\u6E05\u7406\u5B8C\u6210\u540E\u6B64\u6309\u94AE\u5C06\u9690\u85CF"
    ],
    [
      "All Failed",
      "\u6E05\u7406\u5168\u90E8\u5931\u8D25\u4EFB\u52A1"
    ],
    [
      "Loading job data...",
      "\u6B63\u5728\u52A0\u8F7D\u4EFB\u52A1\u6570\u636E\u2026"
    ],
    [
      "All jobs completed or expired.",
      "\u5168\u90E8\u4EFB\u52A1\u5DF2\u5B8C\u6210\u6216\u8FC7\u671F\u3002"
    ],
    [
      "No job data yet.",
      "\u6682\u65E0\u4EFB\u52A1\u6570\u636E\u3002"
    ],
    [
      "No jobs available.",
      "\u6682\u65E0\u53EF\u7528\u4EFB\u52A1\u3002"
    ],
    [
      "No jobs available. Click \u{1F504} to refresh market data.",
      "\u6682\u65E0\u53EF\u7528\u4EFB\u52A1\u3002\u70B9\u51FB \u{1F504} \u5237\u65B0\u5E02\u573A\u6570\u636E\u3002"
    ],
    [
      "No jobs selected or available to run.",
      "\u6CA1\u6709\u9009\u4E2D\u6216\u53EF\u6267\u884C\u7684\u4EFB\u52A1\u3002"
    ],
    [
      "Select All",
      "\u5168\u9009"
    ],
    [
      "Not supported",
      "\u6682\u4E0D\u652F\u6301"
    ],
    [
      "This job type is currently not supported",
      "\u6B64\u4EFB\u52A1\u7C7B\u578B\u76EE\u524D\u5C1A\u4E0D\u652F\u6301"
    ],
    [
      "Bugged",
      "\u5B58\u5728\u6545\u969C"
    ],
    [
      "Log jobs on D4RK RM7CE are bugged (logs tab unavailable)",
      "D4RK RM7CE \u7684\u65E5\u5FD7\u4EFB\u52A1\u5B58\u5728\u6545\u969C\uFF08\u65E5\u5FD7\u9875\u4E0D\u53EF\u7528\uFF09"
    ],
    [
      "Data Download",
      "\u6570\u636E\u4E0B\u8F7D"
    ],
    [
      "Data Upload",
      "\u6570\u636E\u4E0A\u4F20"
    ],
    [
      "File Decryption",
      "\u6587\u4EF6\u89E3\u5BC6"
    ],
    [
      "IP Injection",
      "IP \u6CE8\u5165"
    ],
    [
      "Log Deletion",
      "\u65E5\u5FD7\u5220\u9664"
    ],
    [
      "Log Download",
      "\u65E5\u5FD7\u4E0B\u8F7D"
    ],
    [
      "Decrypt & Extract",
      "\u89E3\u5BC6\u5E76\u63D0\u53D6"
    ],
    [
      "File Elimination",
      "\u6587\u4EF6\u5220\u9664"
    ],
    [
      "IP Cleanup",
      "IP \u6E05\u7406"
    ],
    [
      "Minigame lock",
      "\u5C0F\u6E38\u620F\u9501\u5B9A"
    ],
    [
      "Minigame locked",
      "\u5C0F\u6E38\u620F\u5DF2\u9501\u5B9A"
    ],
    [
      "Jobs Reset",
      "\u4EFB\u52A1\u91CD\u7F6E"
    ],
    [
      "Next Task",
      "\u4E0B\u6B21\u884C\u52A8"
    ],
    [
      "Claimed",
      "\u5DF2\u9886\u53D6"
    ],
    [
      "Streak",
      "\u8FDE\u7EED\u5929\u6570"
    ],
    [
      "Difficulty",
      "\u96BE\u5EA6"
    ],
    [
      "Bonus",
      "\u52A0\u6210"
    ],
    [
      "Easy",
      "\u7B80\u5355"
    ],
    [
      "Medium",
      "\u4E2D\u7B49"
    ],
    [
      "Hard",
      "\u56F0\u96BE"
    ],
    [
      "Very Hard",
      "\u6781\u96BE"
    ],
    [
      "Yes",
      "\u662F"
    ],
    [
      "No",
      "\u5426"
    ],
    [
      "None",
      "\u65E0"
    ],
    [
      "Unknown",
      "\u672A\u77E5"
    ],
    [
      "Available",
      "\u53EF\u7528"
    ],
    [
      "RUNNING",
      "\u8FD0\u884C\u4E2D"
    ],
    [
      "IN PROGRESS",
      "\u8FDB\u884C\u4E2D"
    ],
    [
      "COMPLETED",
      "\u5DF2\u5B8C\u6210"
    ],
    [
      "FAILED",
      "\u5931\u8D25"
    ],
    [
      "EXPIRED",
      "\u5DF2\u8FC7\u671F"
    ],
    [
      "SKIPPED",
      "\u5DF2\u8DF3\u8FC7"
    ],
    [
      "BUGGED",
      "\u5B58\u5728\u6545\u969C"
    ],
    [
      "LOCKED",
      "\u5DF2\u9501\u5B9A"
    ],
    [
      "OPEN",
      "\u53EF\u7528"
    ],
    [
      "TAKEN",
      "\u5DF2\u63A5\u53D6"
    ],
    [
      "PENDING",
      "\u5F85\u5904\u7406"
    ],
    [
      "QUEUED",
      "\u5DF2\u6392\u961F"
    ],
    [
      "FORCING...",
      "\u6B63\u5728\u89E6\u53D1\u2026"
    ],
    [
      "IN MAINTENANCE",
      "\u7EF4\u62A4\u4E2D"
    ],
    [
      "UPCOMING",
      "\u5373\u5C06\u7EF4\u62A4"
    ],
    [
      "READY",
      "\u5C31\u7EEA"
    ],
    [
      "Success",
      "\u6210\u529F"
    ],
    [
      "Expired",
      "\u8FC7\u671F"
    ],
    [
      "Paused",
      "\u5DF2\u6682\u505C"
    ],
    [
      "Status",
      "\u72B6\u6001"
    ],
    [
      "Status: Ready",
      "\u72B6\u6001\uFF1A\u5C31\u7EEA"
    ],
    [
      "Search",
      "\u641C\u7D22"
    ],
    [
      "Decrypt",
      "\u89E3\u5BC6"
    ],
    [
      "Hack",
      "\u5165\u4FB5"
    ],
    [
      "View",
      "\u67E5\u770B"
    ],
    [
      "Load",
      "\u52A0\u8F7D"
    ],
    [
      "Count",
      "\u6570\u91CF"
    ],
    [
      "Server",
      "\u670D\u52A1\u5668"
    ],
    [
      "Server Types",
      "\u670D\u52A1\u5668\u7C7B\u578B"
    ],
    [
      "File Types",
      "\u6587\u4EF6\u7C7B\u578B"
    ],
    [
      "Details",
      "\u8BE6\u60C5"
    ],
    [
      "Name",
      "\u540D\u79F0"
    ],
    [
      "Category",
      "\u7C7B\u522B"
    ],
    [
      "Reward/Penalty",
      "\u5956\u52B1 / \u60E9\u7F5A"
    ],
    [
      "Reward",
      "\u5956\u52B1"
    ],
    [
      "Penalty",
      "\u60E9\u7F5A"
    ],
    [
      "Price",
      "\u4EF7\u683C"
    ],
    [
      "Base Price",
      "\u57FA\u7840\u4EF7\u683C"
    ],
    [
      "Price Modifier",
      "\u4EF7\u683C\u4FEE\u6B63"
    ],
    [
      "Manufacturer",
      "\u5236\u9020\u5546"
    ],
    [
      "Tier",
      "\u54C1\u8D28"
    ],
    [
      "Vulnerability",
      "\u6F0F\u6D1E\u503C"
    ],
    [
      "Vulnerability %",
      "\u6F0F\u6D1E\u7387 %"
    ],
    [
      "Type",
      "\u7C7B\u578B"
    ],
    [
      "Remote",
      "\u8FDC\u7A0B"
    ],
    [
      "Access",
      "\u8BBF\u95EE\u6743\u9650"
    ],
    [
      "Access Level",
      "\u8BBF\u95EE\u7B49\u7EA7"
    ],
    [
      "Access Type",
      "\u8BBF\u95EE\u7C7B\u578B"
    ],
    [
      "Duration",
      "\u6301\u7EED\u65F6\u95F4"
    ],
    [
      "Locked By Quest",
      "\u53D7\u4EFB\u52A1\u9501\u5B9A"
    ],
    [
      "Reputation",
      "\u58F0\u671B"
    ],
    [
      "Reputation \u2014 Level",
      "\u58F0\u671B \u2014 \u7B49\u7EA7"
    ],
    [
      "Progress",
      "\u8FDB\u5EA6"
    ],
    [
      "Level Locked",
      "\u7B49\u7EA7\u5DF2\u9501\u5B9A"
    ],
    [
      "Max Level",
      "\u6700\u9AD8\u7B49\u7EA7"
    ],
    [
      "Credits",
      "\u4F59\u989D"
    ],
    [
      "Bought",
      "\u5DF2\u8D2D\u4E70"
    ],
    [
      "BOUGHT",
      "\u5DF2\u8D2D\u4E70"
    ],
    [
      "INFO",
      "\u4FE1\u606F"
    ],
    [
      "CHANGE",
      "\u66F4\u6362"
    ],
    [
      "Equip",
      "\u88C5\u5907"
    ],
    [
      "Unequip",
      "\u5378\u4E0B"
    ],
    [
      "Equipped",
      "\u5DF2\u88C5\u5907"
    ],
    [
      "Installed",
      "\u5DF2\u5B89\u88C5"
    ],
    [
      "Install",
      "\u5B89\u88C5"
    ],
    [
      "Uninstall",
      "\u5378\u8F7D"
    ],
    [
      "UNINSTALL",
      "\u5378\u8F7D"
    ],
    [
      "Not installed",
      "\u672A\u5B89\u88C5"
    ],
    [
      "Not equipped",
      "\u672A\u88C5\u5907"
    ],
    [
      "CPU Cores",
      "CPU \u6838\u5FC3\u6570"
    ],
    [
      "CPU Frequency",
      "CPU \u9891\u7387"
    ],
    [
      "Cores count",
      "\u6838\u5FC3\u6570\u91CF"
    ],
    [
      "GPU Memory",
      "GPU \u663E\u5B58"
    ],
    [
      "GPU Frequency",
      "GPU \u9891\u7387"
    ],
    [
      "RAM Memory",
      "\u5185\u5B58\u5BB9\u91CF"
    ],
    [
      "RAM Frequency",
      "\u5185\u5B58\u9891\u7387"
    ],
    [
      "PSU Power",
      "\u7535\u6E90\u529F\u7387"
    ],
    [
      "PSU Protection",
      "\u7535\u6E90\u4FDD\u62A4"
    ],
    [
      "PSU Total",
      "\u7535\u6E90\u603B\u5BB9\u91CF"
    ],
    [
      "Power",
      "\u7B97\u529B"
    ],
    [
      "Power Consuming",
      "\u529F\u8017"
    ],
    [
      "Power consuming",
      "\u529F\u8017"
    ],
    [
      "Protection",
      "\u4FDD\u62A4"
    ],
    [
      "Memory",
      "\u5185\u5B58"
    ],
    [
      "Usage / Available",
      "\u7528\u91CF / \u53EF\u7528"
    ],
    [
      "Performance Ratio",
      "\u6027\u80FD\u6BD4\u7387"
    ],
    [
      "Detect Rate",
      "\u68C0\u51FA\u7387"
    ],
    [
      "Basic Required",
      "\u57FA\u7840\u9700\u6C42"
    ],
    [
      "Usage",
      "\u4F7F\u7528\u91CF"
    ],
    [
      "Supply",
      "\u4F9B\u7ED9"
    ],
    [
      "Demand",
      "\u9700\u6C42"
    ],
    [
      "Boot Status",
      "\u542F\u52A8\u72B6\u6001"
    ],
    [
      "BOOTED",
      "\u5DF2\u542F\u52A8"
    ],
    [
      "NOT BOOTED",
      "\u672A\u542F\u52A8"
    ],
    [
      "SORT",
      "\u6392\u5E8F"
    ],
    [
      "FUNC:",
      "\u529F\u80FD\uFF1A"
    ],
    [
      "Search...",
      "\u641C\u7D22\u2026"
    ],
    [
      "Search in message...",
      "\u5728\u6D88\u606F\u4E2D\u641C\u7D22\u2026"
    ],
    [
      "No hardware data",
      "\u6682\u65E0\u786C\u4EF6\u6570\u636E"
    ],
    [
      "No hardware equipped",
      "\u5C1A\u672A\u88C5\u5907\u786C\u4EF6"
    ],
    [
      "No software data",
      "\u6682\u65E0\u8F6F\u4EF6\u6570\u636E"
    ],
    [
      "No loadout data yet",
      "\u6682\u65E0\u914D\u7F6E\u6570\u636E"
    ],
    [
      "No programs found",
      "\u672A\u627E\u5230\u7A0B\u5E8F"
    ],
    [
      "No consumption data",
      "\u6682\u65E0\u6D88\u8017\u6570\u636E"
    ],
    [
      "No resource data",
      "\u6682\u65E0\u8D44\u6E90\u6570\u636E"
    ],
    [
      "No items in market.",
      "\u5E02\u573A\u4E2D\u6CA1\u6709\u7269\u54C1\u3002"
    ],
    [
      "No description available.",
      "\u6682\u65E0\u63CF\u8FF0\u3002"
    ],
    [
      "No market data available.",
      "\u6682\u65E0\u5E02\u573A\u6570\u636E\u3002"
    ],
    [
      "No market data cached yet.",
      "\u5C1A\u65E0\u5E02\u573A\u7F13\u5B58\u3002"
    ],
    [
      "No market data cached. Click \u{1F504} to refresh.",
      "\u5C1A\u65E0\u5E02\u573A\u7F13\u5B58\u3002\u70B9\u51FB \u{1F504} \u5237\u65B0\u3002"
    ],
    [
      "No cached market data available.",
      "\u6CA1\u6709\u53EF\u7528\u7684\u5E02\u573A\u7F13\u5B58\u3002"
    ],
    [
      "Requesting market data...",
      "\u6B63\u5728\u8BF7\u6C42\u5E02\u573A\u6570\u636E\u2026"
    ],
    [
      "Refreshing market data...",
      "\u6B63\u5728\u5237\u65B0\u5E02\u573A\u6570\u636E\u2026"
    ],
    [
      "Refreshing (sequential)...",
      "\u6B63\u5728\u4F9D\u6B21\u5237\u65B0\u2026"
    ],
    [
      "Requesting market refresh and failed-job cleanup\u2026",
      "\u6B63\u5728\u8BF7\u6C42\u5E02\u573A\u5237\u65B0\u548C\u5931\u8D25\u4EFB\u52A1\u6E05\u7406\u2026"
    ],
    [
      'No valuable data yet. Click "Start Valuable Search" to scan servers.',
      "\u6682\u65E0\u8D35\u91CD\u6587\u4EF6\u6570\u636E\u3002\u70B9\u51FB\u201C\u5F00\u59CB\u641C\u7D22\u8D35\u91CD\u6587\u4EF6\u201D\u626B\u63CF\u670D\u52A1\u5668\u3002"
    ],
    [
      'No download data yet. Click "Start Valuable Search" to scan.',
      "\u6682\u65E0\u4E0B\u8F7D\u6570\u636E\u3002\u70B9\u51FB\u201C\u5F00\u59CB\u641C\u7D22\u8D35\u91CD\u6587\u4EF6\u201D\u8FDB\u884C\u626B\u63CF\u3002"
    ],
    [
      "No servers or downloads selected for selling.",
      "\u6CA1\u6709\u9009\u4E2D\u8981\u51FA\u552E\u7684\u670D\u52A1\u5668\u6216\u4E0B\u8F7D\u6587\u4EF6\u3002"
    ],
    [
      'Run "Start Valuable Search" to see the maintenance status of servers. If no servers are shown after the search, there is no upcoming or active maintenance.',
      "\u8FD0\u884C\u201C\u5F00\u59CB\u641C\u7D22\u8D35\u91CD\u6587\u4EF6\u201D\u67E5\u770B\u670D\u52A1\u5668\u7EF4\u62A4\u72B6\u6001\u3002\u641C\u7D22\u540E\u82E5\u6CA1\u6709\u5217\u51FA\u670D\u52A1\u5668\uFF0C\u8868\u793A\u6CA1\u6709\u5373\u5C06\u5F00\u59CB\u6216\u6B63\u5728\u8FDB\u884C\u7684\u7EF4\u62A4\u3002"
    ],
    [
      "Force selected!",
      "\u5BF9\u9009\u4E2D\u9879\u89E6\u53D1\u7EF4\u62A4"
    ],
    [
      "Force maintenance on all checked servers (furthest first)",
      "\u5BF9\u5168\u90E8\u9009\u4E2D\u7684\u670D\u52A1\u5668\u89E6\u53D1\u7EF4\u62A4\uFF08\u4ECE\u6700\u8FDC\u5904\u5F00\u59CB\uFF09"
    ],
    [
      "In-progress...",
      "\u6B63\u5728\u6267\u884C\u2026"
    ],
    [
      "Forcing...",
      "\u6B63\u5728\u89E6\u53D1\u2026"
    ],
    [
      "No logs yet.",
      "\u6682\u65E0\u65E5\u5FD7\u3002"
    ],
    [
      "No cor3.gg tab found.",
      "\u672A\u627E\u5230 cor3.gg \u6807\u7B7E\u9875\u3002"
    ],
    [
      "No cor3.gg tab found",
      "\u672A\u627E\u5230 cor3.gg \u6807\u7B7E\u9875"
    ],
    [
      "No cor3.gg tab",
      "\u6CA1\u6709 cor3.gg \u6807\u7B7E\u9875"
    ],
    [
      "Open cor3.gg first",
      "\u8BF7\u5148\u6253\u5F00 cor3.gg"
    ],
    [
      "Make sure you have the cor3.gg tab open.",
      "\u8BF7\u786E\u4FDD\u5DF2\u6253\u5F00 cor3.gg \u6E38\u620F\u6807\u7B7E\u9875\u3002"
    ],
    [
      "Side panel not supported in this browser.",
      "\u5F53\u524D\u6D4F\u89C8\u5668\u4E0D\u652F\u6301\u4FA7\u8FB9\u680F\u3002"
    ],
    [
      "Invalid access token",
      "\u8BBF\u95EE\u4EE4\u724C\u65E0\u6548"
    ],
    [
      "Access token expired. Page refresh required.",
      "\u8BBF\u95EE\u4EE4\u724C\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u5237\u65B0\u9875\u9762\u3002"
    ],
    [
      "Failed to load daily ops",
      "\u52A0\u8F7D\u6BCF\u65E5\u884C\u52A8\u5931\u8D25"
    ],
    [
      "No data available. Refresh the page.",
      "\u6682\u65E0\u6570\u636E\uFF0C\u8BF7\u5237\u65B0\u9875\u9762\u3002"
    ],
    [
      "Using cached data (content script not responding)",
      "\u6B63\u5728\u4F7F\u7528\u7F13\u5B58\uFF08\u6E38\u620F\u811A\u672C\u672A\u54CD\u5E94\uFF09"
    ],
    [
      "Using cached data (error occurred)",
      "\u6B63\u5728\u4F7F\u7528\u7F13\u5B58\uFF08\u53D1\u751F\u9519\u8BEF\uFF09"
    ],
    [
      "Refreshing daily ops...",
      "\u6B63\u5728\u5237\u65B0\u6BCF\u65E5\u884C\u52A8\u2026"
    ],
    [
      "Starting daily hack solver...",
      "\u6B63\u5728\u542F\u52A8\u6BCF\u65E5\u5165\u4FB5\u6267\u884C\u5668\u2026"
    ],
    [
      "Starting search...",
      "\u6B63\u5728\u5F00\u59CB\u641C\u7D22\u2026"
    ],
    [
      "Starting Valuable Search...",
      "\u6B63\u5728\u5F00\u59CB\u641C\u7D22\u8D35\u91CD\u6587\u4EF6\u2026"
    ],
    [
      "Auto Jobs stopped by user.",
      "\u7528\u6237\u5DF2\u505C\u6B62\u81EA\u52A8\u4EFB\u52A1\u3002"
    ],
    [
      "Valuable Search stopped by user.",
      "\u7528\u6237\u5DF2\u505C\u6B62\u8D35\u91CD\u6587\u4EF6\u641C\u7D22\u3002"
    ],
    [
      "Valuable Seller stopped by user.",
      "\u7528\u6237\u5DF2\u505C\u6B62\u8D35\u91CD\u6587\u4EF6\u51FA\u552E\u3002"
    ],
    [
      "Force maintenance already running",
      "\u7EF4\u62A4\u89E6\u53D1\u4EFB\u52A1\u5DF2\u5728\u8FD0\u884C"
    ],
    [
      "No servers selected for batch force maintenance",
      "\u6CA1\u6709\u9009\u4E2D\u8981\u6279\u91CF\u89E6\u53D1\u7EF4\u62A4\u7684\u670D\u52A1\u5668"
    ],
    [
      "Software + hardware \u2014 highest actual Power",
      "\u8F6F\u4EF6 + \u786C\u4EF6 \u2014 \u4F18\u5148\u6700\u9AD8\u5B9E\u9645\u7B97\u529B"
    ],
    [
      "Software only \u2014 keep current hardware",
      "\u4EC5\u8C03\u6574\u8F6F\u4EF6 \u2014 \u4FDD\u6301\u5F53\u524D\u786C\u4EF6"
    ],
    [
      "Compare owned tools by actual Power on your current hardware. Hardware stays unchanged. Changes apply from the next job.",
      "\u6839\u636E\u5F53\u524D\u786C\u4EF6\u6BD4\u8F83\u5DF2\u62E5\u6709\u5DE5\u5177\u7684\u5B9E\u9645\u7B97\u529B\uFF1B\u786C\u4EF6\u4FDD\u6301\u4E0D\u53D8\u3002\u4ECE\u4E0B\u4E00\u4E2A\u4EFB\u52A1\u8D77\u751F\u6548\u3002"
    ],
    [
      "Compare owned software + hardware by actual HACK/DECRYPT Power. Equal Power favors fewer swaps. Changes apply from the next job.",
      "\u6BD4\u8F83\u5DF2\u62E5\u6709\u8F6F\u4EF6\u4E0E\u786C\u4EF6\u7684\u5B9E\u9645\u5165\u4FB5 / \u89E3\u5BC6\u7B97\u529B\uFF1B\u7B97\u529B\u76F8\u540C\u65F6\u4F18\u5148\u51CF\u5C11\u66F4\u6362\u3002\u4ECE\u4E0B\u4E00\u4E2A\u4EFB\u52A1\u8D77\u751F\u6548\u3002"
    ],
    [
      "Check for Updates",
      "\u68C0\u67E5\u66F4\u65B0"
    ],
    [
      "Checking...",
      "\u6B63\u5728\u68C0\u67E5\u2026"
    ],
    [
      "You're up to date!",
      "\u5DF2\u662F\u6700\u65B0\u7248\u672C\uFF01"
    ],
    [
      "Could not check for updates. Check your connection.",
      "\u65E0\u6CD5\u68C0\u67E5\u66F4\u65B0\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u8FDE\u63A5\u3002"
    ],
    [
      "Failed to fetch remote versions",
      "\u65E0\u6CD5\u83B7\u53D6\u8FDC\u7A0B\u7248\u672C"
    ],
    [
      "Website is recently updated",
      "\u7F51\u7AD9\u6700\u8FD1\u5DF2\u66F4\u65B0"
    ],
    [
      "You are lagging behind in progress!",
      "\u5F53\u524D\u7CFB\u7EDF\u8FDB\u5EA6\u843D\u540E\u4E8E\u76EE\u6807\u7248\u672C\uFF01"
    ],
    [
      "Patch version is changed. Check patch notes!",
      "\u8865\u4E01\u7248\u672C\u5DF2\u53D8\u5316\uFF0C\u8BF7\u67E5\u770B\u66F4\u65B0\u8BF4\u660E\uFF01"
    ],
    [
      "Extension",
      "\u6269\u5C55"
    ],
    [
      "Web",
      "\u7F51\u9875"
    ],
    [
      "System",
      "\u7CFB\u7EDF"
    ],
    [
      "Patch",
      "\u8865\u4E01"
    ],
    [
      "Detected",
      "\u68C0\u6D4B\u5230"
    ],
    [
      "Old",
      "\u539F\u7248\u672C"
    ],
    [
      "Updated just now",
      "\u521A\u521A\u66F4\u65B0"
    ],
    [
      "Modified Version based on cor3-helper ver1.7.0",
      "\u57FA\u4E8E cor3-helper ver1.7.0 \u7684\u4FEE\u6539\u7248"
    ],
    [
      "By Chatgpt Sol 6.1, on 11/23/2026",
      "\u7531 Chatgpt Sol 6.1 \u4FEE\u6539\uFF0C\u65E5\u671F 11/23/2026"
    ],
    [
      "Dev TCs",
      "\u5F00\u53D1\u6D4B\u8BD5"
    ],
    [
      "TC Script 1 (placeholder)",
      "\u6D4B\u8BD5\u811A\u672C 1\uFF08\u5360\u4F4D\uFF09"
    ],
    [
      "TC Toggle 1 (placeholder)",
      "\u6D4B\u8BD5\u5F00\u5173 1\uFF08\u5360\u4F4D\uFF09"
    ],
    [
      "TC Toggle 2 (placeholder)",
      "\u6D4B\u8BD5\u5F00\u5173 2\uFF08\u5360\u4F4D\uFF09"
    ],
    [
      "TC Toggle 3 (placeholder)",
      "\u6D4B\u8BD5\u5F00\u5173 3\uFF08\u5360\u4F4D\uFF09"
    ],
    [
      "Test reachability to a server",
      "\u6D4B\u8BD5\u670D\u52A1\u5668\u53EF\u8FBE\u6027"
    ],
    [
      "Pull get.map data",
      "\u83B7\u53D6 get.map \u5730\u56FE\u6570\u636E"
    ],
    [
      "\u2014 select server \u2014",
      "\u2014 \u9009\u62E9\u670D\u52A1\u5668 \u2014"
    ],
    [
      "\u2014 pull map first \u2014",
      "\u2014 \u8BF7\u5148\u83B7\u53D6\u5730\u56FE \u2014"
    ],
    [
      "\u2014 none \u2014",
      "\u2014 \u65E0 \u2014"
    ],
    [
      "No server selected",
      "\u672A\u9009\u62E9\u670D\u52A1\u5668"
    ],
    [
      "Sending get.map...",
      "\u6B63\u5728\u53D1\u9001 get.map \u8BF7\u6C42\u2026"
    ],
    [
      "Timeout waiting for map data",
      "\u7B49\u5F85\u5730\u56FE\u6570\u636E\u8D85\u65F6"
    ],
    [
      "Timeout waiting for reachability result (5m)",
      "\u7B49\u5F85\u53EF\u8FBE\u6027\u6D4B\u8BD5\u7ED3\u679C\u8D85\u65F6\uFF085 \u5206\u949F\uFF09"
    ],
    [
      "Reachable: YES",
      "\u53EF\u8FBE\uFF1A\u662F"
    ],
    [
      "Reachable: NO \u2014",
      "\u53EF\u8FBE\uFF1A\u5426 \u2014"
    ],
    [
      "Trigger Scripts",
      "\u89E6\u53D1\u811A\u672C"
    ],
    [
      "Toggles",
      "\u5F00\u5173"
    ],
    [
      "Toggle",
      "\u5F00\u5173"
    ],
    [
      "Expedition",
      "\u8FDC\u5F81"
    ],
    [
      "Expeditions",
      "\u8FDC\u5F81\u6A21\u5757"
    ],
    [
      "Active Expedition",
      "\u5F53\u524D\u8FDC\u5F81"
    ],
    [
      "Personal Drone Assembling",
      "\u4E2A\u4EBA\u65E0\u4EBA\u673A\u7EC4\u88C5"
    ],
    [
      "Mercenaries",
      "\u4F63\u5175"
    ],
    [
      "Loot Selling",
      "\u6389\u843D\u51FA\u552E"
    ],
    [
      "Inventory",
      "\u4ED3\u5E93"
    ],
    [
      "Archived Expeditions",
      "\u5386\u53F2\u8FDC\u5F81"
    ],
    [
      "Decisions",
      "\u51B3\u7B56"
    ],
    [
      "Master switch",
      "\u603B\u5F00\u5173"
    ],
    [
      "Expedition master switch",
      "\u8FDC\u5F81\u603B\u5F00\u5173"
    ],
    [
      "Expand Expeditions",
      "\u5C55\u5F00\u8FDC\u5F81"
    ],
    [
      "Collapse Expeditions",
      "\u6536\u8D77\u8FDC\u5F81"
    ],
    [
      "When Stash Is Full",
      "\u4ED3\u5E93\u6EE1\u51FA\u552E"
    ],
    [
      "Non-Drone Loot",
      "\u51FA\u552E\u975E\u65E0\u4EBA\u673A"
    ],
    [
      "All Expedition Loot",
      "\u5168\u51FA\u552E"
    ],
    [
      "Do not sell automatically.",
      "\u4E0D\u81EA\u52A8\u51FA\u552E\u3002"
    ],
    [
      "Do not sell automatically",
      "\u4E0D\u81EA\u52A8\u51FA\u552E"
    ],
    [
      "When space is insufficient, sell the cheapest non-drone expedition loot. Stop as soon as enough space is available.",
      "\u7A7A\u95F4\u4E0D\u8DB3\u65F6\u51FA\u552E\u6700\u4FBF\u5B9C\u7684\u975E\u65E0\u4EBA\u673A\u8FDC\u5F81\u6389\u843D\uFF0C\u817E\u591F\u7A7A\u95F4\u5373\u505C\u6B62\u3002"
    ],
    [
      "Automatically sell all sellable non-drone expedition loot. Keep all drone materials.",
      "\u81EA\u52A8\u51FA\u552E\u6240\u6709\u53EF\u552E\u7684\u975E\u65E0\u4EBA\u673A\u8FDC\u5F81\u6389\u843D\uFF0C\u4FDD\u7559\u5168\u90E8\u65E0\u4EBA\u673A\u6750\u6599\u3002"
    ],
    [
      "Automatically sell all sellable expedition loot, including drone materials.",
      "\u81EA\u52A8\u51FA\u552E\u5168\u90E8\u53EF\u552E\u8FDC\u5F81\u6389\u843D\uFF0C\u5305\u62EC\u65E0\u4EBA\u673A\u6750\u6599\u3002"
    ],
    [
      "The four modes are mutually exclusive; exactly one stays selected.",
      "\u56DB\u79CD\u6A21\u5F0F\u4E92\u65A5\uFF0C\u59CB\u7EC8\u53EA\u6709\u4E00\u9879\u5F00\u542F\u3002"
    ],
    [
      "Only item types in the expedition loot catalogue are sold automatically, including existing stock and future loot. Purchased copies of the same type cannot be distinguished. Unknown, unsellable, locked and pinned items are skipped.",
      "\u81EA\u52A8\u51FA\u552E\u4EC5\u5339\u914D\u8FDC\u5F81\u6389\u843D\u6E05\u5355\u4E2D\u7684\u7269\u54C1\u7C7B\u578B\uFF0C\u5305\u542B\u5DF2\u6709\u5E93\u5B58\u548C\u540E\u7EED\u6389\u843D\u3002\u540C\u7C7B\u7269\u54C1\u7684\u8D2D\u4E70\u6765\u6E90\u65E0\u6CD5\u5355\u72EC\u533A\u5206\uFF1B\u672A\u77E5\u3001\u4E0D\u53EF\u51FA\u552E\u3001\u9501\u5B9A\u53CA\u56FA\u5B9A\u7269\u54C1\u4F1A\u8DF3\u8FC7\u3002"
    ],
    [
      "View protected drone materials (22 types)",
      "\u67E5\u770B\u65E0\u4EBA\u673A\u6750\u6599\u4FDD\u62A4\u6E05\u5355\uFF0822 \u7C7B\uFF09"
    ],
    [
      "Highest mercenary cost (CR)",
      "\u6700\u9AD8\u8D39\u7528\uFF08CR\uFF09"
    ],
    [
      "Apply mercenary cost limit",
      "\u542F\u7528\u4F63\u5175\u8D39\u7528\u4E0A\u9650"
    ],
    [
      "Auto-dispatch after an expedition ends",
      "\u8FDC\u5F81\u7ED3\u675F\u540E\u81EA\u52A8\u6D3E\u9063"
    ],
    [
      "Check and dispatch every 30 minutes",
      "\u6BCF 30 \u5206\u949F\u68C0\u67E5\u5E76\u6D3E\u9063"
    ],
    [
      "Auto-choose the cheapest available mercenary",
      "\u81EA\u52A8\u9009\u62E9\u6700\u4FBF\u5B9C\u7684\u53EF\u7528\u4F63\u5175"
    ],
    [
      "Prefer USOL mercenaries",
      "\u4F18\u5148\u9009\u62E9 USOL \u4F63\u5175"
    ],
    [
      "Ignore elite mercenaries",
      "\u6392\u9664\u7CBE\u82F1\u4F63\u5175"
    ],
    [
      "Auto-claim expedition reward mail",
      "\u81EA\u52A8\u9886\u53D6\u8FDC\u5F81\u5956\u52B1\u90AE\u4EF6"
    ],
    [
      "Check mail now",
      "\u7ACB\u5373\u68C0\u67E5\u90AE\u4EF6"
    ],
    [
      "Check and dispatch now",
      "\u7ACB\u5373\u68C0\u67E5\u5E76\u6D3E\u9063"
    ],
    [
      "Choose this mercenary",
      "\u9009\u62E9\u6B64\u4F63\u5175"
    ],
    [
      "Selected",
      "\u5DF2\u9009\u62E9"
    ],
    [
      "Selected:",
      "\u5DF2\u9009\u62E9\uFF1A"
    ],
    [
      "No mercenary selected",
      "\u672A\u9009\u62E9"
    ],
    [
      "Choose automatically by cost and filters",
      "\u6309\u8D39\u7528\u4E0E\u7B5B\u9009\u6761\u4EF6\u81EA\u52A8\u9009\u62E9"
    ],
    [
      "Triggered when an expedition ends; follows the current cost limit and mercenary filters.",
      "\u7ED3\u675F\u65F6\u89E6\u53D1\u7EDF\u4E00\u68C0\u67E5\uFF1B\u9075\u5B88\u5F53\u524D\u8D39\u7528\u4E0A\u9650\u548C\u4F63\u5175\u7B5B\u9009\u3002"
    ],
    [
      "Check once immediately when enabled, then every 30 minutes.",
      "\u5F00\u542F\u65F6\u7ACB\u5373\u68C0\u67E5\u4E00\u6B21\uFF1B\u6B64\u540E\u6BCF 30 \u5206\u949F\u68C0\u67E5\u53EF\u7528\u4F63\u5175\u3002"
    ],
    [
      "While the game is online, check once a minute and claim recognized expedition reward mail only.",
      "\u6E38\u620F\u5728\u7EBF\u65F6\u6BCF\u5206\u949F\u68C0\u67E5\uFF0C\u4EC5\u9886\u53D6\u8BC6\u522B\u5230\u7684\u8FDC\u5F81\u5956\u52B1\u90AE\u4EF6\u3002"
    ],
    [
      "Both dispatch triggers share one workflow. Existing expeditions and running checks prevent duplicate dispatch. The check button follows the enabled dispatch settings.",
      "\u4E24\u79CD\u81EA\u52A8\u6D3E\u9063\u5171\u7528\u540C\u4E00\u6D41\u7A0B\u3002\u6B63\u5728\u6267\u884C\u6216\u5DF2\u6709\u8FDC\u5F81\u65F6\uFF0C\u4E0D\u4F1A\u91CD\u590D\u6D3E\u9063\u3002\u7ACB\u5373\u68C0\u67E5\u6309\u94AE\u6309\u5DF2\u542F\u7528\u7684\u6D3E\u9063\u5F00\u5173\u8FD0\u884C\u3002"
    ],
    [
      "Save",
      "\u4FDD\u5B58"
    ],
    [
      "Mercenary cost limit saved",
      "\u4F63\u5175\u8D39\u7528\u4E0A\u9650\u5DF2\u4FDD\u5B58"
    ],
    [
      "Cost limit must be a non-negative number",
      "\u8D39\u7528\u4E0A\u9650\u5FC5\u987B\u662F\u975E\u8D1F\u6570\u5B57"
    ],
    [
      "Scoring weights must be numbers",
      "\u8BC4\u5206\u6743\u91CD\u5FC5\u987B\u662F\u6570\u5B57"
    ],
    [
      "Decision weights saved",
      "\u51B3\u7B56\u6743\u91CD\u5DF2\u4FDD\u5B58"
    ],
    [
      "Auto-choose decisions",
      "\u81EA\u52A8\u9009\u62E9\u51B3\u7B56"
    ],
    [
      "Choose immediately instead of waiting",
      "\u7ACB\u5373\u81EA\u52A8\u9009\u62E9\uFF0C\u4E0D\u7B49\u5F85\u622A\u6B62"
    ],
    [
      "Enable custom scoring weights",
      "\u542F\u7528\u81EA\u5B9A\u4E49\u8BC4\u5206\u6743\u91CD"
    ],
    [
      "Enable the veteran scoring strategy",
      "\u542F\u7528\u8001\u5175\u7279\u6B8A\u7B56\u7565"
    ],
    [
      "Loot weight",
      "\u6536\u76CA\u6743\u91CD"
    ],
    [
      "Risk weight",
      "\u98CE\u9669\u6743\u91CD"
    ],
    [
      "Options are ranked by weighted loot and risk. Unless immediate choice is enabled, submit during the last 60 seconds. The original veteran strategy uses loot weight 1 and risk weight 10.",
      "\u6309\u6536\u76CA\u4E0E\u98CE\u9669\u52A0\u6743\u8BC4\u5206\u9009\u62E9\uFF1B\u672A\u542F\u7528\u201C\u7ACB\u5373\u201D\u65F6\uFF0C\u5728\u51B3\u7B56\u622A\u6B62\u524D 60 \u79D2\u5185\u63D0\u4EA4\u3002\u8001\u5175\u7279\u6B8A\u7B56\u7565\u6CBF\u7528\u539F\u7248\uFF1A\u6536\u76CA\u6743\u91CD 1\u3001\u98CE\u9669\u6743\u91CD 10\u3002"
    ],
    [
      "Choose this option",
      "\u9009\u62E9\u6B64\u9879"
    ],
    [
      "No pending decisions.",
      "\u6CA1\u6709\u5F85\u5904\u7406\u7684\u51B3\u7B56\u3002"
    ],
    [
      "No pending decisions",
      "\u65E0\u5F85\u5904\u7406"
    ],
    [
      "No active expedition.",
      "\u5F53\u524D\u6CA1\u6709\u8FDC\u5F81\u3002"
    ],
    [
      "No archived expedition data yet.",
      "\u5C1A\u65E0\u5386\u53F2\u8FDC\u5F81\u6570\u636E\u3002"
    ],
    [
      "No cached data yet. Enable the Expedition module.",
      "\u5C1A\u65E0\u7F13\u5B58\uFF0C\u8BF7\u542F\u7528\u8FDC\u5F81\u6A21\u5757\u3002"
    ],
    [
      "Server state has not been read yet",
      "\u5C1A\u672A\u8BFB\u53D6\u670D\u52A1\u5668\u72B6\u6001"
    ],
    [
      "Process this expedition's rewards",
      "\u5904\u7406\u672C\u8F6E\u5956\u52B1"
    ],
    [
      "Refresh expedition information",
      "\u5237\u65B0\u8FDC\u5F81\u4FE1\u606F"
    ],
    [
      "Refresh mercenaries and costs",
      "\u5237\u65B0\u4F63\u5175\u4E0E\u8D39\u7528"
    ],
    [
      "Refresh inventory",
      "\u5237\u65B0\u4ED3\u5E93"
    ],
    [
      "Refresh archived expeditions",
      "\u5237\u65B0\u5386\u53F2\u8FDC\u5F81"
    ],
    [
      "Pin expedition timer",
      "\u56FA\u5B9A\u8FDC\u5F81\u5012\u8BA1\u65F6"
    ],
    [
      "Copy expedition logs",
      "\u590D\u5236\u8FDC\u5F81\u65E5\u5FD7"
    ],
    [
      "Keep the latest 200 entries \xB7 Local time \xB7 Logging continues while collapsed",
      "\u4FDD\u7559\u6700\u8FD1 200 \u6761 \xB7 \u672C\u5730\u65F6\u95F4 \xB7 \u6536\u8D77\u754C\u9762\u540E\u7EE7\u7EED\u8BB0\u5F55"
    ],
    [
      "Waiting for game activity. Refresh the game tab after updating the extension.",
      "\u7B49\u5F85\u6E38\u620F\u6D3B\u52A8\u3002\u66F4\u65B0\u6269\u5C55\u540E\u8BF7\u5237\u65B0\u6E38\u620F\u6807\u7B7E\u9875\u3002"
    ],
    [
      "The original extension does not implement direct drone assembly. This panel shows stored drone materials; submit assembly stages in the game.",
      "\u539F\u7248\u5C1A\u672A\u5B9E\u73B0\u76F4\u63A5\u7EC4\u88C5\u64CD\u4F5C\u3002\u8FD9\u91CC\u663E\u793A\u4ED3\u5E93\u4E2D\u7684\u65E0\u4EBA\u673A\u6750\u6599\uFF1B\u5B9E\u9645\u9636\u6BB5\u4EA4\u4ED8\u4ECD\u5728\u6E38\u620F\u5185\u8FDB\u884C\u3002"
    ],
    [
      "Drone material",
      "\u65E0\u4EBA\u673A\u6750\u6599"
    ],
    [
      "Quantity owned",
      "\u6301\u6709\u6570\u91CF"
    ],
    [
      "Mercenary",
      "\u4F63\u5175"
    ],
    [
      "Total cost",
      "\u603B\u8D39\u7528"
    ],
    [
      "Insurance",
      "\u4FDD\u9669"
    ],
    [
      "Risk score",
      "\u98CE\u9669\u8BC4\u5206"
    ],
    [
      "Actual cost",
      "\u5B9E\u9645\u8D39\u7528"
    ],
    [
      "Container opening cost",
      "\u5BB9\u5668\u5F00\u542F\u8D39\u7528"
    ],
    [
      "Decision time remaining",
      "\u51B3\u7B56\u5269\u4F59\u65F6\u95F4"
    ],
    [
      "Risk / Loot",
      "\u98CE\u9669 / \u6536\u76CA"
    ],
    [
      "Rank / Completed missions",
      "\u7B49\u7EA7 / \u5B8C\u6210\u4EFB\u52A1"
    ],
    [
      "Failure survival / Death chance",
      "\u5931\u8D25\u5B58\u6D3B / \u9635\u4EA1\u6982\u7387"
    ],
    [
      "Faction",
      "\u9635\u8425"
    ],
    [
      "Specialization",
      "\u4E13\u957F"
    ],
    [
      "Trait",
      "\u7279\u8D28"
    ],
    [
      "Required reputation",
      "\u6240\u9700\u58F0\u671B"
    ],
    [
      "Cost unknown; automated dispatch does not use unverified prices.",
      "\u8D39\u7528\u5C1A\u672A\u786E\u8BA4\uFF1B\u81EA\u52A8\u6D3E\u9063\u4E0D\u4F1A\u4F7F\u7528\u672A\u77E5\u8D39\u7528\u3002"
    ],
    [
      "Rarity",
      "\u54C1\u8D28"
    ],
    [
      "Sellable",
      "\u53EF\u51FA\u552E"
    ],
    [
      "Unit price",
      "\u5355\u4EF7"
    ],
    [
      "Craftable",
      "\u53EF\u7528\u4E8E\u5236\u4F5C"
    ],
    [
      "Usable",
      "\u53EF\u4F7F\u7528"
    ],
    [
      "Sell 1 manually",
      "\u624B\u52A8\u51FA\u552E 1 \u4EF6"
    ],
    [
      "Click again to confirm sale",
      "\u518D\u6B21\u70B9\u51FB\u786E\u8BA4\u51FA\u552E"
    ],
    [
      "Temporary stash expansion",
      "\u4E34\u65F6\u4ED3\u5E93\u6269\u5BB9"
    ],
    [
      "The rental has ended. Check the game's grace period and item-loss notice.",
      "\u79DF\u671F\u5DF2\u7ED3\u675F\uFF0C\u8BF7\u7559\u610F\u6E38\u620F\u5185\u7684\u5BBD\u9650\u671F\u4E0E\u7269\u54C1\u635F\u5931\u63D0\u793A\u3002"
    ],
    [
      "Completed at",
      "\u5B8C\u6210\u65F6\u95F4"
    ],
    [
      "Cost / Risk",
      "\u8D39\u7528 / \u98CE\u9669"
    ],
    [
      "Time unknown",
      "\u65F6\u95F4\u672A\u77E5"
    ],
    [
      "Waiting for a state refresh",
      "\u7B49\u5F85\u72B6\u6001\u5237\u65B0"
    ],
    [
      "In progress",
      "\u8FDB\u884C\u4E2D"
    ],
    [
      "Awaiting decision",
      "\u7B49\u5F85\u51B3\u7B56"
    ],
    [
      "Ended",
      "\u5DF2\u7ED3\u675F"
    ],
    [
      "Resting",
      "\u4F11\u606F\u4E2D"
    ],
    [
      "Contracted",
      "\u6267\u884C\u4E2D"
    ],
    [
      "Veteran",
      "\u8001\u5175"
    ],
    [
      "Recruit",
      "\u65B0\u5175"
    ],
    [
      "Experienced",
      "\u719F\u7EC3"
    ],
    [
      "Full success",
      "\u5B8C\u5168\u6210\u529F"
    ],
    [
      "Partial success",
      "\u90E8\u5206\u6210\u529F"
    ],
    [
      "Dead",
      "\u9635\u4EA1"
    ],
    [
      "Common",
      "\u666E\u901A"
    ],
    [
      "Uncommon",
      "\u4F18\u79C0"
    ],
    [
      "Rare",
      "\u7A00\u6709"
    ],
    [
      "Epic",
      "\u53F2\u8BD7"
    ],
    [
      "Legendary",
      "\u4F20\u5947"
    ],
    [
      "Quest",
      "\u4EFB\u52A1"
    ],
    [
      "No insurance",
      "\u65E0"
    ],
    [
      "Insured",
      "\u6709"
    ],
    [
      "Unknown mercenary",
      "\u672A\u77E5\u4F63\u5175"
    ],
    [
      "Unknown item",
      "\u672A\u77E5\u7269\u54C1"
    ],
    [
      "Unknown location",
      "\u5730\u70B9\u672A\u77E5"
    ],
    [
      "Unknown zone",
      "\u533A\u57DF\u672A\u77E5"
    ],
    [
      "Mercenary unknown",
      "\u4F63\u5175\u672A\u77E5"
    ],
    [
      "Auto-claim is off",
      "\u81EA\u52A8\u9886\u53D6\u5DF2\u5173\u95ED"
    ],
    [
      "Waiting to check inventory",
      "\u7B49\u5F85\u68C0\u67E5\u4ED3\u5E93"
    ],
    [
      "Waiting to check expedition mail",
      "\u7B49\u5F85\u68C0\u67E5\u8FDC\u5F81\u5956\u52B1\u90AE\u4EF6"
    ],
    [
      "Waiting for the first check",
      "\u7B49\u5F85\u9996\u6B21\u68C0\u67E5"
    ],
    [
      "Creating the 30-minute check schedule",
      "\u6B63\u5728\u5EFA\u7ACB 30 \u5206\u949F\u68C0\u67E5\u8BA1\u5212"
    ],
    [
      "30-minute checks are off",
      "30 \u5206\u949F\u68C0\u67E5\u672A\u5F00\u542F"
    ],
    [
      "Scheduled checks paused (settings retained)",
      "\u5B9A\u65F6\u68C0\u67E5\u5DF2\u6682\u505C\uFF08\u8BBE\u7F6E\u5DF2\u4FDD\u7559\uFF09"
    ],
    [
      "Paused \xB7 Enable the master switch to resume saved Expedition settings",
      "\u5DF2\u6682\u505C \xB7 \u5F00\u542F\u603B\u5F00\u5173\u540E\u6062\u590D\u5DF2\u4FDD\u5B58\u7684\u8FDC\u5F81\u8BBE\u7F6E"
    ],
    [
      "Paused \xB7 Helper-Only Mode is disabling automation",
      "\u5DF2\u6682\u505C \xB7 Helper-Only \u6A21\u5F0F\u6B63\u5728\u7981\u7528\u81EA\u52A8\u64CD\u4F5C"
    ],
    [
      "Waiting for game data \xB7 Runs according to enabled settings",
      "\u7B49\u5F85\u6E38\u620F\u6570\u636E \xB7 \u5F00\u542F\u5B50\u529F\u80FD\u540E\u6309\u8BBE\u7F6E\u8FD0\u884C"
    ],
    [
      "Expedition module paused",
      "\u8FDC\u5F81\u6A21\u5757\u5DF2\u6682\u505C"
    ],
    [
      "Expedition module paused; sale mode retained",
      "\u8FDC\u5F81\u6A21\u5757\u5DF2\u6682\u505C\uFF0C\u51FA\u552E\u6A21\u5F0F\u5DF2\u4FDD\u7559"
    ],
    [
      "Expedition module paused; mail settings retained",
      "\u8FDC\u5F81\u6A21\u5757\u5DF2\u6682\u505C\uFF0C\u90AE\u4EF6\u8BBE\u7F6E\u5DF2\u4FDD\u7559"
    ],
    [
      "Open the cor3.gg game tab first",
      "\u8BF7\u5148\u6253\u5F00 cor3.gg \u6E38\u620F\u6807\u7B7E\u9875"
    ],
    [
      "Request sent; check the logs",
      "\u8BF7\u6C42\u5DF2\u53D1\u9001\uFF0C\u8BF7\u67E5\u770B\u65E5\u5FD7"
    ],
    [
      "COR3 Helper \u2014 Log Viewer",
      "COR3 Helper \u2014 \u65E5\u5FD7\u67E5\u770B\u5668"
    ],
    [
      "WS Messages",
      "WebSocket \u6D88\u606F"
    ],
    [
      "Auto Job Solver Logs",
      "\u81EA\u52A8\u4EFB\u52A1\u65E5\u5FD7"
    ],
    [
      "Auto Valuable Seller Logs",
      "\u8D35\u91CD\u6587\u4EF6\u51FA\u552E\u65E5\u5FD7"
    ],
    [
      "Error Logs",
      "\u9519\u8BEF\u65E5\u5FD7"
    ],
    [
      "Page Console Logs",
      "\u9875\u9762\u63A7\u5236\u53F0\u65E5\u5FD7"
    ],
    [
      "Extension Console Logs",
      "\u6269\u5C55\u63A7\u5236\u53F0\u65E5\u5FD7"
    ],
    [
      "Log category",
      "\u65E5\u5FD7\u7C7B\u522B"
    ],
    [
      "Log section",
      "\u65E5\u5FD7\u533A\u95F4"
    ],
    [
      "Display format",
      "\u663E\u793A\u683C\u5F0F"
    ],
    [
      "Raw",
      "\u539F\u59CB\u5185\u5BB9"
    ],
    [
      "JSON-pretty",
      "JSON \u683C\u5F0F\u5316"
    ],
    [
      "Tree View",
      "\u6811\u72B6\u89C6\u56FE"
    ],
    [
      "Time",
      "\u65F6\u95F4"
    ],
    [
      "Level",
      "\u7B49\u7EA7"
    ],
    [
      "Message",
      "\u6D88\u606F"
    ],
    [
      "Message Detail",
      "\u6D88\u606F\u8BE6\u60C5"
    ],
    [
      "Preview",
      "\u9884\u89C8"
    ],
    [
      "Size",
      "\u5927\u5C0F"
    ],
    [
      "Event",
      "\u4E8B\u4EF6"
    ],
    [
      "Action",
      "\u64CD\u4F5C"
    ],
    [
      "Dir",
      "\u65B9\u5411"
    ],
    [
      "Sent",
      "\u5DF2\u53D1\u9001"
    ],
    [
      "Received",
      "\u5DF2\u63A5\u6536"
    ],
    [
      "Body",
      "\u6B63\u6587"
    ],
    [
      "Toggle live auto-refresh",
      "\u5207\u6362\u5B9E\u65F6\u81EA\u52A8\u5237\u65B0"
    ],
    [
      "Toggle send panel",
      "\u663E\u793A / \u9690\u85CF\u53D1\u9001\u9762\u677F"
    ],
    [
      "Live",
      "\u5B9E\u65F6"
    ],
    [
      "Live ON",
      "\u5B9E\u65F6\u5DF2\u5F00\u542F"
    ],
    [
      "Refresh current page messages",
      "\u5237\u65B0\u5F53\u524D\u9875\u6D88\u606F"
    ],
    [
      "Clear all messages",
      "\u6E05\u7A7A\u5168\u90E8\u6D88\u606F"
    ],
    [
      "Clear",
      "\u6E05\u7A7A"
    ],
    [
      "Send",
      "\u53D1\u9001"
    ],
    [
      "Export",
      "\u5BFC\u51FA"
    ],
    [
      "Export filtered messages",
      "\u5BFC\u51FA\u7B5B\u9009\u540E\u7684\u6D88\u606F"
    ],
    [
      "Export as JSON",
      "\u5BFC\u51FA\u4E3A JSON"
    ],
    [
      "Export as MD Table",
      "\u5BFC\u51FA\u4E3A Markdown \u8868\u683C"
    ],
    [
      "Open external log viewer on new window",
      "\u5728\u65B0\u7A97\u53E3\u6253\u5F00\u79BB\u7EBF\u65E5\u5FD7\u67E5\u770B\u5668"
    ],
    [
      "Import",
      "\u5BFC\u5165"
    ],
    [
      "Import log file (JSON, MD, or Discord clipboard format)",
      "\u5BFC\u5165\u65E5\u5FD7\u6587\u4EF6\uFF08JSON\u3001Markdown \u6216 Discord \u526A\u8D34\u677F\u683C\u5F0F\uFF09"
    ],
    [
      'Click "\u{1F4C2} Import" to load an exported log file.',
      "\u70B9\u51FB\u201C\u{1F4C2} \u5BFC\u5165\u201D\u52A0\u8F7D\u5DF2\u5BFC\u51FA\u7684\u65E5\u5FD7\u6587\u4EF6\u3002"
    ],
    [
      "No WebSocket messages yet.",
      "\u6682\u65E0 WebSocket \u6D88\u606F\u3002"
    ],
    [
      "No logs loaded.",
      "\u5C1A\u672A\u52A0\u8F7D\u65E5\u5FD7\u3002"
    ],
    [
      'Enable "Live" for real-time updates',
      "\u5F00\u542F\u201C\u5B9E\u65F6\u201D\u4EE5\u63A5\u6536\u5B9E\u65F6\u66F4\u65B0"
    ],
    [
      "or select a log section to browse history.",
      "\u6216\u9009\u62E9\u65E5\u5FD7\u533A\u95F4\u6D4F\u89C8\u5386\u53F2\u8BB0\u5F55\u3002"
    ],
    [
      "Could not parse the imported file. Supported formats: JSON (Export or Copy-All-Logs), MD table, Discord clipboard format.",
      "\u65E0\u6CD5\u89E3\u6790\u5BFC\u5165\u6587\u4EF6\u3002\u652F\u6301 JSON\uFF08\u5BFC\u51FA\u6216\u590D\u5236\u5168\u90E8\u65E5\u5FD7\uFF09\u3001Markdown \u8868\u683C\u4EE5\u53CA Discord \u526A\u8D34\u677F\u683C\u5F0F\u3002"
    ],
    [
      "Error reading file",
      "\u8BFB\u53D6\u6587\u4EF6\u5931\u8D25"
    ],
    [
      "Failed to send",
      "\u53D1\u9001\u5931\u8D25"
    ],
    [
      "Error",
      "\u9519\u8BEF"
    ],
    [
      "Updated",
      "\u5DF2\u66F4\u65B0"
    ],
    [
      "Extension was reloaded",
      "\u6269\u5C55\u5DF2\u91CD\u8F7D"
    ],
    [
      "Target",
      "\u76EE\u6807"
    ],
    [
      "Other",
      "\u5176\u4ED6"
    ],
    [
      "Market",
      "\u5E02\u573A"
    ],
    [
      "Refresh error",
      "\u5237\u65B0\u5931\u8D25"
    ],
    [
      "Filter by event or content...",
      "\u6309\u4E8B\u4EF6\u6216\u5185\u5BB9\u7B5B\u9009\u2026"
    ],
    [
      "Find next (Enter)",
      "\u67E5\u627E\u4E0B\u4E00\u4E2A\uFF08\u56DE\u8F66\uFF09"
    ],
    [
      "Off (setting)",
      "\u5173"
    ],
    [
      "Expedition settings",
      "\u8FDC\u5F81\u8BBE\u7F6E"
    ],
    [
      "Dispatch after completion",
      "\u7ED3\u675F\u540E\u6D3E\u9063"
    ],
    [
      "30-minute dispatch",
      "30 \u5206\u949F\u6D3E\u9063"
    ],
    [
      "Auto claim mail",
      "\u81EA\u52A8\u9886\u53D6\u90AE\u4EF6"
    ],
    [
      "Sale mode",
      "\u51FA\u552E\u6A21\u5F0F"
    ],
    [
      "Helper mode",
      "\u8F85\u52A9\u6A21\u5F0F"
    ],
    [
      "Now",
      "\u73B0\u5728"
    ],
    [
      "Queued",
      "\u6392\u961F\u4E2D"
    ],
    [
      "In maintenance",
      "\u7EF4\u62A4\u4E2D"
    ],
    [
      "Upcoming",
      "\u5373\u5C06\u7EF4\u62A4"
    ],
    [
      "Warning",
      "\u8B66\u544A"
    ],
    [
      "Debug",
      "\u8C03\u8BD5"
    ],
    [
      "Info",
      "\u4FE1\u606F"
    ],
    [
      "Open",
      "\u5F00\u653E"
    ],
    [
      "Taken",
      "\u5DF2\u63A5\u53D7"
    ],
    [
      "Pending",
      "\u5F85\u5904\u7406"
    ],
    [
      "Skipped",
      "\u5DF2\u8DF3\u8FC7"
    ],
    [
      "Aborted",
      "\u5DF2\u4E2D\u6B62"
    ],
    [
      "Done",
      "\u5DF2\u5B8C\u6210"
    ],
    [
      "Very hard",
      "\u6781\u96BE"
    ],
    [
      "Impossible",
      "\u4E0D\u53EF\u80FD"
    ],
    [
      "Failure",
      "\u5931\u8D25"
    ],
    [
      "Death",
      "\u9635\u4EA1"
    ],
    [
      "Performance",
      "\u6027\u80FD"
    ],
    [
      "Response",
      "\u54CD\u5E94"
    ],
    [
      "Source",
      "\u6765\u6E90"
    ],
    [
      "Ready",
      "\u5C31\u7EEA"
    ],
    [
      "Min",
      "\u6700\u5C0F\u503C"
    ],
    [
      "Max",
      "\u6700\u5927\u503C"
    ],
    [
      "Expired access token",
      "\u8BBF\u95EE\u4EE4\u724C\u5DF2\u8FC7\u671F"
    ],
    [
      "Refresh failed",
      "\u5237\u65B0\u5931\u8D25"
    ],
    [
      "No pending expedition reward mail found",
      "\u672A\u53D1\u73B0\u672A\u9886\u53D6\u7684\u8FDC\u5F81\u5956\u52B1\u90AE\u4EF6"
    ],
    [
      "Waiting for initial game refresh",
      "\u7B49\u5F85\u6E38\u620F\u521D\u59CB\u5237\u65B0\u5B8C\u6210"
    ],
    [
      "Waiting for retry cooldown",
      "\u7B49\u5F85\u91CD\u8BD5\u51B7\u5374"
    ],
    [
      "Checking stash using the selected sale mode",
      "\u6B63\u5728\u6309\u51FA\u552E\u6A21\u5F0F\u68C0\u67E5\u4ED3\u5E93"
    ],
    [
      "Expedition operation failed",
      "\u8FDC\u5F81\u64CD\u4F5C\u5931\u8D25"
    ],
    [
      "Expedition task is running; please retry later",
      "\u8FDC\u5F81\u4EFB\u52A1\u6B63\u5728\u6267\u884C\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5"
    ],
    [
      "Unsupported expedition operation",
      "\u4E0D\u652F\u6301\u7684\u8FDC\u5F81\u64CD\u4F5C"
    ],
    [
      "Stash renewal is a manual action only",
      "\u4ED3\u5E93\u7EED\u79DF\u4EC5\u5141\u8BB8\u624B\u52A8\u64CD\u4F5C"
    ],
    [
      "Expedition check requested; see the summary and logs",
      "\u5DF2\u8BF7\u6C42\u8FDC\u5F81\u68C0\u67E5\uFF0C\u8BF7\u67E5\u770B\u8FD0\u884C\u6458\u8981\u4E0E\u65E5\u5FD7"
    ],
    [
      "Extension reloaded; refresh the game",
      "\u6269\u5C55\u5DF2\u91CD\u8F7D\uFF0C\u8BF7\u5237\u65B0\u6E38\u620F"
    ],
    [
      "Expedition operation queued; please retry later",
      "\u8FDC\u5F81\u64CD\u4F5C\u5DF2\u6392\u961F\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5"
    ],
    [
      "Expedition check queued; waiting for the current task",
      "\u8FDC\u5F81\u68C0\u67E5\u5DF2\u6392\u961F\uFF0C\u7B49\u5F85\u5F53\u524D\u4EFB\u52A1\u5B8C\u6210"
    ],
    [
      "Merged into the pending expedition check",
      "\u5DF2\u5408\u5E76\u5230\u7B49\u5F85\u4E2D\u7684\u8FDC\u5F81\u68C0\u67E5"
    ],
    [
      "Expedition workflow is running; check the logs shortly",
      "\u8FDC\u5F81\u6D41\u7A0B\u6B63\u5728\u6267\u884C\uFF0C\u8BF7\u7A0D\u540E\u68C0\u67E5\u65E5\u5FD7"
    ],
    [
      "Expedition module paused or game disconnected",
      "\u8FDC\u5F81\u6A21\u5757\u5DF2\u6682\u505C\u6216\u6E38\u620F\u8FDE\u63A5\u5DF2\u65AD\u5F00"
    ],
    [
      "Expedition module disabled or game disconnected",
      "\u8FDC\u5F81\u6A21\u5757\u672A\u542F\u7528\u6216\u6E38\u620F\u8FDE\u63A5\u5DF2\u65AD\u5F00"
    ],
    [
      "Module or settings changed",
      "\u8FDC\u5F81\u6A21\u5757\u6216\u8BBE\u7F6E\u5DF2\u66F4\u6539"
    ],
    [
      "Module paused; this operation was canceled",
      "\u8FDC\u5F81\u6A21\u5757\u5DF2\u6682\u505C\uFF0C\u672C\u8F6E\u64CD\u4F5C\u5DF2\u53D6\u6D88"
    ],
    [
      "Dispatch parameters are incomplete",
      "\u6D3E\u9063\u53C2\u6570\u4E0D\u5B8C\u6574"
    ],
    [
      "Expedition location configuration is incomplete",
      "\u8FDC\u5F81\u5730\u70B9\u914D\u7F6E\u4E0D\u5B8C\u6574"
    ],
    [
      "Missing expedition ID",
      "\u7F3A\u5C11\u8FDC\u5F81\u7F16\u53F7"
    ],
    [
      "Unknown mercenary market",
      "\u672A\u77E5\u4F63\u5175\u5E02\u573A"
    ],
    [
      "Mercenary refresh timed out; old cached data was not used",
      "\u4F63\u5175\u5237\u65B0\u8D85\u65F6\uFF0C\u672A\u4F7F\u7528\u65E7\u7F13\u5B58"
    ],
    [
      "Mercenary refresh did not return complete fresh data",
      "\u4F63\u5175\u5237\u65B0\u672A\u8FD4\u56DE\u672C\u8F6E\u5B8C\u6574\u6570\u636E"
    ],
    [
      "Mercenary settings changed; refresh canceled",
      "\u8FDC\u5F81\u8BBE\u7F6E\u5DF2\u66F4\u6539\uFF0C\u4F63\u5175\u5237\u65B0\u5DF2\u53D6\u6D88"
    ],
    [
      "Could not confirm the mercenary's latest cost",
      "\u65E0\u6CD5\u786E\u8BA4\u4F63\u5175\u6700\u65B0\u8D39\u7528"
    ],
    [
      "Latest cost exceeds the limit; dispatch stopped",
      "\u6700\u65B0\u8D39\u7528\u8D85\u8FC7\u4E0A\u9650\uFF0C\u672A\u6D3E\u9063"
    ],
    [
      "USOL route is under maintenance or unreachable",
      "USOL \u8DEF\u5F84\u5904\u4E8E\u7EF4\u62A4\u6216\u4E0D\u53EF\u8FBE"
    ],
    [
      "CORE mercenary-cost response timed out; refresh stopped",
      "CORE \u4F63\u5175\u8D39\u7528\u54CD\u5E94\u8D85\u65F6\uFF0C\u5DF2\u505C\u6B62\u672C\u8F6E\u5237\u65B0"
    ],
    [
      "USOL mercenary-cost response timed out; refresh stopped",
      "USOL \u4F63\u5175\u8D39\u7528\u54CD\u5E94\u8D85\u65F6\uFF0C\u5DF2\u505C\u6B62\u672C\u8F6E\u5237\u65B0"
    ],
    [
      "An expedition exists or its state is unconfirmed; dispatch stopped",
      "\u5DF2\u6709\u8FDC\u5F81\u6216\u72B6\u6001\u65E0\u6CD5\u786E\u8BA4\uFF0C\u672A\u6D3E\u9063"
    ],
    [
      "Unrecognized expedition state; operations stopped",
      "\u8FDC\u5F81\u72B6\u6001\u683C\u5F0F\u65E0\u6CD5\u8BC6\u522B\uFF0C\u5DF2\u505C\u6B62\u64CD\u4F5C"
    ],
    [
      "No valid stash data received",
      "\u672A\u83B7\u5F97\u6709\u6548\u4ED3\u5E93\u6570\u636E"
    ],
    [
      "Stash capacity unknown; cannot calculate how much to sell",
      "\u4ED3\u5E93\u5BB9\u91CF\u672A\u77E5\uFF0C\u65E0\u6CD5\u5224\u65AD\u9700\u8981\u51FA\u552E\u591A\u5C11\u7269\u54C1"
    ],
    [
      "Item does not meet the current sale policy",
      "\u8BE5\u7269\u54C1\u4E0D\u7B26\u5408\u5F53\u524D\u51FA\u552E\u7B56\u7565"
    ],
    [
      "Invalid post-sale quantity",
      "\u51FA\u552E\u540E\u6570\u91CF\u683C\u5F0F\u65E0\u6548"
    ],
    [
      "Sale response has no inventory; result is unconfirmed",
      "\u51FA\u552E\u54CD\u5E94\u7F3A\u5C11\u5E93\u5B58\uFF0C\u7ED3\u679C\u672A\u77E5"
    ],
    [
      "Server has not confirmed the whole stack was sold",
      "\u670D\u52A1\u5668\u5C1A\u672A\u786E\u8BA4\u6574\u7EC4\u7269\u54C1\u5DF2\u552E\u51FA"
    ],
    [
      "Some sale results remain unconfirmed; check after cooldown",
      "\u90E8\u5206\u51FA\u552E\u7ED3\u679C\u5C1A\u5F85\u786E\u8BA4\uFF0C\u51B7\u5374\u7ED3\u675F\u540E\u518D\u68C0\u67E5"
    ],
    [
      "Server response timed out; result is unconfirmed",
      "\u670D\u52A1\u5668\u54CD\u5E94\u8D85\u65F6\uFF0C\u7ED3\u679C\u5F85\u786E\u8BA4"
    ],
    [
      "Server rejected the operation",
      "\u670D\u52A1\u5668\u62D2\u7EDD\u64CD\u4F5C"
    ],
    [
      "Game session expired; waiting to reconnect",
      "\u6E38\u620F\u4F1A\u8BDD\u5DF2\u8FC7\u671F\uFF0C\u7B49\u5F85\u91CD\u65B0\u8FDE\u63A5"
    ],
    [
      "Game response timed out; refresh the game and check again",
      "\u6E38\u620F\u54CD\u5E94\u8D85\u65F6\uFF0C\u8BF7\u5237\u65B0\u6E38\u620F\u540E\u68C0\u67E5"
    ],
    [
      "Automatic dispatch is off",
      "\u81EA\u52A8\u6D3E\u9063\u5DF2\u5173\u95ED"
    ],
    [
      "Automatic dispatch is paused",
      "\u81EA\u52A8\u6D3E\u9063\u5DF2\u6682\u505C"
    ],
    [
      "Auto claim is off or this is not a confirmed expedition reward message",
      "\u81EA\u52A8\u9886\u53D6\u672A\u5F00\u542F\u6216\u672A\u786E\u8BA4\u662F\u8FDC\u5F81\u5956\u52B1\u90AE\u4EF6"
    ],
    [
      "Sale mode changed; this batch stopped and will be checked using the new mode",
      "\u51FA\u552E\u6A21\u5F0F\u5DF2\u66F4\u6539\uFF0C\u672C\u6279\u64CD\u4F5C\u505C\u6B62\uFF1B\u5C06\u6309\u65B0\u6A21\u5F0F\u91CD\u65B0\u68C0\u67E5"
    ],
    [
      "Not enough non-drone loot to free the required space; drone materials were kept",
      "\u975E\u65E0\u4EBA\u673A\u8FDC\u5F81\u6389\u843D\u4E0D\u8DB3\u4EE5\u817E\u51FA\u6240\u9700\u7A7A\u95F4\uFF1B\u5DF2\u4FDD\u7559\u65E0\u4EBA\u673A\u6750\u6599"
    ],
    [
      "Sale batch limit reached; waiting for the next check",
      "\u672C\u6279\u51FA\u552E\u8FBE\u5230\u64CD\u4F5C\u4E0A\u9650\uFF0C\u7B49\u5F85\u4E0B\u4E00\u6B21\u68C0\u67E5"
    ],
    [
      "Previous mail claim is unconfirmed; retry later",
      "\u4E0A\u6B21\u90AE\u4EF6\u9886\u53D6\u7ED3\u679C\u5F85\u786E\u8BA4\uFF0C\u7A0D\u540E\u91CD\u8BD5"
    ],
    [
      "Unrecognized mailbox data",
      "\u90AE\u7BB1\u6570\u636E\u683C\u5F0F\u65E0\u6CD5\u8BC6\u522B"
    ],
    [
      "Auto claim turned off; this check stopped",
      "\u81EA\u52A8\u9886\u53D6\u5DF2\u5173\u95ED\uFF0C\u672C\u8F6E\u505C\u6B62"
    ],
    [
      "Mail claim response does not match the attachment; further actions stopped",
      "\u90AE\u4EF6\u9886\u53D6\u54CD\u5E94\u65E0\u6CD5\u5BF9\u5E94\u5F53\u524D\u9644\u4EF6\uFF0C\u5DF2\u505C\u6B62\u540E\u7EED\u64CD\u4F5C"
    ],
    [
      "Not enough stash space to claim all rewards; sale mode is off",
      "\u4ED3\u5E93\u7A7A\u95F4\u4E0D\u8DB3\uFF0C\u5956\u52B1\u5C1A\u672A\u5168\u90E8\u9886\u53D6\uFF1B\u51FA\u552E\u6A21\u5F0F\u4E3A\u5173\u95ED"
    ],
    [
      "Reward claim rejected due to space; freeing space before re-reading mail",
      "\u5956\u52B1\u9886\u53D6\u56E0\u7A7A\u95F4\u4E0D\u8DB3\u88AB\u62D2\u7EDD\uFF1B\u5148\u817E\u51FA\u6240\u9700\u7A7A\u95F4\uFF0C\u518D\u91CD\u65B0\u8BFB\u53D6\u90AE\u7BB1"
    ],
    [
      "Mailbox refresh failed",
      "\u5237\u65B0\u90AE\u7BB1\u5931\u8D25"
    ],
    [
      "Rewards still unconfirmed after freeing space; this check stopped",
      "\u817E\u51FA\u7A7A\u95F4\u540E\u4ECD\u672A\u786E\u8BA4\u5168\u90E8\u5956\u52B1\u9886\u53D6\uFF0C\u672C\u8F6E\u505C\u6B62"
    ],
    [
      "Unknown mail claim result; this check stopped",
      "\u90AE\u4EF6\u8FD4\u56DE\u672A\u77E5\u9886\u53D6\u7ED3\u679C\uFF0C\u672C\u8F6E\u505C\u6B62"
    ],
    [
      "Could not verify mailbox state",
      "\u65E0\u6CD5\u590D\u6838\u90AE\u7BB1\u72B6\u6001"
    ],
    [
      "Mailbox still contains pending attachments; dispatch stopped",
      "\u90AE\u7BB1\u4ECD\u6709\u5F85\u9886\u53D6\u9644\u4EF6\uFF0C\u5DF2\u505C\u6B62\u6D3E\u9063"
    ],
    [
      "Checking expedition reward mail",
      "\u6B63\u5728\u68C0\u67E5\u8FDC\u5F81\u5956\u52B1\u90AE\u4EF6"
    ],
    [
      "Processing the completed expedition",
      "\u6B63\u5728\u5904\u7406\u5DF2\u7ED3\u675F\u8FDC\u5F81"
    ],
    [
      "Failed expedition includes insurance compensation; handle it in the game before closing",
      "\u5931\u8D25\u8FDC\u5F81\u542B\u4FDD\u9669\u8D54\u4ED8\uFF0C\u8BF7\u5148\u5728\u6E38\u620F\u4E2D\u5904\u7406\uFF1B\u672A\u81EA\u52A8\u5173\u95ED\u4EE5\u514D\u635F\u5931\u5956\u52B1"
    ],
    [
      "Reward container response mismatch",
      "\u5956\u52B1\u5BB9\u5668\u54CD\u5E94\u4E0D\u5339\u914D"
    ],
    [
      "Not enough stash space; claiming and dispatch paused",
      "\u4ED3\u5E93\u7A7A\u95F4\u4E0D\u8DB3\uFF0C\u6682\u505C\u9886\u53D6\u4E0E\u6D3E\u9063"
    ],
    [
      "Previous expedition is not archived yet; dispatch paused until the next refresh",
      "\u4E0A\u8F6E\u8FDC\u5F81\u5C1A\u672A\u5B8C\u6210\u5F52\u6863\uFF0C\u6682\u505C\u6D3E\u9063\uFF1B\u4E0B\u6B21\u5237\u65B0\u590D\u6838"
    ],
    [
      "Check complete",
      "\u672C\u8F6E\u68C0\u67E5\u5B8C\u6210"
    ],
    [
      "Expedition data refreshed",
      "\u8FDC\u5F81\u4FE1\u606F\u5DF2\u5237\u65B0"
    ],
    [
      "An expedition is running or awaits processing; no duplicate dispatch",
      "\u5DF2\u6709\u8FDC\u5F81\u8FDB\u884C\u4E2D\u6216\u7B49\u5F85\u5904\u7406\uFF0C\u672C\u8F6E\u4E0D\u91CD\u590D\u6D3E\u9063"
    ],
    [
      "No confirmed free stash slot; dispatch paused",
      "\u4ED3\u5E93\u6CA1\u6709\u53EF\u786E\u8BA4\u7684\u7A7A\u4F4D\uFF0C\u6682\u505C\u6D3E\u9063"
    ],
    [
      "No available mercenary meets the cost and filter rules; waiting for the next check",
      "\u6682\u65E0\u7B26\u5408\u8D39\u7528\u4E0E\u7B5B\u9009\u6761\u4EF6\u7684\u53EF\u7528\u4F63\u5175\uFF0C\u7B49\u5F85\u4E0B\u6B21\u68C0\u67E5"
    ],
    [
      "New expedition detected; duplicate dispatch canceled",
      "\u68C0\u6D4B\u5230\u65B0\u8FDC\u5F81\uFF0C\u53D6\u6D88\u91CD\u590D\u6D3E\u9063"
    ],
    [
      "Mercenary filters changed; this check stopped",
      "\u4F63\u5175\u7B5B\u9009\u6761\u4EF6\u5DF2\u66F4\u6539\uFF0C\u672C\u8F6E\u505C\u6B62"
    ],
    [
      "Dispatch response does not match the selected mercenary; result is unconfirmed",
      "\u6D3E\u9063\u54CD\u5E94\u65E0\u6CD5\u5BF9\u5E94\u6240\u9009\u4F63\u5175\uFF0C\u7ED3\u679C\u5F85\u786E\u8BA4"
    ],
    [
      "Dispatch confirmed",
      "\u6D3E\u9063\u5DF2\u786E\u8BA4"
    ],
    [
      "Sale completed",
      "\u51FA\u552E\u5B8C\u6210"
    ],
    [
      'Enter WS message, e.g. 42["desktop",{"action":"get.options"}]',
      '\u8F93\u5165 WebSocket \u6D88\u606F\uFF0C\u4F8B\u5982 42["desktop",{"action":"get.options"}]'
    ],
    [
      "Updates detected",
      "\u53D1\u73B0\u66F4\u65B0"
    ],
    [
      "Download from GitHub",
      "\u4ECE GitHub \u4E0B\u8F7D"
    ],
    [
      "Download ZIP, extract, and reload on chrome://extensions",
      "\u4E0B\u8F7D ZIP\uFF0C\u89E3\u538B\u540E\u5728 chrome://extensions \u91CD\u65B0\u52A0\u8F7D"
    ],
    [
      "Software",
      "\u8F6F\u4EF6"
    ],
    [
      "Hardware",
      "\u786C\u4EF6"
    ],
    [
      "Cleanup error",
      "\u6E05\u7406\u5931\u8D25"
    ],
    [
      "Equip failed",
      "\u88C5\u5907\u5931\u8D25"
    ],
    [
      "GPU Power",
      "GPU \u7B97\u529B"
    ],
    [
      "Frequency",
      "\u9891\u7387"
    ],
    [
      "Tags",
      "\u6807\u7B7E"
    ],
    [
      "Enter",
      "\u56DE\u8F66"
    ],
    [
      "Escape",
      "Esc"
    ],
    [
      "Failed to start Valuable Search",
      "\u65E0\u6CD5\u542F\u52A8\u8D35\u91CD\u7269\u54C1\u641C\u7D22"
    ],
    [
      "Failed to start Valuable Seller",
      "\u65E0\u6CD5\u542F\u52A8\u8D35\u91CD\u7269\u54C1\u51FA\u552E"
    ],
    [
      "Failed to send auto jobs to content script",
      "\u65E0\u6CD5\u5C06\u81EA\u52A8\u4EFB\u52A1\u8BF7\u6C42\u53D1\u9001\u81F3\u6E38\u620F\u811A\u672C"
    ],
    [
      "Check requested",
      "\u5DF2\u8BF7\u6C42\u68C0\u67E5"
    ],
    [
      "Frequency GHz",
      "\u9891\u7387 GHz"
    ],
    [
      "Cores count count",
      "\u6838\u5FC3\u6570"
    ],
    [
      "Power PFLOPS",
      "\u7B97\u529B PFLOPS"
    ],
    [
      "Memory TB",
      "\u5185\u5B58 TB"
    ],
    [
      "Power kW",
      "\u529F\u7387 kW"
    ],
    [
      "Protection %",
      "\u4FDD\u62A4\u7387 %"
    ],
    [
      "Power consuming kW",
      "\u529F\u8017 kW"
    ],
    [
      "Mercenary refresh returned incomplete data",
      "\u4F63\u5175\u5237\u65B0\u8FD4\u56DE\u4E0D\u5B8C\u6574"
    ]
  ];

  // src/shared/ui-i18n.js
  var UI_LANGUAGE_KEY = "uiLanguage";
  var DEFAULT_UI_LANGUAGE = "en";
  function normalizeUiLanguage(value) {
    return value === "zh-CN" || value === "zh" ? "zh-CN" : "en";
  }
  var normalize = (value) => value.replace(/\s+/g, " ").trim();
  var english = /* @__PURE__ */ new Map();
  var chinese = /* @__PURE__ */ new Map();
  for (const [en, zh] of ui_catalogue_default) {
    english.set(normalize(en).toLowerCase(), zh);
    if (!chinese.has(normalize(zh))) chinese.set(normalize(zh), en);
  }
  function exact(value, language) {
    const key = normalize(value);
    if (language === "zh-CN") return english.get(key.toLowerCase()) ?? (chinese.has(key) ? key : null);
    return chinese.get(key) ?? (english.has(key.toLowerCase()) ? value : null);
  }
  var templates = [];
  var escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  function template(en, zh) {
    const compile = (text) => {
      const indices = [];
      const source = text.split(/(\{\d+\})/g).map((part) => {
        const match = /^\{(\d+)\}$/.exec(part);
        if (!match) return escape(part).replace(/\s+/g, "\\s*");
        indices.push(Number(match[1]));
        return "([\\s\\S]+?)";
      }).join("");
      return { regex: new RegExp("^" + source + "$", "i"), indices };
    };
    templates.push({ en, zh, enMatch: compile(en), zhMatch: compile(zh) });
  }
  template("Updated {0}m ago", "{0} \u5206\u949F\u524D\u66F4\u65B0");
  template("Market-{0}", "\u5E02\u573A {0}");
  template("Reputation \u2014 Level {0}", "\u58F0\u671B \u2014 \u7B49\u7EA7 {0}");
  template("Expand {0}", "\u5C55\u5F00 {0}");
  template("Collapse {0}", "\u6536\u8D77 {0}");
  template("{0} Market", "{0} \u5E02\u573A");
  template("{0}m {1}s", "{0} \u5206\u949F {1} \u79D2");
  template("{0} entries", "{0} \u6761\u8BB0\u5F55");
  template("({0} entries)", "\uFF08{0} \u6761\u8BB0\u5F55\uFF09");
  template("{0}-now", "{0}-\u73B0\u5728");
  template("Updated {0}h {1}m ago", "{0} \u5C0F\u65F6 {1} \u5206\u949F\u524D\u66F4\u65B0");
  template("{0}h:{1}m:{2}s", "{0}\u5C0F\u65F6:{1}\u5206\u949F:{2}\u79D2");
  template("{0}h {1}m {2}s", "{0}\u5C0F\u65F6 {1}\u5206\u949F {2}\u79D2");
  template("{0}h {1}m", "{0} \u5C0F\u65F6 {1} \u5206\u949F");
  template("{0} min", "{0} \u5206\u949F");
  template("{0}m remaining", "\u5269\u4F59 {0} \u5206\u949F");
  template("{0}m ago", "{0} \u5206\u949F\u524D");
  template("{0} pending", "{0} \u9879\u5F85\u5904\u7406");
  template("({0} pending)", "\uFF08{0} \u9879\u5F85\u5904\u7406\uFF09");
  template("({0} servers)", "\uFF08{0} \u53F0\u670D\u52A1\u5668\uFF09");
  template("({0} files)", "\uFF08{0} \u4E2A\u6587\u4EF6\uFF09");
  template("({0} logs)", "\uFF08{0} \u6761\u65E5\u5FD7\uFF09");
  template("({0}, {1} in-progress)", "\uFF08{0}\uFF0C{1} \u4E2A\u6267\u884C\u4E2D\uFF09");
  template("Items List ({0})", "\u7269\u54C1\u5217\u8868\uFF08{0}\uFF09");
  template("Jobs List ({0})", "\u4EFB\u52A1\u5217\u8868\uFF08{0}\uFF09");
  template("Loot ({0} items)", "\u6218\u5229\u54C1\uFF08{0} \u9879\uFF09");
  template("Loot ({0})", "\u6218\u5229\u54C1\uFF08{0} \u9879\uFF09");
  template("{0} mercenaries ({1})", "{0} \u4F63\u5175\uFF08{1}\uFF09");
  template("Renew ({0} CR)", "\u7EED\u79DF\uFF08{0} CR\uFF09");
  template("Sellable stock at current prices: {0} CR", "\u53EF\u552E\u7269\u54C1\u6309\u5F53\u524D\u5355\u4EF7\u5408\u8BA1\uFF1A{0} CR");
  template("Next dispatch check: {0}", "\u4E0B\u6B21\u6D3E\u9063\u68C0\u67E5\uFF1A{0}");
  template("Last dispatch {0}", "\u4E0A\u6B21\u6D3E\u9063 {0}");
  template("Remaining {0}", "\u5269\u4F59 {0}");
  template("State updated at: {0}", "\u72B6\u6001\u66F4\u65B0\u65F6\u95F4\uFF1A{0}");
  template("Total cost: {0}", "\u603B\u8D39\u7528\uFF1A{0}");
  template("Risk score: {0}", "\u98CE\u9669\u8BC4\u5206\uFF1A{0}");
  template("Logs copied ({0} MB)", "\u65E5\u5FD7\u5DF2\u590D\u5236\uFF08{0} MB\uFF09");
  template("Aim for {0} system version!", "\u5EFA\u8BAE\u8FBE\u5230\u7CFB\u7EDF\u7248\u672C {0}\uFF01");
  template("Refreshing Market-{0}...", "\u6B63\u5728\u5237\u65B0\u5E02\u573A {0}\u2026");
  template("Setting Market-{0} endpoint...", "\u6B63\u5728\u8FDE\u63A5\u5E02\u573A {0} \u8282\u70B9\u2026");
  template('Delayed \u2014 waiting for "{0}" to finish', "\u5DF2\u5EF6\u540E\uFF0C\u7B49\u5F85\u201C{0}\u201D\u5B8C\u6210");
  template("Select {0}", "\u9009\u62E9 {0}");
  template("Unequip {0}", "\u5378\u4E0B {0}");
  template("Equip {0}", "\u88C5\u5907 {0}");
  template("Install {0}", "\u5B89\u88C5 {0}");
  template("Uninstall {0}", "\u5378\u8F7D {0}");
  template("Pulling map: {0}", "\u6B63\u5728\u83B7\u53D6\u5730\u56FE\uFF1A{0}");
  template("Map loaded: {0}", "\u5730\u56FE\u5DF2\u52A0\u8F7D\uFF1A{0}");
  template("Connecting to {0}", "\u6B63\u5728\u8FDE\u63A5 {0}");
  template("Testing reachability to {0}", "\u6B63\u5728\u6D4B\u8BD5\u5230 {0} \u7684\u53EF\u8FBE\u6027");
  template("Clearing failed jobs from {0}...", "\u6B63\u5728\u6E05\u7406 {0} \u7684\u5931\u8D25\u4EFB\u52A1\u2026");
  template("Dismissed {0} failed job(s) from {1} market", "\u5DF2\u4ECE {1} \u5E02\u573A\u6E05\u7406 {0} \u4E2A\u5931\u8D25\u4EFB\u52A1");
  template("Clean up {0} failed jobs", "\u6E05\u7406 {0} \u4E2A\u5931\u8D25\u4EFB\u52A1");
  template("Loadout: equipping {0}", "\u914D\u7F6E\uFF1A\u6B63\u5728\u88C5\u5907 {0}");
  template("Loadout: requesting fresh data via WS...", "\u914D\u7F6E\uFF1A\u6B63\u5728\u901A\u8FC7 WebSocket \u8BF7\u6C42\u6700\u65B0\u6570\u636E\u2026");
  template("Job completed: {0}", "\u4EFB\u52A1\u5DF2\u5B8C\u6210\uFF1A{0}");
  template("Job failed: {0}", "\u4EFB\u52A1\u5931\u8D25\uFF1A{0}");
  template("Seller error: {0}", "\u51FA\u552E\u7A0B\u5E8F\u9519\u8BEF\uFF1A{0}");
  template("Minigame locked (~{0}m remaining)", "\u5C0F\u6E38\u620F\u5DF2\u9501\u5B9A\uFF08\u7EA6\u5269\u4F59 {0} \u5206\u949F\uFF09");
  template("Minigame lock (~{0}m remaining)", "\u5C0F\u6E38\u620F\u9501\u5B9A\uFF08\u7EA6\u5269\u4F59 {0} \u5206\u949F\uFF09");
  template("{0} (expired)", "{0}\uFF08\u5DF2\u8FC7\u671F\uFF09");
  template("Game unavailable: {0}; refresh the game after updating the extension.", "\u65E0\u6CD5\u8FDE\u63A5\u6E38\u620F\uFF1A{0}\uFF1B\u66F4\u65B0\u6269\u5C55\u540E\u8BF7\u5237\u65B0\u6E38\u620F\u3002");
  template("Server confirmed expedition {0}", "\u670D\u52A1\u5668\u5DF2\u786E\u8BA4\u8FDC\u5F81 {0}");
  template("Dispatch successful: {0}", "\u6D3E\u9063\u6210\u529F\uFF1A{0}");
  template("Refreshing {0} mercenaries and actual costs", "\u6B63\u5728\u5237\u65B0 {0} \u4F63\u5175\u4E0E\u5B9E\u9645\u8D39\u7528");
  template("Sending {0}, cost {1} CR; awaiting server confirmation", "\u6B63\u5728\u6D3E\u9063 {0}\uFF0C\u8D39\u7528 {1} CR\uFF1B\u7B49\u5F85\u670D\u52A1\u5668\u786E\u8BA4");
  template("Selling {0} \xD7{1}; awaiting server confirmation", "\u6B63\u5728\u51FA\u552E {0} \xD7{1}\uFF0C\u7B49\u5F85\u670D\u52A1\u5668\u786E\u8BA4");
  template("Sale confirmed: {0} \xD7{1}", "\u51FA\u552E\u5DF2\u786E\u8BA4\uFF1A{0} \xD7{1}");
  template("Expedition mail claim confirmed: {0}", "\u8FDC\u5F81\u5956\u52B1\u9886\u53D6\u5DF2\u786E\u8BA4\uFF1A{0}");
  template("Confirmed claims for {0} expedition reward message(s)", "\u5DF2\u786E\u8BA4\u9886\u53D6 {0} \u5C01\u8FDC\u5F81\u5956\u52B1\u90AE\u4EF6");
  template("Sale check complete: {0} unit(s) sold; {1} CR at server prices; {2} drone-material unit(s) remain", "\u51FA\u552E\u68C0\u67E5\u5B8C\u6210\uFF1A\u5DF2\u552E {0} \u4EF6\uFF1B\u6309\u670D\u52A1\u5668\u5355\u4EF7\u5408\u8BA1 {1} CR\uFF1B\u4ED3\u5E93\u5269\u4F59\u65E0\u4EBA\u673A\u6750\u6599 {2} \u4EF6");
  template("Sale check complete: {0} unit(s) sold; {1} CR at server prices (some prices unknown); {2} drone-material unit(s) remain", "\u51FA\u552E\u68C0\u67E5\u5B8C\u6210\uFF1A\u5DF2\u552E {0} \u4EF6\uFF1B\u6309\u670D\u52A1\u5668\u5355\u4EF7\u5408\u8BA1 {1} CR\uFF08\u90E8\u5206\u552E\u4EF7\u672A\u77E5\uFF09\uFF1B\u4ED3\u5E93\u5269\u4F59\u65E0\u4EBA\u673A\u6750\u6599 {2} \u4EF6");
  template("Submitting automatic decision: {0} (score {1})", "\u6B63\u5728\u63D0\u4EA4\u81EA\u52A8\u51B3\u7B56\uFF1A{0}\uFF08\u8BC4\u5206 {1}\uFF09");
  template("USOL mercenary refresh unavailable; using fresh CORE data only: {0}", "USOL \u4F63\u5175\u5237\u65B0\u4E0D\u53EF\u7528\uFF0C\u4EC5\u4F7F\u7528\u672C\u8F6E\u786E\u8BA4\u7684 CORE \u4F63\u5175\uFF1A{0}");
  template("Expedition operation {0} completed", "\u8FDC\u5F81\u64CD\u4F5C {0} \u5DF2\u5B8C\u6210");
  template("Expedition operation {0} failed: {1}", "\u8FDC\u5F81\u64CD\u4F5C {0} \u5931\u8D25\uFF1A{1}");
  template("Check stopped: {0}", "\u672C\u8F6E\u505C\u6B62\uFF1A{0}");
  template("Expedition check failed: {0}", "\u8FDC\u5F81\u68C0\u67E5\u5931\u8D25\uFF1A{0}");
  template("Expedition module initialization failed: {0}", "\u8FDC\u5F81\u6A21\u5757\u521D\u59CB\u5316\u5931\u8D25\uFF1A{0}");
  template("Expedition settings update failed: {0}", "\u8FDC\u5F81\u8BBE\u7F6E\u66F4\u65B0\u5931\u8D25\uFF1A{0}");
  template("Checking {0} markets: {1}/4 received.", "\u6B63\u5728\u68C0\u67E5 {0} \u5E02\u573A\uFF1A\u5DF2\u6536\u5230 {1}/4\u3002");
  template("Cleanup verified: {0} failed job(s) dismissed; {1} remaining or unverified.", "\u6E05\u7406\u5DF2\u590D\u6838\uFF1A\u5DF2\u6E05\u9664 {0} \u4E2A\u5931\u8D25\u4EFB\u52A1\uFF1B\u5269\u4F59\u6216\u672A\u786E\u8BA4 {1} \u4E2A\u3002");
  template("Cleanup stopped: {0}. No cached jobs are removed locally.", "\u6E05\u7406\u5DF2\u505C\u6B62\uFF1A{0}\u3002\u672A\u5728\u672C\u5730\u5220\u9664\u4EFB\u52A1\u7F13\u5B58\u3002");
  function translateUiText(value, language = DEFAULT_UI_LANGUAGE, depth = 0) {
    if (typeof value !== "string" || !value.trim() || depth > 5) return value;
    language = normalizeUiLanguage(language);
    const white = /^(\s*)([\s\S]*?)(\s*)$/.exec(value);
    const source = white[2];
    let text = exact(source, language);
    if (text !== null) return white[1] + text + white[3];
    const hours = (language === "zh-CN" ? /^(\d+)h$/i : /^(\d+)\s*小时$/).exec(source);
    if (hours) return white[1] + hours[1] + (language === "en" ? "h" : " \u5C0F\u65F6") + white[3];
    for (const item of templates) {
      const rule = language === "en" ? item.zhMatch : item.enMatch;
      const match = rule.regex.exec(source);
      if (!match) continue;
      const values = new Map(rule.indices.map((index, i) => [index, match[i + 1]]));
      text = (language === "en" ? item.en : item.zh).replace(
        /\{(\d+)\}/g,
        (_, index) => translateUiText(values.get(Number(index)), language, depth + 1)
      );
      return white[1] + text + white[3];
    }
    const prefixed = /^(\[[^\]]+\]\s*)([\s\S]+)$/.exec(source);
    if (prefixed) {
      const result = translateUiText(prefixed[2], language, depth + 1);
      if (result !== prefixed[2]) return white[1] + prefixed[1] + result + white[3];
    }
    const decorated = /^([^A-Za-z0-9\u3400-\u9fff]+)([\s\S]+)$/.exec(source);
    if (decorated) {
      const result = translateUiText(decorated[2], language, depth + 1);
      if (result !== decorated[2]) return white[1] + decorated[1] + result + white[3];
    }
    const label = /^([^:：=]+)([:：=])(\s*)([\s\S]*)$/.exec(source);
    if (label) {
      const translated2 = exact(label[1], language);
      if (translated2 !== null) {
        const separator = label[2] === "=" ? "=" : language === "en" ? ": " : "\uFF1A";
        return white[1] + translated2.replace(/[:：]$/, "") + separator + translateUiText(label[4], language, depth + 1) + white[3];
      }
    }
    if (/[·；\n]/.test(source) || /\s\/\s/.test(source)) {
      const parts = source.split(/(\s*·\s*|\s*；\s*|\s\/\s|\n)/);
      const result = parts.map((part, i) => i % 2 ? language === "en" ? part.replace("\uFF1B", "; ") : part : translateUiText(part, language, depth + 1)).join("");
      if (result !== source) return white[1] + result + white[3];
    }
    const trailing = /^(.*?)([.:：!！…]+)$/.exec(source);
    if (trailing && trailing[1]) {
      const result = exact(trailing[1], language);
      if (result !== null) return white[1] + result + (language === "en" ? trailing[2].replace("\uFF1A", ":").replace("\uFF01", "!") : trailing[2].replace(":", "\uFF1A")) + white[3];
    }
    return value;
  }

  // src/shared/ui-language.js
  var currentLanguage = DEFAULT_UI_LANGUAGE;
  function installUiLanguage({
    document: doc = document,
    storage = typeof chrome !== "undefined" ? chrome.storage : null,
    Observer = typeof MutationObserver === "function" ? MutationObserver : null
  } = {}) {
    const textSources = /* @__PURE__ */ new WeakMap(), attributeSources = /* @__PURE__ */ new WeakMap();
    const pending = /* @__PURE__ */ new Set();
    let scheduled = false, destroyed = false, revision = 0;
    const attributes = ["title", "placeholder", "aria-label"];
    const rawContents = "script, style, textarea, pre, code, #detailBody";
    const excluded = '[data-i18n-skip], [translate="no"], .msg-event, .msg-action, .msg-server, .msg-preview, .loadout-hw-name, .loadout-sw-name, .replace-name';
    const skip = (element) => element?.nodeType === 1 && element.matches(excluded);
    function textNode(node2) {
      const value = node2.data;
      let entry = textSources.get(node2);
      if (!entry || value !== entry.output) entry = { source: value };
      const output = translateUiText(entry.source, currentLanguage);
      entry.output = output;
      textSources.set(node2, entry);
      if (value !== output) node2.data = output;
    }
    function attribute(element, name) {
      if (!element.hasAttribute(name)) return;
      const value = element.getAttribute(name);
      const entries = attributeSources.get(element) || {};
      let entry = entries[name];
      if (!entry || value !== entry.output) entry = { source: value };
      const output = translateUiText(entry.source, currentLanguage);
      entry.output = output;
      entries[name] = entry;
      attributeSources.set(element, entries);
      if (value !== output) element.setAttribute(name, output);
    }
    function walk(node2) {
      if (skip(node2)) return;
      if (node2.nodeType === 3) {
        textNode(node2);
        return;
      }
      if (node2.nodeType === 1) for (const name of attributes) attribute(node2, name);
      if (node2.nodeType === 1 && node2.matches(rawContents)) return;
      for (const child of [...node2.childNodes || []]) walk(child);
    }
    function applyLanguage(language) {
      currentLanguage = normalizeUiLanguage(language);
      doc.documentElement.lang = currentLanguage;
      const select3 = doc.getElementById("uiLanguageSelect");
      if (select3) select3.value = currentLanguage;
      walk(doc.body);
      if (doc.title) doc.title = translateUiText(doc.title, currentLanguage);
    }
    function enqueue(node2) {
      if (!node2 || destroyed) return;
      pending.add(node2);
      if (scheduled) return;
      scheduled = true;
      Promise.resolve().then(() => {
        scheduled = false;
        const roots = [...pending];
        pending.clear();
        if (destroyed) return;
        for (const root2 of roots) {
          if (root2.nodeType === 3) {
            if (root2.parentNode && !root2.parentElement?.closest(excluded + ", " + rawContents)) textNode(root2);
          } else if (!root2.closest?.(excluded) && !root2.parentElement?.closest(rawContents)) walk(root2);
        }
      });
    }
    const observer = Observer ? new Observer((records) => {
      for (const record of records) {
        if (record.type === "characterData") {
          if (textSources.get(record.target)?.output !== record.target.data) enqueue(record.target);
        } else if (record.type === "attributes") {
          if (attributeSources.get(record.target)?.[record.attributeName]?.output !== record.target.getAttribute(record.attributeName)) enqueue(record.target);
        } else for (const node2 of record.addedNodes || []) enqueue(node2);
      }
    }) : null;
    let select2 = doc.getElementById("uiLanguageSelect");
    if (!select2) {
      const host = doc.querySelector(".toolbar");
      if (host) {
        const label = doc.createElement("label");
        label.setAttribute("data-i18n-skip", "");
        label.textContent = "Language / \u8BED\u8A00 ";
        select2 = doc.createElement("select");
        select2.id = "uiLanguageSelect";
        select2.setAttribute("aria-label", "Language / \u8BED\u8A00");
        for (const [value, name] of [["en", "English"], ["zh-CN", "\u7B80\u4F53\u4E2D\u6587"]]) {
          const option = doc.createElement("option");
          option.value = value;
          option.textContent = name;
          select2.appendChild(option);
        }
        label.appendChild(select2);
        host.appendChild(label);
      }
    }
    const onSelect = () => {
      revision++;
      applyLanguage(select2.value);
      if (storage?.sync) storage.sync.set({ [UI_LANGUAGE_KEY]: currentLanguage });
    };
    select2?.addEventListener("change", onSelect);
    const changed = (changes, area) => {
      if (area === "sync" && changes[UI_LANGUAGE_KEY]) {
        revision++;
        applyLanguage(changes[UI_LANGUAGE_KEY].newValue);
      }
    };
    storage?.onChanged?.addListener(changed);
    const initialRevision = revision;
    if (storage?.sync) storage.sync.get(UI_LANGUAGE_KEY, (data) => {
      if (!destroyed && initialRevision === revision) applyLanguage(data[UI_LANGUAGE_KEY]);
    });
    applyLanguage(currentLanguage);
    observer?.observe(doc.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: attributes });
    return {
      get language() {
        return currentLanguage;
      },
      setLanguage: applyLanguage,
      refresh: () => walk(doc.body),
      destroy() {
        destroyed = true;
        observer?.disconnect();
        select2?.removeEventListener("change", onSelect);
        storage?.onChanged?.removeListener?.(changed);
      }
    };
  }

  // src/popup/ui-language.js
  installUiLanguage();

  // src/popup/index.js
  console.log("[COR3 Helper] popup modules loaded");
})();
