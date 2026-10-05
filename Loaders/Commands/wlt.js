"use strict";

module.exports = {
  loader: {
    Name: "wlt",
    Author: "MELISSA-INSTA-BOT",
    Aliases: ["welcome"],
    Category: "admin",
    Role: 1,
    Version: "1.0.0",
    Usage: "!wlt <status|on|off>",
    Guide: "!wlt status",
    Description: "Check or change the optional first-message welcome.",
  },
  async run(ctx) {
    const [action = "status"] = ctx.args;
    const current =
      (await ctx.bot.db.get("settings", "welcome-enabled")) ??
      ctx.bot.settings.welcome.enabled;

    if (action === "status")
      return ctx.reply(`Welcome messages are ${current ? "on" : "off"}.`);

    if (action === "on" || action === "off") {
      const enabled = action === "on";
      await ctx.bot.db.set("settings", "welcome-enabled", enabled);
      return ctx.reply(`Welcome messages are now ${enabled ? "on" : "off"}.`);
    }

    return ctx.reply("Usage: !wlt <status|on|off>");
  },
};
