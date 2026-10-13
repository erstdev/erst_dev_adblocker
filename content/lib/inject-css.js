/* ============================================================
   Запрос domain-specific селекторов у service worker
   и вставка их в <style> на странице.

   Что делает:
   - отправляет SW сообщение cs→sw:getDomainSelectors
     с текущим URL
   - получает массив CSS-селекторов
   - вставляет <style id="erst-domain-cosmetic"> в <head>

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
const MSG_TYPE = "cs→sw:getDomainSelectors";

/**
 * Запрашивает селекторы у service worker.
 *
 * @param {string} url - текущий URL страницы
 * @returns {Promise<string[]>} массив селекторов
 */
async function fetchSelectors(url) {
    try {
        const response = await chrome.runtime.sendMessage({
            type: MSG_TYPE,
            url
        });
        if (!response || !Array.isArray(response.selectors)) return [];
        return response.selectors;
    } catch (e) {
        console.error("[erst_dev_adblocker] fetchSelectors failed:", e);
        return [];
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
 * Обновляет селекторы для нового URL, если он изменился.
 * Обновляет глобальный state.currentSelectors и state.currentUrl.
 *
 * @param {string} url
 */
async function refreshSelectors(url) {
    if (url === state.currentUrl) return;
    state.currentUrl = url;

    const selectors = await fetchSelectors(url);
    state.currentSelectors = selectors;
    applySelectors(selectors);

    if (selectors.length > 0) {
        console.log(`[erst_dev_adblocker] refreshed for ${url}: ${selectors.length} selectors`);
    }
}