/* ============================================================
   Классификация строк из списков правил.

   Что делает:
   - проходит по всем строкам
   - сортирует их по категориям:
       network    — сетевые правила (|, ||, /path, с $модификаторами)
       cosmetic   — косметические (##selector, domain##selector)
       exceptions — исключения (@@...)
       skipped    — комментарии, пустые строки, заголовки секций

   НЕ парсит правила. Только раскладывает по кучкам.
   Парсинг — в network.js / cosmetic.js / exceptions.js.
   ============================================================ */

/**
 * Раскладывает массив строк по категориям.
 *
 * @param {string[]} allLines - все строки из всех списков
 * @returns {{network: string[], cosmetic: string[], exceptions: string[], comments: number}}
 */
export function classifyLines(allLines) {
    const network = [];
    const cosmetic = [];
    const exceptions = [];
    let comments = 0;

    for (const line of allLines) {
        const trimmed = line.trim();

        // Пустая строка
        if (!trimmed) { comments++; continue; }

        // Комментарий (! в начале)
        if (trimmed.startsWith("!")) { comments++; continue; }

        // Заголовок секции ([Adblock Plus 2.0])
        if (trimmed.startsWith("[")) { comments++; continue; }

        // Исключение (@@ в начале)
        if (trimmed.startsWith("@@")) {
            exceptions.push(trimmed);
            continue;
        }

        // Косметическое правило (## или #@#)
        if (trimmed.includes("##") || trimmed.includes("#@#")) {
            cosmetic.push(trimmed);
            continue;
        }

        // Всё остальное — сетевое
        network.push(trimmed);
    }

    return { network, cosmetic, exceptions, comments };
}

/**
 * Печатает результаты классификации в консоль.
 *
 * @param {{network: string[], cosmetic: string[], exceptions: string[], comments: number}} classified
 */
export function logClassification({ network, cosmetic, exceptions, comments }) {
    console.log(`[classify] network:    ${network.length}`);
    console.log(`[classify] cosmetic:   ${cosmetic.length}`);
    console.log(`[classify] exceptions: ${exceptions.length}`);
    console.log(`[classify] skipped:    ${comments}`);
}