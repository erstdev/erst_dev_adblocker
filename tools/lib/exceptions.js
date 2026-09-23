/* ============================================================
   Конвертация ИСКЛЮЧЕНИЙ (@@) из EasyList в DNR-формат.

   Что такое исключения:
   Правила вида "@@||site.com/allowed^" говорят:
   «НЕ блокируй это, даже если другое правило хочет».

   В DNR это action: "allow" с priority выше, чем у block-правил.
   У нас block имеет priority: 1, allow — priority: 2.

   Приоритет работает так: если url подходит под оба правила
   (block и allow), побеждает то, у которого priority больше.

   Импортирует parseModifiers из network.js — там логика разбора
   $-модификаторов (одинаковая для сетевых правил и исключений).
   ============================================================ */

import { parseModifiers } from "./network.js";
import { isAsciiOnly } from "./utils.js";

/**
 * Отбирает уникальные исключения.
 *
 * @param {string[]} exceptionRules - все строки, начинающиеся с @@
 * @returns {string[]} уникальные исключения
 */
export function selectExceptionRules(exceptionRules) {
    const unique = [...new Set(exceptionRules)];
    console.log(`\n[stage 5] exceptions (before dedup): ${exceptionRules.length}`);
    console.log(`[stage 5] exceptions (after dedup):  ${unique.length}`);
    return unique;
}

/**
 * Конвертирует исключения в DNR-формат с action: "allow".
 *
 * Пример: "@@||abcnews.com/assets/js/prebid.min.js" →
 *   { id, priority: 2, action: { type: "allow" },
 *     condition: { urlFilter: "||abcnews.com/assets/js/prebid.min.js" } }
 *
 * @param {string[]} rules - исключения (со префиксом @@)
 * @param {number} startId - стартовый id
 * @returns {Array} массив DNR-правил с allow
 */
export function exceptionRulesToDnr(rules, startId) {
    const dnrRules = [];
    let ruleId = startId;
    let skipped = 0;
    let skippedNonAscii = 0;

    for (const easyRule of rules) {
        // Отрезаем префикс @@
        let body = easyRule.slice(2);

        // Отделяем $модификаторы, если есть
        let modPart = "";
        const dollarIndex = body.lastIndexOf("$");
        if (dollarIndex !== -1) {
            modPart = body.slice(dollarIndex + 1);
            body = body.slice(0, dollarIndex);
        }

        if (!isAsciiOnly(body)) {
            skippedNonAscii++;
            continue;
        }

        const condition = { urlFilter: body };

        if (modPart) {
            const parsed = parseModifiers(modPart);
            if (parsed.unsupported) {
                skipped++;
                continue;
            }
            if (parsed.thirdParty !== null) {
                condition.domainType = parsed.thirdParty ? "thirdParty" : "firstParty";
            }
            if (parsed.resourceTypes.length > 0) {
                condition.resourceTypes = parsed.resourceTypes;
            }
        }

        // priority: 2 — выше, чем у block-правил (у них 1),
        // поэтому allow всегда побеждает при конфликте.
        dnrRules.push({
            id: ruleId++,
            priority: 2,
            action: { type: "allow" },
            condition
        });
    }

    console.log(`[stage 5] converted: ${dnrRules.length}, skipped: ${skipped}, non-ascii: ${skippedNonAscii}`);
    return dnrRules;
}