const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");
require("../extension/stats.js");
const manifest = JSON.parse(readFileSync(join(__dirname, "../extension/manifest.json"), "utf8"));
const source = (file) => readFileSync(join(__dirname, "../extension", file), "utf8");
const fixture = readFileSync(join(__dirname, "fixture.diff"), "utf8");

// Chrome runs the service worker, which imports its dependencies; Firefox has no importScripts
// and loads the manifest's background scripts in order.
function worker(fetch, browser = "chrome") {
  let listener;
  const globals = {
    chrome: { runtime: { id: "extension-id", onMessage: { addListener: (value) => { listener = value; } } } },
    URL, AbortSignal, fetch, Date, TextEncoder, TextDecoder, Uint8Array,
    crypto: require("node:crypto").webcrypto,
  };
  if (browser === "chrome") globals.importScripts = (...files) => { for (const file of files) vm.runInContext(source(file), context); };
  const context = vm.createContext(globals);
  for (const file of browser === "chrome" ? [manifest.background.service_worker] : manifest.background.scripts) {
    vm.runInContext(source(file), context);
  }
  return (sender, message = { type: "load-pr-diff" }) => new Promise((resolve) => listener(message, sender, resolve));
}

const sender = { id: "extension-id", url: "https://github.com/owner/repo/pull/42/files" };
const response = (overrides = {}) => ({
  ok: true, status: 200, url: "https://patch-diff.githubusercontent.com/raw/owner/repo/pull/42.diff",
  headers: new Headers({ "content-type": "text/plain" }), text: async () => fixture, ...overrides,
});

test("worker fetches only the sender's PR, with session credentials, and returns parsed counts", async () => {
  const load = worker(async (url, options) => {
    assert.equal(url, "https://github.com/owner/repo/pull/42.diff");
    assert.equal(options.credentials, "include");
    assert.equal(options.cache, "no-store");
    assert.ok(options.signal);
    return response();
  });
  const result = await load(sender, { type: "load-pr-diff", url: "https://evil.test/secret" });
  assert.equal(result.files.length, 6);
  assert.equal(result.files[0].additions, 2);
  assert.equal(typeof result.loadedAt, "number");
});

test("Firefox background scripts load without importScripts and serve the sender's PR", async () => {
  const result = await worker(async () => response(), "firefox")(sender);
  assert.equal(result.files.length, 6);
});

test("worker refuses non-PR and foreign senders before making any network request", async () => {
  const load = worker(async () => { throw new Error("Unexpected fetch"); });
  for (const invalid of [{ ...sender, id: "foreign-extension" }, { ...sender, url: "https://github.com/owner/repo/issues/42" }, { ...sender, url: "https://evil.test/owner/repo/pull/42" }]) {
    assert.match((await load(invalid)).error, /Open a GitHub pull request/);
  }
});

test("worker reports sign-in pages, HTTP errors, invalid diffs, network errors, and timeouts", async () => {
  for (const [override, expected] of [
    [{ ok: false, status: 404 }, /HTTP 404/],
    [{ headers: new Headers({ "content-type": "text/html" }) }, /sign-in/],
    [{ url: "https://github.com/login" }, /sign-in/],
    [{ url: "https://evil.test/redirect" }, /sign-in/],
    [{ text: async () => "<html>Oops</html>" }, /incomplete|unsupported/],
  ]) {
    const result = await worker(async () => response(override))(sender);
    assert.match(result.error, expected);
    assert.equal(result.files, undefined);
  }
  const timedOut = await worker(async () => { const error = new Error("timeout"); error.name = "TimeoutError"; throw error; })(sender);
  assert.match(timedOut.error, /timed out/);
  const offline = await worker(async () => { throw new Error("Failed to fetch"); })(sender);
  assert.match(offline.error, /Failed to fetch/);
});
