const assert = require("node:assert/strict");
const { test } = require("node:test");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const vm = require("node:vm");
require("../extension/rust-tests.js");
require("../extension/stats.js");
const { testLineMask, cfgPossibilities, reconstructOld, classify, verifyBlob } = GitHubRustTests;
const { parseDiff, summarize, defaultPatterns } = GitHubDiffStats;
const fixture = require("./rust-fixture.cjs");

test("Rust scopes ignore comments, braces in literals, nested comments, lifetimes, and macro token data", () => {
  const lines = [
    'const TEXT: &str = r###" #[cfg(test)] mod fake { } "###;',
    '/* #[test] /* nested } */ fn fake() {} */',
    "fn production<'a>(x: &'a str) { let brace = '}'; }",
    '#[cfg(test)]',
    'mod tests {',
    '    // helpers and blank lines inside this module count as tests',
    '',
    '    fn helper() { let text = "} /* #[test] */"; }',
    '    mod nested { fn helper() {} }',
    '}',
    'fn after() {}',
    '#[tokio::test]',
    '#[ignore]',
    'async fn asynchronous() { let raw = br#" } "#; }',
    'fn more_production() {}',
    'quote! { #[test] fn emitted() {} }',
    'macro_rules! example { () => { #[cfg(test)] fn emitted() {} }; }',
  ];
  assert.deepEqual(testLineMask(lines.join("\n")), lines.map((_, index) => (index >= 3 && index <= 9) || (index >= 11 && index <= 13)));
});

test("test-only cfg predicates distinguish all/not from code also compiled in production", () => {
  const lines = [
    '#[cfg(all(test, unix))]', 'fn test_helper() {}',
    '#[cfg(not(test))]', 'fn production() {}',
    '#[cfg(any(test, feature = "regular"))]', 'fn shared() {}',
    '#[cfg(not(not(test)))]', 'const VALUE: u32 = { 42 };',
    '#[cfg_attr(test, derive(Debug))]', 'struct Shared;',
    '#[cfg(test)]', 'const fn test_constant() -> u32 { 42 }',
    'fn after() {}',
  ];
  assert.deepEqual(testLineMask(lines.join("\n")), lines.map((_, index) => [0, 1, 6, 7, 10, 11].includes(index)));
  assert.equal(cfgPossibilities(["test"], false), 1);
  assert.equal(cfgPossibilities(["test"], true), 2);
  assert.equal(cfgPossibilities(["any", "(", ")"], false), 1);
  assert.equal(cfgPossibilities(["all", "(", ")"], false), 2);
  assert.throws(() => cfgPossibilities(["unknown", "(", "test", ")"], true), /Unsupported/);
});

test("inner cfg(test) and annotated use/static items include the complete applicable scope", () => {
  assert.deepEqual(testLineMask('#![cfg(test)]\nfn helper() {}\nfn check() {}'), [true, true, true]);
  const lines = ['#[cfg(test)]', 'use crate::{', '    Foo, Bar,', '};', 'fn production() {}', '#[cfg(test)]', 'static VALUE: [u8; 2] = { [1, 2] };', 'fn after() {}'];
  assert.deepEqual(testLineMask(lines.join("\n")), [true, true, true, true, false, true, true, false]);
  assert.deepEqual(testLineMask('#![allow(dead_code)]\n#[test]\nfn check() {}\nfn production() {}'), [false, true, true, false], "A crate attribute must not absorb the following function's test attribute.");
});

test("the user's +200/-10 inline example has 210 test lines and zero test files", async () => {
  const [file] = parseDiff(fixture.diff);
  assert.equal(file.additions, 201);
  assert.equal(file.deletions, 11);
  assert.ok(file.hunks.some((hunk) => hunk.oldStart > 40), "The test module marker is outside the changed hunk.");
  assert.equal(reconstructOld(file, fixture.newSource), fixture.oldSource);
  file.inlineTests = await classify(file, fixture.newSource);
  assert.deepEqual(file.inlineTests, { additions: 200, deletions: 10 });
  assert.deepEqual(summarize([file], defaultPatterns), {
    all: { additions: 201, deletions: 11, files: 1, binary: 0 },
    withoutTestsAndConfig: { additions: 1, deletions: 1, files: 1, binary: 0 },
    config: { additions: 0, deletions: 0, files: 0, binary: 0 },
    tests: { additions: 200, deletions: 10, files: 0, binary: 0 },
  });
  assert.equal(summarize([file], ["**/*.rs"]).tests.additions, 201, "Whole test files override inline counts without double counting.");
  assert.equal(summarize([file], []).tests.additions, 200, "Inline classification is independent of path patterns.");
});

test("deleted lines use the old Rust scope when a cfg guard is changed or removed", async () => {
  const oldSource = '#[cfg(test)]\nmod checks { fn helper() {} }\n';
  const newSource = '#[cfg(not(test))]\nmod checks { fn helper() {} }\n';
  const [file] = parseDiff(fixture.makeDiff(oldSource, newSource));
  assert.deepEqual(await classify(file, newSource), { additions: 0, deletions: 1 });
});

test("new and deleted Rust files and Unicode/no-newline snapshots retain exact blob identity", async () => {
  const source = 'pub fn production() {}\n#[test]\nfn works() { assert_eq!("café", "café"); }';
  const [added] = parseDiff(fixture.makeDiff(null, source));
  const [deleted] = parseDiff(fixture.makeDiff(source, null));
  assert.deepEqual(await classify(added, source), { additions: 2, deletions: 0 });
  assert.deepEqual(await classify(deleted, ""), { additions: 0, deletions: 2 });
  assert.equal(reconstructOld(deleted, ""), source);
  const changed = source.replace('pub fn production()', 'pub fn renamed_production()');
  const [modified] = parseDiff(fixture.makeDiff(source, changed));
  assert.equal(reconstructOld(modified, changed), source);
  assert.deepEqual(await classify(modified, changed), { additions: 0, deletions: 0 });
});

test("missing/changed source fails instead of producing inaccurate inline totals", async () => {
  const [file] = parseDiff(fixture.diff);
  await assert.rejects(() => classify(file, fixture.newSource.replace("after_tests", "wrong_version")), /changed since/);
  await assert.rejects(() => classify(file, fixture.newSource.replace("assert_eq!(2, 2)", "assert_eq!(3, 3)")), /does not match/);
  await assert.rejects(() => verifyBlob("wrong source", file.newBlob), /changed since/);
  assert.throws(() => testLineMask('mod incomplete {'), /unterminated/);
});

test("source loading shares the PR head lookup, validates snapshots, and discards source/hunks", async () => {
  const requests = [];
  const context = vm.createContext({
    URL, AbortSignal, TextEncoder, TextDecoder, Uint8Array, crypto: require("node:crypto").webcrypto,
    fetch: async (url, options) => {
      assert.equal(options.credentials, "include");
      requests.push(url);
      return { ok: true, url, headers: new Headers({ "content-type": "text/plain" }), text: async () => url.endsWith(".patch") ? `From ${fixture.head} Mon Sep 17 00:00:00 2001\n` : fixture.newSource };
    },
  });
  vm.runInContext(readFileSync(join(__dirname, "../extension/rust-tests.js"), "utf8"), context);
  const files = parseDiff(fixture.diff + fixture.diff.replaceAll("src/lib.rs", "src/other.rs"));
  await context.GitHubRustTests.enrich(files, { owner: "owner", repository: "repo", number: "42" });
  assert.equal(requests.filter((url) => url.endsWith(".patch")).length, 1);
  assert.equal(requests.length, 3);
  assert.deepEqual({ ...files[0].inlineTests }, { additions: 200, deletions: 10 });
  assert.equal(files[0].hunks, undefined);
  assert.equal(files[0].newBlob, undefined);
  const added = parseDiff(fixture.makeDiff(null, fixture.newSource));
  await context.GitHubRustTests.enrich(added, { owner: "owner", repository: "repo", number: "42" });
  assert.equal(requests.length, 3, "Added files can be reconstructed directly without source requests.");
});
