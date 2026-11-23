(() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __esm = (fn, res) => function __init() {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // src/content/helpers.js
  var helpers_exports = {};
  __export(helpers_exports, {
    _automationEnqueue: () => _automationEnqueue,
    _automationFinish: () => _automationFinish,
    _automationProcessNext: () => _automationProcessNext,
    _automationQueueStatus: () => _automationQueueStatus,
    _broadcastQueueStatus: () => _broadcastQueueStatus,
    getAutomationActive: () => getAutomationActive,
    getAutomationQueue: () => getAutomationQueue,
    isContextValid: () => isContextValid,
    setAutomationActive: () => setAutomationActive,
    setAutomationQueue: () => setAutomationQueue
  });
  function isContextValid() {
    try {
      return !!chrome.runtime.id;
    } catch (e) {
      return false;
    }
  }
  function _automationQueueStatus() {
    return {
      active: _automationActive ? _automationActive.type : null,
      queued: _automationQueue.map((q) => q.type)
    };
  }
  function getAutomationActive() {
    return _automationActive;
  }
  function setAutomationActive(v) {
    _automationActive = v;
  }
  function getAutomationQueue() {
    return _automationQueue;
  }
  function setAutomationQueue(v) {
    _automationQueue = v;
  }
  function _broadcastQueueStatus() {
    if (!isContextValid()) return;
    try {
      chrome.storage.local.set({ automationQueueStatus: _automationQueueStatus() });
    } catch (e) {
    }
  }
  function _automationFinish(type) {
    if (_automationActive && _automationActive.type === type) {
      console.log("[COR3 Helper] Automation finished:", type);
      _automationActive = null;
      _broadcastQueueStatus();
      _automationProcessNext();
    }
  }
  function _automationProcessNext() {
    if (_automationActive) return;
    if (_automationQueue.length === 0) {
      _broadcastQueueStatus();
      return;
    }
    var next = _automationQueue.shift();
    _automationActive = { type: next.type, startedAt: Date.now() };
    console.log("[COR3 Helper] Automation starting:", next.type);
    _broadcastQueueStatus();
    next.run();
  }
  function _automationEnqueue(type, runFn) {
    if (_automationActive && _automationActive.type === type) return "already-running";
    if (_automationQueue.some((q) => q.type === type)) return "already-queued";
    if (!_automationActive) {
      _automationActive = { type, startedAt: Date.now() };
      console.log("[COR3 Helper] Automation starting:", type);
      _broadcastQueueStatus();
      runFn();
      return "started";
    }
    _automationQueue.push({ type, run: runFn });
    console.log("[COR3 Helper] Automation queued:", type, "(waiting for", _automationActive.type, ")");
    _broadcastQueueStatus();
    return "queued";
  }
  var _automationQueue, _automationActive;
  var init_helpers = __esm({
    "src/content/helpers.js"() {
      _automationQueue = [];
      _automationActive = null;
    }
  });

  // src/content/auto-update-markets.js
  var auto_update_markets_exports = {};
  __export(auto_update_markets_exports, {
    _autoJobsActive: () => _autoJobsActive,
    _autoUpdateMarkets: () => _autoUpdateMarkets,
    _autoUpdateMarketsLastRefresh: () => _autoUpdateMarketsLastRefresh,
    _initAutoUpdateMarketsTimer: () => _initAutoUpdateMarketsTimer,
    _marketRefreshInProgress: () => _marketRefreshInProgress,
    _seqRefreshRunning: () => _seqRefreshRunning,
    setAutoJobsActive: () => setAutoJobsActive,
    setAutoUpdateMarkets: () => setAutoUpdateMarkets,
    setAutoUpdateMarketsLastRefresh: () => setAutoUpdateMarketsLastRefresh,
    setMarketRefreshInProgress: () => setMarketRefreshInProgress,
    setSeqRefreshRunning: () => setSeqRefreshRunning
  });
  function setMarketRefreshInProgress(v) {
    _marketRefreshInProgress = v;
  }
  function setAutoUpdateMarketsLastRefresh(v) {
    _autoUpdateMarketsLastRefresh = v;
  }
  function setSeqRefreshRunning(v) {
    _seqRefreshRunning = v;
  }
  function setAutoJobsActive(v) {
    _autoJobsActive = v;
  }
  function setAutoUpdateMarkets(v) {
    _autoUpdateMarkets = v;
  }
  function _initAutoUpdateMarketsTimer() {
    if (!isContextValid()) {
      _autoUpdateMarketsLastRefresh = Date.now();
      return;
    }
    try {
      chrome.storage.local.get(["marketDataUpdatedAt", "darkMarketDataUpdatedAt", "soyuzMarketDataUpdatedAt", "usolMarketDataUpdatedAt"], (result) => {
        const now = Date.now();
        const timestamps = [
          result.marketDataUpdatedAt || 0,
          result.darkMarketDataUpdatedAt || 0,
          result.soyuzMarketDataUpdatedAt || 0,
          result.usolMarketDataUpdatedAt || 0
        ].filter((t) => t > 0);
        if (timestamps.length === 0) {
          _autoUpdateMarketsLastRefresh = 0;
          return;
        }
        const oldestUpdate = Math.min(...timestamps);
        const timeSinceOldest = now - oldestUpdate;
        if (timeSinceOldest >= _AUTO_UPDATE_MARKETS_INTERVAL) {
          _autoUpdateMarketsLastRefresh = 0;
        } else {
          _autoUpdateMarketsLastRefresh = oldestUpdate;
        }
      });
    } catch (e) {
      _autoUpdateMarketsLastRefresh = Date.now();
    }
  }
  var _autoUpdateMarkets, _marketRefreshInProgress, _autoUpdateMarketsLastRefresh, _seqRefreshRunning, _autoJobsActive, _AUTO_UPDATE_MARKETS_INTERVAL;
  var init_auto_update_markets = __esm({
    "src/content/auto-update-markets.js"() {
      init_helpers();
      _autoUpdateMarkets = false;
      _marketRefreshInProgress = false;
      _autoUpdateMarketsLastRefresh = 0;
      _seqRefreshRunning = false;
      _autoJobsActive = false;
      _AUTO_UPDATE_MARKETS_INTERVAL = 10 * 60 * 1e3;
      try {
        chrome.storage.sync.get("autoUpdateMarkets", (data) => {
          if (data.autoUpdateMarkets !== void 0) _autoUpdateMarkets = data.autoUpdateMarkets;
          if (_autoUpdateMarkets) _initAutoUpdateMarketsTimer();
        });
      } catch (e) {
      }
      setInterval(() => {
        if (!_autoUpdateMarkets) return;
        if (!isContextValid()) return;
        if (_marketRefreshInProgress || _seqRefreshRunning || _autoJobsActive) return;
        const now = Date.now();
        if (now - _autoUpdateMarketsLastRefresh < _AUTO_UPDATE_MARKETS_INTERVAL) return;
        _autoUpdateMarketsLastRefresh = now;
        _automationEnqueue("auto-update-markets", () => {
          _marketRefreshInProgress = true;
          console.log("[COR3 Helper] Auto Update Markets: triggering periodic 10-min refresh");
          window.postMessage({ type: "COR3_REFRESH_ALL_MARKETS_SEQ" }, "*");
          setTimeout(() => {
            _marketRefreshInProgress = false;
            _automationFinish("auto-update-markets");
          }, 3e4);
          function onDone(evt) {
            if (evt.data && evt.data.type === "COR3_ALL_MARKETS_REFRESHED") {
              window.removeEventListener("message", onDone);
              _marketRefreshInProgress = false;
              _automationFinish("auto-update-markets");
            }
          }
          window.addEventListener("message", onDone);
        });
      }, 3e4);
    }
  });

  // src/content/index.js
  init_helpers();

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
  function dispatchEnabled(settings2) {
    return expeditionEnabled(settings2) && (settings2.autoSendMerc?.enabled === true || settings2.periodicMercDispatchEnabled === true);
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
  function canSellExpeditionItem(item, mode) {
    return ["full", "non-drone", "all"].includes(mode) && !!item && typeof item.id === "string" && !!item.id && known.has(item.itemConfigId) && item.canSell === true && itemQuantity(item) > 0 && !item.locked && !item.isLocked && !item.pinned && !item.isPinned && (item.location === void 0 || ["stash", "inventory"].includes(item.location)) && (mode === "all" || !isDroneMaterial(item));
  }
  function lootName(item) {
    return item?.name || known.get(item?.itemConfigId)?.name || "\u672A\u77E5\u7269\u54C1";
  }
  function stashSpace(stash) {
    if (!Number.isFinite(stash?.maxCapacity) || !Number.isFinite(stash?.currentUsage) || stash.maxCapacity <= 0 || stash.currentUsage < 0) return null;
    return Math.max(0, stash.maxCapacity - stash.currentUsage);
  }
  function saleCandidates(stash, mode) {
    const candidates = (stash?.items || []).filter((item) => canSellExpeditionItem(item, mode));
    if (mode === "full") return candidates.filter((item) => Number.isFinite(item.sellPrice) && item.sellPrice > 0).sort((a, b) => a.sellPrice - b.sellPrice || a.id.localeCompare(b.id));
    return candidates;
  }

  // src/shared/expedition-mail-policy.js
  function isExpeditionMail(message) {
    if (!message || typeof message.id !== "string" || !message.id || message.status === "CLAIMED") return false;
    const title = String(message.title || "").trim();
    return /^(?:expedition (?:loot|spoils|rewards)|远征(?:战利品|奖励)|遠征(?:戰利品|獎勵))$/i.test(title) && pendingAttachments(message).length > 0;
  }
  function pendingAttachments(message) {
    return (Array.isArray(message?.attachments) ? message.attachments : []).filter((item) => item && typeof item.id === "string" && item.id && item.claimedAt === null);
  }

  // src/shared/periodic-merc-controller.js
  var CORE_MERC_MARKET = "019d3ea4-85bd-7389-904d-8f7c85841134";
  function pickPeriodicMerc(markets, prices, settings2 = {}) {
    let eligible = [];
    for (const market of ["core", "usol"]) {
      const data = markets[market];
      const elite = new Set((data?.eliteSlots || []).map((slot) => slot.mercenary?.id));
      const mercs = [...Array.isArray(data) ? data : data?.mercenaries || []];
      for (const slot of data?.eliteSlots || []) {
        if (slot.mercenary && !mercs.some((m) => m.id === slot.mercenary.id)) mercs.push(slot.mercenary);
      }
      for (const merc of mercs) {
        const price = prices[merc.id];
        if (merc.status !== "AVAILABLE" || !Number.isFinite(price?.totalCost) || price.totalCost < 0) continue;
        if (settings2.ignoreEliteMerc && (elite.has(merc.id) || merc._isElite)) continue;
        if (settings2.applyMercCostLimiter && price.totalCost > (settings2.maxMercCost ?? 15e3)) continue;
        if (!settings2.autoChooseMerc && merc.id !== settings2.mercenaryId) continue;
        eligible.push({ ...merc, market, cost: price.totalCost, risk: price.riskScore ?? 0 });
      }
    }
    eligible.sort((a, b) => {
      if (settings2.autoChooseUsolFirst && a.market !== b.market) return a.market === "usol" ? -1 : 1;
      return a.cost - b.cost || a.risk - b.risk || (a.market === "usol" ? -1 : 1);
    });
    return eligible[0] || null;
  }

  // src/shared/expedition-workflow.js
  var USOL_MERC_MARKET = "019e4065-6ae8-760d-8724-58ab4f2cf7d7";
  function activeList(data) {
    const list = Array.isArray(data) ? data : data?.id ? [data] : null;
    if (!list || list.some((exp) => !exp || typeof exp.id !== "string" || typeof exp.status !== "string"))
      throw new Error("\u8FDC\u5F81\u72B6\u6001\u683C\u5F0F\u65E0\u6CD5\u8BC6\u522B\uFF0C\u5DF2\u505C\u6B62\u64CD\u4F5C");
    return list;
  }
  function chooseLocation(config) {
    const locations = config?.locations || [];
    const loc = locations.find((loc2) => ["Skylift Remains", "Koute Mining and Reprocessing Outpost"].includes(loc2.name)) || locations[0];
    const zone = loc?.zones?.[0], goal = zone?.goals?.[0];
    if (!loc?.id || !zone?.id || !goal?.id) throw new Error("\u8FDC\u5F81\u5730\u70B9\u914D\u7F6E\u4E0D\u5B8C\u6574");
    return { locationConfigId: loc.id, zoneConfigId: zone.id, goalId: goal.id };
  }
  function decisionChoice(decision, expedition, mods = {}, now = Date.now()) {
    if (!mods.autoChoose || decision.isResolved || !decision.decisionDeadline || !Array.isArray(decision.decisionOptions)) return null;
    const remaining = new Date(decision.decisionDeadline).getTime() - now;
    if (!Number.isFinite(remaining) || remaining <= 0 || !mods.noWaitAutoChoose && remaining > 6e4) return null;
    const veteran = mods.getRidOfVeterans && expedition?.mercenary?.rank === "VETERAN";
    const loot = veteran ? 1 : mods.enabled === false ? 1 : mods.loot ?? 1;
    const risk = veteran ? 10 : mods.enabled === false ? -1 : mods.risk ?? -5;
    return decision.decisionOptions.map((opt) => ({ ...opt, score: Math.round(opt.lootModifier * loot + opt.riskModifier * risk * ((expedition.riskScore + Math.abs(opt.riskModifier)) / 10 || 1)) })).filter((opt) => Number.isFinite(opt.score)).sort((a, b) => b.score - a.score)[0] || null;
  }
  var ExpeditionWorkflow = class {
    constructor({ rpc, settings: settings2, store = async () => {
    }, status: status2 = () => {
    }, log: log2 = () => {
    }, pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }) {
      Object.assign(this, { rpc, readSettings: settings2, store, status: status2, log: log2, pause });
      this.running = false;
      this.token = 0;
      this.itemCooldowns = /* @__PURE__ */ new Map();
      this.mailCooldowns = /* @__PURE__ */ new Map();
    }
    async settings() {
      return normalizeExpeditionSettings(await this.readSettings());
    }
    async allowed() {
      if (this.running && this.activeToken !== this.token) throw new Error("\u8FDC\u5F81\u6A21\u5757\u5DF2\u6682\u505C\uFF0C\u672C\u8F6E\u64CD\u4F5C\u5DF2\u53D6\u6D88");
      const settings2 = await this.settings();
      if (!expeditionEnabled(settings2)) throw new Error("\u8FDC\u5F81\u6A21\u5757\u5DF2\u6682\u505C");
      return settings2;
    }
    report(phase, message, extra = {}) {
      this.status({ phase, message, updatedAt: Date.now(), ...extra });
      this.log(message, phase === "error" ? "error" : "info");
    }
    async call(room, action, data = {}, options = {}) {
      await this.allowed();
      const result = await this.rpc(room, action, data, options);
      return result;
    }
    async expeditions() {
      const exps = activeList(await this.call("expeditions", "get.active"));
      await this.store({ expeditionsData: exps, expeditionsDataUpdatedAt: Date.now() });
      return exps;
    }
    async stash() {
      const stash = await this.call("stash", "get.state");
      if (!Array.isArray(stash?.items)) throw new Error("\u672A\u83B7\u5F97\u6709\u6548\u4ED3\u5E93\u6570\u636E");
      await this.store({ stashData: stash, stashDataUpdatedAt: Date.now() });
      return stash;
    }
    async sell({ requiredSpace = 0, forceFull = false } = {}) {
      let settings2 = await this.allowed();
      const mode = settings2.expeditionSaleMode;
      let stash = await this.stash();
      const stats = { soldUnits: 0, revenue: 0, unknownPrice: false };
      if (mode === "off") return stash;
      if (mode === "full" && !forceFull) requiredSpace = Math.max(requiredSpace, 1);
      this.report("selling", "\u6B63\u5728\u6309\u51FA\u552E\u6A21\u5F0F\u68C0\u67E5\u4ED3\u5E93");
      let steps = 0;
      while (++steps <= 1e3) {
        settings2 = await this.allowed();
        if (settings2.expeditionSaleMode !== mode) throw new Error("\u51FA\u552E\u6A21\u5F0F\u5DF2\u66F4\u6539\uFF0C\u672C\u6279\u64CD\u4F5C\u505C\u6B62\uFF1B\u5C06\u6309\u65B0\u6A21\u5F0F\u91CD\u65B0\u68C0\u67E5");
        if (mode === "full") {
          const free = stashSpace(stash);
          if (free === null) throw new Error("\u4ED3\u5E93\u5BB9\u91CF\u672A\u77E5\uFF0C\u65E0\u6CD5\u5224\u65AD\u9700\u8981\u51FA\u552E\u591A\u5C11\u7269\u54C1");
          if (free >= requiredSpace) break;
        }
        const candidates = saleCandidates(stash, mode);
        const item = candidates.find((item2) => (this.itemCooldowns.get(item2.id) || 0) <= Date.now());
        if (!item) {
          if (candidates.length) throw new Error("\u90E8\u5206\u51FA\u552E\u7ED3\u679C\u5C1A\u5F85\u786E\u8BA4\uFF0C\u51B7\u5374\u7ED3\u675F\u540E\u518D\u68C0\u67E5");
          if (mode === "full" && stashSpace(stash) < requiredSpace) throw new Error("\u975E\u65E0\u4EBA\u673A\u8FDC\u5F81\u6389\u843D\u4E0D\u8DB3\u4EE5\u817E\u51FA\u6240\u9700\u7A7A\u95F4\uFF1B\u5DF2\u4FDD\u7559\u65E0\u4EBA\u673A\u6750\u6599");
          break;
        }
        const before = itemQuantity(item);
        this.report("selling", `\u6B63\u5728\u51FA\u552E ${lootName(item)} \xD7${before}\uFF0C\u7B49\u5F85\u670D\u52A1\u5668\u786E\u8BA4`);
        try {
          const result = await this.call(
            "stash",
            "sell.item",
            { itemId: item.id, quantity: before },
            { saleMode: mode, itemConfigId: item.itemConfigId }
          );
          if (!Array.isArray(result?.items)) throw new Error("\u51FA\u552E\u54CD\u5E94\u7F3A\u5C11\u5E93\u5B58\uFF0C\u7ED3\u679C\u672A\u77E5");
          const remainingItem = result.items.find((current) => current.id === item.id);
          if (remainingItem && itemQuantity(remainingItem) === 0) throw new Error("\u51FA\u552E\u540E\u6570\u91CF\u683C\u5F0F\u65E0\u6548");
          const remaining = remainingItem ? itemQuantity(remainingItem) : 0;
          if (remaining > 0) throw new Error("\u670D\u52A1\u5668\u5C1A\u672A\u786E\u8BA4\u6574\u7EC4\u7269\u54C1\u5DF2\u552E\u51FA");
          stats.soldUnits += before;
          if (Number.isFinite(item.sellPrice)) stats.revenue += item.sellPrice * before;
          else stats.unknownPrice = true;
          await this.store({ stashData: result, stashDataUpdatedAt: Date.now() });
          this.log(`\u51FA\u552E\u5DF2\u786E\u8BA4\uFF1A${lootName(item)} \xD7${before}`, "success");
          await this.pause(600);
          stash = await this.stash();
        } catch (error) {
          this.itemCooldowns.set(item.id, Date.now() + 12e4);
          throw error;
        }
      }
      if (steps > 1e3) throw new Error("\u672C\u6279\u51FA\u552E\u8FBE\u5230\u64CD\u4F5C\u4E0A\u9650\uFF0C\u7B49\u5F85\u4E0B\u4E00\u6B21\u68C0\u67E5");
      const kept = stash.items.filter(isDroneMaterial).reduce((sum, item) => sum + itemQuantity(item), 0);
      const message = `\u51FA\u552E\u68C0\u67E5\u5B8C\u6210\uFF1A\u5DF2\u552E ${stats.soldUnits} \u4EF6\uFF1B\u6309\u670D\u52A1\u5668\u5355\u4EF7\u5408\u8BA1 ${stats.revenue.toLocaleString()} CR${stats.unknownPrice ? "\uFF08\u90E8\u5206\u552E\u4EF7\u672A\u77E5\uFF09" : ""}\uFF1B\u4ED3\u5E93\u5269\u4F59\u65E0\u4EBA\u673A\u6750\u6599 ${kept} \u4EF6`;
      await this.store({ expeditionSaleStatus: { ...stats, message, updatedAt: Date.now() } });
      this.log(message, "success");
      return stash;
    }
    async claimMail() {
      if (!(await this.allowed()).autoClaimExpeditionMail) return;
      this.report("claiming", "\u6B63\u5728\u68C0\u67E5\u8FDC\u5F81\u5956\u52B1\u90AE\u4EF6");
      let state = await this.call("mail", "get.state");
      if (!Array.isArray(state?.messages)) throw new Error("\u90AE\u7BB1\u6570\u636E\u683C\u5F0F\u65E0\u6CD5\u8BC6\u522B");
      let claimed = 0;
      const visited = /* @__PURE__ */ new Set();
      while (true) {
        if (!(await this.allowed()).autoClaimExpeditionMail) throw new Error("\u81EA\u52A8\u9886\u53D6\u5DF2\u5173\u95ED\uFF0C\u672C\u8F6E\u505C\u6B62");
        const message2 = state.messages.find((mail) => isExpeditionMail(mail) && !visited.has(mail.id));
        if (!message2) break;
        if ((this.mailCooldowns.get(message2.id) || 0) > Date.now()) throw new Error("\u4E0A\u6B21\u90AE\u4EF6\u9886\u53D6\u7ED3\u679C\u5F85\u786E\u8BA4\uFF0C\u7A0D\u540E\u91CD\u8BD5");
        visited.add(message2.id);
        const ids = new Set(pendingAttachments(message2).map((item) => item.id));
        const receive = () => this.call("mail", "claim.all", { messageId: message2.id });
        let result;
        try {
          result = await receive();
        } catch (error) {
          this.mailCooldowns.set(message2.id, Date.now() + 12e4);
          throw error;
        }
        const results = (Array.isArray(result?.results) ? result.results : [result]).filter((row) => ids.has(row?.attachmentId));
        if (!results.length) throw new Error("\u90AE\u4EF6\u9886\u53D6\u54CD\u5E94\u65E0\u6CD5\u5BF9\u5E94\u5F53\u524D\u9644\u4EF6\uFF0C\u5DF2\u505C\u6B62\u540E\u7EED\u64CD\u4F5C");
        if (results.some((row) => row.status === "skipped")) {
          const needed = results.filter((row) => row.status === "skipped").length;
          if ((await this.allowed()).expeditionSaleMode === "off") throw new Error("\u4ED3\u5E93\u7A7A\u95F4\u4E0D\u8DB3\uFF0C\u5956\u52B1\u5C1A\u672A\u5168\u90E8\u9886\u53D6\uFF1B\u51FA\u552E\u6A21\u5F0F\u4E3A\u5173\u95ED");
          this.log("\u5956\u52B1\u9886\u53D6\u56E0\u7A7A\u95F4\u4E0D\u8DB3\u88AB\u62D2\u7EDD\uFF1B\u5148\u817E\u51FA\u6240\u9700\u7A7A\u95F4\uFF0C\u518D\u91CD\u65B0\u8BFB\u53D6\u90AE\u7BB1", "warn");
          await this.sell({ requiredSpace: needed, forceFull: true });
          state = await this.call("mail", "get.state");
          if (!Array.isArray(state?.messages)) throw new Error("\u5237\u65B0\u90AE\u7BB1\u5931\u8D25");
          const current = state.messages.find((row) => row.id === message2.id);
          const stillPending = pendingAttachments(current);
          if (stillPending.length) {
            const retry = await receive();
            const rows = (Array.isArray(retry?.results) ? retry.results : [retry]).filter((row) => stillPending.some((item) => item.id === row?.attachmentId));
            if (!rows.length || rows.some((row) => !["claimed", "already-claimed", "not-found"].includes(row.status)))
              throw new Error("\u817E\u51FA\u7A7A\u95F4\u540E\u4ECD\u672A\u786E\u8BA4\u5168\u90E8\u5956\u52B1\u9886\u53D6\uFF0C\u672C\u8F6E\u505C\u6B62");
          }
        } else if (results.some((row) => !["claimed", "already-claimed", "not-found"].includes(row.status))) {
          throw new Error("\u90AE\u4EF6\u8FD4\u56DE\u672A\u77E5\u9886\u53D6\u7ED3\u679C\uFF0C\u672C\u8F6E\u505C\u6B62");
        }
        state = await this.call("mail", "get.state");
        if (!Array.isArray(state?.messages)) throw new Error("\u65E0\u6CD5\u590D\u6838\u90AE\u7BB1\u72B6\u6001");
        if (pendingAttachments(state.messages.find((row) => row.id === message2.id)).some((item) => ids.has(item.id))) {
          this.mailCooldowns.set(message2.id, Date.now() + 12e4);
          throw new Error("\u90AE\u7BB1\u4ECD\u6709\u5F85\u9886\u53D6\u9644\u4EF6\uFF0C\u5DF2\u505C\u6B62\u6D3E\u9063");
        }
        claimed++;
        this.log(`\u8FDC\u5F81\u5956\u52B1\u9886\u53D6\u5DF2\u786E\u8BA4\uFF1A${message2.title}`, "success");
      }
      const message = claimed ? `\u5DF2\u786E\u8BA4\u9886\u53D6 ${claimed} \u5C01\u8FDC\u5F81\u5956\u52B1\u90AE\u4EF6` : "\u672A\u53D1\u73B0\u672A\u9886\u53D6\u7684\u8FDC\u5F81\u5956\u52B1\u90AE\u4EF6";
      await this.store({ expeditionMailStatus: { message, updatedAt: Date.now() } });
      this.log(message);
    }
    async finishCompleted(exps, force = false) {
      let processed = false;
      for (const exp of exps) {
        if (!["COMPLETED", "FAILED"].includes(exp.status)) continue;
        if (!force && !dispatchEnabled(await this.allowed())) continue;
        this.report("collecting", "\u6B63\u5728\u5904\u7406\u5DF2\u7ED3\u675F\u8FDC\u5F81");
        const failed = ["DEATH", "FAILURE", "FAILED"].includes(exp.outcome) || exp.status === "FAILED";
        const existingLoot = Array.isArray(exp.containerData) ? exp.containerData : exp.containerData?.items || exp.containerItems || [];
        const rewardContainer = exp.messages?.some((message) => message.actionType === "pay_and_open");
        if (failed && exp.hasInsurance) throw new Error("\u5931\u8D25\u8FDC\u5F81\u542B\u4FDD\u9669\u8D54\u4ED8\uFF0C\u8BF7\u5148\u5728\u6E38\u620F\u4E2D\u5904\u7406\uFF1B\u672A\u81EA\u52A8\u5173\u95ED\u4EE5\u514D\u635F\u5931\u5956\u52B1");
        if (failed && !existingLoot.length && !rewardContainer) {
          await this.call("expeditions", "dismiss", { expeditionId: exp.id });
        } else {
          let current = exp;
          if (!exp.containerOpenedAt) current = await this.call("expeditions", "open.container", { expeditionId: exp.id });
          if (!current?.id || current.id !== exp.id) throw new Error("\u5956\u52B1\u5BB9\u5668\u54CD\u5E94\u4E0D\u5339\u914D");
          const contents = Array.isArray(current.containerData) ? current.containerData : current.containerData?.items || current.containerItems || [];
          const needed = contents.length || 2;
          const stash = await this.stash();
          if (stashSpace(stash) !== null && stashSpace(stash) < needed) {
            if ((await this.allowed()).expeditionSaleMode === "off") throw new Error("\u4ED3\u5E93\u7A7A\u95F4\u4E0D\u8DB3\uFF0C\u6682\u505C\u9886\u53D6\u4E0E\u6D3E\u9063");
            await this.sell({ requiredSpace: needed, forceFull: true });
          }
          await this.call("expeditions", "collect.all", { expeditionId: exp.id });
        }
        const after = await this.expeditions();
        if (after.some((current) => current.id === exp.id)) throw new Error("\u4E0A\u8F6E\u8FDC\u5F81\u5C1A\u672A\u5B8C\u6210\u5F52\u6863\uFF0C\u6682\u505C\u6D3E\u9063\uFF1B\u4E0B\u6B21\u5237\u65B0\u590D\u6838");
        processed = true;
      }
      return processed;
    }
    async refreshMercs() {
      const markets = {}, configs = {}, prices = {};
      for (const market of ["core", "usol"]) {
        this.report("mercenaries", `\u6B63\u5728\u5237\u65B0 ${market === "core" ? "CORE" : "USOL"} \u4F63\u5175\u4E0E\u5B9E\u9645\u8D39\u7528`);
        try {
          const fresh = await this.call("expeditions", "merc.refresh", { market });
          if (!fresh?.mercenaries || !fresh.config) throw new Error("\u4F63\u5175\u5237\u65B0\u8FD4\u56DE\u4E0D\u5B8C\u6574");
          markets[market] = fresh.mercenaries;
          configs[market] = fresh.config;
          Object.assign(prices, fresh.prices);
          const keys = market === "core" ? ["mercenariesData", "expeditionConfigData", "mercenariesUpdatedAt"] : ["usolMercenariesData", "usolExpeditionConfigData", "usolMercenariesUpdatedAt"];
          await this.store({ [keys[0]]: fresh.mercenaries, [keys[1]]: fresh.config, [keys[2]]: Date.now() });
        } catch (error) {
          if (market === "core" || error.unknownOutcome || !expeditionEnabled(await this.settings())) throw error;
          this.log("USOL \u4F63\u5175\u5237\u65B0\u4E0D\u53EF\u7528\uFF0C\u4EC5\u4F7F\u7528\u672C\u8F6E\u786E\u8BA4\u7684 CORE \u4F63\u5175\uFF1A" + error.message, "warn");
        }
      }
      await this.store({ mercConfigData: prices });
      return { markets, configs, prices };
    }
    async decisions(exps) {
      for (const exp of exps) for (const message of exp.messages || []) {
        const mods = (await this.allowed()).decisionModifiers;
        const opt = decisionChoice(message, exp, mods);
        if (!opt) continue;
        this.report("decision", `\u6B63\u5728\u63D0\u4EA4\u81EA\u52A8\u51B3\u7B56\uFF1A${opt.label}\uFF08\u8BC4\u5206 ${opt.score}\uFF09`);
        await this.call("expeditions", "respond.event", { expeditionId: exp.id, messageId: message.id, selectedOption: opt.id });
      }
    }
    async run(options = {}) {
      if (this.running) return false;
      this.running = true;
      this.activeToken = this.token;
      try {
        await this.allowed();
        let exps = await this.expeditions();
        if (options.manual) {
          const { room, action, data } = options.manual;
          if (room === "stash") await this.stash();
          await this.call(room, action, data, { manual: true });
          exps = await this.expeditions();
        }
        if (options.readOnly) {
          await this.stash();
          if (options.mercs) await this.refreshMercs();
          const archive = await this.call("expeditions", "get.archived", { cursor: null, limit: 20 });
          await this.store({ archivedExpeditionsData: archive, archivedExpeditionsUpdatedAt: Date.now() });
          const specialists = await this.call("specialists", "get.state");
          await this.store({ specialistsData: specialists, specialistsDataUpdatedAt: Date.now() });
          this.report("idle", "\u8FDC\u5F81\u4FE1\u606F\u5DF2\u5237\u65B0");
          return true;
        }
        await this.decisions(exps);
        const finished = await this.finishCompleted(exps, options.collect === true);
        await this.claimMail();
        const stash = await this.sell();
        if (options.mercs || finished) {
          const archive = await this.call("expeditions", "get.archived", { cursor: null, limit: 20 });
          await this.store({ archivedExpeditionsData: archive, archivedExpeditionsUpdatedAt: Date.now() });
        }
        let settings2 = await this.allowed();
        if (!dispatchEnabled(settings2) || !options.dispatch && !(finished && settings2.autoSendMerc.enabled)) {
          if (options.mercs) await this.refreshMercs();
          this.report("idle", "\u672C\u8F6E\u68C0\u67E5\u5B8C\u6210");
          return true;
        }
        exps = await this.expeditions();
        if (exps.length) {
          this.report("active", "\u5DF2\u6709\u8FDC\u5F81\u8FDB\u884C\u4E2D\u6216\u7B49\u5F85\u5904\u7406\uFF0C\u672C\u8F6E\u4E0D\u91CD\u590D\u6D3E\u9063");
          return true;
        }
        if (stashSpace(stash) === null || stashSpace(stash) < 1) throw new Error("\u4ED3\u5E93\u6CA1\u6709\u53EF\u786E\u8BA4\u7684\u7A7A\u4F4D\uFF0C\u6682\u505C\u6D3E\u9063");
        const { markets, configs, prices } = await this.refreshMercs();
        settings2 = await this.allowed();
        if (!dispatchEnabled(settings2)) throw new Error("\u81EA\u52A8\u6D3E\u9063\u5DF2\u5173\u95ED");
        let selected = pickPeriodicMerc(markets, prices, settings2.autoSendMerc);
        if (!selected) {
          this.report("waiting", "\u6682\u65E0\u7B26\u5408\u8D39\u7528\u4E0E\u7B5B\u9009\u6761\u4EF6\u7684\u53EF\u7528\u4F63\u5175\uFF0C\u7B49\u5F85\u4E0B\u6B21\u68C0\u67E5");
          return true;
        }
        if ((await this.expeditions()).length) {
          this.report("active", "\u68C0\u6D4B\u5230\u65B0\u8FDC\u5F81\uFF0C\u53D6\u6D88\u91CD\u590D\u6D3E\u9063");
          return true;
        }
        settings2 = await this.allowed();
        if (!dispatchEnabled(settings2)) throw new Error("\u81EA\u52A8\u6D3E\u9063\u5DF2\u5173\u95ED");
        selected = pickPeriodicMerc(markets, prices, settings2.autoSendMerc);
        if (!selected) throw new Error("\u4F63\u5175\u7B5B\u9009\u6761\u4EF6\u5DF2\u66F4\u6539\uFF0C\u672C\u8F6E\u505C\u6B62");
        const config = {
          mercenaryId: selected.id,
          marketId: selected.market === "core" ? CORE_MERC_MARKET : USOL_MERC_MARKET,
          ...chooseLocation(configs[selected.market]),
          hasInsurance: false
        };
        this.report("launching", `\u6B63\u5728\u6D3E\u9063 ${selected.callsign}\uFF0C\u8D39\u7528 ${selected.cost.toLocaleString()} CR\uFF1B\u7B49\u5F85\u670D\u52A1\u5668\u786E\u8BA4`);
        const expedition = await this.call("expeditions", "launch.confirmed", config);
        if (!expedition?.id || expedition.mercenary?.id !== selected.id) throw new Error("\u6D3E\u9063\u54CD\u5E94\u65E0\u6CD5\u5BF9\u5E94\u6240\u9009\u4F63\u5175\uFF0C\u7ED3\u679C\u5F85\u786E\u8BA4");
        await this.store({
          expeditionsData: [expedition],
          expeditionsDataUpdatedAt: Date.now(),
          lastExpeditionLaunchData: config,
          lastExpeditionDispatchAt: Date.now()
        });
        this.report("active", `\u6D3E\u9063\u6210\u529F\uFF1A${selected.callsign}`, { lastDispatchAt: Date.now() });
        this.log(`\u670D\u52A1\u5668\u5DF2\u786E\u8BA4\u8FDC\u5F81 ${expedition.id}`, "success");
        return true;
      } catch (error) {
        this.report("error", "\u672C\u8F6E\u505C\u6B62\uFF1A" + error.message);
        return false;
      } finally {
        this.running = false;
      }
    }
    cancel() {
      this.token++;
    }
  };

  // src/shared/merc-log.js
  function mercLog(...args) {
    const explicitLevel = args.length > 1 && ["info", "success", "warn", "error"].includes(args.at(-1)) ? args.pop() : null;
    console.log(...args);
    const msg = args.map((arg) => {
      if (typeof arg === "string") return arg;
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    }).join(" ").replace(/^\[COR3 Helper\]\s*/, "");
    const level = explicitLevel || (/failed|error|insufficient|giving up|aborting|失败|错误|停止/i.test(msg) ? "error" : /timeout|unreachable|skipp|blocked|no fitting|not available/i.test(msg) ? "warn" : /complete|collected|launched|claimed|完成|成功|已确认/i.test(msg) ? "success" : "info");
    window.postMessage({ type: "COR3_MERC_LOG", msg, level, timestamp: (/* @__PURE__ */ new Date()).toISOString() }, "*");
  }

  // src/content/expedition-module.js
  init_helpers();
  var TYPE = "expedition-workflow";
  var settings = {};
  var ready = false;
  var queued = false;
  var starting = false;
  var pending = null;
  var lastRun = 0;
  var retryAt = 0;
  var updating = Promise.resolve();
  var bridgeConfig = "";
  var serial = 0;
  var rerun = false;
  var lastExpSignature = "";
  function report(value) {
    if (isContextValid()) chrome.storage.local.set({
      expeditionModuleStatus: value,
      ...["waiting", "active", "launching"].includes(value.phase) ? { expeditionDispatchStatus: value } : {}
    });
  }
  function waitReply(type, requestId, timeout, trigger) {
    return new Promise((resolve, reject) => {
      const clean = () => {
        clearTimeout(timer2);
        window.removeEventListener("message", listener);
      };
      const listener = (event) => {
        if (event.source !== window) return;
        if (event.data?.type === "COR3_TOKEN_EXPIRED") {
          clean();
          reject(new Error("\u6E38\u620F\u4F1A\u8BDD\u5DF2\u8FC7\u671F\uFF0C\u7B49\u5F85\u91CD\u65B0\u8FDE\u63A5"));
          return;
        }
        if (event.data?.type !== type || event.data.requestId !== requestId) return;
        clean();
        if (event.data.error) reject(new Error(event.data.error));
        else resolve(event.data.data);
      };
      const timer2 = setTimeout(() => {
        clean();
        reject(new Error("\u6E38\u620F\u54CD\u5E94\u8D85\u65F6\uFF0C\u8BF7\u5237\u65B0\u6E38\u620F\u540E\u68C0\u67E5"));
      }, timeout);
      window.addEventListener("message", listener);
      trigger();
    });
  }
  async function readSettings() {
    settings = normalizeExpeditionSettings(await chrome.storage.sync.get(EXPEDITION_KEYS));
    return settings;
  }
  async function syncBridge() {
    await readSettings();
    const merc = settings.autoSendMerc;
    const config = {
      enabled: expeditionEnabled(settings),
      saleMode: settings.expeditionSaleMode,
      claimMail: settings.autoClaimExpeditionMail,
      dispatch: dispatchEnabled(settings),
      costLimited: !!merc.applyMercCostLimiter,
      maxMercCost: merc.maxMercCost
    };
    const json = JSON.stringify(config);
    if (json === bridgeConfig) return;
    const requestId = "config-" + ++serial;
    await waitReply("COR3_EXPEDITION_MODULE_READY", requestId, 5e3, () => {
      window.postMessage({ type: "COR3_EXPEDITION_MODULE_CONFIG", requestId, config }, "*");
    });
    bridgeConfig = json;
  }
  var workflow = new ExpeditionWorkflow({
    rpc: (room, action, data, options) => {
      const requestId = "exp-" + Date.now() + "-" + ++serial;
      const timeout = action === "merc.refresh" ? 115e3 : action === "launch.confirmed" ? 14e4 : 3e4;
      return waitReply("COR3_EXPEDITION_RPC_RESULT", requestId, timeout, () => {
        window.postMessage({ type: "COR3_EXPEDITION_RPC", requestId, room, action, data, options }, "*");
      });
    },
    settings: readSettings,
    store: (values) => chrome.storage.local.set(values),
    status: (value) => report(value),
    log: (message, level) => mercLog(message, level)
  });
  async function request(options = {}) {
    if (!isContextValid()) return { success: false, message: "\u6269\u5C55\u5DF2\u91CD\u8F7D\uFF0C\u8BF7\u5237\u65B0\u6E38\u620F" };
    await updating;
    await readSettings();
    if (!expeditionEnabled(settings)) return { success: false, message: "\u8FDC\u5F81\u6A21\u5757\u5DF2\u6682\u505C" };
    if (!ready) {
      report({ phase: "waiting", message: "\u7B49\u5F85\u6E38\u620F\u521D\u59CB\u5237\u65B0\u5B8C\u6210", updatedAt: Date.now() });
      return { success: false, message: "\u7B49\u5F85\u6E38\u620F\u521D\u59CB\u5237\u65B0\u5B8C\u6210" };
    }
    if (workflow.running || starting) return { success: false, message: "\u8FDC\u5F81\u6D41\u7A0B\u6B63\u5728\u6267\u884C\uFF0C\u8BF7\u7A0D\u540E\u68C0\u67E5\u65E5\u5FD7" };
    if (Date.now() < retryAt && !options.manualRequest) return { success: false, message: "\u7B49\u5F85\u91CD\u8BD5\u51B7\u5374" };
    if (queued) {
      if (options.manual) return { success: false, message: "\u8FDC\u5F81\u64CD\u4F5C\u5DF2\u6392\u961F\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5" };
      pending = {
        ...pending,
        ...options,
        dispatch: !!(pending.dispatch || options.dispatch),
        mercs: !!(pending.mercs || options.mercs),
        readOnly: !!(pending.readOnly && options.readOnly)
      };
      return { success: true, message: "\u5DF2\u5408\u5E76\u5230\u7B49\u5F85\u4E2D\u7684\u8FDC\u5F81\u68C0\u67E5" };
    }
    queued = true;
    pending = options;
    report({ phase: "queued", message: "\u8FDC\u5F81\u68C0\u67E5\u5DF2\u6392\u961F\uFF0C\u7B49\u5F85\u5F53\u524D\u4EFB\u52A1\u5B8C\u6210", updatedAt: Date.now() });
    _automationEnqueue(TYPE, async () => {
      starting = true;
      const runOptions = pending || {};
      queued = false;
      pending = null;
      try {
        await syncBridge();
        if (!expeditionEnabled(settings)) return;
        lastRun = Date.now();
        const success = await workflow.run(runOptions);
        retryAt = success ? 0 : Date.now() + 6e4;
      } catch (error) {
        retryAt = Date.now() + 6e4;
        report({ phase: "error", message: error.message, updatedAt: Date.now() });
        mercLog("\u8FDC\u5F81\u68C0\u67E5\u5931\u8D25\uFF1A" + error.message, "error");
      } finally {
        starting = false;
        _automationFinish(TYPE);
        if (rerun) {
          rerun = false;
          setTimeout(() => request({ dispatch: true }), 1e3);
        }
      }
    });
    return { success: true, message: "\u5DF2\u8BF7\u6C42\u8FDC\u5F81\u68C0\u67E5\uFF0C\u8BF7\u67E5\u770B\u8FD0\u884C\u6458\u8981\u4E0E\u65E5\u5FD7" };
  }
  async function initialize() {
    const data = await chrome.storage.sync.get([...EXPEDITION_KEYS, "selectiveLootSellEnabled", "autoSellCheapest"]);
    const defaults = {};
    if (data.expeditionModuleEnabled === void 0) defaults.expeditionModuleEnabled = false;
    if (data.expeditionSaleMode === void 0) defaults.expeditionSaleMode = data.selectiveLootSellEnabled ? "non-drone" : data.autoSellCheapest ? "full" : "off";
    if (Object.keys(defaults).length) await chrome.storage.sync.set(defaults);
    await syncBridge();
    if (!expeditionEnabled(settings)) report({ phase: "paused", message: "\u8FDC\u5F81\u6A21\u5757\u5DF2\u6682\u505C\uFF1BAutoJobs \u4E0D\u53D7\u5F71\u54CD", updatedAt: Date.now() });
  }
  updating = initialize().catch((error) => mercLog("\u8FDC\u5F81\u6A21\u5757\u521D\u59CB\u5316\u5931\u8D25\uFF1A" + error.message, "error"));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync" || !EXPEDITION_KEYS.some((key) => changes[key])) return;
    if (changes.expeditionModuleEnabled?.newValue === false || changes.helperMode?.newValue === true) workflow.cancel();
    updating = updating.then(async () => {
      await syncBridge();
      if (!expeditionEnabled(settings)) {
        queued = false;
        pending = null;
        rerun = false;
        setAutomationQueue(getAutomationQueue().filter((task) => task.type !== TYPE));
        _broadcastQueueStatus();
        report({ phase: "paused", message: "\u8FDC\u5F81\u6A21\u5757\u5DF2\u6682\u505C\uFF1B\u5DF2\u53D1\u51FA\u7684\u64CD\u4F5C\u7B49\u5F85\u670D\u52A1\u5668\u7ED3\u679C", updatedAt: Date.now() });
      } else if (workflow.running) rerun = true;
      else setTimeout(() => request({ dispatch: true, mercs: changes.expeditionModuleEnabled?.newValue === true, manualRequest: true }), 0);
    }).catch((error) => mercLog("\u8FDC\u5F81\u8BBE\u7F6E\u66F4\u65B0\u5931\u8D25\uFF1A" + error.message, "error"));
  });
  window.addEventListener("message", (event) => {
    if (event.source !== window || !isContextValid()) return;
    const message = event.data;
    if (message?.type === "COR3_INITIAL_FETCH_DONE") {
      ready = true;
      chrome.runtime.sendMessage({ action: "periodicMercReady" }).catch(() => {
      });
      request({ dispatch: true, mercs: true }).catch(() => {
      });
    }
    if (message?.type === "COR3_TOKEN_EXPIRED") {
      ready = false;
      workflow.cancel();
      bridgeConfig = "";
    }
    if (message?.type === "COR3_WS_EXPEDITIONS") {
      const signature = JSON.stringify((message.expeditions || []).map((exp) => [exp.id, exp.status, exp.containerOpenedAt]));
      if (signature === lastExpSignature) return;
      lastExpSignature = signature;
      if (workflow.running || queued || !expeditionEnabled(settings)) return;
      const completed = message.expeditions?.some((exp) => ["COMPLETED", "FAILED"].includes(exp.status));
      if (completed && dispatchEnabled(settings)) request({ dispatch: !!settings.autoSendMerc.enabled }).catch(() => {
      });
    }
  });
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    let options;
    if (message.action === "periodicMercDispatch") options = { dispatch: true };
    if (message.action === "expeditionCheckNow") options = { dispatch: true, manualRequest: true };
    if (message.action === "checkExpeditionMail") options = { manualRequest: true };
    if (message.action === "expeditionRefresh") options = { readOnly: true, mercs: message.mercs !== false, manualRequest: true };
    if (message.action === "expeditionManualDecision") options = { manual: { room: "expeditions", action: "respond.event", data: message.data }, manualRequest: true };
    if (message.action === "expeditionCollectNow") options = { collect: true, manualRequest: true };
    if (message.action === "expeditionManualSell") options = { manual: { room: "stash", action: "sell.item", data: { itemId: message.itemId, quantity: 1 } }, manualRequest: true };
    if (message.action === "expeditionExtendStash") options = { manual: { room: "specialists", action: "purchase", data: message.data }, manualRequest: true };
    if (!options) return;
    request(options).then(respond).catch((error) => respond({ success: false, message: error.message }));
    return true;
  });
  setInterval(() => {
    if (ready && expeditionEnabled(settings) && Date.now() - lastRun >= 55e3) request({}).catch(() => {
    });
  }, 6e4);

  // src/content/merc-logs.js
  init_helpers();
  var pending2 = [];
  var timer = null;
  var flushing = false;
  async function flush() {
    timer = null;
    if (flushing || !pending2.length || !isContextValid()) return;
    flushing = true;
    const batch = pending2.splice(0);
    try {
      const data = await chrome.storage.local.get("mercDebugLogs");
      const logs = Array.isArray(data.mercDebugLogs) ? data.mercDebugLogs : [];
      await chrome.storage.local.set({ mercDebugLogs: [...logs, ...batch].slice(-200) });
    } catch {
    } finally {
      flushing = false;
      if (pending2.length && isContextValid()) timer = setTimeout(flush, 100);
    }
  }
  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.type !== "COR3_MERC_LOG" || !isContextValid()) return;
    const data = event.data;
    if (typeof data.msg !== "string") return;
    pending2.push({
      timestamp: Number.isFinite(Date.parse(data.timestamp)) ? data.timestamp : (/* @__PURE__ */ new Date()).toISOString(),
      msg: data.msg.slice(0, 2e3),
      level: ["info", "success", "warn", "error"].includes(data.level) ? data.level : "info"
    });
    if (pending2.length > 200) pending2.splice(0, pending2.length - 200);
    if (!timer && !flushing) timer = setTimeout(flush, 100);
  });
  function logSettings(settings2) {
    const merc = settings2.autoSendMerc || {};
    const yes = (value) => value ? "\u5F00" : "\u5173";
    const modes = { off: "\u5173\u95ED", full: "\u4ED3\u5E93\u6EE1\u51FA\u552E", "non-drone": "\u51FA\u552E\u975E\u65E0\u4EBA\u673A", all: "\u5168\u51FA\u552E" };
    mercLog("\u8FDC\u5F81\u8BBE\u7F6E\uFF1A\u603B\u5F00\u5173=" + yes(settings2.expeditionModuleEnabled) + "\uFF1B\u7ED3\u675F\u540E\u6D3E\u9063=" + yes(merc.enabled) + "\uFF1B30 \u5206\u949F\u68C0\u67E5=" + yes(settings2.periodicMercDispatchEnabled) + "\uFF1B\u9009\u62E9\u6700\u4FBF\u5B9C=" + yes(merc.autoChooseMerc) + "\uFF1BUSOL \u4F18\u5148=" + yes(merc.autoChooseUsolFirst) + "\uFF1B\u6392\u9664\u7CBE\u82F1=" + yes(merc.ignoreEliteMerc) + "\uFF1B\u8D39\u7528\u4E0A\u9650=" + (merc.applyMercCostLimiter ? merc.maxMercCost : "\u5173\u95ED") + "\uFF1B\u5DF2\u9009=" + (merc.mercenaryName || "\u672A\u9009\u62E9") + "\uFF1B\u51FA\u552E=" + (modes[settings2.expeditionSaleMode] || "\u5173\u95ED") + "\uFF1B\u81EA\u52A8\u9886\u53D6=" + yes(settings2.autoClaimExpeditionMail));
  }
  var settingKeys = ["expeditionModuleEnabled", "expeditionSaleMode", "autoSendMerc", "autoClaimExpeditionMail", "periodicMercDispatchEnabled", "helperMode"];
  chrome.storage.sync.get(settingKeys, logSettings);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && settingKeys.some((key) => changes[key]) && isContextValid()) {
      chrome.storage.sync.get(settingKeys, logSettings);
    }
  });

  // src/content/failed-jobs-cleanup.js
  init_helpers();

  // src/shared/server-constants.js
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

  // src/shared/failed-jobs-policy.js
  var JOB_MARKETS = ["home", "dark", "soyuz", "usol"];
  function findFailedJobs(snapshots) {
    const candidates = /* @__PURE__ */ new Map();
    for (const key of JOB_MARKETS) {
      for (const job of snapshots[key]?.recentJobs || []) {
        if (job?.status !== "FAILED" || typeof job.id !== "string" || !job.id) continue;
        if (!candidates.has(job.id)) candidates.set(job.id, []);
        candidates.get(job.id).push({ key, job });
      }
    }
    const jobs = [], ambiguous = [];
    for (const [jobId, rows] of candidates) {
      const explicit = [...new Set(rows.map((row) => row.job.marketId).filter(Boolean))];
      let key = explicit.length === 1 ? JOB_MARKETS.find((key2) => MARKET_IDS[key2] === explicit[0]) : null;
      if (explicit.length > 1 || explicit.length && !key) {
        ambiguous.push(jobId);
        continue;
      }
      if (!key) {
        const owners = JOB_MARKETS.filter((key2) => snapshots[key2]?.jobs?.some((job) => job.id === jobId));
        key = owners.length === 1 ? owners[0] : rows.length === 1 ? rows[0].key : null;
      }
      if (!key || !snapshots[key]) {
        ambiguous.push(jobId);
        continue;
      }
      const ownerRow = snapshots[key].recentJobs?.find((job) => job.id === jobId);
      if (!ownerRow || ownerRow.status !== "FAILED") continue;
      jobs.push({ jobId, marketId: MARKET_IDS[key], marketKey: key });
    }
    return { jobs, ambiguous };
  }
  function verifyDismissals(jobs, snapshots) {
    return JOB_MARKETS.map((marketKey) => {
      const selected = jobs.filter((job) => job.marketKey === marketKey);
      const snapshot = snapshots[marketKey];
      if (!snapshot) return { marketKey, removed: 0, remaining: 0, unverified: selected.length };
      const ids = new Set(snapshot.recentJobs.map((job) => job.id));
      const removed = selected.filter((job) => !ids.has(job.jobId)).length;
      return { marketKey, removed, remaining: selected.length - removed, unverified: 0 };
    });
  }

  // src/content/failed-jobs-cleanup.js
  var TYPE2 = "dismiss-all-failed-jobs";
  var names = { home: "CORE", dark: "BMI-ZEN", soyuz: "SOYUZ", usol: "USOL" };
  function log(msg, level = "info") {
    window.postMessage({ type: "COR3_AUTOJOB_LOG", msg, level }, "*");
  }
  function status(phase, message, busy = true) {
    chrome.storage.local.set({ failedJobsCleanupStatus: { phase, message, busy, updatedAt: Date.now() } });
    log("\u{1F9F9} " + message, phase === "error" ? "error" : "info");
  }
  async function checkAllowed() {
    if (!isContextValid()) throw new Error("Extension was reloaded");
    const data = await chrome.storage.sync.get("helperMode");
    if (data.helperMode) throw new Error("Cleanup paused by Helper-Only mode");
  }
  function waitForReply(test, ms, trigger) {
    return new Promise((resolve, reject) => {
      const clean = () => {
        clearTimeout(timer2);
        window.removeEventListener("message", listener);
      };
      const listener = (event) => {
        if (event.source !== window) return;
        if (event.data?.type === "COR3_TOKEN_EXPIRED") {
          clean();
          reject(new Error("Game session expired"));
          return;
        }
        if (test(event.data)) {
          clean();
          resolve(event.data);
        }
      };
      const timer2 = setTimeout(() => {
        clean();
        reject(new Error("Server response timed out"));
      }, ms);
      window.addEventListener("message", listener);
      try {
        trigger();
      } catch (error) {
        clean();
        reject(error);
      }
    });
  }
  async function refreshMarkets(phase) {
    await checkAllowed();
    const snapshots = {};
    status(phase, phase === "refreshing" ? "Refreshing all four markets before checking failed jobs\u2026" : "Refreshing all four markets again to verify dismissals\u2026");
    function onSnapshot(event) {
      const packet = event.data;
      if (event.source !== window || packet?.type !== "COR3_MARKET_JOBS_SNAPSHOT" || !JOB_MARKETS.includes(packet.marketKey) || !Array.isArray(packet.data?.recentJobs)) return;
      snapshots[packet.marketKey] = packet.data;
      status(phase, (phase === "refreshing" ? "Refreshing" : "Verifying") + " markets: " + Object.keys(snapshots).length + "/4 received.");
    }
    window.addEventListener("message", onSnapshot);
    try {
      await waitForReply((packet) => packet?.type === "COR3_ALL_MARKETS_REFRESHED", 3e5, () => {
        window.postMessage({ type: "COR3_REFRESH_ALL_MARKETS_SEQ", skipLots: true }, "*");
      });
    } finally {
      window.removeEventListener("message", onSnapshot);
    }
    const missing = JOB_MARKETS.filter((key) => !snapshots[key]);
    if (missing.length) log("\u{1F9F9} No fresh job data from " + missing.map((key) => names[key]).join(", ") + "; those markets are skipped.", "warn");
    return snapshots;
  }
  async function runCleanup() {
    try {
      const before = await refreshMarkets("refreshing");
      await checkAllowed();
      const { jobs, ambiguous } = findFailedJobs(before);
      if (ambiguous.length) log("\u{1F9F9} Skipped " + ambiguous.length + " failed job(s) with unconfirmed market ownership.", "warn");
      if (!jobs.length) {
        const partial = Object.keys(before).length !== 4;
        status("done", partial ? "No FAILED jobs found in refreshed markets; some markets could not be checked." : "All markets refreshed. No FAILED jobs to dismiss.", false);
        return;
      }
      const attempted = [];
      for (const job of jobs) {
        await checkAllowed();
        status("dismissing", "Dismissing failed jobs: " + (attempted.length + 1) + "/" + jobs.length + " (" + names[job.marketKey] + ")\u2026");
        attempted.push(job);
        try {
          const response = await waitForReply((packet) => packet?.type === "COR3_JOB_DISMISS_RESULT" && (!packet.data?.jobId || packet.data.jobId === job.jobId) && (!packet.data?.id || packet.data.id === job.jobId), 12e3, () => {
            window.postMessage({
              type: "COR3_AUTOJOB_CMD",
              cmd: "job.dismiss",
              data: { marketId: job.marketId, jobId: job.jobId }
            }, "*");
          });
          if (response.error) log("\u{1F9F9} Server rejected dismissal: " + (response.error.message || "Unknown error"), "warn");
        } catch (error) {
          log("\u{1F9F9} Dismissal outcome unknown: " + error.message + "; verifying before any further requests.", "warn");
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      const after = await refreshMarkets("verifying");
      const summary = verifyDismissals(attempted, after);
      for (const row of summary) {
        if (!attempted.some((job) => job.marketKey === row.marketKey)) continue;
        log("\u{1F9F9} " + names[row.marketKey] + ": " + row.removed + " dismissed, " + row.remaining + " still listed, " + row.unverified + " unverified.");
      }
      const total = summary.reduce((sum, row) => sum + row.removed, 0);
      const remaining = summary.reduce((sum, row) => sum + row.remaining + row.unverified, jobs.length - attempted.length);
      status("done", "Cleanup verified: " + total + " failed job(s) dismissed; " + remaining + " remaining or unverified" + (Object.keys(before).length < 4 || Object.keys(after).length < 4 ? " (some markets unavailable)." : "."), false);
    } catch (error) {
      status("error", "Cleanup stopped: " + error.message + ". No cached jobs are removed locally.", false);
    } finally {
      _automationFinish(TYPE2);
    }
  }
  chrome.runtime.onMessage.addListener((request2, sender, sendResponse) => {
    if (request2.action !== "dismissAllFailedJobs") return;
    const result = _automationEnqueue(TYPE2, runCleanup);
    if (result === "queued") status("queued", "Cleanup queued behind the current automation; all markets will refresh when it starts.");
    sendResponse({ success: true, queueResult: result });
  });
  chrome.storage.local.get("failedJobsCleanupStatus", (data) => {
    if (data.failedJobsCleanupStatus?.busy) status("error", "Previous cleanup was interrupted. Click All Failed to refresh and try again.", false);
  });

  // src/content/auto-job-loadout-settings.js
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes.autoJobLoadoutMode) window.postMessage({
      type: "COR3_AUTOJOB_LOADOUT_MODE",
      mode: changes.autoJobLoadoutMode.newValue === "software" ? "software" : "auto"
    }, "*");
  });

  // src/content/index.js
  init_auto_update_markets();

  // src/content/auto-send.js
  var _initialFetchDone = true;
  var autoSendInProgress = false;
  function setInitialFetchDone(value) {
    _initialFetchDone = value;
  }
  function checkAutoSendOnExpeditionData() {
  }
  function setAutoSendInProgress() {
  }
  function setAutoSendExpeditionId() {
  }
  function setAutoSendAwaitingMercenaries() {
  }
  function setAutoSendAwaitingUsolMercs() {
  }
  function setAutoSendDeferredWaiting() {
  }
  function setAutoSendUsolSkipped() {
  }
  function setAutoSendMercRetryCount() {
  }

  // src/content/auto-refresh.js
  init_helpers();
  init_auto_update_markets();
  var autoRefreshSettings = { home_jobs: false, dark_jobs: false, soyuz_jobs: false, usol_jobs: false };
  var autoRefreshRetryPending = { home_jobs: false, dark_jobs: false, soyuz_jobs: false, usol_jobs: false };
  var autoRefreshExpiredRetryAt = { home_jobs: 0, dark_jobs: 0, soyuz_jobs: 0, usol_jobs: 0 };
  function setAutoRefreshSettings(v) {
    autoRefreshSettings = v;
  }
  try {
    chrome.storage.sync.get("autoRefresh", (data) => {
      if (data.autoRefresh) autoRefreshSettings = data.autoRefresh;
    });
  } catch (e) {
  }
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "sync" && changes.autoRefresh && changes.autoRefresh.newValue) {
        autoRefreshSettings = changes.autoRefresh.newValue;
      }
      if (area === "sync" && changes.autoUpdateMarkets !== void 0) {
        const wasOff = !_autoUpdateMarkets;
        setAutoUpdateMarkets(changes.autoUpdateMarkets.newValue !== false);
        if (_autoUpdateMarkets && wasOff) _initAutoUpdateMarketsTimer();
      }
      if (area === "local") {
        const marketKeyMap = { marketData: "home_jobs", darkMarketData: "dark_jobs", soyuzMarketData: "soyuz_jobs", usolMarketData: "usol_jobs" };
        for (const [storageKey, refreshKey] of Object.entries(marketKeyMap)) {
          if (changes[storageKey] && changes[storageKey].newValue) {
            const resetAt = changes[storageKey].newValue.nextJobsResetAt;
            if (resetAt && new Date(resetAt).getTime() > Date.now()) {
              autoRefreshExpiredRetryAt[refreshKey] = 0;
            }
          }
        }
        if (changes.cor3_console_logs && changes.cor3_console_logs.newValue) {
          const oldLen = (changes.cor3_console_logs.oldValue || []).length;
          const newEntries = changes.cor3_console_logs.newValue.slice(oldLen);
          const bgPopupEntries = newEntries.filter((e) => e.source !== "content");
          if (bgPopupEntries.length > 0) {
            try {
              for (const e of bgPopupEntries) {
                cor3LogEntry("ext-console", "[" + (e.source || "unknown") + "] " + (e.args || ""), e.level || "log");
              }
            } catch (err) {
            }
          }
        }
      }
    });
  } catch (e) {
  }
  function getMarketTimerSeconds(which) {
    return new Promise((resolve) => {
      if (!isContextValid()) {
        resolve(null);
        return;
      }
      try {
        const key = which === "home_jobs" ? "marketData" : which === "usol_jobs" ? "usolMarketData" : which === "soyuz_jobs" ? "soyuzMarketData" : "darkMarketData";
        chrome.storage.local.get(key, (result) => {
          const data = result[key];
          if (data && data.nextJobsResetAt) {
            const diff = new Date(data.nextJobsResetAt).getTime() - Date.now();
            resolve(diff > 0 ? Math.floor(diff / 1e3) : 0);
          } else {
            resolve(null);
          }
        });
      } catch (e) {
        resolve(null);
      }
    });
  }
  async function checkAutoRefresh() {
    try {
      if (!isContextValid()) return;
      if (_seqRefreshRunning || _autoJobsActive || !_initialFetchDone) return;
      let needsRefresh = false;
      let expiredMarkets = [];
      const now = Date.now();
      for (const key of ["home_jobs", "dark_jobs", "soyuz_jobs", "usol_jobs"]) {
        if (!autoRefreshSettings[key]) continue;
        if (autoRefreshRetryPending[key]) continue;
        const sec = await getMarketTimerSeconds(key);
        if (sec !== null && sec <= 0) {
          if (autoRefreshExpiredRetryAt[key] && now < autoRefreshExpiredRetryAt[key]) continue;
          needsRefresh = true;
          expiredMarkets.push(key);
        }
      }
      if (needsRefresh) {
        let onAllDone = function(evt) {
          if (evt.data && evt.data.type === "COR3_ALL_MARKETS_REFRESHED") {
            window.removeEventListener("message", onAllDone);
            setSeqRefreshRunning(false);
            for (const key of ["home_jobs", "dark_jobs", "soyuz_jobs", "usol_jobs"]) {
              autoRefreshRetryPending[key] = false;
            }
          }
        };
        setSeqRefreshRunning(true);
        for (const key of expiredMarkets) {
          autoRefreshRetryPending[key] = true;
          autoRefreshExpiredRetryAt[key] = now + 6e4;
        }
        var order = [];
        if (expiredMarkets.includes("usol_jobs")) order.push("usol");
        if (expiredMarkets.includes("soyuz_jobs")) order.push("soyuz");
        if (expiredMarkets.includes("dark_jobs")) order.push("dark");
        if (expiredMarkets.includes("home_jobs")) order.push("home");
        setMarketRefreshInProgress(true);
        setAutoUpdateMarketsLastRefresh(Date.now());
        var msg = { type: "COR3_REFRESH_ALL_MARKETS_SEQ" };
        if (order.length > 0) msg.order = order;
        window.postMessage(msg, "*");
        setTimeout(() => {
          setSeqRefreshRunning(false);
          for (const key of ["home_jobs", "dark_jobs", "soyuz_jobs", "usol_jobs"]) {
            autoRefreshRetryPending[key] = false;
          }
        }, 3e4);
        window.addEventListener("message", onAllDone);
      }
    } catch (e) {
      if (e.message && e.message.includes("Extension context invalidated")) return;
    }
  }
  var autoRefreshIntervalId = setInterval(() => checkAutoRefresh(), 1e3);

  // src/content/solvers.js
  var decryptSolverInjected = false;
  function injectDecryptSolver() {
    if (decryptSolverInjected) {
      window.postMessage({ type: "COR3_START_DECRYPT_SOLVER" }, "*");
      return;
    }
    decryptSolverInjected = true;
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("decrypt-solver.js");
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
  }
  function stopDecryptSolver() {
    window.postMessage({ type: "COR3_STOP_DECRYPT_SOLVER" }, "*");
    decryptSolverInjected = false;
  }
  var dailyHackInjected = false;
  function injectDailyHackSolver() {
    if (dailyHackInjected) {
      window.postMessage({ type: "COR3_STOP_DAILY_HACK" }, "*");
      dailyHackInjected = false;
      setTimeout(() => injectDailyHackSolver(), 300);
      return;
    }
    dailyHackInjected = true;
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("daily-hack-solver.js");
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
  }
  function stopDailyHackSolver() {
    window.postMessage({ type: "COR3_STOP_DAILY_HACK" }, "*");
    dailyHackInjected = false;
  }
  var iceWallSolverInjected = false;
  function injectIceWallSolver() {
    if (iceWallSolverInjected) {
      window.postMessage({ type: "COR3_START_ICE_WALL_SOLVER" }, "*");
      return;
    }
    iceWallSolverInjected = true;
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("ice-wall-solver.js");
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
  }
  function stopIceWallSolver() {
    window.postMessage({ type: "COR3_STOP_ICE_WALL_SOLVER" }, "*");
    iceWallSolverInjected = false;
  }
  var simpleDecryptSolverInjected = false;
  function injectSimpleDecryptSolver() {
    if (simpleDecryptSolverInjected) {
      window.postMessage({ type: "COR3_START_SIMPLE_DECRYPT_SOLVER" }, "*");
      return;
    }
    simpleDecryptSolverInjected = true;
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("simple-decrypt-solver.js");
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
  }
  function stopSimpleDecryptSolver() {
    window.postMessage({ type: "COR3_STOP_SIMPLE_DECRYPT_SOLVER" }, "*");
    simpleDecryptSolverInjected = false;
  }
  var autoJobSolverInjected = false;
  function injectAutoJobSolver() {
    if (autoJobSolverInjected) return;
    autoJobSolverInjected = true;
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("auto-job-solver.js");
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
    console.log("[COR3 Helper] Auto Job Solver engine injected");
  }
  var autoValuableSellerInjected = false;
  function injectAutoValuableSeller() {
    if (autoValuableSellerInjected) return;
    autoValuableSellerInjected = true;
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("auto-valuable-seller.js");
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
    console.log("[COR3 Helper] Auto Valuable Seller engine injected");
  }
  function ensureAntiAfkEnabled() {
    window.postMessage({ type: "COR3_ANTI_AFK_TOGGLE", enabled: true }, "*");
  }
  chrome.storage.sync.get(["autoDecryptEnabled", "autoIceWallEnabled", "autoSimpleDecryptEnabled"], (data) => {
    if (data.autoDecryptEnabled) {
      injectDecryptSolver();
    }
    if (data.autoIceWallEnabled) {
      injectIceWallSolver();
    }
    if (data.autoSimpleDecryptEnabled) {
      injectSimpleDecryptSolver();
    }
  });

  // src/content/dom-tweaks.js
  function deleteBackgroundElements() {
    const backgroundElements = [
      "#app-background",
      "#glitch-background",
      "#video-glitch",
      "#video-waves"
    ];
    backgroundElements.forEach((selector) => {
      try {
        const element = document.querySelector(selector);
        if (element) {
          element.remove();
          console.log("[COR3 Helper] Deleted background element:", selector);
        }
      } catch (e) {
      }
    });
  }
  chrome.storage.sync.get("disableBackground", (result) => {
    if (result.disableBackground) {
      setTimeout(() => {
        deleteBackgroundElements();
      }, 1e3);
    }
  });
  var networkFogObserver = null;
  function isNetworkMapVisible() {
    const divs = document.querySelectorAll("div");
    for (const div of divs) {
      if (div.textContent.trim() === "Network map") return true;
    }
    return false;
  }
  function hideNetworkFogVideos() {
    const videos = document.querySelectorAll("video");
    videos.forEach((v) => {
      const src = v.getAttribute("src") || "";
      if (src.includes("/video/network-map/fog.mp4") || src.includes("/video/network-map/fog_layer_2.mp4")) {
        v.style.display = "none";
        v.pause();
        v.setAttribute("data-cor3-fog-hidden", "true");
      }
    });
  }
  function showNetworkFogVideos() {
    const hiddenVideos = document.querySelectorAll('[data-cor3-fog-hidden="true"]');
    hiddenVideos.forEach((v) => {
      v.style.display = "";
      v.removeAttribute("data-cor3-fog-hidden");
      v.play().catch(() => {
      });
    });
  }
  function startNetworkFogObserver() {
    if (networkFogObserver) return;
    networkFogObserver = new MutationObserver(() => {
      if (isNetworkMapVisible()) {
        hideNetworkFogVideos();
      }
    });
    networkFogObserver.observe(document.body, { childList: true, subtree: true });
  }
  function stopNetworkFogObserver() {
    if (networkFogObserver) {
      networkFogObserver.disconnect();
      networkFogObserver = null;
    }
  }
  chrome.storage.sync.get("disableNetworkFog", (result) => {
    if (result.disableNetworkFog) {
      setTimeout(() => {
        hideNetworkFogVideos();
        startNetworkFogObserver();
      }, 1e3);
    }
  });
  var COR3_NOTIF_LEFT_STYLE_ID = "cor3-notifications-left-style";
  function applyNotificationsLeft() {
    if (document.getElementById(COR3_NOTIF_LEFT_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = COR3_NOTIF_LEFT_STYLE_ID;
    style.textContent = `
        .Toastify__toast-container--bottom-right {
            left: 16px !important;
            right: auto !important;
            margin-bottom: 35px;
        }
        [data-component-name="NotificationsHistory"] {
            left: 0 !important;
            right: auto !important;
            align-items: flex-start;
        }
        [data-component-name="NotificationsHistory"] > button:first-of-type {
            transform: scaleX(-1);
            display: flex;
        }
        [data-component-name="NotificationsHistory"] .sticker-content {
            color: transparent;               /* hide original text */
            position: relative;
        }
        [data-component-name="NotificationsHistory"] .sticker-content::before {
            content: "Notifications";         /* duplicate the word */
            position: absolute;
            left: 0;
            transform: scaleX(-1);
            color: #FFFFFF;   /* re\u2011apply the original colour */
            white-space: pre;                 /* keep spacing */
        }
        [data-component-name="NotificationsHistory"] .go3673730358,
        [data-component-name="NotificationsHistory"] > div:last-child {
            border-top-left-radius: 0px;
            border-top-right-radius: 16px;
        }
    `;
    (document.head || document.documentElement).appendChild(style);
  }
  function removeNotificationsLeft() {
    const el = document.getElementById(COR3_NOTIF_LEFT_STYLE_ID);
    if (el) el.remove();
  }
  chrome.storage.sync.get("moveNotificationsLeft", (result) => {
    if (result.moveNotificationsLeft) {
      setTimeout(() => {
        applyNotificationsLeft();
      }, 1e3);
    }
  });

  // src/content/log-writers.js
  init_helpers();
  var _autoJobLogQueue = [];
  var _autoJobLogFlushTimer = null;
  var _autoJobLogFlushing = false;
  function _flushAutoJobLogs() {
    _autoJobLogFlushTimer = null;
    if (_autoJobLogFlushing || _autoJobLogQueue.length === 0 || !isContextValid()) return;
    _autoJobLogFlushing = true;
    const pending3 = _autoJobLogQueue.splice(0);
    chrome.storage.local.get("autoJobsDebugLogs", (result) => {
      if (!isContextValid()) {
        _autoJobLogFlushing = false;
        return;
      }
      const logs = Array.isArray(result.autoJobsDebugLogs) ? result.autoJobsDebugLogs : [];
      for (const entry of pending3) logs.push(entry);
      if (logs.length > 200) logs.splice(0, logs.length - 200);
      chrome.storage.local.set({ autoJobsDebugLogs: logs }, () => {
        _autoJobLogFlushing = false;
        if (_autoJobLogQueue.length > 0) {
          _flushAutoJobLogs();
        }
      });
    });
  }
  function queueAutoJobLog(msg, level) {
    _autoJobLogQueue.push({ timestamp: (/* @__PURE__ */ new Date()).toISOString(), msg, level: level || "info" });
    if (!_autoJobLogFlushTimer && !_autoJobLogFlushing) {
      _autoJobLogFlushTimer = setTimeout(_flushAutoJobLogs, 100);
    }
    if (typeof cor3LogEntry === "function") cor3LogEntry("auto-jobs", msg, level || "info");
  }
  var _valuableLogQueue = [];
  var _valuableLogFlushTimer = null;
  var _valuableLogFlushing = false;
  function _flushValuableLogs() {
    _valuableLogFlushTimer = null;
    if (_valuableLogFlushing || _valuableLogQueue.length === 0 || !isContextValid()) return;
    _valuableLogFlushing = true;
    const pending3 = _valuableLogQueue.splice(0);
    chrome.storage.local.get("valuableDebugLogs", (result) => {
      if (!isContextValid()) {
        _valuableLogFlushing = false;
        return;
      }
      const logs = Array.isArray(result.valuableDebugLogs) ? result.valuableDebugLogs : [];
      for (const entry of pending3) logs.push(entry);
      if (logs.length > 200) logs.splice(0, logs.length - 200);
      chrome.storage.local.set({ valuableDebugLogs: logs }, () => {
        _valuableLogFlushing = false;
        if (_valuableLogQueue.length > 0) {
          _flushValuableLogs();
        }
      });
    });
  }
  function queueValuableLog(msg, level) {
    _valuableLogQueue.push({ timestamp: (/* @__PURE__ */ new Date()).toISOString(), msg, level: level || "info" });
    if (!_valuableLogFlushTimer && !_valuableLogFlushing) {
      _valuableLogFlushTimer = setTimeout(_flushValuableLogs, 100);
    }
    if (typeof cor3LogEntry === "function") cor3LogEntry("auto-valuable", msg, level || "info");
  }

  // src/content/ws-relay.js
  init_helpers();
  init_auto_update_markets();
  function fetchDailyRewards(token) {
    fetch("https://svc-corie.cor3.gg/api/user-daily-claim/rewards", {
      headers: { "Authorization": token }
    }).then((r) => r.ok ? r.json() : null).then((data) => {
      if (data && Array.isArray(data)) {
        chrome.storage.local.set({ dailyRewardsData: data });
      }
    }).catch(() => {
    });
  }
  function setupWsRelay() {
    window.addEventListener("message", (event) => {
      if (event.source !== window) return;
      if (!isContextValid()) return;
      const now = Date.now();
      if (event.data && event.data.type === "COR3_WS_LOG") {
        cor3LogWsMessage(event.data.direction, event.data.message);
      }
      if (event.data && event.data.type === "COR3_WS_EXPEDITIONS") {
        chrome.storage.local.set({ expeditionsData: event.data.expeditions, expeditionsDataUpdatedAt: now });
        var exps = event.data.expeditions || [];
        var hasActive = exps.some(function(e) {
          return e.status === "IN_PROGRESS";
        });
        if (!hasActive) {
          chrome.storage.local.get("expeditionLaunchError", function(result) {
            if (result.expeditionLaunchError && !result.expeditionLaunchError.noRetry) {
              console.log("[COR3 Helper] No active expeditions \u2014 clearing expedition launch error");
              chrome.storage.local.remove("expeditionLaunchError");
            }
          });
        }
      }
      if (event.data && event.data.type === "COR3_WS_DECISIONS") {
        chrome.storage.local.set({ expeditionDecisions: event.data.decisions });
      }
      if (event.data && event.data.type === "COR3_WS_SPECIALISTS") {
        chrome.storage.local.set({ specialistsData: event.data.data, specialistsDataUpdatedAt: now });
      }
      if (event.data && event.data.type === "COR3_WS_STASH") {
        chrome.storage.local.set({ stashData: event.data.stash, stashDataUpdatedAt: now });
      }
      if (event.data && event.data.type === "COR3_WS_MARKET") {
        chrome.storage.local.set({ marketData: event.data.market, marketDataUpdatedAt: now });
      }
      if (event.data && event.data.type === "COR3_WS_DARK_MARKET") {
        chrome.storage.local.set({ darkMarketData: event.data.market, darkMarketAvailable: true, darkMarketDataUpdatedAt: now });
      }
      if (event.data && event.data.type === "COR3_WS_SOYUZ_MARKET") {
        chrome.storage.local.set({ soyuzMarketData: event.data.market, soyuzMarketAvailable: true, soyuzMarketDataUpdatedAt: now });
      }
      if (event.data && event.data.type === "COR3_WS_USOL_MARKET") {
        chrome.storage.local.set({ usolMarketData: event.data.market, usolMarketAvailable: true, usolMarketDataUpdatedAt: now });
      }
      if (event.data && event.data.type === "COR3_WS_LOADOUT") {
        chrome.storage.local.set({ loadoutData: event.data.loadout, loadoutAction: event.data.action, loadoutUpdatedAt: now, loadoutError: null });
      }
      if (event.data && event.data.type === "COR3_WS_LOADOUT_ERROR") {
        chrome.storage.local.set({ loadoutError: event.data.error, loadoutErrorAction: event.data.action, loadoutUpdatedAt: now });
      }
      if (event.data && event.data.type === "COR3_WS_DARK_MARKET_UNREACHABLE") {
        chrome.storage.local.set({ darkMarketAvailable: false, darkMarketDataUpdatedAt: now, darkMarketMaintenanceEndsAt: event.data.maintenanceEndsAt || null, darkMarketBlockerServer: event.data.blockerServerName || null });
      }
      if (event.data && event.data.type === "COR3_WS_SOYUZ_MARKET_UNREACHABLE") {
        chrome.storage.local.set({ soyuzMarketAvailable: false, soyuzMarketDataUpdatedAt: now, soyuzMarketMaintenanceEndsAt: event.data.maintenanceEndsAt || null, soyuzMarketBlockerServer: event.data.blockerServerName || null });
      }
      if (event.data && event.data.type === "COR3_WS_USOL_MARKET_UNREACHABLE") {
        chrome.storage.local.set({ usolMarketAvailable: false, usolMarketDataUpdatedAt: now, usolMarketMaintenanceEndsAt: event.data.maintenanceEndsAt || null, usolMarketBlockerServer: event.data.blockerServerName || null });
      }
      if (event.data && event.data.type === "COR3_BEARER_TOKEN") {
        chrome.storage.local.get("bearerToken", (prev) => {
          const isNew = !prev.bearerToken || prev.bearerToken !== event.data.token;
          chrome.storage.local.set({ bearerToken: event.data.token });
          if (isNew) {
            fetch("https://svc-corie.cor3.gg/api/user-daily-claim", {
              headers: { "Authorization": event.data.token }
            }).then((r) => r.ok ? r.json() : null).then((data) => {
              if (data) chrome.storage.local.set({ dailyOpsData: data, dailyOpsUpdatedAt: Date.now(), dailyOpsError: null });
            }).catch(() => {
            });
          }
        });
      }
      if (event.data && event.data.type === "COR3_WEB_VERSION") {
        chrome.storage.local.set({ webVersion: event.data.version });
      }
      if (event.data && event.data.type === "COR3_SYSTEM_VERSION") {
        chrome.storage.local.set({ systemVersion: event.data.version });
      }
      if (event.data && event.data.type === "COR3_PATCH_VERSION") {
        chrome.storage.local.set({ patchVersion: event.data.version });
      }
      if (event.data && event.data.type === "COR3_DAILY_REWARDS") {
        chrome.storage.local.set({ dailyRewardsData: event.data.rewards });
      }
      if (event.data && event.data.type === "COR3_WS_ARCHIVED_EXPEDITIONS") {
        chrome.storage.local.set({ archivedExpeditionsData: event.data.data, archivedExpeditionsUpdatedAt: now });
      }
      if (event.data && event.data.type === "COR3_WS_MERCENARIES") {
        chrome.storage.local.set({ mercenariesData: event.data.data, mercenariesUpdatedAt: now });
      }
      if (event.data && event.data.type === "COR3_CORE_MERCS_DONE") {
        chrome.storage.local.set({ coreMercsDone: Date.now() });
      }
      if (event.data && event.data.type === "COR3_USOL_MERCS_DONE") {
        chrome.storage.local.set({ usolMercsDone: Date.now() });
      }
      if (event.data && event.data.type === "COR3_WS_USOL_MERCENARIES") {
        chrome.storage.local.set({ usolMercenariesData: event.data.data, usolMercenariesUpdatedAt: now });
      }
      if (event.data && event.data.type === "COR3_WS_MERC_CONFIGURE" && event.data.mercenaryId) {
        chrome.storage.local.get("mercConfigData", (result) => {
          const configs = result.mercConfigData || {};
          configs[event.data.mercenaryId] = event.data.data;
          chrome.storage.local.set({ mercConfigData: configs, mercConfigUpdatedAt: now });
        });
      }
      if (event.data && event.data.type === "COR3_WS_EXPEDITION_ARCHIVED") {
        const archivedId = event.data.data && (event.data.data.expeditionId || event.data.data.id);
        if (archivedId) {
          chrome.storage.local.get("expeditionsData", (result) => {
            const exps2 = result.expeditionsData || [];
            const filtered = exps2.filter((e) => e.id !== archivedId);
            chrome.storage.local.set({ expeditionsData: filtered, expeditionsDataUpdatedAt: now });
          });
        }
      }
      if (event.data && event.data.type === "COR3_WS_EXPEDITION_CONFIG") {
        chrome.storage.local.set({ expeditionConfigData: event.data.data });
      }
      if (event.data && event.data.type === "COR3_WS_USOL_EXPEDITION_CONFIG") {
        chrome.storage.local.set({ usolExpeditionConfigData: event.data.data });
      }
      if (event.data && event.data.type === "COR3_DAILY_HACK_LOG") {
        chrome.storage.local.set({
          dailyHackLog: event.data.message,
          dailyHackLogUpdatedAt: Date.now()
        });
      }
      if (event.data && event.data.type === "COR3_DAILY_HACK_DISABLE_TOGGLE") {
        chrome.storage.sync.set({ autoDailyHackEnabled: false });
      }
      if (event.data && event.data.type === "COR3_FETCH_DAILY_OPS") {
        console.log("[COR3 Helper] Requesting daily ops data");
        chrome.storage.local.get("bearerToken", (result) => {
          const token = result.bearerToken;
          if (!token) return;
          fetch("https://svc-corie.cor3.gg/api/user-daily-claim", {
            headers: { "Authorization": token }
          }).then((r) => {
            if (r.ok) return r.json();
            if (r.status === 400 || r.status === 401 || r.status === 403) {
              chrome.storage.local.set({ dailyOpsError: "token_expired", dailyOpsErrorUpdatedAt: Date.now() });
              return null;
            }
            return null;
          }).then((data) => {
            if (data) {
              chrome.storage.local.set({ dailyOpsData: data, dailyOpsUpdatedAt: Date.now(), dailyOpsError: null });
              fetchDailyRewards(token);
            }
          }).catch(() => {
          });
        });
      }
    });
  }

  // src/content/message-listener.js
  init_helpers();

  // src/shared/features.js
  var ALARMS_ENABLED = false;

  // src/content/alarms.js
  init_helpers();
  var alarms = [];
  var alarmTriggered = {};
  var audioContext = null;
  var continuousInterval = null;
  var isAlarmActive = false;
  var alarmsIntervalId = null;
  chrome.storage.sync.get("alarms", (data) => {
    alarms = ALARMS_ENABLED ? data.alarms || [] : [];
  });
  function setAlarms(v) {
    alarms = ALARMS_ENABLED ? v : [];
  }
  function resetAlarmTriggered() {
    alarmTriggered = {};
  }
  function playAlarm(volumePercent) {
    if (!ALARMS_ENABLED) return;
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContext.state === "suspended") {
      audioContext.resume();
    }
    const now = audioContext.currentTime;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(volumePercent / 100, now);
    gain.gain.exponentialRampToValueAtTime(1e-3, now + 0.5);
    osc.connect(gain);
    gain.connect(audioContext.destination);
    osc.start();
    osc.stop(now + 0.5);
  }
  function startContinuousAlarm(volume) {
    if (!ALARMS_ENABLED) return;
    if (continuousInterval) clearInterval(continuousInterval);
    isAlarmActive = true;
    chrome.runtime.sendMessage({ action: "alarmActiveStatus", isActive: true }).catch(() => {
    });
    playAlarm(volume);
    continuousInterval = setInterval(() => {
      playAlarm(volume);
    }, 2e3);
  }
  function stopAlarm() {
    if (continuousInterval) {
      clearInterval(continuousInterval);
      continuousInterval = null;
    }
    isAlarmActive = false;
    chrome.runtime.sendMessage({ action: "alarmActiveStatus", isActive: false }).catch(() => {
    });
  }
  function getTimerRemainingSeconds(timerSource) {
    return new Promise((resolve) => {
      if (!isContextValid()) {
        resolve(null);
        return;
      }
      if (timerSource === "daily") {
        chrome.storage.local.get("dailyOpsData", (result) => {
          if (result.dailyOpsData && result.dailyOpsData.nextTaskTime) {
            const diff = new Date(result.dailyOpsData.nextTaskTime).getTime() - Date.now();
            resolve(diff > 0 ? Math.floor(diff / 1e3) : 0);
          } else {
            resolve(null);
          }
        });
      } else if (timerSource === "home_jobs") {
        chrome.storage.local.get("marketData", (result) => {
          if (result.marketData && result.marketData.nextJobsResetAt) {
            const diff = new Date(result.marketData.nextJobsResetAt).getTime() - Date.now();
            resolve(diff > 0 ? Math.floor(diff / 1e3) : 0);
          } else {
            resolve(null);
          }
        });
      } else if (timerSource === "dark_jobs") {
        chrome.storage.local.get("darkMarketData", (result) => {
          if (result.darkMarketData && result.darkMarketData.nextJobsResetAt) {
            const diff = new Date(result.darkMarketData.nextJobsResetAt).getTime() - Date.now();
            resolve(diff > 0 ? Math.floor(diff / 1e3) : 0);
          } else {
            resolve(null);
          }
        });
      } else if (timerSource === "soyuz_jobs") {
        chrome.storage.local.get("soyuzMarketData", (result) => {
          if (result.soyuzMarketData && result.soyuzMarketData.nextJobsResetAt) {
            const diff = new Date(result.soyuzMarketData.nextJobsResetAt).getTime() - Date.now();
            resolve(diff > 0 ? Math.floor(diff / 1e3) : 0);
          } else {
            resolve(null);
          }
        });
      } else if (timerSource === "usol_jobs") {
        chrome.storage.local.get("usolMarketData", (result) => {
          if (result.usolMarketData && result.usolMarketData.nextJobsResetAt) {
            const diff = new Date(result.usolMarketData.nextJobsResetAt).getTime() - Date.now();
            resolve(diff > 0 ? Math.floor(diff / 1e3) : 0);
          } else {
            resolve(null);
          }
        });
      } else if (timerSource.startsWith("exp_")) {
        const expId = timerSource.substring(4);
        chrome.storage.local.get("expeditionsData", (result) => {
          const exps = result.expeditionsData || [];
          const exp = exps.find((e) => e.id === expId);
          if (exp && exp.endTime) {
            const diff = new Date(exp.endTime).getTime() - Date.now();
            resolve(diff > 0 ? Math.floor(diff / 1e3) : 0);
          } else {
            resolve(null);
          }
        });
      } else {
        resolve(null);
      }
    });
  }
  async function checkAlarms() {
    try {
      if (!isContextValid()) return;
      for (const alarm of alarms) {
        if (!alarm.enabled || alarm.thresholdSeconds <= 0) continue;
        const remaining = await getTimerRemainingSeconds(alarm.timerSource);
        if (remaining === null) continue;
        if (remaining <= alarm.thresholdSeconds && remaining > 0 && !alarmTriggered[alarm.id]) {
          alarmTriggered[alarm.id] = true;
          if (alarm.continuous) {
            startContinuousAlarm(alarm.volume);
          } else {
            playAlarm(alarm.volume);
          }
        } else if (remaining > alarm.thresholdSeconds) {
          alarmTriggered[alarm.id] = false;
        }
      }
    } catch (e) {
      if (e.message && e.message.includes("Extension context invalidated")) return;
    }
  }
  if (ALARMS_ENABLED) alarmsIntervalId = setInterval(() => checkAlarms(), 1e3);

  // src/content/message-listener.js
  init_auto_update_markets();
  function fetchDailyRewards2(token) {
    fetch("https://svc-corie.cor3.gg/api/user-daily-claim/rewards", {
      headers: { "Authorization": token }
    }).then((r) => r.ok ? r.json() : null).then((data) => {
      if (data && Array.isArray(data)) {
        chrome.storage.local.set({ dailyRewardsData: data });
      }
    }).catch(() => {
    });
  }
  function setupMessageListener() {
    chrome.runtime.onMessage.addListener((request2, sender, sendResponse) => {
      if (request2.action === "updateAlarms") {
        setAlarms(request2.alarms || []);
        resetAlarmTriggered();
        sendResponse({ success: true });
      } else if (request2.action === "testAlarm") {
        const vol = request2.volume !== void 0 ? request2.volume : 50;
        if (request2.continuous) {
          startContinuousAlarm(vol);
        } else {
          playAlarm(vol);
        }
        sendResponse({ success: true });
      } else if (request2.action === "stopAlarm") {
        stopAlarm();
        sendResponse({ success: true });
      } else if (request2.action === "requestExpeditions") {
        window.postMessage({ type: "COR3_REQUEST_EXPEDITIONS" }, "*");
        sendResponse({ success: true });
      } else if (request2.action === "requestNetworkMap") {
        window.postMessage({ type: "COR3_REQUEST_NETWORK_MAP" }, "*");
        sendResponse({ success: true });
      } else if (request2.action === "devTcTestReachability") {
        window.postMessage({ type: "COR3_DEV_TC_TEST_REACHABILITY", serverId: request2.serverId }, "*");
        sendResponse({ success: true });
      } else if (request2.action === "requestStash") {
        window.postMessage({ type: "COR3_REQUEST_STASH" }, "*");
        sendResponse({ success: true });
      } else if (request2.action === "requestSpecialists") {
        window.postMessage({ type: "COR3_REQUEST_SPECIALISTS" }, "*");
        sendResponse({ success: true });
      } else if (request2.action === "purchaseSpecialist") {
        window.postMessage({ type: "COR3_PURCHASE_SPECIALIST", specialistType: request2.specialistType, kind: request2.kind, level: request2.level, priceId: request2.priceId }, "*");
        sendResponse({ success: true });
      } else if (request2.action === "requestLoadout") {
        window.postMessage({ type: "COR3_REQUEST_LOADOUT" }, "*");
        sendResponse({ success: true });
      } else if (request2.action === "equipHardware") {
        window.postMessage({ type: "COR3_EQUIP_HARDWARE", moduleConfigId: request2.moduleConfigId }, "*");
        sendResponse({ success: true });
      } else if (request2.action === "equipSoftware") {
        window.postMessage({ type: "COR3_EQUIP_SOFTWARE", moduleConfigId: request2.moduleConfigId }, "*");
        sendResponse({ success: true });
      } else if (request2.action === "unequipSoftware") {
        window.postMessage({ type: "COR3_UNEQUIP_SOFTWARE", moduleConfigId: request2.moduleConfigId }, "*");
        sendResponse({ success: true });
      } else if (request2.action === "requestMarket") {
        window.postMessage({ type: "COR3_REQUEST_MARKET" }, "*");
        sendResponse({ success: true });
      } else if (request2.action === "refreshMarket") {
        setMarketRefreshInProgress(true);
        setAutoUpdateMarketsLastRefresh(Date.now());
        setTimeout(() => {
          setMarketRefreshInProgress(false);
        }, 1e4);
        window.postMessage({ type: "COR3_REFRESH_MARKET" }, "*");
        sendResponse({ success: true });
      } else if (request2.action === "requestDarkMarket") {
        window.postMessage({ type: "COR3_REQUEST_DARK_MARKET" }, "*");
        sendResponse({ success: true });
      } else if (request2.action === "refreshDarkMarket") {
        setMarketRefreshInProgress(true);
        setAutoUpdateMarketsLastRefresh(Date.now());
        setTimeout(() => {
          setMarketRefreshInProgress(false);
        }, 1e4);
        window.postMessage({ type: "COR3_REFRESH_DARK_MARKET" }, "*");
        sendResponse({ success: true });
      } else if (request2.action === "requestSoyuzMarket") {
        window.postMessage({ type: "COR3_REQUEST_SOYUZ_MARKET" }, "*");
        sendResponse({ success: true });
      } else if (request2.action === "refreshSoyuzMarket") {
        setMarketRefreshInProgress(true);
        setAutoUpdateMarketsLastRefresh(Date.now());
        setTimeout(() => {
          setMarketRefreshInProgress(false);
        }, 1e4);
        window.postMessage({ type: "COR3_REFRESH_SOYUZ_MARKET" }, "*");
        sendResponse({ success: true });
      } else if (request2.action === "requestUsolMarket") {
        window.postMessage({ type: "COR3_REQUEST_USOL_MARKET" }, "*");
        sendResponse({ success: true });
      } else if (request2.action === "refreshUsolMarket") {
        setMarketRefreshInProgress(true);
        setAutoUpdateMarketsLastRefresh(Date.now());
        setTimeout(() => {
          setMarketRefreshInProgress(false);
        }, 1e4);
        window.postMessage({ type: "COR3_REFRESH_USOL_MARKET" }, "*");
        sendResponse({ success: true });
      } else if (request2.action === "refreshAllMarketsSeq") {
        setMarketRefreshInProgress(true);
        setAutoUpdateMarketsLastRefresh(Date.now());
        var msg = { type: "COR3_REFRESH_ALL_MARKETS_SEQ" };
        if (request2.skipLots) msg.skipLots = true;
        if (request2.order) msg.order = request2.order;
        window.postMessage(msg, "*");
        sendResponse({ success: true });
      } else if (request2.action === "leaveStash") {
        window.postMessage({ type: "COR3_LEAVE_STASH" }, "*");
        sendResponse({ success: true });
      } else if (request2.action === "sellItem") {
        window.postMessage({ type: "COR3_SELL_ITEM", itemId: request2.itemId, quantity: request2.quantity || 1 }, "*");
        sendResponse({ success: true });
      } else if (request2.action === "keepWorkerAlive") {
        window.postMessage({ type: "COR3_KEEP_ALIVE" }, "*");
        sendResponse({ success: true });
      } else if (request2.action === "updateAutoRefresh") {
        if (request2.autoRefresh) {
          setAutoRefreshSettings(request2.autoRefresh);
        }
        sendResponse({ success: true });
      } else if (request2.action === "toggleDecryptSolver") {
        if (request2.enabled) {
          ensureAntiAfkEnabled();
          injectDecryptSolver();
        } else {
          stopDecryptSolver();
        }
        sendResponse({ success: true });
      } else if (request2.action === "toggleIceWallSolver") {
        if (request2.enabled) {
          ensureAntiAfkEnabled();
          injectIceWallSolver();
        } else {
          stopIceWallSolver();
        }
        sendResponse({ success: true });
      } else if (request2.action === "toggleSimpleDecryptSolver") {
        if (request2.enabled) {
          ensureAntiAfkEnabled();
          injectSimpleDecryptSolver();
        } else {
          stopSimpleDecryptSolver();
        }
        sendResponse({ success: true });
      } else if (request2.action === "toggleDailyHackSolver") {
        if (request2.enabled) {
          chrome.storage.local.get("bearerToken", (result2) => {
            const token = result2.bearerToken;
            if (!token) {
              ensureAntiAfkEnabled();
              injectDailyHackSolver();
              return;
            }
            fetch("https://svc-corie.cor3.gg/api/user-daily-claim", { headers: { "Authorization": token } }).then((r) => r.ok ? r.json() : null).then((data) => {
              if (data) {
                chrome.storage.local.set({ dailyOpsData: data, dailyOpsUpdatedAt: Date.now() });
                fetchDailyRewards2(token);
              }
              if (data && data.hasClaimedToday) {
                console.log("[COR3 Helper] Daily already claimed \u2014 skipping solver");
                chrome.storage.sync.set({ autoDailyHackEnabled: false });
                chrome.storage.local.set({ dailyHackLog: "Daily already claimed today \u2014 skipping automation.", dailyHackLogUpdatedAt: Date.now() });
                return;
              }
              ensureAntiAfkEnabled();
              injectDailyHackSolver();
            }).catch(() => {
              ensureAntiAfkEnabled();
              injectDailyHackSolver();
            });
          });
        } else {
          stopDailyHackSolver();
        }
        sendResponse({ success: true });
      } else if (request2.action === "respondDecision") {
        window.postMessage({
          type: "COR3_RESPOND_DECISION",
          expeditionId: request2.expeditionId,
          messageId: request2.messageId,
          selectedOption: request2.selectedOption
        }, "*");
        sendResponse({ success: true });
      } else if (request2.action === "requestArchivedExpeditions") {
        window.postMessage({ type: "COR3_REQUEST_ARCHIVED_EXPEDITIONS" }, "*");
        sendResponse({ success: true });
      } else if (request2.action === "requestMercenaries") {
        window.postMessage({ type: "COR3_REQUEST_MERCENARIES" }, "*");
        sendResponse({ success: true });
      } else if (request2.action === "requestUsolMercenaries") {
        window.postMessage({ type: "COR3_REQUEST_USOL_MERCENARIES" }, "*");
        sendResponse({ success: true });
      } else if (request2.action === "requestExpeditionConfig") {
        window.postMessage({ type: "COR3_REQUEST_EXPEDITION_CONFIG", mercenaryId: request2.mercenaryId }, "*");
        sendResponse({ success: true });
      } else if (request2.action === "launchExpedition") {
        chrome.storage.local.set({ lastExpeditionLaunchData: request2.config });
        window.postMessage({ type: "COR3_LAUNCH_EXPEDITION", config: request2.config }, "*");
        sendResponse({ success: true });
      } else if (request2.action === "openContainer") {
        window.postMessage({ type: "COR3_OPEN_CONTAINER", expeditionId: request2.expeditionId }, "*");
        sendResponse({ success: true });
      } else if (request2.action === "collectAll") {
        window.postMessage({ type: "COR3_COLLECT_ALL", expeditionId: request2.expeditionId }, "*");
        sendResponse({ success: true });
      } else if (request2.action === "fetchDailyOps") {
        chrome.storage.local.get("bearerToken", (result2) => {
          const token = result2.bearerToken;
          if (!token) {
            sendResponse({ error: "no token" });
            return;
          }
          fetch("https://svc-corie.cor3.gg/api/user-daily-claim", {
            headers: { "Authorization": token }
          }).then((r) => {
            if (r.ok) return r.json();
            if (r.status === 400 || r.status === 401 || r.status === 403) return r.json().then((d) => {
              throw new Error(d.message || "token_expired");
            }).catch(() => {
              throw new Error("token_expired");
            });
            return null;
          }).then((data) => {
            if (data) {
              chrome.storage.local.set({ dailyOpsData: data, dailyOpsUpdatedAt: Date.now() });
              fetchDailyRewards2(token);
            }
            sendResponse({ data });
          }).catch((e) => {
            cor3LogError("content.js", e, { action: "fetchDailyOps" });
            sendResponse({ error: e.message || "fetch failed" });
          });
        });
        return true;
      } else if (request2.action === "disableBackground") {
        chrome.storage.sync.set({ disableBackground: true });
        deleteBackgroundElements();
        console.log("[COR3 Helper] Background elements deleted");
        sendResponse({ success: true });
      } else if (request2.action === "enableBackground") {
        chrome.storage.sync.set({ disableBackground: false });
        console.log("[COR3 Helper] Background elements will be restored on page reload");
        sendResponse({ success: true });
      } else if (request2.action === "disableNetworkFog") {
        chrome.storage.sync.set({ disableNetworkFog: true });
        startNetworkFogObserver();
        hideNetworkFogVideos();
        console.log("[COR3 Helper] Network fog disabled");
        sendResponse({ success: true });
      } else if (request2.action === "enableNetworkFog") {
        chrome.storage.sync.set({ disableNetworkFog: false });
        stopNetworkFogObserver();
        showNetworkFogVideos();
        console.log("[COR3 Helper] Network fog re-enabled");
        sendResponse({ success: true });
      } else if (request2.action === "moveNotificationsLeft") {
        chrome.storage.sync.set({ moveNotificationsLeft: true });
        applyNotificationsLeft();
        console.log("[COR3 Helper] Notifications moved to left");
        sendResponse({ success: true });
      } else if (request2.action === "moveNotificationsRight") {
        chrome.storage.sync.set({ moveNotificationsLeft: false });
        removeNotificationsLeft();
        console.log("[COR3 Helper] Notifications moved back to right");
        sendResponse({ success: true });
      } else if (request2.action === "getVersionFallbacks") {
        sendResponse({
          webVersion: window.__cor3WebVersion,
          systemVersion: window.__cor3SystemVersion,
          patchVersion: window.__cor3PatchVersion
        });
      } else if (request2.action === "startAutoJobs") {
        ensureAntiAfkEnabled();
        const jobs = request2.jobs;
        const settings2 = request2.settings || {};
        const result2 = _automationEnqueue("auto-jobs", () => {
          setAutoJobsActive(true);
          injectAutoJobSolver();
          setTimeout(() => {
            chrome.storage.sync.get("autoJobLoadoutMode", (modeData) => {
              settings2.loadoutMode = modeData.autoJobLoadoutMode === "software" ? "software" : "auto";
              chrome.storage.local.get("autoJobsLockedJobs", (lockData) => {
                var lockedJobs = lockData.autoJobsLockedJobs;
                if (lockedJobs && lockedJobs.length > 0) {
                  var now = Date.now();
                  var stillLocked = lockedJobs.filter((j) => j.lockExpiresAt && new Date(j.lockExpiresAt).getTime() > now);
                  var expired = lockedJobs.length - stillLocked.length;
                  settings2.lockedJobs = stillLocked;
                  chrome.storage.local.set({ autoJobsLockedJobs: stillLocked });
                  if (expired > 0) console.log("[COR3 Helper] Pruned " + expired + " expired lock(s) from autoJobsLockedJobs");
                  if (stillLocked.length > 0) console.log("[COR3 Helper] Passing " + stillLocked.length + " locked job(s) to solver");
                }
                window.postMessage({ type: "COR3_AUTOJOB_START", jobs, settings: settings2 }, "*");
              });
            });
          }, 500);
        });
        sendResponse({ success: true, queueResult: result2, queueStatus: Promise.resolve().then(() => (init_helpers(), helpers_exports)).then((m) => m._automationQueueStatus()) });
      } else if (request2.action === "stopAutoJobs") {
        setAutoJobsActive(false);
        setAutomationQueue(getAutomationQueue().filter((q) => q.type !== "auto-jobs"));
        window.postMessage({ type: "COR3_AUTOJOB_STOP" }, "*");
        _automationFinish("auto-jobs");
        sendResponse({ success: true });
      } else if (request2.action === "enableHackSolvers") {
        ensureAntiAfkEnabled();
        injectDecryptSolver();
        injectIceWallSolver();
        injectSimpleDecryptSolver();
        sendResponse({ success: true });
      } else if (request2.action === "dismissFailedJobs") {
        var dismissJobs = request2.jobs || [];
        var dismissMarketKey = request2.marketKey || "";
        var dismissStorageKey = { home: "marketData", dark: "darkMarketData", soyuz: "soyuzMarketData", usol: "usolMarketData" }[dismissMarketKey] || "";
        var dismissRefreshType = { home: "COR3_REFRESH_MARKET", dark: "COR3_REFRESH_DARK_MARKET", soyuz: "COR3_REFRESH_SOYUZ_MARKET", usol: "COR3_REFRESH_USOL_MARKET" }[dismissMarketKey] || "";
        var result = _automationEnqueue("clear-failed-jobs", function() {
          (async function() {
            try {
              for (var i = 0; i < dismissJobs.length; i++) {
                window.postMessage({ type: "COR3_AUTOJOB_CMD", cmd: "job.dismiss", data: dismissJobs[i] }, "*");
                if (dismissStorageKey) {
                  var fresh = await chrome.storage.local.get(dismissStorageKey);
                  var freshMd = fresh[dismissStorageKey];
                  if (freshMd && freshMd.recentJobs) {
                    freshMd.recentJobs = freshMd.recentJobs.filter(function(j) {
                      return j.id !== dismissJobs[i].jobId;
                    });
                    await chrome.storage.local.set({ [dismissStorageKey]: freshMd });
                  }
                }
                await new Promise(function(r) {
                  setTimeout(r, 500);
                });
              }
              await new Promise(function(r) {
                setTimeout(r, 2e3);
              });
              if (dismissRefreshType) {
                setMarketRefreshInProgress(true);
                setAutoUpdateMarketsLastRefresh(Date.now());
                setTimeout(function() {
                  setMarketRefreshInProgress(false);
                }, 1e4);
                window.postMessage({ type: dismissRefreshType }, "*");
              }
            } catch (e) {
              console.log("[COR3 Helper] dismissFailedJobs error:", e);
            } finally {
              _automationFinish("clear-failed-jobs");
            }
          })();
        });
        sendResponse({ success: true, queueResult: result });
      } else if (request2.action === "devtoolsSendWs") {
        window.postMessage({ type: "COR3_DEVTOOLS_WS_SEND", message: request2.message }, "*");
        sendResponse({ success: true });
      } else if (request2.action === "startValuableSearch") {
        ensureAntiAfkEnabled();
        const result2 = _automationEnqueue("auto-valuable", () => {
          injectAutoValuableSeller();
          setTimeout(() => {
            window.postMessage({ type: "COR3_VALUABLE_START_SEARCH" }, "*");
          }, 500);
        });
        sendResponse({ success: true, queueResult: result2 });
      } else if (request2.action === "startValuableSeller") {
        ensureAntiAfkEnabled();
        const selServers = request2.selectedServers || [];
        const selDownloads = request2.selectedDownloads || [];
        const result2 = _automationEnqueue("auto-valuable", () => {
          injectAutoValuableSeller();
          setTimeout(() => {
            window.postMessage({
              type: "COR3_VALUABLE_START_SELLER",
              selectedServers: selServers,
              selectedDownloads: selDownloads
            }, "*");
          }, 500);
        });
        sendResponse({ success: true, queueResult: result2 });
      } else if (request2.action === "stopValuable") {
        setAutomationQueue(getAutomationQueue().filter((q) => q.type !== "auto-valuable"));
        window.postMessage({ type: "COR3_VALUABLE_STOP" }, "*");
        _automationFinish("auto-valuable");
        sendResponse({ success: true });
      } else if (request2.action === "forceMaintenanceBatch") {
        injectAutoValuableSeller();
        setTimeout(() => {
          window.postMessage({
            type: "COR3_VALUABLE_FORCE_MAINTENANCE_BATCH",
            servers: request2.servers
          }, "*");
        }, 500);
        sendResponse({ success: true });
      } else if (request2.action === "startIpSearch") {
        window.postMessage({ type: "COR3_IP_SEARCH_START" }, "*");
        sendResponse({ success: true });
      } else if (request2.action === "fetchDailyOps") {
        window.postMessage({ type: "COR3_FETCH_DAILY_OPS" }, "*");
        sendResponse({ success: true });
      }
    });
  }

  // src/content/engine-relay.js
  init_helpers();
  init_auto_update_markets();
  function setupEngineRelay() {
    window.addEventListener("message", (event) => {
      if (event.source !== window) return;
      if (!isContextValid()) return;
      if (event.data && event.data.type === "COR3_AUTOJOB_ENABLE_DECRYPT_SOLVER") {
        chrome.storage.sync.get("autoDecryptEnabled", (result) => {
          if (!result.autoDecryptEnabled) {
            chrome.storage.sync.set({ autoDecryptEnabled: true });
            console.log("[COR3 Helper] Auto Job: Enabling decrypt solver for minigame");
          }
          injectDecryptSolver();
        });
      }
      if (event.data && event.data.type === "COR3_ICE_WALL_STATUS") {
        chrome.storage.local.set({
          iceWallSolverStatus: {
            message: event.data.message,
            level: event.data.level || "info",
            timestamp: Date.now()
          }
        });
      }
      if (event.data && event.data.type === "COR3_SIMPLE_DECRYPT_STATUS") {
        chrome.storage.local.set({
          simpleDecryptSolverStatus: {
            message: event.data.message,
            level: event.data.level || "info",
            timestamp: Date.now()
          }
        });
      }
      if (event.data && event.data.type === "COR3_AUTOJOB_ENABLE_SIMPLE_DECRYPT_SOLVER") {
        chrome.storage.sync.get("autoSimpleDecryptEnabled", (result) => {
          if (!result.autoSimpleDecryptEnabled) {
            chrome.storage.sync.set({ autoSimpleDecryptEnabled: true });
            console.log("[COR3 Helper] Auto Job: Enabling Simple Decrypt solver for minigame");
          }
          injectSimpleDecryptSolver();
        });
      }
      if (event.data && event.data.type === "COR3_AUTOJOB_ENABLE_ICE_WALL_SOLVER") {
        chrome.storage.sync.get("autoIceWallEnabled", (result) => {
          if (!result.autoIceWallEnabled) {
            chrome.storage.sync.set({ autoIceWallEnabled: true });
            console.log("[COR3 Helper] Auto Job: Enabling ICE Wall solver for minigame");
          }
          injectIceWallSolver();
        });
      }
      if (event.data && event.data.type === "COR3_AUTOJOB_LOG") {
        queueAutoJobLog(event.data.msg, event.data.level);
      }
      if (event.data && event.data.type === "COR3_WS_NETWORK_MAP") {
        chrome.storage.local.set({ serverMaintenanceMap: event.data.servers });
      }
      if (event.data && event.data.type === "COR3_DEV_TC_REACH_PROGRESS") {
        chrome.storage.local.set({ _devTcReachProgress: { log: event.data.log || [] } });
      }
      if (event.data && event.data.type === "COR3_DEV_TC_REACH_RESULT") {
        chrome.storage.local.set({ _devTcReachResult: { reachable: event.data.reachable, reason: event.data.reason || null, log: event.data.log || [] } });
      }
      if (event.data && event.data.type === "COR3_IP_SEARCH_LOG") {
        if (isContextValid()) {
          try {
            chrome.storage.local.set({ secretFinderLog: event.data.html });
          } catch (e) {
          }
        }
      }
      if (event.data && event.data.type === "COR3_IP_SEARCH_DONE") {
        if (isContextValid()) {
          try {
            chrome.storage.local.set({ secretFinderLog: event.data.html });
            chrome.storage.sync.set({ secretFinderEnabled: false });
          } catch (e) {
          }
        }
      }
      if (event.data && event.data.type === "COR3_AUTOJOB_TRACKER_UPDATE") {
        chrome.storage.local.set({ autoJobsTracker: event.data.tracker });
      }
      if (event.data && event.data.type === "COR3_AUTOJOB_DONE") {
        setAutoJobsActive(false);
        chrome.storage.local.set({ autoJobsRunning: false });
        _automationFinish("auto-jobs");
      }
      if (event.data && event.data.type === "COR3_AUTOJOB_ICE_WALL_RELOAD") {
        var lockedJob = event.data.lockedJob;
        console.log("[COR3 Helper] ICE Wall stuck \u2014 saving locked job and reloading page");
        chrome.storage.local.get("autoJobsLockedJobs", (prev) => {
          var lockedList = prev.autoJobsLockedJobs || [];
          if (lockedJob && lockedJob.jobId) {
            lockedList = lockedList.filter((j) => j.jobId !== lockedJob.jobId);
            lockedList.push(lockedJob);
          }
          chrome.storage.local.set({ autoJobsLockedJobs: lockedList }, () => {
            window.location.reload();
          });
        });
      }
      if (event.data && event.data.type === "COR3_ALL_MARKETS_REFRESHED") {
        setMarketRefreshInProgress(false);
        chrome.storage.local.set({ _allMarketsRefreshed: Date.now() });
      }
      if (event.data && event.data.type === "COR3_TOKEN_EXPIRED") {
        setMarketRefreshInProgress(false);
        Promise.resolve().then(() => (init_auto_update_markets(), auto_update_markets_exports)).then((m) => m.setSeqRefreshRunning(false));
        setInitialFetchDone(false);
        chrome.storage.local.remove("initialFetchDoneAt");
        if (autoSendInProgress) {
          console.log("[COR3 Helper] Token expired \u2014 aborting in-progress auto-send");
          setAutoSendInProgress(false);
          setAutoSendExpeditionId(null);
          setAutoSendAwaitingMercenaries(false);
          setAutoSendAwaitingUsolMercs(false);
          setAutoSendDeferredWaiting(false);
          setAutoSendUsolSkipped(false);
          setAutoSendMercRetryCount(0);
          _automationFinish("auto-send");
        }
        console.log("[COR3 Helper] Token expired \u2014 cleared market refresh flags, gating automations until initial fetch done");
      }
      if (event.data && event.data.type === "COR3_INITIAL_FETCH_DONE") {
        setInitialFetchDone(true);
        chrome.storage.local.set({ initialFetchDoneAt: Date.now() });
        console.log("[COR3 Helper] Initial fetch done \u2014 automations unblocked");
        chrome.storage.local.get("expeditionsData", (result) => {
          if (result.expeditionsData) {
            checkAutoSendOnExpeditionData(result.expeditionsData);
          }
        });
      }
      if (event.data && event.data.type === "COR3_AUTOJOB_SAVE_COMPLETED") {
        chrome.storage.local.get("autoJobsCompletedResults", (result) => {
          const existing = result.autoJobsCompletedResults || [];
          const incoming = event.data.jobs || [];
          const merged = [...existing];
          for (const job of incoming) {
            const idx = merged.findIndex((j) => j.jobId === job.jobId);
            if (idx >= 0) merged[idx] = job;
            else merged.push(job);
          }
          chrome.storage.local.set({ autoJobsCompletedResults: merged });
        });
      }
      if (event.data && event.data.type === "COR3_VALUABLE_LOG") {
        queueValuableLog(event.data.msg, event.data.level);
      }
      if (event.data && event.data.type === "COR3_VALUABLE_SERVERS_UPDATE") {
        chrome.storage.local.set({ valuableServersData: event.data.data });
      }
      if (event.data && event.data.type === "COR3_VALUABLE_DOWNLOADS_UPDATE") {
        chrome.storage.local.set({ valuableDownloadsData: event.data.data });
      }
      if (event.data && event.data.type === "COR3_VALUABLE_MAINTENANCE_UPDATE") {
        chrome.storage.local.set({ valuableMaintenanceData: event.data.data });
      }
      if (event.data && event.data.type === "COR3_VALUABLE_FORCE_MAINT_BATCH_PROGRESS") {
        chrome.storage.local.get("forceMaintenanceInProgress", function(res) {
          var fm = res.forceMaintenanceInProgress;
          if (fm && fm.batch) {
            fm.currentServerId = event.data.currentServerId;
            fm.serverIds = event.data.serverIds;
            chrome.storage.local.set({ forceMaintenanceInProgress: fm });
          }
        });
      }
      if (event.data && event.data.type === "COR3_VALUABLE_FORCE_MAINT_SERVER_DONE") {
        chrome.storage.local.set({ valuableForceMaintenanceServerDone: { serverId: event.data.serverId, serverName: event.data.serverName, ts: Date.now() } });
        chrome.storage.local.get("valuableMaintenanceData", function(res) {
          var mData = res.valuableMaintenanceData;
          if (mData && mData.servers) {
            for (var si = 0; si < mData.servers.length; si++) {
              if (mData.servers[si].id === event.data.serverId) {
                mData.servers[si].maintenanceEndsAt = mData.servers[si].maintenanceEndsAt || new Date(Date.now() + 36e5).toISOString();
                mData.servers[si].timeUntilMaintenance = null;
                break;
              }
            }
            chrome.storage.local.set({ valuableMaintenanceData: mData });
          }
        });
      }
      if (event.data && event.data.type === "COR3_VALUABLE_FORCE_MAINT_DONE") {
        var fmDoneData = { done: true };
        if (event.data.error) {
          fmDoneData.error = event.data.error;
          fmDoneData.blockerName = event.data.blockerName || null;
          fmDoneData.remainingMs = event.data.remainingMs || null;
          fmDoneData.targetServer = event.data.targetServer || null;
        }
        chrome.storage.local.set({ valuableForceMaintenanceDone: fmDoneData });
        chrome.storage.local.remove("forceMaintenanceInProgress");
      }
      if (event.data && event.data.type === "COR3_VALUABLE_DONE") {
        chrome.storage.local.set({ valuableSearchRunning: false, valuableSellerRunning: false });
        _automationFinish("auto-valuable");
      }
    });
  }

  // src/content/index.js
  setupWsRelay();
  setupMessageListener();
  setupEngineRelay();
  window.addEventListener("error", (e) => {
    if (typeof cor3LogEntry === "function") {
      cor3LogEntry("error-logs", (e.filename || "") + ":" + (e.lineno || 0) + " " + (e.message || ""), "error");
    }
  });
  window.addEventListener("unhandledrejection", (e) => {
    if (typeof cor3LogEntry === "function") {
      var msg = e.reason ? e.reason.stack || e.reason.message || String(e.reason) : "Unhandled rejection";
      cor3LogEntry("error-logs", msg, "error");
    }
  });
  chrome.storage.local.remove("initialFetchDoneAt");
  chrome.storage.local.get("autoJobsRunning", (data) => {
    if (data.autoJobsRunning) {
      console.log("[COR3 Helper] Page reloaded \u2014 clearing stale auto-jobs state");
      chrome.storage.local.set({ autoJobsRunning: false, autoJobsQueue: [] });
    }
  });
})();
