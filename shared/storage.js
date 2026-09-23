/* ============================================================
   Работа с состоянием расширения в chrome.storage.local.

   Схема:
     enabled: boolean
     whitelist: string[]   // список доменов
   ============================================================ */

const KEY_ENABLED = "enabled";
const KEY_WHITELIST = "whitelist";

export async function getEnabled() {
    const data = await chrome.storage.local.get(KEY_ENABLED);
    return data[KEY_ENABLED] !== false; // по умолчанию true
}

export async function setEnabled(value) {
    await chrome.storage.local.set({ [KEY_ENABLED]: !!value });
}

export async function getWhitelist() {
    const data = await chrome.storage.local.get(KEY_WHITELIST);
    return Array.isArray(data[KEY_WHITELIST]) ? data[KEY_WHITELIST] : [];
}

export async function addToWhitelist(domain) {
    const list = await getWhitelist();
    if (!list.includes(domain)) {
        list.push(domain);
        await chrome.storage.local.set({ [KEY_WHITELIST]: list });
    }
    return list;
}

export async function removeFromWhitelist(domain) {
    let list = await getWhitelist();
    list = list.filter((d) => d !== domain);
    await chrome.storage.local.set({ [KEY_WHITELIST]: list });
    return list;
}

export function extractHostname(url) {
    try {
        return new URL(url).hostname;
    } catch {
        return null;
    }
}

export async function isWhitelisted(url) {
    const hostname = extractHostname(url);
    if (!hostname) return false;
    const list = await getWhitelist();
    // Точное совпадение или родительский домен
    const parts = hostname.split(".");
    for (let i = 0; i < parts.length; i++) {
        const candidate = parts.slice(i).join(".");
        if (list.includes(candidate)) return true;
    }
    return false;
}