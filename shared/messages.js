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
    // Пока пусто — badge работает без сообщений.
    // Заготовки на будущее (вкл/выкл, белый список):
    // POPUP_TOGGLE_ENABLED: `${DIR.POPUP_TO_SW}:toggleEnabled`,
    // POPUP_GET_STATUS: `${DIR.POPUP_TO_SW}:getStatus`,
};

const ALL_TYPES = new Set(Object.values(MSG));
export function isValidMessageType(type) {
    return ALL_TYPES.has(type);
}