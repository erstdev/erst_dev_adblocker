/* ============================================================
   Content script: domain-specific косметика + SPA + MutationObserver
   + авто-скип рекламы + скрытие блоков с меткой "Реклама".

   Задачи:
   1. Запросить у service worker селекторы для текущего домена.
   2. Вставить их в <style>.
   3. При SPA-переходах (pushState/popstate/hashchange) — перезапросить
      селекторы для нового URL.
   4. MutationObserver — следить за новыми элементами и скрывать те,
      что подходят под известные селекторы.
   5. Авто-скип кнопок "Пропустить рекламу" (VK, YouTube, др.).
   6. Text-based hiding — скрывать блоки с текстом "Реклама" / "Промо" /
      "Спонсор".
   ============================================================ */

(() => {
    const STYLE_ID = "erst-domain-cosmetic";
    const MSG_TYPE = "cs→sw:getDomainSelectors";
    const DEBUG = false;

    // Селекторы кнопок "Пропустить рекламу" для авто-скипа
    const SKIP_SELECTORS = [
        '[data-testid="ad-skip-button"]',    // VK Video
        '.ytp-ad-skip-button',               // YouTube (старый)
        '.ytp-skip-ad-button',               // YouTube (новый)
        '.ytp-ad-skip-button-modern',        // YouTube (modern)
        '[class*="skip-ad"]',                // generic
    ];

    // Текстовые маркеры рекламы (в нижнем регистре)
    const AD_TEXT_MARKERS = [
        "реклама",
        "промо",
        "спонсор",
        "рекламный",
        "партнёрский материал",
        "advertisement",
        "sponsored",
    ];

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
    // 4. MutationObserver — динамические элементы
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
    // 5. Авто-скип рекламы (VK, YouTube, др.)
    // --------------------------------------------------------
    function trySkip() {
        for (const sel of SKIP_SELECTORS) {
            try {
                const btn = document.querySelector(sel);
                if (btn && !btn.disabled) {
                    btn.click();
                    log(`ad skipped: ${sel}`);
                    return;
                }
            } catch (e) {
                // ignore invalid selector
            }
        }
    }

    function startAutoSkip() {
        setInterval(trySkip, 1000);
    }

    // --------------------------------------------------------
    // 6. Скрытие блоков с текстом "Реклама" / "Промо" / "Спонсор"
    // --------------------------------------------------------
    function hideAdMarkers() {
        if (!document.body) return;

        // Ищем только "листовые" span/div с коротким текстом-маркером
        const candidates = document.querySelectorAll("span, div, a");
        for (const el of candidates) {
            // Пропускаем уже скрытые
            if (el.style.display === "none") continue;

            // Проверяем только прямые текстовые узлы
            for (const node of el.childNodes) {
                if (node.nodeType !== Node.TEXT_NODE) continue;
                const text = (node.textContent || "").trim().toLowerCase();
                if (text.length === 0 || text.length > 30) continue;

                if (AD_TEXT_MARKERS.includes(text)) {
                    // Поднимаемся к "карточке" — 3 уровня вверх
                    let target = el;
                    for (let i = 0; i < 3 && target.parentElement; i++) {
                        target = target.parentElement;
                    }
                    target.style.setProperty("display", "none", "important");
                    log(`hid ad marker block: "${text}"`);
                    break;
                }
            }
        }
    }

    function startAdMarkerHiding() {
        // Первый проход — после загрузки
        const run = () => {
            try { hideAdMarkers(); } catch (e) {
                console.error("[erst_dev_adblocker] hideAdMarkers failed:", e);
            }
        };

        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", run, { once: true });
        } else {
            run();
        }

        // Периодически — на случай динамической подгрузки
        setInterval(run, 2000);
    }

    // --------------------------------------------------------
    // 7. Слежение за SPA-навигацией
    // --------------------------------------------------------
    function watchUrlChanges() {
        const notify = () => refreshForUrl(window.location.href);

        const originalPush = history.pushState;
        const originalReplace = history.replaceState;

        history.pushState = function (...args) {
            originalPush.apply(this, args);
            notify();
        };
        history.replaceState = function (...args) {
            originalReplace.apply(this, args);
            notify();
        };

        window.addEventListener("popstate", notify);
        window.addEventListener("hashchange", notify);

        let lastHref = window.location.href;
        setInterval(() => {
            if (window.location.href !== lastHref) {
                lastHref = window.location.href;
                notify();
            }
        }, 1000);
    }

    // --------------------------------------------------------
    // Запуск
    // --------------------------------------------------------
    (async () => {
        await refreshForUrl(window.location.href);
        watchUrlChanges();
        startAutoSkip();
        startAdMarkerHiding();

        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", startObserver, { once: true });
        } else {
            startObserver();
        }
    })();
})();