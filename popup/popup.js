import { MSG } from "../shared/messages.js";
import {
    LANGUAGES,
    LANGUAGE_LABELS,
    applyI18n,
    getCurrentLanguage,
    getLanguage,
    setCurrentLanguage,
    setLanguage,
    t
} from "../shared/i18n.js";

// Адрес для обратной связи
const FEEDBACK_EMAIL = "erst_dev@mail.ru";

// Хэш-роуты popup: главный экран и настройки.
const ROUTE_MAIN = "#/";
const ROUTE_SETTINGS = "#/settings";

// Алиас для getElementById
const getElementById = (id) => document.getElementById(id);

let currentDomain = null;
let currentUrl = null;
let currentVersion = null;
let currentWhitelist = [];

// ------------------------------------------------------------
// Загрузка состояния
// ------------------------------------------------------------

async function loadState() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const url = tab?.url || null;

        const state = await chrome.runtime.sendMessage({
            type: MSG.POPUP_GET_STATE,
            url
        });

        if (!state) return;

        currentDomain = state.currentDomain;
        currentUrl = url;
        currentWhitelist = Array.isArray(state.whitelist) ? state.whitelist : [];

        getElementById("enabled-toggle").checked = state.enabled;
        updateToggleLabel(state.enabled);

        renderWhitelist(currentWhitelist);
        updateAddButton(currentWhitelist);
    } catch (e) {
        console.error("loadState failed:", e);
    }
}

function loadVersion() {
    const manifest = chrome.runtime.getManifest();
    currentVersion = manifest.version;
    getElementById("version-label").textContent = `v${currentVersion}`;
}

// ------------------------------------------------------------
// Белый список
// ------------------------------------------------------------

function updateToggleLabel(enabled) {
    getElementById("toggle-label").textContent = t(enabled ? "toggleOn" : "toggleOff");
}

function renderWhitelist(list) {
    const ul = getElementById("whitelist");
    const empty = getElementById("whitelist-empty");
    ul.innerHTML = "";

    if (!list || list.length === 0) {
        empty.style.display = "block";
        return;
    }
    empty.style.display = "none";

    for (const domain of list) {
        const li = document.createElement("li");

        const span = document.createElement("span");
        span.textContent = domain;

        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = "×";
        btn.title = t("remove");
        btn.setAttribute("aria-label", t("remove"));
        btn.addEventListener("click", () => removeDomain(domain));

        li.appendChild(span);
        li.appendChild(btn);
        ul.appendChild(li);
    }
}

function updateAddButton(whitelist) {
    const btn = getElementById("add-current");

    if (!currentDomain) {
        btn.disabled = true;
        btn.textContent = t("noActiveTab");
        return;
    }

    if (whitelist.includes(currentDomain)) {
        btn.disabled = true;
        btn.textContent = t("alreadyInList", { domain: currentDomain });
    } else {
        btn.disabled = false;
        btn.textContent = t("addDomain", { domain: currentDomain });
    }
}

// ------------------------------------------------------------
// Кнопка перезагрузки страницы
// ------------------------------------------------------------

function showReloadButton() {
    getElementById("reload-page").style.display = "block";
}

async function reloadActiveTab() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.id) {
            await chrome.tabs.reload(tab.id);
            window.close();
        }
    } catch (e) {
        console.error("reloadActiveTab failed:", e);
    }
}

// ------------------------------------------------------------
// Действия пользователя
// ------------------------------------------------------------

async function toggleEnabled() {
    const toggle = getElementById("enabled-toggle");
    const checked = toggle.checked;

    try {
        const res = await chrome.runtime.sendMessage({
            type: MSG.POPUP_SET_ENABLED,
            value: checked
        });

        if (!res || !res.ok) {
            throw new Error("setEnabled returned not ok");
        }

        updateToggleLabel(checked);
        showReloadButton();
    } catch (e) {
        console.error("toggleEnabled failed:", e);
        // Откатываем UI в исходное состояние
        toggle.checked = !checked;
    }
}

async function addCurrent() {
    if (!currentDomain) return;

    try {
        const res = await chrome.runtime.sendMessage({
            type: MSG.POPUP_WHITELIST_ADD,
            domain: currentDomain
        });

        if (res?.ok) {
            currentWhitelist = Array.isArray(res.whitelist) ? res.whitelist : currentWhitelist;
            renderWhitelist(currentWhitelist);
            updateAddButton(currentWhitelist);
            showReloadButton();
        }
    } catch (e) {
        console.error("addCurrent failed:", e);
    }
}

async function removeDomain(domain) {
    try {
        const res = await chrome.runtime.sendMessage({
            type: MSG.POPUP_WHITELIST_REMOVE,
            domain
        });

        if (res?.ok) {
            currentWhitelist = Array.isArray(res.whitelist) ? res.whitelist : currentWhitelist;
            renderWhitelist(currentWhitelist);
            updateAddButton(currentWhitelist);
            showReloadButton();
        }
    } catch (e) {
        console.error("removeDomain failed:", e);
    }
}

// ------------------------------------------------------------
// Язык интерфейса
// ------------------------------------------------------------

/**
 * Создаёт список языков в настройках. Названия нативные и не
 * зависят от текущего языка: «Русский», «English», «Հայերեն».
 */
function renderLanguageOptions(selected) {
    const container = getElementById("language-list");
    container.innerHTML = "";

    for (const language of LANGUAGES) {
        const label = document.createElement("label");
        label.className = "language-option";

        const input = document.createElement("input");
        input.type = "radio";
        input.name = "language";
        input.value = language;
        input.checked = language === selected;
        input.addEventListener("change", onLanguageChange);

        const text = document.createElement("span");
        text.textContent = LANGUAGE_LABELS[language];

        label.appendChild(input);
        label.appendChild(text);
        container.appendChild(label);
    }
}

/**
 * Обновляет только checked у радио, не пересоздавая DOM:
 * иначе теряется фокус после клика.
 */
function syncLanguageOptions(language) {
    const inputs = document.querySelectorAll('input[name="language"]');
    for (const input of inputs) {
        input.checked = input.value === language;
    }
}

async function onLanguageChange(event) {
    const language = event.target.value;
    if (!LANGUAGES.includes(language)) return;

    try {
        await setLanguage(language);
        applyLanguage(language);
    } catch (e) {
        console.error("changeLanguage failed:", e);
        syncLanguageOptions(getCurrentLanguage());
    }
}

/**
 * Применяет язык ко всем статическим и динамическим текстам.
 * Повторный рендер белого списка нужен из-за title/aria-label
 * у кнопок удаления.
 */
function applyLanguage(language) {
    setCurrentLanguage(language);
    applyI18n();
    updateToggleLabel(getElementById("enabled-toggle").checked);
    renderWhitelist(currentWhitelist);
    updateAddButton(currentWhitelist);
    syncLanguageOptions(language);
}

// ------------------------------------------------------------
// Роутинг popup (#/ и #/settings)
// ------------------------------------------------------------

function getRoute() {
    return window.location.hash === ROUTE_SETTINGS ? ROUTE_SETTINGS : ROUTE_MAIN;
}

function showRoute(route) {
    const isSettings = route === ROUTE_SETTINGS;
    getElementById("view-main").hidden = isSettings;
    getElementById("view-settings").hidden = !isSettings;
}

function setupRouter() {
    getElementById("open-settings").addEventListener("click", () => {
        window.location.hash = ROUTE_SETTINGS;
    });
    getElementById("close-settings").addEventListener("click", () => {
        window.location.hash = ROUTE_MAIN;
    });
    window.addEventListener("hashchange", () => showRoute(getRoute()));
    showRoute(getRoute());
}

// ------------------------------------------------------------
// Обратная связь
// ------------------------------------------------------------

function buildMailtoLink(subject, body) {
    const encodedSubject = encodeURIComponent(subject);
    const encodedBody = encodeURIComponent(body);
    return `mailto:${FEEDBACK_EMAIL}?subject=${encodedSubject}&body=${encodedBody}`;
}

function openBugReport() {
    const body = [
        t("mailGreeting"),
        ``,
        t("mailExtension", { version: currentVersion || "?" }),
        t("mailPage", { url: currentUrl || t("mailNoPage") }),
        ``,
        t("mailWhat"),
        t("mailDescribe"),
        ``,
        t("mailHow"),
        `1. `,
        `2. `,
        `3. `,
        ``,
        t("mailExpected"),
        t("mailExpectedValue")
    ].join("\n");

    const link = buildMailtoLink(t("mailSubject"), body);
    window.location.href = link;
}

async function copyEmail(e) {
    e.preventDefault();

    const link = e.currentTarget;

    try {
        await navigator.clipboard.writeText(FEEDBACK_EMAIL);

        link.textContent = t("copied");
        link.classList.add("copied");

        setTimeout(() => {
            link.textContent = t("copyEmail");
            link.classList.remove("copied");
        }, 1500);
    } catch (err) {
        console.error("copyEmail failed:", err);
    }
}

// ------------------------------------------------------------
// Инициализация
// ------------------------------------------------------------

setupRouter();

getElementById("enabled-toggle").addEventListener("change", toggleEnabled);
getElementById("add-current").addEventListener("click", addCurrent);
getElementById("reload-page").addEventListener("click", reloadActiveTab);
getElementById("feedback-bug").addEventListener("click", (e) => {
    e.preventDefault();
    openBugReport();
});
getElementById("feedback-copy").addEventListener("click", copyEmail);

async function init() {
    const language = await getLanguage();
    setCurrentLanguage(language);
    applyI18n();
    renderLanguageOptions(language);
    loadVersion();
    await loadState();
}

void init();
