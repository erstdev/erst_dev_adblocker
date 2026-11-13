# erst_dev_adblocker — контекст проекта

## Что это

Блокировщик рекламы для Chrome (и других Chromium-браузеров: Edge, Opera, Brave, Яндекс.Браузер, Vivaldi). Написан на чистом JavaScript, работает на Manifest V3.

Репозиторий: приватный на GitHub (пользователь: erstdev)
Почта: erst.dev.channel@gmail.com (аккаунт разработчика Chrome Web Store)
Почта для обратной связи в расширении: erst_dev@mail.ru
Приватная политика: https://erstdev.github.io/erst_dev_adblocker_privacy/

## Что уже умеет

- Блокировка рекламных и трекерных запросов через DNR (27 000 блокирующих правил + 1 034 allow).
- Косметика: 14 116 общих CSS-селекторов + 29 512 domain-specific для 12 510 доменов.
- Ручные правила для отдельных сайтов (manual.json):
  - AdFox (Яндекс),
  - РСЯ,
  - Mail.ru / VK Ads,
  - Dzen,
  - ВКонтакте,
  - Яндекс.Карты (через DNR),
  - Яндекс.Поиск (гарантийные показы РСЯ).
- Whitelist — сайты, где блокировка не работает.
- Глобальный вкл/выкл через свитчер в popup: выключение останавливает DNR и content scripts (text hiding, observer, авто-скип).
- Авто-скип рекламы в видео (VK Video, YouTube, RuTube).
- SPA-навигация (pushState, popstate, hashchange).
- MutationObserver для динамической рекламы.
- Text-based hiding (обычные маркеры + структурный детектор разбитого текста), с защитой от скрытия плеера, в том числе в shadow DOM.
- Локализация интерфейса popup: 44 языка (24 языка ЕС, страны бывшего СССР, кроме украинского, и другие национальные языки Европы); выбор языка — searchable select с флагами в настройках, сохраняется в chrome.storage.local.
- Локализация name/description через `_locales/` (`en`, `ru`, `hy`).
- Кнопка «Перезагрузить страницу» в popup.
- Обратная связь: «Сообщить о проблеме» (mailto), «Скопировать email».

## План после MVP

1. TypeScript.
2. Prettier.
3. ESLint.
4. Bundler (Vite/Rollup) если понадобится.
5. Порт на Firefox.
6. Разделение DNR-набора на core/extra (обсудить).
7. Публикация в Opera (сделано), Яндекс.Браузер подтягивает из Chrome и Opera.
8. Поддержка `#@#` (исключения косметики).
9. Поддержка `:has-text(...)` (uBlock).
10. Разделение DNR-набора на core/extra.

## Изменения версии 1.2.0

### Popup

1. **Локализация на 44 языка.**
- каталог `shared/locales/`: `east.js` (14 языков), `central.js` (14), `west.js` (16), `index.js`;
- 24 языка ЕС, страны бывшего СССР (кроме украинского), другие национальные языки Европы;
- 23 ключа на язык; `t()` с подстановками, `applyI18n()` для `data-i18n`, `data-i18n-title`, `data-i18n-aria-label`, `data-i18n-placeholder`;
- выбор языка хранится в `chrome.storage.local` (`language`); по умолчанию язык браузера, иначе `en`.

2. **Экран настроек и searchable select.**
- hash-роутинг `#/` ↔ `#/settings`; кнопка ⚙ в шапке, «Назад» в настройках;
- поиск по нативному названию, английскому названию и коду, без учёта диакритики; клавиши ↑/↓/Enter/Escape;
- 44 SVG-флага в `popup/flags/` из flag-icons 7.2.3 (MIT); английский — `gb.svg`;
- порядок: русский, английский, армянский, остальные по английскому названию.

3. **Высота popup.**
- главный экран — по контенту, без пустоты внизу;
- `#view-settings { min-height: 300px }` — под выпадающий список.

### Локализация манифеста

4. **`_locales/hy`.** Армянские name/description; `en` и `ru` уже были.

## Изменения версии 1.1.5

### Косметика

1. **Яндекс.Поиск — верхний AdFox-баннер.**
- в `cosmetic-manual.css` добавлены `[class*="AdfoxBanner_root"]`, `[class*="AdfoxBanner_banner"]`, `[id^="adfox-serp"]`;
- блок размечен CSS-modules-классами `AdfoxBanner_root__<hash>` и `AdfoxBanner_banner__<hash>`, слот — `id="adfox-serp-top-banner"`;
- хэш меняется при сборке Яндекса, префикс имени — нет.

### Content scripts

2. **`AD_CONTAINER_SELECTORS` — AdFox-якоря.**
- добавлены `[class*="AdfoxBanner_root"]`, `[class*="AdfoxBanner_banner"]`, `[id^="adfox-serp"]`, `[id^="adfox-"]`, `[id^="adfox_"]`;
- корень стоит первым: скрывается блок вместе с отступами.

3. **Самостоятельный лейбл — сначала явный контейнер.**
- `hideAdInElement` для `isStandaloneLabel` вызывает `findAdContainerStrict`;
- generic-подъём (`findRotatedContainer`) — только если явного контейнера нет;
- причина: generic-подъём на выдаче Яндекса уходил к контейнеру результатов поиска, который отбрасывался `isPageLevelElement` / `isContentContainer`.

## Изменения версии 1.1.4

### Content scripts

1. **Text-based hiding: только лейблы.**
- `isStandaloneLabel` — скрываем, только если весь текст элемента является маркером («Реклама», «Реклама 18+», «Рекламное объявление»); «Это реклама» и текст статьи с этим словом не скрываются;
- `isNoHideZone` — не трогаем `input`, `textarea`, `contenteditable`, `[role=textbox|combobox|search|listbox|option]` и `form`;
- `TEXT_BLOCK_TAGS` — не скрываем `P`, `ARTICLE`, `H1`–`H6`, `LI`, `BLOCKQUOTE`, `PRE`, `CODE`, `TD`, `TH`;
- `isVisibleElement` — невидимые элементы (`visibility: hidden`, `opacity: 0`, нулевой размер, за пределами экрана, `aria-hidden`) не скрываются: это mirror-дивы авторазмера textarea;
- `isRotatedAdLabel` — считает `childNodes`, а не `children`: Mail.ru режет лейбл как `<div>амалк</div>Рекла<div>ма</div>`. Все непустые куски ≤ 6 символов, в тексте ищется корень «рекл»;
- `isJunkPrefixedLabel` — лейблы вида «амалкереклама» (мусорный префикс + целое «реклама»); скрываются только при наличии известного контейнера `.sc-1v5ykgi` / `.sc-1ymix5g`;
- для target и родителей в `findRotatedContainer` проверяется наличие no-hide зон.

## Изменения версии 1.1.3

### Content scripts

1. **Яндекс Маркет.**
- на `market.yandex.*` text-based hiding отключён (`TEXT_HIDING_DISABLED_HOSTS`): лейбл «Реклама» стоит в карточках товара, и скрывалась обёртка изображения;
- реклама Маркета режется DNR и domain-селекторами по `data-apiary-widget-name`.

2. **VK Video: правая колонка рекомендаций.**
- на `vkvideo.ru` text-based hiding отключён: лейбл «Реклама» в рекомендациях скрывал всю колонку с другими видео;
- общий `isContentContainer` не даёт скрывать контейнеры с ≥ 8 ссылками или ≥ 4 картинками.

## Изменения версии 1.1.2

### Content scripts

1. **VK Video: плеер в открытом shadow DOM.**
- text-based hiding не скрывает контейнеры, содержащие `<video>` в shadow root;
- рекурсивный обход вложенных shadow root (`collectShadowHosts`, `shadowHasPlayer`);
- `containsShadowHost` — не скрываем поддеревья с shadow host: это VKUI layout, а не рекламная карточка;
- `isPageLevelElement` — не скрываем элементы ≥ 80% высоты и ≥ 40% ширины окна;
- `hiddenByUs` + `unhideAncestorsOfPlayer` — снимаем `display` с предков, если плеер смонтировался позже;
- из `cosmetic-manual.css` убраны VK-правила с `:has(video)`: `:has()` не видит shadow DOM.

2. **Тогл.**
- `domain-cosmetic.js` проверяет `enabled`; при `false` не запускаются text hiding, observer и авто-скип.

3. **`refreshSelectors`.**
- URL помечается обработанным только после успешного ответа service worker, при ошибке — повтор через 1 с.

## Изменения версии 1.1.0

### Конвертер

1. **Устранено дублирование `||domain^` между этапом 1 и этапом 3.**
- `selectSimpleRules` теперь явно исключает `$` (`!r.includes("$")`).
- `selectPathRules` теперь исключает `||` (`!r.startsWith("||")`).
- Раньше правило `||example.com^` попадало и в simple, и в path, создавая два одинаковых DNR-правила.
- Результат: этап 3 уменьшился с ~15 000 до 566 правил (остались только настоящие path-правила).

2. **Пересчитаны квоты конвертера.**
- Было: STAGE_2=5000, STAGE_3=15000, STAGE_1=8500, EXCEPTIONS=1500.
- Стало: STAGE_2=5200, STAGE_3=1000, STAGE_1=22300, EXCEPTIONS=1500.
- Итог: 27 000 блокирующих + 1 034 allow = 28 034 из 30 000 (93.4%).
- Раньше этап 1 (simple) резался с 50 038 до 8 500 (83% потерь). Теперь — до 22 300 (55% потерь).

3. **Добавлены синонимы модификаторов в `RESOURCE_TYPE_MAP`.**
- `xhr` → `xmlhttprequest`.
- `object`, `object-subrequest` → `object`.

4. **Расширен `UNSUPPORTED_MODIFIERS`.**
- Добавлены: `important`, `badfilter`, `match-case`, `rewrite`, `redirect`, `redirect-rule`, `denyallow`, `header`, `method`, `to`, `from`, `inline-script`, `inline-font`.
- Проверка идёт по `baseName` — части до знака `=` (для `csp=...`, `redirect=...`, `denyallow=...`).

5. **Неизвестные модификаторы теперь отбрасывают правило целиком.**
- Раньше молча игнорировались, правило конвертировалось без них — становилось шире задуманного.
- Теперь `parseModifiers` возвращает `unsupported: true` и правило пропускается.

6. **Regexp-правила AdGuard/uBlock отсеиваются до парсинга.**
- В `modifierRulesToDnr` добавлена проверка `if (easyRule.startsWith("/"))`.
- Раньше `lastIndexOf("$")` мог найти `$` внутри regexp (например, `/foo$/`) и ошибочно решить, что это модификаторы.
- По итогам: `[stage 2] ... regexp: 1025`.

7. **`parseModifiers` обрабатывает `$first-party` / `$1p` / `$~first-party` / `$~1p`.**
- Маппинг: `firstParty = isNegated`, `~first-party` = `thirdParty`.

### Runtime / storage

8. **`assertIdRanges` в `limiter.js` расширен.**
- Проверяет все шесть пар: manual↔dynamic, manual↔ads, dynamic↔ads, ads↔exceptions, dynamic↔exceptions, manual↔exceptions.
- Добавлены константы `DYN_RULE_ID_BASE = 200`, `DYN_RULE_ID_MAX = 9999`, `MANUAL_ID_MAX = 199`.
- Лог `[id-check]` теперь показывает все четыре диапазона.
- `MANUAL_ID_MAX = 199` — это запас, а не фактический размер `manual.json` (там сейчас 6 правил).

9. **`syncWhitelistRules` фильтрует по диапазону id.**
- Удаляет только правила в `DYN_RULE_ID_BASE..DYN_RULE_ID_MAX`.
- Диагностика `foreignIds` — предупреждает, если в `getDynamicRules` есть правила вне диапазона.
- Логи честнее: `old whitelist rules` вместо `old dynamic rules`.

10. **Убран `activeTab` из `manifest.json`.**
- Он не использовался: `<all_urls>` в `host_permissions` даёт всё, что нужно.
- Чтение `tab.url` в popup работает через `<all_urls>`.

11. **Исправлен комментарий в `cosmetic-injector.js` про фреймы.**
- `onCommitted` срабатывает для каждого фрейма, `frameId !== 0` отбрасывает sub_frame.
- `insertCSS` без `frameIds` вставляет CSS во ВСЕ фреймы вкладки за один вызов.
- Content scripts в iframe не работают (нет `all_frames: true`) — осознанное ограничение.

### Content scripts

12. **`auto-skip.js` — убран широкий селектор `[class*="skip-ad"]`.**
- Он матчил любой элемент с подстрокой в class (`skip-ads-info`, `no-skip-ad`, `dont-skip-ad`, `skip-ad-signup`) и кликал по нему каждые 500 мс на всех сайтах.
- Заменён на точечные селекторы для VK Video, RuTube, YouTube.

13. **`auto-skip.js` — добавлена функция `isClickableButton`.**
- Клик выполняется только по `button` / `a` / `input[type=button|submit]`.
- Проверка видимости через `getBoundingClientRect()` (width/height > 0).
- `disabled` проверяется.

14. **`auto-skip.js` — `periodicCheck` и `trySkipButton` ограничены хостами.**
- Добавлены константы `YT_HOSTS`, `RUTUBE_HOSTS`, функции `isYoutubeHost`, `isRutubeHost`.
- `startAutoSkip` разветвлён по хостам: YouTube — observer + интервалы, RuTube — клик + mute, VK — только клик.
- На остальных сайтах страховочные интервалы не работают.

15. **`auto-skip.js` — `attachObserverToPlayer` сбрасывает `wasAdShowing` при смене плеера.**
- Если `currentPlayer !== player` и `wasAdShowing = true` — сбрасываем флаг и скрываем оверлей.
- Затем `check()` на новом плеере корректно стартует рекламу с нуля.

16. **`ad-markers.js` — защита от ложных срабатываний (RuTube-фикс).**
- `MAX_CONTAINER_CHILDREN = 20` — `findRotatedContainer` не поднимается к layout-контейнерам с > 20 детьми.
- `findRotatedContainer` и `findAdContainer` возвращают `null`, если не нашли подходящий контейнер (раньше возвращали `el`).
- Добавлена `isStructuralElement` — не скрываем `html`, `body`, `main`, `header`, `footer`, `nav`, `#root`, `#app`.
- Добавлена `isInsidePlayer` — не скрываем элементы внутри `<video>`, `[class*="player"]`, `#movie_player`, `[class*="player-container"]` и т.п.
- `hideAdInElement` проверяет `el` и `target` на структурность и нахождение внутри плеера.

  Причина: на главной RuTube лейбл «Реклама» внутри блока AdFox заставлял `findRotatedContainer` подниматься до `section.wdp-wrapper-module__wdp-common-wrapper`, и скрывалась вся страница.

### Известные ограничения (не решены)

- **Конвертер:** не поддерживаются модификаторы:
- `$redirect`, `$redirect-rule`, `$rewrite` (нужны файлы-заглушки и `web_accessible_resources`).
- `$denyallow` (нет прямого аналога в DNR).
- `$csp`, `$removeparam`, `$replace`, `$header`, `$method`, `$to`, `$from`, `$important`, `$badfilter`, `$match-case`, `$inline-script`, `$inline-font`.
- `$generichide`, `$elemhide`, `$genericblock` (управляют применением generic-правил).
- Regexp-правила `/regexp/$mods` — 1025 штук отсеиваются.
- Regexp-исключения `@@/regexp/$mods` — отсеиваются.
- Правила вида `||example.com/path` (без `^`, без `$`) теряются.

- **Content scripts** не работают в iframe (нет `all_frames: true`) — осознанное ограничение.
- **Закрытый shadow root** (`attachShadow({ mode: "closed" })`) content script не видит: `<video>` и player-селекторы внутри него не обнаруживаются. Открытые shadow root (VKUI, VK Video) обходятся.
- **Popup:** выбранный язык не меняет `name`/`description` в Chrome — они выбираются по языку браузера через `_locales`. Сейчас `_locales` есть для `en`, `ru`, `hy`; для остальных языков описание расширения — английский fallback.
- **Не поддерживается `:has-text(...)`** (uBlock) — 287 правил в EasyList.

## Ключевые архитектурные решения

### Service worker (MV3)
- Засыпает через 30 секунд без событий.
- Состояние не хранить в переменных — только в chrome.storage.
- Слушатели регистрируются синхронно на верхнем уровне.
- Префикс логов: [erst_dev_adblocker] (единый, во всех файлах).

### DNR (Declarative Net Request)
- Три ruleset'а: ads_ruleset, exceptions_ruleset, manual_ruleset. У всех enabled: false в манифесте, включаются программно через updateEnabledRulesets.
- Chrome использует единое пространство id для статических и динамических правил:
  - manual.json:        id 1..100
  - dynamic (whitelist): id 200..9999 (DYN_RULE_ID_BASE = 200)
  - ads.json:           id 10000+
  - exceptions.json:    id 100000+
  - 101..199 — запас на расширение manual.json (MANUAL_ID_MAX = 199).
- Лимит статических: 30 000 суммарно.
- Лимит динамических: 5000.
- main_frame НИКОГДА не указывается в resourceTypes блокирующих правил.
- hostNotEquals в UrlFilter у webNavigation НЕ поддерживается — исключение хостов делается вручную в handleCommitted.
- Диапазоны id проверяются в limiter.js → assertIdRanges() (все шесть пар).
- MANUAL_ID_MAX = 199 — это запас, а не фактический размер manual.json (там сейчас 6 правил). Если manual.json вырастет выше 199 — придётся поднять DYN_RULE_ID_BASE в shared/storage.js.

### Whitelist (динамические allowAllRequests)
- shared/storage.js — syncWhitelistRules создаёт по одному правилу allowAllRequests (priority 100) на каждый whitelisted домен.
- Диапазон id динамических: 200..9999.
- Удаление и добавление — двумя отдельными вызовами updateDynamicRules (Chrome не гарантирует порядок в одном вызове).
- Удаляются только правила в диапазоне DYN_RULE_ID_BASE..DYN_RULE_ID_MAX.
- Мьютекс в syncDnrState через syncInFlight — защита от параллельных вызовов.
- syncDnrState вызывается только из service_worker.js (при старте и через storage.onChanged). НЕ вызывается из message-handler.

### Content scripts (не ESM)
- Не поддерживают import/export. Подключаются массивом в manifest.json, выполняются последовательно в общем контексте.
- Порядок критичен:
  1. state.js — общий объект
  2. inject-css.js — запрос селекторов + style
  3. spa.js — SPA-навигация
  4. ad-markers.js — text-based hiding
  5. observer.js — MutationObserver (использует hideAdInElement из ad-markers.js)
  6. auto-skip.js — авто-скип
  7. domain-cosmetic.js — точка входа IIFE
- run_at: "document_start".
- all_frames НЕ указан — скрипты работают только в main_frame.
- domain-cosmetic.js читает enabled из chrome.storage.local: при false не запускаются ни text hiding, ни observer, ни auto-skip. Изменение тогла применяется после перезагрузки страницы.
- refreshSelectors (inject-css.js) помечает URL обработанным только после успешного ответа service worker. При null — повтор через 1 с, state.currentUrl не меняется.

### Детектор рекламы в content

Основной вход — hideAdInElement(el, logPrefix) в ad-markers.js.

Защита от ложных срабатываний:
- isStructuralElement(el) — не скрываем html, body, main, header, footer, nav, #root, #app, #react-root, #__next и любой shadow-хост.
- isInsidePlayer(el) — не скрываем элементы внутри video, [class*="player"], #movie_player, [class*="player-container"], .html5-video-player, [data-testid='video-player']; поднимается через границы shadow root.
- containsPlayerDeep(el) — не скрываем контейнер, содержащий плеер, в том числе внутри открытого shadow DOM (VK Video).
- containsShadowHost(el) — не скрываем поддерево, в котором есть shadow host: это компоненты и layout VKUI, а не рекламная карточка.
- MAX_CONTAINER_CHILDREN = 20 — findRotatedContainer не поднимается к layout-контейнерам с > 20 детей.
- isPageLevelElement(el) — не скрываем элемент ≥ 80% высоты и ≥ 40% ширины окна (layout-обёртки).
- isContentContainer(el) — не скрываем контейнеры с ≥ 8 ссылками или ≥ 4 картинками (навигация, рекомендации, сетки).
- text-based hiding отключён на market.yandex.* и vkvideo.ru (TEXT_HIDING_DISABLED_HOSTS).
- findAdContainer и findRotatedContainer возвращают null, если не нашли подходящий контейнер.

Скрытые элементы запоминаются в hiddenByUs. Если в shadow-хосте появляется <video>, unhideAncestorsOfPlayer снимает display со всех скрытых нами предков. MutationObserver не видит мутации внутри shadow root, поэтому раз в секунду выполняется scanForPlayerShadowHosts — только пока hiddenByUs не пуст.

Два типа маркеров:

1. Обычный матчер (matchMarker):
- схлопывает el.textContent (lowercase, без пробелов);
- проверяет includes() по списку AD_TEXT_MARKERS:
  реклама, реклам, промо, спонсор, рекламный, партнёрскийматериал,
  advertisement, sponsored, объявлениескрыто, рекламноеобъявление;
- ограничения: MIN_CANDIDATE_TEXT_LENGTH = 4,
  MAX_CANDIDATE_TEXT_LENGTH = 200.

2. Структурный детектор разбитого лейбла (isRotatedAdLabel):
- Mail.ru и VK Ads разбивают слово «реклама» на куски и
  вклинивают посторонние буквы внутрь слова
  («амалк» + «рекла» + «ер» + «ма» → «амалкреклаерма»);
- признак: схлопнутый текст 5..20 символов, содержит
  р…к…м…а по порядку, 3+ дочерних элемента, у большинства
  детей текст 1..5 символов.
- отсекает ложные срабатывания на «Убрать рекламу за 1₽»,
  «О рекламодателе», обычные посты.
- использует el.children (только Element-узлы), не el.childNodes —
  куски текста всегда обёрнуты в теги.

Подъём к контейнеру:

- Для самостоятельного лейбла («Реклама», «Реклама 18+») сначала
  ищется явный рекламный контейнер (findAdContainerStrict), и только
  если его нет — generic-подъём по родителям. Стабильные id/class
  надёжнее: generic-подъём на выдаче Яндекса уходил к контейнеру
  результатов поиска, который отбрасывался проверками
  isPageLevelElement / isContentContainer.

- findAdContainer(el):
  - по семантическим селекторам [id^="trg-b-"],
    [id^="b"][data-rendertype="native"], [id^="yandex_ad_R-"],
    [data-testid$="-ad"], [data-testid*="-ad-"];
  - по AdFox-якорям [class*="AdfoxBanner_root"],
    [class*="AdfoxBanner_banner"], [id^="adfox-serp"],
    [id^="adfox-"], [id^="adfox_"];
  - по Dzen-якорям [data-new-adtune="true"],
    [data-cv3dnq1w-click="imageGallery"], [data-cv3dnq1w-click="title"];
  - по Mail.ru-классам .sc-1v5ykgi, .sc-1ymix5g;
  - по inline-стилю width: 160px (слот Mail.ru);
  - иначе — сам el.

- findRotatedContainer(el):
  - поднимается до родителя с 2+ детьми,
    у которых textContent > 20 символов;
  - не поднимается выше MAX_CONTAINER_CHILDREN = 20 детей;
  - используется для коротких маркеров (≤ 20 символов)
    и для isRotatedAdLabel.

Установка display: none — идемпотентна, повторная запись
не меняет inline-стиль. Элемент попадает в hiddenByUs, чтобы
его можно было разскрыть при появлении плеера.

### Локализация

- `_locales/{en,ru,hy}/messages.json` — только `appName` и `appDescription`. Chrome выбирает локаль по языку интерфейса браузера, fallback — `default_locale: "en"`. Смена языка в popup на эти строки не влияет.
- Popup — собственный каталог `shared/locales/`: `east.js`, `central.js`, `west.js`, `index.js`; 44 языка по 23 ключа. `chrome.i18n` не переключает язык на лету.
- Выбранный язык хранится в `chrome.storage.local` (`language`: код из каталога). Если ключа нет, `detectLanguage()` берёт язык браузера (`chrome.i18n.getUILanguage()`), иначе английский.
- Статические тексты размечены `data-i18n`, `data-i18n-title`, `data-i18n-aria-label`, `data-i18n-placeholder`; `applyI18n()` заполняет их и выставляет `<html lang>`.
- Динамические тексты (лейбл тогла, кнопка добавления, title кнопок удаления, письмо) идут через `t(key, substitutions)`.
- Выбор языка — searchable select: кнопка с флагом и названием, панель с поиском и списком. Поиск идёт по нативному названию, английскому названию и коду, без учёта диакритики («espanol» → Español).
- Флаги — SVG в `popup/flags/<код страны>.svg` из flag-icons 7.2.3 (MIT). Английский использует `gb.svg`.
- Названия языков в списке нативные: «Русский», «English», «Հայերեն» — не переводятся.
- В начале списка: русский, английский, армянский; остальные по английскому названию.

### Popup (ESM, type="module")
- import { MSG } from "../shared/messages.js" работает.
- import { ... } from "../shared/i18n.js" — локализация.
- getElementById (не $, не byId).
- Два экрана: `#/` — главный, `#/settings` — настройки. Переключение через `location.hash` и `hashchange`; `showRoute()` прячет `#view-main` / `#view-settings`.
- Кнопка настроек (⚙) в шапке, назад — в экране настроек.
- В настройках — searchable select языка (кнопка + абсолютная панель с поиском). `#view-settings { min-height: 300px }` держит высоту под панель; главный экран — по контенту, без пустоты внизу.
- Кнопка «Перезагрузить страницу» появляется после действий (свитчер, whitelist).
- loadVersion — синхронная.

### Сообщения (shared/messages.js)
Формат: <откуда>→<куда>:<действие>
- cs→sw:getDomainSelectors — content script просит селекторы
- cs→sw:getDomainExclude — content script просит исключения
- popup→sw:getState
- popup→sw:setEnabled
- popup→sw:whitelistAdd
- popup→sw:whitelistRemove
- isValidMessageType — проверка через Set.

### Конвертер

- ESM ("type": "module" в package.json).
- Команды: npm run convert, npm run icons, npm run build, npm run screenshots.
- Квоты (сумма ≤ 30000):
  - Этап 2 ($-модификаторы): 5200
  - Этап 3 (|http/path): 1000
  - Этап 1 (||domain^): 22300
  - Исключения: 1500
- jszip вместо archiver.
- sharp для иконок и ресайза.
- Конвертер не трогает manual.json и cosmetic-manual.css.

### Этапы конвертации (select + ToDnr)

Этап 1 (simple): `||domain^` без `$`.
- selectSimpleRules: `startsWith("||") && endsWith("^") && !includes("$")`.
- simpleRulesToDnr: block, priority 1, resourceTypes = ALL_RESOURCE_TYPES.

Этап 2 (modifiers): правила с `$`.
- selectModifierRules: `includes("$")`.
- modifierRulesToDnr: пропускает regexp (`startsWith("/")`).
- parseModifiers: см. выше.

Этап 3 (path): `|http://` и `/path` без `||` и без `$`.
- selectPathRules: `(startsWith("|") || startsWith("/")) && !startsWith("||") && !includes("$")`.
- pathRulesToDnr: block, priority 1, resourceTypes = ALL_RESOURCE_TYPES.

Этап 5 (exceptions): `@@...`.
- selectExceptionRules: уникальные.
- exceptionRulesToDnr: allow, priority 2.
- Пропускает regexp-исключения (`startsWith("@@/")`).

### Конвертация $domain=
Модификатор $domain=a|b|~c|~d конвертируется в initiatorDomains
и excludedInitiatorDomains DNR-правила.

### Фильтр extended CSS
В cosmetic.js отбрасываются правила с :style(), :remove(), :upward(),
:matches-path(), :matches-css(), :matches-attr(), :contains(), :xpath(),
:-abp-properties(), +js(). По итогам 1.1.0 отфильтровано 1136 правил.

### Иконки
- icon-source.png — полная иконка с текстом.
- icon-source-small.png — только щит с буквой «E».
- 128 и store-icon-128 — из полной.
- 16, 32, 48 — из small.
- store-icon-128 = 128×128 с внутренней 96×96.

## Ручные правила (manual.json)

Файл rules/manual.json — 6 правил, диапазон id 1..100, не перезаписывается конвертером.

- id 1: block ||mradx.net^
- id 2: block ||ads.vk.com^
- id 3: block ||ad.mail.ru^
- id 4: block ||an.yandex.ru^
- id 5: block ||yandex.ru/an/
- id 6: allow ||r.mradx.net/imgs/ (priority 3)

resourceTypes: script, image, xmlhttprequest, sub_frame, media, ping, other (для сетевых endpoint'ов рекламных систем).
Для id 6 — resourceTypes: ["image"], priority: 3.

## Ручная косметика (cosmetic-manual.css)

Не перезаписывается конвертером. Текущие блоки:

- AdFox (Яндекс) — [data-role^="fox-tail"], [data-role^="fox::"], div.fox-tail, div[class*="fox-tail"].
- AdFox — верхний баннер на выдаче Яндекса — [class*="AdfoxBanner_root"], [class*="AdfoxBanner_banner"], [id^="adfox-serp"].
- Яндекс.Директ / РСЯ — div[id^="yandex_ad"], div[id^="yandex_rtb"], div[class^="yandex_ad"], [id^="ya_partner_R-A-"].
- Яндекс — РСЯ (карты, поиск, сервисы) — [id*="R-I-"], [data-r-i].
- Яндекс — РСЯ (гарантийные показы на поиске) — [data-layout-part="cr"], [id^="advRsyaReact_"], [id^="advRsyaReact_rsya-guarantee"].
- Google Publisher Tag — div[id^="div-gpt-ad"], div[id^="gpt-passback"].
- Mail.ru — [isfullscreen="true"], [id^="trg-b-"].
- Mail.ru — рекламные блоки через data-mnemo.
- Mail.ru VK Ads — [id*="R-I-"], [data-r-i].
- Dzen — [data-testid$="-ad"], [data-testid*="-ad-"], [id^="auto-slide-ad"], [id*="-ad-item_"], [class*="auto-slide-ad"], [class*="dzen-desktop--auto-slide-ad"], a.yrw-url[href*="yandex.ru/an/count"].
- ВК Видео — [class*="rb-adman-ad-actions"]. Контейнеры ad-container / ads-container через CSS не скрываются: плеер в shadow DOM, :has(video) его не видит, правило скрывало плеер вместе со звуком. Остатки рекламы режет DNR и авто-скип.
- Яндекс.Погода — [class*="AppMoney_container"], [class*="AppMoney_wrap"], [class*="AppMoneySidebar"], [id^="money-main-"], [data-name="adWrapper"].
- RuTube — .wdp-feed-top-ad-module__ad-banner, .r-ad-sdk-adfox-wrapper, [id^="ra_"].
- RuTube — видео-реклама (AdFox SDK) — [data-testid="advert"], .advert-module__advert___tQh3l, .yandex-advert-module__SDKWrapper___WMfXh, [id="raichu_yasdk_container"], [data-testid="advert-video"], .raichu-adver-tag, .advert-timeline-module__timeline___banQn, .advert-skip-module__container___aDiIw.

## Обратная связь (popup)

- Только mailto: и «Скопировать email».
- Кнопка «Поддержать» убрана.
- Когда появится URL в Chrome Web Store — добавить «Оставить отзыв».

## Стиль работы пользователя

- Не писать философию. Только код и что делать.
- Всегда давать полный файл, а не «замени строчку».
- Не писать «по-человечески» в коде/доке.
- Не писать статус разработки в доке. Только факты о системе.
- Без двойных звёздочек в чате (в доке — можно).
- Пользователь сам правит byId/getElementById и префиксы логов.
- Пользователь сам ведёт версионность.

## Лимиты и квоты

### Квоты конвертера

Сумма квот должна быть ≤ 30 000 (лимит Chrome на статические DNR-правила):

- Этап 2 ($-модификаторы): 5 200
- Этап 3 (|http / /path): 1 000
- Этап 1 (||domain^): 22 300
- Исключения (@@): 1 500
- Итого: 30 000

По итогам 1.1.0:
- блокирующих правил: 27 000
- allow-правил: 1 034
- итого: 28 034 (93.4% лимита)

### Проверка диапазонов id

В limiter.js → assertIdRanges() проверяются все шесть пар:

- manual.json:       1..199
- динамические:      200..9999
- ads.json:          10000..
- exceptions.json:   100000..

Если любая пара пересекается — конвертер падает с понятной ошибкой.

MANUAL_ID_MAX = 199 — это запас, а не фактический размер manual.json
(там сейчас 6 правил). Если manual.json вырастет выше 199 — придётся
поднять DYN_RULE_ID_BASE в shared/storage.js и синхронизировать
константы в обоих файлах.

## Заметки по прошлым проблемам (решены)

- Rule with id N does not have a unique ID — Chrome смешивает пространства id статических и динамических правил. Решено разделением диапазонов.
- MAX_GETMATCHEDRULES_CALLS_PER_INTERVAL quota — отказ от getMatchedRules для счётчика.
- Race condition в syncDnrState — мьютекс + единый источник вызовов (storage.onChanged).
- insertCSS failed: The extensions gallery cannot be scripted — FORBIDDEN_HOSTS = [chrome.google.com, chromewebstore.google.com].
- archiver is not a function — перешли на jszip.
- ESM в конвертере — import/export вместо require.
- __dirname в ESM — через fileURLToPath(import.meta.url).
- Service worker registration failed. Status code: 15 — был из-за hostNotEquals внутри schemes в webNavigation UrlFilter.
- Mail.ru мигание рекламы — решено: структурный детектор разбитого лейбла.
- YouTube авто-скип — работает.
- Whiteline-логотип Mail.ru — добавлено allow-правило в rules/manual.json (id 6).
- Дублирование ||domain^ между этапом 1 и 3 — устранено.
- Квоты конвертера не соответствовали содержимому списков — пересчитаны.
- activeTab + <all_urls> — activeTab убран.
- RuTube главная страница скрывалась — findRotatedContainer больше не поднимается к layout-контейнерам, добавлены isStructuralElement и isInsidePlayer.
- RuTube видео-реклама глушила основной плеер — селектор [id^="raichu"] video матчил <video data-testid="video"> внутри raichuContainerWithPlayer_... и ставил его на паузу. Убран из RUTUBE_AD_VIDEO_SELECTORS; muteAdVideos теперь только mute + playbackRate по точечным селекторам advert-video и raichu-adver-tag.
- VK Video: пропадал <video> при играющем звуке — плеер в открытом shadow DOM, text-marker скрывал VKUI-обёртки до гидратации. Решено: рекурсивный обход shadow root, containsShadowHost, isPageLevelElement, hiddenByUs + unhideAncestorsOfPlayer.
- Тогл не выключал text hiding — content scripts не проверяли enabled. Решено проверкой chrome.storage.local в domain-cosmetic.js.
- refreshSelectors помечал URL обработанным до ответа service worker — при ошибке селекторы не запрашивались повторно. Решено: отметка после успеха + повтор через 1 с.
- Яндекс.Поиск: верхний AdFox-баннер не скрывался. Лейбл «Реклама» стоит внутри ссылки баннера; findRotatedContainer поднимался к контейнеру выдачи, а тот отбрасывался проверками isPageLevelElement / isContentContainer — не скрывалось ничего, включая сам баннер. Решено: AdFox-селекторы в cosmetic-manual.css и AD_CONTAINER_SELECTORS, для самостоятельного лейбла сначала ищется явный контейнер.

### Отложено на 1.2.0

1. **Поддержка :has-text(...) (uBlock).** ~287 правил не обрабатываются.
2. **Разделение DNR-набора на core/extra.** 28 034 из 30 000 (93.4%), запас есть, но небольшой.
3. **Порт на Firefox.** Требует отдельной ветки.
4. **TypeScript, Prettier, ESLint.**
5. **Поддержка $redirect / $redirect-rule / $rewrite.** Требует файлов-заглушек и web_accessible_resources.
6. **Поддержка regexp-правил (/regexp/$mods).** 1025 правил отсеиваются.
7. **Поддержка ||example.com/path.** Правила без ^ и без $ теряются.
8. **Поддержка $denyallow.** Нет прямого аналога в DNR.
