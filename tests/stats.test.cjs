const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");
require("../extension/stats.js");
const { defaultPatterns, pullRequestFromUrl, patternMatcher, parseDiff, summarize } = globalThis.GitHubDiffStats;
const fixture = readFileSync(join(__dirname, "fixture.diff"), "utf8");

test("PR routing accepts tabs and rejects non-PR and non-GitHub URLs", () => {
  for (const suffix of ["", "/files", "/commits", "?foo=bar#discussion"]) {
    assert.deepEqual(pullRequestFromUrl(`https://github.com/owner/repo/pull/42${suffix}`), {
      owner: "owner", repository: "repo", number: "42",
    });
  }
  for (const url of ["https://evil.test/owner/repo/pull/42", "http://github.com/owner/repo/pull/42", "https://github.com/owner/repo/issues/42", "https://github.com/owner/repo/pull/0", "https://github.com/owner/repo/pull/42.diff", "https://github.com/owner/repo/pull/42oops", "invalid"]) {
    assert.equal(pullRequestFromUrl(url), null);
  }
});

test("default classification covers root and nested test conventions without matching production lookalikes", () => {
  const isTest = patternMatcher(defaultPatterns);
  for (const path of ["tests/unit/test_api.py", "src/__tests__/widget.ts", "spec/a.rb", "src/widget.spec.ts", "widget.test.js", "src/main_test.go", "test_util.py", "conftest.py", "integration/CONftest.py", "e2e/foo.ts", "src/__snapshots__/foo.snap"]) {
    assert.equal(isTest(path), true, path);
  }
  for (const path of ["src/testimony.py", "src/latest.js", "src/testing/service.py", "docs/tests.md", "contest.py", "src/conftest.py.backup", "src/widgets.ts"]) {
    assert.equal(isTest(path), false, path);
  }
});

test("custom globs handle root matches, single-segment wildcards, literals, and empty preferences", () => {
  assert.equal(patternMatcher(["**/*.js"])("foo.js"), true);
  assert.equal(patternMatcher(["*.js"])("src/foo.js"), false);
  assert.equal(patternMatcher(["src/?.js"])("src/a.js"), true);
  assert.equal(patternMatcher(["src/?.js"])("src/ab.js"), false);
  assert.equal(patternMatcher(["**/[test]+.js"])("src/[test]+.js"), true);
  assert.equal(patternMatcher([])("tests/test_api.py"), false);
  assert.throws(() => patternMatcher(Array(101).fill("**")), /100/);
  assert.throws(() => patternMatcher([""]), /1–200/);
  assert.throws(() => patternMatcher(["x".repeat(201)]), /1–200/);
  assert.throws(() => patternMatcher("tests"), /100/);
});

test("diff counts include header-looking content, deletion, rename, and binary metadata", () => {
  const files = parseDiff(fixture);
  assert.equal(files.length, 6);
  assert.deepEqual(files.map(({ path, additions, deletions, binary }) => ({ path, additions, deletions, binary })), [
    { path: "src/widget.js", additions: 2, deletions: 1, binary: false },
    { path: "tests/widget.test.js", additions: 3, deletions: 0, binary: false },
    { path: "src/old.js", additions: 0, deletions: 1, binary: false },
    { path: "test_helper.py", additions: 1, deletions: 1, binary: false },
    { path: "docs/new name.md", additions: 0, deletions: 0, binary: false },
    { path: "logo.png", additions: 0, deletions: 0, binary: true },
  ]);
  assert.deepEqual(parseDiff(fixture.replaceAll("\n", "\r\n")), files);
});

test("summaries distinguish test, config (including docs), and remaining code changes with internal total verification", () => {
  const files = parseDiff(fixture);
  assert.deepEqual(summarize(files, defaultPatterns), {
    all: { files: 6, additions: 6, deletions: 3, binary: 1 },
    tests: { files: 2, additions: 4, deletions: 1, binary: 0 },
    withoutTestsAndConfig: { files: 3, additions: 2, deletions: 2, binary: 1 },
    config: { files: 1, additions: 0, deletions: 0, binary: 0 },
  });
  assert.equal(summarize(files, []).tests.files, 0);
  assert.equal(summarize(files, ["**"]).withoutTestsAndConfig.files, 0);
});

test("quoted UTF-8 paths, spaces, escaped tabs and destination-path renames are decoded", () => {
  const diff = String.raw`diff --git "a/tests/caf\303\251\tname.js" "b/tests/caf\303\251\tname.js"
new file mode 100644
--- /dev/null
+++ "b/tests/caf\303\251\tname.js"
@@ -0,0 +1 @@
+hello
diff --git a/tests/old.js b/src/new.js
similarity index 100%
rename from tests/old.js
rename to src/new.js
`;
  const files = parseDiff(diff);
  assert.equal(files[0].path, "tests/café\tname.js");
  assert.equal(files[1].oldPath, "tests/old.js");
  assert.equal(files[1].path, "src/new.js");
  assert.equal(summarize(files, defaultPatterns).tests.files, 1);
});

test("empty diff, multiple hunks, mode-only changes, and binary patches are supported", () => {
  assert.deepEqual(parseDiff(""), []);
  const files = parseDiff(`diff --git a/file.txt b/file.txt
old mode 100644
new mode 100755
--- a/file.txt
+++ b/file.txt
@@ -1 +1 @@
-first
+second
@@ -10,0 +11,2 @@
+a
+b
diff --git a/image.png b/image.png
GIT binary patch
literal 5
abcdef
`);
  assert.equal(files[0].additions, 3);
  assert.equal(files[0].deletions, 1);
  assert.equal(files[1].binary, true);
});

test("incomplete, unsupported, and HTML responses fail instead of showing understated totals", () => {
  for (const diff of ["<html>Sign in</html>", "diff --git broken\n", "@@ -1 +1 @@\n-a\n+b\n", "diff --git a/a b/a\n@@ -1,2 +1,2 @@\n a\n", "diff --git a/a b/a\n@@ -0,0 +1 @@\n+a\n+b\n", "diff --git a/a b/a\n@@ -1,0 +1,1 @@\n-a\n", "diff --git a/a b/a\nDiff too large\n"]) {
    assert.throws(() => parseDiff(diff), /incomplete|unsupported/);
  }
});
