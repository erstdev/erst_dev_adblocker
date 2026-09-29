import { MSG } from "../shared/messages.js";

// Адрес для обратной связи
const FEEDBACK_EMAIL = "erst_dev@mail.ru";

// Алиас для getElementById. Назван byId, а не $, потому что
// WebStorm считает $ символом jQuery и ругается на дубликаты.
const byId = (id) => document.getElementById(id);

let currentDomain = null;
let currentUrl = null;
let currentVersion = null;

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

        byId("enabled-toggle").checked = state.enabled;
        byId("toggle-label").textContent = state.enabled ? "Включено" : "Выключено";

        renderWhitelist(state.whitelist);
        updateAddButton(state.whitelist);
    } catch (e) {
        console.error("loadState failed:", e);
    }
}

function loadVersion() {
    const manifest = chrome.runtime.getManifest();
    currentVersion = manifest.version;
    byId("version-label").textContent = `v${currentVersion}`;
}

// ------------------------------------------------------------
// Белый список
// ------------------------------------------------------------

function renderWhitelist(list) {
    const ul = byId("whitelist");
    const empty = byId("whitelist-empty");
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
        btn.textContent = "×";
        btn.title = "Удалить";
        btn.addEventListener("click", () => removeDomain(domain));

        li.appendChild(span);
        li.appendChild(btn);
        ul.appendChild(li);
    }
}

function updateAddButton(whitelist) {
    const btn = byId("add-current");

    if (!currentDomain) {
        btn.disabled = true;
        btn.textContent = "Нет активной вкладки";
        return;
    }

    if (whitelist.includes(currentDomain)) {
        btn.disabled = true;
        btn.textContent = `${currentDomain} уже в списке`;
    } else {
        btn.disabled = false;
        btn.textContent = `+ Добавить ${currentDomain}`;
    }
}

// ------------------------------------------------------------
// Действия пользователя
// ------------------------------------------------------------

async function toggleEnabled() {
    const checked = byId("enabled-toggle").checked;
    byId("toggle-label").textContent = checked ? "Включено" : "Выключено";

    await chrome.runtime.sendMessage({
        type: MSG.POPUP_SET_ENABLED,
        value: checked
    });
}

async function addCurrent() {
    if (!currentDomain) return;

    const res = await chrome.runtime.sendMessage({
        type: MSG.POPUP_WHITELIST_ADD,
        domain: currentDomain
    });

    if (res?.ok) {
        renderWhitelist(res.whitelist);
        updateAddButton(res.whitelist);
    }
}

async function removeDomain(domain) {
    const res = await chrome.runtime.sendMessage({
        type: MSG.POPUP_WHITELIST_REMOVE,
        domain
    });

    if (res?.ok) {
        renderWhitelist(res.whitelist);
        updateAddButton(res.whitelist);
    }
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
        `Привет!`,
        ``,
        `Расширение: erst_dev_adblocker v${currentVersion || "?"}`,
        `Страница: ${currentUrl || "(нет)"}`,
        ``,
        `Что происходит:`,
        `(опиши проблему)`,
        ``,
        `Как воспроизвести:`,
        `1. `,
        `2. `,
        `3. `,
        ``,
        `Ожидал:`,
        `(что должно было быть)`
    ].join("\n");

    const link = buildMailtoLink("erst_dev_adblocker — проблема", body);
    window.location.href = link;
}

async function copyEmail(e) {
    e.preventDefault();

    const link = e.currentTarget;
    const originalText = link.textContent;

    try {
        await navigator.clipboard.writeText(FEEDBACK_EMAIL);

        link.textContent = "Скопировано";
        link.classList.add("copied");

        setTimeout(() => {
            link.textContent = originalText;
            link.classList.remove("copied");
        }, 1500);
    } catch (err) {
        console.error("copyEmail failed:", err);
    }
}

// ------------------------------------------------------------
// Инициализация
// ------------------------------------------------------------

byId("enabled-toggle").addEventListener("change", toggleEnabled);
byId("add-current").addEventListener("click", addCurrent);
byId("feedback-bug").addEventListener("click", (e) => {
    e.preventDefault();
    openBugReport();
});
byId("feedback-copy").addEventListener("click", copyEmail);

loadVersion();
void loadState();