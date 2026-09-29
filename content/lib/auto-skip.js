/* ============================================================
   Авто-скип кнопок «Пропустить рекламу».

   Что делает:
   - раз в секунду ищет на странице кнопку пропуска рекламы
   - если находит и она активна — кликает

   Поддерживаемые кнопки:
   - VK Video:   [data-testid="ad-skip-button"]
   - YouTube:    .ytp-ad-skip-button, .ytp-skip-ad-button,
                 .ytp-ad-skip-button-modern

   Почему не блокируем саму рекламу:
   Pre-roll / mid-roll видео склеены с основным видеофайлом
   на сервере (server-side ad injection). DNR не может отрезать
   кусок потока. Единственный рабочий способ для MV3 — нажать
   «Пропустить», как сделал бы пользователь.
   ============================================================ */

const SKIP_SELECTORS = [
    '[data-testid="ad-skip-button"]', // VK Video
    '.ytp-ad-skip-button',            // YouTube (старый)
    '.ytp-skip-ad-button',            // YouTube (новый)
    '.ytp-ad-skip-button-modern',     // YouTube (modern)
    '[class*="skip-ad"]',             // generic
];

/**
 * Одна попытка авто-скипа.
 */
function trySkip() {
    for (const sel of SKIP_SELECTORS) {
        try {
            const btn = document.querySelector(sel);
            if (btn && !btn.disabled) {
                btn.click();
                console.log(`[erst-dev] ad skipped: ${sel}`);
                return;
            }
        } catch (e) {
            // ignore invalid selector
        }
    }
}

/**
 * Запускает периодический авто-скип.
 */
function startAutoSkip() {
    setInterval(trySkip, 1000);
}