"use strict";
const { createUserRecord } = require("../../bot/database/models/user");

const inFlight = new Map();

module.exports = {
  loader: { Name: "welcome", EventType: "message", Version: "1.0.0" },
  async run({ event, bot }) {
    const enabled = await bot.db.get("settings", "welcome-enabled");
    if (
      !(enabled ?? bot.settings.welcome.enabled) ||
      !event.senderId ||
      !event.text
    )
      return;

    const userId = String(event.senderId);
    if (inFlight.has(userId)) return inFlight.get(userId);

    const job = (async () => {
      const user = await bot.db.get("users", userId);
      const now = Date.now();
      const cooldown =
        Math.max(1, Number(bot.settings.welcome.cooldownDays) || 30) *
        86400000;

      if (user?.greetedAt && now - Date.parse(user.greetedAt) < cooldown) {
        await bot.db.set("users", userId, {
          ...user,
          lastSeenAt: new Date(now).toISOString(),
        });
        return;
      }

      await bot.messages.sendText(userId, bot.settings.welcome.message);

      const timestamp = new Date(now).toISOString();
      await bot.db.set(
        "users",
        userId,
        createUserRecord({
          id: userId,
          firstSeenAt: user?.firstSeenAt || timestamp,
          lastSeenAt: timestamp,
          greetedAt: timestamp,
        }),
      );
    })();

    inFlight.set(userId, job);
    try {
      await job;
    } finally {
      inFlight.delete(userId);
    }
  },
};
