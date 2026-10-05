"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function validName(value, label) {
  const name = String(value || "");
  if (
    !/^[a-zA-Z0-9_-]+$/.test(name) ||
    ["__proto__", "constructor", "prototype"].includes(name)
  ) {
    throw new Error("Invalid database " + label + ".");
  }
  return name;
}

function validKey(value) {
  const key = String(value ?? "");
  if (!key || ["__proto__", "constructor", "prototype"].includes(key))
    throw new Error("Invalid database key.");
  return key;
}

class JsonDatabase {
  constructor(filePath) {
    this.filePath = path.resolve(filePath);
    this.data = {};
    this.writeQueue = Promise.resolve();
  }

  async connect() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      this.data = JSON.parse(raw);
      if (
        !this.data ||
        Array.isArray(this.data) ||
        typeof this.data !== "object"
      )
        throw new Error("Database root must be an object.");
    } catch (error) {
      if (error.code !== "ENOENT")
        throw new Error("Could not read JSON database: " + error.message);
      this.data = {};
      await this._save();
    }
    return this;
  }

  async get(collection, key) {
    const value = this.data[validName(collection, "collection")]?.[validKey(key)];
    return clone(value);
  }

  async set(collection, key, value) {
    const group = validName(collection, "collection");
    const recordKey = validKey(key);
    const encoded = JSON.stringify(value);
    if (encoded === undefined)
      throw new Error("Database values must be JSON-serializable.");
    this.data[group] ||= {};
    this.data[group][recordKey] = JSON.parse(encoded);
    await this._save();
    return clone(this.data[group][recordKey]);
  }

  async delete(collection, key) {
    const group = validName(collection, "collection");
    const recordKey = validKey(key);
    if (!this.data[group] || !Object.hasOwn(this.data[group], recordKey))
      return false;
    delete this.data[group][recordKey];
    await this._save();
    return true;
  }

  async _save() {
    const content = JSON.stringify(this.data, null, 2) + "\n";
    this.writeQueue = this.writeQueue.then(async () => {
      const temporary = this.filePath + ".tmp";
      await fs.writeFile(temporary, content, { mode: 0o600 });
      await fs.rename(temporary, this.filePath);
    });
    return this.writeQueue;
  }

  async close() {
    await this.writeQueue;
  }

  async health() {
    return true;
  }
}

module.exports = { JsonDatabase };
