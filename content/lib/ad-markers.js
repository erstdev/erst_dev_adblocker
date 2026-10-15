/* ============================================================

ЗАЩИТА ОТ ЛОЖНЫХ СРАБАТЫВАНИЙ:

Не скрываем структурные элементы: html, body, main,
header, footer, nav, #root, #app.

Не скрываем элементы внутри плееров (video,
class*=player, #movie_player и т.п.).

findRotatedContainer не поднимается к контейнерам
с более чем MAX_CONTAINER_CHILDREN детьми.

findRotatedContainer и findAdContainer возвращают null,
если не нашли подходящий контейнер.
============================================================ */

const AD_TEXT_MARKERS = [
    "реклама",
    "реклам",
    "промо",
    "спонсор",
    "рекламный",
    "партнёрскийматериал",
    "advertisement",
    "sponsored",
    "объявлениескрыто",
    "рекламноеобъявление",
];

// Максимальная длина textContent кандидата (для обычного матчера).
const MAX_CANDIDATE_TEXT_LENGTH = 200;

// Минимальная длина textContent кандидата.
const MIN_CANDIDATE_TEXT_LENGTH = 4;

// Границы длины текста разбитого лейбла.
const ROTATED_LABEL_MIN_LENGTH = 5;
const ROTATED_LABEL_MAX_LENGTH = 20;
const MAX_CONTAINER_CHILDREN = 20;

// Признаки контейнера рекламы.
const AD_CONTAINER_SELECTORS = [
    '[id^="trg-b-"]',
    '[id^="b"][data-rendertype="native"]',
    '[id^="yandex_ad_R-"]',
    '[data-testid$="-ad"]',
    '[data-testid*="-ad-"]',
    '[data-new-adtune="true"]',
    '[data-cv3dnq1w-click="imageGallery"]',
    '[data-cv3dnq1w-click="title"]',
    '.sc-1v5ykgi',
    '.sc-1ymix5g',
];
const STRUCTURAL_SELECTORS = [
    "html",
    "body",
    "main",
    "header",
    "footer",
    "nav",
    "#root",
    "#app",
];

const PLAYER_SELECTORS = [
    "video",
    "[class='video-player']",
    "[class='player-wrapper']",
    "[class*='player-container']",
    "#movie_player",
    ".html5-video-player",
    "[data-testid='video-player']",
];

function collapseText(str) {
    return (str || "").toLowerCase().replace(/\s+/g, "");
}

function matchMarker(collapsed) {
    for (const marker of AD_TEXT_MARKERS) {
        if (collapsed.includes(marker)) return marker;
    }
    return null;
}

function isRotatedAdLabel(el) {
    const collapsed = collapseText(el.textContent);
    if (collapsed.length < ROTATED_LABEL_MIN_LENGTH) return false;
    if (collapsed.length > ROTATED_LABEL_MAX_LENGTH) return false;
    if (!/р.к.м.*а/.test(collapsed)) return false;
    const childElements = el.children;
    if (childElements.length < 3) return false;
    let shortKids = 0;
    for (const child of childElements) {
        const ct = collapseText(child.textContent);
        if (ct.length >= 1 && ct.length <= 5) shortKids++;
    }
    return shortKids >= 3;
}

function isStructuralElement(el) {
    if (!el) return true;
    for (const sel of STRUCTURAL_SELECTORS) {
        try {
            if (el.matches(sel)) return true;
        } catch (e) {}
    }
    return false;
}

function isInsidePlayer(el) {
    if (!el) return false;
    for (const sel of PLAYER_SELECTORS) {
        try {
            if (el.closest(sel)) return true;
        } catch (e) {}
    }
    return false;
}

function findAdContainer(el) {
    for (const sel of AD_CONTAINER_SELECTORS) {
        const container = el.closest(sel);
        if (container) {
            if (isStructuralElement(container)) return null;
            if (isInsidePlayer(container)) return null;
            return container;
        }
    }
    let cur = el;
    for (let i = 0; i < 8 && cur; i++) {
        if (cur.style && cur.style.width === "160px") {
            if (isStructuralElement(cur)) return null;
            if (isInsidePlayer(cur)) return null;
            return cur;
        }
        cur = cur.parentElement;
    }
    if (isStructuralElement(el)) return null;
    if (isInsidePlayer(el)) return null;
    return el;
}

function findRotatedContainer(el) {
    let cur = el;
    for (let i = 0; i < 6 && cur; i++) {
        const parent = cur.parentElement;
        if (!parent) return null;
        if (parent.children.length > MAX_CONTAINER_CHILDREN) return null;
        if (isStructuralElement(parent)) return null;
        if (isInsidePlayer(parent)) return null;
        let meaningfulChildren = 0;
        for (const child of parent.children) {
            const t = collapseText(child.textContent);
            if (t.length > 20) meaningfulChildren++;
        }
        if (meaningfulChildren >= 2) return parent;
        cur = parent;
    }
    return null;
}

function hideAdInElement(el, logPrefix) {
    if (!el || !el.style) return null;
    if (isInsidePlayer(el)) return null;
    const collapsed = collapseText(el.textContent);
    if (collapsed.length < MIN_CANDIDATE_TEXT_LENGTH) return null;
    if (collapsed.length > MAX_CANDIDATE_TEXT_LENGTH) return null;
    let marker = matchMarker(collapsed);
    let target;
    if (marker) {
        if (collapsed.length <= ROTATED_LABEL_MAX_LENGTH) {
            const structural = findRotatedContainer(el);
            target = structural !== null ? structural : findAdContainer(el);
        } else {
            target = findAdContainer(el);
        }
    } else {
        if (!isRotatedAdLabel(el)) return null;

        target = findRotatedContainer(el);
    }
    if (!target) return null;
    if (isStructuralElement(target)) return null;
    if (isInsidePlayer(target)) return null;

    // setProperty идемпотентна: повторная установка того же значения
    // не меняет inline-стиль. Отдельная проверка display === "none"
    // не нужна — она читает только inline, не computed, и не даёт выигрыша
    target.style.setProperty("display", "none", "important");

    console.log(logPrefix + ' "' + marker + '"');
    return marker;
}

function hideAdMarkers() {
    if (!document.body) return;
    const candidates = document.querySelectorAll("span, div, a");
    for (const el of candidates) {
        hideAdInElement(el, "[erst_dev_adblocker] hid ad marker block:");
    }
}

function startAdMarkerHiding() {
    const run = () => {
        try {
            hideAdMarkers();
        } catch (e) {
            console.error("[erst_dev_adblocker] hideAdMarkers failed:", e);
        }
    };
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", run, { once: true });
    } else {
        run();
    }
}

