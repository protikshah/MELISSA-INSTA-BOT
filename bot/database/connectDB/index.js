"use strict";
const path = require("node:path");
const { JsonDatabase } = require("./json");
const { SqliteDatabase } = require("./sqlite");
const { MongoDatabase } = require("./mongodb");

async function connectDB({ settings, env = process.env, dataDir } = {}) {
  const database = settings?.database || {};
  const root = path.resolve(dataDir || settings?.paths?.dataDir || "./data");
  const type = String(database.type || env.DATABASE_TYPE || "json").toLowerCase();
  let adapter;

  if (type === "json")
    adapter = new JsonDatabase(
      path.resolve(root, database.jsonFile || "database.json"),
    );
  else if (type === "sqlite")
    adapter = new SqliteDatabase(
      path.resolve(root, database.sqliteFile || "melissa.sqlite"),
    );
  else if (type === "mongodb")
    adapter = new MongoDatabase({
      uri: env.MONGODB_URI,
      databaseName: database.mongoDatabase || "melissa",
    });
  else
    throw new Error(
      "Unsupported DATABASE_TYPE: " +
        type +
        ". Choose json, sqlite, or mongodb.",
    );

  return adapter.connect();
}

module.exports = { connectDB };
