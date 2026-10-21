/* ============================================================

ЗАЩИТА ОТ ЛОЖНЫХ СРАБАТЫВАНИЙ:

Не скрываем структурные элементы: html, body, main,
header, footer, nav, #root, #app, #react-root, #__next,
а также shadow-хосты (внутри может быть плеер).

Не скрываем элементы внутри плееров (video,
class*=player, #movie_player и т.п.) и элементы,
которые содержат плеер — в том числе внутри shadow DOM.

findRotatedContainer не поднимается к контейнерам
с более чем MAX_CONTAINER_CHILDREN детьми.

findRotatedContainer и findAdContainer возвращают null,
если не нашли подходящий контейнер.

ВАЖНО про shadow DOM:
querySelector("video") и CSS :has(video) не видят содержимое
shadow root. VK Video держит плеер в shadow DOM, поэтому
проверки containsPlayerDeep/isInsidePlayer обходят открытые
shadow-корни через composedParent и кэш playerShadowHosts.
Если в shadow-хосте появился <video>, все предки, скрытые
нами ранее, разскрываются (unhideAncestorsOfPlayer).
=========================================================== */

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

// Хосты, где text-based hiding отключён.
// market.yandex.*: лейбл «Реклама» стоит почти в каждой карточке
// товара, findRotatedContainer поднимается до обёртки изображения
// и скрывает его. Реклама Маркета режется DNR и domain-селекторами
// по data-apiary-widget-name.
const TEXT_HIDING_DISABLED_HOSTS = /^market\.yandex\./;

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
    "#react-root",
    "#__next",
];

// Плееры, которые нельзя скрывать ни при каких условиях.
// Проверяются в обе стороны:
//   - isInsidePlayer(el)  — элемент внутри плеера;
//   - containsPlayerDeep(el) — элемент (контейнер) содержит плеер.
//
// Вторая проверка критична: лейбл «Реклама» может стоять внутри
// плеера, а findRotatedContainer поднимается по родителям и может
// выйти ЗА пределы плеера. Тогда isInsidePlayer(parent) уже false,
// и скрывается внешний layout вместе с <video>. Именно так на
// RuTube скрывалась вся страница, а на VK Video пропадает плеер
// (звук при этом продолжает играть).
const PLAYER_SELECTORS = [
    "video",
    "[class='video-player']",
    "[class='player-wrapper']",
    "[class*='player-container']",
    "[class*='PlayerContainer']",
    "[class*='video-player']",
    "[class*='VideoPlayer']",
    "[class*='videoplayer']",
    "#movie_player",
    ".html5-video-player",
    "[data-testid='video-player']",
    "[data-testid*='video-player']",
];

// Shadow-хосты, внутри которых найден плеер.
// Кэш нужен, чтобы не сканировать все shadow root на каждый узел.
const playerShadowHosts = new Set();

// Элементы, которые скрыли именно мы. Нужны, чтобы вернуть
// display обратно, если внутрь позже смонтируется плеер.
const hiddenByUs = new Set();

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

function matchesAny(el, selectors) {
    if (!el || !el.matches) return false;
    for (const sel of selectors) {
        try {
            if (el.matches(sel)) return true;
        } catch (e) {}
    }
    return false;
}

const MAX_SHADOW_DEPTH = 6;

/**
 * Собирает все shadow-хосты в поддереве, включая вложенные
 * shadow root. VKUI строит вложенные компоненты: video лежит
 * не в первом shadow root, а на 2-3 уровня глубже.
 */
function collectShadowHosts(root, depth, out) {
    if (!root || depth > MAX_SHADOW_DEPTH || !root.querySelectorAll) return out;

    for (const el of root.querySelectorAll("*")) {
        if (!el.shadowRoot) continue;
        if (!out.includes(el)) out.push(el);
        collectShadowHosts(el.shadowRoot, depth + 1, out);
    }
    return out;
}

/**
 * Есть ли <video> в root или в любом вложенном открытом shadow root.
 */
function shadowHasPlayer(root, depth = 0) {
    if (!root || depth > MAX_SHADOW_DEPTH) return false;

    const roots = [root, ...collectShadowHosts(root, depth, []).map((h) => h.shadowRoot)];

    for (const r of roots) {
        try {
            if (r.querySelector && r.querySelector("video")) return true;
        } catch (e) {
            continue;
        }
        for (const sel of PLAYER_SELECTORS) {
            if (sel === "video") continue;
            try {
                if (r.querySelector(sel)) return true;
            } catch (e) {}
        }
    }
    return false;
}

/**
 * В поддереве есть shadow host. Такие узлы — компоненты и layout
 * (VKUI), а не рекламные карточки. Скрывать их нельзя: внутри
 * может быть плеер, которого не видно из светлого DOM.
 */
function containsShadowHost(el) {
    if (!el || !el.querySelectorAll) return false;
    for (const node of el.querySelectorAll("*")) {
        if (node.shadowRoot) return true;
    }
    return false;
}

/**
 * Родитель в composed-дереве: обычный parentElement, а на границе
 * shadow root — его host. Без этого подъём от узла внутри плеера
 * упирается в ShadowRoot и не доходит до обёртки страницы.
 */
function composedParent(el) {
    if (el.parentElement) return el.parentElement;
    const root = el.getRootNode ? el.getRootNode() : null;
    return root && root.host ? root.host : null;
}

/**
 * Сканирует поддерево и запоминает shadow-хосты, внутри которых
 * есть плеер. Вызывается при старте и на каждый добавленный узел.
 */
function scanForPlayerShadowHosts(root) {
    if (!root || root.nodeType !== 1) return;

    const hosts = root.shadowRoot
        ? [root, ...collectShadowHosts(root, 0, [])]
        : collectShadowHosts(root, 0, []);

    for (const host of hosts) {
        if (playerShadowHosts.has(host)) continue;
        if (!shadowHasPlayer(host.shadowRoot)) continue;

        playerShadowHosts.add(host);
        unhideAncestorsOfPlayer(host);
    }
}

/**
 * Разскрывает предков shadow-хоста с плеером, если мы скрыли их
 * раньше, чем плеер успел смонтироваться.
 */
function unhideAncestorsOfPlayer(host) {
    let node = host;
    while (node) {
        if (hiddenByUs.has(node)) {
            node.style.removeProperty("display");
            hiddenByUs.delete(node);
            console.log("[erst_dev_adblocker] unhid player ancestor");
        }
        node = composedParent(node);
    }
}

function isStructuralElement(el) {
    if (!el) return true;

    // Shadow-хост может быть плеером (VK Video). Скрывать его нельзя.
    if (el.shadowRoot) return true;

    for (const sel of STRUCTURAL_SELECTORS) {
        try {
            if (el.matches(sel)) return true;
        } catch (e) {}
    }
    return false;
}

/**
 * Элемент находится внутри плеера. Сначала обычный closest,
 * затем подъём по границам shadow root — для узлов, которые
 * лежат внутри shadow-хоста с плеером.
 */
function isInsidePlayer(el) {
    for (const sel of PLAYER_SELECTORS) {
        try {
            if (el.closest(sel)) return true;
        } catch (e) {}
    }

    let root = el.getRootNode ? el.getRootNode() : null;
    while (root && root.host) {
        const host = root.host;
        if (matchesAny(host, PLAYER_SELECTORS)) return true;
        if (playerShadowHosts.has(host)) return true;
        for (const sel of PLAYER_SELECTORS) {
            try {
                if (host.closest(sel)) return true;
            } catch (e) {}
        }
        root = host.getRootNode ? host.getRootNode() : null;
    }
    return false;
}

/**
 * Содержит ли элемент плеер внутри себя — в светлом DOM или
 * в открытом shadow root.
 *
 * Нужна потому, что isInsidePlayer проверяет только предков.
 * Если скрыть контейнер-обёртку плеера, isInsidePlayer(target)
 * вернёт false, а видео исчезнет: display:none не останавливает
 * воспроизведение, поэтому звук остаётся.
 */
function containsPlayerDeep(el) {
    if (!el) return false;

    if (el.nodeType === 1 && matchesAny(el, PLAYER_SELECTORS)) return true;

    try {
        if (el.querySelector && el.querySelector("video")) return true;
    } catch (e) {
        return false;
    }

    if (el.shadowRoot && shadowHasPlayer(el.shadowRoot)) return true;

    for (const host of playerShadowHosts) {
        try {
            if (el.contains && el.contains(host)) return true;
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
            if (containsPlayerDeep(container)) return null;
            return container;
        }
    }
    let cur = el;
    for (let i = 0; i < 8 && cur; i++) {
        if (cur.style && cur.style.width === "160px") {
            if (isStructuralElement(cur)) return null;
            if (isInsidePlayer(cur)) return null;
            if (containsPlayerDeep(cur)) return null;
            return cur;
        }
        cur = cur.parentElement;
    }
    if (isStructuralElement(el)) return null;
    if (isInsidePlayer(el)) return null;
    if (containsPlayerDeep(el)) return null;
    return el;
}

function findRotatedContainer(el) {
    let cur = el;
    for (let i = 0; i < 6 && cur; i++) {
        const parent = cur.parentElement;
        if (!parent) return null;
        if (parent.children.length > MAX_CONTAINER_CHILDREN) return null;
        if (isStructuralElement(parent)) return null;
        if (parent.shadowRoot) return null;
        if (containsShadowHost(parent)) return null;
        if (isInsidePlayer(parent)) return null;
        // Не поднимаемся через границу плеера: если родитель уже
        // содержит <video> (в том числе в shadow DOM), скрывать его
        // нельзя. Возвращаем null, чтобы не уйти ещё выше —
        // к layout всей страницы.
        if (containsPlayerDeep(parent)) return null;
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

/**
 * Элемент занимает почти весь экран. Такие узлы — layout-обёртки
 * (VKUI SplitLayout и т.п.), а не рекламный блок. Скрывать их
 * нельзя: вместе с ними исчезает плеер, а звук продолжает играть.
 */
function isPageLevelElement(el) {
    if (!el || !el.getBoundingClientRect) return false;

    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;

    const vw = window.innerWidth || 0;
    const vh = window.innerHeight || 0;
    if (!vw || !vh) return false;

    return rect.height >= vh * 0.8 && rect.width >= vw * 0.4;
}

function hideAdInElement(el, logPrefix) {
    if (TEXT_HIDING_DISABLED_HOSTS.test(window.location.hostname)) return null;
    if (!el || !el.style) return null;
    if (el.shadowRoot) return null;
    if (isStructuralElement(el)) return null;

    // Длину проверяем до обхода дерева: querySelector("video")
    // на каждом узле страницы — дорого.
    const collapsed = collapseText(el.textContent);
    if (collapsed.length < MIN_CANDIDATE_TEXT_LENGTH) return null;
    if (collapsed.length > MAX_CANDIDATE_TEXT_LENGTH) return null;

    if (isInsidePlayer(el)) return null;
    if (containsPlayerDeep(el)) return null;

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
    if (target.shadowRoot) return null;
    if (containsShadowHost(target)) return null;
    if (isInsidePlayer(target)) return null;
    if (containsPlayerDeep(target)) return null;
    if (isPageLevelElement(target)) {
        console.warn("[erst_dev_adblocker] skip page-level element:", target);
        return null;
    }

    // setProperty идемпотентна: повторная установка того же значения
    // не меняет inline-стиль.
    target.style.setProperty("display", "none", "important");
    hiddenByUs.add(target);

    console.log(logPrefix + ' "' + (marker || "rotated-label") + '"');
    return marker;
}

function hideAdMarkers() {
    if (!document.body) return;

    // Обновляем кэш shadow-хостов до обхода: если плеер уже есть,
    // его предки не будут скрыты.
    scanForPlayerShadowHosts(document.documentElement);

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

    // MutationObserver не видит изменения внутри shadow root.
    // Если плеер смонтировался в уже существующий shadow-хост,
    // узел в светлом DOM не менялся и observer молчит. Пока
    // есть скрытые нами элементы — раз в секунду проверяем,
    // не появился ли в каком-нибудь shadow root <video>.
    setInterval(() => {
        let live = 0;
        for (const el of hiddenByUs) {
            if (!el.isConnected) hiddenByUs.delete(el);
            else live++;
        }
        if (live === 0) return;
        scanForPlayerShadowHosts(document.documentElement);
    }, 1000);
}
