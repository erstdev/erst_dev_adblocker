/* ============================================================
   Авто-скип рекламы в видео.

   Поддерживаемые сайты:
   - YouTube (приоритет) — три механизма
   - VK Video, RuTube — только клик по кнопке + mute/ускорение RuTube

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

   ВАЖНО про селекторы:
   - НЕ используем широкие селекторы вида [class*="skip-ad"].
     Такой селектор матчит любой элемент с подстрокой в class
     (skip-ads-info, no-skip-ad, dont-skip-ad, skip-ad-signup)
     и кликает по нему каждые 500 мс на всех сайтах.
     Только точечные селекторы для конкретных плееров.

   ВАЖНО про хосты:
   - periodicCheck работает только на YouTube-хостах.
   - muteAdVideos работает только на RuTube.
   - trySkipButton вызывается из periodicCheck, поэтому на
     не-YouTube сайтах страховочный клик не выполняется.
     На VK Video / RuTube клик идёт через RuTube-ветку и через
     MutationObserver — точечно.
   ============================================================ */

const LOG = "[erst_dev_adblocker]";

const SKIP_SELECTORS = [
    '[data-testid="ad-skip-button"]',            // VK Video
    '.ytp-ad-skip-button',                       // YouTube (старый)
    '.ytp-skip-ad-button',                       // YouTube (новый)
    '.ytp-ad-skip-button-modern',                // YouTube (modern)
    '.ytp-ad-skip-button-container button'       // YouTube (modern, обёртка)
];

const YT_SPEED = 16;
const YT_PLAYER_SELECTORS = [
    "#movie_player",
    ".html5-video-player"
];
const YT_AD_CLASS = "ad-showing";
const OVERLAY_ID = "erst-yt-ad-overlay";

// Хосты YouTube. periodicCheck выполняется только на них —
// чтобы страховочный интервал не давал ложных кликов на других сайтах.
const YT_HOSTS = [
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtu.be"
];

// Хосты RuTube.
const RUTUBE_HOSTS = [
    "rutube.ru",
    "www.rutube.ru"
];

// Селекторы рекламных видео на RuTube. AdFox SDK вставляет <video>
// поверх основного плеера. Косметика его скрывает, но звук остаётся —
// эти селекторы нужны, чтобы замьютить и ускорить.
const RUTUBE_AD_VIDEO_SELECTORS = [
    'video[data-testid="advert-video"]',
    'video.raichu-adver-tag'
];

function isYoutubeHost() {
    return YT_HOSTS.includes(window.location.hostname);
}

function isRutubeHost() {
    return RUTUBE_HOSTS.includes(window.location.hostname);
}

// ------------------------------------------------------------
// Состояние плеера до рекламы.
//
// Реклама ускоряется и глушится, но после неё нельзя сбрасывать
// пользовательские mute и скорость в 1x / unmuted: если он смотрел
// на 1.5x с выключенным звуком, так и должно остаться. Запоминаем
// значения перед первым вмешательством и возвращаем их в конце.
// ------------------------------------------------------------

let savedVideoState = null;

function rememberVideoState(video) {
    if (!video) return;
    if (savedVideoState && savedVideoState.video === video) return;

    savedVideoState = {
        video,
        muted: video.muted,
        playbackRate: video.playbackRate
    };
}

function restoreVideoState() {
    const saved = savedVideoState;
    savedVideoState = null;

    if (!saved || !saved.video || !saved.video.isConnected) return;

    saved.video.playbackRate = saved.playbackRate;
    saved.video.muted = saved.muted;
}

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
// Клик по кнопке «Пропустить».
//
// Клик выполняется только по кликабельным элементам (button,
// a, input[type=button|submit]) и только если элемент видим
// (getBoundingClientRect width/height > 0) и не disabled.
// ------------------------------------------------------------

function isClickableButton(el) {
    if (!el) return false;
    if (el.disabled) return false;

    const tag = el.tagName;
    const isButton =
        tag === "BUTTON" ||
        tag === "A" ||
        (tag === "INPUT" && (el.type === "button" || el.type === "submit"));

    if (!isButton) return false;

    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;

    return true;
}

function trySkipButton() {
    for (const sel of SKIP_SELECTORS) {
        let elements;
        try {
            elements = document.querySelectorAll(sel);
        } catch (e) {
            continue;
        }
        for (const el of elements) {
            if (!isClickableButton(el)) continue;

            el.click();
            console.log(`${LOG} ad skipped: ${sel}`);
            return true;
        }
    }
    return false;
}

// ------------------------------------------------------------
// RuTube: mute + ускорение рекламных видео.
//
// Косметика скрывает <video>, но звук продолжает играть.
// Проматываем рекламу на 16x и глушим — до клика по skip-кнопке
// или до конца рекламного ролика.
// ------------------------------------------------------------

function muteAdVideos() {
    if (!isRutubeHost()) return;

    for (const sel of RUTUBE_AD_VIDEO_SELECTORS) {
        let videos;
        try {
            videos = document.querySelectorAll(sel);
        } catch (e) {
            continue;
        }
        for (const v of videos) {
            if (!v || v.tagName !== "VIDEO") continue;
            if (!v.muted) v.muted = true;
            if (v.playbackRate !== YT_SPEED) v.playbackRate = YT_SPEED;
        }
    }
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
    if (video) {
        rememberVideoState(video);
        if (video.playbackRate !== YT_SPEED) {
            video.playbackRate = YT_SPEED;
            video.muted = true;
        }
    }

    showAdOverlay();
    trySkipButton();
}

function handleYoutubeAdEnd() {
    const player = getPlayer();
    if (!player) return;

    restoreVideoState();
    hideAdOverlay();
    console.log(`${LOG} yt ad end`);
}

// ------------------------------------------------------------
// MutationObserver на класс ad-showing.
//
// Перевешиваем observer каждый раз, когда плеер
// пересоздаётся (SPA-навигация на YouTube).
//
// Если currentPlayer !== player и wasAdShowing = true — сбрасываем
// флаг и скрываем оверлей. Иначе на новом плеере первый check()
// увидит ad-showing, но wasAdShowing уже true, и старт рекламы
// не обработается.
// ------------------------------------------------------------

let currentPlayer = null;
let currentObserver = null;
let wasAdShowing = false;

function attachObserverToPlayer(player) {
    if (currentObserver) {
        currentObserver.disconnect();
        currentObserver = null;
    }

    if (currentPlayer !== player && wasAdShowing) {
        wasAdShowing = false;
        hideAdOverlay();
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
    if (!isYoutubeHost()) return;

    const player = getPlayer();
    if (!player) return;
    if (player === currentPlayer && currentObserver) return;
    attachObserverToPlayer(player);
}

// ------------------------------------------------------------
// Страховочный интервал (на случай если observer отвалился).
//
// Работает только на YouTube-хостах, чтобы не давать ложных
// кликов по кнопкам на других сайтах.
// ------------------------------------------------------------

function periodicCheck() {
    if (!isYoutubeHost()) return;

    const player = getPlayer();
    if (!player) return;

    const isAd = player.classList.contains(YT_AD_CLASS);

    if (isAd) {
        const video = player.querySelector("video");
        if (video) {
            rememberVideoState(video);
            if (video.playbackRate !== YT_SPEED) {
                video.playbackRate = YT_SPEED;
                video.muted = true;
            }
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
    // YouTube: observer + страховочные интервалы.
    if (isYoutubeHost()) {
        // Пытаемся повесить observer прямо сейчас (если плеер уже есть).
        ensureObserver();

        // Если плеера ещё нет (SPA) — пробуем до тех пор, пока он
        // не появится. После появления плеера не выключаем интервал:
        // YouTube может пересоздать плеер при переходе между видео.
        setInterval(ensureObserver, 1000);

        // Страховочный интервал
        setInterval(() => {
            trySkipButton();
            periodicCheck();
        }, 500);
        return;
    }

    // RuTube: клик по кнопке «Пропустить» + mute/ускорение
    // рекламных видео. Без observer — плеер RuTube не даёт
    // публичного класса вида ad-showing.
    if (isRutubeHost()) {
        setInterval(() => {
            trySkipButton();
            muteAdVideos();
        }, 500);
        return;
    }

    // VK Video: точечный клик по кнопке «Пропустить». Без интервалов
    // по другим сайтам — чтобы не давать ложных кликов.
    // VK Video — это vk.com/video. Проверяем по хосту.
    if (window.location.hostname.endsWith("vk.com") ||
        window.location.hostname.endsWith("vkvideo.ru")) {
        setInterval(() => {
            trySkipButton();
        }, 500);
    }

    // На остальных сайтах не делаем ничего.
}