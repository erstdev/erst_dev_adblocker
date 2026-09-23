/* ============================================================
   Управление badge на иконке расширения.

   Badge — маленькая текстовая метка на иконке в тулбаре.
   Показывает состояние расширения для активной вкладки:
     "ON" зелёный — работает
     "—" серый — сайт в белом списке, не работает
     "OFF" серый — расширение выключено глобально

   Что делает:
   - ставит текст и цвет badge
   - решает, ЧТО показывать (по состоянию enabled/whitelist)

   Кто зовёт:
   - cosmetic-injector.js — после успешной вставки CSS
   - tabs.js — при переключении вкладок
   - message-handler.js — при смене настроек в popup
   ============================================================ */

import { getEnabled, isWhitelisted } from "../../shared/storage.js";

/**
 * Устанавливает badge на иконке конкретной вкладки.
 *
 * @param {number} tabId
 * @param {string} text  - "ON" / "OFF" / "—"
 * @param {string} color - hex-цвет фона
 */
export async function updateBadge(tabId, text, color) {
    try {
        await chrome.action.setBadgeText({ tabId, text });
        await chrome.action.setBadgeBackgroundColor({ tabId, color });
    } catch (e) {
        // Служебные страницы (chrome://, about) — badge не ставится.
        // Это нормально, не логируем.
    }
}

/**
 * Обновляет badge в зависимости от состояния расширения и сайта.
 *
 * Логика:
 *   enabled = false → "OFF" серый
 *   сайт в whitelist → "—" серый
 *   иначе → "ON" зелёный
 *
 * @param {number} tabId
 */
export async function refreshBadgeForTab(tabId) {
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