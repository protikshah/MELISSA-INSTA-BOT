"use strict";

class MetaApi {
  constructor({ env = process.env, settings, fetchImpl = globalThis.fetch } = {}) {
    this.env = env;
    this.settings = settings || {};
    this.fetch = fetchImpl;
  }

  _config() {
    const accountId = this.env.META_IG_USER_ID;
    const token = this.env.META_ACCESS_TOKEN;
    if (!accountId || !token)
      throw new Error(
        "Meta API is not configured: set META_IG_USER_ID and META_ACCESS_TOKEN.",
      );
    if (typeof this.fetch !== "function")
      throw new Error("This Node runtime does not provide fetch. Use Node 18+.");

    const version =
      this.settings.meta?.graphApiVersion ||
      this.env.META_GRAPH_API_VERSION ||
      "v23.0";
    const base = (
      this.settings.meta?.graphApiBase ||
      this.env.META_GRAPH_API_BASE ||
      "https://graph.facebook.com"
    ).replace(/\/$/, "");

    const url = `${base}/${encodeURIComponent(version)}/${encodeURIComponent(
      accountId,
    )}/messages`;

    return { accountId, token, url };
  }

  async _post(body) {
    const { token, url } = this._config();
    const response = await this.fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer " + token,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      let detail = "";
      try {
        detail = JSON.stringify(await response.json());
      } catch (_) {}
      throw new Error(
        "Meta Graph API returned HTTP " + response.status + " " + detail,
      );
    }
    return response.json().catch(() => ({}));
  }

  async sendText(recipientId, text) {
    return this._post({
      recipient: { id: String(recipientId) },
      message: { text: String(text) },
      messaging_type: "RESPONSE",
    });
  }

  async sendReply(recipientId, text, replyMessageId) {
    return this._post({
      recipient: { id: String(recipientId) },
      message: {
        text: String(text),
        reply_to: { mid: String(replyMessageId) },
      },
      messaging_type: "RESPONSE",
    });
  }

  async sendAction(recipientId, action) {
    return this._post({
      recipient: { id: String(recipientId) },
      sender_action: String(action),
    });
  }

  async markSeen(recipientId) {
    return this.sendAction(recipientId, "mark_seen");
  }

  async sendReaction(recipientId, messageId, emoji) {
    return this._post({
      recipient: { id: String(recipientId) },
      sender_action: "react",
      payload: { message_id: String(messageId), reaction: String(emoji) },
    });
  }

  async sendEffect(recipientId, text, effectId) {
    return this._post({
      recipient: { id: String(recipientId) },
      message: {
        text: String(text),
        attachment: {
          type: "template",
          payload: { template_type: "effect", effect_id: String(effectId) },
        },
      },
      messaging_type: "RESPONSE",
    });
  }
}

module.exports = { MetaApi };
