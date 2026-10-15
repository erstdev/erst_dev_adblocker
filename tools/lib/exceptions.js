/* ============================================================
   Конвертация ИСКЛЮЧЕНИЙ (@@) из EasyList в DNR-формат.

   В DNR это action: "allow" с priority выше, чем у block-правил.
   У нас block имеет priority: 1, allow — priority: 2.

   Импортирует parseModifiers из network.js — там логика разбора
   $-модификаторов (одинаковая для сетевых правил и исключений).

   id: внутри функции id присваиваются с 1 и ни на что не влияют.
   Финальные id выдаёт limiter.js → applyQuotas (exceptions.json → 100000+).
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
 * Если urlFilter пустой, но есть initiatorDomains/excludedInitiatorDomains —
 * не добавляем urlFilter в condition (Chrome этого не разрешает).
 *
 * Regexp-исключения (@@/regexp/$mods или @@/regexp/) не поддерживаются:
 * DNR не умеет regexp в urlFilter напрямую. Пропускаем их целиком,
 * иначе lastIndexOf("$") может найти $ внутри regexp (например, /foo$/)
 * и ошибочно решить, что это модификаторы.
 *
 * @param {string[]} rules - исключения (со префиксом @@)
 * @returns {Array} массив DNR-правил с allow
 */
export function exceptionRulesToDnr(rules) {
    const dnrRules = [];
    let ruleId = 1;
    let skipped = 0;
    let skippedRegexp = 0;
    let skippedNonAscii = 0;
    let skippedEmpty = 0;

    for (const easyRule of rules) {
        // Regexp-исключения @@/regexp/$mods или @@/regexp/
        // пропускаем целиком — см. комментарий к функции.
        if (easyRule.startsWith("@@/")) {
            skippedRegexp++;
            continue;
        }

        let body = easyRule.slice(2);

        let modPart = "";
        const dollarIndex = body.lastIndexOf("$");
        if (dollarIndex !== -1) {
            modPart = body.slice(dollarIndex + 1);
            body = body.slice(0, dollarIndex);
        }

        if (body && !isAsciiOnly(body)) {
            skippedNonAscii++;
            continue;
        }

        const condition = {};

        if (modPart) {
            const parsed = parseModifiers(modPart);
            if (parsed.unsupported) {
                skipped++;
                continue;
            }

            const hasDomains =
                parsed.initiatorDomains.length > 0 ||
                parsed.excludedInitiatorDomains.length > 0;

            if (!body && !hasDomains) {
                skippedEmpty++;
                continue;
            }

            if (body) {
                condition.urlFilter = body;
            }
            if (parsed.thirdParty !== null) {
                condition.domainType = parsed.thirdParty ? "thirdParty" : "firstParty";
            }
            if (parsed.resourceTypes.length > 0) {
                condition.resourceTypes = parsed.resourceTypes;
            }
            if (parsed.initiatorDomains.length > 0) {
                condition.initiatorDomains = parsed.initiatorDomains;
            }
            if (parsed.excludedInitiatorDomains.length > 0) {
                condition.excludedInitiatorDomains = parsed.excludedInitiatorDomains;
            }
        } else {
            if (!body) {
                skippedEmpty++;
                continue;
            }
            condition.urlFilter = body;
        }

        dnrRules.push({
            id: ruleId++,
            priority: 2,
            action: { type: "allow" },
            condition
        });
    }

    console.log(`[stage 5] converted: ${dnrRules.length}, skipped: ${skipped}, regexp: ${skippedRegexp}, non-ascii: ${skippedNonAscii}, empty-url: ${skippedEmpty}`);
    return dnrRules;
}