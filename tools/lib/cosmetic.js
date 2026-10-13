/* ============================================================
   Конвертация КОСМЕТИЧЕСКИХ правил EasyList в CSS + domain-map.

   Что делает:
   - Разбирает правила вида "##selector" и "domain##selector".
   - Общие (##selector без домена) → в один CSS-файл (cosmetic.css).
   - Domain-specific (example.com##selector) → в карту domain-map.json,
     откуда потом content script берёт селекторы для конкретного сайта.

   Почему две категории:
   - Общие селекторы применяются на любой странице.
   - Domain-specific нужны только на конкретном сайте — держать их
     в общем CSS = грузить браузер парсингом всех 31 310 правил
     на каждой странице. Карта позволяет отдавать только нужные.

   Не поддерживается (пропускается):
   - #@# (исключения косметики) — учтём позже, если понадобится.
   - Не-ASCII селекторы — Chrome капризен, пропускаем на всякий случай.
   - Селекторы с префиксом ~ в домене (например, "~example.com##.ad").
   - Extended-синтаксис (AdGuard/uBlock/ABP), который не является
     валидным CSS и молча игнорируется браузером при insertCSS:
       :style(...)          — AdGuard
       :remove()            — AdGuard
       :upward(...)         — uBlock
       :matches-path(...)   — uBlock
       :matches-css(...)    — uBlock
       :matches-attr(...)   — uBlock
       :contains(...)       — uBlock (text-based)
       :xpath(...)          — uBlock
       :-abp-properties(...) — Adblock Plus
       +js(...)             — AdGuard JS-правило
   ============================================================ */

import { isAsciiOnly } from "./utils.js";

// Маркеры extended-синтаксиса.
// Если селектор содержит любой из них — правило невалидно для CSS
// и должно быть отброшено конвертером.
const EXTENDED_MARKERS = [
    ":style(",
    ":remove()",
    ":upward(",
    ":matches-path(",
    ":matches-css(",
    ":matches-attr(",
    ":contains(",
    ":xpath(",
    ":-abp-properties(",
    "+js("
];

/**
 * Проверяет, содержит ли селектор extended-синтаксис.
 * Такие правила не работают через insertCSS и должны быть пропущены.
 *
 * @param {string} selector - часть правила после ##
 * @returns {boolean} true если селектор extended
 */
function isExtendedSelector(selector) {
    for (const marker of EXTENDED_MARKERS) {
        if (selector.includes(marker)) return true;
    }
    return false;
}

/**
 * Убирает дубликаты из косметических правил.
 *
 * @param {string[]} cosmeticRules - все косметические строки
 * @returns {string[]} уникальные
 */
export function selectCosmeticRules(cosmeticRules) {
    const unique = [...new Set(cosmeticRules)];
    console.log(`\n[stage 4] cosmetic (before dedup): ${cosmeticRules.length}`);
    console.log(`[stage 4] cosmetic (after dedup):  ${unique.length}`);
    return unique;
}

/**
 * Разбирает косметические правила на:
 * - общие селекторы (для CSS-файла)
 * - domain-map (для content script)
 *
 * Возвращает готовый CSS-текст и объект { domain: [selectors] }.
 *
 * @param {string[]} rules - уникальные косметические правила
 * @returns {{ cssText: string, domainMap: Object<string, string[]> }}
 */
export function cosmeticRulesToCss(rules) {
    const generalSelectors = [];
    const domainMap = {};
    let skippedExceptions = 0;
    let skippedInvalid = 0;
    let skippedExtended = 0;

    for (const rule of rules) {
        // #@# — исключения, пока пропускаем
        if (rule.includes("#@#")) {
            skippedExceptions++;
            continue;
        }

        const hashIndex = rule.indexOf("##");
        if (hashIndex === -1) {
            skippedInvalid++;
            continue;
        }

        const domainPart = rule.slice(0, hashIndex);
        const selectorPart = rule.slice(hashIndex + 2).trim();

        if (!selectorPart) {
            skippedInvalid++;
            continue;
        }

        if (!isAsciiOnly(selectorPart)) {
            skippedInvalid++;
            continue;
        }

        // Extended-синтаксис — не CSS, пропускаем.
        // Применяем проверку и к общим, и к domain-specific правилам,
        // потому что extended-часть может быть в любом из них.
        if (isExtendedSelector(selectorPart)) {
            skippedExtended++;
            continue;
        }

        // Общее правило (без домена)
        if (domainPart === "") {
            generalSelectors.push(selectorPart);
            continue;
        }

        // Domain-specific: доменов может быть несколько через запятую
        const domains = domainPart.split(",").map((d) => d.trim()).filter(Boolean);
        for (const domain of domains) {
            if (domain.startsWith("~")) continue; // исключения пока не поддерживаем
            if (!isAsciiOnly(domain)) continue;

            if (!domainMap[domain]) domainMap[domain] = new Set();
            domainMap[domain].add(selectorPart);
        }
    }

    console.log(`[stage 4] general selectors:       ${generalSelectors.length}`);
    console.log(`[stage 4] domain-specific domains: ${Object.keys(domainMap).length}`);
    console.log(`[stage 4] skipped exceptions:      ${skippedExceptions}`);
    console.log(`[stage 4] skipped invalid:         ${skippedInvalid}`);
    console.log(`[stage 4] skipped extended:        ${skippedExtended}`);

    const uniqueGeneral = [...new Set(generalSelectors)];
    console.log(`[stage 4] unique general selectors: ${uniqueGeneral.length}`);

    const cssLines = [];
    cssLines.push("/* ============================================================");
    cssLines.push("   Автогенерировано конвертером EasyList / RU AdList.");
    cssLines.push("   НЕ редактировать вручную — изменения потеряются.");
    cssLines.push("   Для ручных правил используй content/cosmetic-manual.css.");
    cssLines.push("   ============================================================ */");
    cssLines.push("");

    for (const sel of uniqueGeneral) {
        cssLines.push(`${sel} { display: none !important; }`);
    }

    // Set → Array для JSON.stringify
    const domainMapPlain = {};
    let totalDomainSelectors = 0;
    for (const [domain, selectors] of Object.entries(domainMap)) {
        domainMapPlain[domain] = [...selectors];
        totalDomainSelectors += selectors.size;
    }

    console.log(`[stage 4] total domain selectors:  ${totalDomainSelectors}`);

    return {
        cssText: cssLines.join("\n"),
        domainMap: domainMapPlain
    };
}