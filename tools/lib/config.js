/* ============================================================
   Конфигурация конвертера.

   Здесь — все настройки: какие списки читать, куда писать,
   какие квоты, какие диапазоны id и т.д.

   Меняешь что-то — меняешь здесь. Остальной код — не трогаешь.
   ============================================================ */

// Откуда читаем правила
export const INPUT_FILES = [
    "lists/easylist.txt",
    "lists/adguard-russian.txt"
];

// Куда пишем результат
export const OUT_RULES = "rules/ads.json";
export const OUT_EXCEPTIONS = "rules/exceptions.json";
export const OUT_CSS = "content/cosmetic.css";
export const OUT_COSMETIC_MAP = "rules/cosmetic-map.json";
export const OUT_COSMETIC_EXCLUDE = "rules/cosmetic-exclude.json";

// Лимит Chrome на статические DNR-правила (см. README → «Лимиты Chrome»)
export const MAX_DNR_RULES = 30000;

// Квоты по этапам (сумма должна быть <= MAX_DNR_RULES).
//
// Пересчитаны после снятия дублирования simple↔path:
//   - этап 3 (path) реально генерирует ~600 правил, квота 15000
//     была избыточной и простаивала.
//   - этап 1 (simple) реально генерирует ~50000 правил, квота 8500
//     резала 83% из них.
//
// Новое распределение отдаёт неиспользуемые слоты этапа 3
// в этап 1 (наибольший дефицит) и этап 2 (небольшой запас).
//
// Ожидаемый итог: ~28100 блокирующих + ~1100 allow = ~29200 из 30000.
export const QUOTA_STAGE_2 = 5200;
export const QUOTA_STAGE_3 = 1000;
export const QUOTA_STAGE_1 = 22300;
export const QUOTA_EXCEPTIONS = 1500;

// Диапазоны id.
// ⚠️ Chrome смешивает пространства id статических и динамических правил.
// Статические (ads.json) идут в 10000+, exceptions — в 100000+,
// динамические (whitelist, см. shared/storage.js) — в 1..9999.
export const ID_BASE_ADS = 10000;
export const ID_BASE_EXCEPTIONS = 100000;

// Все типы ресурсов для блокировки.
// main_frame НЕ включён: иначе пользователь не сможет перейти на сайт.
export const ALL_RESOURCE_TYPES = [
    "script", "image", "xmlhttprequest", "sub_frame",
    "media", "font", "ping", "other", "stylesheet", "websocket"
];

// Соответствие EasyList → DNR resourceTypes
export const RESOURCE_TYPE_MAP = {
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

// Модификаторы EasyList, которые DNR НЕ поддерживает.
// Правило с любым из них — пропускаем.
export const UNSUPPORTED_MODIFIERS = new Set([
    "document", "popup", "replace", "csp", "rewrite",
    "redirect", "removeparam", "generichide", "elemhide", "empty"
]);