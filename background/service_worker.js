import { MSG, isValidMessageType } from "../shared/messages.js";


const COSMETIC_CSS = [
    "content/cosmetic.css",
    "content/cosmetic-manual.css"
];

console.log("[erst_dev_adblocker] service worker started");

/* ============================================================
   Косметика: вставляем CSS на каждую новую страницу
   ============================================================ */
chrome.webNavigation.onCommitted.addListener(
    async (details) => {
        if (details.frameId !== 0) return;

        try {
            await chrome.scripting.insertCSS({
                target: { tabId: details.tabId },
                files: COSMETIC_CSS
            });
            void updateBadge(details.tabId);
        } catch (e) {
            console.error("[erst_dev_adblocker] insertCSS failed:", e);
        }
    },
    { url: [{ schemes: ["http", "https"] }] }
);

/* ============================================================
   Badge на иконке.

   Показываем "ON" зелёным фоном, когда расширение активно
   на вкладке. Позже заменим на реальный счётчик.
   ============================================================ */
async function updateBadge(tabId) {
    try {
        await chrome.action.setBadgeText({ tabId, text: "ON" });
        await chrome.action.setBadgeBackgroundColor({ tabId, color: "#4ade80" });
    } catch (e) {
        // На служебных страницах (chrome://) badge не ставится — это нормально
    }
}

// При переключении на вкладку — показываем badge и на ней
chrome.tabs.onActivated.addListener(({ tabId }) => {
    void updateBadge(tabId);
});

/* ============================================================
   Загрузка карты domain-specific селекторов.
   Грузим ОДИН раз при старте, держим в памяти service worker.
   При засыпании — перезагрузим при следующем запросе.
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
        const u = new URL(url);
        return u.hostname;
    } catch {
        return null;
    }
}

function findSelectorsForDomain(map, hostname) {
    // Правила в карте — по доменам вида "rbc.ru", "www.rbc.ru", "example.com".
    // Пробуем точное совпадение и по родительским доменам.
    const parts = hostname.split(".");
    const candidates = [];
    for (let i = 0; i < parts.length; i++) {
        candidates.push(parts.slice(i).join("."));
    }

    const result = new Set();
    for (const c of candidates) {
        const list = map[c];
        if (list) {
            for (const s of list) result.add(s);
        }
    }
    return [...result];
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || !isValidMessageType(msg.type)) {
        console.warn("[erst_dev_adblocker] unknown message:", msg);
        return;
    }

    if (msg.type === MSG.CS_GET_DOMAIN_SELECTORS) {
        (async () => {
            try {
                const map = await loadCosmeticMap();
                const hostname = extractDomain(msg.url);
                if (!hostname) {
                    sendResponse({ selectors: [] });
                    return;
                }
                const selectors = findSelectorsForDomain(map, hostname);
                sendResponse({ selectors });
            } catch (e) {
                console.error("[erst_dev_adblocker] getDomainSelectors failed:", e);
                sendResponse({ selectors: [] });
            }
        })();
        return true;
    }
});