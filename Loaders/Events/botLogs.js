"use strict";

module.exports = {
  loader: { Name: "botLogs", EventType: "*", Version: "1.0.0" },
  async run({ type, logger }) {
    logger?.info("Instagram webhook event handled", {
      eventType: String(type),
    });
  },
};
