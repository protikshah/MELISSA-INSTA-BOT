"use strict";

module.exports = {
  loader: {
    Name: "uptime",
    Author: "MELISSA-INSTA-BOT",
    Aliases: ["up"],
    Category: "utility",
    Role: 0,
    Version: "1.0.0",
    Usage: "!uptime",
    Guide: "!uptime",
    Description: "Show how long the bot process has been running.",
  },
  async run(ctx) {
    const seconds = ctx.bot.uptime.seconds();
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    return ctx.reply(
      `Uptime: ${days}d ${hours}h ${minutes}m ${remainingSeconds}s`,
    );
  },
};
