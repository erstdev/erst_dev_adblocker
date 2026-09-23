import { MSG, isValidMessageType } from "../shared/messages.js";
import {
    getEnabled, setEnabled,
    getWhitelist, addToWhitelist, removeFromWhitelist,
    isWhitelisted, syncDnrState
} from "../shared/storage.js";

const COSMETIC_CSS = [
    "content/cosmetic.css",
    "content/cosmetic-manual.css"
];

console.log("[erst_dev_adblocker] service worker started");

/* ============================================================
   Инициализация DNR
   ============================================================ */
syncDnrState().catch((e) => {
    console.error("[erst_dev_adblocker] syncDnrState failed:", e);
});

chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.enabled || changes.whitelist) {
        syncDnrState().catch((e) => {
            console.error("[erst_dev_adblocker] syncDnrState (onChanged) failed:", e);
        });
    }
});

/* ============================================================
   Косметика
   ============================================================ */
chrome.webNavigation.onCommitted.addListener(
    async (details) => {
        if (details.frameId !== 0) return;

        try {
            const enabled = await getEnabled();
            if (!enabled) return;

            const whitelisted = await isWhitelisted(details.url);
            if (whitelisted) return;

            await chrome.scripting.insertCSS({
                target: { tabId: details.tabId },
                files: COSMETIC_CSS
            });
            updateBadge(details.tabId, "ON", "#4ade80");
        } catch (e) {
            console.error("[erst_dev_adblocker] insertCSS failed:", e);
        }
    },
    { url: [{ schemes: ["http", "https"] }] }
);

/* ============================================================
   Badge
   ============================================================ */
async function updateBadge(tabId, text, color) {
    try {
        await chrome.action.setBadgeText({ tabId, text });
        await chrome.action.setBadgeBackgroundColor({ tabId, color });
    } catch (e) {
        // служебные страницы
    }
}

async function refreshBadgeForTab(tabId) {
    const enabled = await getEnabled();
    if (!enabled) {
        await updateBadge(tabId, "OFF", "#888");
        return;
    }
    try {
        const tab = await chrome.tabs.get(tabId);
        if (!tab || !tab.url) return;
        const whitelisted = await isWhitelisted(tab.url);
        if (whitelisted) {
            await updateBadge(tabId, "—", "#888");
        } else {
            await updateBadge(tabId, "ON", "#4ade80");
        }
    } catch (e) {
        // ignore
    }
}

chrome.tabs.onActivated.addListener(({ tabId }) => {
    refreshBadgeForTab(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === "complete" && tab.url) {
        refreshBadgeForTab(tabId);
    }
});

/* ============================================================
   Карта domain-specific селекторов
   ============================================================ */
let cosmeticMapCache = null;

async function loadCosmeticMap() {
    if (cosmeticMapCache) return cosmeticMapCache;
    const url = chrome.runtime.getURL("rules/cosmetic-map.json");
    const response = await fetch(url);
    cosmeticMapCache = await response.json();
    console.log(`[erst_dev_adblocker] cosmetic map loaded: ${Object.keys(cosmeticMapCache).length} domains`);
    return cosmeticMapCache;
}

function extractDomain(url) {
    try {
        return new URL(url).hostname;
    } catch {
        return null;
    }
}

function findSelectorsForDomain(map, hostname) {
    const parts = hostname.split(".");
    const candidates = [];
    for (let i = 0; i < parts.length; i++) {
        candidates.push(parts.slice(i).join("."));
    }
    const result = new Set();
    for (const c of candidates) {
        const list = map[c];
        if (list) for (const s of list) result.add(s);
    }
    return [...result];
}

/* ============================================================
   Общение с popup и content script
   ============================================================ */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || !isValidMessageType(msg.type)) {
        console.warn("[erst_dev_adblocker] unknown message:", msg);
        return;
    }

    (async () => {
        try {
            switch (msg.type) {
                case MSG.CS_GET_DOMAIN_SELECTORS: {
                    const enabled = await getEnabled();
                    if (!enabled) { sendResponse({ selectors: [] }); return; }

                    const whitelisted = await isWhitelisted(msg.url);
                    if (whitelisted) { sendResponse({ selectors: [] }); return; }

                    const map = await loadCosmeticMap();
                    const hostname = extractDomain(msg.url);
                    if (!hostname) { sendResponse({ selectors: [] }); return; }

                    const selectors = findSelectorsForDomain(map, hostname);
                    sendResponse({ selectors });
                    return;
                }

                case MSG.POPUP_GET_STATE: {
                    const enabled = await getEnabled();
                    const whitelist = await getWhitelist();
                    let currentDomain = null;
                    if (msg.url) currentDomain = extractDomain(msg.url);
                    sendResponse({ enabled, whitelist, currentDomain });
                    return;
                }

                // ВАЖНО: syncDnrState НЕ вызываем здесь.
                // Его вызовет chrome.storage.onChanged после записи в storage.
                case MSG.POPUP_SET_ENABLED: {
                    await setEnabled(msg.value);
                    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                    if (tab) refreshBadgeForTab(tab.id);
                    sendResponse({ ok: true });
                    return;
                }

                case MSG.POPUP_WHITELIST_ADD: {
                    const list = await addToWhitelist(msg.domain);
                    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                    if (tab) refreshBadgeForTab(tab.id);
                    sendResponse({ ok: true, whitelist: list });
                    return;
                }

                case MSG.POPUP_WHITELIST_REMOVE: {
                    const list = await removeFromWhitelist(msg.domain);
                    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                    if (tab) refreshBadgeForTab(tab.id);
                    sendResponse({ ok: true, whitelist: list });
                    return;
                }

                default:
                    sendResponse(null);
            }
        } catch (e) {
            console.error("[erst_dev_adblocker] message handler failed:", e);
            sendResponse(null);
        }
    })();

    return true;
});