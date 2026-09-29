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
   - AD_TEXT_MARKERS (ad-markers.js)
   ============================================================ */

function startObserver() {
    if (state.currentSelectors.length === 0 && typeof AD_TEXT_MARKERS === "undefined") {
        return;
    }

    const observer = new MutationObserver((mutations) => {
        const combinedSelector = state.currentSelectors.join(",");

        for (const mutation of mutations) {
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
                        // Некоторые селекторы (например, с :has()) невалидны для matches().
                    }
                }

                // 2. Проверка по текстовым маркерам рекламы
                checkNodeForMarkers(node);
            }
        }
    });

    observer.observe(document.documentElement || document, {
        childList: true,
        subtree: true
    });

    console.log("[erst-dev] MutationObserver started");
}

// ------------------------------------------------------------
// Проверка нового узла на текстовые маркеры рекламы.
// Использует AD_TEXT_MARKERS из ad-markers.js.
// ------------------------------------------------------------
function checkNodeForMarkers(node) {
    if (typeof AD_TEXT_MARKERS === "undefined") return;
    if (!node.querySelectorAll) return;

    const elements = [node, ...node.querySelectorAll("div, span, a")];

    for (const el of elements) {
        for (const child of el.childNodes) {
            if (child.nodeType !== Node.TEXT_NODE) continue;

            const text = (child.textContent || "").trim().toLowerCase();
            if (text.length === 0 || text.length > 30) continue;

            if (AD_TEXT_MARKERS.includes(text)) {
                let target = el;
                for (let i = 0; i < 3 && target.parentElement; i++) {
                    target = target.parentElement;
                }
                target.style.setProperty("display", "none", "important");
                console.log(`[erst-dev] hid new ad marker: "${text}"`);
                return;
            }
        }
    }
}