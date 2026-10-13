/* ============================================================
   Типы сообщений между частями расширения.

   Формат: "<откуда>→<куда>:<действие>"

   Используемые направления:
   - popup→sw  — от popup к service worker
   - cs→sw     — от content script к service worker
   ============================================================ */

export const DIR = {
    POPUP_TO_SW: "popup→sw",
    CS_TO_SW:   "cs→sw",
};

export const MSG = {
    // content script → service worker
    CS_GET_DOMAIN_SELECTORS: `${DIR.CS_TO_SW}:getDomainSelectors`,
    CS_GET_DOMAIN_EXCLUDE:   `${DIR.CS_TO_SW}:getDomainExclude`,

    // popup → service worker
    POPUP_GET_STATE:         `${DIR.POPUP_TO_SW}:getState`,
    POPUP_SET_ENABLED:       `${DIR.POPUP_TO_SW}:setEnabled`,
    POPUP_WHITELIST_ADD:     `${DIR.POPUP_TO_SW}:whitelistAdd`,
    POPUP_WHITELIST_REMOVE:  `${DIR.POPUP_TO_SW}:whitelistRemove`,
};

const ALL_TYPES = new Set(Object.values(MSG));
export function isValidMessageType(type) {
    return ALL_TYPES.has(type);
}