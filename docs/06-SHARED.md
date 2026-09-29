# Глава 7. Shared — общие модули

## Зачем эта глава

В проекте есть две вещи, которые нужны сразу нескольким частям расширения:

1. Типы сообщений — чтобы popup и service worker называли одни и те же вещи одинаково.
2. Работа с хранилищем и DNR — чтобы popup и service worker одинаково читали и меняли настройки.

Если бы мы писали это в каждом файле отдельно, при первом же изменении что-то бы разъехалось. Опечатка в строке `"popup→sw:getState"` — и сообщение уйдёт в никуда, никто не заметит.

Поэтому есть папка `shared/`. В ней два файла:

```
shared/
├── messages.js
└── storage.js
```

Оба — ES-модули с `export`. Их можно импортировать из service worker и из popup. Из content scripts — нет, потому что content scripts не поддерживают модули (глава 5).

## messages.js — типы сообщений

### Зачем нужен единый список типов

Сообщения между частями расширения идентифицируются строкой — полем `type` в объекте:

```js
chrome.runtime.sendMessage({
    type: "popup→sw:getState",
    url: "https://rbc.ru/"
});
```

Service worker получает это сообщение и проверяет `msg.type === "popup→sw:getState"`. Если обе стороны пишут строку руками — рано или поздно появится опечатка. `popup→sw:getState` и `popup→sw:getstate` — разные строки, ничего не сработает. Ошибка тихая: ничего не падает, просто сообщение уходит в пустоту.

Решение — единый источник правды. Все типы объявлены один раз в `shared/messages.js` как константы. И popup, и service worker импортируют оттуда. Опечатка в имени константы — ошибка на этапе выполнения с понятным текстом «MSG is not defined». Опечатка в строке — тихая.

### Как устроен файл

```js
export const DIR = {
    POPUP_TO_SW: "popup→sw",
    CS_TO_SW:   "cs→sw",
};

export const MSG = {
    CS_GET_DOMAIN_SELECTORS: `${DIR.CS_TO_SW}:getDomainSelectors`,

    POPUP_GET_STATE:         `${DIR.POPUP_TO_SW}:getState`,
    POPUP_SET_ENABLED:       `${DIR.POPUP_TO_SW}:setEnabled`,
    POPUP_WHITELIST_ADD:     `${DIR.POPUP_TO_SW}:whitelistAdd`,
    POPUP_WHITELIST_REMOVE:  `${DIR.POPUP_TO_SW}:whitelistRemove`,
};

const ALL_TYPES = new Set(Object.values(MSG));
export function isValidMessageType(type) {
    return ALL_TYPES.has(type);
}
```

Три экспорта: `DIR`, `MSG`, `isValidMessageType`.

### DIR — направления

Объект с двумя возможными направлениями сообщений:

- `POPUP_TO_SW` — от popup к service worker.
- `CS_TO_SW` — от content script к service worker.

Обратных направлений (sw→popup, sw→cs) у нас нет — service worker не инициирует сообщения, только отвечает.

### MSG — типы сообщений

Объект, где каждый ключ — тип сообщения. Значение строится из направления и имени действия:

```
`${DIR.POPUP_TO_SW}:getState` → "popup→sw:getState"
```

Стрелка `→` в строке — визуальный маркер. Читаешь `"popup→sw:getState"` — сразу видно, что сообщение идёт от popup к service worker и что-то про state. Читаешь `"cs→sw:getDomainSelectors"` — content script просит у service worker селекторы.

Список текущих типов:

| Константа | Значение | Откуда | Куда |
|---|---|---|---|
| `CS_GET_DOMAIN_SELECTORS` | `cs→sw:getDomainSelectors` | content script | service worker |
| `POPUP_GET_STATE` | `popup→sw:getState` | popup | service worker |
| `POPUP_SET_ENABLED` | `popup→sw:setEnabled` | popup | service worker |
| `POPUP_WHITELIST_ADD` | `popup→sw:whitelistAdd` | popup | service worker |
| `POPUP_WHITELIST_REMOVE` | `popup→sw:whitelistRemove` | popup | service worker |

### isValidMessageType — валидация

```js
const ALL_TYPES = new Set(Object.values(MSG));
export function isValidMessageType(type) {
  return ALL_TYPES.has(type);
}
```

Функция проверяет, что тип сообщения известный.

`Object.values(MSG)` — массив всех значений объекта `MSG`. `new Set(...)` — превращает массив в Set для быстрого поиска. `ALL_TYPES.has(type)` — проверяет наличие.

Зачем это нужно: service worker получает сообщение и не хочет обрабатывать неизвестные. Если тип не из списка — это либо опечатка, либо другое расширение пытается с нами поговорить (что невозможно, но всё же). Мы просто логируем и игнорируем:

```js
if (!msg || !isValidMessageType(msg.type)) {
  console.warn("[erst_dev_adblocker] unknown message:", msg);
  return;
}
```

Без этой проверки пришлось бы писать `if (msg.type === "..." || msg.type === "..." || ...)` — длинный switch. С Set — одна строка.

Почему `Set`, а не массив: `Set.has()` работает за константное время. Для массива из 5 элементов разница незаметна, но привычка правильная.

## storage.js — работа с хранилищем и DNR

### Что в файле

Это самый сложный файл в `shared/`. Он делает три вещи:

1. Читает и пишет настройки в `chrome.storage.local` — включено/выключено расширение, список исключений.
2. Управляет DNR-ruleset'ами — включает и выключает их через `chrome.declarativeNetRequest.updateEnabledRulesets`.
3. Управляет динамическими правилами whitelist — создаёт и удаляет `allowAllRequests` для сайтов в списке исключений.

Всё, что связано с состоянием расширения и DNR, живёт здесь.

### Константы и ключи

```js
const KEY_ENABLED = "enabled";
const KEY_WHITELIST = "whitelist";

const RULESET_ADS = "ads_ruleset";
const RULESET_EXCEPTIONS = "exceptions_ruleset";
const RULESET_MANUAL = "manual_ruleset";
const ALL_RULESETS = [RULESET_ADS, RULESET_EXCEPTIONS, RULESET_MANUAL];

const DYN_RULE_ID_BASE = 1;
const DYN_RULE_ID_MAX = 9999;
```

`KEY_ENABLED` и `KEY_WHITELIST` — ключи в `chrome.storage.local`. Меняешь ключ — надо везде обновить. Поэтому вынесены в константы.

Имена ruleset'ов совпадают с `manifest.json`. В манифесте они заданы как `id` в `rule_resources`. Меняешь одно — надо менять и второе. Тоже вынесены в константы.

`DYN_RULE_ID_BASE` и `DYN_RULE_ID_MAX` — диапазон id для динамических правил whitelist. Chrome смешивает пространства id статических и динамических правил, поэтому у каждого свой диапазон (см. главу 8). У нас: статические ads.json в 10 000+, exceptions.json в 100 000+, а динамические whitelist — в 1..9999.

### Чтение и запись enabled

```js
export async function getEnabled() {
  const data = await chrome.storage.local.get(KEY_ENABLED);
  return data[KEY_ENABLED] !== false;
}

export async function setEnabled(value) {
  await chrome.storage.local.set({ [KEY_ENABLED]: !!value });
}
```

`getEnabled` читает значение. Если в storage ничего нет — возвращает `true` (включено по умолчанию). Проверка `!== false` даёт именно это: значение есть и оно `false` — вернём `false`; значение отсутствует или не `false` — вернём `true`.

`setEnabled` пишет значение. `!!value` приводит к булеву типу: `!!"строка"` → `true`, `!!0` → `false`. Защита от случайной передачи нечислового или не-булева значения.

### Чтение и запись whitelist

```js
export async function getWhitelist() {
  const data = await chrome.storage.local.get(KEY_WHITELIST);
  return Array.isArray(data[KEY_WHITELIST]) ? data[KEY_WHITELIST] : [];
}

export async function addToWhitelist(domain) {
  const list = await getWhitelist();
  if (!list.includes(domain)) {
    list.push(domain);
    await chrome.storage.local.set({ [KEY_WHITELIST]: list });
  }
  return list;
}

export async function removeFromWhitelist(domain) {
  let list = await getWhitelist();
  list = list.filter((d) => d !== domain);
  await chrome.storage.local.set({ [KEY_WHITELIST]: list });
  return list;
}
```

`getWhitelist` читает массив. Если в storage мусор (не массив) — возвращает пустой массив. Защита от повреждённых данных.

`addToWhitelist` добавляет домен, если его там ещё нет. Возвращает обновлённый список. Проверка `includes` защищает от дубликатов.

`removeFromWhitelist` удаляет домен через `filter`. Возвращает обновлённый список.

### Утилиты

```js
export function extractHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}
```

Достаёт hostname из URL. `new URL("https://rbc.ru/path")` → объект с `.hostname === "rbc.ru"`. Если URL невалидный — `catch`, возвращаем `null`.

```js
export async function isWhitelisted(url) {
  const hostname = extractHostname(url);
  if (!hostname) return false;
  const list = await getWhitelist();
  const parts = hostname.split(".");
  for (let i = 0; i < parts.length; i++) {
    const candidate = parts.slice(i).join(".");
    if (list.includes(candidate)) return true;
  }
  return false;
}
```

Проверяет, находится ли сайт в белом списке. Идёт по всем уровням домена:

- `www.rbc.ru` → `["www", "rbc", "ru"]`.
- Первая итерация: `www.rbc.ru`.
- Вторая: `rbc.ru`.
- Третья: `ru`.

Если хоть один из этих вариантов есть в списке — сайт считается исключением.

Зачем так: пользователь мог добавить `rbc.ru`, а заходит на `www.rbc.ru` или `sport.rbc.ru`. Все три — один и тот же сайт. Пользователь не должен добавлять все поддомены вручную.

### Управление ruleset'ами

```js
async function setRulesetsEnabled(enabled) {
  const all = await chrome.declarativeNetRequest.getEnabledRulesets();
  const enabledSet = new Set(all);
  const targetSet = new Set(enabled ? ALL_RULESETS : []);

  const toEnable = [...targetSet].filter((id) => !enabledSet.has(id));
  const toDisable = [...enabledSet].filter((id) => !targetSet.has(id));

  if (toEnable.length === 0 && toDisable.length === 0) return;

  await chrome.declarativeNetRequest.updateEnabledRulesets({
    enableRulesetIds: toEnable,
    disableRulesetIds: toDisable
  });

  console.log(`[DNR] rulesets enabled: ${[...targetSet].join(", ") || "none"}`);
}
```

Функция приводит состояние DNR-ruleset'ов в соответствие с флагом `enabled`.

Пошагово:

1. **Читаем текущее состояние.** `getEnabledRulesets()` возвращает массив имён включённых ruleset'ов.
2. **Формируем целевое состояние.** Если `enabled = true` — все три ruleset'а. Если `false` — пустой массив.
3. **Считаем разницу.** `toEnable` — ruleset'ы, которые нужно включить (в цели есть, сейчас нет). `toDisable` — которые нужно выключить (сейчас есть, в цели нет).
4. **Если разницы нет** — выходим. Не дёргаем Chrome API без нужды.
5. **Вызываем `updateEnabledRulesets`** с двумя массивами.

Почему не написать просто «включить все три» или «выключить все три»: если мы уже включили их ранее, повторный вызов бессмысленен. А главное — Chrome может выдать ошибку «ruleset already enabled» в некоторых версиях. Лучше передавать только те, что реально надо менять.

### Управление динамическими правилами whitelist

```js
async function syncWhitelistRules(enabled) {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const existingIds = existing.map((r) => r.id);

  if (existingIds.length > 0) {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existingIds
    });
    console.log(`[DNR] removed ${existingIds.length} old dynamic rules`);
  }

  if (!enabled) {
    console.log("[DNR] whitelist rules: 0 (disabled)");
    return;
  }

  const whitelist = await getWhitelist();
  const newRules = [];
  let id = DYN_RULE_ID_BASE;
  for (const domain of whitelist) {
    if (id > DYN_RULE_ID_MAX) {
      console.warn(`[DNR] whitelist too large, skipping: ${domain}`);
      continue;
    }
    newRules.push({
      id: id++,
      priority: 100,
      action: { type: "allowAllRequests" },
      condition: {
        urlFilter: `||${domain}^`,
        resourceTypes: ["main_frame", "sub_frame"]
      }
    });
  }

  if (newRules.length > 0) {
    await chrome.declarativeNetRequest.updateDynamicRules({
      addRules: newRules
    });
  }

  console.log(`[DNR] whitelist rules: ${newRules.length}`);
}
```

Самая нетривиальная функция в проекте.

**Что делает:** создаёт DNR-правила для сайтов в белом списке. Каждое правило говорит Chrome: «если главный запрос или iframe ведёт на этот домен — не блокируй ничего внутри».

**Тип действия `allowAllRequests`.** Это особенное действие DNR. Обычное `allow` говорит «разреши конкретный запрос». `allowAllRequests` говорит «разреши ВСЕ запросы, инициированные этой страницей». То есть если пользователь открыл `rbc.ru`, и rbc.ru грузит рекламу с других доменов — мы всё равно не блокируем ничего на этой странице.

**`priority: 100`.** Это очень высокий приоритет. У наших блокирующих правил `priority: 1`, у исключений из `exceptions.json` — `2`. У whitelist-правил — `100`. Даже если реклама попадает под сотню блокирующих правил, правило `allowAllRequests` с приоритетом 100 их перебьёт.

**`resourceTypes: ["main_frame", "sub_frame"]`.** `allowAllRequests` работает только для главного фрейма и подфреймов. Это его требование: он разрешает всё внутри страницы, а не сам запрос страницы. Значит, применять его надо именно к запросам, которые создают страницу.

**Пошагово:**

1. Читаем существующие динамические правила.
2. Если они есть — удаляем их отдельным вызовом.
3. Если расширение выключено — выходим, ничего не добавляем.
4. Читаем белый список.
5. Для каждого домена создаём правило. Id инкрементируем начиная с `DYN_RULE_ID_BASE`.
6. Добавляем все новые правила отдельным вызовом.

**Почему удаление и добавление — отдельные вызовы.** Chrome не гарантирует порядок обработки `removeRuleIds` и `addRules` в одном вызове `updateDynamicRules`. Бывает так: Chrome сначала добавляет новые правила, потом удаляет старые — и получает конфликт id (новое правило id=1 и старое правило id=1 одновременно). Отсюда ошибка «Rule with id 1 does not have a unique ID». Разделение на два вызова гарантирует, что удаление применилось до добавления.

**Ограничение на размер.** Chrome позволяет 5000 динамических правил. У нас `DYN_RULE_ID_MAX = 9999`, но защита на 5000 — если пользователь добавит больше, правила обрежутся. Проверка `if (id > DYN_RULE_ID_MAX)` предупреждает и пропускает лишнее. На практике 5000 сайтов в белом списке — фантастика, но защита есть.

### syncDnrState — главная функция

```js
let syncInFlight = null;

export async function syncDnrState() {
  if (syncInFlight) {
    return syncInFlight;
  }

  syncInFlight = (async () => {
    try {
      const enabled = await getEnabled();

      if (!enabled) {
        await setRulesetsEnabled(false);
        await syncWhitelistRules(false);
        console.log("[DNR] disabled");
        return;
      }

      await setRulesetsEnabled(true);
      await syncWhitelistRules(true);
      console.log("[DNR] enabled");
    } finally {
      syncInFlight = null;
    }
  })();

  return syncInFlight;
}
```

Главная функция модуля. Приводит состояние DNR в соответствие с текущими настройками.

**Что делает:**

1. Читает `enabled` из storage.
2. Если выключено — выключает все ruleset'ы и удаляет whitelist-правила.
3. Если включено — включает ruleset'ы и синхронизирует whitelist-правила.

**Защита от параллельных вызовов (мьютекс).** Переменная `syncInFlight` — если функция уже выполняется, второй вызов возвращает тот же промис, не запуская вторую копию.

**Зачем это нужно.** В главе 4 я рассказывал: `syncDnrState` вызывается из двух мест — при старте service worker'а и при изменении storage. Если пользователь быстро что-то переключит, оба вызова могут стартовать почти одновременно. Оба прочитают «старое» состояние, оба попытаются применить «новое». Результат — race condition, и мы ловили ошибку «Rule with id N does not have a unique ID». Мьютекс решает: второй вызов не запускает свою работу, а ждёт завершения первой.

**`finally`.** Блок выполняется всегда — и при успехе, и при ошибке. Обнуляет `syncInFlight`, чтобы следующий вызов мог запуститься.

## Почему shared, а не в каждой папке

Логичный вопрос: почему эти два файла не лежат, например, в `background/`, если они в основном для service worker'а?

Ответ: их использует и popup. `popup.js` импортирует `MSG` из `shared/messages.js` (не пишет строки руками). Если бы `messages.js` лежал в `background/`, popup зависел бы от фонового кода — странная зависимость.

`shared/` подчёркивает: этот код используется несколькими частями расширения, он не принадлежит ни одной конкретной.

## Почему content scripts не могут использовать shared

В главе 5 разобрано: content scripts не поддерживают `import`. Они не могут подключить `shared/messages.js`.

Мы это обошли так: в `content/lib/inject-css.js` строка типа сообщения захардкожена:

```js
const MSG_TYPE = "cs→sw:getDomainSelectors";
```

Это дублирование строки. Она должна совпадать с `MSG.CS_GET_DOMAIN_SELECTORS` в `shared/messages.js`. Если один раз изменим в одном месте и забудем в другом — сломается тихо.

Альтернатив у нас нет: content scripts физически не могут использовать модули. Приходится мириться. Одно сообщение дублируется — терпимо. Если бы их было десять, стоило бы задуматься о другом подходе (например, сборке через bundler). Пока — простая константа в начале файла.

## Что дальше

Следующая глава — про DNR и конвертер. Разберём, что такое декларативные правила, как устроен `rules/ads.json`, как конвертер превращает EasyList в наш формат и почему у каждого ruleset'а свой диапазон id.