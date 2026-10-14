# erst_dev_adblocker — контекст проекта

## Что это

Блокировщик рекламы для Chrome (и других Chromium-браузеров: Edge, Opera, Brave, Яндекс.Браузер, Vivaldi). Написан на чистом JavaScript, работает на Manifest V3.

Репозиторий: приватный на GitHub (пользователь: erstdev)
Почта: erst.dev.channel@gmail.com (аккаунт разработчика Chrome Web Store)
Почта для обратной связи в расширении: erst_dev@mail.ru
Приватная политика: https://erstdev.github.io/erst_dev_adblocker_privacy/

## Текущий статус

Версия 1.0.0 опубликована в Chrome Web Store и Opera Addons (29 сентября 2026).
Версия 1.1.0 нужно опубликовать.

## Что уже умеет

- Блокировка рекламных и трекерных запросов через DNR (28 500 блокирующих правил + 1 094 allow).
- Косметика: 14 116 общих CSS-селекторов + 29 515 domain-specific для 12 510 доменов.
- Ручные правила для отдельных сайтов (manual.json):
  - AdFox (Яндекс),
  - РСЯ,
  - Mail.ru / VK Ads,
  - Dzen,
  - ВКонтакте,
  - Яндекс.Карты (через DNR),
  - Яндекс.Поиск (гарантийные показы РСЯ).
- Whitelist — сайты, где блокировка не работает.
- Глобальный вкл/выкл через свитчер в popup.
- Авто-скип рекламы в видео (VK Video, YouTube, RuTube). YouTube работает — ускорение 16x + mute + клик + оверлей «Пропуск рекламы».
- SPA-навигация (pushState, popstate, hashchange).
- MutationObserver для динамической рекламы.
- Text-based hiding (обычные маркеры + структурный детектор разбитого текста).
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
11. 
## Структура проекта

```
adblocker/
├── manifest.json
├── package.json (type: "module")
├── icon-source.png (исходник иконки, 512×512)
├── icon-source-small.png (упрощённая иконка без текста)
├── CHANGELOG.md
├── README.md
├── PRIVACY.md
│
├── _locales/ (i18n: name и description)
│ ├── en/messages.json
│ └── ru/messages.json
│
├── docs/ (11 глав учебника, готовы)
│ ├── 00-INTRO.md
│ ├── 01-ARCHITECTURE.md
│ ├── 02-MANIFEST.md
│ ├── 03-SERVICE-WORKER.md
│ ├── 04-CONTENT-SCRIPTS.md
│ ├── 05-POPUP.md
│ ├── 06-SHARED.md
│ ├── 07-RULES-CONVERTER.md
│ ├── 08-WHITELIST-TOGGLE.md
│ ├── 09-GLOSSARY.md
│ └── 10-FAQ.md
│
├── icons/ (генерируется, 16/32/48/128 + store-icon-128)

│
├── background/ (SERVICE WORKER)
│ ├── service_worker.js (оркестратор)
│ └── lib/
│ ├── cosmetic-injector.js (вставка общего CSS через insertCSS)
│ ├── cosmetic-map.js (загрузка карты domain-селекторов)
│ └── message-handler.js (обработчик сообщений)
├── content/ (CONTENT SCRIPTS)
│ ├── domain-cosmetic.js (точка входа, IIFE)
│ ├── cosmetic.css (генерируется конвертером)
│ ├── cosmetic-manual.css (ручные правила, не перезаписывается)
│ └── lib/
│ ├── state.js (глобальный объект state)
│ ├── inject-css.js (запрос селекторов + вставка style)
│ ├── spa.js (SPA-навигация)
│ ├── ad-markers.js (text-based hiding + структурный детектор)
│ ├── observer.js (MutationObserver, использует hideAdInElement)
│ ├── auto-skip.js (авто-скип рекламы в видео)
│ └── (порядок в manifest.json важен)
│
├── popup/
│ ├── popup.html
│ ├── popup.css
│ └── popup.js (getElementById, не byId)
│
├── shared/
│ ├── messages.js (типы сообщений)
│ └── storage.js (chrome.storage + DNR-синхронизация)
│
├── rules/ (генерируется конвертером, кроме manual.json)
│ ├── ads.json (28 500 блокирующих, id с 10000)
│ ├── exceptions.json (1 094 allow, id с 100000)
│ ├── manual.json (ручные правила, id 1..100)
│ └── cosmetic-map.json (12 510 доменов, 29 515 селекторов)
│
├── lists/ (исходники EasyList, не в ZIP)
│ ├── easylist.txt
│ └── adguard-russian.txt
│
└── tools/ (Node.js, не в ZIP)
├── convert.js (main, оркестратор)
├── build-prod.js (сборка ZIP через jszip)
├── build-icons.js (нарезка иконок через sharp)
├── resize-screenshots.js (ресайз скриншотов до 1280×800)
└── lib/
├── config.js
├── utils.js
├── reader.js
├── classifier.js
├── network.js (этапы 1, 2, 3)
├── exceptions.js (этап 5)
├── cosmetic.js (этап 4)
├── limiter.js (квоты)
└── writer.js
```

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
  - 101..199 — запас на расширение manual.json.
- Лимит статических: 30 000 суммарно.
- Лимит динамических: 5000.
- main_frame НИКОГДА не указывается в resourceTypes блокирующих правил.
- hostNotEquals в UrlFilter у webNavigation НЕ поддерживается — исключение хостов делается вручную в handleCommitted.
- Диапазоны id проверяются в limiter.js → assertIdRanges().

### Whitelist (динамические allowAllRequests)
- shared/storage.js — syncWhitelistRules создаёт по одному правилу allowAllRequests (priority 100) на каждый whitelisted домен.
- Диапазон id динамических: 200..9999.
- Удаление и добавление — двумя отдельными вызовами updateDynamicRules (Chrome не гарантирует порядок в одном вызове).
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

### Детектор рекламы в content (обновлено в 1.1.0)

Основной вход — hideAdInElement(el, logPrefix) в ad-markers.js.
Все остальные места (hideAdMarkers, checkNodeForMarkers) — тонкие обёртки.

Два типа маркеров:

1. Обычный матчер (matchMarker):
- схлопывает el.textContent (lowercase, без пробелов);
- проверяет includes() по списку AD_TEXT_MARKERS:
  реклама, промо, спонсор, рекламный, партнёрскийматериал,
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

Подъём к контейнеру:

- findAdContainer(el):
  - по семантическим селекторам [id^="trg-b-"],
    [id^="b"][data-rendertype="native"], [id^="yandex_ad_R-"],
    [data-testid$="-ad"], [data-testid*="-ad-"];
  - по inline-стилю width: 160px (слот Mail.ru);
  - иначе — сам el.

- findRotatedContainer(el):
  - поднимается до родителя с 2+ детьми,
    у которых textContent > 20 символов;
  - используется для коротких маркеров (≤ 20 символов)
    и для isRotatedAdLabel.

### Popup (ESM, type="module")
- import { MSG } from "../shared/messages.js" работает.
- getElementById (не $, не byId).
- Кнопка «Перезагрузить страницу» появляется после действий (свитчер, whitelist).
- loadVersion — синхронная.

### Сообщения (shared/messages.js)
Формат: <откуда>→<куда>:<действие>
- cs→sw:getDomainSelectors — content script просит селекторы
- popup→sw:getState
- popup→sw:setEnabled
- popup→sw:whitelistAdd
- popup→sw:whitelistRemove
  isValidMessageType — проверка через Set.

### Конвертер
- ESM ("type": "module" в package.json).
- Команды: npm run convert, npm run icons, npm run build, npm run screenshots.
- Квоты (сумма ≤ 30000):
  - Этап 2 ($-модификаторы): 5000
  - Этап 3 (|http/path): 15000
  - Этап 1 (||domain^): 8500
  - Исключения: 1500
- jszip вместо archiver.
- sharp для иконок и ресайза.
- Конвертер не трогает manual.json и cosmetic-manual.css.

### Конвертация $domain=
Модификатор $domain=a|b|~c|~d конвертируется в initiatorDomains
и excludedInitiatorDomains DNR-правила:
- включающие домены (a, b) → initiatorDomains: ["a", "b"]
- исключающие (~c, ~d) → excludedInitiatorDomains: ["c", "d"]
- смешанные → оба поля
  Chrome проверяет: initiator ∈ initiatorDomains AND initiator ∉ excludedInitiatorDomains.
  Реализовано в parseModifiers (tools/lib/network.js).
  Используется и для block-правил (Этап 2), и для allow-правил
  (exceptions.js импортирует тот же parseModifiers).

### Фильтр extended CSS
В cosmetic.js добавлен фильтр extended-синтаксиса.
Правила, содержащие :style(), :remove(), :upward(), :matches-path(),
:matches-css(), :matches-attr(), :contains(), :xpath(),
:-abp-properties(), +js(), отбрасываются на этапе конвертации.
Это не валидный CSS, браузер молча игнорирует его при insertCSS.
По итогам 1.1.0 отфильтровано 1 135 правил.

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
- Яндекс.Директ / РСЯ — div[id^="yandex_ad"], div[id^="yandex_rtb"], div[class^="yandex_ad"], [id^="ya_partner_R-A-"].
- Google Publisher Tag — div[id^="div-gpt-ad"], div[id^="gpt-passback"].
- Mail.ru — [isfullscreen="true"], [id^="trg-b-"].
- Mail.ru VK Ads — [id*="R-I-"], [data-r-i] (для карт, поиска, сервисов Яндекса).
- Mail.ru data-mnemo — служебные.
- Dzen — [data-testid$="-ad"], [data-testid*="-ad-"], [id^="auto-slide-ad"], [id*="-ad-item_"], [class*="auto-slide-ad"], [class*="dzen-desktop--auto-slide-ad"], a.yrw-url[href*="yandex.ru/an/count"].
- ВК Видео — [data-testid="ad-container"], [class*="ads-container"], [class*="rb-adman-ad-actions"].
- Яндекс.Погода — [class*="AppMoney_container"], [class*="AppMoney_wrap"], [class*="AppMoneySidebar"], [id^="money-main-"], [data-name="adWrapper"].

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

- Этап 2 ($-модификаторы): 5 000
- Этап 3 (|http / /path): 15 000
- Этап 1 (||domain^): 8 500
- Исключения (@@): 1 500
- Итого: 30 000

По итогам 1.1.0:
- блокирующих правил: 28 500
- allow-правил: 1 094
- итого: 29 594 (98.6% лимита)

### Обрезка до квоты (capRules)

Обрезка до квоты (capRules в limiter.js) делается с начала массива — приоритет отдаётся правилам, которые пришли раньше в порядке чтения EasyList/RU AdList. EasyList разбит на секции (General, Specific, Allow, Anti-Adblock, Adult), внутри секций порядок обычно соответствует важности, но гарантии иерархической сортировки нет. Случайная выборка или сортировка по эвристикам не улучшат ситуацию — критерия «важности» правила у нас нет. slice(0, max) — разумный дефолт.

### Проверка диапазонов id

В limiter.js → assertIdRanges() проверяется, что диапазоны id не пересекаются:

- manual.json:       1..100
- динамические:      200..9999 (см. shared/storage.js)
- ads.json:          10000..
- exceptions.json:   100000..

Если ads.json дорастёт до 100000, или exceptions.json начнётся раньше 10000 — конвертер упадёт с понятной ошибкой, а не создаст файл, который Chrome откажется загружать.

## Заметки по прошлым проблемам (решены)

- Rule with id N does not have a unique ID — Chrome смешивает пространства id статических и динамических правил. Решено разделением диапазонов (manual 1..100, dynamic 200..9999, ads 10000+, exceptions 100000+). Проверяется в limiter.js → assertIdRanges().
- MAX_GETMATCHEDRULES_CALLS_PER_INTERVAL quota — отказ от getMatchedRules для счётчика.
- Race condition в syncDnrState — мьютекс + единый источник вызовов (storage.onChanged).
- insertCSS failed: The extensions gallery cannot be scripted — добавить в фильтр onCommitted исключение хостов chrome.google.com и chromewebstore.google.com. Реализовано вручную в handleCommitted (см. cosmetic-injector.js), массив FORBIDDEN_HOSTS.
- archiver is not a function — перешли на jszip.
- ESM в конвертере — import/export вместо require.
- __dirname в ESM — через fileURLToPath(import.meta.url).
- Service worker registration failed. Status code: 15 — был из-за hostNotEquals внутри schemes в webNavigation UrlFilter (не поддерживается). Исправлено: фильтр onCommitted только по schemes, исключение хостов — вручную в handleCommitted.
- Mail.ru мигание рекламы — решено: структурный детектор разбитого лейбла (isRotatedAdLabel) + findRotatedContainer. Задержка ~5 секунд при ротации — принимаем как особенность Mail.ru.
- YouTube авто-скип — работает: ускорение 16x + mute + клик по кнопке + оверлей.
- Whiteline-логотип Mail.ru отображался как битая картинка — блокировался трекер-домен mradx.net, используемый Mail.ru как CDN для логотипа. Добавлено allow-правило в rules/manual.json (id 6) для ||r.mradx.net/imgs/.

## Полезные команды

npm run convert       # сконвертировать списки
npm run icons         # нарезать иконки из исходников
npm run build         # собрать ZIP
npm run screenshots   # ресайз скриншотов до 1280×800

## Ссылки

- Chrome Web Store Dashboard: https://chrome.google.com/webstore/devconsole
- Opera Developer Dashboard: https://addons.opera.com/developer
- GitHub Pages (privacy policy): https://erstdev.github.io/erst_dev_adblocker_privacy/

## Работы

Раздел содержит планы на будущее и открытые задачи. После завершения пункта — переносить в «Заметки по прошлым проблемам» или удалять.

### Отложено на 1.2.0

1. **Поддержка `#@#` (исключения косметики).**
  - Сейчас `cosmetic.js` отбрасывает ~539 правил `#@#`.
  - Из-за этого возможны ложные срабатывания: если EasyList запрещает скрывать селектор на конкретном домене, мы это игнорируем.
  - Полное решение: отдельный файл `rules/cosmetic-exclude.json`, отдача исключений через SW, отдельный `<style>` в content script с `display: revert !important`.
  - Оценка работы — 2–3 часа.
  - Затрагивает: `tools/lib/cosmetic.js`, `tools/convert.js`, `tools/lib/config.js`, `shared/messages.js`, `background/lib/message-handler.js`, `content/lib/inject-css.js`.

2. **Поддержка `:has-text(...)` (uBlock).**
  - Сейчас ~287 правил в `easylist.txt` с `#?#` и `:has-text(...)` не обрабатываются: `classifier.js` кладёт их в `network`, `network.js` не берёт, в выходные файлы они не попадают.
  - Реализовать: парсинг `:has-text`, обход DOM, скрытие подходящих элементов.
  - Пока — известное ограничение, не задокументировано в README/CHANGELOG.

3. **Разделение DNR-набора на core/extra.**
  - После конвертации `$domain=` в `initiatorDomains` (1.1.0) общее число правил выросло до 29 594 из 30 000 (98.6% лимита Chrome).
  - Следующее крупное обновление EasyList/RU AdList упрётся в лимит, и `capRules` начнёт подрезать этапы.
  - Решение: разделить статические правила на два набора: `core` (всегда включён) и `extra` (включается программно). Тогда основной набор будет меньше и не будет упираться в лимит.

4. **Порт на Firefox.**
  - MV3 в Firefox отличается: `browser.*` вместо `chrome.*`, `declarativeNetRequest` с ограничениями, `webNavigation` не полностью.
  - Требует отдельной ветки и тестирования.

5. **TypeScript, Prettier, ESLint.**
  - Миграция поэтапная: сначала ESLint на текущий JS, потом TypeScript.
  - Bundler (Vite/Rollup) — если понадобится после миграции.

### Открытые задачи по доке и публикации

6. **`description` в манифесте — сделано.**
  - Решено через i18n: `_locales/en/messages.json` и `_locales/ru/messages.json`, в манифесте `__MSG_appName__` и `__MSG_appDescription__`, `default_locale: "en"`.
  - Английский: `Ad blocker for Chromium browsers. Network filtering, cosmetic rules, video ad skip, whitelist.`
  - Русский: `Блокировщик рекламы для браузеров на Chromium: DNR, косметика, авто-скип видео, белый список.`

7. **`web_accessible_resources` — сделано.**
  - Удалён из манифеста.
  - Причина: `rules/cosmetic-map.json` читается только из service worker через `chrome.runtime.getURL`, WAR для этого не требуется.

8. **`minimum_chrome_version` — сделано.**
  - Добавлено `"minimum_chrome_version": "105"` в манифест.
  - Причина: `:has()` в CSS (Chrome 105+), `allowAllRequests` в DNR (Chrome 96+).

9. **`npm run screenshots` — сделано.**
  - Добавлено `"screenshots": "node tools/resize-screenshots.js"` в `package.json`.

10. **`tabs` → `activeTab` — сделано.**
  - В манифесте `tabs` заменён на `activeTab`.
  - Причина: доступ к `tab.url` только после клика по иконке расширения; CWS-ревью чище.

11. **CHANGELOG 1.1.0 — сделано.**
  - Дополнен всеми правками 1.1.0: `hideAdInElement`, `isRotatedAdLabel`, `findRotatedContainer`, `cosmetic-injector.js`, `FORBIDDEN_HOSTS`, `handleCommitted`, `syncWhitelistRules`, i18n, `minimum_chrome_version`, `activeTab`, удаление WAR, `npm run screenshots`, фильтр extended CSS.
  - Badge перенесён из `[1.0.0] Added` в `[1.1.0] Removed`.
  - `[0.0.0]` удалён.
  - Числа в `[1.0.0]` уточнены: 28 024 / 501 / 14 116 / 31 310 / 12 832.

12. **Формат CHANGELOG — оставлено как есть.**
  - Секция `Technical` не по Keep a Changelog, но оставлена как осознанное отклонение.
  - `[Unreleased] — 1.1.0` — при публикации заменить на `[1.1.0] — YYYY-MM-DD`.

13. **README.md — обрывается на `npm run build`.**
  - Дописать: описание команд после сборки, структуру проекта, ссылку на `docs/`, порядок команд (`convert → icons → build`), как загрузить unpacked в Chrome.
  - Уточнить: `Chrome 105+` в README, но `minimum_chrome_version` в манифесте уже есть — согласовано.
  - Добавить `npm run screenshots` в список команд.

14. **PRIVACY.md — правки после изменений в манифесте.**
  - Заменить `tabs` на `activeTab` в разделе «Разрешения».
  - Уточнить формулировку: `activeTab` используется для чтения `tab.url` активной вкладки после открытия popup и для перезагрузки активной вкладки.
  - Убрать из PRIVACY упоминание `web_accessible_resources` (если было) — WAR больше нет.
  - Добавить ссылку на GitHub Pages: `https://erstdev.github.io/erst_dev_adblocker_privacy/`.
  - Уточнить, что `lists/*.txt` не попадают в ZIP, в архив идут только сгенерированные `rules/*.json` и `content/cosmetic.css`.
  - Проверить дату: 28 сентября (в PRIVACY) vs 29 сентября (релиз 1.0.0 в CHANGELOG).

15. **CONTEXT.md — эта правка.**
  - Файл переписан, все противоречия убраны, раздел «Работы» добавлен в конец.

### Открытые задачи по коду

16. **Фильтр extended-синтаксиса в `cosmetic.js` — сделано.**
  - Добавлен массив `EXTENDED_MARKERS` и функция `isExtendedSelector`.
  - Отфильтровано 1 135 правил, domain-map уменьшилась с 12 832 до 12 510 доменов, число domain-specific селекторов — с 31 310 до 29 515.

17. **`+js(...)` без `##` — закрыто как неактуальное.**
  - Проверка `grep` показала 0 совпадений в `easylist.txt` и `adguard-russian.txt`.
  - В текущих списках таких строк нет, проблема теоретическая.

18. **`#?#` / `:has-text(...)` — закрыто, отложено в 1.2.0.**
  - См. пункт 1 в разделе «Отложено на 1.2.0».
  - В текущих списках 287 правил с `#?#` в `easylist.txt` и 1 (закомментированное) в `adguard-russian.txt`.

19. **`#@#` (исключения косметики) — закрыто, отложено в 1.2.0.**
  - См. пункт 1 в разделе «Отложено на 1.2.0».

20. **Проверки диапазонов id в `limiter.js` — сделано.**
  - Добавлена функция `assertIdRanges(adsCount, exceptionsCount)`.
  - Бросает ошибку при пересечении `ads.json` и `exceptions.json`, а также при пересечении с dynamic-диапазоном (200..9999).
  - Логирует `[id-check] ads ids: …`, `[id-check] exceptions ids: …`, `[id-check] dynamic ids: …`.

21. **`$domain=` → `initiatorDomains` — сделано.**
  - Реализовано в `parseModifiers` (`tools/lib/network.js`).
  - По итогам 1.1.0: 596 правил Этапа 2 получили `domain=`, из них 428 с `initiatorDomains`, 87 с `excludedInitiatorDomains`, остальные — смешанные.
  - `exceptions.js` использует тот же `parseModifiers`, allow-правила с `domain=` тоже заработали (501 → 1 094).

22. **`capRules` обрезка — оставлено как есть.**
  - `slice(0, max)` сохраняет порядок чтения EasyList. Гарантии иерархической сортировки нет, но критерия «важности» правила у нас нет. См. раздел «Лимиты и квоты».

23. **`startId` в `convert.js` — отложено.**
  - Параметр `startId` в `modifierRulesToDnr`, `pathRulesToDnr`, `exceptionRulesToDnr` фактически мёртвый: `applyQuotas` в `limiter.js` всё равно переиндексирует id в диапазоны `10000..` и `100000..`.
  - Варианты: (A) убрать параметр, (B) оставить с комментариями, (C) оставить как есть.
  - Решение не принято, работа отложена.

24. **`writer.js` — JSON с отступами — оставлено как есть.**
  - `JSON.stringify(data, null, 2)` даёт читаемые файлы для отладки.
  - Размер ZIP не критичен: Chrome принимает до 2 ГБ, `compressionOptions: { level: 9 }` в `build-prod.js` уже жмёт.
  - `ads.json` ~4–5 МБ → в ZIP ~500 КБ–1 МБ.
  -

### Открытые задачи по сборке

41. **`build-prod.js` кладёт ZIP в корень проекта.**
  - Не в `dist/`, а в корень: `erst_dev_adblocker-1.1.0.zip`.
  - В README про сборку стоит указать: ZIP в корне, `dist/` — распакованная сборка.

42. **`build-prod.js` не включает `_locales/` в `INCLUDE`.**
  - После добавления i18n папка `_locales/` обязательна для загрузки расширения.
  - В `INCLUDE` сейчас: `["manifest.json", "icons", "background", "content", "popup", "shared", "rules"]`.
  - Надо добавить `"_locales"`.
  - **Критично для 1.1.0.**

### Оставшиеся пункты из начального списка (53 из 53)

Ниже — пункты, которые не вошли в разделы выше, потому что либо закрыты как неактуальные, либо не требуют действий.

46. **`PRIVACY.md` — правки после изменений в манифесте.** См. пункт 14.

47. **`[0.0.0]` в CHANGELOG — удалён.** См. пункт 11.

48. **Формат CHANGELOG — оставлен как есть.** См. пункт 12.

49. **Числа в CHANGELOG — уточнены.** См. пункт 11.

50. **Badge в `[1.0.0] Added` — перенесён в `[1.1.0] Removed`.** См. пункт 11.

51. **Проверка `:has-text` в EasyList — закрыто как неактуальное.** См. пункт 18.

52. **Проверка `+js(...)` без `##` — закрыто как неактуальное.** См. пункт 17.

53. **Фильтр extended CSS — сделано.** См. пункт 16.

### Сводка по открытым задачам

**Блокеры для публикации 1.1.0:**

- Пункт 12: заменить `[Unreleased] — 1.1.0` на `[1.1.0] — YYYY-MM-DD` при публикации.

**Отложено на 1.2.0:**

- Пункт 2: `:has-text(...)`.
- Пункт 3: разделение DNR на core/extra.
- Пункт 4: порт на Firefox.
- Пункт 5: TypeScript / Prettier / ESLint.

**Отложено без версии:**
- Пункт 41: ZIP в корне.
- Bundler (Vite/Rollup) если понадобится.