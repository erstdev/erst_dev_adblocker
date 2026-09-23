/* ============================================================
   Работа с состоянием расширения + синхронизация DNR.

   Схема storage:
     enabled: boolean
     whitelist: string[]

   Диапазоны id:
     ads.json:         10000..38023
     exceptions.json:  100000..
     динамические:     1..9999  (этот файл)
   ============================================================ */

const KEY_ENABLED = "enabled";
const KEY_WHITELIST = "whitelist";

const RULESET_ADS = "ads_ruleset";
const RULESET_EXCEPTIONS = "exceptions_ruleset";
const RULESET_MANUAL = 'manual_ruleset'
const ALL_RULESETS = [RULESET_ADS, RULESET_EXCEPTIONS, RULESET_MANUAL];

// Диапазон id динамических правил (whitelist)
const DYN_RULE_ID_BASE = 1;
const DYN_RULE_ID_MAX = 9999;

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
    const list = await getWhitelist();
    if (!list.includes(domain)) {
        list.push(domain);
        await chrome.storage.local.set({ [KEY_WHITELIST]: list });
    }
    return list;
}

export async function removeFromWhitelist(domain) {
    let list = await getWhitelist();
    list = list.filter((d) => d !== domain);
    await chrome.storage.local.set({ [KEY_WHITELIST]: list });
    return list;
}

// ------------------------------------------------------------
// Утилиты
// ------------------------------------------------------------
export function extractHostname(url) {
    try {
        return new URL(url).hostname;
    } catch {
        return null;
    }
}

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
// ------------------------------------------------------------
async function syncWhitelistRules(enabled) {
    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    const existingIds = existing.map((r) => r.id);

    if (existingIds.length > 0) {
        await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: existingIds
        });
        console.log(`[DNR] removed ${existingIds.length} old dynamic rules`);
    }

    if (!enabled) {
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

export async function syncDnrState() {
    if (syncInFlight) {
        // Уже идёт — ждём тот же промис, не запускаем второй
        return syncInFlight;
    }

    syncInFlight = (async () => {
        try {
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
        } finally {
            syncInFlight = null;
        }
    })();

    return syncInFlight;
}