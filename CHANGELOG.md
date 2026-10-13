# Changelog

Все значимые изменения проекта erst_dev_adblocker.

Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.0.0/).
Версии следуют [Semantic Versioning](https://semver.org/lang/ru/).

## [Unreleased] — 1.1.0

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