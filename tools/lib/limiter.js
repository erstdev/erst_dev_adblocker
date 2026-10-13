/* ============================================================
   Применение квот и защита от превышения лимита Chrome.

   Chrome разрешает максимум 30 000 статических DNR-правил.
   У нас получается больше — надо резать.

   Как режем:
   - Этап 2 ($-модификаторы) — самые точные, оставляем все (квота 5000).
   - Этап 3 (|/path) — широкие, но нужные (квота 15000).
   - Этап 1 (||domain^) — самые широкие, добираем остаток (квота 8500).
   - Исключения — отдельная квота (1500).

   Итог должен влезть в MAX_DNR_RULES (30000). Если вдруг нет —
   последняя защита обрезает всё до лимита.

   Диапазоны id (Chrome смешивает пространства id статических
   и динамических правил, поэтому они должны быть раздельными):
   - manual.json:       1..100
   - динамические:      200..9999  (см. shared/storage.js)
   - ads.json:          10000..
   - exceptions.json:   100000..

   Если ads.json дорастёт до 100000 — пересечётся с exceptions.json.
   Если exceptions.json начнётся раньше 10000 — пересечётся с ads.json
   и с динамическими. Обе проверки делает assertIdRanges().
   ============================================================ */

import {
    MAX_DNR_RULES,
    QUOTA_STAGE_2,
    QUOTA_STAGE_3,
    QUOTA_STAGE_1,
    QUOTA_EXCEPTIONS,
    ID_BASE_ADS,
    ID_BASE_EXCEPTIONS
} from "./config.js";
import { capRules } from "./utils.js";

// Диапазон id динамических правил (whitelist).
// Дублирует DYN_RULE_ID_MAX из shared/storage.js.
// ⚠️ Если значение изменится в storage.js — синхронизировать здесь.
const DYN_RULE_ID_MAX = 9999;

/**
 * Проверяет, что диапазоны id не пересекаются.
 *
 * Бросает Error, если:
 * - ads.json дорастёт до ID_BASE_EXCEPTIONS,
 * - exceptions.json начнётся не после DYN_RULE_ID_MAX.
 *
 * @param {number} adsCount - число блокирующих правил
 * @param {number} exceptionsCount - число allow-правил
 */
function assertIdRanges(adsCount, exceptionsCount) {
    const maxAdsId = adsCount > 0 ? ID_BASE_ADS + adsCount - 1 : ID_BASE_ADS - 1;
    const minExcId = ID_BASE_EXCEPTIONS;
    const maxExcId = exceptionsCount > 0 ? ID_BASE_EXCEPTIONS + exceptionsCount - 1 : ID_BASE_EXCEPTIONS - 1;

    // ads vs exceptions
    if (maxAdsId >= minExcId) {
        throw new Error(
            `DNR id range conflict: ads.json ends at id ${maxAdsId}, ` +
            `exceptions.json starts at id ${minExcId}. ` +
            `Уменьши квоты (QUOTA_STAGE_*) или подними ID_BASE_EXCEPTIONS.`
        );
    }

    // exceptions vs dynamic (whitelist)
    if (minExcId <= DYN_RULE_ID_MAX) {
        throw new Error(
            `DNR id range conflict: exceptions.json starts at id ${minExcId}, ` +
            `dynamic whitelist rules go up to id ${DYN_RULE_ID_MAX}. ` +
            `Подними ID_BASE_EXCEPTIONS.`
        );
    }

    console.log(`[id-check] ads ids:        ${ID_BASE_ADS}..${maxAdsId}`);
    console.log(`[id-check] exceptions ids: ${minExcId}..${maxExcId}`);
    console.log(`[id-check] dynamic ids:    200..${DYN_RULE_ID_MAX} (shared/storage.js)`);
}

/**
 * Применяет квоты к правилам каждого этапа и возвращает
 * готовые к записи массивы с финальной индексацией id.
 *
 * @param {Array} modifierDnr   - правила Этапа 2
 * @param {Array} pathDnr       - правила Этапа 3
 * @param {Array} simpleDnr     - правила Этапа 1
 * @param {Array} exceptionDnr  - правила Этапа 5
 * @returns {{ ads: Array, exceptions: Array }}
 */
export function applyQuotas(modifierDnr, pathDnr, simpleDnr, exceptionDnr) {
    console.log(`\n[quota] stage 2: ${QUOTA_STAGE_2}`);
    console.log(`[quota] stage 3: ${QUOTA_STAGE_3}`);
    console.log(`[quota] stage 1: ${QUOTA_STAGE_1}`);
    console.log(`[quota] exceptions: ${QUOTA_EXCEPTIONS}`);

    const capped2 = capRules(modifierDnr, QUOTA_STAGE_2);
    const capped3 = capRules(pathDnr, QUOTA_STAGE_3);
    const capped1 = capRules(simpleDnr, QUOTA_STAGE_1);
    const cappedExc = capRules(exceptionDnr, QUOTA_EXCEPTIONS);

    // Блокирующие: собираем всё вместе, следим за лимитом с учётом исключений
    let dnrRules = capped2.concat(capped3).concat(capped1);

    if (dnrRules.length + cappedExc.length > MAX_DNR_RULES) {
        const budget = MAX_DNR_RULES - cappedExc.length;
        console.log(`[limit] WARNING: block+allow > ${MAX_DNR_RULES}, cutting blocks to ${budget}`);
        dnrRules = dnrRules.slice(0, budget);
    }

    console.log(`\n[limit] blocking rules: ${dnrRules.length}`);
    console.log(`[limit] exception rules: ${cappedExc.length}`);
    console.log(`[limit] total: ${dnrRules.length + cappedExc.length} (max: ${MAX_DNR_RULES})`);

    // Проверка диапазонов id — до финальной индексации.
    // Если что-то не так, лучше упасть здесь, чем при загрузке расширения
    // с ошибкой "Rule with id N does not have a unique ID".
    assertIdRanges(dnrRules.length, cappedExc.length);

    // Переиндексация id в отдельные диапазоны — Chrome смешивает
    // пространства id статических и динамических правил, поэтому
    // ads.json идёт в 10000+, exceptions — в 100000+, а динамические
    // (whitelist) занимают 200..9999 (см. shared/storage.js).
    const reindexedAds = dnrRules.map((rule, i) => ({ ...rule, id: i + ID_BASE_ADS }));
    const reindexedExc = cappedExc.map((rule, i) => ({ ...rule, id: i + ID_BASE_EXCEPTIONS }));

    return { ads: reindexedAds, exceptions: reindexedExc };
}