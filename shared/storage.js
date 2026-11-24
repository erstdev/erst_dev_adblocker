/* ============================================================
   Работа с состоянием расширения + синхронизация DNR.

   Схема storage:
     enabled: boolean
     whitelist: string[]
     language: string  (код языка из shared/locales, см. shared/i18n.js)

   Диапазоны id (статический DNR + динамический DNR — Chrome
   использует единое пространство id для статических и
   динамических правил):

     manual.json:       1..100
     ads.json:          10000..
     exceptions.json:   100000..
     динамические:      200..9999  (этот файл)

   Диапазон 101..199 оставлен в запасе на случай расширения
   manual.json (например, до 150 правил).

   ВАЖНО: если статический и динамический id пересекутся,
   Chrome выдаст "Rule with id N does not have a unique ID"
   и откажется применять правило.
   ============================================================ */

import { extractHostname } from "./utils.js";

const KEY_ENABLED = "enabled";
const KEY_WHITELIST = "whitelist";

const RULESET_ADS = "ads_ruleset";
const RULESET_EXCEPTIONS = "exceptions_ruleset";
const RULESET_MANUAL = "manual_ruleset";
const ALL_RULESETS = [RULESET_ADS, RULESET_EXCEPTIONS, RULESET_MANUAL];

// Диапазон id динамических правил (whitelist).
// Начинается с 200, потому что 1..100 заняты manual.json,
// 101..199 — запас.
const DYN_RULE_ID_BASE = 200;
const DYN_RULE_ID_MAX = 9999;

// ------------------------------------------------------------
// Нормализация домена
//
// Приводит домен к виду, который хранится в whitelist:
// обрезает пробелы, приводит к lowercase.
// Возвращает null, если после нормализации строка пустая
// или не является строкой.
//
// Зачем: whitelist — это множество точных строк, и isWhitelisted
// сравнивает их через list.includes(). Если в whitelist попадёт
// "Example.com " (с пробелом или в верхнем регистре), сравнение
// не сработает.
// ------------------------------------------------------------
function normalizeDomain(domain) {
    if (typeof domain !== "string") return null;
    const trimmed = domain.trim().toLowerCase();
    if (!trimmed) return null;
    return trimmed;
}

// ------------------------------------------------------------
// Storage: enabled
// ------------------------------------------------------------
export async function getEnabled() {
    const data = await chrome.storage.local.get(KEY_ENABLED);
    return data[KEY_ENABLED] !== false;
}

export async function setEnabled(value) {
    await chrome.storage.local.set({ [KEY_ENABLED]: !!value });
}

// ------------------------------------------------------------
// Storage: whitelist
// ------------------------------------------------------------
export async function getWhitelist() {
    const data = await chrome.storage.local.get(KEY_WHITELIST);
    return Array.isArray(data[KEY_WHITELIST]) ? data[KEY_WHITELIST] : [];
}

export async function addToWhitelist(domain) {
    const clean = normalizeDomain(domain);
    if (!clean) return await getWhitelist();

    const list = await getWhitelist();
    if (!list.includes(clean)) {
        list.push(clean);
        await chrome.storage.local.set({ [KEY_WHITELIST]: list });
    }
    return list;
}

export async function removeFromWhitelist(domain) {
    const clean = normalizeDomain(domain);
    let list = await getWhitelist();
    if (clean) {
        list = list.filter((d) => d !== clean);
    }
    await chrome.storage.local.set({ [KEY_WHITELIST]: list });
    return list;
}

/**
 * Проверяет, находится ли URL в whitelist.
 *
 * Учитывает поддомены: для www.example.com проверяет
 * www.example.com, example.com, com.
 *
 * TLD (com, ru, ...) матчится намеренно — это позволяет отключить
 * блокировку на всех сайтах зоны, если пользователь так решит.
 * Через popup добавить TLD нельзя (он всегда присылает полный hostname),
 * только вручную через storage или импорт.
 *
 * @param {string} url
 * @returns {Promise<boolean>}
 */
export async function isWhitelisted(url) {
    const hostname = extractHostname(url);
    if (!hostname) return false;
    const list = await getWhitelist();
    const parts = hostname.split(".");
    for (let i = 0; i < parts.length; i++) {
        const candidate = parts.slice(i).join(".");
        if (list.includes(candidate)) return true;
    }
    return false;
}

// ------------------------------------------------------------
// DNR: rulesets on/off
// ------------------------------------------------------------
async function setRulesetsEnabled(enabled) {
    const all = await chrome.declarativeNetRequest.getEnabledRulesets();
    const enabledSet = new Set(all);
    const targetSet = new Set(enabled ? ALL_RULESETS : []);

    const toEnable = [...targetSet].filter((id) => !enabledSet.has(id));
    const toDisable = [...enabledSet].filter((id) => !targetSet.has(id));

    if (toEnable.length === 0 && toDisable.length === 0) return;

    await chrome.declarativeNetRequest.updateEnabledRulesets({
        enableRulesetIds: toEnable,
        disableRulesetIds: toDisable
    });

    console.log(`[DNR] rulesets enabled: ${[...targetSet].join(", ") || "none"}`);
}

// ------------------------------------------------------------
// DNR: динамические allowAllRequests для whitelist.
//
// Удаление и добавление — двумя отдельными вызовами
// updateDynamicRules. Chrome не гарантирует порядок операций
// внутри одного вызова, и не принимает добавление правила
// с id, которое уже существует.
//
// Удаляем только правила в диапазоне DYN_RULE_ID_BASE..DYN_RULE_ID_MAX
// (наши whitelist-правила). Правила с другими id не трогаем —
// их может добавить другая часть расширения в будущем.
//
// Race condition между remove и add остаётся: в этот короткий
// промежуток whitelist-правил нет. Убрать его нельзя без
// генерации новых уникальных id при каждом вызове. Принимаем
// как известное ограничение.
// ------------------------------------------------------------
async function syncWhitelistRules(enabled) {
    const existing = await chrome.declarativeNetRequest.getDynamicRules();

    // Удаляем только НАШИ динамические правила — те, что в диапазоне
    // DYN_RULE_ID_BASE..DYN_RULE_ID_MAX. Правила с другими id
    // (если появятся в будущем) не трогаем.
    const existingIds = existing
        .filter((r) => r.id >= DYN_RULE_ID_BASE && r.id <= DYN_RULE_ID_MAX)
        .map((r) => r.id);

    // Диагностика: если в getDynamicRules есть правила вне нашего
    // диапазона — предупреждаем. Это не должно происходить в норме,
    // но если произойдёт, полезно знать.
    const foreignIds = existing
        .filter((r) => r.id < DYN_RULE_ID_BASE || r.id > DYN_RULE_ID_MAX)
        .map((r) => r.id);
    if (foreignIds.length > 0) {
        console.warn(`[DNR] found ${foreignIds.length} dynamic rules outside whitelist range:`, foreignIds);
    }

    if (!enabled) {
        if (existingIds.length > 0) {
            await chrome.declarativeNetRequest.updateDynamicRules({
                removeRuleIds: existingIds
            });
            console.log(`[DNR] removed ${existingIds.length} old whitelist rules`);
        }
        console.log("[DNR] whitelist rules: 0 (disabled)");
        return;
    }

    const whitelist = await getWhitelist();
    const newRules = [];
    let id = DYN_RULE_ID_BASE;
    for (const domain of whitelist) {
        if (id > DYN_RULE_ID_MAX) {
            console.warn(`[DNR] whitelist too large, skipping: ${domain}`);
            continue;
        }
        newRules.push({
            id: id++,
            priority: 100,
            action: { type: "allowAllRequests" },
            condition: {
                urlFilter: `||${domain}^`,
                resourceTypes: ["main_frame", "sub_frame"]
            }
        });
    }

    if (existingIds.length > 0) {
        await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: existingIds
        });
        console.log(`[DNR] removed ${existingIds.length} old whitelist rules`);
    }

    if (newRules.length > 0) {
        await chrome.declarativeNetRequest.updateDynamicRules({
            addRules: newRules
        });
    }

    console.log(`[DNR] whitelist rules: ${newRules.length}`);
}

// ------------------------------------------------------------
// Мьютекс: защита от параллельных вызовов syncDnrState.
// ------------------------------------------------------------
let syncInFlight = null;
let syncQueued = false;

async function applyDnrState() {
    const enabled = await getEnabled();

    if (!enabled) {
        await setRulesetsEnabled(false);
        await syncWhitelistRules(false);
        console.log("[DNR] disabled");
        return;
    }

    await setRulesetsEnabled(true);
    await syncWhitelistRules(true);
    console.log("[DNR] enabled");
}

export async function syncDnrState() {
    if (syncInFlight) {
        // Изменение пришло во время синхронизации: после текущего
        // прогона нужен ещё один, иначе состояние потеряется.
        syncQueued = true;
        return syncInFlight;
    }

    syncInFlight = (async () => {
        try {
            do {
                syncQueued = false;
                await applyDnrState();
            } while (syncQueued);
        } finally {
            syncInFlight = null;
            syncQueued = false;
        }
    })();

    return syncInFlight;
}