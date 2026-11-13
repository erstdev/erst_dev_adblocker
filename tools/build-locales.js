/* ============================================================
   Генерация _locales/<code>/messages.json.

   Источник описаний: shared/locales/descriptions.js.
   Нужно для того, чтобы Chrome и Chrome Web Store видели
   локали name/description для всех языков интерфейса.

   Португальский в popup один (pt), а в _locales Chrome
   использует pt_BR и pt_PT — поэтому ключей 45.

   Запуск: npm run locales
   ============================================================ */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { APP_DESCRIPTIONS } from "../shared/locales/descriptions.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, "..");
const LOCALES_DIR = path.join(ROOT, "_locales");

const APP_NAME = "erst_dev_adblocker";
const MAX_DESCRIPTION_LENGTH = 132;

let count = 0;

for (const [code, description] of Object.entries(APP_DESCRIPTIONS)) {
    if (description.length > MAX_DESCRIPTION_LENGTH) {
        throw new Error(
            `[locales] description too long for ${code}: ${description.length} > ${MAX_DESCRIPTION_LENGTH}`
        );
    }

    const localeDir = path.join(LOCALES_DIR, code);
    fs.mkdirSync(localeDir, { recursive: true });

    const messages = {
        appName: {
            message: APP_NAME,
            description: "Extension name shown in Chrome and CWS."
        },
        appDescription: {
            message: description,
            description: "Short description shown in CWS. Max 132 characters."
        }
    };

    fs.writeFileSync(
        path.join(localeDir, "messages.json"),
        JSON.stringify(messages, null, 2) + "\n",
        "utf8"
    );

    count++;
}

console.log(`[locales] generated ${count} locales in _locales/`);
