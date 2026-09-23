/* ============================================================
   Конвертер EasyList / RU AdList → формат DNR + cosmetic CSS.

   Запуск:  node tools/convert.js
   Вход:    lists/*.txt
   Выход:   rules/ads.json
            rules/exceptions.json
            content/cosmetic.css
            rules/cosmetic-map.json
   ============================================================ */

const fs = require("fs");
const path = require("path");

// ============================================================
// Конфигурация
// ============================================================

const INPUT_FILES = [
    "lists/easylist.txt",
    "lists/adguard-russian.txt"
];

const OUT_RULES = "rules/ads.json";
const OUT_EXCEPTIONS = "rules/exceptions.json";
const OUT_CSS = "content/cosmetic.css";
const OUT_COSMETIC_MAP = "rules/cosmetic-map.json";

const MAX_DNR_RULES = 30000;

// Квоты (сумма блокирующих + исключений = 30000)
const QUOTA_STAGE_2 = 5000;
const QUOTA_STAGE_3 = 15000;
const QUOTA_STAGE_1 = 8500;
const QUOTA_EXCEPTIONS = 1500;

// Диапазоны id (Chrome смешивает пространства id статических
// и динамических правил, поэтому выделяем каждому свой).
const ID_BASE_ADS = 10000;         // ads.json: 10000..38023
const ID_BASE_EXCEPTIONS = 100000; // exceptions.json: 100000..

const ALL_RESOURCE_TYPES = [
    "script", "image", "xmlhttprequest", "sub_frame",
    "media", "font", "ping", "other", "stylesheet", "websocket"
];

const RESOURCE_TYPE_MAP = {
    "script": "script",
    "image": "image",
    "subdocument": "sub_frame",
    "xmlhttprequest": "xmlhttprequest",
    "stylesheet": "stylesheet",
    "font": "font",
    "media": "media",
    "ping": "ping",
    "websocket": "websocket",
    "other": "other"
};

const UNSUPPORTED_MODIFIERS = new Set([
    "document", "popup", "replace", "csp", "rewrite",
    "redirect", "removeparam", "generichide", "elemhide", "empty"
]);

// ============================================================
// Чтение файлов
// ============================================================

function readLines(file) {
    const fullPath = path.join(__dirname, "..", file);
    if (!fs.existsSync(fullPath)) {
        console.warn(`[skip] file not found: ${file}`);
        return [];
    }
    return fs.readFileSync(fullPath, "utf8").split("\n");
}

function readAllLists(files) {
    const allLines = [];
    for (const file of files) {
        const lines = readLines(file);
        console.log(`[read] ${file}: ${lines.length} lines`);
        allLines.push(...lines);
    }
    console.log(`[total] ${allLines.length} lines to process`);
    return allLines;
}

// ============================================================
// Классификация строк
// ============================================================

function classifyLines(allLines) {
    const network = [];
    const cosmetic = [];
    const exceptions = [];
    let comments = 0;

    for (const line of allLines) {
        const trimmed = line.trim();

        if (!trimmed) { comments++; continue; }
        if (trimmed.startsWith("!")) { comments++; continue; }
        if (trimmed.startsWith("[")) { comments++; continue; }

        if (trimmed.startsWith("@@")) {
            exceptions.push(trimmed);
            continue;
        }

        if (trimmed.includes("##") || trimmed.includes("#@#")) {
            cosmetic.push(trimmed);
            continue;
        }

        network.push(trimmed);
    }

    return { network, cosmetic, exceptions, comments };
}

function logClassification({ network, cosmetic, exceptions, comments }) {
    console.log(`[classify] network:    ${network.length}`);
    console.log(`[classify] cosmetic:   ${cosmetic.length}`);
    console.log(`[classify] exceptions: ${exceptions.length}`);
    console.log(`[classify] skipped:    ${comments}`);
}

// ============================================================
// Утилиты
// ============================================================

function isAsciiOnly(str) {
    return /^[\x00-\x7F]*$/.test(str);
}

function capRules(rules, max) {
    if (rules.length <= max) return rules;
    const capped = rules.slice(0, max);
    console.log(`[cap] ${rules.length} → ${capped.length} (max: ${max})`);
    return capped;
}

// ============================================================
// Этап 1: простые ||domain^
// ============================================================

function selectSimpleRules(networkRules) {
    const simple = networkRules.filter(
        (r) => r.startsWith("||") && r.endsWith("^")
    );
    const unique = [...new Set(simple)];
    console.log(`\n[stage 1] simple ||domain^ (before dedup): ${simple.length}`);
    console.log(`[stage 1] simple ||domain^ (after dedup):  ${unique.length}`);
    return unique;
}

function simpleRulesToDnr(simpleRules) {
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

function parseModifiers(modifierStr) {
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

function selectModifierRules(networkRules) {
    const withModifiers = networkRules.filter((r) => r.includes("$"));
    console.log(`\n[stage 2] rules with $ modifiers: ${withModifiers.length}`);
    return withModifiers;
}

function modifierRulesToDnr(rules, startId) {
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
// Этап 3: |http:// и /path правила
// ============================================================

function selectPathRules(networkRules) {
    const paths = networkRules.filter(
        (r) => (r.startsWith("|") || r.startsWith("/")) && !r.includes("$")
    );
    const unique = [...new Set(paths)];
    console.log(`\n[stage 3] path/pipe rules (before dedup): ${paths.length}`);
    console.log(`[stage 3] path/pipe rules (after dedup):  ${unique.length}`);
    return unique;
}

function pathRulesToDnr(rules, startId) {
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

// ============================================================
// Этап 5: исключения (@@) → allow-правила
// ============================================================

function selectExceptionRules(exceptionRules) {
    const unique = [...new Set(exceptionRules)];
    console.log(`\n[stage 5] exceptions (before dedup): ${exceptionRules.length}`);
    console.log(`[stage 5] exceptions (after dedup):  ${unique.length}`);
    return unique;
}

function exceptionRulesToDnr(rules, startId) {
    const dnrRules = [];
    let ruleId = startId;
    let skipped = 0;
    let skippedNonAscii = 0;

    for (const easyRule of rules) {
        let body = easyRule.slice(2);

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

// ============================================================
// Этап 4: косметические правила → CSS + domain map
// ============================================================

function selectCosmeticRules(cosmeticRules) {
    const unique = [...new Set(cosmeticRules)];
    console.log(`\n[stage 4] cosmetic (before dedup): ${cosmeticRules.length}`);
    console.log(`[stage 4] cosmetic (after dedup):  ${unique.length}`);
    return unique;
}

function cosmeticRulesToCss(rules) {
    const generalSelectors = [];
    const domainMap = {};
    let skippedExceptions = 0;
    let skippedInvalid = 0;

    for (const rule of rules) {
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

        if (domainPart === "") {
            generalSelectors.push(selectorPart);
            continue;
        }

        const domains = domainPart.split(",").map((d) => d.trim()).filter(Boolean);
        for (const domain of domains) {
            if (domain.startsWith("~")) continue;
            if (!isAsciiOnly(domain)) continue;

            if (!domainMap[domain]) domainMap[domain] = new Set();
            domainMap[domain].add(selectorPart);
        }
    }

    console.log(`[stage 4] general selectors:       ${generalSelectors.length}`);
    console.log(`[stage 4] domain-specific domains: ${Object.keys(domainMap).length}`);
    console.log(`[stage 4] skipped exceptions:      ${skippedExceptions}`);
    console.log(`[stage 4] skipped invalid:         ${skippedInvalid}`);

    const uniqueGeneral = [...new Set(generalSelectors)];
    console.log(`[stage 4] unique general selectors: ${uniqueGeneral.length}`);

    const cssLines = [];
    cssLines.push("/* ============================================================");
    cssLines.push("   Автогенерировано конвертером EasyList / RU AdList.");
    cssLines.push("   НЕ редактировать вручную — изменения потеряются.");
    cssLines.push("   ============================================================ */");
    cssLines.push("");

    for (const sel of uniqueGeneral) {
        cssLines.push(`${sel} { display: none !important; }`);
    }

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

// ============================================================
// Запись результата
// ============================================================

function writeJson(relPath, data) {
    const fullPath = path.join(__dirname, "..", relPath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fullPath, JSON.stringify(data, null, 2));
    const size = Array.isArray(data)
        ? `${data.length} items`
        : `${Object.keys(data).length} keys`;
    console.log(`[write] ${size} → ${relPath}`);
}

function writeCss(relPath, cssText) {
    const fullPath = path.join(__dirname, "..", relPath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fullPath, cssText);
    console.log(`[write] css → ${relPath}`);
}

// ============================================================
// main
// ============================================================

function main() {
    const allLines = readAllLists(INPUT_FILES);
    const classified = classifyLines(allLines);
    logClassification(classified);

    // === Этап 1 ===
    const simple = selectSimpleRules(classified.network);
    const simpleDnr = simpleRulesToDnr(simple);
    console.log(`\n[stage 1] generated DNR rules: ${simpleDnr.length}`);

    // === Этап 2 ===
    const withModifiers = selectModifierRules(classified.network);
    const modifierDnr = modifierRulesToDnr(withModifiers, 1);
    console.log(`[stage 2] generated DNR rules: ${modifierDnr.length}`);

    // === Этап 3 ===
    const pathRules = selectPathRules(classified.network);
    const pathDnr = pathRulesToDnr(pathRules, 1);
    console.log(`[stage 3] generated DNR rules: ${pathDnr.length}`);

    // === Этап 5 ===
    const exceptions = selectExceptionRules(classified.exceptions);
    const exceptionDnr = exceptionRulesToDnr(exceptions, 1);
    console.log(`[stage 5] generated DNR rules: ${exceptionDnr.length}`);

    // === Квоты ===
    console.log(`\n[quota] stage 2: ${QUOTA_STAGE_2}`);
    console.log(`[quota] stage 3: ${QUOTA_STAGE_3}`);
    console.log(`[quota] stage 1: ${QUOTA_STAGE_1}`);
    console.log(`[quota] exceptions: ${QUOTA_EXCEPTIONS}`);

    const capped2 = capRules(modifierDnr, QUOTA_STAGE_2);
    const capped3 = capRules(pathDnr, QUOTA_STAGE_3);
    const capped1 = capRules(simpleDnr, QUOTA_STAGE_1);
    const cappedExc = capRules(exceptionDnr, QUOTA_EXCEPTIONS);

    let dnrRules = capped2.concat(capped3).concat(capped1);

    if (dnrRules.length + cappedExc.length > MAX_DNR_RULES) {
        const budget = MAX_DNR_RULES - cappedExc.length;
        console.log(`[limit] WARNING: block+allow > ${MAX_DNR_RULES}, cutting blocks to ${budget}`);
        dnrRules = dnrRules.slice(0, budget);
    }

    console.log(`\n[limit] blocking rules: ${dnrRules.length}`);
    console.log(`[limit] exception rules: ${cappedExc.length}`);
    console.log(`[limit] total: ${dnrRules.length + cappedExc.length} (max: ${MAX_DNR_RULES})`);

    // Переиндексация id в отдельные диапазоны
    const reindexedAds = dnrRules.map((rule, i) => ({ ...rule, id: i + ID_BASE_ADS }));
    const reindexedExc = cappedExc.map((rule, i) => ({ ...rule, id: i + ID_BASE_EXCEPTIONS }));

    writeJson(OUT_RULES, reindexedAds);
    writeJson(OUT_EXCEPTIONS, reindexedExc);

    // === Этап 4 ===
    const cosmetic = selectCosmeticRules(classified.cosmetic);
    const { cssText, domainMap } = cosmeticRulesToCss(cosmetic);
    writeCss(OUT_CSS, cssText);
    writeJson(OUT_COSMETIC_MAP, domainMap);
}

main();