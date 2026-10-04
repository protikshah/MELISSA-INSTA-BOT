"use strict";
const fs = require("node:fs");
const path = require("node:path");

function parseCommand(text, prefix = "!") {
  const trimmed = String(text || "").trim();
  if (!trimmed.startsWith(prefix)) return null;
  const words =
    trimmed.slice(prefix.length).match(/"[^"\n]*"|'[^'\n]*'|\S+/g) || [];
  const name = (words.shift() || "").toLowerCase();
  return name
    ? {
        name,
        args: words.map((s) =>
          s.replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, (_, a, b) => a ?? b),
        ),
      }
    : null;
}

class CommandRegistry {
  constructor({
    commandsDir,
    commandFiles,
    prefix = "!",
    adminIds = [],
    ownerIds = adminIds,
    logger,
    t,
  }) {
    this.commandsDir = commandsDir;
    this.commandFiles = commandFiles;
    this.prefix = prefix;
    this.adminIds = new Set(adminIds.map(String));
    this.ownerIds = new Set(ownerIds.map(String));
    this.logger = logger;
    this.t = t;
    this.commands = new Map();
    this.plugins = new Map();
  }

  setAdminIds(ids = []) {
    this.adminIds = new Set(ids.map(String));
  }

  _validate(plugin, file) {
    if (!plugin || !plugin.loader || typeof plugin.run !== "function")
      throw new Error("Invalid command loader: " + file);
    const c = plugin.loader;
    for (const field of [
      "Name",
      "Author",
      "Aliases",
      "Category",
      "Role",
      "Version",
      "Usage",
      "Guide",
    ]) {
      if (c[field] === undefined)
        throw new Error("Command " + file + " is missing loader." + field);
    }
    if (!Array.isArray(c.Aliases))
      throw new Error("Command " + file + " Aliases must be an array.");
    const names = [c.Name, ...c.Aliases].map((name) =>
      String(name).trim().toLowerCase(),
    );
    if (names.some((name) => !/^[a-z0-9_-]+$/.test(name)))
      throw new Error("Command " + file + " has an invalid name or alias.");
    return names;
  }

  _register(plugin, file) {
    const names = this._validate(plugin, file);
    const canonical = String(plugin.loader.Name).toLowerCase();
    for (const name of names) {
      const existing = this.commands.get(name);
      if (existing && String(existing.loader.Name).toLowerCase() !== canonical)
        throw new Error("Duplicate command name or alias: " + name);
    }
    const previous = this.plugins.get(canonical);
    if (previous)
      for (const oldName of previous.names) this.commands.delete(oldName);
    for (const name of names) this.commands.set(name, plugin);
    this.plugins.set(canonical, { plugin, names, file });
    return plugin;
  }

  load() {
    this.commands.clear();
    this.plugins.clear();
    fs.mkdirSync(this.commandsDir, { recursive: true });
    const files =
      this.commandFiles ||
      fs
        .readdirSync(this.commandsDir)
        .filter((file) => file.endsWith(".js"))
        .sort();
    for (const file of files) {
      try {
        this.loadCommand(file);
      } catch (err) {
        this.logger?.error?.(`Failed to load command ${file}: ${err.message}`);
      }
    }
    return this.plugins.size;
  }

  loadCommand(name) {
    const file = String(name || "").endsWith(".js")
      ? String(name)
      : String(name || "") + ".js";
    if (!/^[a-z0-9_-]+\.js$/i.test(file))
      throw new Error("Use a local command name, not a path.");
    const full = path.join(this.commandsDir, file);
    if (!fs.existsSync(full)) throw new Error("Command file not found: " + file);
    delete require.cache[require.resolve(full)];
    return this._register(require(full), file);
  }

  unloadCommand(name) {
    const key = String(name || "")
      .replace(/\.js$/i, "")
      .toLowerCase();
    const entry =
      this.plugins.get(key) ||
      [...this.plugins.values()].find((item) => item.names.includes(key));
    if (!entry) return false;
    for (const alias of entry.names) this.commands.delete(alias);
    this.plugins.delete(String(entry.plugin.loader.Name).toLowerCase());
    return true;
  }

  _resolveRole(senderID, threadID) {
    const melissa = global.Melissa;
    if (melissa && typeof melissa.getRole === "function") {
      return melissa.getRole(senderID);
    }
    if (this.ownerIds.has(String(senderID))) return 6;
    if (this.adminIds.has(String(senderID))) return 2;
    return 0;
  }

  async dispatch({ text, senderID, threadID, messageID }) {
    const input = String(text || "").trim();
    const hasPrefix = Boolean(this.prefix) && input.startsWith(this.prefix);

    const userRole = this._resolveRole(senderID, threadID);
    const noPrefix = userRole >= 1;

    if (!hasPrefix && !noPrefix) return false;

    const parsed = this.prefix
      ? parseCommand(hasPrefix ? input : this.prefix + input, this.prefix)
      : parseCommand(input, "");

    if (!parsed) return false;
    const plugin = this.commands.get(parsed.name);
    if (!plugin) return false;

    const requiredRole = Number(plugin.loader.Role) || 0;
    if (requiredRole > userRole) {
      await this._reply(threadID, this.t("commands.errors.admin"));
      return true;
    }

    const ctx = {
      bot: global.Melissa,
      threadID: String(threadID),
      senderID: String(senderID),
      messageID: String(messageID || ""),
      args: parsed.args,
      isGroup: false,
      isAdmin: userRole >= 2,
      isOwner: userRole >= 6,
      reply: (message) => this._reply(threadID, message),
      react: (...args) => global.Melissa.Bot?.React?.(...args),
      t: this.t,
    };

    try {
      await plugin.run(ctx);
    } catch (error) {
      const bot = global.Melissa;
      if (typeof bot?.errorlogs === "function") {
        await bot.errorlogs(error, {
          handler: "command",
          command: plugin.loader.Name,
          threadId: threadID,
          userId: senderID,
        });
      } else {
        this.logger?.error("Command failed", {
          command: plugin.loader.Name,
          message: error.message,
        });
      }
      await this._reply(threadID, this.t("errors.send")).catch(() => {});
    }
    return true;
  }

  async _reply(threadID, text) {
    const melissa = global.Melissa;
    if (melissa?.Bot?.melissaChat) {
      return melissa.Bot.melissaChat(threadID, text);
    }
    return melissa.messages.sendText(threadID, text);
  }
}

module.exports = { CommandRegistry, parseCommand };
