/* ============================================================
   Запись результатов работы конвертера.

   Две функции: JSON и CSS.
   Обе создают папку, если её нет.
   Обе логируют размер результата.
   ============================================================ */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Пишет JSON-файл относительно корня проекта.
 * Форматирует с отступами (удобно читать, если понадобится).
 *
 * @param {string} relPath - путь относительно корня ("rules/ads.json")
 * @param {Array|Object} data - данные
 */
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

/**
 * Пишет CSS-файл относительно корня проекта.
 *
 * @param {string} relPath - путь относительно корня ("content/cosmetic.css")
 * @param {string} cssText - CSS-текст
 */
export function writeCss(relPath, cssText) {
    const fullPath = path.join(__dirname, "..", "..", relPath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fullPath, cssText);
    console.log(`[write] css → ${relPath}`);
}