import { MSG } from "../shared/messages.js";

const $ = (id) => document.getElementById(id);

let currentDomain = null;

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
        $("enabled-toggle").checked = state.enabled;

        renderWhitelist(state.whitelist);
        updateAddButton(state.whitelist);
    } catch (e) {
        console.error("loadState failed:", e);
    }
}

function renderWhitelist(list) {
    const ul = $("whitelist");
    const empty = $("whitelist-empty");
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
    const btn = $("add-current");
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

async function toggleEnabled() {
    const value = $("enabled-toggle").checked;
    await chrome.runtime.sendMessage({
        type: MSG.POPUP_SET_ENABLED,
        value
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

$("enabled-toggle").addEventListener("change", toggleEnabled);
$("add-current").addEventListener("click", addCurrent);

loadState();