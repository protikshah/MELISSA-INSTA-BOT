"use strict";

class MongoDatabase {
  constructor({ uri, databaseName }) {
    if (!uri)
      throw new Error('MONGODB_URI is required when database.type is "mongodb".');
    this.uri = uri;
    this.databaseName = databaseName;
    this.client = null;
  }

  async connect() {
    const { MongoClient } = require("mongodb");
    this.client = new MongoClient(this.uri, { serverSelectionTimeoutMS: 5000 });
    try {
      await this.client.connect();
    } catch {
      await this.client.close().catch(() => {});
      throw new Error(
        "Could not connect to MongoDB. Verify MONGODB_URI and the database network access rules.",
      );
    }
    this.database = this.client.db(this.databaseName);
    return this;
  }

  _collection(name) {
    const value = String(name || "");
    if (!/^[a-zA-Z0-9_-]+$/.test(value))
      throw new Error("Invalid database collection.");
    return this.database.collection(value);
  }

  async get(collection, key) {
    const record = await this._collection(collection).findOne({
      _id: String(key),
    });
    return record?.value;
  }

  async set(collection, key, value) {
    await this._collection(collection).updateOne(
      { _id: String(key) },
      { $set: { value } },
      { upsert: true },
    );
    return value;
  }

  async delete(collection, key) {
    const result = await this._collection(collection).deleteOne({
      _id: String(key),
    });
    return result.deletedCount > 0;
  }

  async close() {
    await this.client?.close();
  }

  async health() {
    return Boolean(this.database);
  }
}

module.exports = { MongoDatabase };
