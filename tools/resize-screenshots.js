/* ============================================================
   Ресайз скриншотов для Chrome Web Store.

   Что делает:
   - Берёт все PNG из store-assets/raw/
   - Приводит каждый к размеру 1280×800
   - Кладёт результат в store-assets/

   Логика ресайза:
   - Обрезаем по пропорциям 1280×800 (16:10) из центра
   - Растягиваем результат до точного размера 1280×800

   Chrome Web Store требует ТОЧНЫЕ размеры. Никаких «примерно похожих».

   Запуск: npm run screenshots
   ============================================================ */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, "..");
const RAW_DIR = path.join(ROOT, "store-assets", "raw");
const OUT_DIR = path.join(ROOT, "store-assets");

const TARGET_WIDTH = 1280;
const TARGET_HEIGHT = 800;

async function processOne(file) {
    const srcPath = path.join(RAW_DIR, file);
    const outPath = path.join(OUT_DIR, file);

    const image = sharp(srcPath);
    const meta = await image.metadata();

    console.log(`[screenshots] ${file}: ${meta.width}×${meta.height}`);

    await image
        .resize(TARGET_WIDTH, TARGET_HEIGHT, {
            fit: "cover",
            position: "center"
        })
        .png()
        .toFile(outPath);

    console.log(`[screenshots]   → ${TARGET_WIDTH}×${TARGET_HEIGHT}`);
}

async function main() {
    if (!fs.existsSync(RAW_DIR)) {
        console.error(`[screenshots] not found: ${RAW_DIR}`);
        console.error(`[screenshots] create it and put PNG files inside`);
        process.exit(1);
    }

    const files = fs.readdirSync(RAW_DIR).filter((f) => f.endsWith(".png"));

    if (files.length === 0) {
        console.error(`[screenshots] no PNG files in ${RAW_DIR}`);
        process.exit(1);
    }

    console.log(`[screenshots] processing ${files.length} file(s)`);

    for (const file of files) {
        await processOne(file);
    }

    console.log(`[screenshots] done. output: store-assets/`);
}

main().catch((e) => {
    console.error("[screenshots] failed:", e);
    process.exit(1);
});