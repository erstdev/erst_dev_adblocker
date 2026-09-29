/* ============================================================
   Скрытие блоков с текстовой меткой «Реклама» / «Промо» / «Спонсор».

   Что делает:
   - ищет элементы с коротким прямым текстом, равным одному
     из маркеров (регистр не важен)
   - поднимается на 3 уровня вверх к «карточке»
   - ставит inline display:none !important

   Зачем:
   Многие сайты (Mail.ru, Dzen, Яндекс) помечают нативную
   рекламу текстовой меткой. Это удобно: не нужно знать их
   обфусцированные классы — достаточно найти текст.

   ⚠️ Mail.ru иногда шифрует текст, разбивая его на куски
   по буквам («P» + «екл» + «keP» + «ama»). В таких случаях
   этот метод не срабатывает — это нормально, пропускаем.

   Работает периодически (раз в 2 секунды), потому что реклама
   часто подгружается динамически.
   ============================================================ */

const AD_TEXT_MARKERS = [
    "реклама",
    "промо",
    "спонсор",
    "рекламный",
    "партнёрский материал",
    "advertisement",
    "sponsored",
];

/**
 * Одна попытка поиска и скрытия блоков по тексту.
 */
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
                // Поднимаемся на 3 уровня вверх к «карточке»
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

/**
 * Запускает периодическое скрытие по текстовым маркерам.
 */
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