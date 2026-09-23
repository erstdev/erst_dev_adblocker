/* ============================================================
   Конвертация СЕТЕВЫХ правил EasyList в DNR-формат.

   Что сюда входит:
   - Этап 1: простые ||domain^ (самые массовые)
   - Этап 2: правила с $-модификаторами ($third-party, $script, ...)
   - Этап 3: правила с |http:// и /path

   Что НЕ сюда:
   - Косметика (##...) → cosmetic.js
   - Исключения (@@...) → exceptions.js

   Каждый этап: select* (отбор из общего списка) + *ToDnr (конвертация).
   ============================================================ */

import {
    ALL_RESOURCE_TYPES,
    RESOURCE_TYPE_MAP,
    UNSUPPORTED_MODIFIERS
} from "./config.js";
import { isAsciiOnly } from "./utils.js";

// ============================================================
// Этап 1: простые ||domain^
// ============================================================

/**
 * Отбирает из сетевых правил простые ||domain^ и убирает дубликаты.
 *
 * Простое правило = начинается с || и заканчивается ^.
 * Пример: "||doubleclick.net^"
 *
 * @param {string[]} networkRules - все сетевые правила
 * @returns {string[]} уникальные простые правила
 */
export function selectSimpleRules(networkRules) {
    const simple = networkRules.filter(
        (r) => r.startsWith("||") && r.endsWith("^")
    );
    const unique = [...new Set(simple)];
    console.log(`\n[stage 1] simple ||domain^ (before dedup): ${simple.length}`);
    console.log(`[stage 1] simple ||domain^ (after dedup):  ${unique.length}`);
    return unique;
}

/**
 * Конвертирует простые правила в DNR-формат.
 *
 * Пример: "||doubleclick.net^" →
 *   { id, priority:1, action:{type:"block"},
 *     condition:{urlFilter:"||doubleclick.net^", resourceTypes:[...]}}
 *
 * @param {string[]} simpleRules - простые правила
 * @returns {Array} массив DNR-правил
 */
export function simpleRulesToDnr(simpleRules) {
    const dnrRules = [];
    let ruleId = 1;
    let skippedNonAscii = 0;

    for (const easyRule of simpleRules) {
        if (!isAsciiOnly(easyRule)) {
            skippedNonAscii++;
            continue;
        }
        dnrRules.push({
            id: ruleId++,
            priority: 1,
            action: { type: "block" },
            condition: {
                urlFilter: easyRule,
                resourceTypes: ALL_RESOURCE_TYPES
            }
        });
    }

    console.log(`[stage 1] skipped non-ascii: ${skippedNonAscii}`);
    return dnrRules;
}

// ============================================================
// Этап 2: правила с $-модификаторами
// ============================================================

/**
 * Разбирает строку модификаторов из EasyList.
 *
 * Пример: "third-party,script,~image" →
 *   { thirdParty: true, resourceTypes: ["script"], unsupported: false }
 *
 * Поддерживаемые модификаторы:
 *   $third-party / $~third-party → domainType
 *   $script, $image, $subdocument, ... → resourceTypes
 *
 * НЕ поддерживаемые:
 *   $domain=..., $document, $popup, $replace, $csp, $removeparam, ...
 *   Если встретили — правило пропускается (unsupported: true).
 *
 * @param {string} modifierStr - строка после $ (например, "third-party,script")
 * @returns {{thirdParty: boolean|null, resourceTypes: string[], unsupported: boolean}}
 */
export function parseModifiers(modifierStr) {
    const mods = modifierStr.split(",");
    const result = {
        thirdParty: null,
        resourceTypes: [],
        unsupported: false
    };

    for (const mod of mods) {
        const trimmed = mod.trim();
        const isNegated = trimmed.startsWith("~");
        const name = isNegated ? trimmed.slice(1) : trimmed;

        if (name === "third-party") {
            result.thirdParty = !isNegated;
            continue;
        }

        if (name.startsWith("domain=")) {
            result.unsupported = true;
            return result;
        }

        if (isNegated && RESOURCE_TYPE_MAP[name]) {
            result.unsupported = true;
            return result;
        }

        if (RESOURCE_TYPE_MAP[name]) {
            result.resourceTypes.push(RESOURCE_TYPE_MAP[name]);
            continue;
        }

        if (UNSUPPORTED_MODIFIERS.has(name)) {
            result.unsupported = true;
            return result;
        }
    }

    return result;
}

/**
 * Отбирает правила с $ (модификаторами).
 *
 * @param {string[]} networkRules - все сетевые правила
 * @returns {string[]} правила с $
 */
export function selectModifierRules(networkRules) {
    const withModifiers = networkRules.filter((r) => r.includes("$"));
    console.log(`\n[stage 2] rules with $ modifiers: ${withModifiers.length}`);
    return withModifiers;
}

/**
 * Конвертирует правила с $ в DNR-формат.
 *
 * Пример: "||ads.com^$third-party,script" →
 *   { condition:{ urlFilter:"||ads.com^", domainType:"thirdParty",
 *                 resourceTypes:["script"] } }
 *
 * @param {string[]} rules - правила с $
 * @param {number} startId - стартовый id
 * @returns {Array} массив DNR-правил
 */
export function modifierRulesToDnr(rules, startId) {
    const dnrRules = [];
    let ruleId = startId;
    let skipped = 0;
    let skippedNonAscii = 0;

    for (const easyRule of rules) {
        const dollarIndex = easyRule.lastIndexOf("$");
        const urlPart = easyRule.slice(0, dollarIndex);
        const modPart = easyRule.slice(dollarIndex + 1);

        if (!isAsciiOnly(urlPart)) {
            skippedNonAscii++;
            continue;
        }

        const parsed = parseModifiers(modPart);
        if (parsed.unsupported) {
            skipped++;
            continue;
        }

        const condition = { urlFilter: urlPart };
        if (parsed.thirdParty !== null) {
            condition.domainType = parsed.thirdParty ? "thirdParty" : "firstParty";
        }
        if (parsed.resourceTypes.length > 0) {
            condition.resourceTypes = parsed.resourceTypes;
        }

        dnrRules.push({
            id: ruleId++,
            priority: 1,
            action: { type: "block" },
            condition
        });
    }

    console.log(`[stage 2] converted: ${dnrRules.length}, skipped: ${skipped}, non-ascii: ${skippedNonAscii}`);
    return dnrRules;
}

// ============================================================
// Этап 3: |http:// и /path
// ============================================================

/**
 * Отбирает правила, начинающиеся с | или / (без $).
 *
 * Примеры:
 *   "|https://ads.com/banner.js"
 *   "/ads/banner.png"
 *
 * @param {string[]} networkRules - все сетевые правила
 * @returns {string[]} уникальные path/pipe правила
 */
export function selectPathRules(networkRules) {
    const paths = networkRules.filter(
        (r) => (r.startsWith("|") || r.startsWith("/")) && !r.includes("$")
    );
    const unique = [...new Set(paths)];
    console.log(`\n[stage 3] path/pipe rules (before dedup): ${paths.length}`);
    console.log(`[stage 3] path/pipe rules (after dedup):  ${unique.length}`);
    return unique;
}

/**
 * Конвертирует path/pipe правила в DNR-формат.
 *
 * @param {string[]} rules - path/pipe правила
 * @param {number} startId - стартовый id
 * @returns {Array} массив DNR-правил
 */
export function pathRulesToDnr(rules, startId) {
    const dnrRules = [];
    let ruleId = startId;
    let skippedNonAscii = 0;

    for (const easyRule of rules) {
        if (!isAsciiOnly(easyRule)) {
            skippedNonAscii++;
            continue;
        }
        dnrRules.push({
            id: ruleId++,
            priority: 1,
            action: { type: "block" },
            condition: {
                urlFilter: easyRule,
                resourceTypes: ALL_RESOURCE_TYPES
            }
        });
    }

    console.log(`[stage 3] converted: ${dnrRules.length}, non-ascii: ${skippedNonAscii}`);
    return dnrRules;
}