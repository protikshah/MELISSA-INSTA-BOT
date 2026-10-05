"use strict";

module.exports = {
  loader: {
    Name: "out",
    Author: "MELISSA-INSTA-BOT",
    Aliases: ["leaveall"],
    Category: "admin",
    Role: 1,
    Version: "1.0.0",
    Usage: "!out",
    Guide: "!out",
    Description: "Unsupported group leave action for Instagram API.",
  },
  async run(ctx) {
    return ctx.reply(
      "No action taken: group leave actions are not supported by the Instagram Messaging API.",
    );
  },
};
