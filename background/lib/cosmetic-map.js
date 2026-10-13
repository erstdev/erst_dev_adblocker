/* ============================================================
   Карта domain-specific косметических селекторов + исключений.

   Что делает:
   - один раз загружает rules/cosmetic-map.json в память
   - один раз загружает rules/cosmetic-exclude.json в память
   - по hostname находит все подходящие селекторы (учитывая
     поддомены: для www.rbc.ru проверит www.rbc.ru, rbc.ru, ru)

   Кто зовёт:
   - message-handler.js при запросе от content script

   Особенности:
   - при засыпании service worker кэш теряется — это нормально,
     при следующем запросе карта загрузится заново
   - карта весит несколько МБ, поэтому кэшируем в памяти
   ============================================================ */

let cosmeticMapCache = null;
let cosmeticExcludeCache = null;

/**
 * Загружает карту domain-specific селекторов.
 * Кэширует в памяти service worker.
 *
 * @returns {Promise<Object<string, string[]>>} карта { domain: [selectors] }
 */
export async function loadCosmeticMap() {
    if (cosmeticMapCache) return cosmeticMapCache;
    const url = chrome.runtime.getURL("rules/cosmetic-map.json");
    const response = await fetch(url);
    cosmeticMapCache = await response.json();
    console.log(`[erst_dev_adblocker] cosmetic map loaded: ${Object.keys(cosmeticMapCache).length} domains`);
    return cosmeticMapCache;
}

/**
 * Загружает карту domain-specific исключений (#@#).
 * Кэширует в памяти service worker.
 *
 * @returns {Promise<Object<string, string[]>>} карта { domain: [selectors] }
 */
export async function loadCosmeticExclude() {
    if (cosmeticExcludeCache) return cosmeticExcludeCache;
    const url = chrome.runtime.getURL("rules/cosmetic-exclude.json");
    const response = await fetch(url);
    cosmeticExcludeCache = await response.json();
    console.log(`[erst_dev_adblocker] cosmetic exclude loaded: ${Object.keys(cosmeticExcludeCache).length} domains`);
    return cosmeticExcludeCache;
}

/**
 * Достаёт hostname из URL.
 *
 * @param {string} url
 * @returns {string|null} hostname или null при ошибке
 */
export function extractDomain(url) {
    try {
        return new URL(url).hostname;
    } catch {
        return null;
    }
}

/**
 * Ищет селекторы для конкретного hostname.
 * Учитывает поддомены: для "www.rbc.ru" вернёт селекторы
 * для "www.rbc.ru", "rbc.ru", "ru" (что найдётся в карте).
 *
 * @param {Object} map - карта domain → [selectors]
 * @param {string} hostname
 * @returns {string[]} уникальные селекторы
 */
export function findSelectorsForDomain(map, hostname) {
    const parts = hostname.split(".");
    const candidates = [];
    for (let i = 0; i < parts.length; i++) {
        candidates.push(parts.slice(i).join("."));
    }

    const result = new Set();
    for (const c of candidates) {
        const list = map[c];
        if (list) for (const s of list) result.add(s);
    }
    return [...result];
}