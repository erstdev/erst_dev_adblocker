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

   ВАЖНО про пересечения этапов:
   - selectSimpleRules берёт только ||...^ без $.
   - selectPathRules берёт | или / без || и без $.
     Проверка !startsWith("||") обязательна: ||domain^ тоже начинается
     с |, и без неё правило попадает И в simple, И в path, создавая
     два одинаковых DNR-правила. Это съедает квоту и грузит движок.
   - selectModifierRules берёт всё с $, независимо от префикса.
     simple и path явно исключают $, чтобы не пересекаться с этапом 2.

   Известное ограничение:
   - Правила вида ||example.com/path (начинаются с ||, не заканчиваются
     на ^, без $) не попадают ни в один этап и теряются. В EasyList +
     RU AdList таких несколько сотен. Осознанное ограничение.

   id: внутри функций id присваиваются с 1 и ни на что не влияют.
   Финальные id выдаёт limiter.js → applyQuotas: ads.json → 10000+,
   exceptions.json → 100000+.
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
 * Простое правило = начинается с ||, заканчивается ^, без $.
 * Пример: "||doubleclick.net^"
 *
 * Условие !includes("$") добавлено явно: сейчас правило
 * ||example.com^$script не попадает сюда из-за endsWith("^"),
 * но при изменении формата модификаторов (например, $script,domain=a^)
 * пересечение стало бы возможным. Явная проверка защищает.
 *
 * @param {string[]} networkRules - все сетевые правила
 * @returns {string[]} уникальные простые правила
 */
export function selectSimpleRules(networkRules) {
    const simple = networkRules.filter(
        (r) => r.startsWith("||") && r.endsWith("^") && !r.includes("$")
    );
    const unique = [...new Set(simple)];
    console.log(`\n[stage 1] simple ||domain^ (before dedup): ${simple.length}`);
    console.log(`[stage 1] simple ||domain^ (after dedup):  ${unique.length}`);
    return unique;
}

/**
 * Конвертирует простые правила в DNR-формат.
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
 * Поддерживаемые модификаторы:
 *   $third-party / $3p / $~third-party / $~3p → domainType
 *   $first-party / $1p / $~first-party / $~1p → domainType
 *   $script, $image, $subdocument, $xhr, $object, ... → resourceTypes
 *   $all → все типы ресурсов (просто игнорируется)
 *   $domain=a|b|~c → initiatorDomains / excludedInitiatorDomains
 *
 * НЕ поддерживаемые (правило пропускается с unsupported: true):
 *   Явно из UNSUPPORTED_MODIFIERS: $document, $popup, $replace,
 *   $csp, $removeparam, $generichide, $elemhide, $empty, $important,
 *   $badfilter, $match-case, $rewrite, $redirect, $redirect-rule,
 *   $denyallow, $header, $method, $to, $from, $inline-script,
 *   $inline-font.
 *
 *   Неизвестные модификаторы тоже пропускаются целиком. Раньше они
 *   молча игнорировались, и правило конвертировалось без них —
 *   становилось шире задуманного. Безопаснее пропустить правило.
 *
 * ⚠️ Домены в $domain= должны быть ASCII. Не-ASCII (IDN) пропускаем.
 * ⚠️ Модификаторы вида key=value (csp=, header=, redirect=, ...)
 *    проверяются по части до знака "=".
 *
 * @param {string} modifierStr - строка после $
 * @returns {{
 *   thirdParty: boolean|null,
 *   resourceTypes: string[],
 *   initiatorDomains: string[],
 *   excludedInitiatorDomains: string[],
 *   unsupported: boolean
 * }}
 */
export function parseModifiers(modifierStr) {
    const mods = modifierStr.split(",");
    const result = {
        thirdParty: null,
        resourceTypes: [],
        initiatorDomains: [],
        excludedInitiatorDomains: [],
        unsupported: false
    };

    for (const mod of mods) {
        const trimmed = mod.trim();
        if (!trimmed) continue;

        const isNegated = trimmed.startsWith("~");
        const name = isNegated ? trimmed.slice(1) : trimmed;

        // $third-party / $3p / $~third-party / $~3p
        if (name === "third-party" || name === "3p") {
            result.thirdParty = !isNegated;
            continue;
        }

        // $first-party / $1p / $~first-party / $~1p
        if (name === "first-party" || name === "1p") {
            result.thirdParty = isNegated;
            continue;
        }

        // $domain=a|b|~c
        if (name.startsWith("domain=")) {
            const value = name.slice(7);
            const domains = value.split("|").map((d) => d.trim()).filter(Boolean);
            for (const d of domains) {
                const isExclude = d.startsWith("~");
                const clean = isExclude ? d.slice(1) : d;
                if (!clean) continue;
                if (!isAsciiOnly(clean)) continue;

                if (isExclude) {
                    result.excludedInitiatorDomains.push(clean);
                } else {
                    result.initiatorDomains.push(clean);
                }
            }
            continue;
        }

        // $all = все типы ресурсов. В DNR это отсутствие resourceTypes
        // (правило применяется ко всем). Просто игнорируем модификатор.
        if (name === "all") {
            continue;
        }

        // Отрицание типа ресурса (~script, ~image) не поддерживаем —
        // DNR не умеет "всё кроме script".
        if (isNegated && RESOURCE_TYPE_MAP[name]) {
            result.unsupported = true;
            return result;
        }

        // Тип ресурса: $script, $image, $xhr, $object, ...
        if (RESOURCE_TYPE_MAP[name]) {
            result.resourceTypes.push(RESOURCE_TYPE_MAP[name]);
            continue;
        }

        // Модификаторы вида key=value (csp=, header=, method=, to=,
        // from=, rewrite=, redirect=, redirect-rule=, denyallow=)
        // проверяем по части до знака "=".
        const eqIndex = name.indexOf("=");
        const baseName = eqIndex !== -1 ? name.slice(0, eqIndex) : name;

        if (UNSUPPORTED_MODIFIERS.has(baseName)) {
            result.unsupported = true;
            return result;
        }

        // Неизвестный модификатор. Раньше молча игнорировался,
        // правило конвертировалось без него и становилось шире.
        // Теперь правило пропускается целиком — так безопаснее.
        result.unsupported = true;
        return result;
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
 * Если urlPart пустой, но есть initiatorDomains/excludedInitiatorDomains —
 * не пишем urlFilter в condition (Chrome требует хотя бы одно из полей).
 *
 * Regexp-правила (/regexp/$modifiers или /regexp/) не поддерживаются:
 * DNR не умеет regexp в urlFilter напрямую. Пропускаем их целиком,
 * иначе lastIndexOf("$") может найти $ внутри regexp (например, /foo$/)
 * и ошибочно решить, что это модификаторы.
 *
 * @param {string[]} rules - правила с $
 * @returns {Array} массив DNR-правил
 */
export function modifierRulesToDnr(rules) {
    const dnrRules = [];
    let ruleId = 1;
    let skipped = 0;
    let skippedNonAscii = 0;
    let skippedEmpty = 0;
    let skippedRegexp = 0;
    let convertedDomain = 0;

    for (const easyRule of rules) {
        // Regexp-правила AdGuard/uBlock (/regexp/$modifiers или /regexp/)
        // пропускаем целиком — см. комментарий к функции.
        if (easyRule.startsWith("/")) {
            skippedRegexp++;
            continue;
        }

        const dollarIndex = easyRule.lastIndexOf("$");
        const urlPart = easyRule.slice(0, dollarIndex);
        const modPart = easyRule.slice(dollarIndex + 1);

        if (urlPart && !isAsciiOnly(urlPart)) {
            skippedNonAscii++;
            continue;
        }

        const parsed = parseModifiers(modPart);
        if (parsed.unsupported) {
            skipped++;
            continue;
        }

        const hasDomains =
            parsed.initiatorDomains.length > 0 ||
            parsed.excludedInitiatorDomains.length > 0;

        if (!urlPart && !hasDomains) {
            skippedEmpty++;
            continue;
        }

        const condition = {};
        if (urlPart) {
            condition.urlFilter = urlPart;
        }
        if (parsed.thirdParty !== null) {
            condition.domainType = parsed.thirdParty ? "thirdParty" : "firstParty";
        }
        if (parsed.resourceTypes.length > 0) {
            condition.resourceTypes = parsed.resourceTypes;
        }
        if (parsed.initiatorDomains.length > 0) {
            condition.initiatorDomains = parsed.initiatorDomains;
            convertedDomain++;
        }
        if (parsed.excludedInitiatorDomains.length > 0) {
            condition.excludedInitiatorDomains = parsed.excludedInitiatorDomains;
            if (parsed.initiatorDomains.length === 0) convertedDomain++;
        }

        dnrRules.push({
            id: ruleId++,
            priority: 1,
            action: { type: "block" },
            condition
        });
    }

    console.log(`[stage 2] converted: ${dnrRules.length}, skipped: ${skipped}, non-ascii: ${skippedNonAscii}, empty-url: ${skippedEmpty}, regexp: ${skippedRegexp}`);
    console.log(`[stage 2] with domain= (initiatorDomains): ${convertedDomain}`);
    return dnrRules;
}

// ============================================================
// Этап 3: |http:// и /path
// ============================================================

/**
 * Отбирает правила, начинающиеся с | или / (без || и без $).
 *
 * Условие !startsWith("||") обязательно: ||domain^ тоже начинается
 * с |, и без этой проверки правило попадает и в simple (этап 1),
 * и в path (этап 3), создавая два одинаковых DNR-правила.
 *
 * @param {string[]} networkRules - все сетевые правила
 * @returns {string[]} уникальные path/pipe правила
 */
export function selectPathRules(networkRules) {
    const paths = networkRules.filter(
        (r) =>
            (r.startsWith("|") || r.startsWith("/")) &&
            !r.startsWith("||") &&
            !r.includes("$")
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
 * @returns {Array} массив DNR-правил
 */
export function pathRulesToDnr(rules) {
    const dnrRules = [];
    let ruleId = 1;
    let skippedNonAscii = 0;
    let skippedEmpty = 0;

    for (const easyRule of rules) {
        if (!easyRule) {
            skippedEmpty++;
            continue;
        }
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

    console.log(`[stage 3] converted: ${dnrRules.length}, non-ascii: ${skippedNonAscii}, empty-url: ${skippedEmpty}`);
    return dnrRules;
}