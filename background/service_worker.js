import { isValidMessageType } from "../shared/messages.js";

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
   Общение с popup (пока пусто, каркас на будущее)
   ============================================================ */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || !isValidMessageType(msg.type)) {
        console.warn("[erst_dev_adblocker] unknown message:", msg);
    }
    // Пока нет сообщений — оставляем каркас
});