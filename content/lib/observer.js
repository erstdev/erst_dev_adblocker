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

   ВАЖНО про плеер:
   - узел с shadowRoot не скрываем никогда (внутри может быть плеер);
   - узел, содержащий плеер (в светлом DOM или в shadow root),
     не скрываем по domain-селектору;
   - новые узлы сначала сканируются на shadow-хосты с плеером
     (scanForPlayerShadowHosts из ad-markers.js), потом проверяются
     на маркеры.

   Зависимости:
   - state.currentSelectors (inject-css.js / domain-cosmetic.js)
   - hideAdInElement, containsPlayerDeep, scanForPlayerShadowHosts
     (ad-markers.js)
   ============================================================ */

function startObserver() {
    const observer = new MutationObserver((mutations) => {
        // combinedSelector пересчитывается один раз на батч мутаций.
        // Это нормально: батч приходит пачкой, между батчами состояние
        // currentSelectors не меняется (обновляется только через
        // refreshSelectors при смене URL). Проверка state.currentSelectors.length > 0
        // ниже защищает от пустого селектора — matches("") кинул бы исключение.
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

                // 0. Новый shadow-хост с плеером — запомнить и,
                // если мы успели скрыть предка, разскрыть его.
                if (typeof scanForPlayerShadowHosts === "function") {
                    scanForPlayerShadowHosts(node);
                }

                // Shadow-хост не скрываем: внутри может быть плеер.
                if (node.shadowRoot) continue;

                // Контейнер с плеером не скрываем по domain-селектору.
                if (typeof containsPlayerDeep === "function" &&
                    containsPlayerDeep(node)) {
                    checkNodeForMarkers(node);
                    continue;
                }

                // 1. Проверка по domain-селекторам
                if (combinedSelector && state.currentSelectors.length > 0) {
                    try {
                        if (node.matches?.(combinedSelector)) {
                            node.style.setProperty("display", "none", "important");
                        }
                        const matches = node.querySelectorAll?.(combinedSelector);
                        if (matches && matches.length > 0) {
                            matches.forEach((el) => {
                                if (el.shadowRoot) return;
                                if (typeof containsPlayerDeep === "function" &&
                                    containsPlayerDeep(el)) return;
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
