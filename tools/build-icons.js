/* ============================================================
   Нарезка иконок расширения.

   Два исходника:
   - icon-source.png       — полная иконка (с текстом), для 128 и store
   - icon-source-small.png — упрощённая (только символ), для 16, 32, 48

   Размеры:
   - icons/icon16.png       из icon-source-small.png
   - icons/icon32.png       из icon-source-small.png
   - icons/icon48.png       из icon-source-small.png
   - icons/icon128.png      из icon-source.png

   Плюс отдельно для Chrome Web Store:
   - icons/store-icon-128.png — 128×128, из полного исходника,
     с внутренней картинкой 96×96 по центру (по спеке Google)

   Запуск: npm run icons
   ============================================================ */

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

// Размер → из какого исходника брать
const SIZES = [
    { size: 16, source: SOURCE_SMALL },
    { size: 32, source: SOURCE_SMALL },
    { size: 48, source: SOURCE_SMALL },
    { size: 128, source: SOURCE_FULL }
];

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
    if (!fs.existsSync(SOURCE_SMALL)) {
        console.error(`[icons] not found: ${SOURCE_SMALL}`);
        process.exit(1);
    }

    if (!fs.existsSync(OUT_DIR)) {
        fs.mkdirSync(OUT_DIR, { recursive: true });
    }

    console.log(`[icons] generating`);

    // Обычные иконки
    for (const { size, source } of SIZES) {
        const outPath = path.join(OUT_DIR, `icon${size}.png`);
        await resizeTo(source, size, outPath);
        const origin = path.basename(source);
        console.log(`[icons]   + icon${size}.png (from ${origin})`);
    }

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