"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { connectDB } = require("../database/connectDB");
const { createTranslator } = require("../../func/langFunc");

const defaultSettingsPath = path.resolve(__dirname, "../../loader.json");

function parseIds(value) {
  if (Array.isArray(value)) {
    return value.map((id) => String(id).trim()).filter(Boolean);
  }
  return String(value || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

function readNumber(env, key, fallback, minimum, maximum) {
  if (env[key] === undefined || env[key] === "") return fallback;
  const value = Number(env[key]);
  return Number.isFinite(value) && value >= minimum && value <= maximum
    ? value
    : fallback;
}

function readBoolean(value, fallback) {
  if (value === undefined || value === "") return Boolean(fallback);
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function loadSettings(
  env = process.env,
  settingsPath = env.LOADER_SETTINGS_FILE || defaultSettingsPath,
) {
  const absoluteSettingsPath = path.resolve(settingsPath);
  const fileSettings = JSON.parse(
    fs.readFileSync(absoluteSettingsPath, "utf8"),
  );
  if (
    !fileSettings ||
    typeof fileSettings !== "object" ||
    Array.isArray(fileSettings)
  ) {
    throw new Error("loader.json must contain a JSON object.");
  }

  const fileBot = fileSettings.bot || {};
  const fileServer = fileSettings.server || {};
  const fileMeta = fileSettings.meta || {};
  const filePaths = fileSettings.paths || {};
  const fileDatabase = fileSettings.database || {};
  const fileWelcome = fileSettings.welcome || {};
  const fileMaintenance = fileSettings.maintenance || {};
  const fileLimits = fileSettings.limits || {};

  return {
    bot: {
      name: env.BOT_NAME || fileBot.name || "MELISSA-INSTA-BOT",
      nick: env.BOT_NICK || fileBot.nick || "Melissa",
      prefix: env.BOT_PREFIX ?? fileBot.prefix ?? "!",
      lang: env.BOT_LANG || fileBot.lang || "en",
      fallbackLang: env.BOT_FALLBACK_LANG || fileBot.fallbackLang || "en",
      ownerIds: parseIds(env.BOT_OWNER_IDS ?? fileBot.ownerIds),
      adminIds: parseIds(env.BOT_ADMIN_IDS ?? fileBot.adminIds),
      developerIds: parseIds(env.DEVELOPER_IDS ?? fileBot.developerIds),
      premiumIds: parseIds(env.PREMIUM_IDS ?? fileBot.premiumIds),
      vipIds: parseIds(env.VIP_IDS ?? fileBot.vipIds),
      selfListen: readBoolean(env.SELF_LISTEN, fileBot.selfListen),
      logLevel: env.LOG_LEVEL || fileBot.logLevel || "INFO",
    },
    server: {
      host: env.HOST || fileServer.host || "0.0.0.0",
      port: readNumber(env, "PORT", fileServer.port || 3000, 1, 65535),
      webhookPath: env.WEBHOOK_PATH || fileServer.webhookPath || "/webhook",
    },
    meta: {
      graphApiBase:
        env.META_GRAPH_API_BASE ||
        fileMeta.graphApiBase ||
        "https://graph.facebook.com",
      graphApiVersion:
        env.META_GRAPH_API_VERSION || fileMeta.graphApiVersion || "v23.0",
    },
    paths: {
      commandsDir: path.resolve(
        env.COMMANDS_DIR || filePaths.commandsDir || "Loaders/Commands",
      ),
      eventsDir: path.resolve(
        env.EVENTS_DIR || filePaths.eventsDir || "Loaders/Events",
      ),
      dataDir: path.resolve(env.DATA_DIR || filePaths.dataDir || "data"),
      commandsManifest: path.resolve(
        env.COMMANDS_MANIFEST ||
          filePaths.commandsManifest ||
          "loader.Commands.json",
      ),
    },
    database: {
      type: String(
        env.DATABASE_TYPE || fileDatabase.type || "json",
      ).toLowerCase(),
      jsonFile:
        env.JSON_DATABASE_FILE || fileDatabase.jsonFile || "database.json",
      sqliteFile:
        env.SQLITE_DATABASE_FILE ||
        fileDatabase.sqliteFile ||
        "melissa.sqlite",
      mongoDatabase:
        env.MONGODB_DATABASE || fileDatabase.mongoDatabase || "melissa",
    },
    welcome: {
      enabled: readBoolean(env.WELCOME_ENABLED, fileWelcome.enabled),
      message:
        env.WELCOME_MESSAGE ||
        fileWelcome.message ||
        "Thanks for messaging MELISSA-INSTA-BOT. Send !help to see available commands.",
      cooldownDays: readNumber(
        env,
        "WELCOME_COOLDOWN_DAYS",
        fileWelcome.cooldownDays || 30,
        1,
        3650,
      ),
    },
    maintenance: {
      restartAfterDays: readNumber(
        env,
        "RESTART_AFTER_DAYS",
        fileMaintenance.restartAfterDays ?? 10,
        0,
        3650,
      ),
    },
    limits: {
      messagesPerMinute: readNumber(
        env,
        "MESSAGE_RATE_LIMIT",
        fileLimits.messagesPerMinute || 30,
        1,
        10000,
      ),
      maxWebhookBytes: readNumber(
        env,
        "MAX_WEBHOOK_BYTES",
        fileLimits.maxWebhookBytes || 1048576,
        1024,
        10485760,
      ),
    },
  };
}

function loadMessages(env = process.env) {
  return createTranslator(env.BOT_LANG || "en", env.BOT_FALLBACK_LANG || "en");
}

module.exports = { loadSettings, loadMessages, connectDB };
