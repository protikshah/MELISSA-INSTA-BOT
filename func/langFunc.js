"use strict";
const fs = require("node:fs");
const path = require("node:path");

function loadLanguage(language) {
  if (!/^[a-zA-Z0-9_-]+$/.test(String(language || ""))) return {};
  const filePath = path.join(__dirname, "..", "langs", `${language}.lang`);
  if (!fs.existsSync(filePath)) return {};

  const result = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    const value = line
      .slice(separator + 1)
      .replace(/\\n/g, "\n")
      .replace(/\\\\/g, "\\");
    if (key) result[key] = value;
  }
  return result;
}

function createTranslator(language = "en", fallbackLanguage = "en") {
  const dictionaries = new Map();
  for (const name of new Set(["en", fallbackLanguage, language]))
    dictionaries.set(name, loadLanguage(name));

  const active = dictionaries.get(language);
  const fallback = dictionaries.get(fallbackLanguage);

  return function t(key, values = {}) {
    const raw = active[key] ?? fallback[key] ?? key;
    const args = Array.isArray(values) ? values : values || {};
    return String(raw)
      .replace(/\{([a-zA-Z0-9_]+)\}/g, (_, name) =>
        String(args[name] ?? "{" + name + "}"),
      )
      .replace(/%(\d+)/g, (placeholder, index) =>
        String(args[Number(index) - 1] ?? args[index] ?? placeholder),
      );
  };
}

module.exports = { createTranslator, loadLanguage };
