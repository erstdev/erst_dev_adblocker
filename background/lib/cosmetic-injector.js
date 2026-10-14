/* ============================================================
   Вставка косметического CSS на страницы.

   Что делает:
   - при навигации на новую страницу вставляет cosmetic.css
     и cosmetic-manual.css (если расширение включено и сайт
     не в белом списке)
   - пропускает chrome.google.com и chromewebstore.google.com
     (insertCSS на них падает с "The extensions gallery cannot
     be scripted")

   Кого зовёт:
   - chrome.scripting.insertCSS — вставка CSS

   Кто зовёт:
   - service_worker.js — регистрирует onCommitted
   ============================================================ */

import { getEnabled, isWhitelisted } from "../../shared/storage.js";

// Файлы CSS, которые вставляем на каждую страницу.
// cosmetic.css — автогенерированный конвертером.
// cosmetic-manual.css — ручные правила (правим руками).
const COSMETIC_CSS = [
    "content/cosmetic.css",
    "content/cosmetic-manual.css"
];

// Хосты, на которых insertCSS падает.
// Chrome Web Store и Google extensions gallery запрещают
// выполнение любых скриптов/стилей на своих страницах.
const FORBIDDEN_HOSTS = [
    "chrome.google.com",
    "chromewebstore.google.com"
];

function isForbiddenHost(url) {
    try {
        const hostname = new URL(url).hostname;
        return FORBIDDEN_HOSTS.includes(hostname);
    } catch {
        return false;
    }
}

/**
 * Обработчик события onCommitted.
 * Вставляем CSS, если расширение включено и сайт не в белом списке.
 *
 * Особенности работы с фреймами (важно, не путать):
 *
 * 1. chrome.webNavigation.onCommitted срабатывает для КАЖДОГО фрейма
 *    (main_frame + все sub_frame). Это событие навигации, а не вставки.
 *    Проверка details.frameId !== 0 отбрасывает события от sub_frame,
 *    чтобы не выполнять одну и ту же логику N раз на одну страницу.
 *
 * 2. chrome.scripting.insertCSS с target: { tabId } БЕЗ frameIds
 *    вставляет CSS сразу во ВСЕ фреймы вкладки за один вызов.
 *    Это не «одна вставка на iframe» — это один вызов, покрывающий
 *    все фреймы. Поэтому дополнительно обрабатывать sub_frame-события
 *    не нужно: CSS в iframe всё равно попадёт.
 *
 * 3. Если когда-нибудь потребуется вставлять CSS ТОЛЬКО в main_frame —
 *    добавить frameIds: [0] в target. Сейчас этого нет намеренно:
 *    общий cosmetic.css должен работать и в iframe.
 *
 * 4. Content scripts (content/*.js) в iframe НЕ работают, потому что
 *    в manifest.json не указан all_frames: true. Это осознанное
 *    ограничение (см. README → «Известные ограничения»).
 *    Следствие: в iframe работает только общий CSS, а domain-specific
 *    селекторы, text-based hiding, observer и auto-skip — только
 *    в main_frame.
 *
 * @param {Object} details - объект события от chrome.webNavigation
 */
export async function handleCommitted(details) {
    // onCommitted срабатывает по разу на каждый фрейм. Нас интересует
    // только main_frame — см. пункты 1 и 2 в комментарии выше.
    if (details.frameId !== 0) return;

    // Chrome Web Store / extensions gallery — пропускаем.
    if (isForbiddenHost(details.url)) return;

    try {
        const enabled = await getEnabled();
        if (!enabled) return;

        const whitelisted = await isWhitelisted(details.url);
        if (whitelisted) return;

        await chrome.scripting.insertCSS({
            target: { tabId: details.tabId },
            files: COSMETIC_CSS
        });
    } catch (e) {
        console.error(`[erst_dev_adblocker] insertCSS failed (tabId=${details.tabId}, url=${details.url}):`, e);
    }
}