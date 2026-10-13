/* ============================================================
   Конвертация КОСМЕТИЧЕСКИХ правил EasyList в CSS + domain-map.

   Что делает:
   - Разбирает правила вида "##selector" и "domain##selector".
   - Общие (##selector без домена) → в один CSS-файл (cosmetic.css).
   - Domain-specific (example.com##selector) → в карту domain-map.json,
     откуда потом content script берёт селекторы для конкретного сайта.
   - Исключения (domain#@#selector) → в карту cosmetic-exclude.json.
     Content script вставляет отдельный <style> с display: revert,
     который перекрывает скрытие.

   Почему две категории:
   - Общие селекторы применяются на любой странице.
   - Domain-specific нужны только на конкретном сайте — держать их
     в общем CSS = грузить браузер парсингом всех правил на каждой
     странице. Карта позволяет отдавать только нужные.

   Не поддерживается (пропускается):
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
 * - domain-exclude (исключения #@#, для отдельного стиля)
 *
 * Возвращает css-текст, карту селекторов и карту исключений.
 *
 * @param {string[]} rules - уникальные косметические правила
 * @returns {{
 *   cssText: string,
 *   domainMap: Object<string, string[]>,
 *   domainExclude: Object<string, string[]>
 * }}
 */
export function cosmeticRulesToCss(rules) {
    const generalSelectors = [];
    const domainMap = {};
    const domainExclude = {};
    let skippedInvalid = 0;
    let skippedExtended = 0;
    let excludeCount = 0;

    for (const rule of rules) {
        // Определяем тип: ## (скрыть) или #@# (не скрывать).
        // #@# имеет приоритет: если строка содержит и #@#, и ##, считаем
        // её исключением — так делает EasyList.
        const isExclude = rule.includes("#@#");

        let hashIndex;
        let selectorOffset;

        if (isExclude) {
            hashIndex = rule.indexOf("#@#");
            selectorOffset = 3;
        } else {
            hashIndex = rule.indexOf("##");
            selectorOffset = 2;
        }

        if (hashIndex === -1) {
            skippedInvalid++;
            continue;
        }

        const domainPart = rule.slice(0, hashIndex);
        const selectorPart = rule.slice(hashIndex + selectorOffset).trim();

        if (!selectorPart) {
            skippedInvalid++;
            continue;
        }

        if (!isAsciiOnly(selectorPart)) {
            skippedInvalid++;
            continue;
        }

        if (isExtendedSelector(selectorPart)) {
            skippedExtended++;
            continue;
        }

        // Общее правило без домена.
        // #@# без домена смысла не имеет, но если встретится — игнорируем.
        if (domainPart === "") {
            if (!isExclude) generalSelectors.push(selectorPart);
            continue;
        }

        // Domain-specific: доменов может быть несколько через запятую.
        const domains = domainPart.split(",").map((d) => d.trim()).filter(Boolean);
        for (const domain of domains) {
            if (domain.startsWith("~")) continue; // исключения домена пока не поддерживаем
            if (!isAsciiOnly(domain)) continue;

            if (isExclude) {
                if (!domainExclude[domain]) domainExclude[domain] = new Set();
                domainExclude[domain].add(selectorPart);
                excludeCount++;
            } else {
                if (!domainMap[domain]) domainMap[domain] = new Set();
                domainMap[domain].add(selectorPart);
            }
        }
    }

    // Вычитаем исключения из domainMap: что запрещено на домене — убираем.
    // Общий CSS (cosmetic.css) не трогаем: он глобальный, переопределение
    // делается через отдельный <style id="erst-domain-exclude"> в content script.
    let removedFromMap = 0;
    for (const domain of Object.keys(domainMap)) {
        if (!domainExclude[domain]) continue;
        for (const sel of domainExclude[domain]) {
            if (domainMap[domain].delete(sel)) removedFromMap++;
        }
        if (domainMap[domain].size === 0) {
            delete domainMap[domain];
        }
    }

    console.log(`[stage 4] general selectors:       ${generalSelectors.length}`);
    console.log(`[stage 4] domain-specific domains: ${Object.keys(domainMap).length}`);
    console.log(`[stage 4] #@# exclusions (raw):    ${excludeCount}`);
    console.log(`[stage 4] #@# removed from map:    ${removedFromMap}`);
    console.log(`[stage 4] #@# domains:             ${Object.keys(domainExclude).length}`);
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

    const domainExcludePlain = {};
    let totalExcludeSelectors = 0;
    for (const [domain, selectors] of Object.entries(domainExclude)) {
        // Если после вычитания для домена ничего не осталось — исключения
        // для него всё равно нужны: они могут перекрывать общий CSS.
        domainExcludePlain[domain] = [...selectors];
        totalExcludeSelectors += selectors.size;
    }

    console.log(`[stage 4] total domain selectors:  ${totalDomainSelectors}`);
    console.log(`[stage 4] total exclude selectors: ${totalExcludeSelectors}`);

    return {
        cssText: cssLines.join("\n"),
        domainMap: domainMapPlain,
        domainExclude: domainExcludePlain
    };
}