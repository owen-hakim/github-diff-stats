/* Shared by the content script, service worker, and dependency-free tests. */
(() => {
  const defaultPatterns = [
    "**/tests/**", "**/test/**", "**/__tests__/**", "**/__snapshots__/**",
    "**/spec/**", "**/specs/**", "**/e2e/**", "**/cypress/**",
    "**/playwright/**", "**/test_*", "**/*_test.*", "**/*.test.*",
    "**/*.spec.*", "**/conftest.py",
  ];
  // Documentation isn't production code, so it counts as config.
  const defaultConfigPatterns = [
    "**/*.json", "**/*.jsonc", "**/*.json5", "**/*.lock", "**/*.lockb",
    "**/*.toml", "**/*.yaml", "**/*.yml", "**/*.ini", "**/*.cfg",
    "**/*.conf", "**/*.config", "**/*.properties", "**/go.sum",
    "**/Pipfile", "**/gradle.lockfile",
    "**/.env", "**/.env.*", "**/.gitignore", "**/.gitattributes",
    "**/.editorconfig", "**/.npmrc", "**/.yarnrc", "**/.nvmrc",
    "**/.prettierrc", "**/.prettierrc.*", "**/.eslintrc", "**/.eslintrc.*",
    "**/*.config.js", "**/*.config.cjs", "**/*.config.mjs", "**/*.config.ts",
    "**/*.config.cts", "**/*.config.mts",
    "**/*.md", "**/*.mdx", "**/*.markdown", "**/*.rst", "**/*.adoc", "**/*.txt",
  ];
  // Config defaults through 1.2.0, before documentation counted as config.
  const legacyDefaultConfigPatterns = [
    "**/*.json", "**/*.jsonc", "**/*.json5", "**/*.lock", "**/*.lockb",
    "**/*.toml", "**/*.yaml", "**/*.yml", "**/*.ini", "**/*.cfg",
    "**/*.conf", "**/*.config", "**/*.properties", "**/go.sum",
    "**/Pipfile", "**/requirements*.txt", "**/gradle.lockfile",
    "**/.env", "**/.env.*", "**/.gitignore", "**/.gitattributes",
    "**/.editorconfig", "**/.npmrc", "**/.yarnrc", "**/.nvmrc",
    "**/.prettierrc", "**/.prettierrc.*", "**/.eslintrc", "**/.eslintrc.*",
    "**/*.config.js", "**/*.config.cjs", "**/*.config.mjs", "**/*.config.ts",
    "**/*.config.cts", "**/*.config.mts",
  ];

  // A saved list identical to the old defaults was never customized, so it
  // follows the current defaults. Any other saved list is left untouched.
  function upgradeConfigPatterns(stored) {
    const unchanged = Array.isArray(stored)
      && stored.length === legacyDefaultConfigPatterns.length
      && stored.every((pattern, index) => pattern === legacyDefaultConfigPatterns[index]);
    return unchanged ? [...defaultConfigPatterns] : stored;
  }

  function pullRequestFromUrl(value) {
    try {
      const url = new URL(value);
      const match = url.pathname.match(/^\/([\w.-]+)\/([\w.-]+)\/pull\/([1-9]\d*)(?:\/|$)/);
      if (url.origin !== "https://github.com" || !match) return null;
      return { owner: match[1], repository: match[2], number: match[3] };
    } catch {
      return null;
    }
  }

  function patternMatcher(patterns) {
    if (!Array.isArray(patterns) || patterns.length > 100) {
      throw new Error("Use at most 100 file patterns.");
    }
    const expressions = patterns.map((pattern) => {
      if (typeof pattern !== "string" || !pattern.trim() || pattern.length > 200) {
        throw new Error("Each pattern must contain 1–200 characters.");
      }
      let expression = "";
      for (let index = 0; index < pattern.length; index++) {
        const character = pattern[index];
        if (character === "*" && pattern[index + 1] === "*") {
          index++;
          if (pattern[index + 1] === "/") {
            expression += "(?:.*/)?";
            index++;
          } else {
            expression += ".*";
          }
        } else if (character === "*") {
          expression += "[^/]*";
        } else if (character === "?") {
          expression += "[^/]";
        } else {
          expression += character.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
        }
      }
      return new RegExp(`^${expression}$`, "i");
    });
    return (path) => expressions.some((expression) => expression.test(path));
  }

  function decodeGitPath(value) {
    if (!value.startsWith('"')) return value;
    if (!value.endsWith('"')) throw new Error("Invalid quoted diff filename.");
    const bytes = [];
    const encoder = new TextEncoder();
    const escapes = { a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13, '"': 34, "\\": 92 };
    const characters = value.slice(1, -1);
    for (let index = 0; index < characters.length; index++) {
      if (characters[index] !== "\\") {
        const point = String.fromCodePoint(characters.codePointAt(index));
        bytes.push(...encoder.encode(point));
        index += point.length - 1;
        continue;
      }
      index++;
      const octal = characters.slice(index).match(/^[0-7]{1,3}/);
      if (octal) {
        bytes.push(parseInt(octal[0], 8));
        index += octal[0].length - 1;
      } else if (characters[index] in escapes) {
        bytes.push(escapes[characters[index]]);
      } else {
        throw new Error("Invalid filename escape in diff.");
      }
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes));
  }

  function parseDiff(diff) {
    const files = [];
    let current = null;
    let hunk = null;
    let binaryPatch = false;
    const incomplete = () => new Error("GitHub returned an incomplete or unsupported diff. Totals are unavailable.");
    for (const rawLine of diff.split("\n")) {
      const line = rawLine.replace(/\r$/, "");
      if (line === "\\ No newline at end of file") {
        const previous = current?.hunks.at(-1)?.lines.at(-1);
        if (previous) previous.noNewline = true;
        continue;
      }
      if (hunk) {
        const prefix = line[0];
        current.hunks.at(-1).lines.push({ kind: prefix, text: rawLine.slice(1) });
        if (prefix === "+") { current.additions++; hunk.new--; }
        else if (prefix === "-") { current.deletions++; hunk.old--; }
        else if (prefix === " ") { hunk.new--; hunk.old--; }
        else throw incomplete();
        if (hunk.old < 0 || hunk.new < 0) throw incomplete();
        if (hunk.old === 0 && hunk.new === 0) hunk = null;
        continue;
      }
      if (line.startsWith("diff --git ")) {
        const match = line.match(/^diff --git ("(?:\\.|[^"\\])*"|a\/.*) ("(?:\\.|[^"\\])*"|b\/.*)$/);
        if (!match) throw incomplete();
        const oldPath = decodeGitPath(match[1]).replace(/^a\//, "");
        const path = decodeGitPath(match[2]).replace(/^b\//, "");
        current = { path, oldPath, additions: 0, deletions: 0, binary: false, hunks: [], oldAbsent: false, newAbsent: false };
        files.push(current);
        binaryPatch = false;
      } else if (line.startsWith("@@ ")) {
        const match = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
        if (!current || !match) throw incomplete();
        hunk = { old: Number(match[2] ?? 1), new: Number(match[4] ?? 1) };
        current.hunks.push({ oldStart: Number(match[1]), newStart: Number(match[3]), oldCount: hunk.old, newCount: hunk.new, lines: [] });
        if (!hunk.old && !hunk.new) hunk = null;
      } else if (line.startsWith("+++ ") || line.startsWith("--- ")) {
        if (!current) throw incomplete();
        const path = decodeGitPath(line.slice(4));
        if (path === "/dev/null") current[line.startsWith("+++ ") ? "newAbsent" : "oldAbsent"] = true;
        if (path !== "/dev/null") {
          if (line.startsWith("+++ ")) current.path = path.replace(/^b\//, "");
          else current.oldPath = path.replace(/^a\//, "");
        }
      } else if (line.startsWith("index ")) {
        if (!current) throw incomplete();
        const match = line.match(/^index ([a-f0-9]+)\.\.([a-f0-9]+)/);
        if (!match) throw incomplete();
        current.oldBlob = match[1];
        current.newBlob = match[2];
      } else if (line.startsWith("rename to ") || line.startsWith("copy to ")) {
        if (!current) throw incomplete();
        current.path = decodeGitPath(line.slice(line.startsWith("rename") ? 10 : 8));
      } else if (line.startsWith("rename from ") || line.startsWith("copy from ")) {
        if (!current) throw incomplete();
        current.oldPath = decodeGitPath(line.slice(line.startsWith("rename") ? 12 : 10));
      } else if (line.startsWith("Binary files ") || line === "GIT binary patch") {
        if (!current) throw incomplete();
        current.binary = true;
        binaryPatch = line === "GIT binary patch";
      } else if (!line || (current && /^(index |(?:new|deleted) file mode |(?:old|new) mode |(?:dis)?similarity index )/.test(line))) {
        continue;
      } else if (!binaryPatch) {
        throw incomplete();
      }
    }
    if (hunk || (!files.length && diff.trim())) throw incomplete();
    for (const file of files) {
      if (!/\.rs$/i.test(file.path) && !/\.rs$/i.test(file.oldPath)) {
        for (const key of ["hunks", "oldAbsent", "newAbsent", "oldBlob", "newBlob"]) delete file[key];
      }
    }
    return files;
  }

  function classifyFile(file, isTest, isConfig) {
    const category = isTest(file.path) ? "tests" : isConfig(file.path) ? "config" : "withoutTestsAndConfig";
    const inline = category === "tests" ? { additions: 0, deletions: 0 } : file.inlineTests ?? { additions: 0, deletions: 0 };
    return {
      category,
      additions: file.additions - inline.additions,
      deletions: file.deletions - inline.deletions,
      inline,
    };
  }

  function summarize(files, patterns, configPatterns = defaultConfigPatterns) {
    const isTest = patternMatcher(patterns);
    const isConfig = patternMatcher(configPatterns);
    const empty = () => ({ files: 0, additions: 0, deletions: 0, binary: 0 });
    const summary = { all: empty(), tests: empty(), withoutTestsAndConfig: empty(), config: empty() };
    for (const file of files) {
      const counted = classifyFile(file, isTest, isConfig);
      summary.all.files++;
      summary.all.additions += file.additions;
      summary.all.deletions += file.deletions;
      summary.all.binary += Number(file.binary);
      const group = summary[counted.category];
      group.files++;
      group.binary += Number(file.binary);
      for (const kind of ["additions", "deletions"]) {
        group[kind] += counted[kind];
        summary.tests[kind] += counted.inline[kind];
      }
    }
    return summary;
  }

  async function fetchDiff(pullRequest) {
    const { owner, repository, number } = pullRequest;
    const url = `https://github.com/${owner}/${repository}/pull/${number}.diff`;
    const response = await fetch(url, {
      credentials: "include", cache: "no-store", signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) {
      throw new Error(`GitHub could not provide the diff (HTTP ${response.status}). Check your sign-in and repository access, then refresh.`);
    }
    const finalUrl = new URL(response.url);
    if (!["github.com", "patch-diff.githubusercontent.com"].includes(finalUrl.hostname)
        || finalUrl.pathname.startsWith("/login")
        || response.headers.get("content-type")?.includes("text/html")) {
      throw new Error("GitHub returned a sign-in page. Sign in to GitHub, then refresh.");
    }
    const files = parseDiff(await response.text());
    await GitHubRustTests.enrich(files, pullRequest);
    return { files, loadedAt: Date.now() };
  }

  function errorMessage(error) {
    return error.name === "TimeoutError" || error.name === "AbortError"
      ? "The diff request timed out. Try Refresh; GitHub may be limiting a large diff."
      : error.message;
  }

  globalThis.GitHubDiffStats = { defaultPatterns, defaultConfigPatterns, legacyDefaultConfigPatterns, upgradeConfigPatterns, pullRequestFromUrl, patternMatcher, parseDiff, classifyFile, summarize, fetchDiff, errorMessage };
})();
