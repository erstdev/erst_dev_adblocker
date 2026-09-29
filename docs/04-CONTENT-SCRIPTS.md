# Глава 5. Content scripts — «руки» расширения

## Зачем эта глава

Content scripts — самая объёмная часть проекта. Семь файлов, каждый со своей ролью. Если не понять, зачем их семь и почему в них нет `import`, дальше будет путаница.

В этой главе разберём:
- Что такое content script и почему он не один.
- Почему нельзя использовать `import`/`export` и что делаем вместо.
- Почему порядок файлов в манифесте критичен.
- Построчно каждый из семи файлов.
- Как они работают вместе.

## Что такое content script

Content script — это JavaScript, который Chrome подсовывает в каждую открытую страницу. Он живёт в изолированном мире: видит DOM, но не видит переменные сайта. И наоборот — сайт не видит наши переменные.

В главе 2 мы назвали его «руками» расширения. Service worker — мозг, content script — руки, popup — лицо. Content script работает на конкретной вкладке, ничего не знает о других вкладках, и умирает вместе с ней.

Открыл пять вкладок — работают пять независимых копий content script. Каждая в своём мире, каждая не подозревает о существовании остальных.

## Почему их семь, а не один

Соблазн написать один большой файл — сильный. Всё в одном месте, легко искать, никаких заморочек с порядком.

Но есть две причины, по которым мы разбили код:

Первое — объём. Логика косметики нетривиальная: запрос селекторов, вставка стилей, слежение за SPA, MutationObserver, авто-скип, поиск по тексту. В одном файле это будет 400+ строк, в которых легко заблудиться.

Второе — роли. Каждый файл решает одну задачу. Читаешь имя файла — понимаешь, что внутри. `auto-skip.js` — авто-скип. `ad-markers.js` — поиск по маркерам. `spa.js` — SPA-навигация. Никаких сюрпризов.

## Почему нет import/export

Content scripts не поддерживают ES-модули. Это ограничение Chrome: файлы, указанные в `manifest.json` в `content_scripts.js`, выполняются как обычные скрипты — такие же, как тег `<script>` на странице в 2010-х.

Мы не можем написать в одном файле `export function foo()`, а в другом `import { foo } from "./file.js"`. Chrome такие конструкции в content scripts просто не примет.

Что делаем вместо этого: Chrome выполняет все семь файлов последовательно в одном общем контексте. Как если бы это был один файл, но разбитый на части. Функция, объявленная в первом файле, доступна второму. Переменная из второго — третьему. И так далее.

Технически это означает, что мы не пишем `export` и `import` вообще. Все функции и переменные — просто объявлены на верхнем уровне. Любой следующий файл их видит.

Важное следствие — если два файла объявят функцию с одинаковым именем, вторая перезапишет первую. Никаких ошибок, никаких предупреждений. Тихая замена. Поэтому имена должны быть уникальными.

## Порядок файлов критичен

В `manifest.json` файлы перечислены в определённом порядке:

```json
"js": [
  "content/lib/state.js",
  "content/lib/inject-css.js",
  "content/lib/spa.js",
  "content/lib/observer.js",
  "content/lib/auto-skip.js",
  "content/lib/ad-markers.js",
  "content/domain-cosmetic.js"
]
```

Chrome выполняет их именно в этом порядке. Если поменять местами — сломается.

Почему: каждый следующий файл предполагает, что предыдущие уже загружены и объявили нужные функции.

Пример. `spa.js` вызывает `refreshSelectors` — функцию из `inject-css.js`. Если `spa.js` окажется выше `inject-css.js` в манифесте, Chrome выполнит `spa.js` первым, и в момент объявления функции `watchUrlChanges` ещё ничего не сломается (внутри функции вызов `refreshSelectors`), но при первом же срабатывании SPA-навигации мы получим «refreshSelectors is not defined». Ошибка проявится позже, и искать её будет больно.

Правило простое: сначала инфраструктура, потом использование. `state.js` — самый первый (все используют `state`). `domain-cosmetic.js` — самый последний (он вызывает функции из всех остальных).

## Разбор файлов по порядку

### state.js — общий объект

```js
const state = {
  currentSelectors: [],
  currentUrl: "",
};
```

Это единственный файл, который не объявляет функций. Он объявляет объект `state`, который используют остальные файлы.

Что внутри:

- `currentSelectors` — массив актуальных domain-specific селекторов для текущей страницы. Обновляется при каждой смене URL.
- `currentUrl` — URL, для которого `currentSelectors` актуальны. Нужен, чтобы не перезапрашивать селекторы при каждой навигации, если URL не изменился.

Почему это вынесено в отдельный файл: `state` нужен нескольким файлам одновременно. `inject-css.js` пишет в него новые селекторы. `spa.js` проверяет, изменился ли URL. `observer.js` читает селекторы, чтобы фильтровать новые элементы.

Можно было бы объявить `state` в самом первом файле — например, в `inject-css.js`. Но тогда логика `state` смешалась бы с логикой запроса селекторов. Отдельный файл — чище.

### inject-css.js — запрос селекторов и вставка стилей

Отвечает за две вещи: попросить у service worker селекторы для текущего домена и вставить их в страницу.

Три функции:

#### fetchSelectors(url)

```js
async function fetchSelectors(url) {
  try {
    const response = await chrome.runtime.sendMessage({
      type: MSG_TYPE,
      url
    });
    if (!response || !Array.isArray(response.selectors)) return [];
    return response.selectors;
  } catch (e) {
    console.error("[erst_dev_adblocker] fetchSelectors failed:", e);
    return [];
  }
}
```

Отправляет service worker сообщение `cs→sw:getDomainSelectors` с текущим URL. Получает в ответ массив селекторов. Если что-то пошло не так — возвращает пустой массив.

Константа `MSG_TYPE` объявлена выше в этом же файле:

```js
const MSG_TYPE = "cs→sw:getDomainSelectors";
```

Почему не импортируем из `shared/messages.js`: content scripts не поддерживают `import`. Точное значение строки совпадает с тем, что объявлено в `shared/messages.js` в service worker — важно, чтобы они совпадали. Если один раз изменим одно, а второе забудем — сломается тихо. Это плата за отсутствие модулей.

#### applySelectors(selectors)

```js
function applySelectors(selectors) {
  const existing = document.getElementById(STYLE_ID);
  if (existing) existing.remove();

  if (!selectors || selectors.length === 0) return;

  const css = selectors
    .map((sel) => `${sel} { display: none !important; }`)
    .join("\n");

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = css;

  const target = document.head || document.documentElement;
  if (target) target.appendChild(style);
}
```

Берёт массив селекторов и превращает его в один `<style>`.

Пошагово:

Первое — удаляем предыдущий `<style>`, если он был. Это нужно при SPA-навигации: пользователь перешёл на другую «страницу» того же сайта, селекторы изменились, старый тег стилей больше не актуален. Удаляем, чтобы не накапливать мусор в DOM.

Второе — если селекторов нет, выходим. Нечего вставлять.

Третье — формируем CSS. Каждый селектор превращается в правило `selector { display: none !important; }`. Правила объединяем через `\n` — получается одна большая строка CSS.

Четвёртое — создаём тег `<style>` через обычный `document.createElement`. Это DOM-операция, никаких chrome API. Content script имеет полное право это делать. Присваиваем ему id `erst-domain-cosmetic`, чтобы потом найти и удалить при обновлении.

Пятое — вставляем тег в `<head>`. Если `<head>` ещё не существует (мы запускаемся на `document_start`, страница может быть ещё пустой) — вставляем в `<html>`.

Важно: `!important` в правиле обязателен. Без него inline-стили сайта или его собственные CSS-правила с высокой специфичностью победят. С `!important` — наше правило максимально жёсткое.

#### refreshSelectors(url)

```js
async function refreshSelectors(url) {
  if (url === state.currentUrl) return;
  state.currentUrl = url;

  const selectors = await fetchSelectors(url);
  state.currentSelectors = selectors;
  applySelectors(selectors);

  if (selectors.length > 0) {
    console.log(`[erst-dev] refreshed for ${url}: ${selectors.length} selectors`);
  }
}
```

Комбинирует две предыдущие функции плюс работает с `state`.

Пошагово:

Проверяем, не тот же ли URL. Если да — выходим сразу. Это защита от лишних запросов при SPA-навигации: некоторые фреймворки триггерят `pushState` без реального изменения URL, и мы не хотим каждый раз заново запрашивать селекторы.

Запоминаем новый URL в `state.currentUrl`.

Запрашиваем селекторы у service worker.

Сохраняем их в `state.currentSelectors` — чтобы `observer.js` мог их использовать.

Вставляем `<style>` в страницу.

Логируем, если что-то вставили. Если селекторов 0 — молчим, чтобы не спамить.

Кто вызывает `refreshSelectors`: только `domain-cosmetic.js` (первичная загрузка) и `spa.js` (при смене URL).

### spa.js — слежение за SPA-навигацией

SPA — Single Page Application. Сайты вроде Dzen, Mail.ru, YouTube — это SPA. Пользователь кликает по ссылке, но страница **не перезагружается**. JavaScript меняет содержимое DOM и меняет URL через History API, не выгружая документ.

Проблема: наш content script запускается **один раз** — при загрузке документа. SPA-переход — это не загрузка, а смена содержимого. Событие загрузки не сработает. Значит, для новой «страницы» мы не запросим селекторы и реклама на ней останется видимой.

Решение: слушать сигналы смены URL, которые SPA-сайты вызывают при переходах.

```js
function watchUrlChanges() {
  const notify = () => refreshSelectors(window.location.href);

  const originalPush = history.pushState;
  const originalReplace = history.replaceState;

  history.pushState = function (...args) {
    originalPush.apply(this, args);
    notify();
  };
  history.replaceState = function (...args) {
    originalReplace.apply(this, args);
    notify();
  };

  window.addEventListener("popstate", notify);
  window.addEventListener("hashchange", notify);

  let lastHref = window.location.href;
  setInterval(() => {
    if (window.location.href !== lastHref) {
      lastHref = window.location.href;
      notify();
    }
  }, 1000);
}
```

Разберём.

**Перехват pushState и replaceState.** Эти две функции из History API — то, что SPA-сайты вызывают для смены URL без перезагрузки. Мы не можем «слушать событие», такого нет — но можем заменить функцию своей обёрткой. Внутри обёртки вызываем оригинал (чтобы не сломать поведение сайта) и потом уведомляем себя через `notify()`.

Это допустимая практика, но требует осторожности: если что-то пойдёт не так и наш вызов оригинала не сработает, мы сломаем сайт. Поэтому `originalPush.apply(this, args)` — точное воспроизведение стандартного поведения.

**Слушатели popstate и hashchange.** Это настоящие события, их просто слушаем. `popstate` срабатывает при «назад/вперёд», `hashchange` — при смене хэша в URL (старый способ навигации на SPA).

**Периодическая проверка.** Раз в секунду сравниваем текущий URL с сохранённым. Если изменился — значит, какой-то фреймворк сменил URL без событий (такое бывает, хотя и редко). Этот пункт — страховка.

Без периодической проверки можно было бы обойтись — 99% сайтов используют `pushState` или `popstate`. Но 1% может быть хитрее.

Минус этой проверки: `setInterval` работает всегда, пока вкладка открыта. Каждую секунду выполняется чтение `window.location.href` и сравнение строк — нагрузка незаметная, но не нулевая.

### observer.js — слежение за новыми элементами

MutationObserver — это API браузера, который умеет вызывать функцию при изменении DOM. Например, когда сайт добавил новый элемент.

Зачем нам: доменные селекторы вставляются в `<style>` один раз. Но некоторые селекторы (особенно с `:has()`) плохо срабатывают на динамически добавленных элементах. Плюс мы хотим гарантию: даже если CSS по какой-то причине не сработал, новый элемент всё равно будет скрыт.

```js
function startObserver() {
  if (state.currentSelectors.length === 0) return;

  const observer = new MutationObserver((mutations) => {
    if (state.currentSelectors.length === 0) return;
    const combinedSelector = state.currentSelectors.join(",");

    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue;

        try {
          if (node.matches?.(combinedSelector)) {
            node.style.setProperty("display", "none", "important");
          }
          const matches = node.querySelectorAll?.(combinedSelector);
          if (matches && matches.length > 0) {
            matches.forEach((el) => {
              el.style.setProperty("display", "none", "important");
            });
          }
        } catch (e) {
          // Некоторые селекторы (например, с :has()) невалидны для matches().
        }
      }
    }
  });

  observer.observe(document.documentElement || document, {
    childList: true,
    subtree: true
  });

  console.log("[erst-dev] MutationObserver started");
}
```

Разберём.

**Проверка в начале.** Если у нас нет селекторов — нет смысла начинать наблюдение. Уйдём сразу.

**Создание observer'а.** `new MutationObserver(callback)` — callback вызывается при каждом изменении DOM. В нашем случае — при добавлении новых элементов.

**Объединённый селектор.** `currentSelectors.join(",")` — превращает массив селекторов в одну строку через запятую. Это стандартный CSS-синтаксис: `[data-ad], .ad-banner, #AD_ROW` означает «любой из этих селекторов».

**Перебор мутаций.** В callback приходит массив `mutations` — каждое изменение. Внутри перебираем `addedNodes` — новые узлы.

**Проверка nodeType.** `node.nodeType !== 1` — пропускаем всё, что не элементы (текстовые узлы, комментарии). Нас интересуют только элементы.

**Проверка через matches.** `node.matches(combinedSelector)` — вернёт true, если сам добавленный узел подходит под селектор. Тогда скрываем его через inline-стиль.

**Проверка через querySelectorAll.** Если сам узел не подошёл, но внутри него могли быть подходящие элементы — `node.querySelectorAll(combinedSelector)` найдёт их. Это нужно, когда сайт добавил сразу большой кусок разметки с рекламой внутри.

**Почему inline-стиль, а не через `<style>`.** Селектор в `<style>` уже вставлен (в `inject-css.js`). CSS применяется автоматически к новым элементам. Но у нас были случаи (особенно с `:has()`), когда CSS не срабатывает на динамике. Inline-стиль `style.setProperty("display", "none", "important")` — жёсткий и гарантированный. Он перебьёт любые правила сайта.

**try/catch.** Некоторые селекторы валидны в CSS (`:has(...)`), но невалидны для метода `matches()` (в старых браузерах). Тогда `matches` бросит исключение. Мы его ловим и продолжаем — для остальных селекторов функция всё равно сработает.

**observe.** Начинаем слушать `document.documentElement` (или `document`) с опциями:
- `childList: true` — следим за добавлением/удалением детей.
- `subtree: true` — не только прямые дети, а вся глубина.

Без `subtree` мы видели бы только новые элементы на верхнем уровне. Реклама обычно появляется глубоко, поэтому нужен `subtree`.

### auto-skip.js — авто-скип рекламы в видео

Самое прикладное из всего, что есть в проекте. Пре-роллы и мид-роллы в видео (YouTube, VK, RuTube) невозможно ни заблокировать, ни скрыть — они склеены с видео на сервере. Единственное, что можно — нажать кнопку «Пропустить» быстрее пользователя.

```js
const SKIP_SELECTORS = [
  '[data-testid="ad-skip-button"]',
  '.ytp-ad-skip-button',
  '.ytp-skip-ad-button',
  '.ytp-ad-skip-button-modern',
  '[class*="skip-ad"]',
];

function trySkip() {
  for (const sel of SKIP_SELECTORS) {
    try {
      const btn = document.querySelector(sel);
      if (btn && !btn.disabled) {
        btn.click();
        console.log(`[erst-dev] ad skipped: ${sel}`);
        return;
      }
    } catch (e) {
      // ignore invalid selector
    }
  }
}

function startAutoSkip() {
  setInterval(trySkip, 1000);
}
```

Массив `SKIP_SELECTORS` — все известные варианты кнопок «Пропустить». Комментарий в коде поясняет, откуда какой:

- `[data-testid="ad-skip-button"]` — VK Video.
- `.ytp-ad-skip-button` — YouTube, старый класс.
- `.ytp-skip-ad-button` — YouTube, новый.
- `.ytp-ad-skip-button-modern` — YouTube, ещё одна версия.
- `[class*="skip-ad"]` — универсальный шаблон для любых сайтов.

Функция `trySkip` идёт по селекторам, ищет первый подходящий элемент на странице. Если нашёл и он не заблокирован (`!btn.disabled`) — кликает и выходит.

Почему `return` после клика: мы нажали кнопку, задача выполнена. Не надо проверять остальные селекторы.

Почему `try/catch` вокруг `querySelector`: некоторые селекторы могут быть невалидны в конкретных браузерах, тогда `querySelector` выбросит исключение. Оборачиваем, чтобы продолжить проверку других.

`startAutoSkip` запускает `trySkip` раз в секунду. Не чаще — потому что клик по кнопке пропуска происходит не мгновенно, у плеера есть анимация. Раз в секунду — оптимально: достаточно быстро, чтобы пропустить рекламу за секунду, но не настолько часто, чтобы грузить процессор.

Минус интервала: реклама всё равно проигрывается от нуля до секунды, пока не сработает проверка. В идеале — использовать MutationObserver для мгновенной реакции. Но это добавит сложности и лишний слушатель на каждую страницу. Мы выбрали простой путь: реклама мигнёт максимум на секунду, а обычно меньше.

### ad-markers.js — скрытие по текстовым маркерам

Многие сайты помечают нативную рекламу текстовой меткой. Mail.ru пишет «Реклама» в углу. Dzen — «Промо». Яндекс — «Спонсор».

Мы можем искать эти текстовые метки и скрывать родительский блок целиком. Это работает там, где обфусцированные классы бесполезны — мы не знаем, как называются элементы, но знаем, что внутри есть слово «Реклама».

```js
const AD_TEXT_MARKERS = [
  "реклама",
  "промо",
  "спонсор",
  "рекламный",
  "партнёрский материал",
  "advertisement",
  "sponsored",
];

function hideAdMarkers() {
  if (!document.body) return;

  const candidates = document.querySelectorAll("span, div, a");
  for (const el of candidates) {
    if (el.style.display === "none") continue;

    for (const node of el.childNodes) {
      if (node.nodeType !== Node.TEXT_NODE) continue;

      const text = (node.textContent || "").trim().toLowerCase();
      if (text.length === 0 || text.length > 30) continue;

      if (AD_TEXT_MARKERS.includes(text)) {
        let target = el;
        for (let i = 0; i < 3 && target.parentElement; i++) {
          target = target.parentElement;
        }
        target.style.setProperty("display", "none", "important");
        console.log(`[erst-dev] hid ad marker block: "${text}"`);
        break;
      }
    }
  }
}

function startAdMarkerHiding() {
  const run = () => {
    try {
      hideAdMarkers();
    } catch (e) {
      console.error("[erst_dev_adblocker] hideAdMarkers failed:", e);
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }

  setInterval(run, 2000);
}
```

Разберём.

**Массив маркеров.** Все варианты текста, которые считаем признаком рекламы. В нижнем регистре, потому что сравниваем с приведённым к нижнему регистру текстом.

**Перебор кандидатов.** Берём все `span`, `div`, `a` на странице. Другие теги (`section`, `article`, `img`) нам не нужны — текстовые метки обычно в `span` или коротких `div`.

**Пропускаем уже скрытые.** `el.style.display === "none"` — если элемент уже скрыт, не тратим на него время.

**Проверяем только прямые текстовые узлы.** `el.childNodes` содержит всё, включая вложенные элементы. Нас интересуют только прямые текстовые узлы (`nodeType === Node.TEXT_NODE`). Если внутри `span` есть вложенный `<a>` с текстом — мы его не считаем, потому что это уже не метка, а ссылка.

**Ограничение длины.** `text.length > 30` — пропускаем длинные тексты. Метка «Реклама» — короткая. Абзац «Реклама — двигатель торговли, поэтому мы решили показать вам...» — длинный, это не метка, а контент.

**Точное совпадение с маркером.** `AD_TEXT_MARKERS.includes(text)` — текст должен быть ровно «реклама», не «рекламация» и не «не реклама».

**Подъём на 3 уровня вверх.** От элемента с текстом «Реклама» поднимаемся на 3 родителя вверх. Логика: сам `span` — это маленькая плашка в углу. Родитель — обёртка плашки. Ещё родитель — обёртка карточки. Ещё родитель — сама карточка. Скрываем её.

Почему именно 3 уровня, а не больше: слишком высоко — скроем лишнее (соседние новости, весь блок ленты). Слишком низко — скроем только метку, а сама реклама останется видимой. Три — эмпирически найденная цифра, работает на большинстве сайтов.

**Почему периодически.** Раз в 2 секунды. Реклама подгружается динамически, и мы хотим поймать её в любом случае. Слишком часто (раз в 100 мс) — грузим процессор. Раз в 2 секунды — компромисс.

Первый запуск — сразу после загрузки страницы (`DOMContentLoaded` или немедленно). Потом — по интервалу.

**Про Mail.ru.** Позже мы обнаружили, что Mail.ru шифрует текст метки, разбивая его на куски: «P» + «екл» + «keP» + «ama». В DOM это разные элементы, наш поиск по прямому тексту не срабатывает. Это известное ограничение — работает в большинстве случаев, но не во всех.

### domain-cosmetic.js — точка входа

Последний файл, самый простой. Он не объявляет функций — только вызывает их в правильном порядке.

```js
(async () => {
  await refreshSelectors(window.location.href);

  watchUrlChanges();

  startAutoSkip();

  startAdMarkerHiding();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startObserver, { once: true });
  } else {
    startObserver();
  }
})();
```

Пошагово.

**IIFE.** Вся логика обёрнута в `(async () => { ... })()` — сразу вызываемая асинхронная функция. Обёртка нужна для двух причин: держит переменные в своей области видимости (не пачкает глобальный контекст) и позволяет использовать `await`.

**refreshSelectors.** Сначала запрашиваем у service worker селекторы для текущего URL и вставляем их. Это самое важное — без этого ничего не заработает.

**watchUrlChanges.** Регистрируем слушателей SPA-навигации. С этого момента при каждом переходе внутри сайта селекторы будут перезапрашиваться.

**startAutoSkip.** Запускаем интервал для авто-скипа кнопки «Пропустить». Работает независимо.

**startAdMarkerHiding.** Запускаем поиск по текстовым маркерам. Тоже независимо.

**Запуск observer'а.** Тут есть тонкость. MutationObserver должен стартовать после того, как DOM готов. Если запустить до — он будет наблюдать пустой DOM и пропустит первые добавления. Поэтому проверяем `document.readyState`:

- `loading` — DOM ещё грузится, подписываемся на `DOMContentLoaded`, там запустим.
- `interactive` или `complete` — DOM готов, запускаем сразу.

Флаг `{ once: true }` в `addEventListener` — слушатель сработает один раз и отпишется. Это правильно: `DOMContentLoaded` — одноразовое событие.

Почему `startObserver` не вызывается напрямую, а через условие: если запустить до готовности DOM, observer начнёт наблюдать `document.documentElement`, когда тот ещё пустой. Он ничего не пропустит (потому что наблюдение начинается с этого момента), но нам важно, чтобы к моменту старта `state.currentSelectors` уже были заполнены. Если запустить observer до `refreshSelectors`, то первая проверка увидит пустой массив селекторов и сразу выйдет.

У нас `refreshSelectors` вызывается первым через `await`, значит к моменту старта observer'а селекторы уже есть. Но всё равно ждём DOMContentLoaded — так надёжнее.

## Как всё работает вместе

Проследим жизненный цикл content script на примере открытия страницы Dzen.

Chrome выполняет семь файлов в порядке из манифеста:

**1. state.js.** Объявляет объект `state` с пустыми полями. Ничего не делает.

**2. inject-css.js.** Объявляет три функции: `fetchSelectors`, `applySelectors`, `refreshSelectors`. Ничего не делает.

**3. spa.js.** Объявляет функцию `watchUrlChanges`. Ничего не делает.

**4. observer.js.** Объявляет `startObserver`. Ничего не делает.

**5. auto-skip.js.** Объявляет константу и две функции. Ничего не делает.

**6. ad-markers.js.** Объявляет константу и две функции. Ничего не делает.

**7. domain-cosmetic.js.** Запускает IIFE. Здесь начинается настоящая работа:

- `await refreshSelectors(window.location.href)` — отправляет сообщение service worker'у, получает селекторы для `dzen.ru` (например, 15 штук), вставляет `<style>` в `<head>`. Реклама на Dzen, которую ловят эти селекторы, исчезает.
- `watchUrlChanges()` — регистрирует слушателей pushState, popstate, hashchange, плюс интервал раз в секунду.
- `startAutoSkip()` — регистрирует интервал раз в секунду для поиска кнопок «Пропустить».
- `startAdMarkerHiding()` — делает первый проход поиска по маркерам и регистрирует интервал раз в 2 секунды.
- Запускает `startObserver` — либо сразу, либо после `DOMContentLoaded`.

Дальше content script работает в фоне вкладки:
- Раз в секунду проверяет кнопки «Пропустить».
- Раз в две секунды ищет текстовые метки «Реклама».
- Реагирует на изменения DOM через MutationObserver.
- При SPA-переходе (пользователь кликнул новость на Dzen) — вызывает `refreshSelectors`, получает новые селекторы, обновляет `<style>`.

Content script живёт, пока открыта вкладка. Закрыл вкладку — Chrome убил все семь файлов одним махом. Открыл новую — запустил с нуля.

## Что дальше

Следующая глава — про popup. Разберём, как устроено окошко при клике на иконку, как оно общается с service worker'ом и почему в popup используется `import`, а в content scripts — нет.