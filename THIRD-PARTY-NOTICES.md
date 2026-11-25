# Сторонние материалы

Расширение не содержит стороннего кода, но использует фильтры и иконки
третьих сторон. Ниже — источники, версии и лицензии.

## Фильтры (`lists/`)

### EasyList

- Файл: `lists/easylist.txt`
- Версия: 202609221640 (22 Sep 2026)
- Источник: https://easylist.to/, репозиторий https://github.com/easylist/easylist
- Лицензия: двойное лицензирование — Creative Commons Attribution-ShareAlike
  и GNU General Public License: https://easylist.to/pages/licence.html
- Атрибуция: «The EasyList authors (https://easylist.to/)»

### AdGuard Russian filter

- Файл: `lists/adguard-russian.txt`
- Версия: 2.1.8.70 (2026-09-21)
- Источник: https://github.com/AdguardTeam/AdGuardFilters
- Лицензия: GNU General Public License v3.0:
  https://github.com/AdguardTeam/AdguardFilters/blob/master/LICENSE

Фильтры не распространяются как отдельные файлы. `npm run convert`
преобразует их в `rules/ads.json`, `rules/exceptions.json`,
`content/cosmetic.css`, `rules/cosmetic-map.json` и
`rules/cosmetic-exclude.json` — эти производные файлы попадают в ZIP.
Исходные `lists/*.txt` в git и в архив не входят.

## Иконки языков (`popup/flags/`)

- flag-icons 7.2.3, MIT, © Panayiotis Lipiridis.
- Текст лицензии: `popup/flags/LICENSE`.

## Лицензия кода

Код расширения распространяется по MIT — см. `LICENSE`. На сгенерированные
`rules/*.json`, `content/cosmetic.css` и карты косметики это не
распространяется: они производны от фильтров выше, и их распространение
регулируется лицензиями источников.

## Ограничение

Это не юридическая консультация. GPL и CC BY-SA предъявляют требования
к распространению производных материалов. Перед публикацией проверь,
что выбранная схема распространения им соответствует.
