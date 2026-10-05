"use strict";

function createHandlerAction({ messages }) {
  return {
    sendMessage(recipientId, text) {
      return messages.sendText(recipientId, text);
    },
    async sendMessageWithMessageEffectPayload() {
      throw new Error(
        "Instagram Messaging API message-effect payloads are not supported by this starter.",
      );
    },
    async react() {
      throw new Error(
        "Instagram message reactions are not supported by this starter.",
      );
    },
  };
}

module.exports = { createHandlerAction };
