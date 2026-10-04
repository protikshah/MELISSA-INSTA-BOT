"use strict";

class MessageService {
  constructor({ api, maxPerMinute = 30, sendImpl } = {}) {
    this.api = api;
    this.maxPerMinute = maxPerMinute;
    this.sendImpl = sendImpl;
    this.windows = new Map();
  }

  async sendText(recipientId, text) {
    const clean = String(text ?? "").trim();
    if (!clean) throw new Error("Message text cannot be empty.");
    if (clean.length > 1000)
      throw new Error("Message exceeds the 1000-character limit.");

    const now = Date.now();
    const key = String(recipientId);
    let w = this.windows.get(key);
    if (!w || now - w.startedAt >= 60000) w = { startedAt: now, count: 0 };
    if (w.count >= this.maxPerMinute)
      throw new Error(
        "Local send limit reached for this recipient; try again later.",
      );

    w.count += 1;
    this.windows.set(key, w);

    return this.sendImpl
      ? this.sendImpl(key, clean)
      : this.api.sendText(key, clean);
  }
}

module.exports = { MessageService };
