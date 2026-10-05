"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createTranslator } = require("../../func/langFunc");
const { parseCommand } = require("../../func/commandFunc");

/**
 * Role Hierarchy Matrix
 * 0 - USER
 * 1 - GROUP_ADMIN
 * 2 - BOT_ADMIN
 * 3 - DEVELOPER
 * 4 - PREMIUM
 * 5 - VIP
 * 6 - OWNER
 */
const ROLES = Object.freeze({
  USER: 0,
  GROUP_ADMIN: 1,
  BOT_ADMIN: 2,
  DEVELOPER: 3,
  PREMIUM: 4,
  VIP: 5,
  OWNER: 6,
});

const MESSAGE_EFFECTS = Object.freeze({
  HEARTS: "e3bc7c21-c27d-419b-a010-388277a06c5f",
  CONFETTI: "a8053a47-3fef-489e-a0e2-6320092d6e40",
  FIRE: "a1a8c8bd-8408-41f2-bf89-53e3fa2f78e4",
  GIFT_BOX: "f4086438-662f-41df-a548-8df0be91e9f1",
  CELEBRATION: "b2184d28-761b-4f9e-b75b-430bd6bc752d",
});

class EventRegistry {
  constructor({ eventsDir, logger, t = createTranslator(), config = {} } = {}) {
    this.eventsDir =
      eventsDir || path.join(process.cwd(), "Loaders", "Events");
    this.logger = logger || console;
    this.t = t;
    this.events = new Map();
    this.config = config;

    this.roles = {
      owners: new Set((config.owners || []).map(String)),
      developers: new Set((config.developers || []).map(String)),
      botAdmins: new Set((config.botAdmins || []).map(String)),
      premium: new Set((config.premium || []).map(String)),
      vip: new Set((config.vip || []).map(String)),
    };

    this.systemHooks = new Map();
    this.launchListeners = [];
    this.threadMemoryMap = new Map();
    this.spamTrackerMap = new Map();
    this.threadStatsMap = new Map();

    this.SPAM_WINDOW_MS = 1500;
    this.SPAM_MAX_COUNT = 5;
    this.SPAM_TTL_MS = 5 * 60 * 1000;
    this.MAX_THREADS = 500;
    this.MAX_MEMORY_PER_THREAD = 25;
    this.MAX_LEVENSHTEIN_INPUT = 64;
    this.MAX_LEVENSHTEIN_DISTANCE = 3;

    this._initializeGlobalMelissa();

    this._cleanupInterval = setInterval(() => this._cleanup(), 60_000);
    this._cleanupInterval.unref?.();
  }

  _initializeGlobalMelissa() {
    if (!global.Melissa) {
      global.Melissa = {
        commands: new Map(),
        events: this.events,
        cooldowns: new Map(),
        cache: new Map(),
        roles: this.roles,
        config: { prefix: "!", selfListen: false },
        stats: {
          startTime: Date.now(),
          messagesReceived: 0,
          messagesSent: 0,
          effectsSent: 0,
          spamBlocked: 0,
          errors: 0,
        },
        status: "INITIALIZING",
        Bot: {},
      };
    }

    const self = this;

    global.Melissa.Bot = {
      ...global.Melissa.Bot,

      melissaOnLaunch: (callback) => {
        if (typeof callback === "function") {
          self.launchListeners.push(callback);
        }
        return () => {
          const idx = self.launchListeners.indexOf(callback);
          if (idx >= 0) self.launchListeners.splice(idx, 1);
        };
      },

      onEvent: (eventName, listener) => {
        if (typeof listener !== "function") return () => {};
        const key = String(eventName).toLowerCase();
        if (!self.systemHooks.has(key)) self.systemHooks.set(key, []);
        self.systemHooks.get(key).push(listener);
        return () => {
          const list = self.systemHooks.get(key) || [];
          const idx = list.indexOf(listener);
          if (idx >= 0) list.splice(idx, 1);
        };
      },

      melissaChat: async (threadId, text) =>
        self._executeSend(threadId, (api) => api.sendText(threadId, text)),

      Reply: async (threadId, text, replyMessageId) =>
        self._executeSend(threadId, (api) => {
          if (typeof api.sendReply === "function")
            return api.sendReply(threadId, text, replyMessageId);
          return api.sendText(threadId, text);
        }),

      Response: async (threadId, text) =>
        self._executeSend(threadId, (api) => api.sendText(threadId, text)),

      sendWithEffect: async (threadId, text, effectId) =>
        self._executeSend(threadId, async (api) => {
          if (global.Melissa?.stats) global.Melissa.stats.effectsSent++;
          if (typeof api.sendEffect === "function")
            return api.sendEffect(threadId, text, effectId);
          return api.sendText(threadId, text);
        }),

      sendEffectRandom: async (threadId, text) => {
        const keys = Object.keys(MESSAGE_EFFECTS);
        const randomKey = keys[Math.floor(Math.random() * keys.length)];
        const selectedEffectId = MESSAGE_EFFECTS[randomKey];
        return self._executeSend(threadId, async (api) => {
          if (global.Melissa?.stats) global.Melissa.stats.effectsSent++;
          if (typeof api.sendEffect === "function")
            return api.sendEffect(threadId, text, selectedEffectId);
          return api.sendText(threadId, text);
        });
      },

      Reaction: async (threadId, itemId, emoji = "❤️") =>
        self._executeSend(threadId, (api) => {
          if (typeof api.sendReaction === "function")
            return api.sendReaction(threadId, itemId, emoji);
          throw new Error("Reactions are not supported by this API adapter.");
        }),

      React: async (threadId, itemId, emoji = "❤️") =>
        global.Melissa.Bot.Reaction(threadId, itemId, emoji),

      Typ: async (threadId, isTyping = true) =>
        self._executeSend(threadId, (api) => {
          if (typeof api.sendAction === "function")
            return api.sendAction(
              threadId,
              isTyping ? "typing_on" : "typing_off",
            );
          return null;
        }),

      readRecipt: async (threadId, itemId) =>
        self._executeSend(threadId, (api) => {
          if (typeof api.markSeen === "function")
            return api.markSeen(threadId, itemId);
          return null;
        }),

      Redreceipt: async (threadId, itemId) =>
        global.Melissa.Bot.readRecipt(threadId, itemId),

      Mention: (userId, username) => `@${username || userId}`,

      Selflisten: (enable = true) => {
        if (!global.Melissa.config) global.Melissa.config = {};
        global.Melissa.config.selfListen = Boolean(enable);
        return global.Melissa.config.selfListen;
      },

      getThreadMemory: (threadId, limit = 10) =>
        self._getThreadMemory(threadId, limit),

      getThreadStats: (threadId) => {
        const stats = self.threadStatsMap.get(String(threadId));
        if (!stats) return null;
        return {
          messageCount: stats.messageCount,
          activeUsers: [...stats.activeUsers],
          lastActive: stats.lastActive,
        };
      },

      getRole: (userId, threadAdminIds = []) =>
        self.getUserRole(userId, threadAdminIds),

      hasNoPrefixAccess: (userId, threadAdminIds = []) =>
        self.getUserRole(userId, threadAdminIds) >= ROLES.GROUP_ADMIN,

      getEffectsMap: () => MESSAGE_EFFECTS,

      findSimilarCommand: (inputCommandName) =>
        self._findClosestCommand(inputCommandName),
    };
  }

  async _executeSend(threadId, action) {
    try {
      const melissa = global.Melissa;
      if (!melissa) throw new Error("Melissa is not initialized.");
      const api = melissa.api || melissa.messages?.api;
      if (!api) throw new Error("No active messaging API available.");
      if (melissa.stats) melissa.stats.messagesSent++;
      return await action(api, threadId);
    } catch (err) {
      this.logger.error?.("[Melissa.Bot API Error] " + err.message);
      throw err;
    }
  }

  getUserRole(userId, threadAdminIds = []) {
    const uid = String(userId || "").trim();
    if (!uid) return ROLES.USER;
    if (this.roles.owners.has(uid)) return ROLES.OWNER;
    if (this.roles.vip.has(uid)) return ROLES.VIP;
    if (this.roles.premium.has(uid)) return ROLES.PREMIUM;
    if (this.roles.developers.has(uid)) return ROLES.DEVELOPER;
    if (this.roles.botAdmins.has(uid)) return ROLES.BOT_ADMIN;
    if (
      Array.isArray(threadAdminIds) &&
      threadAdminIds.map(String).includes(uid)
    ) {
      return ROLES.GROUP_ADMIN;
    }
    return ROLES.USER;
  }

  _validate(plugin, file) {
    if (!plugin || !plugin.loader || typeof plugin.run !== "function") {
      throw new Error("Invalid event loader: " + file);
    }
    const name = String(plugin.loader.Name || "").trim();
    const event = String(plugin.loader.EventType || "")
      .trim()
      .toLowerCase();
    if (!name || !event) {
      throw new Error(
        "Event " + file + " must define loader.Name and loader.EventType.",
      );
    }
  }

  load() {
    this.events.clear();
    if (!fs.existsSync(this.eventsDir)) {
      fs.mkdirSync(this.eventsDir, { recursive: true });
    }
    const files = fs
      .readdirSync(this.eventsDir)
      .filter((value) => value.endsWith(".js"))
      .sort();
    for (const file of files) {
      try {
        this.loadEvent(file);
      } catch (err) {
        this.logger.error?.(`Failed to load event ${file}: ${err.message}`);
      }
    }
    return [...this.events.values()].reduce(
      (total, list) => total + list.length,
      0,
    );
  }

  loadEvent(name) {
    const file = String(name || "").endsWith(".js")
      ? String(name)
      : String(name || "") + ".js";
    if (!/^[a-z0-9_-]+\.js$/i.test(file)) {
      throw new Error("Use a local event name, not a path.");
    }
    const full = path.join(this.eventsDir, file);
    if (!fs.existsSync(full)) throw new Error("Event file not found: " + file);
    delete require.cache[require.resolve(full)];
    const plugin = require(full);
    this._validate(plugin, file);
    plugin.__filename = full;

    const eventName = String(plugin.loader.Name).toLowerCase();
    for (const [type, list] of this.events) {
      const kept = list.filter(
        (entry) => String(entry.loader.Name).toLowerCase() !== eventName,
      );
      if (kept.length) this.events.set(type, kept);
      else this.events.delete(type);
    }

    const eventType = String(plugin.loader.EventType).toLowerCase();
    const list = this.events.get(eventType) || [];
    list.push(plugin);
    this.events.set(eventType, list);
    return plugin;
  }

  unloadEvent(name) {
    const target = String(name || "")
      .replace(/\.js$/i, "")
      .toLowerCase();
    let removed = false;
    for (const [type, list] of this.events) {
      const kept = list.filter((plugin) => {
        const matches =
          String(plugin.loader.Name).toLowerCase() === target ||
          path.basename(plugin.__filename || "", ".js").toLowerCase() ===
            target;
        removed = removed || matches;
        return !matches;
      });
      if (kept.length) this.events.set(type, kept);
      else this.events.delete(type);
    }
    return removed;
  }

  triggerLaunch(launchContext = {}) {
    for (const listener of this.launchListeners) {
      try {
        listener(launchContext);
      } catch (err) {
        this.logger.error?.("[melissaOnLaunch Error] " + err.message);
      }
    }
  }

  async dispatch(type, event, bot) {
    const rawType = String(type).toLowerCase();

    if (event?.isSelf && !global.Melissa?.config?.selfListen) return 0;

    const threadAdminIds = Array.isArray(event?.threadAdminIds)
      ? event.threadAdminIds
      : [];
    const senderId =
      event?.senderId || event?.user_id || event?.item?.user_id;
    const threadId = event?.threadId || event?.thread_id;
    const userRole = this.getUserRole(senderId, threadAdminIds);
    const noPrefixAccess = userRole >= ROLES.GROUP_ADMIN;
    const text = String(
      event?.text || event?.message?.text || event?.item?.text || "",
    ).trim();

    if (global.Melissa?.stats) global.Melissa.stats.messagesReceived++;

    if (senderId && this._isSpamming(String(senderId))) {
      if (global.Melissa?.stats) global.Melissa.stats.spamBlocked++;
      this.logger.warn?.(
        `[ANTI-SPAM] Rate limit triggered for user: ${senderId}`,
      );
      return 0;
    }

    if (threadId && text) {
      this._saveThreadMemory(String(threadId), {
        senderId,
        text,
        timestamp: Date.now(),
      });
      this._updateThreadStats(String(threadId), senderId);
    }

    const eventPayload = {
      type: rawType,
      event,
      bot: bot || global.Melissa.Bot,
      logger: this.logger,
      role: userRole,
      noPrefixAccess,
      rolesEnum: ROLES,
      effects: MESSAGE_EFFECTS,
      contextMemory: threadId
        ? this._getThreadMemory(String(threadId))
        : [],
    };

    if (rawType === "message" && text && threadId) {
      try {
        const handled = await this._handleCommandMessage(
          event,
          eventPayload,
          senderId,
          threadId,
          text,
        );
        if (handled) return 1;
      } catch (err) {
        this.logger.error?.(`[Command Handler] ${err.message}`);
      }
    }

    await this._handleSpecialSystemEvents(rawType, event, eventPayload);

    if (this.systemHooks.has(rawType)) {
      for (const hook of this.systemHooks.get(rawType)) {
        try {
          await hook(eventPayload);
        } catch (e) {
          this.logger.error?.(
            `[onEvent:${rawType}] Handler Error: ${e.message}`,
          );
        }
      }
    }

    const plugins = [
      ...(this.events.get(rawType) || []),
      ...(this.events.get("*") || []),
    ];

    for (const plugin of plugins) {
      try {
        await plugin.run(eventPayload);
      } catch (error) {
        if (typeof bot?.errorlogs === "function") {
          await bot.errorlogs(error, {
            handler: "event",
            event: rawType,
            plugin: plugin.loader.Name,
          });
        } else {
          this.logger?.error(this.t("errors.eventHandler"), {
            event: rawType,
            handler: plugin.loader.Name,
            message: error.message,
          });
        }
      }
    }
    return plugins.length;
  }

  async _handleCommandMessage(event, payload, senderId, threadId, text) {
    const melissa = global.Melissa;
    const registry = melissa?.commands;
    if (!registry || typeof registry.dispatch !== "function") return false;

    const prefix = melissa?.config?.prefix || "!";
    const userRole = this.getUserRole(senderId, event?.threadAdminIds || []);
    const noPrefix = userRole >= ROLES.GROUP_ADMIN;
    const hasPrefix = text.startsWith(prefix);

    if (text === prefix) {
      try {
        await melissa.Bot.sendEffectRandom(
          threadId,
          `Hey there\n${prefix} this is my prefix\nType ${prefix}help to see available commands.`,
        );
      } catch (_) {}
      return true;
    }

    if (!hasPrefix && !noPrefix) return false;

    if (hasPrefix) {
      const parsed = parseCommand(text, prefix);
      if (parsed) {
        const commandMap = registry.commands || registry;
        const exists =
          commandMap && typeof commandMap.has === "function"
            ? commandMap.has(parsed.name)
            : false;
        if (!exists) {
          const suggestion = this._findClosestCommand(parsed.name);
          if (suggestion) {
            try {
              await melissa.Bot.sendEffectRandom(
                threadId,
                `"${parsed.name}" is not a valid command. Try ${prefix}${suggestion}`,
              );
            } catch (_) {}
            return true;
          }
        }
      }
    }

    return registry.dispatch({
      text,
      senderID: senderId,
      threadID: threadId,
      messageID: event?.messageId || event?.item_id,
    });
  }

  _isSpamming(userId) {
    const now = Date.now();
    const userSpam = this.spamTrackerMap.get(userId) || {
      count: 0,
      lastMessage: now,
    };
    if (now - userSpam.lastMessage < this.SPAM_WINDOW_MS) userSpam.count += 1;
    else userSpam.count = 1;
    userSpam.lastMessage = now;
    this.spamTrackerMap.set(userId, userSpam);
    return userSpam.count > this.SPAM_MAX_COUNT;
  }

  _saveThreadMemory(threadId, entry) {
    const key = String(threadId);
    const memory = this.threadMemoryMap.get(key) || [];
    memory.push(entry);
    if (memory.length > this.MAX_MEMORY_PER_THREAD) memory.shift();
    this.threadMemoryMap.set(key, memory);
  }

  _getThreadMemory(threadId, limit = 10) {
    const memory = this.threadMemoryMap.get(String(threadId)) || [];
    return memory.slice(-limit);
  }

  _updateThreadStats(threadId, senderId) {
    const key = String(threadId);
    const stats = this.threadStatsMap.get(key) || {
      messageCount: 0,
      activeUsers: new Set(),
      lastActive: Date.now(),
    };
    stats.messageCount++;
    if (senderId) stats.activeUsers.add(String(senderId));
    stats.lastActive = Date.now();
    this.threadStatsMap.set(key, stats);
  }

  _cleanup() {
    const now = Date.now();
    for (const [userId, data] of this.spamTrackerMap) {
      if (now - data.lastMessage > this.SPAM_TTL_MS)
        this.spamTrackerMap.delete(userId);
    }
    if (this.threadMemoryMap.size > this.MAX_THREADS) {
      const keys = [...this.threadMemoryMap.keys()];
      const excess = keys.slice(0, this.threadMemoryMap.size - this.MAX_THREADS);
      for (const k of excess) this.threadMemoryMap.delete(k);
    }
    if (this.threadStatsMap.size > this.MAX_THREADS) {
      const keys = [...this.threadStatsMap.keys()];
      const excess = keys.slice(0, this.threadStatsMap.size - this.MAX_THREADS);
      for (const k of excess) this.threadStatsMap.delete(k);
    }
  }

  _findClosestCommand(input) {
    const melissa = global.Melissa;
    const registry = melissa?.commands;
    const commandMap = registry?.commands || registry;
    if (!commandMap || typeof commandMap.keys !== "function") return null;

    const target = String(input || "").toLowerCase();
    if (!target || target.length > this.MAX_LEVENSHTEIN_INPUT) return null;

    let closestCommand = null;
    let lowestDistance = Infinity;
    for (const cmdName of commandMap.keys()) {
      const distance = this._levenshteinDistance(target, String(cmdName));
      if (
        distance < lowestDistance &&
        distance <= this.MAX_LEVENSHTEIN_DISTANCE
      ) {
        lowestDistance = distance;
        closestCommand = cmdName;
      }
    }
    return closestCommand;
  }

  _levenshteinDistance(a, b) {
    const s1 = String(a);
    const s2 = String(b);
    const matrix = Array.from({ length: s1.length + 1 }, () =>
      new Array(s2.length + 1).fill(0),
    );
    for (let i = 0; i <= s1.length; i++) matrix[i][0] = i;
    for (let j = 0; j <= s2.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= s1.length; i++) {
      for (let j = 1; j <= s2.length; j++) {
        const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost,
        );
      }
    }
    return matrix[s1.length][s2.length];
  }

  async _handleSpecialSystemEvents(type, event, payload) {
    const bot = payload.bot;

    if (
      type === "message_unsend" ||
      event?.isUnsent ||
      event?.item_type === "unsend"
    ) {
      const threadId = event.threadId || event.thread_id;
      const itemId = event.itemId || event.item_id;
      if (threadId && itemId && typeof bot?.React === "function") {
        try {
          await bot.React(threadId, itemId, "👀");
        } catch (_) {}
      }
      if (this.systemHooks.has("unsend")) {
        for (const hook of this.systemHooks.get("unsend")) {
          try {
            await hook(payload);
          } catch (_) {}
        }
      }
    }

    if (
      type === "thread_remove_user" ||
      type === "kick" ||
      (event?.action === "remove_user" && event?.target_id)
    ) {
      const threadId = event.threadId || event.thread_id;
      const kickedUserId = event.target_id || event.kickedUserId;
      const botUserId = global.Melissa?.Bot?.client?.state?.cookieUserId;
      if (String(kickedUserId) === String(botUserId)) {
        this.logger.warn?.(
          `[SECURITY] Bot was removed from Thread ID: ${threadId}`,
        );
      } else if (threadId && typeof bot?.sendEffectRandom === "function") {
        try {
          const mentionText = bot.Mention(
            kickedUserId,
            event.target_username || "User",
          );
          await bot.sendEffectRandom(
            threadId,
            `Notice: ${mentionText} was removed from the thread.`,
          );
        } catch (_) {}
      }
      if (this.systemHooks.has("kick")) {
        for (const hook of this.systemHooks.get("kick")) {
          try {
            await hook(payload);
          } catch (_) {}
        }
      }
    }
  }
}

function melissaOnLaunch(callback) {
  if (global.Melissa?.Bot?.melissaOnLaunch) {
    return global.Melissa.Bot.melissaOnLaunch(callback);
  }
  return () => {};
}

module.exports = {
  EventRegistry,
  melissaOnLaunch,
  ROLES,
  MESSAGE_EFFECTS,
};
