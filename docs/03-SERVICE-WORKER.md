# Глава 4. Service worker — «мозг» расширения

## Зачем эта глава

Service worker — это центральная часть расширения. Он работает в фоне, знает обо всех вкладках, управляет правилами блокировки, отвечает на сообщения. Без него расширение — просто набор файлов.

В этой главе разберём:
- Что такое service worker и почему он засыпает.
- Что делает наш `service_worker.js` — построчно.
- Что делают модули в `background/lib/`.
- Почему события регистрируются синхронно на верхнем уровне.
- Как service worker реагирует на навигацию, сообщения и изменения настроек.

## Что такое service worker

Service worker — это фоновый JavaScript-скрипт. Chrome запускает его сам, без открытия страницы. Он живёт пока есть события, а потом засыпает.

Аналогия: это диспетчер на заводе. Его не видно из цеха. Он сидит в отдельной комнате. Когда что-то происходит (звонок, авария, плановое событие) — он просыпается, делает дело и снова засыпает. Диспетчер не держит в голове всё сразу — если нужно помнить, он записывает в журнал (`chrome.storage`).

### Как service worker просыпается

Chrome будит service worker, когда происходит что-то, на что тот подписан:
- Пользователь открыл новую страницу (`webNavigation.onCommitted`).
- Popup отправил сообщение (`runtime.onMessage`).
- Изменились настройки в хранилище (`storage.onChanged`).

Между событиями service worker спит. В MV3 он не работает постоянно, как в MV2 — это сделано для экономии памяти.

### Что происходит при пробуждении

Chrome запускает `service_worker.js` с нуля. Как будто первый раз. Значит:
- Все переменные обнуляются.
- Все `console.log` в начале файла выполняются снова.
- Все слушатели регистрируются заново.
- Затем обрабатывается то событие, из-за которого worker проснулся.

Важное следствие: нельзя хранить состояние в переменных service worker'а. Переменные обнулятся при следующем засыпании. Всё, что нужно помнить — пишем в `chrome.storage`.

Пример:
```js
// ❌ Плохо — переменная обнулится
let counter = 0;

chrome.runtime.onMessage.addListener(() => {
  counter++;  // может быть 1, 1, 1, 1... — worker каждый раз засыпает
});

// ✅ Хорошо — состояние в storage
chrome.runtime.onMessage.addListener(async () => {
  const { counter = 0 } = await chrome.storage.local.get("counter");
  await chrome.storage.local.set({ counter: counter + 1 });
});
```

## Структура background/

```
background/
├── service_worker.js        ← тонкий оркестратор, точка входа
└── lib/
    ├── cosmetic-injector.js ← вставка CSS на страницы
    ├── cosmetic-map.js      ← карта domain-селекторов
    └── message-handler.js   ← обработка сообщений
```

`service_worker.js` — точка входа. Он подключает модули и регистрирует слушателей. Вся логика — в `lib/`.

## Построчный разбор service_worker.js

### Импорты

```js
import { syncDnrState } from "../shared/storage.js";
import { handleCommitted } from "./lib/cosmetic-injector.js";
import { registerMessageHandler } from "./lib/message-handler.js";
```

Импортируем всё, что нужно для регистрации слушателей и первоначальной настройки.

- `syncDnrState` из `shared/storage.js` — функция, которая приводит DNR-правила в соответствие с текущими настройками.
- `handleCommitted` из `lib/cosmetic-injector.js` — обработчик события «страница начала загружаться».
- `registerMessageHandler` из `lib/message-handler.js` — регистрирует обработчик сообщений.

Почему service worker использует `import`, а не `require`: в `manifest.json` указан `"type": "module"` в блоке `background`. Это делает файл ES-модулем.

### Лог о старте

```js
console.log("[erst_dev_adblocker] service worker started");
```

Просто лог. Он выполняется при каждом пробуждении service worker'а — не только при установке расширения.

Зачем: в отладке видно, что worker жив. Если в Console service worker'а этой строки нет — значит, worker не запустился (ошибка в синтаксисе, или Chrome не читает манифест).

### Инициализация DNR

```js
syncDnrState().catch((e) => {
  console.error("[erst_dev_adblocker] syncDnrState failed:", e);
});
```

При старте service worker'а вызываем `syncDnrState()` — она читает настройки (`enabled`, список исключений) и включает/выключает DNR-правила в соответствии с ними.

Почему при старте: Chrome может перезапустить service worker в любой момент (после засыпания). Значит, каждый раз при пробуждении надо привести DNR-состояние в актуальный вид — на случай, если настройки менялись, пока worker спал.

Почему `.catch`: `syncDnrState` асинхронная. Если в ней что-то упадёт — ошибка не должна убить worker. Ловим и логируем.

Подробно про `syncDnrState`: глава 9.

### Реакция на изменения хранилища

```js
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.enabled || changes.whitelist) {
    syncDnrState().catch((e) => {
      console.error("[erst_dev_adblocker] syncDnrState (onChanged) failed:", e);
    });
  }
});
```

Слушаем изменения в `chrome.storage.local`. Если изменилось поле `enabled` или `whitelist` — вызываем `syncDnrState`, чтобы привести DNR-правила в соответствие.

Зачем: popup не вызывает `syncDnrState` напрямую, он только пишет в storage. А service worker реагирует на это изменение. Так избегается race condition (см. главу 9).

Разбор:

- `chrome.storage.onChanged` — событие «в хранилище что-то изменилось».
- `(changes, area)` — `changes` — объект с изменениями (`{ enabled: { oldValue, newValue }, ... }`), `area` — область хранилища (`local`, `sync`, `managed`).
- `if (area !== "local") return;` — нас интересует только `local` (у нас всё там).
- `if (changes.enabled || changes.whitelist)` — реагируем только на эти два поля. Если изменилось что-то другое — не дёргаем DNR лишний раз.

### Вставка CSS при навигации

```js
chrome.webNavigation.onCommitted.addListener(
  handleCommitted,
  { url: [{ schemes: ["http", "https"] }] }
);
```

Подписываемся на событие «страница начала загружаться» — то самое, при котором нужно вставлять CSS.

Разбор:

- `chrome.webNavigation.onCommitted` — событие «браузер принял решение показать новую страницу». Это середина между «пользователь кликнул ссылку» и «страница полностью загрузилась».
- `handleCommitted` — функция из `cosmetic-injector.js`. Она проверит `enabled` и whitelist, вставит CSS.
- Второй аргумент — фильтр: `{ url: [{ schemes: ["http", "https"] }] }` говорит «вызывай `handleCommitted` только для http/https URL». Это отсекает `chrome://`, `about:`, `file://` — на них `insertCSS` всё равно работать не будет.

Почему `onCommitted`, а не `onCompleted`: `onCommitted` срабатывает раньше — до того, как страница отрисуется. Так наш CSS успевает примениться до того, как пользователь увидит рекламу. С `onCompleted` реклама бы мигнула.

Почему `handleCommitted` — отдельная функция: она проверяет `frameId !== 0` (чтобы не вставлять CSS во все фреймы 100 раз) и логирует ошибки. Всё это вынесено в модуль — здесь только регистрация.

### Обработчик сообщений

```js
registerMessageHandler();
```

Регистрирует `chrome.runtime.onMessage.addListener` — обработчик сообщений от popup и content script.

Почему одной функцией: чтобы `service_worker.js` оставался тонким. Вся логика в `lib/message-handler.js`.

## Разбор модулей background/lib/

### `cosmetic-injector.js` — вставка CSS

Что делает: вставляет общий CSS (`cosmetic.css` + `cosmetic-manual.css`) в страницы при навигации.

Публичные функции:

#### `handleCommitted(details)`

```js
export async function handleCommitted(details) {
  if (details.frameId !== 0) return;

  try {
    const enabled = await getEnabled();
    if (!enabled) return;

    const whitelisted = await isWhitelisted(details.url);
    if (whitelisted) return;

    await chrome.scripting.insertCSS({
      target: { tabId: details.tabId },
      files: COSMETIC_CSS
    });
  } catch (e) {
    console.error("[erst_dev_adblocker] insertCSS failed:", e);
  }
}
```

Пошагово:

1. `if (details.frameId !== 0) return;` — обрабатываем только главный фрейм.

   **Что такое фрейм.** Каждая вкладка — это набор фреймов. Главный фрейм (сама страница) имеет `frameId: 0`. Каждый `<iframe>` внутри страницы — свой отдельный фрейм с номером 1, 2, 3...

   **Откуда берутся фреймы.** Даже на простом сайте их обычно несколько:
   - рекламные iframe (AdFox, РСЯ — часто вставляют баннеры через `<iframe>`);
   - видеоплееры (YouTube, VK Video, RuTube);
   - кнопки «Поделиться» в соцсети;
   - карты (Яндекс.Карты, Google Maps);
   - капча (Google reCAPTCHA);
   - виджеты отзывов, чатов, погоды;
   - вложенные iframe — внутри одного фрейма может быть ещё один.

   **Сколько их бывает.** На новостном сайте — 8–15 фреймов. На тяжёлых медиа-сайтах — до 50 и больше.

   **Почему нужно проверять.** Событие `chrome.webNavigation.onCommitted` срабатывает на каждый фрейм отдельно. Если на странице 11 фреймов — событие выстрелит 11 раз (по одному на каждый). Без проверки `frameId !== 0` наш обработчик вызовется 11 раз.

   **Что произойдёт без проверки.** Наш `insertCSS` вызывается с `target: { tabId }` — без указания `frameIds`. Это значит: Chrome вставляет CSS во ВСЕ фреймы вкладки за один вызов. Если мы вызовем его 11 раз подряд:
   - Событие 1 → insertCSS во все 11 фреймов
   - Событие 2 → insertCSS во все 11 фреймов
   - ...
   - Событие 11 → insertCSS во все 11 фреймов

   Итого каждый фрейм получит CSS 11 раз. CSS не сломается от повторов (правило `display: none` не удвоится), но нагрузка на процесс реальная — Chrome 121 раз прогоняет операцию вставки вместо 11.

   **Почему «один раз — достаточно».** Когда срабатывает событие для главного фрейма (`frameId: 0`), мы вызываем `insertCSS` с `target: { tabId }` без `frameIds`. Chrome вставляет CSS сразу во все фреймы вкладки — и в главный, и во все iframe. Один вызов уже покрывает всё. Отсюда проверка: работаем только на `frameId === 0`, игнорируем остальные события.

2. `if (!enabled) return;` — если расширение выключено, ничего не делаем.

3. `if (whitelisted) return;` — если сайт в списке исключений, ничего не делаем.

4. `chrome.scripting.insertCSS({...})` — вставляем CSS. `target: { tabId }` без `frameIds` — вставляет во все фреймы вкладки за один вызов.

#### `COSMETIC_CSS`

```js
const COSMETIC_CSS = [
  "content/cosmetic.css",
  "content/cosmetic-manual.css"
];
```

Массив файлов CSS, которые вставляем.
- `cosmetic.css` — генерируется конвертером, ~14 000 общих селекторов.
- `cosmetic-manual.css` — ручные правила (AdFox, РСЯ, Mail.ru, Dzen и т.д.).

### `cosmetic-map.js` — карта domain-селекторов

Что делает: загружает `rules/cosmetic-map.json` в память (один раз) и по домену находит нужные селекторы.

Публичные функции:

#### `loadCosmeticMap()`

```js
let cosmeticMapCache = null;

export async function loadCosmeticMap() {
  if (cosmeticMapCache) return cosmeticMapCache;
  const url = chrome.runtime.getURL("rules/cosmetic-map.json");
  const response = await fetch(url);
  cosmeticMapCache = await response.json();
  console.log(`[erst_dev_adblocker] cosmetic map loaded: ${Object.keys(cosmeticMapCache).length} domains`);
  return cosmeticMapCache;
}
```

При первом вызове читает `rules/cosmetic-map.json` (несколько МБ) через `fetch` и кэширует в переменной. При последующих — отдаёт из кэша.

**Сколько весит файл.** Несколько мегабайт — в нём 12 832 домена и ~31 000 селекторов в сумме. `JSON.parse` на таком объёме занимает десятки миллисекунд, плюс само чтение через `fetch`.

**Зачем кэш.** Content script запрашивает селекторы при каждом переходе на новую страницу (SPA-навигация внутри сайта — тоже переход). На одном сайте за минуту может быть 10-20 переходов. Без кэша каждый переход = повторное чтение и парсинг файла, это десятки миллисекунд на каждый запрос. С кэшем — только первый запрос читает файл, остальные получают готовый объект из памяти за миллисекунды.

**Когда кэш обнуляется.** Service worker засыпает через 30 секунд бездействия — то есть когда нет событий. Как только приходит следующее событие (новая страница, новое сообщение), Chrome перезапускает `service_worker.js` с нуля, и переменная `cosmeticMapCache` обнуляется — карта загрузится заново при первом запросе.

**Что это значит на практике.** Кэш живёт в пределах активной сессии — пока пользователь активно ходит по сайтам. Пока он работает, все переходы внутри сайта используют закэшированную карту. Когда пользователь закрыл браузер или ушёл на 10 минут — кэш сбрасывается, но это не проблема: следующая сессия начнётся с нового чтения файла один раз.

#### `findSelectorsForDomain(map, hostname)`

```js
export function findSelectorsForDomain(map, hostname) {
  const parts = hostname.split(".");
  const candidates = [];
  for (let i = 0; i < parts.length; i++) {
    candidates.push(parts.slice(i).join("."));
  }

  const result = new Set();
  for (const c of candidates) {
    const list = map[c];
    if (list) for (const s of list) result.add(s);
  }
  return [...result];
}
```

Для домена `www.rbc.ru` ищет селекторы в карте для трёх возможных ключей: `www.rbc.ru`, `rbc.ru`, `ru`. Собирает всё, что нашёл, в один массив без дубликатов.

Зачем три ключа: правила в EasyList могут быть привязаны и к поддомену, и к основному домену. Мы ищем все совпадения.

### `message-handler.js` — обработка сообщений

Что делает: принимает сообщения от popup и content script, выполняет действия, отвечает.

Публичные функции:

#### `registerMessageHandler()`

Регистрирует `chrome.runtime.onMessage.addListener`.

Обрабатывает пять типов сообщений:

| Тип | Откуда | Что делает |
|---|---|---|
| `cs→sw:getDomainSelectors` | content script | Возвращает domain-specific селекторы для URL |
| `popup→sw:getState` | popup | Возвращает enabled + whitelist + текущий домен |
| `popup→sw:setEnabled` | popup | Меняет enabled в storage |
| `popup→sw:whitelistAdd` | popup | Добавляет домен в список исключений |
| `popup→sw:whitelistRemove` | popup | Удаляет домен из списка |

Скелет:

```js
export function registerMessageHandler() {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || !isValidMessageType(msg.type)) {
      console.warn("[erst_dev_adblocker] unknown message:", msg);
      return;
    }

    (async () => {
      try {
        switch (msg.type) {
          case MSG.CS_GET_DOMAIN_SELECTORS:
            await handleGetDomainSelectors(msg, sendResponse);
            return;
          // ... остальные case
        }
      } catch (e) {
        console.error("[erst_dev_adblocker] message handler failed:", e);
        sendResponse(null);
      }
    })();

    return true;
  });
}
```

Разбор ключевых моментов:

1. `if (!msg || !isValidMessageType(msg.type))` — проверяем, что сообщение валидное. Защита от опечаток и мусора. `isValidMessageType` — функция из `shared/messages.js` (см. главу 7).

2. `(async () => { ... })();` — оборачиваем асинхронную логику в IIFE. Почему не `async` слушатель напрямую: Chrome API не поддерживает `async`-слушатели — он не поймёт возвращаемое значение. Поэтому внутри слушателя запускаем асинхронную функцию, а снаружи возвращаем `true`.

3. `return true;` — говорит Chrome'у «я отвечу асинхронно, подожди». Без этого `sendResponse` не долетит (см. главу 2).

Что делает каждый handler:

#### `handleGetDomainSelectors`

```js
async function handleGetDomainSelectors(msg, sendResponse) {
  const enabled = await getEnabled();
  if (!enabled) { sendResponse({ selectors: [] }); return; }

  const whitelisted = await isWhitelisted(msg.url);
  if (whitelisted) { sendResponse({ selectors: [] }); return; }

  const map = await loadCosmeticMap();
  const hostname = extractDomain(msg.url);
  if (!hostname) { sendResponse({ selectors: [] }); return; }

  const selectors = findSelectorsForDomain(map, hostname);
  sendResponse({ selectors });
}
```

Проверяет `enabled` и whitelist, загружает карту, находит селекторы для домена, отвечает.

Если что-то не так (расширение выключено, сайт в whitelist, домен не распарсился) — отвечает пустым массивом. Content script не вставит ничего.

#### `handleGetState`

```js
async function handleGetState(msg, sendResponse) {
  const enabled = await getEnabled();
  const whitelist = await getWhitelist();
  let currentDomain = null;
  if (msg.url) currentDomain = extractDomain(msg.url);
  sendResponse({ enabled, whitelist, currentDomain });
}
```

Возвращает popup'у текущее состояние.

#### `handleSetEnabled` / `handleWhitelistAdd` / `handleWhitelistRemove`

Меняют настройки в storage. НЕ вызывают `syncDnrState` — это делает `storage.onChanged` (см. выше).

## Почему service worker такой

Может возникнуть вопрос: почему так сложно? Почему не один файл?

Ответ: потому что задач несколько — и они разные. Смешивать их в одном файле — каша. Мы разбили по ролям:
- `cosmetic-injector.js` — про вставку CSS.
- `cosmetic-map.js` — про карту селекторов.
- `message-handler.js` — про сообщения.

`service_worker.js` не делает ничего сам — он регистрирует модули и инициализирует состояние при старте. Это делает файл читаемым за минуту.

## Важное правило про слушатели

Регистрация слушателей должна быть синхронной — на верхнем уровне файла.

Правильно:
```js
chrome.webNavigation.onCommitted.addListener(handleCommitted);

chrome.runtime.onMessage.addListener(handler);
```

Неправильно:
```js
chrome.storage.local.get("enabled").then(({ enabled }) => {
  if (enabled) {
    chrome.webNavigation.onCommitted.addListener(handleCommitted);
  }
});
```

Почему: Chrome не знает, что service worker собирается зарегистрировать слушателя после асинхронной операции. Chrome запустил worker для обработки события — если слушателя нет сразу, worker заснёт до того, как слушатель появится. Событие потеряется.

В нашем коде все слушатели зарегистрированы на верхнем уровне — правильно.

## Что дальше

Следующая глава — про content scripts. Разберём, почему их семь файлов, почему они не используют `import`/`export`, и что делает каждый.