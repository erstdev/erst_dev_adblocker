/* ============================================================
   Локализация popup.

   Chrome подставляет строки манифеста (name/description) по языку
   интерфейса браузера и не умеет переключать язык на лету. Поэтому
   для popup — собственные словари: выбранный язык хранится в
   chrome.storage.local (ключ language) и применяется к DOM.

   Что экспортирует:
   - LANGUAGE_META, LANGUAGE_CODES — список языков и их метаданные
   - detectLanguage()          — язык браузера, если поддерживается
   - getLanguage()             — сохранённый язык или язык браузера
   - setLanguage(code)         — сохранить выбор
   - setCurrentLanguage(code)  — применить язык в памяти
   - getCurrentLanguage()
   - t(key, substitutions)     — строка по ключу с {placeholder}
   - applyI18n(root)           — заполнить data-i18n* в DOM

   Разметка:
   - data-i18n="key"                    → textContent
   - data-i18n-title="key"              → title
   - data-i18n-aria-label="key"         → aria-label
   - data-i18n-placeholder="key"        → placeholder
   ============================================================ */

import {
    DICTIONARIES,
    LANGUAGE_CODES,
    LANGUAGE_META
} from "./locales/index.js";

export { LANGUAGE_CODES, LANGUAGE_META };

const STORAGE_KEY = "language";
const DEFAULT_LANGUAGE = "en";

let currentLanguage = DEFAULT_LANGUAGE;

export function isSupportedLanguage(value) {
    return typeof value === "string" && Object.hasOwn(DICTIONARIES, value);
}

/**
 * Язык интерфейса браузера с fallback на английский.
 * chrome.i18n.getUILanguage() возвращает, например, "hy-AM";
 * для словарей нужен базовый код "hy".
 */
export function detectLanguage() {
    try {
        const uiLanguage = chrome.i18n.getUILanguage().toLowerCase();
        const base = uiLanguage.split("-")[0];
        if (isSupportedLanguage(base)) return base;
    } catch (e) {
        // chrome.i18n недоступен — работаем с fallback.
    }
    return DEFAULT_LANGUAGE;
}

/**
 * Сохранённый язык или null, если пользователь ещё не выбирал.
 */
export async function getStoredLanguage() {
    try {
        const data = await chrome.storage.local.get(STORAGE_KEY);
        return isSupportedLanguage(data[STORAGE_KEY]) ? data[STORAGE_KEY] : null;
    } catch (e) {
        return null;
    }
}

export async function getLanguage() {
    return (await getStoredLanguage()) || detectLanguage();
}

export async function setLanguage(language) {
    if (!isSupportedLanguage(language)) return;
    await chrome.storage.local.set({ [STORAGE_KEY]: language });
}

export function setCurrentLanguage(language) {
    currentLanguage = isSupportedLanguage(language) ? language : DEFAULT_LANGUAGE;
    return currentLanguage;
}

export function getCurrentLanguage() {
    return currentLanguage;
}

/**
 * Строка по ключу. Если ключа нет в текущем словаре — берём
 * английский, затем возвращаем сам ключ (видно в тестах).
 * Подстановки: t("addDomain", { domain: "example.com" }).
 */
export function t(key, substitutions) {
    const dictionary = DICTIONARIES[currentLanguage] || DICTIONARIES[DEFAULT_LANGUAGE];
    let message = dictionary[key];
    if (message === undefined) message = DICTIONARIES[DEFAULT_LANGUAGE][key];
    if (message === undefined) return key;

    if (substitutions) {
        for (const [name, value] of Object.entries(substitutions)) {
            message = message.split(`{${name}}`).join(String(value));
        }
    }
    return message;
}

/**
 * Заполняет статические тексты popup и выставляет lang у <html>.
 * Динамические строки (лейбл тога, кнопка добавления) обновляет
 * popup.js через t() и повторный рендер.
 */
export function applyI18n(root = document) {
    if (!root || !root.querySelectorAll) return;

    for (const el of root.querySelectorAll("[data-i18n]")) {
        el.textContent = t(el.dataset.i18n);
    }

    for (const el of root.querySelectorAll("[data-i18n-title]")) {
        el.title = t(el.dataset.i18nTitle);
    }

    for (const el of root.querySelectorAll("[data-i18n-aria-label]")) {
        el.setAttribute("aria-label", t(el.dataset.i18nAriaLabel));
    }

    for (const el of root.querySelectorAll("[data-i18n-placeholder]")) {
        el.placeholder = t(el.dataset.i18nPlaceholder);
    }

    document.documentElement.lang = currentLanguage;
}
