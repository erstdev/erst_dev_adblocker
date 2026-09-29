# Глава 6. Popup — «лицо» расширения

## Зачем эта глава

Popup — единственная часть расширения, которую пользователь видит. Всё остальное работает в фоне. Здесь — переключатель, список исключений, кнопки.

Но у popup есть особенность: он живёт только пока открыт. Закрылся — умер. Никакой памяти между открытиями. Всё, что нужно помнить, он спрашивает у service worker'а каждый раз заново.

В этой главе разберём:
- Что такое popup и как он устроен.
- Почему в popup можно `import`, а в content scripts — нет.
- Три файла: HTML, CSS, JS.
- Как popup общается с service worker'ом.
- Какой жизненный цикл у popup.

## Что такое popup

Popup — это маленькая HTML-страница, которая открывается при клике на иконку расширения в тулбаре Chrome. Она показывается под иконкой, размер — примерно 300x400 пикселей (у нас 280 в ширину).

В `manifest.json` popup задан так:

```json
"action": {
  "default_title": "erst_dev_adblocker",
  "default_popup": "popup/popup.html"
}
```

При клике на иконку Chrome читает `popup/popup.html`, загружает все его стили и скрипты, отображает. При закрытии (клик вне popup, Esc, переход на другую вкладку) — Chrome выгружает страницу полностью.

Особенность жизненного цикла: popup не работает в фоне. Открыт — работает. Закрылся — умер. Никакого долгого состояния в popup хранить нельзя.

## Что умеет popup

В нашем случае popup — это панель управления. Здесь пользователь:

- Видит, включено ли расширение.
- Может переключить расширение вкл/выкл.
- Видит список сайтов-исключений (на которых блокировка отключена).
- Может добавить текущий сайт в список.
- Может удалить любой сайт из списка.

Всё это — через UI. Логика — в service worker'е, popup только показывает и отправляет команды.

## Почему в popup можно import

Помнишь, в главе 5 я объяснял, что content scripts не поддерживают `import` — потому что Chrome выполняет их как обычные скрипты?

С popup другая ситуация. Popup — это **настоящая HTML-страница**. В ней можно использовать `<script type="module" src="popup.js">`, и тогда `popup.js` становится ES-модулем с полной поддержкой `import`/`export`.

У нас в `popup.html` именно так:

```html
<script type="module" src="popup.js"></script>
```

Значит, в `popup.js` мы можем написать:

```js
import { MSG } from "../shared/messages.js";
```

и использовать типы сообщений из общего модуля. Никаких дублирований строк, как в content scripts.

Это архитектурная разница: content scripts — ограниченная среда без модулей, popup — полноценная страница с модулями.

## Структура popup/

```
popup/
├── popup.html
├── popup.css
└── popup.js
```

Три файла — минимум для любого UI. HTML — структура, CSS — внешний вид, JS — логика.

Мы не разбивали popup на модули вроде `popup/lib/`. Причина: файл `popup.js` короткий (~150 строк), разбивать нечего. Если разрастётся до 300+ строк — можно будет разбить, но сейчас это было бы искусственно.

## popup.html — структура

```html
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>erst_dev_adblocker</title>
  <link rel="stylesheet" href="popup.css">
</head>
<body>

  <div class="header">
    <h1>erst_dev_adblocker</h1>
    <div class="version">v0.7 — dev build</div>
  </div>

  <label class="toggle-switch">
    <input type="checkbox" id="enabled-toggle">
    <span class="toggle-slider"></span>
    <span class="toggle-label" id="toggle-label">Включено</span>
  </label>

  <div class="section">
    <div class="section-title">Белый список</div>
    <div id="whitelist-empty" class="empty">Список пуст</div>
    <ul id="whitelist" class="whitelist"></ul>
    <button id="add-current" class="btn-add">+ Добавить текущий сайт</button>
  </div>

  <div class="note">
    На сайтах из белого списка реклама не блокируется.
  </div>

  <script type="module" src="popup.js"></script>
</body>
</html>
```

Разберём блоки.

**Head.** Стандартный HTML-заголовок. Подключаем `popup.css`. Метатег charset — обязательно UTF-8, иначе русские буквы превратятся в кракозябры.

**Шапка (.header).** Название расширения и версия. Версия дублирует значение из `manifest.json`, но вручную — мы не тянем её через API. Если обновим версию в манифесте, надо не забыть обновить здесь. Плата за простоту.

**Переключатель (.toggle-switch).** Кастомный toggle вместо стандартного чекбокса. Разметка:

- `<input type="checkbox">` — настоящий чекбокс, но скрытый через CSS (`opacity: 0`). Он хранит состояние и принимает клики.
- `<span class="toggle-slider">` — визуальный ползунок. Стилизуется через CSS, показывает, включён ли toggle.
- `<span class="toggle-label">` — текстовая подпись справа («Включено»/«Выключено»). Меняется через JS при переключении.

Почему кастомный, а не стандартный чекбокс: визуально приятнее, выглядит как в мобильных ОС. Стандартный чекбокс в Chrome смотрится устаревшим.

**Секция белого списка (.section).** Здесь:

- `<div id="whitelist-empty">` — показывается, когда список пуст. Скрывается через JS, когда список непустой.
- `<ul id="whitelist">` — сюда JS добавляет `<li>` с доменами и кнопками удаления.
- `<button id="add-current">` — кнопка добавления текущего сайта. Текст и disabled-состояние меняются через JS в зависимости от ситуации.

**Подсказка (.note).** Текст мелким шрифтом внизу. Объясняет, что происходит с сайтами в белом списке.

**Скрипт.** В конце `<body>` — подключение `popup.js` как ES-модуля. Именно `type="module"` даёт нам право использовать `import` внутри.

## popup.css — стили

CSS не буду разбирать построчно — там ничего уникального. Три особенности стоит отметить.

Первое — тёмная тема. У нас `background: #1e1e1e`, текст `#eee`, акценты `#4ade80`. Это соответствует тёмной теме Chrome Web Store и выглядит современно.

Второе — кастомный toggle. Настоящий `<input>` скрыт, визуальный `<span class="toggle-slider">` стилизован под ползунок. Состояние `checked` переключает фон слайдера и позицию кружка:

```css
.toggle-switch input[type="checkbox"]:checked + .toggle-slider {
  background: #4ade80;
}

.toggle-switch input[type="checkbox"]:checked + .toggle-slider::before {
  transform: translateX(16px);
}
```

Селектор `+` — соседний элемент. Когда чекбокс `checked`, следующий за ним `.toggle-slider` получает зелёный фон. Кружок внутри сдвигается вправо на 16 пикселей. Остальное делает анимация перехода (`transition`).

Третье — элементы списка. Каждый `<li>` — flex-контейнер с доменом слева и кнопкой удаления справа. Кнопка удаления — просто «×» без фона, красного цвета.

## popup.js — логика

Разберём файл.

### Импорт и алиасы

```js
import { MSG } from "../shared/messages.js";

const $ = (id) => document.getElementById(id);

let currentDomain = null;
```

Первый импорт — типы сообщений из общего модуля. Благодаря `type="module"` в HTML это работает.

`$` — короткий алиас для `document.getElementById`. Позволяет писать `$("whitelist")` вместо `document.getElementById("whitelist")`. Экономит место и делает код читаемым.

`currentDomain` — переменная модуля. Хранит домен активной вкладки, на которой открыт popup. Устанавливается в `loadState` и используется в `updateAddButton`.

Почему переменная модуля, а не свойство объекта: popup маленький, всего одна глобальная переменная нужна. Усложнять не стали.

### loadState() — загрузка при открытии

```js
async function loadState() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tab?.url || null;

    const state = await chrome.runtime.sendMessage({
      type: MSG.POPUP_GET_STATE,
      url
    });

    if (!state) return;

    currentDomain = state.currentDomain;

    $("enabled-toggle").checked = state.enabled;
    $("toggle-label").textContent = state.enabled ? "Включено" : "Выключено";

    renderWhitelist(state.whitelist);
    updateAddButton(state.whitelist);
  } catch (e) {
    console.error("loadState failed:", e);
  }
}
```

Главная функция, вызывается при открытии popup. Пошагово:

**`chrome.tabs.query({ active: true, currentWindow: true })`** — просим у Chrome активную вкладку в текущем окне. Возвращает массив (потому что может быть несколько подходящих), деструктурируем — берём первую.

**`tab?.url || null`** — опциональная цепочка. На некоторых страницах (`chrome://`, `about:`) у вкладки может не быть URL. Тогда `tab.url` будет `undefined`, превращаем в `null`.

**`chrome.runtime.sendMessage(...)`** — отправляем service worker'у запрос. Тип `MSG.POPUP_GET_STATE`, payload — `url`. Возвращает объект вида `{ enabled, whitelist, currentDomain }`.

**`if (!state) return;`** — если service worker не ответил (например, упал), ничего не делаем. Popup покажется пустым, но не сломается.

**Заполняем UI:**

- `currentDomain` — сохраняем для кнопки «Добавить».
- `enabled-toggle.checked` — устанавливаем состояние свитчера.
- `toggle-label.textContent` — текст «Включено» или «Выключено».
- `renderWhitelist` — рисуем список.
- `updateAddButton` — настраиваем кнопку.

**try/catch** — на случай, если что-то упадёт. Логируем, но не показываем ошибку пользователю.

### renderWhitelist(list) — рисуем список

```js
function renderWhitelist(list) {
  const ul = $("whitelist");
  const empty = $("whitelist-empty");
  ul.innerHTML = "";

  if (!list || list.length === 0) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  for (const domain of list) {
    const li = document.createElement("li");

    const span = document.createElement("span");
    span.textContent = domain;

    const btn = document.createElement("button");
    btn.textContent = "×";
    btn.title = "Удалить";
    btn.addEventListener("click", () => removeDomain(domain));

    li.appendChild(span);
    li.appendChild(btn);
    ul.appendChild(li);
  }
}
```

Функция рисует список доменов.

**`ul.innerHTML = ""`** — очищаем список перед отрисовкой. Это самый быстрый способ удалить всех детей. Альтернатива — `while (ul.firstChild) ul.removeChild(ul.firstChild)`, но она медленнее.

**Пустой список.** Если `list` пустой — показываем `<div id="whitelist-empty">`, выходим. `<ul>` останется пустым, но не видимым.

**Непустой список.** Скрываем заглушку. Для каждого домена создаём:

- `<li>` — строку списка.
- `<span>` с текстом домена.
- `<button>` с «×» и обработчиком клика.

**Обработчик клика** — замыкание. `() => removeDomain(domain)` — при клике вызовется `removeDomain` с конкретным доменом. Замыкание захватывает `domain` из цикла. Без стрелочной функции `addEventListener("click", removeDomain(domain))` сразу вызвал бы `removeDomain`, а не подписал на клик.

**Почему не `innerHTML`.** Соблазн собрать HTML строкой и присвоить `ul.innerHTML = "...string..."`. Но тогда обработчики клика надо навешивать после или использовать inline `onclick` (плохо). Через DOM-API код безопаснее (нет XSS-рисков) и обработчики навешиваются сразу.

### updateAddButton(whitelist) — обновляем кнопку «Добавить»

```js
function updateAddButton(whitelist) {
  const btn = $("add-current");

  if (!currentDomain) {
    btn.disabled = true;
    btn.textContent = "Нет активной вкладки";
    return;
  }

  if (whitelist.includes(currentDomain)) {
    btn.disabled = true;
    btn.textContent = `${currentDomain} уже в списке`;
  } else {
    btn.disabled = false;
    btn.textContent = `+ Добавить ${currentDomain}`;
  }
}
```

Три состояния кнопки:

- Нет активной вкладки (пользователь на `chrome://` или `about:`) — кнопка выключена, текст «Нет активной вкладки».
- Домен уже в списке — кнопка выключена, текст «domain уже в списке».
- Домен не в списке — кнопка активна, текст «+ Добавить domain».

Почему три состояния, а не два: без третьего пользователь не понимал бы, что происходит. Если кнопка выключена, а текст «+ Добавить rbc.ru» — непонятно, почему нельзя нажать. С явным текстом «rbc.ru уже в списке» — понятно.

### toggleEnabled() — переключение вкл/выкл

```js
async function toggleEnabled() {
  const checked = $("enabled-toggle").checked;
  $("toggle-label").textContent = checked ? "Включено" : "Выключено";

  await chrome.runtime.sendMessage({
    type: MSG.POPUP_SET_ENABLED,
    value: checked
  });
}
```

Вызывается при изменении свитчера. Что делает:

**Читаем состояние.** `$("enabled-toggle").checked` — текущее состояние.

**Обновляем текст.** Меняем надпись рядом с свитчером.

**Отправляем сообщение.** Service worker получит его и запишет в storage. Потом `storage.onChanged` сработает и синхронизирует DNR-правила.

Почему popup не вызывает `syncDnrState` напрямую: только service worker управляет DNR. Popup пишет в storage, service worker реагирует. Это защита от race condition (подробно — глава 9).

### addCurrent() — добавить текущий сайт

```js
async function addCurrent() {
  if (!currentDomain) return;

  const res = await chrome.runtime.sendMessage({
    type: MSG.POPUP_WHITELIST_ADD,
    domain: currentDomain
  });

  if (res?.ok) {
    renderWhitelist(res.whitelist);
    updateAddButton(res.whitelist);
  }
}
```

Добавляет текущий домен в белый список.

**Проверка currentDomain.** Если домена нет — ничего не делаем.

**Отправка сообщения.** Тип `MSG.POPUP_WHITELIST_ADD`, payload — domain.

**Обработка ответа.** Если `res.ok === true`, service worker вернул обновлённый список. Перерисовываем.

Почему возвращаем список в ответе, а не запрашиваем заново: service worker уже держит его в руках после добавления. Лишний запрос — лишнее сообщение.

### removeDomain(domain) — удалить сайт

```js
async function removeDomain(domain) {
  const res = await chrome.runtime.sendMessage({
    type: MSG.POPUP_WHITELIST_REMOVE,
    domain
  });

  if (res?.ok) {
    renderWhitelist(res.whitelist);
    updateAddButton(res.whitelist);
  }
}
```

Симметрична `addCurrent`. Отправляет запрос на удаление, получает обновлённый список, перерисовывает.

Вызывается из обработчиков кнопок «×» в списке.

### Инициализация

```js
$("enabled-toggle").addEventListener("change", toggleEnabled);
$("add-current").addEventListener("click", addCurrent);

loadState();
```

Три строки в конце файла.

**Первая** — подписка на изменение свитчера. Событие `change` срабатывает при клике по чекбоксу (или по связанному `<label>`).

**Вторая** — подписка на клик по кнопке «+ Добавить».

**Третья** — сразу загружаем состояние. Popup открылся — состояние запрашивается автоматически.

## Жизненный цикл popup

Проследим, что происходит, когда пользователь кликает на иконку.

**Клик на иконку.** Chrome читает `popup.html`, парсит его, загружает `popup.css` и `popup.js` (как модуль).

**Скрипт выполняется.** Подписывается на события. Вызывает `loadState()`.

**loadState спрашивает активную вкладку** через `chrome.tabs.query`.

**Отправляет сообщение service worker'у.** Тип `popup→sw:getState`, payload — URL вкладки.

**Service worker просыпается** (если спал), обрабатывает сообщение, отвечает с `{ enabled, whitelist, currentDomain }`.

**Popup рендерит UI.** Свитчер, список, кнопка.

**Пользователь взаимодействует.** Тыкает свитчер, добавляет или удаляет сайты. Каждое действие — новое сообщение service worker'у.

**Пользователь закрывает popup** (клик вне окна, Esc, переход на другую вкладку). Chrome выгружает `popup.html`, `popup.css`, `popup.js`. Всё состояние в памяти popup теряется. Переменная `currentDomain`, `listener'ы`, ссылки на DOM — всё исчезает.

При следующем открытии popup всё повторится с нуля.

## Что могло бы пойти не так

**Открытие на служебной странице.** `chrome://extensions/` или `about:blank`. `chrome.tabs.query` вернёт вкладку, но её URL может быть `chrome://...`, и service worker не сможет распарсить домен. `currentDomain` будет `null`, кнопка «Добавить» выключена с текстом «Нет активной вкладки». Правильное поведение.

**Service worker не отвечает.** Если по какой-то причине `sendMessage` висит или падает — `loadState` поймает это через try/catch. Popup покажется пустым. Пользователь может перезагрузить popup (закрыть и открыть).

**Опечатка в типе сообщения.** Если в popup написать `MSG.POPUP_GET_STATE_` (с нижним подчёркиванием) — `sendMessage` отправит сообщение, service worker проверит `isValidMessageType` и отклонит как неизвестное. Ничего не произойдёт. Ошибка в Console service worker'а: «unknown message».

**`popup.js` подключён без `type="module"`.** Тогда `import` не сработает — Chrome выдаст ошибку «Cannot use import statement outside a module». Popup будет пустой.

## Что дальше

Следующая глава — про `shared/` — общие модули. Разберём, что внутри `messages.js` и `storage.js`, зачем они общие и почему их не могут использовать content scripts.