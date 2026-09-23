export const DIR = {
    POPUP_TO_SW: "popup→sw",
    SW_TO_POPUP: "sw→popup",
    SW_TO_CS:   "sw→cs",
    CS_TO_SW:   "cs→sw",
};

export const MSG = {
    CS_GET_DOMAIN_SELECTORS: `${DIR.CS_TO_SW}:getDomainSelectors`,

    POPUP_GET_STATE:         `${DIR.POPUP_TO_SW}:getState`,
    POPUP_SET_ENABLED:       `${DIR.POPUP_TO_SW}:setEnabled`,
    POPUP_WHITELIST_ADD:     `${DIR.POPUP_TO_SW}:whitelistAdd`,
    POPUP_WHITELIST_REMOVE:  `${DIR.POPUP_TO_SW}:whitelistRemove`,
};

const ALL_TYPES = new Set(Object.values(MSG));
export function isValidMessageType(type) {
    return ALL_TYPES.has(type);
}