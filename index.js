"use strict";
const http = require("node:http");
const { MelissaOnLoad } = require("./Melissa");
const { loadSettings } = require("./bot/login/loadData");
const { verifySignature } = require("./func/webhookSecurity");

function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(
          Object.assign(new Error("Payload too large"), { statusCode: 413 }),
        );
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function main({ env = process.env, loader } = {}) {
  const settings = loadSettings(env);
  const webhookPath = settings.server.webhookPath;
  const { host, port } = settings.server;
  const verifyToken = env.META_WEBHOOK_VERIFY_TOKEN;
  const appSecret = env.META_APP_SECRET;

  let melissa = await MelissaOnLoad({ env, loader });
  let server;
  const pendingWebhooks = new Set();
  let cancelAutoRestart = () => {};
  let stopping = false;

  function createServer(instance) {
    return http.createServer(async (req, res) => {
      const url = new URL(req.url, "http://localhost");

      if (req.method === "GET" && url.pathname === "/health") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(instance.status()));
        return;
      }

      if (url.pathname !== webhookPath) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      if (req.method === "GET") {
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");
        if (
          mode === "subscribe" &&
          verifyToken &&
          token === verifyToken &&
          challenge
        ) {
          res.writeHead(200, { "content-type": "text/plain" });
          res.end(challenge);
          return;
        }
        res.writeHead(403);
        res.end("Webhook verification failed");
        return;
      }

      if (req.method === "POST") {
        let raw;
        try {
          raw = await readBody(req, settings.limits.maxWebhookBytes);
        } catch (error) {
          if (!res.headersSent) {
            res.writeHead(error.statusCode || 400);
            res.end("Invalid request");
          }
          return;
        }

        if (!appSecret && env.NODE_ENV === "production") {
          res.writeHead(503);
          res.end("Webhook signature verification is not configured");
          return;
        }

        if (
          appSecret &&
          !verifySignature(raw, req.headers["x-hub-signature-256"], appSecret)
        ) {
          res.writeHead(401);
          res.end("Invalid signature");
          return;
        }

        let payload;
        try {
          payload = JSON.parse(raw.toString("utf8"));
        } catch {
          res.writeHead(400);
          res.end("Invalid JSON");
          return;
        }

        res.writeHead(200, { "content-type": "text/plain" });
        res.end("EVENT_RECEIVED");

        setImmediate(() => {
          const job = processWebhook(payload, instance).catch((error) =>
            instance.logger.error("Webhook processing failed", {
              message: error.message,
            }),
          );
          pendingWebhooks.add(job);
          job.finally(() => pendingWebhooks.delete(job));
        });
        return;
      }

      res.writeHead(405, { allow: "GET, POST" });
      res.end("Method not allowed");
    });
  }

  function listen(instance) {
    return new Promise((resolve, reject) => {
      const nextServer = createServer(instance);
      nextServer.once("error", reject);
      nextServer.listen(port, host, () => {
        nextServer.removeListener("error", reject);
        instance.logger.info("HTTP server listening", { host, port });
        server = nextServer;
        resolve();
      });
    });
  }

  async function restart() {
    if (stopping || !server) return;
    const previous = melissa;
    cancelAutoRestart();
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    while (pendingWebhooks.size) await Promise.all([...pendingWebhooks]);
    await previous.db?.close?.();
    if (global.Melissa === previous) delete global.Melissa;
    melissa = await MelissaOnLoad({ env, loader });
    await listen(melissa);
    scheduleAutoRestart(melissa);
  }

  function scheduleAutoRestart(instance) {
    cancelAutoRestart = instance.uptime.scheduleRestart(
      () => restart(),
      (error) => instance.errorlogs(error, { handler: "autoRestart" }),
    );
  }

  await listen(melissa);
  scheduleAutoRestart(melissa);

  const stop = () => {
    if (stopping) return;
    stopping = true;
    cancelAutoRestart();
    server.close(async () => {
      while (pendingWebhooks.size) await Promise.all([...pendingWebhooks]);
      await melissa.db?.close?.().catch((error) =>
        melissa.logger.error("Database shutdown failed", {
          message: error.message,
        }),
      );
      if (global.Melissa === melissa) delete global.Melissa;
      process.exit(0);
    });
  };

  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  return {
    get server() {
      return server;
    },
    get melissa() {
      return melissa;
    },
  };
}

async function processWebhook(payload, melissa) {
  for (const entry of payload.entry || [])
    for (const item of entry.messaging || []) {
      const senderId = item.sender?.id;

      if (item.message) {
        if (item.message.is_echo) continue;
        const event = {
          senderId,
          threadId: senderId,
          messageId: item.message.mid,
          replyToId: item.message.reply_to?.mid,
          text: item.message.text,
          isEcho: false,
          raw: item,
        };
        if (item.message.text) await melissa.handleIncoming(event);
        else await melissa.handleEvent("message", event);
      }

      if (item.reaction)
        await melissa.handleEvent("reaction", {
          senderId,
          messageId: item.reaction.mid,
          reaction: item.reaction,
          raw: item,
        });

      if (item.read)
        await melissa.handleEvent("read", {
          senderId,
          watermark: item.read.watermark,
          raw: item,
        });

      if (item.postback)
        await melissa.handleEvent("postback", {
          senderId,
          postback: item.postback,
          raw: item,
        });
    }
}

if (require.main === module)
  main().catch((error) => {
    console.error("Melissa startup failed:", error.message);
    process.exitCode = 1;
  });

module.exports = { main, processWebhook, readBody };
