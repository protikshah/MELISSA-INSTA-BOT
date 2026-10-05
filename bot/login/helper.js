"use strict";

function getMetaSetupStatus(env = process.env) {
  const names = [
    "META_IG_USER_ID",
    "META_ACCESS_TOKEN",
    "META_WEBHOOK_VERIFY_TOKEN",
    "META_APP_SECRET",
  ];
  const missing = names.filter((name) => !env[name]);
  return { configured: missing.length === 0, missing };
}

module.exports = { getMetaSetupStatus };
