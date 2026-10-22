const assert = require("node:assert/strict");
const { test } = require("node:test");
require("../extension/stats.js");
const { defaultPatterns, defaultConfigPatterns, legacyDefaultConfigPatterns, upgradeConfigPatterns, patternMatcher, classifyFile, summarize } = GitHubDiffStats;

test("config defaults cover JSON, lockfiles, common formats and dotfiles without matching source lookalikes", () => {
  const isConfig = patternMatcher(defaultConfigPatterns);
  for (const path of ["package.json", "src/settings.JSON", "tsconfig.jsonc", "data.json5", "Cargo.lock", "bun.lockb", "Cargo.toml", ".github/workflows/ci.yml", "nested/config.yaml", "settings.ini", "setup.cfg", "nginx.conf", "app.config", "gradle.properties", "go.sum", "Pipfile", "requirements-dev.txt", "gradle.lockfile", ".env", "config/.env.test", ".gitignore", ".editorconfig", ".prettierrc", "eslint.config.mjs", "vite.config.ts"]) {
    assert.equal(isConfig(path), true, path);
  }
  for (const path of ["src/locking.rs", "src/parser.ts", "src/json_parser.py", "Cargo.toml.backup", "data.json.png", "src/configuration.rs"]) {
    assert.equal(isConfig(path), false, path);
  }
});

test("documentation defaults count as config without matching source lookalikes", () => {
  const isConfig = patternMatcher(defaultConfigPatterns);
  for (const path of ["README.md", "docs/config.md", "docs/Guide.MD", "site/page.mdx", "CHANGELOG.markdown", "docs/index.rst", "docs/manual.adoc", "notes.txt", "CMakeLists.txt", "requirements.txt"]) {
    assert.equal(isConfig(path), true, path);
  }
  for (const path of ["src/markdown.ts", "src/md5.rs", "src/render_rst.py", "src/txt_reader.go", "docs/README.md.orig", "docs/diagram.png"]) {
    assert.equal(isConfig(path), false, path);
  }
});

test("documentation is excluded from the code diff, while docs under test paths stay tests", () => {
  const isTest = patternMatcher(defaultPatterns);
  const isConfig = patternMatcher(defaultConfigPatterns);
  for (const path of ["tests/README.md", "src/__tests__/notes.md", "test/fixtures/expected.txt", "spec/docs/guide.rst"]) {
    assert.equal(classifyFile({ path, additions: 1, deletions: 0 }, isTest, isConfig).category, "tests", path);
  }
  const files = [
    { path: "src/app.js", additions: 7, deletions: 2, binary: false },
    { path: "README.md", additions: 40, deletions: 10, binary: false },
    { path: "docs/setup.rst", additions: 5, deletions: 1, binary: false },
    { path: "requirements.txt", additions: 1, deletions: 0, binary: false },
    { path: "tests/README.md", additions: 3, deletions: 0, binary: false },
  ];
  assert.deepEqual(summarize(files, defaultPatterns), {
    all: { files: 5, additions: 56, deletions: 13, binary: 0 },
    tests: { files: 1, additions: 3, deletions: 0, binary: 0 },
    withoutTestsAndConfig: { files: 1, additions: 7, deletions: 2, binary: 0 },
    config: { files: 3, additions: 46, deletions: 11, binary: 0 },
  });
});

test("a saved list equal to the 1.2.0 defaults upgrades to the current defaults; other saved lists are kept", () => {
  assert.equal(patternMatcher(legacyDefaultConfigPatterns)("README.md"), false);
  const upgraded = upgradeConfigPatterns([...legacyDefaultConfigPatterns]);
  assert.deepEqual(upgraded, defaultConfigPatterns);
  assert.notEqual(upgraded, defaultConfigPatterns, "Callers get a copy, not the shared defaults array.");
  assert.equal(patternMatcher(upgraded)("README.md"), true);
  const reordered = [...legacyDefaultConfigPatterns].reverse();
  const customized = [
    legacyDefaultConfigPatterns.slice(1),
    [...legacyDefaultConfigPatterns, "**/*.csv"],
    legacyDefaultConfigPatterns.map((pattern) => pattern.toUpperCase()),
    reordered,
    [],
    ["**/*.lock"],
    defaultConfigPatterns,
  ];
  for (const stored of customized) assert.equal(upgradeConfigPatterns(stored), stored);
  for (const stored of [undefined, null, "**/*.json", { length: 35 }]) assert.equal(upgradeConfigPatterns(stored), stored);
});

test("test, config and code groups conserve totals with JSON fixtures and Rust inline tests", () => {
  const files = [
    { path: "src/widget.rs", additions: 12, deletions: 5, binary: false, inlineTests: { additions: 8, deletions: 3 } },
    { path: "tests/fixture.json", additions: 3, deletions: 1, binary: false },
    { path: "package.json", additions: 4, deletions: 2, binary: false },
    { path: "Cargo.lock", additions: 10, deletions: 6, binary: false },
    { path: "src/widget.js", additions: 2, deletions: 1, binary: false },
    { path: "bun.lockb", additions: 0, deletions: 0, binary: true },
  ];
  const result = summarize(files, defaultPatterns);
  assert.deepEqual(result, {
    all: { files: 6, additions: 31, deletions: 15, binary: 1 },
    tests: { files: 1, additions: 11, deletions: 4, binary: 0 },
    withoutTestsAndConfig: { files: 2, additions: 6, deletions: 3, binary: 0 },
    config: { files: 3, additions: 14, deletions: 8, binary: 1 },
  });
  for (const key of ["files", "additions", "deletions", "binary"]) {
    assert.equal(result.tests[key] + result.config[key] + result.withoutTestsAndConfig[key], result.all[key], key);
  }
});

test("empty/custom config patterns change classification while full test files retain precedence", () => {
  const files = [
    { path: "data.json", additions: 2, deletions: 1, binary: false },
    { path: "tests/fixture.json", additions: 3, deletions: 0, binary: false },
  ];
  const disabled = summarize(files, defaultPatterns, []);
  assert.equal(disabled.config.files, 0);
  assert.equal(disabled.withoutTestsAndConfig.additions, 2);
  assert.equal(disabled.tests.additions, 3);
  const custom = summarize(files, defaultPatterns, ["**"]);
  assert.equal(custom.config.additions, 2);
  assert.equal(custom.config.files, 1);
  assert.equal(custom.tests.additions, 3);
  assert.equal(custom.tests.files, 1);
  assert.equal(custom.withoutTestsAndConfig.files, 0);
});

test("a custom Rust config match still separates inline test lines without double counting", () => {
  const file = { path: "src/lib.rs", additions: 10, deletions: 3, binary: false, inlineTests: { additions: 7, deletions: 2 } };
  const isConfig = patternMatcher(["**/*.rs"]);
  assert.deepEqual(classifyFile(file, patternMatcher([]), isConfig), {
    category: "config", additions: 3, deletions: 1, inline: { additions: 7, deletions: 2 },
  });
  const result = summarize([file], [], ["**/*.rs"]);
  assert.deepEqual(result.tests, { files: 0, additions: 7, deletions: 2, binary: 0 });
  assert.deepEqual(result.config, { files: 1, additions: 3, deletions: 1, binary: 0 });
  assert.deepEqual(classifyFile(file, patternMatcher(["**"]), isConfig), {
    category: "tests", additions: 10, deletions: 3, inline: { additions: 0, deletions: 0 },
  });
});
