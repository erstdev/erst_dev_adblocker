/* ============================================================
   Отслеживание SPA-навигации (pushState / popstate / hashchange).

   Что делает:
   - перехватывает history.pushState и history.replaceState
   - слушает popstate и hashchange
   - раз в секунду проверяет location.href (страховка для
     экзотических фреймворков, которые меняют URL без событий)

   При смене URL вызывает refreshSelectors(url) — обновляет
   domain-specific селекторы для нового «экрана» SPA.

   Зависимости:
   - refreshSelectors      (inject-css.js)
   ============================================================ */

/**
 * Регистрирует все слушатели смены URL.
 * Вызывается один раз при старте content script.
 */
function watchUrlChanges() {
    const notify = () => refreshSelectors(window.location.href);

    // Перехватываем pushState/replaceState
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

    // Нативные события
    window.addEventListener("popstate", notify);
    window.addEventListener("hashchange", notify);

    // Страховка: некоторые фреймворки меняют URL без событий
    let lastHref = window.location.href;
    setInterval(() => {
        if (window.location.href !== lastHref) {
            lastHref = window.location.href;
            notify();
        }
    }, 1000);
}