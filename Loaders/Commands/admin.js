"use strict";

module.exports = {
  loader: {
    Name: "admin",
    Author: "MELISSA-INSTA-BOT",
    Aliases: ["admins"],
    Category: "admin",
    Role: 1,
    Version: "1.0.0",
    Usage: "!admin [list|add <sender-id>|remove <sender-id>]",
    Guide: "!admin list",
    Description: "List admins or manage admins as a configured bot owner.",
  },
  async run(ctx) {
    const [action = "list", id] = ctx.args;
    const admins = ctx.bot.admins;

    if (action === "list")
      return ctx.reply(
        `Admin sender IDs: ${admins.list().join(", ") || "none configured"}`,
      );

    if (!ctx.isOwner)
      return ctx.reply(
        "Only a sender ID in BOT_OWNER_IDS can add or remove admins.",
      );

    if (action === "add" && id) {
      await admins.add(id, ctx.senderID);
      ctx.bot.commands.setAdminIds(admins.list());
      return ctx.reply(`Added admin ${id}.`);
    }

    if (action === "remove" && id) {
      await admins.remove(id, ctx.senderID);
      ctx.bot.commands.setAdminIds(admins.list());
      return ctx.reply(`Removed admin ${id}.`);
    }

    return ctx.reply(
      "Usage: !admin list | !admin add <sender-id> | !admin remove <sender-id>",
    );
  },
};
