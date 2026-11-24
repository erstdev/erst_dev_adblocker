/* ============================================================
   Чтение списков правил (EasyList / RU AdList).

   Что делает:
   - читает txt-файлы из lists/
   - разбивает по строкам
   - складывает все строки в один массив

   Не парсит. Не классифицирует. Просто читает.
   ============================================================ */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Нужен, чтобы строить путь от корня проекта, а не от текущей папки.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Читает один файл и возвращает массив строк.
 *
 * Путь строится относительно КОРНЯ проекта (на 2 уровня выше lib/).
 * Если файла нет — бросает ошибку: пустой результат молча
 * превращался в пустые rules/*.json и нерабочую сборку.
 *
 * @param {string} file - путь к файлу относительно корня (например, "lists/easylist.txt")
 * @returns {string[]} массив строк
 */
function readLines(file) {
    const fullPath = path.join(__dirname, "..", "..", file);

    if (!fs.existsSync(fullPath)) {
        throw new Error(
            `file not found: ${file}. Списки не входят в git — ` +
            `положи EasyList и RU AdList в lists/ (см. README → «Быстрый старт»).`
        );
    }

    const text = fs.readFileSync(fullPath, "utf8");

    if (text.trim().length === 0) {
        throw new Error(`file is empty: ${file}`);
    }

    return text.split("\n");
}

/**
 * Читает все файлы из списка и складывает строки в один массив.
 *
 * Логирует, сколько строк в каждом файле и сколько всего.
 *
 * @param {string[]} files - массив путей к файлам
 * @returns {string[]} все строки из всех файлов
 */
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