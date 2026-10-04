"use strict";
const crypto = require("node:crypto");

function verifySignature(rawBody, header, appSecret) {
  if (!header || !appSecret) return false;
  const supplied = String(header).match(/^sha256=([a-f0-9]{64})$/i)?.[1];
  if (!supplied) return false;

  const expected = crypto
    .createHmac("sha256", appSecret)
    .update(rawBody)
    .digest();
  const actual = Buffer.from(supplied, "hex");

  return (
    actual.length === expected.length &&
    crypto.timingSafeEqual(actual, expected)
  );
}

module.exports = { verifySignature };
