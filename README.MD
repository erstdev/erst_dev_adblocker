# erst_dev_adblocker

Блокировщик рекламы для браузеров на Chromium (Chrome, Edge, Opera, Brave, Яндекс.Браузер, Vivaldi) на Manifest V3.

## Что это

Расширение блокирует рекламные и трекерные запросы на уровне сети (DNR), скрывает баннеры через CSS, пропускает рекламу в видео. Работает на всех сайтах, с возможностью отключения на отдельных сайтах через белый список.

## Требования

- Node.js 18+ (для сборки и конвертера).
- Chrome 105+ (для работы).
- Chromium-браузер для тестирования: Chrome, Edge, Opera, Brave, Яндекс.Браузер, Vivaldi.

## Быстрый старт

```bash
# Установить зависимости
npm install

# Сконвертировать списки правил (первый раз или после обновления EasyList)
npm run convert

# Сгенерировать иконки (один раз, из исходников в корне)
npm run icons

# Собрать ZIP для публикации
npm run build
```

После этого в корне появится `erst_dev_adblocker-<version>.zip`, а в `dist/` — распакованная сборка.

## Порядок команд

`convert` → `icons` → `build`. Первые две готовят артефакты (правила и иконки), третья упаковывает всё в ZIP. Если пропустить `convert` — в сборку попадут старые правила. Если пропустить `icons` — Chrome не установит расширение.

## Скрипты

- `npm run convert` — конвертирует EasyList и RU AdList в формат DNR (`rules/ads.json`, `rules/exceptions.json`), генерирует `content/cosmetic.css`, `rules/cosmetic-map.json` и `rules/cosmetic-exclude.json`.
- `npm run icons` — нарезает иконки из `icon-source.png` и `icon-source-small.png` в `icons/` (16/32/48/128 + `store-icon-128`).
- `npm run build` — собирает ZIP для Chrome Web Store через `jszip`. Кладёт ZIP в корень, распакованную сборку — в `dist/`.
- `npm run screenshots` — ресайзит PNG из `store-assets/raw/` до 1280×800 и кладёт в `store-assets/`. Для Chrome Web Store.

## Установка в браузер (режим разработчика)

1. Открыть `chrome://extensions`.
2. Включить «Режим разработчика» (переключатель справа вверху).
3. Нажать «Загрузить распакованное расширение».
4. Выбрать папку `dist/` (после `npm run build`) или корень проекта (если `dist/` нет).

## Структура проекта

```
manifest.json            — манифест MV3
_locales/                — i18n: name и description (en, ru, hy)
icons/                   — иконки (генерируются)
store-assets/            — скриншоты и промо для CWS
docs/                    — 11 глав документации: архитектура, код, решения

background/              — service worker
  service_worker.js      — оркестратор
  lib/                   — модули SW: cosmetic-injector, cosmetic-map, message-handler

content/                 — content scripts (не ESM, порядок в manifest.json)
  domain-cosmetic.js     — точка входа
  cosmetic.css           — генерируется
  cosmetic-manual.css    — ручные правила
  lib/                   — state, inject-css, spa, ad-markers, observer, auto-skip

popup/                   — popup (ESM)
  popup.html, popup.css, popup.js
  flags/                 — SVG-флаги языков (flag-icons, MIT)

shared/                  — общий код
  messages.js            — типы сообщений
  storage.js             — chrome.storage + DNR-синхронизация
  i18n.js                — локализация popup (44 языка)
  locales/               — каталог: east.js, central.js, west.js, index.js
  utils.js               — extractHostname

rules/                   — DNR-правила и карты косметики
  ads.json               — блокирующие (генерируется)
  exceptions.json        — allow (генерируется)
  manual.json            — ручные правила (не перезаписывается)
  cosmetic-map.json      — domain-specific селекторы (генерируется)
  cosmetic-exclude.json  — исключения #@# (генерируется)

lists/                   — исходники EasyList и RU AdList (не в ZIP)
tools/                   — Node.js: конвертер, сборка, иконки, скриншоты (не в ZIP)
```

## Как это работает

- **DNR (Declarative Net Request).** Три ruleset'а: `ads_ruleset`, `exceptions_ruleset`, `manual_ruleset`. Все три выключены в манифесте и включаются программно при старте service worker. Блокирующие правила — 27 000, allow — 1 034.
- **Косметика.** Общий CSS (14 116 селекторов) вставляется через `chrome.scripting.insertCSS` при навигации. Domain-specific селекторы (29 512 для 12 510 доменов) отдаются content script через сообщение по текущему домену.
- **Исключения косметики (`#@#`).** Отдельный файл `rules/cosmetic-exclude.json` (706 доменов, 872 селектора). Content script вставляет второй `<style>` с `display: revert !important`, который перекрывает скрытие по правилам EasyList.
- **Whitelist.** Список доменов, где блокировка не работает. Реализован через динамические правила `allowAllRequests` с priority 100. Управляется из popup.
- **Локализация popup.** 44 языка: 24 языка ЕС, страны бывшего СССР (кроме украинского) и другие национальные языки Европы. Язык выбирается через searchable select с флагами в настройках попапа (`#/settings`) и хранится в `chrome.storage.local`; `name` и `description` в Chrome выбираются по языку браузера через `_locales/`.
- **Авто-скип видео.** Работает на YouTube (ускорение 16x + mute + клик + оверлей), VK Video (клик по кнопке «Пропустить»), RuTube (клик по кнопке + mute + ускорение рекламного `<video>`).
- **Text-based hiding.** Скрытие рекламных блоков по текстовым маркерам («реклама», «реклам», «промо», «спонсор»), по структуре (разбитый лейбл Mail.ru) и по стабильным атрибутам рекламных площадок Dzen (`data-new-adtune`, `data-cv3dnq1w-click`). Не скрывает контейнеры с плеером и shadow host'ы.

## Лимиты Chrome

- 30 000 статических DNR-правил суммарно. У нас 28 034 (93.4%).
- 5 000 динамических DNR-правил. Используется под whitelist (диапазон id 200..9999).
- id статических и динамических правил должны быть уникальны в общем пространстве. Диапазоны: `manual.json` — 1..100 (запас до 199), dynamic — 200..9999, `ads.json` — 10000+, `exceptions.json` — 100000+. Проверяется в `limiter.js` → `assertIdRanges()`.

## Известные ограничения

- Не поддерживаются uBlock-специфичные селекторы `:has-text(...)` (287 правил в EasyList). Реализация требует отдельного content-script движка, отложена в 1.2.0.
- Не поддерживается extended-синтаксис AdGuard/uBlock/ABP (`:style()`, `:remove()`, `:upward()`, `:matches-path()`, `:matches-css()`, `:matches-attr()`, `:contains()`, `:xpath()`, `:-abp-properties()`, `+js()`). Эти правила отбрасываются на этапе конвертации.
- Не поддерживаются модификаторы `$redirect`, `$redirect-rule`, `$rewrite`, `$denyallow`, `$csp`, `$removeparam`, `$replace`, `$header`, `$method`, `$to`, `$from`, `$important`, `$badfilter`, `$match-case`, `$inline-script`, `$inline-font`, `$generichide`, `$elemhide`, `$genericblock`. Правила с ними отбрасываются целиком.
- Regexp-правила `/regexp/$mods` и regexp-исключения `@@/regexp/$mods` — 1025 штук отсеиваются.
- Правила вида `||example.com/path` (без `^`, без `$`) теряются.
- Content scripts не выполняются в iframe (`all_frames` не указан).
- Закрытый shadow root (`mode: "closed"`) content script не видит: элементы внутри не обнаруживаются.
- Расширение не работает на `file://`, `ftp://` и внутренних страницах браузера.

## Документация

- `docs/` — 11 глав: введение, архитектура, манифест, service worker, content scripts, popup, shared, конвертер, whitelist, глоссарий, FAQ.
- `CHANGELOG.md` — история версий.
- `PRIVACY.md` — приватная политика.
- `CONTEXT.md` — контекст проекта для разработки.

## Приватность

Расширение не собирает и не передаёт персональные данные. Все настройки хранятся локально в `chrome.storage.local`. Списки блокировки скачиваются один раз при сборке и упаковываются в архив — расширение не обращается к ним в интернете при работе.

Подробности: [PRIVACY.md](PRIVACY.md) и https://erstdev.github.io/erst_dev_adblocker_privacy/.

## Лицензия

UNLICENSED. Приватный проект.