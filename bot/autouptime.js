"use strict";

function createUptimeService({
  startedAt = Date.now(),
  restartAfterDays = 10,
} = {}) {
  const restartAfterMs = Number(restartAfterDays) * 24 * 60 * 60 * 1000;
  let restartTimer = null;

  return {
    startedAt: new Date(startedAt).toISOString(),
    seconds() {
      return Math.floor((Date.now() - startedAt) / 1000);
    },
    restartAfterDays: Number(restartAfterDays),
    restartDue() {
      return (
        Number.isFinite(restartAfterMs) &&
        restartAfterMs > 0 &&
        Date.now() - startedAt >= restartAfterMs
      );
    },
    scheduleRestart(callback, onError = () => {}) {
      if (restartTimer) clearTimeout(restartTimer);
      if (
        !Number.isFinite(restartAfterMs) ||
        restartAfterMs <= 0 ||
        restartAfterMs > 2147483647
      )
        return () => {};
      restartTimer = setTimeout(
        () => Promise.resolve().then(callback).catch(onError),
        restartAfterMs,
      );
      restartTimer.unref?.();
      return () => {
        clearTimeout(restartTimer);
        restartTimer = null;
      };
    },
  };
}

module.exports = { createUptimeService };
