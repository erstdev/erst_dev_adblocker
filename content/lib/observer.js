/* ============================================================
   MutationObserver — ловит динамически добавленные элементы
   и скрывает те, что подходят под известные domain-селекторы,
   а также под текстовые маркеры рекламы.

   Зачем:
   CSS-селекторы применяются браузером автоматически к новым
   элементам. Но некоторые селекторы (например, с :has())
   могут не срабатывать при динамическом добавлении. Плюс —
   мы хотим ловить карточки рекламы по тексту, даже если
   классы обфусцированы.

   Зависимости:
   - state.currentSelectors (inject-css.js / domain-cosmetic.js)
   - hideAdInElement (ad-markers.js)
   ============================================================ */

function startObserver() {
    if (state.currentSelectors.length === 0 && typeof hideAdInElement === "undefined") {
        return;
    }

    const observer = new MutationObserver((mutations) => {
        const combinedSelector = state.currentSelectors.join(",");

        for (const mutation of mutations) {
            if (mutation.type === "characterData") {
                // Текст поменялся внутри существующего узла.
                // Mail.ru может наполнять контейнер текстом, не
                // вставляя новых элементов — addedNodes пустой,
                // но текст появляется.
                const parent = mutation.target.parentElement;
                if (parent) checkNodeForMarkers(parent);
                continue;
            }

            for (const node of mutation.addedNodes) {
                if (node.nodeType !== 1) continue;

                // 1. Проверка по domain-селекторам
                if (combinedSelector && state.currentSelectors.length > 0) {
                    try {
                        if (node.matches?.(combinedSelector)) {
                            node.style.setProperty("display", "none", "important");
                        }
                        const matches = node.querySelectorAll?.(combinedSelector);
                        if (matches && matches.length > 0) {
                            matches.forEach((el) => {
                                el.style.setProperty("display", "none", "important");
                            });
                        }
                    } catch (e) {
                        // Некоторые селекторы невалидны для matches().
                    }
                }

                // 2. Проверка по текстовым маркерам
                checkNodeForMarkers(node);
            }
        }
    });

    observer.observe(document.documentElement || document, {
        childList: true,
        subtree: true,
        characterData: true
    });

    console.log("[erst_dev_adblocker] MutationObserver started");
}

// ------------------------------------------------------------
// Проверка узла на текстовые маркеры рекламы.
// Использует hideAdInElement из ad-markers.js.
// ------------------------------------------------------------
function checkNodeForMarkers(node) {
    if (typeof hideAdInElement === "undefined") return;
    if (!node || !node.querySelectorAll) return;

    const elements = [node, ...node.querySelectorAll("div, span, a")];

    for (const el of elements) {
        hideAdInElement(el, "[erst_dev_adblocker] hid new ad marker:");
    }
}