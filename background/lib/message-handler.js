/* ============================================================
   Обработчик сообщений от popup и content script.

   Что делает:
   - принимает сообщения с типом из shared/messages.js
   - выполняет соответствующее действие
   - отвечает отправителю

   Сообщения:
   - cs→sw:getDomainSelectors  ← content script просит селекторы
   - popup→sw:getState          ← popup просит состояние
   - popup→sw:setEnabled        ← popup переключает вкл/выкл
   - popup→sw:whitelistAdd      ← popup добавляет сайт в белый список
   - popup→sw:whitelistRemove   ← popup удаляет сайт

   ВАЖНО:
   - НЕ вызываем syncDnrState() здесь — его дёрнет
     chrome.storage.onChanged (см. service_worker.js).
     Иначе будет race condition и ошибка "Rule with id N
     does not have a unique ID".
   ============================================================ */

import { MSG, isValidMessageType } from "../../shared/messages.js";
import {
    getEnabled, setEnabled,
    getWhitelist, addToWhitelist, removeFromWhitelist,
    isWhitelisted
} from "../../shared/storage.js";
import { loadCosmeticMap, extractDomain, findSelectorsForDomain } from "./cosmetic-map.js";
import {refreshBadgeForTab} from "./badge.js";

/**
 * Регистрирует обработчик onMessage.
 * Вызывается один раз при старте service worker.
 */
export function registerMessageHandler() {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (!msg || !isValidMessageType(msg.type)) {
            console.warn("[erst_dev_adblocker] unknown message:", msg);
            return;
        }

        // Обрабатываем асинхронно; return true говорит Chrome,
        // что ответ будет позже (асинхронно).
        (async () => {
            try {
                switch (msg.type) {
                    case MSG.CS_GET_DOMAIN_SELECTORS:
                        await handleGetDomainSelectors(msg, sendResponse);
                        return;

                    case MSG.POPUP_GET_STATE:
                        await handleGetState(msg, sendResponse);
                        return;

                    case MSG.POPUP_SET_ENABLED:
                        await handleSetEnabled(msg, sendResponse);
                        return;

                    case MSG.POPUP_WHITELIST_ADD:
                        await handleWhitelistAdd(msg, sendResponse);
                        return;

                    case MSG.POPUP_WHITELIST_REMOVE:
                        await handleWhitelistRemove(msg, sendResponse);
                        return;

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
}

// ------------------------------------------------------------
// Обработчики конкретных сообщений
// ------------------------------------------------------------

async function handleGetDomainSelectors(msg, sendResponse) {
    const enabled = await getEnabled();
    if (!enabled) { sendResponse({ selectors: [] }); return; }

    const whitelisted = await isWhitelisted(msg.url);
    if (whitelisted) { sendResponse({ selectors: [] }); return; }

    const map = await loadCosmeticMap();
    const hostname = extractDomain(msg.url);
    if (!hostname) { sendResponse({ selectors: [] }); return; }

    const selectors = findSelectorsForDomain(map, hostname);
    sendResponse({ selectors });
}

async function handleGetState(msg, sendResponse) {
    const enabled = await getEnabled();
    const whitelist = await getWhitelist();
    let currentDomain = null;
    if (msg.url) currentDomain = extractDomain(msg.url);
    sendResponse({ enabled, whitelist, currentDomain });
}

async function handleSetEnabled(msg, sendResponse) {
    await setEnabled(msg.value);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) void refreshBadgeForTab(tab.id);
    sendResponse({ ok: true });
}

async function handleWhitelistAdd(msg, sendResponse) {
    const list = await addToWhitelist(msg.domain);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) void refreshBadgeForTab(tab.id);
    sendResponse({ ok: true, whitelist: list });
}

async function handleWhitelistRemove(msg, sendResponse) {
    const list = await removeFromWhitelist(msg.domain);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) void refreshBadgeForTab(tab.id);
    sendResponse({ ok: true, whitelist: list });
}