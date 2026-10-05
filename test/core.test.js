"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const { parseCommand, CommandRegistry } = require("../func/commandFunc");
const { verifySignature } = require("../func/webhookSecurity");
const { JsonDatabase } = require("../bot/database/connectDB/json");
const { connectDB } = require("../bot/database/connectDB");
const {
  createAdminController,
} = require("../bot/database/controller/adminController");
const { MelissaOnLoad, MelissaOnLaunch } = require("../Melissa");
const { processWebhook } = require("../index");
const { createTranslator, loadLanguage } = require("../func/langFunc");
const { loadSettings, loadMessages } = require("../bot/login/loadData");
const { loadCommandManifest } = require("../bot/login/LoadLoaders");
const { validateMetaSetup } = require("../bot/login/login");
const { EventRegistry } = require("../bot/handler/handlerEvent");

test("command parser handles aliases input and quoted arguments", () => {
  assert.deepEqual(parseCommand('!kick "Jane Doe" now'), {
    name: "kick",
    args: ["Jane Doe", "now"],
  });
  assert.equal(parseCommand("hello", "!"), null);
  assert.deepEqual(parseCommand("!UID"), { name: "uid", args: [] });
});

test("English localization loads .lang keys and interpolates both placeholder styles", () => {
  const dictionary = loadLanguage("en");
  const t = createTranslator("en", "en");
  assert.ok(Object.keys(dictionary).length > 30);
  assert.equal(
    t("commands.help.row", { name: "help", description: "Show commands" }),
    "!help — Show commands",
  );
  assert.equal(
    t("login.gbanMessage", ["Project", "spam", "today"]),
    "You have been banned from the Goat-Bot project on Project for the reason: spam\n» Time: today",
  );
  assert.equal(t("not.a.translation.key"), "not.a.translation.key");
});

test("environment settings and Meta setup messages share the .lang translator", () => {
  const env = {
    BOT_NAME: "Melissa Test",
    BOT_OWNER_IDS: "owner-1,owner-2",
    RESTART_AFTER_DAYS: "5",
    WELCOME_ENABLED: "true",
  };
  const settings = loadSettings(env);
  const t = loadMessages(env);
  assert.equal(settings.bot.name, "Melissa Test");
  assert.equal(settings.maintenance.restartAfterDays, 5);
  assert.deepEqual(settings.bot.ownerIds, ["owner-1", "owner-2"]);
  assert.equal(settings.welcome.enabled, true);

  const manifest = loadCommandManifest(settings.paths.commandsManifest);
  assert.ok(manifest.includes("ping"));
  assert.ok(manifest.includes("help"));
  assert.ok(manifest.includes("out"));

  const missing = validateMetaSetup({ env: {}, t });
  assert.equal(missing.configured, false);
  assert.ok(missing.missing.includes("META_IG_USER_ID"));

  const ready = validateMetaSetup({
    t,
    env: {
      ...env,
      META_IG_USER_ID: "test-account",
      META_ACCESS_TOKEN: "test-token",
      META_WEBHOOK_VERIFY_TOKEN: "test-verify",
      META_APP_SECRET: "test-app-secret",
    },
  });
  assert.equal(ready.configured, true);
  assert.equal(ready.passwordLoginSupported, false);
});

test("event-handler errors use the injected translation catalog", async () => {
  const logs = [];
  const registry = new EventRegistry({
    eventsDir: path.resolve(__dirname, "../Loaders/Events"),
    logger: { error: (...args) => logs.push(args), warn() {}, info() {} },
    t: (key) => `translated:${key}`,
  });
  registry.events.set("test", [
    {
      loader: { Name: "broken", EventType: "test" },
      run: async () => {
        throw new Error("expected test error");
      },
    },
  ]);
  await registry.dispatch("test", {}, {});
  assert.ok(logs.length > 0);
});

test("configured admins may omit the prefix; public users may not", async (t) => {
  const replies = [];
  const originalMelissa = global.Melissa;
  const logger = { error() {}, warn() {}, info() {} };

  global.Melissa = {
    messages: { sendText: async (...args) => replies.push(args) },
    uptime: { seconds: () => 42 },
    config: { prefix: "!", selfListen: false },
    getRole: (uid) => (String(uid) === "admin-1" ? 6 : 0),
    hasNoPrefixAccess: (uid) => String(uid) === "admin-1",
    Bot: { melissaChat: async (tid, txt) => replies.push([tid, txt]) },
  };

  t.after(() => {
    if (originalMelissa) global.Melissa = originalMelissa;
    else delete global.Melissa;
  });

  const registry = new CommandRegistry({
    commandsDir: path.resolve(__dirname, "../Loaders/Commands"),
    prefix: "!",
    adminIds: ["admin-1"],
    ownerIds: ["admin-1"],
    logger,
    t: (key) => key,
  });
  const count = registry.load();
  assert.equal(count, 11);

  assert.equal(
    await registry.dispatch({
      text: "uptime",
      senderID: "visitor",
      threadID: "visitor",
    }),
    false,
  );

  assert.equal(
    await registry.dispatch({
      text: "uptime",
      senderID: "admin-1",
      threadID: "admin-1",
    }),
    true,
  );
  assert.match(String(replies.at(-1)[1]), /Uptime:/);

  assert.equal(
    await registry.dispatch({
      text: "!uptime",
      senderID: "visitor",
      threadID: "visitor",
    }),
    true,
  );
});

test("JSON database persists values and deletes keys", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "melissa-json-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const file = path.join(root, "database.json");
  const db = await new JsonDatabase(file).connect();
  await db.set("users", "123", { greeted: true });
  assert.deepEqual(await db.get("users", "123"), { greeted: true });
  await db.close();
  const reopened = await new JsonDatabase(file).connect();
  assert.deepEqual(await reopened.get("users", "123"), { greeted: true });
  assert.equal(await reopened.delete("users", "123"), true);
  assert.equal(await reopened.get("users", "123"), undefined);
  await reopened.close();
});

test("JSON database rejects prototype pollution attempts", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "melissa-poll-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const db = await new JsonDatabase(
    path.join(root, "database.json"),
  ).connect();
  await assert.rejects(() => db.get("__proto__", "x"));
  await assert.rejects(() => db.get("users", "constructor"));
  await assert.rejects(() => db.get("users", "prototype"));
  await db.close();
});

test("MongoDB mode fails clearly when its secret is missing", async () => {
  await assert.rejects(
    connectDB({ settings: { database: { type: "mongodb" } }, env: {} }),
    /MONGODB_URI is required/,
  );
});

test("admin controller preserves configured owners and requires an owner to manage IDs", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "melissa-admin-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const db = await new JsonDatabase(
    path.join(root, "database.json"),
  ).connect();
  const admins = createAdminController({ db, ownerIds: ["owner-1"] });
  await admins.load();
  assert.deepEqual(admins.list(), ["owner-1"]);
  await assert.rejects(
    admins.add("admin-2", "admin-2"),
    /configured bot owner/,
  );
  await admins.add("admin-2", "owner-1");
  assert.equal(admins.isAdmin("admin-2"), true);
  await assert.rejects(
    admins.remove("owner-1", "owner-1"),
    /cannot be removed/,
  );
  await admins.remove("admin-2", "owner-1");
  assert.deepEqual(admins.list(), ["owner-1"]);
  await db.close();
});

test("Melissa loads plugins and exposes lifecycle hooks", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "melissa-app-"));
  const originalMelissa = global.Melissa;
  t.after(async () => {
    await global.Melissa?.db?.close?.();
    if (originalMelissa) global.Melissa = originalMelissa;
    else delete global.Melissa;
    await fs.rm(root, { recursive: true, force: true });
  });

  const logs = [];
  const lifecycle = [];
  const logger = {
    info: (...args) => logs.push(args),
    warn() {},
    error: (...args) => logs.push(args),
  };

  const bot = await MelissaOnLoad({
    dataDir: root,
    logger,
    loader: {
      melissaOnLaunch: () => lifecycle.push("launch"),
    },
    sendImpl: async () => ({ ok: true }),
  });

  assert.equal(MelissaOnLaunch, MelissaOnLoad);
  assert.equal(bot.name, "MELISSA-INSTA-BOT");
  assert.equal(bot.ready, true);
  assert.equal(bot.commandCount, 11);
  assert.ok(bot.eventCount >= 2);
  assert.equal(bot.status().ready, true);
  assert.deepEqual(lifecycle, ["launch"]);
  assert.equal(typeof bot.loader.melissaRead, "function");
  assert.equal(typeof bot.loader.melissaPostback, "function");
  assert.equal(bot.loader.melissaChat, bot.loader.melissaMessage);

  await bot.Bot.sendMessage("visitor", "hello");
});

test("webhook dispatcher routes text and supported event payloads and skips echoes", async () => {
  const messages = [];
  const events = [];
  const melissa = {
    handleIncoming: async (event) => messages.push(event),
    handleEvent: async (type, event) => events.push({ type, event }),
  };
  await processWebhook(
    {
      entry: [
        {
          messaging: [
            { sender: { id: "u1" }, message: { mid: "m1", text: "hello" } },
            {
              sender: { id: "u2" },
              message: { mid: "m2", text: "echo", is_echo: true },
            },
            {
              sender: { id: "u3" },
              reaction: { mid: "m3", action: "react" },
            },
            { sender: { id: "u4" }, read: { watermark: 123 } },
            { sender: { id: "u5" }, postback: { payload: "HELP" } },
            {
              sender: { id: "u6" },
              message: { mid: "m6", attachments: [{ type: "image" }] },
            },
          ],
        },
      ],
    },
    melissa,
  );
  assert.equal(messages.length, 1);
  assert.equal(messages[0].senderId, "u1");
  assert.equal(messages[0].text, "hello");
  assert.deepEqual(
    events.map((event) => event.type),
    ["message", "reaction", "read", "postback"],
  );
});

test("webhook signature accepts valid HMAC and rejects modified payload", () => {
  const body = Buffer.from('{"object":"instagram"}');
  const secret = "test-secret";
  const signature =
    "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
  assert.equal(verifySignature(body, signature, secret), true);
  assert.equal(
    verifySignature(Buffer.from("changed"), signature, secret),
    false,
  );
  assert.equal(verifySignature(body, null, secret), false);
});
