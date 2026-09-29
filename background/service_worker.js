/* ============================================================
   Service worker — точка входа фонового скрипта расширения.

   Что делает:
   1. Инициализирует DNR (rulesets + whitelist-правила).
   2. Слушает изменения storage (enabled, whitelist).
   3. Регистрирует слушателя навигации (для вставки CSS).
   4. Регистрирует обработчик сообщений от popup и content script.

   Что НЕ делает (вынесено в background/lib/):
   - вставка CSS            → lib/cosmetic-injector.js
   - загрузка карты          → lib/cosmetic-map.js
   - обработка сообщений     → lib/message-handler.js

   ВАЖНО про syncDnrState:
   - вызываем один раз при старте
   - и при изменениях storage (chrome.storage.onChanged)
   - НЕ вызываем из message-handler — это приведёт к race condition
   ============================================================ */

import { syncDnrState } from "../shared/storage.js";
import { handleCommitted } from "./lib/cosmetic-injector.js";
import { registerMessageHandler } from "./lib/message-handler.js";

console.log("[erst_dev_adblocker] service worker started");

// ------------------------------------------------------------
// 1. Инициализация DNR при старте
// ------------------------------------------------------------
syncDnrState().catch((e) => {
    console.error("[erst_dev_adblocker] syncDnrState failed:", e);
});

// ------------------------------------------------------------
// 2. Реакция на изменения storage
// ------------------------------------------------------------
chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.enabled || changes.whitelist) {
        syncDnrState().catch((e) => {
            console.error("[erst_dev_adblocker] syncDnrState (onChanged) failed:", e);
        });
    }
});

// ------------------------------------------------------------
// 3. Вставка CSS при навигации
// ------------------------------------------------------------
chrome.webNavigation.onCommitted.addListener(
    handleCommitted,
    { url: [{ schemes: ["http", "https"] }] }
);

// ------------------------------------------------------------
// 4. Обработчик сообщений
// ------------------------------------------------------------
registerMessageHandler();