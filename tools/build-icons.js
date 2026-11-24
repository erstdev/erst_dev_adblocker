/* ============================================================
   Нарезка иконок расширения.

   Два исходника:
   - icon-source.png       — полная иконка (с текстом), для 128 и store
   - icon-source-small.png — упрощённая (только символ), для 16, 32, 48

   Размеры:
   - icons/icon16.png       из малого исходника (fallback — полный)
   - icons/icon32.png       из малого исходника (fallback — полный)
   - icons/icon48.png       из малого исходника (fallback — полный)
   - icons/icon128.png      из icon-source.png

   Если малого исходника нет или он совпадает с полным, скрипт
   предупреждает и режет 16/32/48 из полного: результат тот же,
   но без молчаливого расхождения с комментариями.

   Плюс отдельно для Chrome Web Store:
   - icons/store-icon-128.png — 128×128, из полного исходника,
     с внутренней картинкой 96×96 по центру (по спеке Google)

   Запуск: npm run icons
   ============================================================ */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "icons");

const SOURCE_FULL = path.join(ROOT, "icon-source.png");
const SOURCE_SMALL = path.join(ROOT, "icon-source-small.png");

// 16/32/48 берутся из «упрощённого» исходника, 128 — из полного.
const SMALL_SIZES = [16, 32, 48];

function sha256(file) {
    return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

async function resizeTo(source, size, outPath) {
    await sharp(source)
        .resize(size, size, {
            fit: "contain",
            background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .png()
        .toFile(outPath);
}

async function main() {
    if (!fs.existsSync(SOURCE_FULL)) {
        console.error(`[icons] not found: ${SOURCE_FULL}`);
        process.exit(1);
    }

    // Малый исходник необязателен: если его нет, 16/32/48 режутся
    // из полного. Если он совпадает с полным — предупреждаем, что
    // «упрощённой» иконки фактически нет.
    let smallSource = SOURCE_SMALL;

    if (!fs.existsSync(SOURCE_SMALL)) {
        console.warn(`[icons] not found: ${SOURCE_SMALL}, using full source for 16/32/48`);
        smallSource = SOURCE_FULL;
    } else if (sha256(SOURCE_SMALL) === sha256(SOURCE_FULL)) {
        console.warn("[icons] icon-source-small.png is identical to icon-source.png");
        console.warn("[icons] 16/32/48 will be cut from the full icon; replace the small source to simplify them");
    }

    if (!fs.existsSync(OUT_DIR)) {
        fs.mkdirSync(OUT_DIR, { recursive: true });
    }

    console.log(`[icons] generating`);

    // Обычные иконки 16/32/48
    for (const size of SMALL_SIZES) {
        const outPath = path.join(OUT_DIR, `icon${size}.png`);
        await resizeTo(smallSource, size, outPath);
        const origin = path.basename(smallSource);
        console.log(`[icons]   + icon${size}.png (from ${origin})`);
    }

    // 128 — из полного исходника
    const icon128Path = path.join(OUT_DIR, "icon128.png");
    await resizeTo(SOURCE_FULL, 128, icon128Path);
    console.log(`[icons]   + icon128.png (from ${path.basename(SOURCE_FULL)})`);

    // Store-иконка 128×128 с отступами 16px.
    // Внутренняя картинка 96×96 по центру на прозрачном холсте 128×128.
    // Из полного исходника — с текстом.
    const innerBuffer = await sharp(SOURCE_FULL)
        .resize(96, 96, {
            fit: "contain",
            background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .png()
        .toBuffer();

    const storeIconPath = path.join(OUT_DIR, "store-icon-128.png");
    await sharp({
        create: {
            width: 128,
            height: 128,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 }
        }
    })
        .composite([{ input: innerBuffer, top: 16, left: 16 }])
        .png()
        .toFile(storeIconPath);

    console.log(`[icons]   + store-icon-128.png`);
    console.log(`[icons] done. output: icons/`);
}

main().catch((e) => {
    console.error("[icons] failed:", e);
    process.exit(1);
});