/* ============================================================
   Запрос domain-specific селекторов у service worker
   и вставка их в <style> на странице.

   Что делает:
   - отправляет SW сообщение cs→sw:getDomainSelectors
     с текущим URL
   - получает массив CSS-селекторов
   - вставляет <style id="erst-domain-cosmetic"> в <head>
   - отправляет SW сообщение cs→sw:getDomainExclude
   - получает массив исключений (#@#)
   - вставляет <style id="erst-domain-exclude"> с display: revert
     (перекрывает скрытие из первого стиля и из общего cosmetic.css)

   Экспортирует в глобальный контекст:
   - fetchSelectors(url)     — запрос селекторов у SW
   - applySelectors(list)    — вставка <style>
   - refreshSelectors(url)   — fetch + apply + сохранить в state

   Зависимости (из других content-файлов):
   - state              — глобальный объект состояния
                        (см. domain-cosmetic.js)

   ⚠️ Content scripts не поддерживают ESM. Все функции
   просто определяются в глобальном контексте, чтобы были
   доступны другим файлам из manifest.json.
   ============================================================ */

const STYLE_ID = "erst-domain-cosmetic";
const EXCLUDE_STYLE_ID = "erst-domain-exclude";

// ⚠️ Типы сообщений дублируют shared/messages.js → MSG.CS_GET_DOMAIN_SELECTORS
// и MSG.CS_GET_DOMAIN_EXCLUDE. Content scripts не поддерживают ESM,
// поэтому import невозможен. При изменении типа — обновить здесь И в shared/messages.js.
const MSG_GET_SELECTORS = "cs→sw:getDomainSelectors";
const MSG_GET_EXCLUDE = "cs→sw:getDomainExclude";

/**
 * Запрашивает селекторы у service worker.
 *
 * @param {string} url - текущий URL страницы
 * @returns {Promise<string[]|null>} массив селекторов или null при ошибке
 */
async function fetchSelectors(url) {
    try {
        const response = await chrome.runtime.sendMessage({
            type: MSG_GET_SELECTORS,
            url
        });
        if (!response || !Array.isArray(response.selectors)) return null;
        return response.selectors;
    } catch (e) {
        console.error("[erst_dev_adblocker] fetchSelectors failed:", e);
        return null;
    }
}

/**
 * Запрашивает исключения (#@#) у service worker.
 *
 * @param {string} url - текущий URL страницы
 * @returns {Promise<string[]|null>} массив селекторов-исключений или null при ошибке
 */
async function fetchExclude(url) {
    try {
        const response = await chrome.runtime.sendMessage({
            type: MSG_GET_EXCLUDE,
            url
        });
        if (!response || !Array.isArray(response.exclude)) return null;
        return response.exclude;
    } catch (e) {
        console.error("[erst_dev_adblocker] fetchExclude failed:", e);
        return null;
    }
}

/**
 * Вставляет или обновляет <style> с селекторами.
 * Удаляет предыдущий <style> с тем же id.
 *
 * @param {string[]} selectors
 */
function applySelectors(selectors) {
    const existing = document.getElementById(STYLE_ID);
    if (existing) existing.remove();

    if (!selectors || selectors.length === 0) return;

    const css = selectors
        .map((sel) => `${sel} { display: none !important; }`)
        .join("\n");

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = css;

    const target = document.head || document.documentElement;
    if (target) target.appendChild(style);
}

/**
 * Вставляет или обновляет <style> с исключениями.
 * Исключения перекрывают скрытие (display: revert !important).
 *
 * @param {string[]} exclude
 */
function applyExclude(exclude) {
    const existing = document.getElementById(EXCLUDE_STYLE_ID);
    if (existing) existing.remove();

    if (!exclude || exclude.length === 0) return;

    const css = exclude
        .map((sel) => `${sel} { display: revert !important; }`)
        .join("\n");

    const style = document.createElement("style");
    style.id = EXCLUDE_STYLE_ID;
    style.textContent = css;

    const target = document.head || document.documentElement;
    if (target) target.appendChild(style);
}

/**
 * Обновляет селекторы и исключения для нового URL, если он изменился.
 *
 * URL помечается обработанным только после успешного ответа service
 * worker. Если запрос упал, state.currentUrl не меняется и через
 * секунду выполняется повторная попытка: иначе страница осталась бы
 * без селекторов до следующей навигации.
 *
 * @param {string} url
 */
let refreshRetryTimer = null;

function scheduleRefreshRetry() {
    if (refreshRetryTimer) return;
    refreshRetryTimer = setTimeout(() => {
        refreshRetryTimer = null;
        void refreshSelectors(window.location.href);
    }, 1000);
}

async function refreshSelectors(url) {
    if (url === state.currentUrl) return;

    const [selectors, exclude] = await Promise.all([
        fetchSelectors(url),
        fetchExclude(url)
    ]);

    if (selectors === null || exclude === null) {
        console.warn("[erst_dev_adblocker] selector request failed, retry in 1s:", url);
        scheduleRefreshRetry();
        return;
    }

    state.currentUrl = url;
    state.currentSelectors = selectors;
    applySelectors(selectors);
    applyExclude(exclude);

    if (selectors.length > 0) {
        console.log(`[erst_dev_adblocker] refreshed for ${url}: ${selectors.length} selectors, ${exclude.length} excluded`);
    }
}