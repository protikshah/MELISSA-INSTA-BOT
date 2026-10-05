"use strict";
const fs = require("node:fs");
const path = require("node:path");

class SqliteDatabase {
  constructor(filePath) {
    this.filePath = path.resolve(filePath);
    this.database = null;
  }

  async connect() {
    let DatabaseSync;
    try {
      ({ DatabaseSync } = require("node:sqlite"));
    } catch {
      throw new Error(
        "SQLite requires Node.js 22.5 or newer; select the JSON database on older runtimes.",
      );
    }
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    this.database = new DatabaseSync(this.filePath);
    this.database.exec(
      "CREATE TABLE IF NOT EXISTS melissa_kv (collection TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY (collection, key))",
    );
    this.getStatement = this.database.prepare(
      "SELECT value FROM melissa_kv WHERE collection = ? AND key = ?",
    );
    this.setStatement = this.database.prepare(
      "INSERT INTO melissa_kv (collection, key, value) VALUES (?, ?, ?) ON CONFLICT(collection, key) DO UPDATE SET value = excluded.value",
    );
    this.deleteStatement = this.database.prepare(
      "DELETE FROM melissa_kv WHERE collection = ? AND key = ?",
    );
    return this;
  }

  async get(collection, key) {
    const row = this.getStatement.get(String(collection), String(key));
    return row ? JSON.parse(row.value) : undefined;
  }

  async set(collection, key, value) {
    const encoded = JSON.stringify(value);
    if (encoded === undefined)
      throw new Error("Database values must be JSON-serializable.");
    this.setStatement.run(String(collection), String(key), encoded);
    return JSON.parse(encoded);
  }

  async delete(collection, key) {
    return (
      this.deleteStatement.run(String(collection), String(key)).changes > 0
    );
  }

  async close() {
    this.database?.close();
  }

  async health() {
    return Boolean(this.database);
  }
}

module.exports = { SqliteDatabase };
