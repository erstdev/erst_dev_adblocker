/* ============================================================
   События вкладок: обновление badge при активации и загрузке.

   Что делает:
   - при переключении на вкладку → обновляет badge
   - при завершении загрузки вкладки → обновляет badge

   Зачем:
   badge показывает актуальное состояние ("ON" / "OFF" / "—")
   для каждой вкладки. Без этих слушателей badge будет
   устаревшим при переключении между вкладками.

   Кто зовёт:
   - service_worker.js — регистрирует слушателей
   ============================================================ */

import {refreshBadgeForTab} from "./badge.js";

/**
 * Регистрирует слушателей событий вкладок.
 * Вызывается один раз при старте service worker.
 */
export function registerTabListeners() {
    chrome.tabs.onActivated.addListener(({ tabId }) => {
        void refreshBadgeForTab(tabId);
    });

    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (changeInfo.status === "complete" && tab.url) {
            void refreshBadgeForTab(tabId);
        }
    });
}