/* ============================================================
   Обработчик сообщений от popup и content script.

   Что делает:
   - принимает сообщения с типом из shared/messages.js
   - выполняет соответствующее действие
   - отвечает отправителю

   Сообщения:
   - cs→sw:getDomainSelectors  ← content script просит селекторы
   - cs→sw:getDomainExclude    ← content script просит исключения (#@#)
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
import { extractHostname } from "../../shared/utils.js";
import {
    loadCosmeticMap,
    loadCosmeticExclude,
    findSelectorsForDomain
} from "./cosmetic-map.js";

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

        (async () => {
            try {
                switch (msg.type) {
                    case MSG.CS_GET_DOMAIN_SELECTORS:
                        await handleGetDomainSelectors(msg, sendResponse);
                        return;

                    case MSG.CS_GET_DOMAIN_EXCLUDE:
                        await handleGetDomainExclude(msg, sendResponse);
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
    const hostname = extractHostname(msg.url);
    if (!hostname) { sendResponse({ selectors: [] }); return; }

    const selectors = findSelectorsForDomain(map, hostname);
    sendResponse({ selectors });
}

async function handleGetDomainExclude(msg, sendResponse) {
    const enabled = await getEnabled();
    if (!enabled) { sendResponse({ exclude: [] }); return; }

    const whitelisted = await isWhitelisted(msg.url);
    if (whitelisted) { sendResponse({ exclude: [] }); return; }

    const map = await loadCosmeticExclude();
    const hostname = extractHostname(msg.url);
    if (!hostname) { sendResponse({ exclude: [] }); return; }

    const exclude = findSelectorsForDomain(map, hostname);
    sendResponse({ exclude });
}

async function handleGetState(msg, sendResponse) {
    const enabled = await getEnabled();
    const whitelist = await getWhitelist();
    let currentDomain = null;
    if (msg.url) currentDomain = extractHostname(msg.url);
    sendResponse({ enabled, whitelist, currentDomain });
}

async function handleSetEnabled(msg, sendResponse) {
    await setEnabled(msg.value);
    sendResponse({ ok: true });
}

async function handleWhitelistAdd(msg, sendResponse) {
    const list = await addToWhitelist(msg.domain);
    sendResponse({ ok: true, whitelist: list });
}

async function handleWhitelistRemove(msg, sendResponse) {
    const list = await removeFromWhitelist(msg.domain);
    sendResponse({ ok: true, whitelist: list });
}