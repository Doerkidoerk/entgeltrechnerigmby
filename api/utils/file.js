"use strict";

const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

async function writeJSONAtomic(filePath, data, options = {}) {
  const mode = options.mode ?? 0o600;
  const dir = path.dirname(filePath);
  await fsp.mkdir(dir, { recursive: true });

  const tmpName = `${path.basename(filePath)}.${crypto.randomUUID()}.tmp`;
  const tmpPath = path.join(dir, tmpName);
  const json = JSON.stringify(data, null, 2);

  await fsp.writeFile(tmpPath, json, { mode });
  await fsp.rename(tmpPath, filePath);
}

module.exports = {
  writeJSONAtomic
};
