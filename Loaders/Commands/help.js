"use strict";

module.exports = {
  loader: {
    Name: "help",
    Author: "Badhon-00",
    Aliases: ["commands"],
    Category: "utility",
    Role: 0,
    Version: "1.0.0",
    Usage: "!help",
    Guide: "!help",
    Description: "List available commands.",
  },
  async run(ctx) {
    const unique = [...new Set(ctx.bot.commands.commands.values())];
    if (!unique.length) return ctx.reply(ctx.t("commands.help.empty"));
    const rows = unique.map((plugin) =>
      ctx.t("commands.help.row", {
        name: plugin.loader.Name,
        description:
          plugin.loader.Description ||
          plugin.loader.description ||
          plugin.loader.Usage,
      }),
    );
    return ctx.reply(ctx.t("commands.help.title") + "\n" + rows.join("\n"));
  },
};
