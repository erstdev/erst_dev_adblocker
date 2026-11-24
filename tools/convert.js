/* ============================================================
   Конвертер EasyList / RU AdList → формат DNR + cosmetic CSS.

   Это точка входа. Здесь только main() — оркестратор.
   Вся логика — в модулях tools/lib/.

   Запуск:  node tools/convert.js   (или npm run convert)
   Вход:    lists/*.txt
   Выход:   rules/ads.json
            rules/exceptions.json
            content/cosmetic.css
            rules/cosmetic-map.json
            rules/cosmetic-exclude.json
   ============================================================ */

import {
    INPUT_FILES,
    OUT_RULES,
    OUT_EXCEPTIONS,
    OUT_CSS,
    OUT_COSMETIC_MAP,
    OUT_COSMETIC_EXCLUDE
} from "./lib/config.js";

import { readAllLists } from "./lib/reader.js";
import { classifyLines, logClassification } from "./lib/classifier.js";
import {
    selectSimpleRules,
    simpleRulesToDnr,
    selectModifierRules,
    modifierRulesToDnr,
    selectPathRules,
    pathRulesToDnr
} from "./lib/network.js";
import {
    selectExceptionRules,
    exceptionRulesToDnr
} from "./lib/exceptions.js";
import {
    selectCosmeticRules,
    cosmeticRulesToCss
} from "./lib/cosmetic.js";
import { applyQuotas } from "./lib/limiter.js";
import { writeJson, writeCss } from "./lib/writer.js";

// Защита от «пустого» прогона: если списки не скачаны или обрезаны,
// конвертер раньше молча писал пустые rules/*.json, и сборка
// упаковывала расширение без правил.
const MIN_INPUT_LINES = 10_000;
const MIN_BLOCKING_RULES = 1_000;
const MIN_ALLOW_RULES = 100;
const MIN_COSMETIC_DOMAINS = 1_000;
const MIN_CSS_BYTES = 100_000;

function main() {
    // 1. Читаем все списки
    const allLines = readAllLists(INPUT_FILES);

    if (allLines.length < MIN_INPUT_LINES) {
        throw new Error(
            `too few lines in lists: ${allLines.length} < ${MIN_INPUT_LINES}. ` +
            `Проверь lists/easylist.txt и lists/adguard-russian.txt`
        );
    }

    // 2. Классифицируем строки
    const classified = classifyLines(allLines);
    logClassification(classified);

    // 3. Сетевые правила → DNR
    const simple = selectSimpleRules(classified.network);
    const simpleDnr = simpleRulesToDnr(simple);
    console.log(`\n[stage 1] generated DNR rules: ${simpleDnr.length}`);

    const withModifiers = selectModifierRules(classified.network);
    const modifierDnr = modifierRulesToDnr(withModifiers);
    console.log(`[stage 2] generated DNR rules: ${modifierDnr.length}`);

    const pathRules = selectPathRules(classified.network);
    const pathDnr = pathRulesToDnr(pathRules);
    console.log(`[stage 3] generated DNR rules: ${pathDnr.length}`);

    // 4. Исключения → DNR allow
    const exceptions = selectExceptionRules(classified.exceptions);
    const exceptionDnr = exceptionRulesToDnr(exceptions);
    console.log(`[stage 5] generated DNR rules: ${exceptionDnr.length}`);

    // 5. Применяем квоты, получаем финальные массивы с id
    const { ads, exceptions: excs } = applyQuotas(
        modifierDnr,
        pathDnr,
        simpleDnr,
        exceptionDnr
    );

    if (ads.length < MIN_BLOCKING_RULES) {
        throw new Error(`refusing to write ${ads.length} blocking rules (min ${MIN_BLOCKING_RULES})`);
    }
    if (excs.length < MIN_ALLOW_RULES) {
        throw new Error(`refusing to write ${excs.length} allow rules (min ${MIN_ALLOW_RULES})`);
    }

    // 6. Косметика → CSS + domain-map + domain-exclude
    const cosmetic = selectCosmeticRules(classified.cosmetic);
    const { cssText, domainMap, domainExclude } = cosmeticRulesToCss(cosmetic);

    if (Object.keys(domainMap).length < MIN_COSMETIC_DOMAINS) {
        throw new Error(`refusing to write ${Object.keys(domainMap).length} cosmetic domains (min ${MIN_COSMETIC_DOMAINS})`);
    }
    if (!cssText || cssText.length < MIN_CSS_BYTES) {
        throw new Error(`refusing to write ${cssText ? cssText.length : 0} bytes of cosmetic CSS (min ${MIN_CSS_BYTES})`);
    }

    // Пишем только после всех проверок: иначе при сбое на косметике
    // rules/*.json уже были бы перезаписаны, а CSS остался старым.
    writeJson(OUT_RULES, ads);
    writeJson(OUT_EXCEPTIONS, excs);
    writeCss(OUT_CSS, cssText);
    writeJson(OUT_COSMETIC_MAP, domainMap);
    writeJson(OUT_COSMETIC_EXCLUDE, domainExclude);
}

try {
    main();
} catch (e) {
    console.error(`[convert] failed: ${e.message}`);
    process.exit(1);
}