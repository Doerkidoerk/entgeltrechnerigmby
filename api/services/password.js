"use strict";

const bcrypt = require("bcryptjs");

const DEFAULT_ROUNDS = 12;
const rounds = (() => {
  const env = Number(process.env.BCRYPT_ROUNDS);
  if (Number.isInteger(env) && env >= 10 && env <= 16) {
    return env;
  }
  return DEFAULT_ROUNDS;
})();

function validatePasswordStrength(password) {
  const errors = [];
  if (typeof password !== "string" || password.trim().length === 0) {
    errors.push("Passwort darf nicht leer sein.");
    return { ok: false, errors };
  }

  if (password.length < 12) {
    errors.push("Mindestens 12 Zeichen.");
  }
  if (!/[a-z]/.test(password)) {
    errors.push("Mindestens ein Kleinbuchstabe.");
  }
  if (!/[A-Z]/.test(password)) {
    errors.push("Mindestens ein Großbuchstabe.");
  }
  if (!/[0-9]/.test(password)) {
    errors.push("Mindestens eine Ziffer.");
  }
  if (!/[^\w\s]/.test(password)) {
    errors.push("Mindestens ein Sonderzeichen.");
  }

  const disallowed = ["password", "passwort", "123456", "qwertz", "qwerty"];
  const lowered = password.toLowerCase();
  if (disallowed.some(entry => lowered.includes(entry))) {
    errors.push("Offensichtliche Begriffe vermeiden.");
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

function hashPassword(password) {
  return bcrypt.hash(password, rounds);
}

function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

module.exports = {
  validatePasswordStrength,
  hashPassword,
  verifyPassword
};
