/* Каталог языков popup: 44 языка. */
import { west } from "./west.js";
import { central } from "./central.js";
import { east } from "./east.js";

const ALL = [...east, ...central, ...west];

// Английский, русский и армянский — в начале списка,
// остальные по английскому названию.
const PINNED = ["en", "ru", "hy"];
const BY_CODE = new Map(ALL.map((language) => [language.code, language]));

export const LANGUAGE_META = [
    ...PINNED.map((code) => BY_CODE.get(code)).filter(Boolean),
    ...ALL
        .filter((language) => !PINNED.includes(language.code))
        .sort((a, b) => a.english.localeCompare(b.english, "en"))
].map(({ code, label, english, flag }) => ({ code, label, english, flag }));

export const LANGUAGE_CODES = ALL.map((language) => language.code);

export const DICTIONARIES = Object.fromEntries(
    ALL.map((language) => [language.code, language.strings])
);
