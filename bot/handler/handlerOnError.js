"use strict";

function handleOnError(error, logger, context = {}) {
  const safe = error instanceof Error ? error : new Error(String(error));
  const payload = {
    timestamp: new Date().toISOString(),
    severity: "ERROR",
    component: context.handler || "unknown",
    operation: context.operation || context.handler || "unknown",
    message: safe.message,
    stack: safe.stack,
    command: context.command,
    event: context.event,
    plugin: context.plugin,
    threadId: context.threadId,
    userId: context.userId,
  };
  logger?.error?.("Melissa handler error", payload);
  return safe;
}

module.exports = { handleOnError };
