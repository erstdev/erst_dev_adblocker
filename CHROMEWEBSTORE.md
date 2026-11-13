# Chrome Web Store — карточка релиза

Последнее обновление: 2026-11-13
Версия пакета: 1.2.0
Архив: `erst_dev_adblocker-1.2.0.zip`

Этот файл — шпаргалка для формы Chrome Web Store. В ZIP он не входит.

## Package

- Загрузить `erst_dev_adblocker-1.2.0.zip`.
- Версия в манифесте: 1.2.0.
- What's new (EN):
  `Added a localized popup with 44 languages, a searchable language picker with flags, and a more compact main view. Russian is now first in the list. No data collection; all settings stay local.`
- What's new (RU):
  `Локализация popup на 44 языка: поиск, флаги и выбор языка в настройках. Русский теперь первый в списке. Главное окно стало компактнее, без пустоты внизу. Данные не собираются, настройки хранятся локально.`

## Store listing

**Extension name:** erst_dev_adblocker

**Short description (EN, ≤132):**
`Blocks ads and trackers on any site, skips video ads, and speaks 44 languages. No data collection.`

**Short description (RU, ≤132):**
`Блокирует рекламу и трекеры на любых сайтах, пропускает видео-рекламу. 44 языка интерфейса.`

**Category:** Productivity

**Primary language:** Russian (добавить English как перевод листинга, если нужен)

**Single purpose (EN):**
`Blocks ads and trackers on websites the user visits and hides ad elements on pages.`

**Single purpose (RU):**
`Блокирует рекламу и трекеры на сайтах и скрывает рекламные элементы на страницах.`

### Detailed description (EN)

```
Block ads and trackers on any website, skip video ads, and use the extension in 44 languages.

FEATURES
• Blocks advertising and tracking requests before they load.
• Hides ad banners, native ads, and sponsored blocks on pages.
• Skips ads in YouTube, VK Video, and RuTube players.
• Whitelist: disable blocking on sites you trust.
• 44 interface languages with a searchable picker and country flags.
• Settings stay on your device; no account is required.

HOW TO USE
1. Click the toolbar icon to open the popup.
2. Turn blocking on or off with the switch.
3. Open the gear menu to choose the interface language.
4. Add the current site to the whitelist if a site breaks.

LANGUAGES
Russian, English, Albanian, Armenian, Azerbaijani, Belarusian, Bulgarian, Bosnian, Catalan, Croatian, Czech, Danish, Dutch, Estonian, Finnish, French, Georgian, German, Greek, Hungarian, Icelandic, Irish, Italian, Kazakh, Kyrgyz, Latvian, Lithuanian, Luxembourgish, Macedonian, Maltese, Norwegian, Polish, Portuguese, Romanian, Romansh, Serbian, Slovak, Slovenian, Spanish, Swedish, Tajik, Turkish, Turkmen, Uzbek.

PRIVACY
The extension does not collect, store, or transmit personal data. The on/off state, whitelist, and interface language are stored locally in the browser and are deleted with the extension. No analytics, no remote code.

PERMISSIONS
• Read and change data on sites you visit — needed to block ads and hide ad elements on any site.
• Storage — keeps your on/off choice, whitelist, and language locally.
• Navigation events — used to apply ad hiding when a page loads.

SUPPORT
Questions or bug reports: erst_dev@mail.ru

Version 1.2.0 — 44-language popup, searchable language picker with flags, compact main view.
```

### Detailed description (RU)

```
Блокирует рекламу и трекеры на любых сайтах, пропускает видео-рекламу и говорит на 44 языках.

ВОЗМОЖНОСТИ
• Блокирует рекламные и трекерные запросы до их загрузки.
• Скрывает рекламные баннеры, нативную рекламу и спонсорские блоки.
• Пропускает рекламу в плеерах YouTube, VK Video и RuTube.
• Белый список: отключает блокировку на сайтах, которым вы доверяете.
• 44 языка интерфейса с поиском и флагами стран.
• Настройки остаются на устройстве, аккаунт не нужен.

КАК ПОЛЬЗОВАТЬСЯ
1. Нажмите на иконку расширения на панели.
2. Включите или выключите блокировку переключателем.
3. Откройте шестерёнку и выберите язык интерфейса.
4. Добавьте текущий сайт в белый список, если сайт сломался.

ЯЗЫКИ
Русский, английский, албанский, армянский, азербайджанский, белорусский, болгарский, боснийский, каталанский, хорватский, чешский, датский, нидерландский, эстонский, финский, французский, грузинский, немецкий, греческий, венгерский, исландский, ирландский, итальянский, казахский, киргизский, латышский, литовский, люксембургский, македонский, мальтийский, норвежский, польский, португальский, румынский, романшский, сербский, словацкий, словенский, испанский, шведский, таджикский, турецкий, туркменский, узбекский.

ПРИВАТНОСТЬ
Расширение не собирает, не хранит и не передаёт персональные данные. Флаг включения, белый список и язык интерфейса хранятся локально в браузере и удаляются вместе с расширением. Аналитики и удалённого кода нет.

РАЗРЕШЕНИЯ
• Чтение и изменение данных на сайтах — нужно для блокировки рекламы и скрытия рекламных элементов.
• Хранилище — локально хранит переключатель, белый список и язык.
• События навигации — нужны, чтобы применять скрытие рекламы при загрузке страницы.

ПОДДЕРЖКА
Вопросы и баги: erst_dev@mail.ru

Версия 1.2.0 — popup на 44 языках, поиск языков с флагами, компактное главное окно.
```

## Graphics

| Asset | Size | Status | File |
|---|---|---|---|
| Store icon | 128×128 PNG | Готово | `icons/store-icon-128.png` |
| Small promo tile | 440×280 | Готово | `banner.png` |
| Screenshot 1 | 1280×800 или 640×400 | Нет в репозитории | — |
| Screenshot 2–5 | 1280×800 или 640×400 | Опционально | — |
| Marquee promo tile | 1400×560 | Опционально | — |

Если в текущем листинге скриншоты уже загружены, при обновлении они сохраняются. Для 1.2.0 имеет смысл добавить один скриншот с экраном настроек и списком языков. В репозитории папки `store-assets/` сейчас нет; `npm run screenshots` ждёт `store-assets/raw/*.png`.

## Permissions justification

| Permission | Type | Justification (EN) |
|---|---|---|
| `declarativeNetRequest` | permissions | Blocks advertising and tracking network requests using bundled filter lists. Page content is not read for this. |
| `scripting` | permissions | Injects a bundled CSS stylesheet that hides ad elements. Used only for cosmetic ad blocking. |
| `storage` | permissions | Stores the on/off state, the site whitelist, and the chosen interface language locally on the device. |
| `webNavigation` | permissions | Detects top-level page navigation so ad hiding can be applied to the new page. The URL is used in memory only, not stored or transmitted. |
| `<all_urls>` | host_permissions | Ad blocking and cosmetic filtering must work on any website the user visits. Page data is not collected or transmitted. |

## Privacy practices

- Does the extension collect user data? **No.**
- Is data transmitted off-device? **No.** `chrome.storage.local` only; no `storage.sync`.
- Remote code? **No.** All JS, rules, locale files, and flags are bundled in the ZIP.
- Analytics / telemetry / external requests? **No.**
- Data use certification: not sold, not used for unrelated purposes, not used for creditworthiness.
- Privacy policy URL: `https://erstdev.github.io/erst_dev_adblocker_privacy/`

Важно: публичная политика от 15 октября 2026 года ещё не упоминает язык интерфейса. Локальный `PRIVACY.md` обновлён 13 ноября 2026 года — опубликуй его в репозитории GitHub Pages, чтобы страница совпадала с формой.

## Distribution

- Visibility: Public
- Regions: All regions
- Pricing: Free
- Mature content: No
- Trader status (EU DSA): указать фактический статус в кабинете.

## Developer info

- Publisher: erstdev (проверить в кабинете)
- Contact email: erst_dev@mail.ru
- Developer account email: erst.dev.channel@gmail.com
- Support: erst_dev@mail.ru
- Homepage: нет
- Privacy policy: `https://erstdev.github.io/erst_dev_adblocker_privacy/`

## Review notes (EN)

```
No remote code and no data collection. All filter lists, locale dictionaries, and SVG flags are bundled in the package. To test the 1.2.0 feature: open the popup, click the gear button, open the language selector, search for a language, and select it. The UI changes immediately and the choice is stored locally. Permissions are used only for ad blocking, cosmetic hiding, and local settings.
```

## Version history

| Version | Date | Changes |
|---|---|---|
| 1.2.0 | 2026-11-13 | 44-language popup, searchable picker with flags, settings route, compact main view |
| 1.1.5 | 2026-11-13 | Yandex AdFox banner fix |
| 1.1.4 | 2026-11-03 | Text-based hiding only for labels |
