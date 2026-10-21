"use strict";

const path = require("path");
const { TableStore } = require("../lib/tables");

const DATA_DIR = path.join(__dirname, "..", "data");

function silentLogger() {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

/** TableStore mit den echten Tariftabellen aus api/data. */
async function loadRealTables() {
  const store = new TableStore(DATA_DIR, { logger: silentLogger() });
  await store.load();
  return store;
}

module.exports = { silentLogger, loadRealTables };
