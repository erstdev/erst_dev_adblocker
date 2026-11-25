/* Генератор store-descriptions/<code>.txt.
   Запуск: node store-descriptions/generate.js */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { east } from "./source/east.js";
import { central } from "./source/central.js";
import { west } from "./source/west.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DESCRIPTIONS = { ...east, ...central, ...west };

function buildText(item) {
    const lines = [
        `erst_dev AdBlocker — ${item.intro}`,
        "",
        ...item.features.map((feature) => `• ${feature}`),
        "",
        ...item.steps.map((step, index) => `${index + 1}. ${step}`),
        "",
        item.privacy,
        "",
        "GitHub: https://github.com/erstdev/erst_dev_adblocker",
        "Email: erst_dev@mail.ru"
    ];
    return lines.join("\n") + "\n";
}

let count = 0;
for (const [code, item] of Object.entries(DESCRIPTIONS)) {
    fs.writeFileSync(
        path.join(__dirname, `${code}.txt`),
        buildText(item),
        "utf8"
    );
    count++;
}

console.log(`[store-descriptions] generated ${count} files`);
if (count !== 44) {
    console.error(`[store-descriptions] expected 44 files, got ${count}`);
    process.exit(1);
}
