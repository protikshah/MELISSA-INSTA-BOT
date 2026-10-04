"use strict";
const fs = require("node:fs");
const path = require("node:path");

function getVersion(file = path.resolve(__dirname, "..", "version.json")) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return { version: "unknown" };
  }
}

module.exports = { getVersion };
