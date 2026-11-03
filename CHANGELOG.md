# Changelog

Все значимые изменения проекта erst_dev_adblocker.

Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.0.0/).
Версии следуют [Semantic Versioning](https://semver.org/lang/ru/).

## [1.1.4] — 2026-11-03

### Fixed

- **Text-based hiding скрывал текст статьи и поле ввода.** Матчер искал подстроку «реклама» в `textContent` любого `div`/`span`/`a`, поэтому набранное в contenteditable слово или абзац статьи с этим словом скрывались. Теперь скрывается только самостоятельный лейбл (`isStandaloneLabel`): «Реклама», «Реклама 18+», «Рекламное объявление», но не «Это реклама» и не текст с этим словом. Добавлен `isNoHideZone`: не трогаем `input`, `textarea`, `contenteditable`, `[role=textbox|combobox|search|listbox|option]` и `form`. Текстовые блоки (`P`, `ARTICLE`, `H1`–`H6`, `LI`, `BLOCKQUOTE`, `PRE`, `CODE`, `TD`, `TH`) не скрываются. Для target и промежуточных контейнеров проверяется наличие таких зон. `isVisibleElement` не даёт скрывать невидимые элементы (`visibility: hidden`, `opacity: 0`, нулевой размер, за пределами экрана, `aria-hidden`): это mirror-дивы авторазмера textarea, по которым сайт пересчитывает высоту поля ввода.
- **Mail.ru: рекламные блоки в инбоксе не скрывались.** Лейбл разрезан элементами и текстовыми узлами: `<div>амалк</div>Рекла<div>ма</div>`. `isRotatedAdLabel` считал только `el.children` (Element-узлы) и требовал 3 элемента — здесь их 2 и текстовый узел между ними. Теперь считаются `childNodes`, все непустые куски должны быть ≤ 6 символов, а в тексте ищется корень «рекл» (или старый шаблон `р.к.м…а`). Для второго варианта лейбла, «амалкереклама» (мусорный префикс + целое «реклама», два узла), добавлен `isJunkPrefixedLabel`: такой текст скрывается только при наличии известного контейнера `.sc-1v5ykgi` / `.sc-1ymix5g`, иначе можно принять за рекламу обычный текст.

## [1.1.3] — 2026-10-21

### Fixed

- **Яндекс Маркет: скрывались изображения товаров.** Лейбл «Реклама» стоит внутри карточек, text-based hiding поднимался до обёртки изображения и ставил ей `display: none`. Для `market.yandex.*` text-based hiding отключён: реклама Маркета режется DNR и domain-селекторами по `data-apiary-widget-name`.
- **VK Video: скрывалась правая колонка с рекомендациями.** Лейбл «Реклама» в списке других видео заставлял `findRotatedContainer` подниматься до всей колонки. Для `vkvideo.ru` text-based hiding отключён. Добавлен общий `isContentContainer`: контейнеры с ≥ 8 ссылками или ≥ 4 картинками (навигация, рекомендации, сетки) не скрываются.

## [1.1.2] — 2026-10-20

### Fixed

- **VK Video: пропадал `<video>` при играющем звуке.** Плеер VK живёт в открытом shadow DOM, а `querySelector("video")` и CSS `:has(video)` внутрь shadow root не смотрят. Text-based hiding поднимался от лейбла «Реклама» до VKUI-обёрток (`vkuiSplitLayout`, `vkuiDiv`) и скрывал их до гидратации, когда shadow root ещё не был создан. Видео исчезало, звук продолжал играть. Добавлены рекурсивный обход открытых shadow root (`collectShadowHosts`, `shadowHasPlayer`), `containsShadowHost`, `isPageLevelElement`, `hiddenByUs` + `unhideAncestorsOfPlayer`, интервальная проверка `scanForPlayerShadowHosts`. Из `cosmetic-manual.css` убраны `[data-testid="ad-container"]:not(:has(video))` и `[class*="ads-container"]:not(:has(video))`: `:has()` слеп к shadow DOM и мог навсегда скрыть контейнер с плеером.
- **Тогл в popup не выключал text-based hiding, observer и авто-скип.** Content scripts запускались всегда, `enabled` не проверялся. `domain-cosmetic.js` теперь читает `enabled` из `chrome.storage.local` и при `false` не запускает ничего.
- **`refreshSelectors` не повторял запрос селекторов после ошибки.** URL помечался обработанным до ответа service worker, и при сбое `sendMessage` селекторы не запрашивались до следующей навигации. Теперь отметка ставится после успешного ответа, при `null` — повтор через 1 с.
- **`ad-markers.js`: лог писал `hid ad marker block: "null"`** в ветке структурного детектора. Печатается `rotated-label`.
- **Документация: неверное число allow-правил.** В README и CONTEXT было 1 094 / 28 094 / 93.6%, фактически 1 034 / 28 034 / 93.4%.
- **README: дублирующийся заголовок «Структура проекта»** и незакрытый fence — заголовок попадал внутрь код-блока.

### Technical

- **CHANGELOG:** убран второй заголовок `# Changelog` посреди файла.
- **package-lock.json:** версия приведена к 1.1.2.
- **.gitignore:** убраны правила для `package-lock.json` и `CONTEXT.md` — они уже отслеживались, ignore не действовал.
- **CONTEXT.md:** детектор рекламы, content scripts, ручная косметика VK и известные ограничения приведены к текущему поведению; добавлено ограничение по закрытому shadow root.
- **README.md:** text-based hiding не трогает плеер и shadow host'ы; добавлено ограничение по закрытому shadow root.

## [1.1.1] — 2026-10-15

### Fixed

- **RuTube: реклама глушила основной плеер.** Селектор `[id^="raichu"] video` из `RUTUBE_AD_VIDEO_SELECTORS` матчил основной `<video data-testid="video">` внутри `raichuContainerWithPlayer_...` — `muteAdVideos()` ставил его на паузу и глушил. Селектор убран. `muteAdVideos()` работает только по точечным `video[data-testid="advert-video"]` и `video.raichu-adver-tag`.
- **RuTube: кнопка «Отключить рекламу» больше не в SKIP_SELECTORS.** `[data-testid="disableAdsButton"]` — это кнопка подписки RuTube, а не «Пропустить». Клик по ней не выполнялся, но находился в списке.
- **Dzen: рекламные карточки в ленте не скрывались.** Классы Dzen обфусцированы и меняются при каждом билде. Добавлены стабильные якоря в `AD_CONTAINER_SELECTORS`: `[data-new-adtune="true"]`, `[data-cv3dnq1w-click="imageGallery"]`, `[data-cv3dnq1w-click="title"]`.
- **Mail.ru: нативная реклама с лейблом «реклам» + «а» ловилась не всегда.** В `AD_TEXT_MARKERS` добавлен маркер `реклам` (без окончания). Покрывает случай, когда `реклама` разбита на несколько `<div>`.

### Changed

- **`auto-skip.js`: разветвление по хостам.** `startAutoSkip()` больше не вешает страховочные интервалы на все сайты. YouTube — observer + интервалы, RuTube — клик + mute/ускорение, VK Video — только клик. На остальных сайтах интервалов нет.
- **`auto-skip.js`: `periodicCheck` ограничен YouTube-хостами.** Список `YT_HOSTS`, функция `isYoutubeHost()`. Раньше страховочный интервал выполнялся везде.
- **`auto-skip.js`: добавлена `isClickableButton()`.** Клик выполняется только по `button` / `a` / `input[type=button|submit]`, видимым (`getBoundingClientRect` > 0) и не `disabled`.
- **`auto-skip.js`: `attachObserverToPlayer` сбрасывает `wasAdShowing` при смене плеера.** Раньше при пересоздании плеера на YouTube первый `check()` не запускал обработку рекламы.
- **`ad-markers.js`: `AD_CONTAINER_SELECTORS` расширен.** Добавлены Dzen-якоря и Mail.ru-классы `.sc-1v5ykgi`, `.sc-1ymix5g`.

### Removed

- **`auto-skip.js`: удалён широкий селектор `[class*="skip-ad"]`.** Он матчил любой элемент с подстрокой в `class` (`skip-ads-info`, `no-skip-ad`, `dont-skip-ad`, `skip-ad-signup`) и кликал по нему каждые 500 мс на всех сайтах. Заменён на точечные селекторы для YouTube, VK Video и RuTube.
- **`auto-skip.js`: `muteAdVideos()` больше не вызывает `v.pause()`.** Оставлены только `muted = true` и `playbackRate = 16`. `pause()` мог останавливать основной плеер, если селектор случайно поймал его `<video>`.
- **`ad-markers.js`: убрана проверка `target.style.display === "none"`.** Читала только inline-стиль (не computed), выигрыша не давала. `setProperty("display", "none", "important")` идемпотентна — повторная установка того же значения не меняет inline-стиль.
- **`observer.js`: убрано условие `state.currentSelectors.length === 0 && typeof hideAdInElement === "undefined"`.** Вторая часть всегда false (`hideAdInElement` определена в `ad-markers.js`, который в manifest идёт раньше `observer.js`). Observer нужен для text-based hiding даже при пустом списке domain-селекторов, поэтому early-return убран целиком.

### Fixed (продолжение)

- **`exceptions.js`: regexp-исключения отсеиваются до парсинга.** Правило `@@/regexp/$mods` больше не проходит в DNR как literal. Раньше `lastIndexOf("$")` мог найти `$` внутри самого регэкспа (например, `/foo$/`) и ошибочно принять его за модификаторы.
- **`spa.js`: защита от повторной установки watcher'а.** Флаг `__erstUrlWatcherInstalled` не даёт дважды обернуть `history.pushState` / `replaceState`, если content script будет инжектирован повторно.

### Technical

- **`limiter.js`: комментарий к `MANUAL_ID_MAX`.** Уточнено, что 199 — это запас, а не фактический размер `manual.json` (там 6 правил). Если `manual.json` вырастет выше 199 — поднять `DYN_RULE_ID_BASE` в `shared/storage.js` и синхронизировать константы.
- **CONTEXT.md актуализирован.** RuTube-задача перенесена в решённые. Блок «Мелкие замечания» удалён (все пункты разобраны). Числа правил приведены к 27 000 / 1 034 / 28 034.
- **README.md актуализирован.** Блок «Как это работает» и описывает текущее поведение авто-скипа. Блок «Известные ограничения» приведён к текущему набору неподдерживаемых модификаторов и фильтров.
- **CHANGELOG.md.** Добавлена версия 1.1.1.

## [1.1.0] — 2026-10-14

### Added

- Кнопка «Перезагрузить страницу» в popup. Появляется после изменения настроек (свитчер или белый список), перезагружает активную вкладку, чтобы применить изменения без ручного F5.

### Changed

- Text-based hiding расширен: добавлены маркеры «Объявление скрыто» и «Рекламное объявление» — скрывают нативные карточки рекламы на Mail.ru.
- Структурный детектор разбитого лейбла рекламы. Mail.ru разбивает слово «реклама» на куски и вклинивает посторонние буквы внутрь слова («амалкреклаерма»). Такие лейблы распознаются по структуре (короткий текст, 3+ дочерних элемента, буквы р-к-м-а в правильном порядке) и скрываются вместе с контейнером.
- MutationObserver теперь проверяет новые элементы на текстовые маркеры рекламы сразу при добавлении в DOM. Это уменьшает время между появлением карточки и её скрытием.
- Все входы скрытия по текстовым маркерам идут через единую функцию `hideAdInElement`. Это упростило код и убрало расхождения между `hideAdMarkers` и `checkNodeForMarkers`.

### Removed

- Badge на иконке расширения (статус «ON» / «OFF» / «—»). Отключён, функционал будет возвращён позже при необходимости.

### Fixed

- `insertCSS failed: The extensions gallery cannot be scripted` на `chrome.google.com` и `chromewebstore.google.com`. Добавлена ручная проверка запрещённых хостов в `background/lib/cosmetic-injector.js`.
- `Service worker registration failed. Status code: 15` из-за `hostNotEquals` в UrlFilter у `webNavigation.onCommitted`. Исключение хостов перенесено в `handleCommitted` (ручная проверка).
- Race condition при синхронизации динамических правил whitelist. Удаление и добавление правил разнесены на два отдельных вызова `updateDynamicRules` (Chrome не гарантирует порядок операций внутри одного вызова).
- Whiteline-логотип Mail.ru отображался как битая картинка, потому что блокировался трекер-домен `mradx.net`, используемый Mail.ru как CDN для логотипа. Добавлено allow-правило в `rules/manual.json` для `||r.mradx.net/imgs/`.

### Technical

- Локализация `name` и `description` через `_locales/` (`en`, `ru`). В манифесте теперь `__MSG_appName__` и `__MSG_appDescription__`.
- `minimum_chrome_version: "105"` в манифесте — из-за использования `:has()` в CSS и `allowAllRequests` в DNR.
- `tabs` заменён на `activeTab` — доступ к `tab.url` только после клика по иконке расширения.
- Удалён `web_accessible_resources` для `rules/cosmetic-map.json`. Файл читается только из service worker, для этого WAR не нужен.
- `npm run screenshots` добавлен в `package.json` (`node tools/resize-screenshots.js`).
- В `tools/lib/cosmetic.js` добавлен фильтр extended-синтаксиса. Правила из EasyList/AdGuard/RU AdList, содержащие `:style()`, `:remove()`, `:upward()`, `:matches-path()`, `:matches-css()`, `:matches-attr()`, `:contains()`, `:xpath()`, `:-abp-properties()`, `+js()`, не являются валидным CSS и молча игнорировались браузером при `insertCSS`. Теперь они отбрасываются на этапе конвертации. По итогу отфильтровано 1 135 правил, domain-map уменьшилась с 12 832 до 12 510 доменов, число domain-specific селекторов — с 31 310 до 29 515.

## [1.0.0] — 2026-09-29

Первый публичный релиз. Опубликовано в Chrome Web Store и Opera Addons.

### Added

- Блокировка рекламных и трекерных запросов через DNR (Declarative Net Request). Набор правил сгенерирован из EasyList и RU AdList: 28 024 блокирующих правила и 501 allow-правило.
- Косметика: скрытие рекламных элементов через CSS. 14 116 общих селекторов и 31 310 domain-specific селекторов для 12 832 доменов.
- Ручные правила для отдельных сайтов: AdFox (Яндекс), РСЯ, Mail.ru, Dzen, ВКонтакте.
- Whitelist — список сайтов, на которых блокировка не работает.
- Глобальный вкл/выкл расширения через свитчер в popup.
- Авто-скип рекламы в видео (VK Video, YouTube, RuTube).
- SPA-навигация: отслеживание pushState, popstate, hashchange для корректной работы на сайтах-приложениях.
- MutationObserver для скрытия динамически добавленной рекламы.
- Text-based hiding: поиск и скрытие рекламных блоков по текстовым маркерам.
- Popup с управлением: свитчер, белый список, обратная связь (mailto).
- Приватная политика опубликована на GitHub Pages.

### Technical

- Manifest V3.
- Раздельные диапазоны id для статических, allow и динамических DNR-правил (из-за особенности Chrome: id общие между всеми наборами).
- Мьютекс в `syncDnrState` для защиты от race condition при параллельных вызовах.
- Разделение удаления и добавления динамических правил на два вызова (Chrome не гарантирует порядок операций в одном вызове).
- Конвертер EasyList → DNR на Node.js в `tools/`. Разбит на модули: reader, classifier, network, exceptions, cosmetic, limiter, writer.
- Документация в `docs/` — 11 глав, объясняющих архитектуру, код и принятые решения.