/* ============================================================
   Вставка косметического CSS на страницы.

   Что делает:
   - при навигации на новую страницу вставляет cosmetic.css
     и cosmetic-manual.css (если расширение включено и сайт
     не в белом списке)
   - пропускает chrome.google.com и chromewebstore.google.com
     (insertCSS на них падает с "The extensions gallery cannot
     be scripted")

   Кого зовёт:
   - chrome.scripting.insertCSS — вставка CSS

   Кто зовёт:
   - service_worker.js — регистрирует onCommitted
   ============================================================ */

import { getEnabled, isWhitelisted } from "../../shared/storage.js";

// Файлы CSS, которые вставляем на каждую страницу.
// cosmetic.css — автогенерированный конвертером.
// cosmetic-manual.css — ручные правила (правим руками).
const COSMETIC_CSS = [
    "content/cosmetic.css",
    "content/cosmetic-manual.css"
];

// Хосты, на которых insertCSS падает.
// Chrome Web Store и Google extensions gallery запрещают
// выполнение любых скриптов/стилей на своих страницах.
const FORBIDDEN_HOSTS = [
    "chrome.google.com",
    "chromewebstore.google.com"
];

function isForbiddenHost(url) {
    try {
        const hostname = new URL(url).hostname;
        return FORBIDDEN_HOSTS.includes(hostname);
    } catch {
        return false;
    }
}

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

    // Chrome Web Store / extensions gallery — пропускаем.
    if (isForbiddenHost(details.url)) return;

    try {
        const enabled = await getEnabled();
        if (!enabled) return;

        const whitelisted = await isWhitelisted(details.url);
        if (whitelisted) return;

        await chrome.scripting.insertCSS({
            target: { tabId: details.tabId },
            files: COSMETIC_CSS
        });
    } catch (e) {
        console.error(`[erst_dev_adblocker] insertCSS failed (tabId=${details.tabId}, url=${details.url}):`, e);
    }
}