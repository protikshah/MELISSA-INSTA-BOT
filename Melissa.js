"use strict";
const path = require("node:path");
const { createLogger } = require("./func/loggerFunc");
const { MetaApi } = require("./func/metaApi");
const { MessageService } = require("./func/messageFunc");
const { loadSettings, loadMessages } = require("./bot/login/loadData");
const { loadLoaders } = require("./bot/login/LoadLoaders");
const {
  createAdminController,
} = require("./bot/database/controller/adminController");
const { createHandlerAction } = require("./bot/handler/handlerAction");
const { handleOnError } = require("./bot/handler/handlerOnError");
const { createUptimeService } = require("./bot/autouptime");

async function MelissaOnLoad(options = {}) {
  if (global.Melissa && global.Melissa.ready) return global.Melissa;

  const env = options.env || process.env;
  const settings = loadSettings(env);
  const dataDir = path.resolve(options.dataDir || settings.paths.dataDir);
  const logger = options.logger || createLogger(dataDir, settings.bot.logLevel);
  const startedAtMs = Date.now();

  const melissa = {
    name: settings.bot.name,
    nick: settings.bot.nick,
    startedAt: new Date(startedAtMs).toISOString(),
    settings,
    logger,
    ready: false,
    config: {
      prefix: settings.bot.prefix,
      selfListen: settings.bot.selfListen,
      logLevel: settings.bot.logLevel,
    },
    uptime: createUptimeService({
      startedAt: startedAtMs,
      restartAfterDays: settings.maintenance.restartAfterDays,
    }),
    hooks: {
      Onreply: new Set(),
      OnEvent: new Set(),
      OnReact: new Set(),
      OnMessage: new Set(),
      OnRead: new Set(),
      OnPostback: new Set(),
      OnError: new Set(),
      onLaunch: new Set(),
    },
  };
  global.Melissa = melissa;

  try {
    melissa.db =
      options.db ||
      (await require("./bot/database/connectDB").connectDB({
        settings,
        env,
        dataDir,
      }));

    melissa.admins = createAdminController({
      db: melissa.db,
      ownerIds: settings.bot.ownerIds,
      adminIds: settings.bot.adminIds,
    });
    await melissa.admins.load();

    const api =
      options.api ||
      new MetaApi({ env, settings, fetchImpl: options.fetchImpl });
    melissa.api = api;

    melissa.messages =
      options.messages ||
      new MessageService({
        api,
        maxPerMinute: settings.limits.messagesPerMinute,
        sendImpl: options.sendImpl,
      });

    melissa.actions = createHandlerAction({ messages: melissa.messages });

    melissa.Bot = {
      sendMessage: (...args) => melissa.actions.sendMessage(...args),
      sendMessageWithMessageEffectPayload: (...args) =>
        melissa.actions.sendMessageWithMessageEffectPayload(...args),
    };

    melissa.t = loadMessages(env);

    if (options.commandsDir)
      settings.paths.commandsDir = path.resolve(options.commandsDir);
    if (options.eventsDir)
      settings.paths.eventsDir = path.resolve(options.eventsDir);

    const loaders = loadLoaders({
      settings,
      adminIds: melissa.admins.list(),
      ownerIds: melissa.admins.owners(),
      logger,
      t: melissa.t,
      actions: melissa.actions,
    });

    melissa.commands = loaders.commands;
    melissa.events = loaders.events;
    melissa.commandCount = loaders.commandCount;
    melissa.eventCount = loaders.eventCount;

    const subscribe = (hookName, callback) => {
      if (typeof callback !== "function") {
        throw new TypeError(hookName + " handler must be a function.");
      }
      melissa.hooks[hookName].add(callback);
      return () => melissa.hooks[hookName].delete(callback);
    };

    melissa.Onreply = (cb) => subscribe("Onreply", cb);
    melissa.OnEvent = (cb) => subscribe("OnEvent", cb);
    melissa.OnReact = (cb) => subscribe("OnReact", cb);
    melissa.OnMessage = (cb) => subscribe("OnMessage", cb);
    melissa.OnRead = (cb) => subscribe("OnRead", cb);
    melissa.OnPostback = (cb) => subscribe("OnPostback", cb);
    melissa.OnError = (cb) => subscribe("OnError", cb);

    melissa.onLaunch = (callback) => {
      if (melissa.ready) {
        Promise.resolve()
          .then(() => callback(melissa))
          .catch((error) => melissa.errorlogs(error, { handler: "onLaunch" }));
        return () => {};
      }
      return subscribe("onLaunch", callback);
    };

    melissa.onReply = melissa.Onreply;
    melissa.onEvent = melissa.OnEvent;
    melissa.onReact = melissa.OnReact;
    melissa.onMessage = melissa.OnMessage;
    melissa.onRead = melissa.OnRead;
    melissa.onPostback = melissa.OnPostback;
    melissa.onError = melissa.OnError;

    melissa.loader = {
      melissaOnLaunch: melissa.onLaunch,
      melissaReply: melissa.Onreply,
      melissaReact: melissa.OnReact,
      melissaEvent: melissa.OnEvent,
      melissaChat: melissa.OnMessage,
      melissaMessage: melissa.OnMessage,
      melissaRead: melissa.OnRead,
      melissaPostback: melissa.OnPostback,
      melissaError: melissa.OnError,
    };
    Object.assign(melissa, melissa.loader);

    if (options.loader !== undefined) {
      if (
        !options.loader ||
        typeof options.loader !== "object" ||
        Array.isArray(options.loader)
      ) {
        throw new TypeError(
          "loader must be an object of lifecycle handler functions.",
        );
      }
      for (const [name, callback] of Object.entries(options.loader)) {
        const register = melissa.loader[name];
        if (typeof register !== "function") {
          throw new Error("Unknown Melissa lifecycle loader: " + name);
        }
        register(callback);
      }
    }

    melissa._emit = async (name, payload) => {
      for (const callback of [...melissa.hooks[name]]) {
        try {
          await callback(payload, melissa);
        } catch (error) {
          handleOnError(error, logger, { handler: name });
          if (name !== "OnError") {
            await melissa._emit("OnError", {
              error,
              context: { handler: name },
            });
          }
        }
      }
    };

    melissa.handleEvent = async (type, event) => {
      const payload = { ...event, type };
      await melissa.events.dispatch(type, payload, melissa);
      await melissa._emit("OnEvent", payload);
      const hookName = {
        reaction: "OnReact",
        read: "OnRead",
        postback: "OnPostback",
      }[type];
      if (type === "message") {
        await melissa._emit("OnMessage", payload);
        if (payload.replyToId) await melissa._emit("Onreply", payload);
      }
      if (hookName) await melissa._emit(hookName, payload);
      return true;
    };

    melissa.handleIncoming = async (event) => {
      if (!event || !event.senderId || !event.text || event.isEcho)
        return false;
      const payload = { ...event, type: "message" };
      await melissa.events.dispatch("message", payload, melissa);
      await melissa._emit("OnEvent", payload);
      await melissa._emit("OnMessage", payload);
      if (event.replyToId) await melissa._emit("Onreply", payload);
      return true;
    };

    melissa.OnLaunch = melissa.onLaunch;

    melissa.errorlogs = (error, context) => {
      handleOnError(error, logger, context);
      if (global.Melissa?.stats) global.Melissa.stats.errors++;
      return melissa._emit("OnError", { error, context });
    };

    melissa.status = () => ({
      name: melissa.name,
      nick: melissa.nick,
      ready: melissa.ready,
      commandCount: melissa.commands.plugins.size,
      eventCount: [...melissa.events.events.values()].reduce(
        (sum, list) => sum + list.length,
        0,
      ),
      uptimeSeconds: melissa.uptime.seconds(),
      restartDue: melissa.uptime.restartDue(),
      startedAt: melissa.startedAt,
    });

    melissa.ready = true;
    melissa.status_code = "READY";
    logger.info("Melissa loaded", {
      commandCount: melissa.commands.plugins.size,
      eventCount: melissa.status().eventCount,
    });

    await melissa._emit("onLaunch", melissa);
    melissa.events.triggerLaunch({ melissa });
    return melissa;
  } catch (error) {
    await melissa.db?.close?.().catch(() => {});
    delete global.Melissa;
    throw error;
  }
}

module.exports = { MelissaOnLoad, MelissaOnLaunch: MelissaOnLoad };
