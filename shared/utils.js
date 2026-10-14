/* ============================================================
   Утилиты расширения (runtime).

   Используется и в service worker, и в других модулях.
   Не путать с tools/lib/utils.js — там утилиты конвертера.
   ============================================================ */

/**
 * Достаёт hostname из URL.
 *
 * @param {string} url
 * @returns {string|null} hostname или null при ошибке
 */
export function extractHostname(url) {
    try {
        return new URL(url).hostname;
    } catch {
        return null;
    }
}