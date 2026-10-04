"use strict";
const fs = require("node:fs");
const path = require("node:path");

const LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3, FATAL: 4 };

function redact(value) {
  return String(value)
    .replace(
      /(access[_-]?token|password|cookie|app[_-]?secret|authorization)\s*[:=]\s*[^\s,;]+/gi,
      "$1=[REDACTED]",
    )
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/g, "Bearer [REDACTED]")
    .replace(/EAA[A-Za-z0-9]+/g, "[REDACTED_META_TOKEN]");
}

function createLogger(dataDir, minLevel = "INFO") {
  const file = path.join(dataDir || "./data", "melissa.log");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const threshold = LEVELS[String(minLevel).toUpperCase()] ?? LEVELS.INFO;

  function log(level, message, metadata = "") {
    const levelName = String(level).toUpperCase();
    if ((LEVELS[levelName] ?? 0) < threshold) return;

    const stamp = new Date().toISOString();
    const suffix = metadata
      ? " " +
        redact(
          typeof metadata === "string" ? metadata : JSON.stringify(metadata),
        )
      : "";
    const line = `[${stamp}] [${levelName}] ${redact(message)}${suffix}\n`;

    try {
      if (fs.existsSync(file) && fs.statSync(file).size > 10 * 1024 * 1024)
        fs.renameSync(file, file + ".1");
      fs.appendFileSync(file, line, { mode: 0o600 });
    } catch (_) {}

    process.stdout.write(line);
  }

  return {
    debug: (m, meta) => log("debug", m, meta),
    info: (m, meta) => log("info", m, meta),
    warn: (m, meta) => log("warn", m, meta),
    error: (m, meta) => log("error", m, meta),
    fatal: (m, meta) => log("fatal", m, meta),
    log,
  };
}

module.exports = { createLogger, redact };
