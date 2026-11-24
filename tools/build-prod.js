/* ============================================================
   Сборка расширения в ZIP для публикации.

   Что делает:
   1. Проверяет, что все обязательные файлы существуют.
   2. Читает версию из manifest.json.
   3. Копирует в dist/ только те файлы, что нужны Chrome.
   4. Упаковывает dist/ в ZIP-архив в корне проекта.

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
// Всё остальное (lists, tools, store-descriptions, node_modules) — dev-мусор.
// THIRD-PARTY-NOTICES.md кладём в ZIP: это атрибуция EasyList и AdGuard,
// из которых конвертируются rules/*.json.
const INCLUDE = [
    "manifest.json",
    "icons",
    "background",
    "content",
    "popup",
    "shared",
    "rules",
    "_locales",
    "THIRD-PARTY-NOTICES.md"
];

// Что ОБЯЗАТЕЛЬНО должно существовать до сборки.
// Если чего-то нет — build падает с ошибкой, а не собирает
// нерабочий ZIP.
//
// icons/* и rules/* генерируются командами npm run icons и npm run convert.
// content/cosmetic.css генерируется npm run convert.
const REQUIRED_FILES = [
    "manifest.json",
    "icons/icon16.png",
    "icons/icon32.png",
    "icons/icon48.png",
    "icons/icon128.png",
    "rules/ads.json",
    "rules/exceptions.json",
    "rules/manual.json",
    "rules/cosmetic-map.json",
    "rules/cosmetic-exclude.json",
    "content/cosmetic.css",
    "content/cosmetic-manual.css"
];

// Что не нужно в ZIP, хотя лежит в копируемых папках.
// icon64.png нигде не указан в манифесте, store-icon-128.png нужен
// только для загрузки в CWS и не используется рантаймом.
const EXCLUDE_FROM_DIST = new Set([
    "icons/icon64.png",
    "icons/store-icon-128.png"
]);

// Минимальные объёмы артефактов: защита от сборки «пустого» расширения.
// Свежий клон без lists/ даёт пустые rules/*.json и пустой cosmetic.css,
// но проверка существования файлов это пропускает.
const MIN_BLOCKING_RULES = 1000;
const MIN_ALLOW_RULES = 100;
const MIN_COSMETIC_DOMAINS = 1000;
const MIN_COSMETIC_CSS_BYTES = 100_000;

// ------------------------------------------------------------
// Проверка обязательных файлов
// ------------------------------------------------------------

function checkRequiredFiles() {
    const missing = [];
    for (const file of REQUIRED_FILES) {
        const fullPath = path.join(ROOT, file);
        if (!fs.existsSync(fullPath)) {
            missing.push(file);
        }
    }
    if (missing.length > 0) {
        console.error("[build] FATAL: missing required files:");
        for (const f of missing) {
            console.error(`  - ${f}`);
        }
        console.error("[build] Run: npm run convert && npm run icons");
        process.exit(1);
    }
    console.log(`[build] required files present: ${REQUIRED_FILES.length}`);
}

// ------------------------------------------------------------
// Проверки версии и содержимого артефактов
// ------------------------------------------------------------

function readJson(file) {
    return JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
}

function checkVersions(manifestVersion) {
    const pkg = readJson("package.json");
    const lock = readJson("package-lock.json");
    const rootLockPkg = lock.packages && lock.packages[""];

    const problems = [];

    if (pkg.version !== manifestVersion) {
        problems.push(`package.json: ${pkg.version}`);
    }
    if (lock.version && lock.version !== manifestVersion) {
        problems.push(`package-lock.json: ${lock.version}`);
    }
    if (rootLockPkg && rootLockPkg.version && rootLockPkg.version !== manifestVersion) {
        problems.push(`package-lock.json packages[""]: ${rootLockPkg.version}`);
    }

    if (problems.length > 0) {
        console.error(`[build] FATAL: version mismatch, manifest.json says ${manifestVersion}`);
        for (const problem of problems) {
            console.error(`  - ${problem}`);
        }
        console.error("[build] bump the same version in manifest.json, package.json, package-lock.json");
        process.exit(1);
    }

    console.log(`[build] version ${manifestVersion} matches package files`);
}

function checkArtifacts() {
    const ads = readJson("rules/ads.json");
    const exceptions = readJson("rules/exceptions.json");
    const cosmeticMap = readJson("rules/cosmetic-map.json");
    const cosmeticCss = fs.readFileSync(path.join(ROOT, "content/cosmetic.css"), "utf8");

    const problems = [];

    if (!Array.isArray(ads) || ads.length < MIN_BLOCKING_RULES) {
        problems.push(`rules/ads.json: ${Array.isArray(ads) ? ads.length : "not an array"} blocking rules`);
    }
    if (!Array.isArray(exceptions) || exceptions.length < MIN_ALLOW_RULES) {
        problems.push(`rules/exceptions.json: ${Array.isArray(exceptions) ? exceptions.length : "not an array"} allow rules`);
    }
    if (
        !cosmeticMap ||
        typeof cosmeticMap !== "object" ||
        Object.keys(cosmeticMap).length < MIN_COSMETIC_DOMAINS
    ) {
        problems.push(`rules/cosmetic-map.json: ${cosmeticMap ? Object.keys(cosmeticMap).length : 0} domains`);
    }
    if (cosmeticCss.length < MIN_COSMETIC_CSS_BYTES) {
        problems.push(`content/cosmetic.css: ${cosmeticCss.length} bytes`);
    }

    if (problems.length > 0) {
        console.error("[build] FATAL: artifacts look broken (empty or truncated):");
        for (const problem of problems) {
            console.error(`  - ${problem}`);
        }
        console.error("[build] Refusing to pack a build without rules. Run: npm run convert");
        process.exit(1);
    }

    console.log(
        `[build] artifacts ok: ${ads.length} block + ${exceptions.length} allow, ` +
        `${Object.keys(cosmeticMap).length} domains, ${cosmeticCss.length} bytes of CSS`
    );
}

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

function copyRecursive(src, dest, relPath) {
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
        fs.mkdirSync(dest, { recursive: true });
        for (const child of fs.readdirSync(src)) {
            const childRel = relPath ? `${relPath}/${child}` : child;
            if (EXCLUDE_FROM_DIST.has(childRel)) {
                console.log(`[build]   - ${childRel} (runtime does not use it)`);
                continue;
            }
            copyRecursive(path.join(src, child), path.join(dest, child), childRel);
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

        copyRecursive(src, dest, item);
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
    checkRequiredFiles();

    const manifest = readManifest();
    console.log(`[build] building erst_dev_adblocker v${manifest.version}`);

    checkVersions(manifest.version);
    checkArtifacts();

    cleanDist();
    copyFiles();
    await packZip(manifest.version);

    console.log(`[build] done. output: dist/ and root folder`);
}

main().catch((e) => {
    console.error("[build] failed:", e);
    process.exit(1);
});