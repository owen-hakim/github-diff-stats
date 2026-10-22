/* Recognize explicit Rust test scopes in verified complete source snapshots. */
(() => {
  function tokenize(source) {
    const tokens = [];
    const stack = [];
    const pairs = new Map();
    const fail = () => new Error("Rust source contains an unterminated string, comment, or delimiter.");
    for (let index = 0; index < source.length;) {
      const start = index;
      if (/\s/.test(source[index])) { index++; continue; }
      if (source.startsWith("//", index)) {
        const newline = source.indexOf("\n", index);
        index = newline === -1 ? source.length : newline;
        continue;
      }
      if (source.startsWith("/*", index)) {
        let depth = 1;
        index += 2;
        while (index < source.length && depth) {
          if (source.startsWith("/*", index)) { depth++; index += 2; }
          else if (source.startsWith("*/", index)) { depth--; index += 2; }
          else index++;
        }
        if (depth) throw fail();
        continue;
      }
      const raw = source.slice(index).match(/^(?:br|cr|r)(#*)"/);
      if (raw) {
        const close = source.indexOf(`"${raw[1]}`, index + raw[0].length);
        if (close === -1) throw fail();
        index = close + raw[1].length + 1;
        tokens.push({ value: source.slice(start, index), start, end: index, literal: true });
        continue;
      }
      if (source[index] === '"') {
        index++;
        while (index < source.length && source[index] !== '"') {
          index += source[index] === "\\" ? 2 : 1;
        }
        if (index >= source.length) throw fail();
        index++;
        tokens.push({ value: source.slice(start, index), start, end: index, literal: true });
        continue;
      }
      const character = source.slice(index).match(/^'(?:\\(?:u\{[\da-fA-F_]+\}|x[\da-fA-F]{2}|[^\n])|[^'\\\n])'/u);
      if (character) {
        index += character[0].length;
        tokens.push({ value: character[0], start, end: index, literal: true });
        continue;
      }
      const identifier = source.slice(index).match(/^(?:r#)?[a-zA-Z_][a-zA-Z_0-9]*/);
      const value = identifier ? identifier[0] : source[index];
      index += value.length;
      const position = tokens.length;
      tokens.push({ value, start, end: index });
      if (["(", "[", "{"].includes(value)) stack.push(position);
      else if ([")", "]", "}"].includes(value)) {
        const opening = stack.pop();
        if (opening === undefined || { ")": "(", "]": "[", "}": "{" }[value] !== tokens[opening].value) throw fail();
        pairs.set(opening, position);
      }
    }
    if (stack.length) throw fail();
    return { tokens, pairs };
  }

  // Bit 1 = can be false; bit 2 = can be true. Unknown platform/features allow both.
  function cfgPossibilities(values, testEnabled) {
    let cursor = 0;
    function predicate() {
      const name = values[cursor++];
      if (!name) throw new Error("Unsupported Rust cfg predicate.");
      if (values[cursor] === "(") {
        cursor++;
        const arguments_ = [];
        while (values[cursor] !== ")") {
          arguments_.push(predicate());
          if (values[cursor] === ",") cursor++;
          else if (values[cursor] !== ")") throw new Error("Unsupported Rust cfg predicate.");
          if (cursor >= values.length) throw new Error("Unsupported Rust cfg predicate.");
        }
        cursor++;
        if (name === "all") return (arguments_.some((value) => value & 1) ? 1 : 0) | (arguments_.every((value) => value & 2) ? 2 : 0);
        if (name === "any") return (arguments_.every((value) => value & 1) ? 1 : 0) | (arguments_.some((value) => value & 2) ? 2 : 0);
        if (name === "not" && arguments_.length === 1) return ((arguments_[0] & 1) ? 2 : 0) | ((arguments_[0] & 2) ? 1 : 0);
        throw new Error("Unsupported Rust cfg predicate.");
      }
      if (values[cursor] === "=") { cursor += 2; return 3; }
      if (name === "test") return testEnabled ? 2 : 1;
      if (name === "true") return 2;
      if (name === "false") return 1;
      return 3;
    }
    const result = predicate();
    if (values[cursor] === ",") cursor++;
    if (cursor !== values.length) throw new Error("Unsupported Rust cfg predicate.");
    return result;
  }

  function testLineMask(source) {
    const { tokens, pairs } = tokenize(source);
    const lineStarts = [0];
    for (let index = 0; index < source.length; index++) if (source[index] === "\n") lineStarts.push(index + 1);
    const mask = Array(lineStarts.length).fill(false);
    function lineAt(offset) {
      let low = 0;
      let high = lineStarts.length;
      while (low + 1 < high) {
        const middle = (low + high) >> 1;
        if (lineStarts[middle] <= offset) low = middle;
        else high = middle;
      }
      return low;
    }
    function mark(start, end) {
      for (let line = lineAt(start); line <= lineAt(end - 1); line++) mask[line] = true;
    }
    function itemEnd(start) {
      let itemKind = null;
      for (let index = start; index < tokens.length; index++) {
        const value = tokens[index].value;
        if (!itemKind && ["fn", "mod", "struct", "enum", "trait", "impl", "union", "use", "type", "const", "static"].includes(value)
            && !(value === "const" && ["fn", "unsafe", "async", "extern"].includes(tokens[index + 1]?.value))) itemKind = value;
        if (value === ";" || (!itemKind && value === ",")) return index;
        if (value === "}") throw new Error("Could not determine the end of a Rust test item.");
        if (pairs.has(index)) {
          const end = pairs.get(index);
          if (value === "{" && !["use", "type", "const", "static"].includes(itemKind)) return end;
          index = end;
        }
      }
      throw new Error("Could not determine the end of a Rust test item.");
    }
    for (let index = 0; index < tokens.length; index++) {
      // A macro's input is data, not expanded Rust syntax (e.g. quote! or macro_rules!).
      if (tokens[index].value === "!") {
        let next = index + 1;
        if (tokens[index - 1]?.value === "macro_rules") next++;
        if (pairs.has(next)) { index = pairs.get(next); continue; }
      }
      if (tokens[index].value !== "#") continue;
      const start = index;
      let cursor = index;
      let directTest = false;
      const predicates = [];
      const inner = tokens[cursor + 1]?.value === "!";
      while (tokens[cursor]?.value === "#") {
        if ((tokens[cursor + 1]?.value === "!") !== inner) break;
        cursor++;
        if (inner) cursor++;
        if (tokens[cursor]?.value !== "[" || !pairs.has(cursor)) break;
        const end = pairs.get(cursor);
        const values = tokens.slice(cursor + 1, end).map((token) => token.value);
        const parenthesis = values.indexOf("(");
        const name = values.slice(0, parenthesis === -1 ? values.length : parenthesis).join("");
        if (name === "test" || name.endsWith("::test") || name === "rstest" || name === "quickcheck") directTest = true;
        if (name === "cfg" && values.at(-1) === ")") predicates.push(values.slice(parenthesis + 1, -1));
        cursor = end + 1;
      }
      if (cursor === start + 1 || cursor === start) continue;
      const canCompile = (testEnabled) => predicates.every((values) => cfgPossibilities(values, testEnabled) & 2);
      const requiresTest = predicates.length > 0 && !canCompile(false) && canCompile(true);
      if (directTest || requiresTest) {
        if (inner) {
          // Inner attributes apply to their enclosing module (or the entire crate).
          let enclosingStart = 0;
          let enclosingEnd = source.length;
          for (const [opening, closing] of pairs) {
            if (tokens[opening].value === "{" && opening < start && closing >= cursor) {
              if (tokens[opening].start >= enclosingStart) {
                enclosingStart = tokens[opening].start;
                enclosingEnd = tokens[closing].end;
              }
            }
          }
          mark(enclosingStart, enclosingEnd);
        } else {
          const end = itemEnd(cursor);
          mark(tokens[start].start, tokens[end].end);
        }
      }
      index = cursor - 1;
    }
    return mask;
  }

  const linesOf = (source) => source.match(/[^\n]*\n|[^\n]+$/g) || [];
  const diffLine = (line) => line.text + (line.noNewline ? "" : "\n");

  function reconstructOld(file, newSource) {
    const current = linesOf(newSource);
    const previous = [];
    let cursor = 0;
    for (const hunk of file.hunks) {
      const newIndex = hunk.newStart - (hunk.newCount ? 1 : 0);
      const oldIndex = hunk.oldStart - (hunk.oldCount ? 1 : 0);
      if (newIndex < cursor || newIndex > current.length) throw new Error("Rust source does not match the diff. Refresh the PR.");
      previous.push(...current.slice(cursor, newIndex));
      if (previous.length !== oldIndex) throw new Error("Rust source does not match the diff. Refresh the PR.");
      cursor = newIndex;
      for (const line of hunk.lines) {
        if (line.kind !== "-") {
          if (current[cursor++] !== diffLine(line)) throw new Error("Rust source does not match the diff. Refresh the PR.");
        }
        if (line.kind !== "+") previous.push(diffLine(line));
      }
    }
    previous.push(...current.slice(cursor));
    return previous.join("");
  }

  async function verifyBlob(source, expected) {
    if (!expected || /^0+$/.test(expected)) return;
    const data = new TextEncoder().encode(source);
    const header = new TextEncoder().encode(`blob ${data.length}\0`);
    const bytes = new Uint8Array(header.length + data.length);
    bytes.set(header);
    bytes.set(data, header.length);
    const digest = await crypto.subtle.digest("SHA-1", bytes);
    const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    if (!hash.startsWith(expected)) throw new Error("Rust source changed since the diff was loaded. Refresh the PR.");
  }

  async function classify(file, newSource) {
    const oldSource = reconstructOld(file, newSource);
    if (!file.oldBlob || !file.newBlob) throw new Error("The Rust diff has no Git blob hashes; inline test totals cannot be verified.");
    await Promise.all([verifyBlob(oldSource, file.oldBlob), verifyBlob(newSource, file.newBlob)]);
    const oldMask = /\.rs$/i.test(file.oldPath) ? testLineMask(oldSource) : [];
    const newMask = /\.rs$/i.test(file.path) ? testLineMask(newSource) : [];
    const counts = { additions: 0, deletions: 0 };
    for (const hunk of file.hunks) {
      let oldLine = hunk.oldStart - 1;
      let newLine = hunk.newStart - 1;
      for (const line of hunk.lines) {
        if (line.kind === "+" && newMask[newLine]) counts.additions++;
        if (line.kind === "-" && oldMask[oldLine]) counts.deletions++;
        if (line.kind !== "+") oldLine++;
        if (line.kind !== "-") newLine++;
      }
    }
    return counts;
  }

  async function githubText(url) {
    const response = await fetch(url, { credentials: "include", cache: "no-store", signal: AbortSignal.timeout(25000) });
    if (!response.ok) throw new Error(`Could not load Rust test context from GitHub (HTTP ${response.status}). Check access and refresh.`);
    if (!["github.com", "patch-diff.githubusercontent.com", "raw.githubusercontent.com"].includes(new URL(response.url).hostname)
        || response.headers.get("content-type")?.includes("text/html")) {
      throw new Error("GitHub did not return Rust source. Check your sign-in and refresh.");
    }
    return response.text();
  }

  async function enrich(files, pullRequest) {
    const rustFiles = files.filter((file) => file.hunks && !file.binary && file.additions + file.deletions > 0);
    if (!rustFiles.length) return;
    const { owner, repository, number } = pullRequest;
    const root = `https://github.com/${owner}/${repository}`;
    let head;
    function headCommit() {
      head ??= githubText(`${root}/pull/${number}.patch`).then((patch) => {
        const commits = [...patch.matchAll(/^From ([a-f0-9]{40}) Mon Sep/gm)];
        if (!commits.length) throw new Error("GitHub did not provide a PR commit for Rust source. Refresh the PR.");
        return commits.at(-1)[1];
      });
      return head;
    }
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(4, rustFiles.length) }, async () => {
      while (next < rustFiles.length) {
        const file = rustFiles[next++];
        let source;
        if (file.newAbsent) source = "";
        else if (file.oldAbsent) source = file.hunks.flatMap((hunk) => hunk.lines.filter((line) => line.kind !== "-").map(diffLine)).join("");
        else {
          const commit = await headCommit();
          const path = file.path.split("/").map(encodeURIComponent).join("/");
          source = await githubText(`${root}/raw/${commit}/${path}`);
        }
        file.inlineTests = await classify(file, source);
      }
    }));
    // Retain just the result, never the source snapshots or hunk contents in the tab.
    for (const file of files) {
      for (const key of ["hunks", "oldAbsent", "newAbsent", "oldBlob", "newBlob"]) delete file[key];
    }
  }

  globalThis.GitHubRustTests = { tokenize, cfgPossibilities, testLineMask, reconstructOld, verifyBlob, classify, enrich };
})();
