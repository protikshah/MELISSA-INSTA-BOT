"use strict";

module.exports = {
  loader: {
    Name: "cmd",
    Author: "MELISSA-INSTA-BOT",
    Aliases: ["loader"],
    Category: "admin",
    Role: 1,
    Version: "1.0.0",
    Usage: "!cmd <list|reload|load|unload|events> [name]",
    Guide: "!cmd list",
    Description: "Manage trusted local command and event plugins.",
  },
  async run(ctx) {
    const [action = "list", kindOrName, maybeName] = ctx.args;
    const commands = ctx.bot.commands;
    const events = ctx.bot.events;

    if (action === "list") {
      const names = [...commands.plugins.keys()].sort();
      return ctx.reply(`Commands: ${names.join(", ") || "none"}`);
    }

    if (action === "reload") {
      const count = commands.load();
      ctx.bot.commandCount = count;
      return ctx.reply(`Reloaded ${count} command plugins.`);
    }

    if (action === "events") {
      const [eventAction = "list", eventName] = ctx.args.slice(1);

      if (eventAction === "list") {
        const names = [...events.events.values()]
          .flat()
          .map((plugin) => plugin.loader.Name)
          .sort();
        return ctx.reply(`Events: ${names.join(", ") || "none"}`);
      }

      if (eventAction === "reload") {
        const count = events.load();
        ctx.bot.eventCount = count;
        return ctx.reply(`Reloaded ${count} event plugins.`);
      }

      if (eventAction === "load" && eventName) {
        const plugin = events.loadEvent(eventName);
        return ctx.reply(`Loaded event ${plugin.loader.Name}.`);
      }

      if (eventAction === "unload" && eventName) {
        if (eventName.toLowerCase() === "all") {
          events.events.clear();
          return ctx.reply(
            "Unloaded all event plugins from memory. Use !cmd events reload to restore them.",
          );
        }
        return ctx.reply(
          events.unloadEvent(eventName)
            ? `Unloaded event ${eventName}.`
            : `Event not found: ${eventName}.`,
        );
      }

      return ctx.reply("Usage: !cmd events <list|reload|load|unload> [name]");
    }

    if (action === "load" && kindOrName) {
      const plugin = commands.loadCommand(kindOrName);
      return ctx.reply(`Loaded command ${plugin.loader.Name}.`);
    }

    if (
      (action === "unload" || action === "uninstall") &&
      kindOrName === "all"
    ) {
      const manager = commands.plugins.get("cmd");
      commands.commands.clear();
      commands.plugins.clear();
      if (manager) {
        for (const alias of manager.names)
          commands.commands.set(alias, manager.plugin);
        commands.plugins.set("cmd", manager);
      }
      return ctx.reply(
        "Unloaded all command plugins from memory. Use !cmd reload to restore them.",
      );
    }

    if ((action === "unload" || action === "uninstall") && kindOrName) {
      return ctx.reply(
        commands.unloadCommand(kindOrName)
          ? `Unloaded command ${kindOrName}. It remains on disk.`
          : `Command not found: ${kindOrName}.`,
      );
    }

    if (action === "install") {
      return ctx.reply(
        "For safety, install only trusted local plugin files in Loaders/Commands or Loaders/Events, then use !cmd load or !cmd events load.",
      );
    }

    return ctx.reply(
      "Usage: !cmd <list|reload|load|unload|install> [name]; use !cmd events for event plugins.",
    );
  },
};
