"use strict";
const { getMetaSetupStatus } = require("./helper");
const { loadMessages } = require("./loadData");

function validateMetaSetup({ env = process.env, t = loadMessages(env) } = {}) {
  const status = getMetaSetupStatus(env);
  return {
    configured: status.configured,
    missing: status.missing,
    message: status.configured
      ? t("meta.setup.ready")
      : t("meta.setup.missing", { missing: status.missing.join(", ") }),
    passwordLoginSupported: false,
  };
}

async function bootEngine() {
  const { main } = require("../../index");
  return main();
}

module.exports = {
  bootEngine,
  login: bootEngine,
  validateMetaSetup,
  getMetaSetupStatus,
  Start: { Bot: bootEngine },
};
