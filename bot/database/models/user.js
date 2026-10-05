"use strict";

function createUserRecord({
  id,
  firstSeenAt = new Date().toISOString(),
  lastSeenAt = firstSeenAt,
  greetedAt = null,
} = {}) {
  const userId = String(id || "").trim();
  if (!userId) throw new Error("Instagram sender ID is required.");
  return { id: userId, firstSeenAt, lastSeenAt, greetedAt };
}

module.exports = { createUserRecord };
