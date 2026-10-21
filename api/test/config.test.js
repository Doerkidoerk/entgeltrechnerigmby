"use strict";

const { loadConfig } = require("../lib/config");

test("verwendet sinnvolle Standardwerte", () => {
  const config = loadConfig({});
  expect(config.port).toBe(3001);
  expect(config.host).toBe("127.0.0.1");
  expect(config.allowedOrigins).toEqual(["https://entgeltrechner.cbmeyer.xyz"]);
  expect(config.trustProxy).toBe("loopback");
  expect(config.rateLimit).toEqual({ windowMs: 900000, max: 100 });
  expect(config.logRequests).toBe(true);
});

test("liest Umgebungsvariablen", () => {
  const config = loadConfig({
    PORT: "4000",
    ALLOWED_ORIGINS: " https://a.example , https://b.example,, ",
    TRUST_PROXY: "2",
    RATE_LIMIT_MAX: "500",
    NODE_ENV: "test"
  });
  expect(config.port).toBe(4000);
  expect(config.allowedOrigins).toEqual(["https://a.example", "https://b.example"]);
  expect(config.trustProxy).toBe(2);
  expect(config.rateLimit.max).toBe(500);
  expect(config.logRequests).toBe(false);
});

test.each([
  ["true", true],
  ["false", false],
  ["10.0.0.1, 10.0.0.2", "10.0.0.1, 10.0.0.2"]
])("TRUST_PROXY=%s", (raw, expected) => {
  expect(loadConfig({ TRUST_PROXY: raw }).trustProxy).toEqual(expected);
});

test.each([
  ["PORT", "abc"],
  ["PORT", "70000"],
  ["RATE_LIMIT_MAX", "0"],
  ["RATE_LIMIT_MAX", "1.5"]
])("bricht bei ungültigem %s=%s ab", (name, value) => {
  expect(() => loadConfig({ [name]: value })).toThrow(new RegExp(name));
});
