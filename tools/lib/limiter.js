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

    // Переиндексация id в отдельные диапазоны — Chrome смешивает
    // пространства id статических и динамических правил, поэтому
    // ads.json идёт в 10000+, exceptions — в 100000+, а динамические
    // (whitelist) занимают 1..9999 (см. shared/storage.js).
    const reindexedAds = dnrRules.map((rule, i) => ({ ...rule, id: i + ID_BASE_ADS }));
    const reindexedExc = cappedExc.map((rule, i) => ({ ...rule, id: i + ID_BASE_EXCEPTIONS }));

    return { ads: reindexedAds, exceptions: reindexedExc };
}