/* ============================================================
   Content script: domain-specific косметика + SPA + MutationObserver.

   Задачи:
   1. Запросить у service worker селекторы для текущего домена.
   2. Вставить их в <style>.
   3. При SPA-переходах (pushState/popstate/hashchange) — перезапросить
      селекторы для нового URL.
   4. MutationObserver — следить за новыми элементами и скрывать те,
      что подходят под известные селекторы.
   ============================================================ */

(() => {
    const STYLE_ID = "erst-domain-cosmetic";
    const MSG_TYPE = "cs→sw:getDomainSelectors";
    const DEBUG = false;

    let currentSelectors = [];
    let currentUrl = "";

    const log = (...args) => { if (DEBUG) console.log("[erst-dev]", ...args); };

    // --------------------------------------------------------
    // 1. Запрос селекторов у service worker
    // --------------------------------------------------------
    async function fetchSelectors(url) {
        try {
            const response = await chrome.runtime.sendMessage({
                type: MSG_TYPE,
                url
            });
            if (!response || !Array.isArray(response.selectors)) return [];
            return response.selectors;
        } catch (e) {
            console.error("[erst_dev_adblocker] fetchSelectors failed:", e);
            return [];
        }
    }

    // --------------------------------------------------------
    // 2. Вставка/обновление <style> с селекторами
    // --------------------------------------------------------
    function applySelectors(selectors) {
        const existing = document.getElementById(STYLE_ID);
        if (existing) existing.remove();

        if (!selectors || selectors.length === 0) return;

        const css = selectors
            .map((sel) => `${sel} { display: none !important; }`)
            .join("\n");

        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = css;

        const target = document.head || document.documentElement;
        if (target) target.appendChild(style);
    }

    // --------------------------------------------------------
    // 3. Обновление при смене URL (SPA-навигация)
    // --------------------------------------------------------
    async function refreshForUrl(url) {
        if (url === currentUrl) return;
        currentUrl = url;

        const selectors = await fetchSelectors(url);
        currentSelectors = selectors;
        applySelectors(selectors);

        if (selectors.length > 0) {
            log(`refreshed for ${url}: ${selectors.length} selectors`);
        }
    }

    // --------------------------------------------------------
    // 4. MutationObserver — ловим динамически добавленные элементы
    // --------------------------------------------------------
    function startObserver() {
        if (currentSelectors.length === 0) return;

        const observer = new MutationObserver((mutations) => {
            if (currentSelectors.length === 0) return;

            const combinedSelector = currentSelectors.join(",");

            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType !== 1) continue;

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

        log("MutationObserver started");
    }

    // --------------------------------------------------------
    // 5. Слежение за SPA-навигацией
    // --------------------------------------------------------
    function watchUrlChanges() {
        const notify = () => refreshForUrl(window.location.href);

        const originalPush = history.pushState;
        const originalReplace = history.replaceState;

        history.pushState = function (...args) {
            originalPush.apply(this, args);
            void notify();
        };
        history.replaceState = function (...args) {
            originalReplace.apply(this, args);
            void notify();
        };

        window.addEventListener("popstate", notify);
        window.addEventListener("hashchange", notify);

        let lastHref = window.location.href;
        setInterval(() => {
            if (window.location.href !== lastHref) {
                lastHref = window.location.href;
                void notify();
            }
        }, 1000);
    }

    // --------------------------------------------------------
    // Запуск
    // --------------------------------------------------------
    (async () => {
        await refreshForUrl(window.location.href);
        watchUrlChanges();

        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", startObserver, { once: true });
        } else {
            startObserver();
        }
    })();
})();