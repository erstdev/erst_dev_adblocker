/* ============================================================
   Авто-скип рекламы в видео.

   Поддерживаемые сайты:
   - YouTube (приоритет) — три механизма
   - VK Video, RuTube — только клик по кнопке

   Механизмы для YouTube:

   1. MutationObserver на класс ad-showing у плеера.
      Как только YouTube добавляет ad-showing — срабатываем
      мгновенно, без задержки.

   2. На время рекламы скрываем видео и показываем оверлей
      «Пропуск рекламы». Пользователь не видит мигание.

   3. Ускорение playbackRate = 16 + mute + клик по кнопке
      «Пропустить», если она есть. Реклама пролетает за 1-2 с.

   4. setInterval 500 мс — страховка, если MutationObserver
      не сработал (например, плеер пересоздался в SPA).

   Все механизмы работают одновременно.

   ВАЖНО про класс ad-showing:
   - YouTube держит его на #movie_player и на .html5-video-player.
   - В SPA плеер может пересоздаваться — observer нужно
     перевешивать на новый элемент.
   ============================================================ */

const LOG = "[erst_dev_adblocker]";

const SKIP_SELECTORS = [
    '[data-testid="ad-skip-button"]',    // VK Video
    '.ytp-ad-skip-button',               // YouTube (старый)
    '.ytp-skip-ad-button',               // YouTube (новый)
    '.ytp-ad-skip-button-modern',        // YouTube (modern)
    '.ytp-ad-skip-button-container button',
    '[class*="skip-ad"]',                // generic
];

const YT_SPEED = 16;
const YT_PLAYER_SELECTORS = [
    "#movie_player",
    ".html5-video-player"
];
const YT_AD_CLASS = "ad-showing";
const OVERLAY_ID = "erst-yt-ad-overlay";

// ------------------------------------------------------------
// Оверлей «Пропуск рекламы»
// ------------------------------------------------------------

function showAdOverlay() {
    if (document.getElementById(OVERLAY_ID)) return;

    const player = document.querySelector(YT_PLAYER_SELECTORS.join(","));
    if (!player) return;

    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.textContent = "Пропуск рекламы…";
    overlay.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: #000;
    color: #eee;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 18px;
    z-index: 9999;
    pointer-events: none;
  `;

    const computed = getComputedStyle(player);
    if (computed.position === "static") {
        player.style.position = "relative";
    }

    player.appendChild(overlay);
}

function hideAdOverlay() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (overlay) overlay.remove();
}

// ------------------------------------------------------------
// Клик по кнопке «Пропустить» (VK, YouTube, generic)
// ------------------------------------------------------------

function trySkipButton() {
    for (const sel of SKIP_SELECTORS) {
        let elements;
        try {
            elements = document.querySelectorAll(sel);
        } catch (e) {
            continue;
        }
        for (const el of elements) {
            if (!el || el.disabled) continue;

            el.click();
            console.log(`${LOG} ad skipped: ${sel}`);
            return true;
        }
    }
    return false;
}

// ------------------------------------------------------------
// Обработка рекламы на YouTube
// ------------------------------------------------------------

function getPlayer() {
    for (const sel of YT_PLAYER_SELECTORS) {
        const el = document.querySelector(sel);
        if (el) return el;
    }
    return null;
}

function handleYoutubeAdStart() {
    const player = getPlayer();
    if (!player) return;

    const video = player.querySelector("video");
    if (video && video.playbackRate !== YT_SPEED) {
        video.playbackRate = YT_SPEED;
        video.muted = true;
    }

    showAdOverlay();
    trySkipButton();
}

function handleYoutubeAdEnd() {
    const player = getPlayer();
    if (!player) return;

    const video = player.querySelector("video");
    if (video) {
        if (video.playbackRate !== 1) video.playbackRate = 1;
        if (video.muted) video.muted = false;
    }

    hideAdOverlay();
    console.log(`${LOG} yt ad end`);
}

// ------------------------------------------------------------
// MutationObserver на класс ad-showing.
//
// Перевешиваем observer каждый раз, когда плеер
// пересоздаётся (SPA-навигация на YouTube).
// ------------------------------------------------------------

let currentPlayer = null;
let currentObserver = null;
let wasAdShowing = false;

function attachObserverToPlayer(player) {
    if (currentObserver) {
        currentObserver.disconnect();
        currentObserver = null;
    }
    currentPlayer = player;

    const check = () => {
        const isAd = player.classList.contains(YT_AD_CLASS);
        if (isAd && !wasAdShowing) {
            wasAdShowing = true;
            handleYoutubeAdStart();
        } else if (!isAd && wasAdShowing) {
            wasAdShowing = false;
            handleYoutubeAdEnd();
        }
    };

    // Первичная проверка (если реклама уже идёт при старте)
    check();

    currentObserver = new MutationObserver(check);
    currentObserver.observe(player, {
        attributes: true,
        attributeFilter: ["class"]
    });

    console.log(`${LOG} yt ad watcher started`);
}

function ensureObserver() {
    const player = getPlayer();
    if (!player) return;
    if (player === currentPlayer && currentObserver) return;
    attachObserverToPlayer(player);
}

// ------------------------------------------------------------
// Страховочный интервал (на случай если observer отвалился)
// ------------------------------------------------------------

function periodicCheck() {
    const player = getPlayer();
    if (!player) return;

    const isAd = player.classList.contains(YT_AD_CLASS);

    if (isAd) {
        const video = player.querySelector("video");
        if (video && video.playbackRate !== YT_SPEED) {
            video.playbackRate = YT_SPEED;
            video.muted = true;
        }
        if (!document.getElementById(OVERLAY_ID)) {
            showAdOverlay();
        }
        // Клик по кнопке — просто на всякий случай
        trySkipButton();
        wasAdShowing = true;
    } else if (!isAd && wasAdShowing) {
        // Реклама кончилась, а observer не отреагировал
        wasAdShowing = false;
        handleYoutubeAdEnd();
    }
}

// ------------------------------------------------------------
// Запуск
// ------------------------------------------------------------

function startAutoSkip() {
    // Пытаемся повесить observer прямо сейчас (если плеер уже есть).
    ensureObserver();

    // Если плеера ещё нет (SPA) — пробуем до тех пор, пока он не появится.
    // После появления плеера не выключаем интервал: YouTube может
    // пересоздать плеер при переходе между видео.
    setInterval(ensureObserver, 1000);

    // Страховочный интервал
    setInterval(() => {
        trySkipButton();
        periodicCheck();
    }, 500);
}