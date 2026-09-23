/* ============================================================
   Вставка косметического CSS на страницы.

   Что делает:
   - при навигации на новую страницу вставляет cosmetic.css
     и cosmetic-manual.css (если расширение включено и сайт
     не в белом списке)
   - после успешной вставки обновляет badge (через badge.js)

   Кого зовёт:
   - chrome.scripting.insertCSS — вставка CSS
   - updateBadge из badge.js — статус на иконке

   Кто зовёт:
   - service_worker.js — регистрирует onCommitted
   ============================================================ */

import { getEnabled, isWhitelisted } from "../../shared/storage.js";
import { updateBadge } from "./badge.js";

// Файлы CSS, которые вставляем на каждую страницу.
// cosmetic.css — автогенерированный конвертером.
// cosmetic-manual.css — ручные правила (правим руками).
const COSMETIC_CSS = [
    "content/cosmetic.css",
    "content/cosmetic-manual.css"
];

/**
 * Обработчик события onCommitted.
 * Вставляем CSS в главный фрейм, если разрешено.
 *
 * @param {Object} details - объект события от chrome.webNavigation
 */
export async function handleCommitted(details) {
    // Нас интересует только главный фрейм.
    // Проверка защищает от 11 вставок CSS подряд (по одной на каждый iframe).
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
        void updateBadge(details.tabId, "ON", "#4ade80");
    } catch (e) {
        console.error("[erst_dev_adblocker] insertCSS failed:", e);
    }
}