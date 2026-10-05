"use strict";

module.exports = {
  loader: {
    Name: "leave",
    Author: "MELISSA-INSTA-BOT",
    Aliases: [],
    Category: "admin",
    Role: 1,
    Version: "1.0.0",
    Usage: "!leave",
    Guide: "!leave",
    Description:
      "Group leave actions are not available through this Instagram API starter.",
  },
  async run(ctx) {
    return ctx.reply(
      "No action taken: group membership and leave actions are not supported by this Instagram API starter.",
    );
  },
};
