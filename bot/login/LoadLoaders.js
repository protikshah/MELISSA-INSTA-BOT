"use strict";
const fs = require("node:fs");
const { CommandRegistry } = require("../../func/commandFunc");
const { EventRegistry } = require("../handler/handlerEvent");

function loadCommandManifest(manifestPath) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (
    !manifest ||
    typeof manifest !== "object" ||
    !Array.isArray(manifest.commands)
  ) {
    throw new Error("loader.Commands.json must contain a commands array.");
  }
  if (manifest.commands.some((name) => typeof name !== "string")) {
    throw new Error("Every command in loader.Commands.json must be a string.");
  }
  return [...manifest.commands];
}

function loadLoaders({ settings, logger, t, adminIds, ownerIds, actions }) {
  const commands = new CommandRegistry({
    commandsDir: settings.paths.commandsDir,
    commandFiles: loadCommandManifest(settings.paths.commandsManifest),
    prefix: settings.bot.prefix,
    adminIds,
    ownerIds,
    logger,
    t,
    actions,
  });

  const events = new EventRegistry({
    eventsDir: settings.paths.eventsDir,
    logger,
    t,
    config: {
      owners: ownerIds || [],
      botAdmins: adminIds || [],
      developers: settings.bot.developerIds || [],
      premium: settings.bot.premiumIds || [],
      vip: settings.bot.vipIds || [],
      prefix: settings.bot.prefix,
      selfListen: settings.bot.selfListen,
    },
  });

  return {
    commands,
    events,
    commandCount: commands.load(),
    eventCount: events.load(),
  };
}

module.exports = { loadLoaders, loadCommandManifest };
