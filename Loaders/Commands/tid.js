"use strict";

module.exports = {
  loader: {
    Name: "tid",
    Author: "MELISSA-INSTA-BOT",
    Aliases: ["threadid"],
    Category: "utility",
    Role: 0,
    Version: "1.0.0",
    Usage: "!tid",
    Guide: "!tid",
    Description:
      "Show the Instagram conversation ID available to this webhook.",
  },
  async run(ctx) {
    return ctx.reply(`Conversation ID: ${ctx.threadID}`);
  },
};
