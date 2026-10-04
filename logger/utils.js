"use strict";

function safeError(error) {
  return {
    name: error?.name || "Error",
    message: String(error?.message || error || "Unknown error"),
  };
}

module.exports = { safeError };
