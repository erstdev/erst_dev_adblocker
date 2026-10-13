/* ============================================================
   Сборка расширения в ZIP для публикации.

   Что делает:
   1. Читает версию из manifest.json.
   2. Копирует в dist/ только те файлы, что нужны Chrome.
   3. Упаковывает dist/ в ZIP-архив в корне проекта.

   Запуск: npm run build
   Результат: dist/ (распакованная сборка) + erst_dev_adblocker-<version>.zip
   ============================================================ */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist");

// Что включаем в сборку.
// Это папки и файлы, которые Chrome реально читает.
// Всё остальное (docs, lists, tools, node_modules) — dev-мусор.
const INCLUDE = [
    "manifest.json",
    "icons",
    "background",
    "content",
    "popup",
    "shared",
    "rules",
    "_locales"
];

// ------------------------------------------------------------
// Утилиты
// ------------------------------------------------------------

function readManifest() {
    const manifestPath = path.join(ROOT, "manifest.json");
    return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

function cleanDist() {
    if (fs.existsSync(DIST)) {
        fs.rmSync(DIST, { recursive: true, force: true });
    }
    fs.mkdirSync(DIST, { recursive: true });
}

function copyRecursive(src, dest) {
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
        fs.mkdirSync(dest, { recursive: true });
        for (const child of fs.readdirSync(src)) {
            copyRecursive(path.join(src, child), path.join(dest, child));
        }
    } else {
        fs.copyFileSync(src, dest);
    }
}

// ------------------------------------------------------------
// Основные шаги
// ------------------------------------------------------------

function copyFiles() {
    console.log("[build] copying files to dist/");

    for (const item of INCLUDE) {
        const src = path.join(ROOT, item);
        const dest = path.join(DIST, item);

        if (!fs.existsSync(src)) {
            console.warn(`[build] WARNING: missing ${item}, skipping`);
            continue;
        }

        copyRecursive(src, dest);
        console.log(`[build]   + ${item}`);
    }
}

function addFolderToZip(folderPath, zipFolder) {
    for (const entry of fs.readdirSync(folderPath)) {
        const fullPath = path.join(folderPath, entry);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            const subFolder = zipFolder.folder(entry);
            addFolderToZip(fullPath, subFolder);
        } else {
            zipFolder.file(entry, fs.readFileSync(fullPath));
        }
    }
}

async function packZip(version) {
    const zipName = `erst_dev_adblocker-${version}.zip`;
    const zipPath = path.join(ROOT, zipName);

    console.log(`[build] packing ${zipName}`);

    const zip = new JSZip();
    addFolderToZip(DIST, zip);

    const buffer = await zip.generateAsync({
        type: "nodebuffer",
        compression: "DEFLATE",
        compressionOptions: { level: 9 }
    });

    fs.writeFileSync(zipPath, buffer);

    const sizeKb = (buffer.length / 1024).toFixed(0);
    console.log(`[build] ZIP created: ${zipName} (${sizeKb} KB)`);
}

// ------------------------------------------------------------
// main
// ------------------------------------------------------------

async function main() {
    const manifest = readManifest();
    console.log(`[build] building erst_dev_adblocker v${manifest.version}`);

    cleanDist();
    copyFiles();
    await packZip(manifest.version);

    console.log(`[build] done. output: dist/ and root folder`);
}

main().catch((e) => {
    console.error("[build] failed:", e);
    process.exit(1);
});