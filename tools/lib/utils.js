/* ============================================================
   Утилиты конвертера.

   Мелкие функции, которые используются в разных местах.
   ============================================================ */

/**
 * Проверяет, что строка состоит только из ASCII-символов.
 *
 * Зачем: Chrome не принимает DNR-правила с не-ASCII символами
 * в urlFilter (например, "||реклама.рф^"). Такие правила надо
 * пропускать — иначе всё расширение не загрузится.
 *
 * @param {string} str - входная строка
 * @returns {boolean} true если только ASCII
 */
export function isAsciiOnly(str) {
    return /^[\x00-\x7F]*$/.test(str);
}

/**
 * Обрезает массив правил до указанного размера.
 *
 * Если длина <= max — возвращает как есть.
 * Если больше — обрезает и логирует.
 *
 * @param {Array} rules - массив правил
 * @param {number} max - максимум
 * @returns {Array} обрезанный массив
 */
export function capRules(rules, max) {
    if (rules.length <= max) return rules;
    const capped = rules.slice(0, max);
    console.log(`[cap] ${rules.length} → ${capped.length} (max: ${max})`);
    return capped;
}