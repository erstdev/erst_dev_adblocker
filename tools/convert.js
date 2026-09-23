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

   См. также tools/README.md — там описание каждого модуля.
   ============================================================ */

import {
    INPUT_FILES,
    OUT_RULES,
    OUT_EXCEPTIONS,
    OUT_CSS,
    OUT_COSMETIC_MAP
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

function main() {
    // 1. Читаем все списки
    const allLines = readAllLists(INPUT_FILES);

    // 2. Классифицируем строки
    const classified = classifyLines(allLines);
    logClassification(classified);

    // 3. Сетевые правила → DNR
    const simple = selectSimpleRules(classified.network);
    const simpleDnr = simpleRulesToDnr(simple);
    console.log(`\n[stage 1] generated DNR rules: ${simpleDnr.length}`);

    const withModifiers = selectModifierRules(classified.network);
    const modifierDnr = modifierRulesToDnr(withModifiers, 1);
    console.log(`[stage 2] generated DNR rules: ${modifierDnr.length}`);

    const pathRules = selectPathRules(classified.network);
    const pathDnr = pathRulesToDnr(pathRules, 1);
    console.log(`[stage 3] generated DNR rules: ${pathDnr.length}`);

    // 4. Исключения → DNR allow
    const exceptions = selectExceptionRules(classified.exceptions);
    const exceptionDnr = exceptionRulesToDnr(exceptions, 1);
    console.log(`[stage 5] generated DNR rules: ${exceptionDnr.length}`);

    // 5. Применяем квоты, получаем финальные массивы с id
    const { ads, exceptions: excs } = applyQuotas(
        modifierDnr,
        pathDnr,
        simpleDnr,
        exceptionDnr
    );

    writeJson(OUT_RULES, ads);
    writeJson(OUT_EXCEPTIONS, excs);

    // 6. Косметика → CSS + domain-map
    const cosmetic = selectCosmeticRules(classified.cosmetic);
    const { cssText, domainMap } = cosmeticRulesToCss(cosmetic);
    writeCss(OUT_CSS, cssText);
    writeJson(OUT_COSMETIC_MAP, domainMap);
}

main();