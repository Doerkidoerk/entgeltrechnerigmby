"use strict";

const crypto = require("crypto");
const fsp = require("fs/promises");
const { writeJSONAtomic } = require("../utils/file");

const SCHEMA_VERSION = 1;

class InviteStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.invites = new Map();
    this._queue = Promise.resolve();
    this._ready = this._load();
  }

  async init() {
    await this._ready;
  }

  async _load() {
    try {
      const raw = await fsp.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.invites)
          ? parsed.invites
          : [];

      this.invites.clear();
      for (const entry of list) {
        if (!entry || typeof entry !== "object" || !entry.code) continue;
        const invite = {
          code: entry.code,
          role: entry.role === "admin" ? "admin" : "user",
          createdAt: entry.createdAt || new Date().toISOString(),
          expiresAt: entry.expiresAt || null,
          createdBy: entry.createdBy || null,
          note: entry.note || "",
          usedAt: entry.usedAt || null,
          usedBy: entry.usedBy || null
        };
        this.invites.set(invite.code, invite);
      }
    } catch (err) {
      if (err && err.code === "ENOENT") {
        this.invites.clear();
        return;
      }
      throw err;
    }
  }

  async _withQueue(fn) {
    const run = this._queue.then(() => fn());
    this._queue = run.catch(() => {});
    return run;
  }

  async _persist() {
    const payload = {
      version: SCHEMA_VERSION,
      invites: Array.from(this.invites.values())
    };
    await this._withQueue(() => writeJSONAtomic(this.filePath, payload));
  }

  _isExpired(invite, now = new Date()) {
    if (!invite.expiresAt) return false;
    return new Date(invite.expiresAt) < now;
  }

  _sanitize(invite) {
    if (!invite) return null;
    return {
      code: invite.code,
      role: invite.role,
      createdAt: invite.createdAt,
      expiresAt: invite.expiresAt,
      createdBy: invite.createdBy,
      note: invite.note,
      usedAt: invite.usedAt,
      usedBy: invite.usedBy,
      expired: this._isExpired(invite)
    };
  }

  listInvites({ includeExpired = true } = {}) {
    const now = new Date();
    return Array.from(this.invites.values())
      .filter(invite => includeExpired || (!invite.usedAt && !this._isExpired(invite, now)))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map(inv => this._sanitize(inv));
  }

  async createInvite({ role = "user", createdBy = null, expiresInHours = 72, note = "" } = {}) {
    let code = null;
    do {
      code = crypto.randomBytes(12).toString("base64url");
    } while (this.invites.has(code));

    const now = new Date();
    const invite = {
      code,
      role: role === "admin" ? "admin" : "user",
      createdAt: now.toISOString(),
      createdBy,
      note: note || "",
      expiresAt: expiresInHours ? new Date(now.getTime() + expiresInHours * 3600000).toISOString() : null,
      usedAt: null,
      usedBy: null
    };

    this.invites.set(invite.code, invite);
    await this._persist();
    return this._sanitize(invite);
  }

  getInvite(code) {
    if (typeof code !== "string" || code.trim() === "") return null;
    return this.invites.get(code.trim()) || null;
  }

  async consume(code, username) {
    const invite = this.getInvite(code);
    if (!invite) {
      const err = new Error("Einladungscode ist ungültig.");
      err.code = "INVALID_INVITE";
      throw err;
    }
    if (invite.usedAt) {
      const err = new Error("Einladungscode wurde bereits verwendet.");
      err.code = "INVITE_USED";
      throw err;
    }
    if (this._isExpired(invite)) {
      const err = new Error("Einladungscode ist abgelaufen.");
      err.code = "INVITE_EXPIRED";
      throw err;
    }

    invite.usedAt = new Date().toISOString();
    invite.usedBy = username;
    await this._persist();
    return this._sanitize(invite);
  }

  async deleteInvite(code) {
    const invite = this.getInvite(code);
    if (!invite) {
      throw new Error("Einladungscode nicht gefunden.");
    }
    this.invites.delete(code);
    await this._persist();
    return true;
  }
}

module.exports = {
  InviteStore
};
