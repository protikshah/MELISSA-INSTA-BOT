"use strict";
const KEY = "admin-uids";
const COLLECTION = "settings";

function unique(ids) {
  return [
    ...new Set((ids || []).map((value) => String(value).trim()).filter(Boolean)),
  ];
}

function createAdminController({ db, ownerIds = [], adminIds = [] }) {
  const owners = unique(ownerIds);
  let admins = unique([...owners, ...adminIds]);

  return {
    async load() {
      const saved = await db.get(COLLECTION, KEY);
      admins = unique([
        ...owners,
        ...adminIds,
        ...(Array.isArray(saved) ? saved : []),
      ]);
      return this.list();
    },

    list() {
      return [...admins];
    },

    owners() {
      return [...owners];
    },

    isAdmin(id) {
      return admins.includes(String(id));
    },

    isOwner(id) {
      return owners.includes(String(id));
    },

    async add(id, actorId) {
      if (!this.isOwner(actorId))
        throw new Error(
          "Only a configured bot owner can change the admin list.",
        );
      const value = String(id || "").trim();
      if (!value) throw new Error("An Instagram sender ID is required.");
      admins = unique([...admins, value]);
      await db.set(COLLECTION, KEY, admins);
      return this.list();
    },

    async remove(id, actorId) {
      if (!this.isOwner(actorId))
        throw new Error(
          "Only a configured bot owner can change the admin list.",
        );
      const value = String(id || "").trim();
      if (owners.includes(value))
        throw new Error(
          "Configured owner IDs cannot be removed using this command.",
        );
      admins = admins.filter((admin) => admin !== value);
      await db.set(COLLECTION, KEY, admins);
      return this.list();
    },
  };
}

module.exports = { createAdminController };
