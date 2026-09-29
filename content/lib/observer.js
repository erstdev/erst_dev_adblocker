/* ============================================================
   MutationObserver — ловит динамически добавленные элементы
   и скрывает те, что подходят под известные domain-селекторы.

   Зачем:
   CSS-селекторы применяются браузером автоматически к новым
   элементам. НО — некоторые селекторы (например, с :has())
   могут не срабатывать при динамическом добавлении, а также
   мы хотим гарантировать, что элемент скрыт, даже если CSS
   не успел примениться.

   Что делает:
   - слушает добавление элементов в DOM (subtree)
   - проверяет каждый новый элемент на соответствие
     state.currentSelectors
   - если подходит — сразу ставит inline display:none !important

   Зависимости:
   - state.currentSelectors (inject-css.js / domain-cosmetic.js)
   ============================================================ */

/**
 * Запускает MutationObserver.
 * Вызывается после первичной загрузки селекторов.
 */
function startObserver() {
    if (state.currentSelectors.length === 0) return;

    const observer = new MutationObserver((mutations) => {
        if (state.currentSelectors.length === 0) return;
        const combinedSelector = state.currentSelectors.join(",");

        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType !== 1) continue; // только элементы

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
        }
    });

    observer.observe(document.documentElement || document, {
        childList: true,
        subtree: true
    });

    console.log("[erst-dev] MutationObserver started");
}