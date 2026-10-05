"use strict";

module.exports = {
  loader: {
    Name: "kick",
    Author: "MELISSA-INSTA-BOT",
    Aliases: [],
    Category: "admin",
    Role: 1,
    Version: "1.0.0",
    Usage: "!kick <sender-id>",
    Guide: "!kick <sender-id>",
    Description:
      "Instagram messaging does not provide group member kick actions.",
  },
  async run(ctx) {
    return ctx.reply(
      "No action taken: the official Instagram Messaging API does not support kicking members from group chats.",
    );
  },
};
