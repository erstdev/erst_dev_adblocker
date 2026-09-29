# Глава 8. Rules + Converter — от EasyList до DNR

## Зачем эта глава

Всё, что мы делали до сих пор, обслуживает одну задачу: превратить чужие правила блокировки рекламы в формат, который понимает Chrome, и скормить их браузеру.

Правила мы не пишем сами — их пишет сообщество. Существуют стандартные списки (EasyList, RU AdList, AdGuard Russian), которые используются всеми блокировщиками. Эти списки в формате EasyList. Chrome понимает формат DNR. Между ними — конвертер, который мы написали.

В этой главе разберём:
- Что такое DNR и как он работает.
- Формат EasyList — какие конструкции используются и что значат.
- Лимиты Chrome — почему нельзя взять все правила и залить.
- Три ruleset'а и три диапазона id — почему пришлось выяснять это эмпирически.
- Весь конвертер — от чтения файлов до записи результата.

Глава большая — это самая содержательная часть проекта.

## Что такое DNR

DNR — Declarative Net Request. Это API Chrome для блокировки сетевых запросов **без участия кода**.

Ключевое отличие от старого способа (webRequest, MV2): раньше расширение **само** перехватывало каждый запрос и решало «блокировать или нет». Теперь расширение **заранее** описывает правила в JSON, отдаёт их Chrome, и Chrome применяет их сам, на низком уровне.

**Аналогия:** в MV2 ты стоял у входа и лично проверял каждого гостя по списку. В MV3 ты отдал охраннику список — «кого не пускать» — и охранник работает сам, без тебя. Ты даже не знаешь, кого он не пустил.

Плюсы DNR: быстрее (нет вызова кода на каждый запрос), безопаснее (расширение не видит, что ты делаешь в интернете), экономнее по памяти.

Минусы: менее гибко. Нельзя динамически решать на основе сложной логики. Что декларировал — то и работает.

## Формат одного DNR-правила

```json
{
  "id": 10001,
  "priority": 1,
  "action": { "type": "block" },
  "condition": {
    "urlFilter": "||doubleclick.net^",
    "resourceTypes": ["script", "image", "xmlhttprequest", "sub_frame", "media", "font", "ping", "other", "stylesheet", "websocket"]
  }
}
```

Разберём по полям.

**`id`** — уникальный номер правила. Chrome требует уникальности id в пределах всего расширения (об этом подробно ниже). Используется для удаления или изменения правила.

**`priority`** — приоритет. Если запрос подходит под несколько правил, Chrome применяет то, у которого priority больше.

- У блокирующих правил у нас priority 1.
- У allow-правил из `exceptions.json` — priority 2 (перебивают блокирующие).
- У whitelist-правил (`allowAllRequests`) — priority 100 (перебивают всё).

**`action.type`** — что делать с запросом. Возможные значения:

- `"block"` — заблокировать.
- `"allow"` — разрешить, даже если есть блокирующее правило.
- `"allowAllRequests"` — разрешить все запросы, инициированные этой страницей. Только для `main_frame` и `sub_frame`.
- `"redirect"` — перенаправить на другой URL.
- `"modifyHeaders"` — изменить заголовки.
- `"upgradeScheme"` — заменить http на https.

У нас используются только `block` и `allow` (в двух видах).

**`condition`** — когда правило срабатывает.

- **`urlFilter`** — паттерн URL. Синтаксис похож на EasyList (об этом ниже).
- **`resourceTypes`** — какие типы запросов ловить. Возможные значения: `script`, `image`, `xmlhttprequest`, `sub_frame`, `main_frame`, `stylesheet`, `font`, `media`, `ping`, `websocket`, `other`.
- **`domainType`** — `firstParty` (тот же домен) или `thirdParty` (другой домен).
- **`initiatorDomains`**, **`excludedInitiatorDomains`** — фильтр по сайтам, которые инициировали запрос.
- **`requestDomains`**, **`excludedRequestDomains`** — фильтр по домену самого запроса.

У нас в правилах используется `urlFilter`, `resourceTypes`, `domainType`.

**`main_frame` мы НИКОГДА не указываем в resourceTypes блокирующих правил.** Иначе блокировка затронет сам переход на сайт — пользователь кликнет ссылку, а она не откроется. Реклама блокируется внутри страницы, а не сама страница.

## Формат EasyList

EasyList — текстовый формат, одна строка — одно правило. Так исторически сложилось в старом Adblock Plus, и все списки в этом формате.

Примеры строк из нашего входного файла:

```
! Title: EasyList
||doubleclick.net^
||googleadservices.com^$script,image
/path/to/banner.gif
##.ad-banner
example.com##div[data-ad]
@@||site.com/allowed^
```

Разберём конструкции.

**`!`** — комментарий. Строка игнорируется.

**`[Adblock Plus 2.0]`** — заголовок секции. Тоже игнорируется, но формат другой.

**`||`** — привязка к домену. `||doubleclick.net` означает «любой URL, где хост заканчивается на `doubleclick.net`». Соответствует поддоменам: `ads.doubleclick.net`, `www.doubleclick.net`, просто `doubleclick.net`.

**`|`** — привязка к началу или концу строки URL. `|https://ads.com` — URL начинается с этого. `banner.gif|` — заканчивается этим.

**`^`** — разделитель. Означает «конец домена или не буквенно-цифровой символ». `||ads.com^` соответствует `ads.com/`, `ads.com?`, `ads.com:`, `ads.com` в конце URL. Но не `ads.computation` — там после `ads.com` идёт буква, а не разделитель.

**`*`** — любой фрагмент. `/ads/*.js` — `/ads/` и потом что угодно и потом `.js`.

**`$`** — модификаторы. Идут после URL. Примеры: `$script`, `$image`, `$third-party`, `$domain=example.com`. Указывают, как именно применять правило.

**`##`** — косметическое правило. `##.ad-banner` — скрыть элемент с классом `ad-banner` на всех сайтах.

**`example.com##.ad-banner`** — косметическое правило только для одного домена. `example.com` перед `##` означает «только на этом сайте».

**`#@#`** — исключение косметики. «Не скрывать это даже если есть правило».

**`@@`** — исключение для сетевого правила. `@@||site.com/allowed` — «не блокируй это».

## Лимиты Chrome

Chrome не даёт загрузить бесконечно много DNR-правил. Есть жёсткие лимиты, разные для разных типов правил.

### Три типа DNR-правил

Chrome хранит правила в трёх разных наборах, с разными лимитами и разным жизненным циклом.

**Статические (static).** Задаются в `manifest.json` в блоке `declarative_net_request.rule_resources`. Chrome читает их при загрузке расширения. В рантайме менять отдельные правила нельзя — можно только включать/выключать целые ruleset'ы. Лимит — 30 000 суммарно на все ruleset'ы расширения.

**Динамические (dynamic).** Создаются кодом через `chrome.declarativeNetRequest.updateDynamicRules`. Хранятся в профиле Chrome, переживают перезапуск браузера. Можно добавлять, удалять, изменять в любой момент. Лимит — 5 000 правил.

**Сессионные (session).** Создаются через `chrome.declarativeNetRequest.updateSessionRules`. Всё то же, что у динамических, но пропадают при перезапуске браузера. Хранятся в памяти, а не на диске. Лимит — 5 000 правил.

Все три набора работают одновременно. Chrome применяет правила из всех сразу. Никакой иерархии между наборами нет — приоритет определяется полем `priority` в самом правиле.

### Что у нас где

**Статические — 28 525 правил.**

Это наш основной набор блокировки. Три файла:

- `rules/ads.json` — 28 024 блокирующих правила из EasyList.
- `rules/exceptions.json` — 501 allow-правило из EasyList.
- `rules/manual.json` — ручные правила (mradx.net и другие).

Объявлены в `manifest.json`, `enabled: false`, включаются программно через `updateEnabledRulesets`.

**Динамические — от 0 до ~500.**

У нас здесь только whitelist-правила. По одному правилу `allowAllRequests` на каждый сайт, добавленный пользователем в белый список.

Хранятся не в файлах, а в профиле Chrome. Создаются и удаляются кодом в `shared/storage.js` (`syncWhitelistRules`). Переживают перезапуск браузера.

**Сессионные — 0.**

У нас их нет и не планируются. Сессионные правила нужны для случаев, когда правило не должно переживать перезапуск браузера. Например: «на 5 минут отключить интернет для этого сайта», или временная блокировка, которая создаётся под каждый запрос.

У нас все правила постоянные — блокировка работает пока расширение установлено, whitelist живёт пока пользователь не удалит. Сессионные под эту задачу не подходят.

### Почему whitelist через динамические, а не через статические

Логичный вопрос: почему не сделать белый список статическими правилами в отдельном ruleset'е?

Потому что статические ruleset'ы нельзя менять в рантайме. Пользователь добавил сайт в whitelist — правило должно появиться сразу. Переписывать файлы и перезагружать расширение — не вариант.

`updateEnabledRulesets` позволяет включать/выключать ruleset'ы целиком, но у нас в whitelist могут быть разные домены, у каждого свой набор. Генерировать ruleset под каждый домен — дорого и бессмысленно.

Динамические правила идеально подходят: создаются и удаляются на лету, по одному на домен.

### Итого — что где

| Тип | Лимит | У нас | Что там |
|---|---|---|---|
| Статические | 30 000 | 28 525 | Блокировка + исключения + ручные |
| Динамические | 5 000 | 0–500 | Whitelist пользователя |
| Сессионные | 5 000 | 0 | — |

## Как мы режем — квоты

Все правила из EasyList делятся на три категории по этапам конвертации:

**Этап 1: простые `||domain^`.** Самые массовые. ~50 000 уникальных после дедупликации. Широкие, но базовые.

**Этап 2: с `$`-модификаторами.** ~4 500 конвертируемых. Точнее — знают про third-party и типы ресурсов.

**Этап 3: `|http://` и `/path`.** ~54 000 уникальных. Тоже массовые.

**Этап 5: исключения.** ~500 конвертируемых. Приоритетные.

Если сложить все — больше 100 000. Chrome примет максимум 30 000.

Мы режем по квотам:

- Этап 2 — оставляем все 4 500 (они точнее, их жалко резать).
- Этап 3 — берём 15 000 (из 54 000).
- Этап 1 — берём 8 500 (из 50 000).
- Исключения — 1 500 (влезет 500, остальное резерв).

Итого: 4 500 + 15 000 + 8 500 + 500 = 28 500. Влезаем с запасом.

Почему такие пропорции: этап 2 точнее этапа 3, этап 3 точнее этапа 1. Чем точнее правило, тем меньше шанс ложного срабатывания. Мы выделили самые точные правила в первую очередь.

**Что теряется:** 41 500 простых `||domain^` и 39 000 path-правил не влезли. Это больно — потенциально теряем часть покрытия. На практике самые популярные рекламные домены стоят в начале списка (EasyList отсортирован по важности), и они попадают в первые 8 500. Но если какой-то редкий рекламный домен окажется в конце — он не попадёт в наш набор.

Как обойти в будущем: разделить набор на core и extra. Core — 30 000 самых нужных. Extra — второй набор, пользователь включает опционально (заменяя core). Это требует отдельной логики, в текущую версию не входит.

## Три ruleset'а и три диапазона id

### Странность, из-за которой мы это выясняли эмпирически

Chrome хранит статические и динамические правила в разных наборах. Логично предположить, что и id в этих наборах независимы: правило с id=1 в статике и правило с id=1 в динамике — это два разных правила в двух разных наборах, конфликта быть не должно.

В документации Chrome это прямо не сказано. Есть описание `updateDynamicRules`, есть описание `rule_resources` в манифесте, но нет явного утверждения «id статических и динамических правил должны быть уникальны в пределах всего расширения».

На практике Chrome ведёт себя так, будто id общие. Мы попробовали создать динамическое правило с id=1 (для whitelist `news.mail.ru`) — получили ошибку:

```
Error: Rule with id 1 does not have a unique ID.
```

При этом в статическом `ads.json` уже было правило с id=1. Chrome посчитал, что id=1 занят — и не дал создать второе.

Дальше мы проверяли границы эмпирически:

- id=1 — конфликт (занят `ads.json`).
- id=1000 — свободно.
- id=5000 — свободно.
- id=10000 — конфликт (занят, потому что мы сами сдвинули туда `ads.json`).
- id=30000 — иногда свободно, иногда конфликт.
- id=100000 — конфликт (занят `exceptions.json`).

Что мы поняли: Chrome использует единое пространство id для статических и динамических правил. Несмотря на то, что это разные наборы, id в них не должны пересекаться.

Почему это не описано в документации. Возможно, Google считает это очевидным: раз правила применяются вместе, то и id общие. Но с точки зрения разработчика, который привык, что разные наборы — разные пространства, это контринтуитивно. Многие MV3-расширения наступают на эти грабли.

Что мы сделали. Выделили каждому набору свой диапазон id, который не пересекается с другими:

| Набор правил | Файл / API | Диапазон id |
|---|---|---|
| Ручные правила | `rules/manual.json` | 1 – 100 |
| Whitelist (динамические) | `updateDynamicRules` | 200 – 9 999 |
| Блокирующие правила | `rules/ads.json` | 10 000 – ~38 000 |
| Allow-правила | `rules/exceptions.json` | 100 000 – ~100 500 |

Диапазоны не пересекаются. Chrome доволен.

Почему выбраны именно эти диапазоны. Эмпирически найденные безопасные:

- 1–9 999 — маленькие числа, точно доступны.
- 10 000+ — точно доступны.
- 100 000+ — точно доступны.
- Больше 100 000 — рискованно, мы видели конфликты.
- Меньше 100 — можно, но мы забираем под `manual.json`.

Где переиндексация. В конвертере, в модуле `limiter.js`:

```js
const reindexedAds = dnrRules.map((rule, i) => ({ ...rule, id: i + ID_BASE_ADS }));
const reindexedExc = cappedExc.map((rule, i) => ({ ...rule, id: i + ID_BASE_EXCEPTIONS }));
```

`ID_BASE_ADS = 10000`, `ID_BASE_EXCEPTIONS = 100000`. Всё берётся из `tools/lib/config.js`.

Что было бы без разделения. Chrome не принял бы расширение целиком, либо часть правил молча игнорировалась бы. Например, если бы в `ads.json` и `exceptions.json` были правила с одинаковыми id — Chrome при загрузке второго ruleset'а увидел бы дубликат и отказался грузить весь ruleset. Мы это частично наблюдали, пока не ввели раздельные диапазоны.

## Конвертер — обзор

Конвертер — это отдельный Node.js-скрипт в папке `tools/`. Он не входит в само расширение. Запускается вручную, когда надо обновить правила из свежих списков.

Что делает:

1. Читает все `.txt`-файлы из `lists/`.
2. Классифицирует строки — сетевое, косметика, исключение, комментарий.
3. Конвертирует каждую категорию в свой формат:
   - сетевые → DNR-правила;
   - косметические → CSS-файл + карта селекторов по доменам;
   - исключения → DNR-allow-правила.
4. Применяет квоты и режет до лимита.
5. Пишет результат в `rules/` и `content/`.

Результат — четыре файла:

- `rules/ads.json` — блокирующие DNR-правила.
- `rules/exceptions.json` — allow-правила.
- `content/cosmetic.css` — общие селекторы для CSS.
- `rules/cosmetic-map.json` — карта domain-specific селекторов.

Плюс есть отдельный файл `rules/manual.json`, который конвертер не трогает — мы редактируем его вручную.

## Структура tools/

```
tools/
├── convert.js        ← точка входа, только main()
└── lib/
    ├── config.js     ← все константы
    ├── utils.js      ← isAsciiOnly, capRules
    ├── reader.js     ← чтение файлов
    ├── classifier.js ← сортировка строк
    ├── network.js    ← этапы 1, 2, 3
    ├── exceptions.js ← этап 5
    ├── cosmetic.js   ← этап 4
    ├── limiter.js    ← квоты
    └── writer.js     ← запись файлов
```

`convert.js` короткий — только `main()`, который вызывает функции по порядку. Вся логика — в модулях.

## Разбор main()

```js
function main() {
  const allLines = readAllLists(INPUT_FILES);

  const classified = classifyLines(allLines);
  logClassification(classified);

  const simple = selectSimpleRules(classified.network);
  const simpleDnr = simpleRulesToDnr(simple);
  console.log(`\n[stage 1] generated DNR rules: ${simpleDnr.length}`);

  const withModifiers = selectModifierRules(classified.network);
  const modifierDnr = modifierRulesToDnr(withModifiers, 1);
  console.log(`[stage 2] generated DNR rules: ${modifierDnr.length}`);

  const pathRules = selectPathRules(classified.network);
  const pathDnr = pathRulesToDnr(pathRules, 1);
  console.log(`[stage 3] generated DNR rules: ${pathDnr.length}`);

  const exceptions = selectExceptionRules(classified.exceptions);
  const exceptionDnr = exceptionRulesToDnr(exceptions, 1);
  console.log(`[stage 5] generated DNR rules: ${exceptionDnr.length}`);

  const { ads, exceptions: excs } = applyQuotas(
    modifierDnr,
    pathDnr,
    simpleDnr,
    exceptionDnr
  );

  writeJson(OUT_RULES, ads);
  writeJson(OUT_EXCEPTIONS, excs);

  const cosmetic = selectCosmeticRules(classified.cosmetic);
  const { cssText, domainMap } = cosmeticRulesToCss(cosmetic);
  writeCss(OUT_CSS, cssText);
  writeJson(OUT_COSMETIC_MAP, domainMap);
}
```

Читается как рассказ. Идём по шагам:

- Читаем все строки.
- Сортируем их по категориям.
- Из сетевых правил выделяем три этапа и конвертируем в DNR.
- Из исключений делаем allow-правила.
- Применяем квоты — получаем финальные массивы `ads` и `excs`.
- Записываем.
- Из косметических правил делаем CSS и карту.
- Записываем.

Никаких деталей реализации. Детали — в модулях.

## Конвертер по шагам

### reader.js — чтение

```js
export function readAllLists(files) {
  const allLines = [];
  for (const file of files) {
    const lines = readLines(file);
    console.log(`[read] ${file}: ${lines.length} lines`);
    allLines.push(...lines);
  }
  console.log(`[total] ${allLines.length} lines to process`);
  return allLines;
}
```

Просто. Читает файлы, складывает строки в один массив, логирует сколько получилось.

Что делает `readLines`: читает файл, разбивает по `\n`. Если файла нет — предупреждение и пустой массив.

### classifier.js — сортировка

```js
export function classifyLines(allLines) {
  const network = [];
  const cosmetic = [];
  const exceptions = [];
  let comments = 0;

  for (const line of allLines) {
    const trimmed = line.trim();

    if (!trimmed) { comments++; continue; }
    if (trimmed.startsWith("!")) { comments++; continue; }
    if (trimmed.startsWith("[")) { comments++; continue; }

    if (trimmed.startsWith("@@")) {
      exceptions.push(trimmed);
      continue;
    }

    if (trimmed.includes("##") || trimmed.includes("#@#")) {
      cosmetic.push(trimmed);
      continue;
    }

    network.push(trimmed);
  }

  return { network, cosmetic, exceptions, comments };
}
```

Идём по строкам, каждую определяем в одну из четырёх корзин:

- Пустая, комментарий или заголовок секции → счётчик `comments`, пропускаем.
- Начинается с `@@` → exceptions.
- Содержит `##` или `#@#` → cosmetic.
- Всё остальное → network.

Порядок проверок важен. `@@` идёт раньше `##`, потому что исключение может содержать `##`. Сетевые правила — последние, как fallback.

### network.js — три этапа

Файл делает три этапа конвертации. Каждый этап — это две функции: `select*` (выбрать подходящие строки) и `*ToDnr` (преобразовать).

**Этап 1: простые `||domain^`.**

```js
export function selectSimpleRules(networkRules) {
  const simple = networkRules.filter(
    (r) => r.startsWith("||") && r.endsWith("^")
  );
  const unique = [...new Set(simple)];
  return unique;
}

export function simpleRulesToDnr(simpleRules) {
  const dnrRules = [];
  let ruleId = 1;
  for (const easyRule of simpleRules) {
    if (!isAsciiOnly(easyRule)) continue;
    dnrRules.push({
      id: ruleId++,
      priority: 1,
      action: { type: "block" },
      condition: {
        urlFilter: easyRule,
        resourceTypes: ALL_RESOURCE_TYPES
      }
    });
  }
  return dnrRules;
}
```

Отбираем строки, которые начинаются с `||` и заканчиваются `^`. Убираем дубликаты через `Set`.

Каждую превращаем в DNR-правило. `urlFilter` — та же строка. `resourceTypes` — все типы, кроме `main_frame`.

Проверка на не-ASCII. Chrome не принимает правила с кириллицей в `urlFilter`. Проверяем через `isAsciiOnly` и пропускаем такие правила. У нас таких было 0 на этапе 1, 1 на этапе 2, 12 на этапе 3.

**Этап 2: с `$`-модификаторами.**

Тут сложнее. Нужно отделить URL от модификаторов, разобрать модификаторы, преобразовать в поля DNR.

```js
export function modifierRulesToDnr(rules, startId) {
  const dnrRules = [];
  let ruleId = startId;

  for (const easyRule of rules) {
    const dollarIndex = easyRule.lastIndexOf("$");
    const urlPart = easyRule.slice(0, dollarIndex);
    const modPart = easyRule.slice(dollarIndex + 1);

    if (!isAsciiOnly(urlPart)) continue;

    const parsed = parseModifiers(modPart);
    if (parsed.unsupported) continue;

    const condition = { urlFilter: urlPart };
    if (parsed.thirdParty !== null) {
      condition.domainType = parsed.thirdParty ? "thirdParty" : "firstParty";
    }
    if (parsed.resourceTypes.length > 0) {
      condition.resourceTypes = parsed.resourceTypes;
    }

    dnrRules.push({
      id: ruleId++,
      priority: 1,
      action: { type: "block" },
      condition
    });
  }
  return dnrRules;
}
```

Отделяем URL от модификаторов. `lastIndexOf("$")` — берём последний `$`. В EasyList модификаторы идут в конце. `||ads.com^$third-party,script` → url = `||ads.com^`, mod = `third-party,script`.

Разбор модификаторов. Функция `parseModifiers`:

```js
export function parseModifiers(modifierStr) {
  const mods = modifierStr.split(",");
  const result = {
    thirdParty: null,
    resourceTypes: [],
    unsupported: false
  };

  for (const mod of mods) {
    const trimmed = mod.trim();
    const isNegated = trimmed.startsWith("~");
    const name = isNegated ? trimmed.slice(1) : trimmed;

    if (name === "third-party") {
      result.thirdParty = !isNegated;
      continue;
    }

    if (name.startsWith("domain=")) {
      result.unsupported = true;
      return result;
    }

    if (isNegated && RESOURCE_TYPE_MAP[name]) {
      result.unsupported = true;
      return result;
    }

    if (RESOURCE_TYPE_MAP[name]) {
      result.resourceTypes.push(RESOURCE_TYPE_MAP[name]);
      continue;
    }

    if (UNSUPPORTED_MODIFIERS.has(name)) {
      result.unsupported = true;
      return result;
    }
  }

  return result;
}
```

Модификаторы — это список через запятую. Идём по каждому, определяем что он значит.

- `~` перед именем — отрицание. `$~third-party` значит «только first-party». `$~script` значит «всё кроме script».
- `third-party` (с `~` или без) → `domainType: "thirdParty"` или `"firstParty"`.
- `script`, `image`, `subdocument` и т.д. → `resourceTypes`.
- `domain=...` — пока не поддерживаем, помечаем как unsupported.
- Отрицание типа ресурса (`~script`) — тоже unsupported.
- Всё, что в `UNSUPPORTED_MODIFIERS` (`document`, `popup`, `replace`, `csp`, `removeparam`, `redirect`, `rewrite`, `generichide`, `elemhide`, `empty`) — unsupported.

Если правило помечено unsupported — пропускаем его целиком. Лучше потерять правило, чем применить его неправильно.

Из 8 745 правил этапа 2 сконвертировались 4 524. Остальные 4 220 — с неподдерживаемыми модификаторами. Это ожидаемо: сложные модификаторы типа `$replace` или `$domain=` в DNR невозможны.

**Этап 3: `|http://` и `/path`.**

Проще этапа 2, но хитрее этапа 1.

```js
export function selectPathRules(networkRules) {
  const paths = networkRules.filter(
    (r) => (r.startsWith("|") || r.startsWith("/")) && !r.includes("$")
  );
  return [...new Set(paths)];
}

export function pathRulesToDnr(rules, startId) {
  const dnrRules = [];
  let ruleId = startId;
  for (const easyRule of rules) {
    if (!isAsciiOnly(easyRule)) continue;
    dnrRules.push({
      id: ruleId++,
      priority: 1,
      action: { type: "block" },
      condition: {
        urlFilter: easyRule,
        resourceTypes: ALL_RESOURCE_TYPES
      }
    });
  }
  return dnrRules;
}
```

Отбираем правила, которые начинаются с `|` или `/`, но не содержат `$`. Правила с `$` уже обработаны на этапе 2.

Каждое правило проходит насквозь: `urlFilter` — та же строка. DNR понимает синтаксис `|` и `/` в urlFilter так же, как EasyList.

Из 54 235 уникальных сконвертировались 54 223. Остальные 12 — с не-ASCII символами в URL.

### exceptions.js — allow-правила

```js
export function exceptionRulesToDnr(rules, startId) {
  const dnrRules = [];
  let ruleId = startId;

  for (const easyRule of rules) {
    let body = easyRule.slice(2);

    let modPart = "";
    const dollarIndex = body.lastIndexOf("$");
    if (dollarIndex !== -1) {
      modPart = body.slice(dollarIndex + 1);
      body = body.slice(0, dollarIndex);
    }

    if (!isAsciiOnly(body)) continue;

    const condition = { urlFilter: body };

    if (modPart) {
      const parsed = parseModifiers(modPart);
      if (parsed.unsupported) continue;
      if (parsed.thirdParty !== null) {
        condition.domainType = parsed.thirdParty ? "thirdParty" : "firstParty";
      }
      if (parsed.resourceTypes.length > 0) {
        condition.resourceTypes = parsed.resourceTypes;
      }
    }

    dnrRules.push({
      id: ruleId++,
      priority: 2,
      action: { type: "allow" },
      condition
    });
  }
  return dnrRules;
}
```

Логика похожа на этап 2, но:

- Строка начинается с `@@` — отрезаем первые два символа через `slice(2)`.
- `action.type` — `"allow"` вместо `"block"`.
- `priority: 2` вместо 1 — выше блокирующих правил.
- Разбор модификаторов через ту же функцию `parseModifiers`, импортированную из `network.js`.

Приоритет 2 — критично. Если allow и block оба подходят под запрос, Chrome применяет allow с большим приоритетом. Значит, `allow` всегда побеждает.

### cosmetic.js — косметика

Самый большой модуль. Превращает правила `##` в два результата: CSS-файл с общими правилами и карту domain-specific.

```js
export function cosmeticRulesToCss(rules) {
  const generalSelectors = [];
  const domainMap = {};
  let skippedExceptions = 0;
  let skippedInvalid = 0;

  for (const rule of rules) {
    if (rule.includes("#@#")) {
      skippedExceptions++;
      continue;
    }

    const hashIndex = rule.indexOf("##");
    if (hashIndex === -1) {
      skippedInvalid++;
      continue;
    }

    const domainPart = rule.slice(0, hashIndex);
    const selectorPart = rule.slice(hashIndex + 2).trim();

    if (!selectorPart) {
      skippedInvalid++;
      continue;
    }
    if (!isAsciiOnly(selectorPart)) {
      skippedInvalid++;
      continue;
    }

    if (domainPart === "") {
      generalSelectors.push(selectorPart);
      continue;
    }

    const domains = domainPart.split(",").map((d) => d.trim()).filter(Boolean);
    for (const domain of domains) {
      if (domain.startsWith("~")) continue;
      if (!isAsciiOnly(domain)) continue;

      if (!domainMap[domain]) domainMap[domain] = new Set();
      domainMap[domain].add(selectorPart);
    }
  }

  // ... формируем cssText из generalSelectors ...

  return { cssText, domainMap };
}
```

Пошагово:

**Отбрасываем `#@#`.** Это исключения косметики. Пока не поддерживаем, счётчик растёт.

**Находим позицию `##`.** `indexOf("##")` — первое вхождение. Всё до него — часть домена (или пусто). Всё после — селектор.

**Проверяем селектор.** Если пустой — пропускаем. Если содержит не-ASCII — пропускаем.

**Общее правило.** Если домена нет (строка начинается сразу с `##`) — селектор идёт в `generalSelectors`.

**Domain-specific.** Если домен есть — разбиваем по запятой (может быть несколько доменов: `example.com,example.org##.ad`). Для каждого домена сохраняем селектор в `domainMap`.

Домены с префиксом `~` (исключающие) — пропускаем. Они означают «все сайты, кроме этого», что в нашей модели не выражается без сложной логики.

**Формируем CSS.** `generalSelectors` превращаются в строки вида `.ad-banner { display: none !important; }`. Все склеиваются в один файл.

**Формируем карту.** `domainMap` — объект вида `{ "rbc.ru": [".ad-banner", "[data-ad]"], ... }`. Сериализуется в JSON.

Из 35 284 косметических правил получилось:

- 14 116 общих селекторов → в `cosmetic.css`.
- 12 832 домена с 31 310 селекторами → в `cosmetic-map.json`.
- 539 исключений и 312 невалидных — пропущены.

### limiter.js — квоты

```js
export function applyQuotas(modifierDnr, pathDnr, simpleDnr, exceptionDnr) {
  const capped2 = capRules(modifierDnr, QUOTA_STAGE_2);
  const capped3 = capRules(pathDnr, QUOTA_STAGE_3);
  const capped1 = capRules(simpleDnr, QUOTA_STAGE_1);
  const cappedExc = capRules(exceptionDnr, QUOTA_EXCEPTIONS);

  let dnrRules = capped2.concat(capped3).concat(capped1);

  if (dnrRules.length + cappedExc.length > MAX_DNR_RULES) {
    const budget = MAX_DNR_RULES - cappedExc.length;
    dnrRules = dnrRules.slice(0, budget);
  }

  const reindexedAds = dnrRules.map((rule, i) => ({ ...rule, id: i + ID_BASE_ADS }));
  const reindexedExc = cappedExc.map((rule, i) => ({ ...rule, id: i + ID_BASE_EXCEPTIONS }));

  return { ads: reindexedAds, exceptions: reindexedExc };
}
```

Три действия:

**Обрезка по квотам.** `capRules` (из `utils.js`) просто режет массив до указанной длины. Этап 2 до 5000, этап 3 до 15000, этап 1 до 8500, исключения до 1500.

**Проверка общего лимита.** Если сумма блокирующих и allow превышает 30 000 — режем блокирующие. Это защита на случай, если квоты поменяются и что-то пойдёт не так.

**Переиндексация id.** Это критично. Мы пересобираем ids заново:

- Блокирующие правила получают id начиная с `ID_BASE_ADS` (10 000).
- Allow-правила — начиная с `ID_BASE_EXCEPTIONS` (100 000).

Без этой переиндексации у нас были бы дубликаты id между статическими ruleset'ами. Chrome не примет расширение.

### writer.js — запись

```js
export function writeJson(relPath, data) {
  const fullPath = path.join(__dirname, "..", "..", relPath);
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(fullPath, JSON.stringify(data, null, 2));

  const size = Array.isArray(data)
    ? `${data.length} items`
    : `${Object.keys(data).length} keys`;
  console.log(`[write] ${size} → ${relPath}`);
}
```

Просто. Создаёт папку, если её нет. Пишет JSON с отступами (читаемо). Логирует размер.

Аналогично `writeCss`.

## Финальный вывод конвертера

```
[read] lists/easylist.txt: 83487 lines
[read] lists/adguard-russian.txt: 19719 lines
[total] 103206 lines to process

[classify] network:    63732
[classify] cosmetic:   35318
[classify] exceptions: 1436
[classify] skipped:    2720

[stage 1] simple ||domain^ (before dedup): 50071
[stage 1] simple ||domain^ (after dedup):  50038
[stage 1] generated DNR rules: 50038

[stage 2] rules with $ modifiers: 8745
[stage 2] converted: 4524, skipped: 4220, non-ascii: 1
[stage 2] generated DNR rules: 4524

[stage 3] path/pipe rules (before dedup): 54270
[stage 3] path/pipe rules (after dedup):  54235
[stage 3] converted: 54223, non-ascii: 12
[stage 3] generated DNR rules: 54223

[stage 5] exceptions (before dedup): 1436
[stage 5] converted: 501, skipped: 930, non-ascii: 5
[stage 5] generated DNR rules: 501

[quota] stage 2: 5000
[quota] stage 3: 15000
[quota] stage 1: 8500
[quota] exceptions: 1500
[cap] 54223 → 15000 (max: 15000)
[cap] 50038 → 8500 (max: 8500)

[limit] blocking rules: 28024
[limit] exception rules: 501
[limit] total: 28525 (max: 30000)

[write] 28024 items → rules/ads.json
[write] 501 items → rules/exceptions.json

[stage 4] cosmetic (before dedup): 35318
[stage 4] cosmetic (after dedup):  35284
[stage 4] general selectors:       14116
[stage 4] domain-specific domains: 12832
[stage 4] skipped exceptions:      539
[stage 4] skipped invalid:         312
[stage 4] unique general selectors: 14116
[stage 4] total domain selectors:  31310

[write] css → content/cosmetic.css
[write] 12832 keys → rules/cosmetic-map.json
```

Читается как отчёт. Понятно, сколько было, сколько сконвертировано, сколько пропущено и почему.

## Про manual.json

Есть файл `rules/manual.json`, который конвертер не трогает. Мы редактируем его вручную.

Зачем: некоторые правила не приходят из EasyList. Например, `mradx.net` (рекламная сеть ВК) — может быть в списках, а может быть пропущен. Мы добавляем его вручную и не боимся, что следующий запуск конвертера перезапишет файл.

То же с `cosmetic-manual.css` — он не перегенерируется, мы его правим вручную.

Так разделяется:

- Автогенерируемые файлы (не трогать руками): `ads.json`, `exceptions.json`, `cosmetic.css`, `cosmetic-map.json`.
- Ручные файлы (не перезаписываются): `manual.json`, `cosmetic-manual.css`.

## Что дальше

Следующая глава — про белый список и включение/выключение. Как они работают, почему whitelist-правила создаются динамически, и почему race condition — самая частая ошибка в MV3.