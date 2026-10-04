"use strict";

function normalizeId(value) {
  const id = String(value ?? "").trim();
  if (!id || id.length > 256)
    throw new Error("A valid Instagram sender ID is required.");
  return id;
}

function uniqueStrings(values = []) {
  return [
    ...new Set(values.map((value) => String(value).trim()).filter(Boolean)),
  ];
}

module.exports = { normalizeId, uniqueStrings };
