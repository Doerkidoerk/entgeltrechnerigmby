"use strict";

const fsp = require("fs/promises");
const path = require("path");
const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");
const { writeJSONAtomic } = require("../utils/file");
const { hashPassword, verifyPassword, validatePasswordStrength } = require("./password");

const SCHEMA_VERSION = 1;
const MAX_FAILED_ATTEMPTS = (() => {
  const parsed = Number(process.env.AUTH_MAX_FAILED_ATTEMPTS);
  if (Number.isInteger(parsed) && parsed >= 3 && parsed <= 10) {
    return parsed;
  }
  return 5;
})();

const DUMMY_HASH = bcrypt.hashSync("DummyHardPassword123!", 12);

class UserStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.users = new Map();
    this.byName = new Map();
    this._queue = Promise.resolve();
    this._ready = this._load();
  }

  async init() {
    await this._ready;
    await this._ensureDefaultAdmin();
  }

  async _load() {
    try {
      const raw = await fsp.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.users)
          ? parsed.users
          : [];

      this.users.clear();
      this.byName.clear();

      for (const entry of list) {
        if (!entry || typeof entry !== "object" || !entry.id || !entry.username || !entry.passwordHash) {
          continue;
        }
        this._indexUser(entry);
      }
    } catch (err) {
      if (err && err.code === "ENOENT") {
        this.users.clear();
        this.byName.clear();
        return;
      }
      throw err;
    }
  }

  _indexUser(entry) {
    const user = {
      id: entry.id,
      username: this._normalizeUsername(entry.username),
      role: entry.role === "admin" ? "admin" : "user",
      passwordHash: entry.passwordHash,
      createdAt: entry.createdAt || new Date().toISOString(),
      updatedAt: entry.updatedAt || entry.createdAt || new Date().toISOString(),
      createdBy: entry.createdBy || null,
      updatedBy: entry.updatedBy || null,
      lastLoginAt: entry.lastLoginAt || null,
      passwordChangedAt: entry.passwordChangedAt || null,
      mustChangePassword: Boolean(entry.mustChangePassword),
      locked: Boolean(entry.locked),
      lockedAt: entry.lockedAt || null,
      failedLoginAttempts: Number.isInteger(entry.failedLoginAttempts) ? entry.failedLoginAttempts : 0
    };

    this.users.set(user.id, user);
    this.byName.set(user.username, user);
  }

  async _withQueue(fn) {
    const run = this._queue.then(() => fn());
    this._queue = run.catch(() => {});
    return run;
  }

  async _persist() {
    const payload = {
      version: SCHEMA_VERSION,
      users: Array.from(this.users.values())
    };
    await this._withQueue(() => writeJSONAtomic(this.filePath, payload));
  }

  _normalizeUsername(username) {
    if (typeof username !== "string") {
      throw new Error("Ungültiger Benutzername.");
    }
    const trimmed = username.trim().toLowerCase();
    if (trimmed.length < 3 || trimmed.length > 32) {
      throw new Error("Benutzername muss zwischen 3 und 32 Zeichen haben.");
    }
    if (!/^[a-z0-9._-]+$/.test(trimmed)) {
      throw new Error("Benutzername darf nur a-z, 0-9, Punkt, Unterstrich und Bindestrich enthalten.");
    }
    return trimmed;
  }

  async _ensureDefaultAdmin() {
    const hasAdmin = Array.from(this.users.values()).some(u => u.role === "admin");
    if (hasAdmin) return;

    const now = new Date().toISOString();
    const password = process.env.DEFAULT_ADMIN_PASSWORD || "Admin123!Test";
    const admin = {
      id: uuidv4(),
      username: "admin",
      role: "admin",
      passwordHash: await hashPassword(password),
      createdAt: now,
      updatedAt: now,
      createdBy: null,
      updatedBy: null,
      lastLoginAt: null,
      passwordChangedAt: null,
      mustChangePassword: true,
      locked: false,
      lockedAt: null,
      failedLoginAttempts: 0
    };
    this._indexUser(admin);
    await this._persist();
    if (process.env.NODE_ENV !== "test") {
      console.warn("[auth] Standard-Admin 'admin' wurde initialisiert. Passwort bitte umgehend ändern.");
    }
  }

  toPublicUser(user) {
    if (!user) return null;
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      lastLoginAt: user.lastLoginAt,
      passwordChangedAt: user.passwordChangedAt,
      mustChangePassword: Boolean(user.mustChangePassword),
      locked: Boolean(user.locked),
      lockedAt: user.lockedAt,
      failedLoginAttempts: user.failedLoginAttempts
    };
  }

  listUsers() {
    return Array.from(this.users.values())
      .sort((a, b) => a.username.localeCompare(b.username))
      .map(u => this.toPublicUser(u));
  }

  getById(id) {
    return this.users.get(id) || null;
  }

  getByUsername(username) {
    const normalized = this._normalizeUsername(username);
    return this.byName.get(normalized) || null;
  }

  async createUser({ username, password, role = "user", createdBy = null, mustChangePassword = false, locked = false }) {
    const normalized = this._normalizeUsername(username);
    if (this.byName.has(normalized)) {
      const err = new Error("Benutzername bereits vergeben.");
      err.code = "USERNAME_TAKEN";
      throw err;
    }

    const pw = validatePasswordStrength(password);
    if (!pw.ok) {
      const message = pw.errors.join(" ");
      const err = new Error(message);
      err.code = "WEAK_PASSWORD";
      throw err;
    }

    const now = new Date().toISOString();
    const user = {
      id: uuidv4(),
      username: normalized,
      role: role === "admin" ? "admin" : "user",
      passwordHash: await hashPassword(password),
      createdAt: now,
      updatedAt: now,
      createdBy,
      updatedBy: createdBy,
      lastLoginAt: null,
      passwordChangedAt: null,
      mustChangePassword: Boolean(mustChangePassword),
      locked: Boolean(locked),
      lockedAt: locked ? now : null,
      failedLoginAttempts: 0
    };

    this._indexUser(user);
    await this._persist();
    return this.toPublicUser(user);
  }

  async setPassword(userId, password, { mustChangePassword = false, updatedBy = null } = {}) {
    const user = this.getById(userId);
    if (!user) {
      throw new Error("Benutzer nicht gefunden.");
    }

    const pw = validatePasswordStrength(password);
    if (!pw.ok) {
      const err = new Error(pw.errors.join(" "));
      err.code = "WEAK_PASSWORD";
      throw err;
    }

    user.passwordHash = await hashPassword(password);
    const now = new Date().toISOString();
    user.passwordChangedAt = now;
    user.updatedAt = now;
    user.updatedBy = updatedBy;
    user.mustChangePassword = Boolean(mustChangePassword);
    user.failedLoginAttempts = 0;
    user.locked = false;
    user.lockedAt = null;

    await this._persist();
    return this.toPublicUser(user);
  }

  async updateUser(userId, patch = {}, { updatedBy = null } = {}) {
    const user = this.getById(userId);
    if (!user) {
      throw new Error("Benutzer nicht gefunden.");
    }

    const now = new Date().toISOString();
    let changed = false;

    if (patch.role && (patch.role === "admin" || patch.role === "user")) {
      if (user.role !== patch.role) {
        user.role = patch.role;
        changed = true;
      }
    }

    if (typeof patch.mustChangePassword === "boolean") {
      if (user.mustChangePassword !== patch.mustChangePassword) {
        user.mustChangePassword = patch.mustChangePassword;
        changed = true;
      }
    }

    if (typeof patch.locked === "boolean") {
      if (patch.locked && !user.locked) {
        user.locked = true;
        user.lockedAt = now;
        changed = true;
      } else if (!patch.locked && user.locked) {
        user.locked = false;
        user.lockedAt = null;
        user.failedLoginAttempts = 0;
        changed = true;
      }
    }

    if (!changed) {
      return this.toPublicUser(user);
    }

    user.updatedAt = now;
    user.updatedBy = updatedBy;
    await this._persist();
    return this.toPublicUser(user);
  }

  async removeUser(userId) {
    const user = this.getById(userId);
    if (!user) {
      throw new Error("Benutzer nicht gefunden.");
    }
    this.users.delete(userId);
    this.byName.delete(user.username);
    await this._persist();
    return true;
  }

  async verifyCredentials(username, password) {
    let user = null;
    try {
      user = this.getByUsername(username);
    } catch {
      // normalize may throw for invalid usernames → treat as missing user
    }

    if (!user) {
      await verifyPassword(password, DUMMY_HASH);
      return { ok: false, reason: "invalid" };
    }

    if (user.locked) {
      return { ok: false, reason: "locked" };
    }

    const match = await verifyPassword(password, user.passwordHash);
    if (!match) {
      await this._recordLoginFailure(user);
      return { ok: false, reason: "invalid" };
    }

    await this._recordLoginSuccess(user);
    return { ok: true, user: this.toPublicUser(user) };
  }

  async _recordLoginSuccess(user) {
    user.failedLoginAttempts = 0;
    user.locked = false;
    user.lockedAt = null;
    user.lastLoginAt = new Date().toISOString();
    user.updatedAt = user.lastLoginAt;
    await this._persist();
  }

  async _recordLoginFailure(user) {
    user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
    user.updatedAt = new Date().toISOString();
    if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
      user.locked = true;
      user.lockedAt = user.updatedAt;
    }
    await this._persist();
  }
}

module.exports = {
  UserStore,
  validatePasswordStrength
};
