"use strict";

module.exports = {
  loader: {
    Name: "uid",
    Author: "Badhon-00",
    Aliases: ["id"],
    Category: "utility",
    Role: 0,
    Version: "1.0.0",
    Usage: "!uid",
    Guide: "!uid",
    Description: "Show your Instagram sender ID.",
  },
  async run(ctx) {
    return ctx.reply(ctx.t("commands.uid.result", { id: ctx.senderID }));
  },
};
