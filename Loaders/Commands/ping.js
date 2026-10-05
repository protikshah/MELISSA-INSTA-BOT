"use strict";

module.exports = {
  loader: {
    Name: "ping",
    Author: "Badhon-00",
    Aliases: ["status"],
    Category: "utility",
    Role: 0,
    Version: "1.0.0",
    Usage: "!ping",
    Guide: "!ping",
    Description: "Check that Melissa is responding.",
  },
  melissaOnLaunch({ api, event, ctx }) {
    console.log("[Ping Module] Successfully loaded and initialized.");
  },
  async run(ctx) {
    return ctx.reply(ctx.t("commands.ping.result"));
  },
};
