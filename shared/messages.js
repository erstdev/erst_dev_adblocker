/* ============================================================
   Типы сообщений между частями расширения.

   Формат: "<откуда>→<куда>:<действие>"
   ============================================================ */

export const DIR = {
    POPUP_TO_SW: "popup→sw",
    SW_TO_POPUP: "sw→popup",
    SW_TO_CS:   "sw→cs",
    CS_TO_SW:   "cs→sw",
};

export const MSG = {
    // content script → service worker
    CS_GET_DOMAIN_SELECTORS: `${DIR.CS_TO_SW}:getDomainSelectors`,
};

const ALL_TYPES = new Set(Object.values(MSG));
export function isValidMessageType(type) {
    return ALL_TYPES.has(type);
}