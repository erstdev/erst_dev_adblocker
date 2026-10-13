/* ============================================================
   Скрытие блоков с текстовой меткой «Реклама» / «Промо» / «Спонсор».

   Что делает:
   - ищет элементы, чей схлопнутый textContent содержит маркер
   - умеет распознавать «рекламу с мусором», когда Mail.ru
     вклинивает посторонние буквы внутрь слова
   - поднимается к ближайшему контейнеру рекламы и скрывает его

   Про разбитый текст Mail.ru:
   - вариант 1: слово режется на куски без мусора
     («Рек» + «ла» + «ма» → «реклама»)
   - вариант 2: внутрь слова вклиниваются посторонние буквы
     («амалк» + «рекла» + «ер» + «ма» → «амалкреклаерма»)

   Вариант 2 распознаётся не по регэкспу, а по структуре:
   лейбл = короткий текст (5-20 символов) + 3+ дочерних
   <div>, каждый с 1-5 символами текста + содержит буквы
   р, к, м, а в правильном порядке. Это отсекает ложные
   срабатывания на «Убрать рекламу за 1₽», «О рекламодателе»
   и обычных постах.

   Точки входа:
   - hideAdInElement(el, logPrefix)
   - startAdMarkerHiding()
   - hideAdInElement, startAdMarkerHiding, AD_TEXT_MARKERS —
     глобальные, используются в observer.js.

   Динамика ловится MutationObserver'ом (см. observer.js).
   ============================================================ */

const AD_TEXT_MARKERS = [
    "реклама",
    "промо",
    "спонсор",
    "рекламный",
    "партнёрскийматериал",
    "advertisement",
    "sponsored",
    // Mail.ru нативные карточки
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

// Признаки контейнера рекламы.
const AD_CONTAINER_SELECTORS = [
    '[id^="trg-b-"]',
    '[id^="b"][data-rendertype="native"]',
    '[id^="yandex_ad_R-"]',
    '[data-testid$="-ad"]',
    '[data-testid*="-ad-"]',
];

/**
 * Схлопывает текст: lowercase, без пробелов и переносов.
 */
function collapseText(str) {
    return (str || "").toLowerCase().replace(/\s+/g, "");
}

/**
 * Обычный матчер: точная подстрока одного из маркеров.
 */
function matchMarker(collapsed) {
    for (const marker of AD_TEXT_MARKERS) {
        if (collapsed.includes(marker)) return marker;
    }
    return null;
}

/**
 * Структурная проверка: является ли элемент разбитым
 * лейблом «реклама» (случай 2 с мусором внутри).
 *
 * Признаки:
 * - схлопнутый текст 5-20 символов;
 * - 3+ дочерних элемента;
 * - большинство детей с текстом 1-5 символов;
 * - содержит р, к, м, а в правильном порядке.
 */
function isRotatedAdLabel(el) {
    const collapsed = collapseText(el.textContent);
    if (collapsed.length < ROTATED_LABEL_MIN_LENGTH) return false;
    if (collapsed.length > ROTATED_LABEL_MAX_LENGTH) return false;

    if (!/р.*к.*м.*а/.test(collapsed)) return false;

    const childElements = el.children;
    if (childElements.length < 3) return false;

    let shortKids = 0;
    for (const child of childElements) {
        const ct = collapseText(child.textContent);
        if (ct.length >= 1 && ct.length <= 5) shortKids++;
    }
    return shortKids >= 3;
}

/**
 * Поднимается вверх до ближайшего контейнера рекламы.
 * Сначала — по семантическим селекторам и width: 160px.
 */
function findAdContainer(el) {
    for (const sel of AD_CONTAINER_SELECTORS) {
        const container = el.closest(sel);
        if (container) return container;
    }

    let cur = el;
    for (let i = 0; i < 8 && cur; i++) {
        if (cur.style && cur.style.width === "160px") {
            return cur;
        }
        cur = cur.parentElement;
    }

    return el;
}

/**
 * Поднимается вверх от разбитого лейбла до контейнера рекламы.
 * Признак контейнера: у него 2+ дочерних элемента с текстом
 * длиннее 20 символов (скрытый блок с лейблами + карточка).
 */
function findRotatedContainer(el) {
    let cur = el;
    for (let i = 0; i < 6 && cur; i++) {
        const parent = cur.parentElement;
        if (!parent) return cur;

        let meaningfulChildren = 0;
        for (const child of parent.children) {
            const t = collapseText(child.textContent);
            if (t.length > 20) meaningfulChildren++;
        }
        if (meaningfulChildren >= 2) return parent;
        cur = parent;
    }
    return el;
}

/**
 * Пытается скрыть рекламу внутри одного элемента.
 */
function hideAdInElement(el, logPrefix) {
    if (!el || !el.style) return null;

    const collapsed = collapseText(el.textContent);
    if (collapsed.length < MIN_CANDIDATE_TEXT_LENGTH) return null;
    if (collapsed.length > MAX_CANDIDATE_TEXT_LENGTH) return null;

    let marker = matchMarker(collapsed);
    let target;

    if (marker) {
        // Короткий текст — вероятно лейбл «реклама 16+» или
        // «реклама» в контейнере. Ищем контейнер по структуре.
        if (collapsed.length <= ROTATED_LABEL_MAX_LENGTH) {
            const structural = findRotatedContainer(el);
            target = structural !== el ? structural : findAdContainer(el);
        } else {
            target = findAdContainer(el);
        }
    } else {
        if (!isRotatedAdLabel(el)) return null;
        marker = "реклама(rotated)";
        target = findRotatedContainer(el);
    }

    if (!target || target.style.display === "none") return null;

    target.style.setProperty("display", "none", "important");
    console.log(`${logPrefix} "${marker}"`);
    return marker;
}

/**
 * Одна попытка поиска и скрытия блоков по тексту.
 */
function hideAdMarkers() {
    if (!document.body) return;

    const candidates = document.querySelectorAll("span, div, a");
    for (const el of candidates) {
        hideAdInElement(el, "[erst_dev_adblocker] hid ad marker block:");
    }
}

/**
 * Одноразовый запуск скрытия по текстовым маркерам.
 */
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