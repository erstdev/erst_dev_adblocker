# erst_dev_adblocker

Учебный блокировщик рекламы (Manifest V3).

## Сообщения между частями расширения

| Тип | Откуда | Куда | Payload | Ответ |
|---|---|---|---|---|
| `popup→sw:getCounters` | popup | service worker | `{tabId: number}` | `{tab: number, total: number}` |
| `popup→sw:resetCounters` | popup | service worker | — | `{ok: boolean}` (пока не реализовано) |
| `sw→popup:countersUpdated` | service worker | popup | `{tab, total}` | — (задел на будущее) |

**Правило:** все типы сообщений — в `shared/messages.js`. Не хардкодить строки.

## Ограничения счётчика

- `getMatchedRules` накапливает данные с запуска браузера → сброс при перезапуске.
- CSS-скрытые элементы не учитываются (они не проходят через DNR).
- Запросы, заблокированные другими расширениями, не видны.
- Требуется право `declarativeNetRequestFeedback` (нельзя публиковать в Store).