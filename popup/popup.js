import { MSG } from "../shared/messages.js";
import {
    LANGUAGE_CODES,
    LANGUAGE_META,
    applyI18n,
    getCurrentLanguage,
    getLanguage,
    setCurrentLanguage,
    setLanguage,
    t
} from "../shared/i18n.js";

// Адрес для обратной связи
const FEEDBACK_EMAIL = "erst_dev@mail.ru";

// Публичный репозиторий проекта: открывается из попапа.
const GITHUB_URL = "https://github.com/erstdev/erst_dev_adblocker";

// Новое issue в публичном репозитории.
const ISSUES_URL = "https://github.com/erstdev/erst_dev_adblocker/issues/new";

// Хэш-роуты popup: главный экран и настройки.
const ROUTE_MAIN = "#/";
const ROUTE_SETTINGS = "#/settings";

// Алиас для getElementById
const getElementById = (id) => document.getElementById(id);

let currentDomain = null;
let currentUrl = null;
let currentVersion = null;
let currentWhitelist = [];

// Состояние searchable-select.
let languageQuery = "";
let activeLanguageIndex = -1;
let filteredLanguages = LANGUAGE_META;

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
// Язык интерфейса: searchable select с флагами
// ------------------------------------------------------------

function normalizeForSearch(value) {
    return value
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

function matchesLanguage(meta, query) {
    if (!query) return true;
    const haystack = normalizeForSearch(
        `${meta.label} ${meta.english} ${meta.code}`
    );
    return haystack.includes(query);
}

function languageMeta(code) {
    return LANGUAGE_META.find((meta) => meta.code === code) || LANGUAGE_META[0];
}

function renderLanguageTrigger(language) {
    const meta = languageMeta(language);
    const flag = getElementById("language-trigger-flag");
    flag.src = `flags/${meta.flag}.svg`;
    flag.alt = "";
    getElementById("language-trigger-label").textContent = meta.label;
}

function renderLanguageOptions() {
    const list = getElementById("language-options");
    list.innerHTML = "";

    filteredLanguages = languageQuery
        ? LANGUAGE_META.filter((meta) => matchesLanguage(meta, languageQuery))
        : LANGUAGE_META;

    if (filteredLanguages.length === 0) {
        activeLanguageIndex = -1;

        const empty = document.createElement("li");
        empty.className = "lang-empty";
        empty.textContent = t("languageEmpty");
        list.appendChild(empty);

        updateActiveOption();
        return;
    }

    if (activeLanguageIndex < 0 || activeLanguageIndex >= filteredLanguages.length) {
        activeLanguageIndex = 0;
    }

    const selected = getCurrentLanguage();

    filteredLanguages.forEach((meta, index) => {
        const item = document.createElement("li");
        item.className = "lang-option";
        item.id = `lang-option-${meta.code}`;
        item.dataset.code = meta.code;
        item.setAttribute("role", "option");
        item.setAttribute("aria-selected", String(meta.code === selected));
        if (index === activeLanguageIndex) item.classList.add("active");

        const flag = document.createElement("img");
        flag.className = "lang-flag";
        flag.src = `flags/${meta.flag}.svg`;
        flag.alt = "";
        flag.width = 20;
        flag.height = 15;

        const label = document.createElement("span");
        label.className = "lang-option-label";
        label.textContent = meta.label;

        const code = document.createElement("span");
        code.className = "lang-option-code";
        code.textContent = meta.code;

        item.appendChild(flag);
        item.appendChild(label);
        item.appendChild(code);
        item.addEventListener("click", () => {
            void selectLanguage(meta.code);
        });

        list.appendChild(item);
    });

    updateActiveOption();
}

function updateActiveOption() {
    const list = getElementById("language-options");
    const items = list.querySelectorAll(".lang-option");
    for (let index = 0; index < items.length; index++) {
        items[index].classList.toggle("active", index === activeLanguageIndex);
    }

    const search = getElementById("language-search");
    const active = items[activeLanguageIndex];

    if (active) {
        search.setAttribute("aria-activedescendant", active.id);
        active.scrollIntoView({ block: "nearest" });
    } else {
        search.removeAttribute("aria-activedescendant");
    }
}

function openLanguagePanel() {
    const panel = getElementById("language-panel");
    if (!panel.hidden) return;

    languageQuery = "";
    getElementById("language-search").value = "";
    activeLanguageIndex = Math.max(
        0,
        LANGUAGE_META.findIndex((meta) => meta.code === getCurrentLanguage())
    );

    panel.hidden = false;
    getElementById("language-trigger").setAttribute("aria-expanded", "true");

    renderLanguageOptions();
    getElementById("language-search").focus();
}

function closeLanguagePanel() {
    const panel = getElementById("language-panel");
    if (panel.hidden) return;

    panel.hidden = true;
    getElementById("language-trigger").setAttribute("aria-expanded", "false");
    languageQuery = "";
    activeLanguageIndex = -1;
}

function moveActiveOption(delta) {
    if (filteredLanguages.length === 0) return;
    activeLanguageIndex += delta;
    if (activeLanguageIndex < 0) activeLanguageIndex = filteredLanguages.length - 1;
    if (activeLanguageIndex >= filteredLanguages.length) activeLanguageIndex = 0;
    updateActiveOption();
}

function onLanguageSearchInput(event) {
    languageQuery = normalizeForSearch(event.target.value.trim());
    activeLanguageIndex = 0;
    renderLanguageOptions();
}

function onLanguageSearchKeyDown(event) {
    if (event.key === "ArrowDown") {
        event.preventDefault();
        moveActiveOption(1);
    } else if (event.key === "ArrowUp") {
        event.preventDefault();
        moveActiveOption(-1);
    } else if (event.key === "Enter") {
        event.preventDefault();
        const meta = filteredLanguages[activeLanguageIndex];
        if (meta) void selectLanguage(meta.code);
    } else if (event.key === "Escape") {
        event.preventDefault();
        closeLanguagePanel();
        getElementById("language-trigger").focus();
    }
}

async function selectLanguage(language) {
    if (!LANGUAGE_CODES.includes(language)) return;

    try {
        await setLanguage(language);
        closeLanguagePanel();
        applyLanguage(language);
        getElementById("language-trigger").focus();
    } catch (e) {
        console.error("changeLanguage failed:", e);
        renderLanguageTrigger(getCurrentLanguage());
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
    renderLanguageTrigger(language);

    if (!getElementById("language-panel").hidden) {
        renderLanguageOptions();
    }
}

function setupLanguageSelect() {
    const trigger = getElementById("language-trigger");

    trigger.addEventListener("click", () => {
        if (getElementById("language-panel").hidden) openLanguagePanel();
        else closeLanguagePanel();
    });

    trigger.addEventListener("keydown", (event) => {
        if (event.key === "ArrowDown") {
            event.preventDefault();
            openLanguagePanel();
        }
    });

    getElementById("language-search").addEventListener("input", onLanguageSearchInput);
    getElementById("language-search").addEventListener("keydown", onLanguageSearchKeyDown);

    document.addEventListener("click", (event) => {
        if (getElementById("language-panel").hidden) return;
        if (!getElementById("language-select").contains(event.target)) {
            closeLanguagePanel();
        }
    });
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

// Внешние ссылки открываем в новой вкладке: в попапе target="_blank" закрывает
// попап, а href="#" ещё и прыгает в hash-роут.
function openExternal(e, url) {
    e.preventDefault();
    chrome.tabs.create({ url });
}

function openBugReport() {
    const body = t("mailBody", {
        version: currentVersion || "?",
        url: currentUrl || t("mailNoPage")
    });

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
getElementById("feedback-github").addEventListener("click", (e) => openExternal(e, GITHUB_URL));
getElementById("feedback-issues").addEventListener("click", (e) => openExternal(e, ISSUES_URL));

async function init() {
    const language = await getLanguage();
    setCurrentLanguage(language);
    applyI18n();
    renderLanguageTrigger(language);
    setupLanguageSelect();
    loadVersion();
    await loadState();
}

void init();
