const { execFileSync } = require("node:child_process");
const { mkdtempSync, writeFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

function makeDiff(oldSource, newSource, path = "src/lib.rs") {
  const directory = mkdtempSync(join(tmpdir(), "rust-diff-fixture-"));
  try {
    writeFileSync(join(directory, "old.rs"), oldSource ?? "");
    writeFileSync(join(directory, "new.rs"), newSource ?? "");
    const arguments_ = ["diff", "--no-index", "--no-color", "--no-renames", "--", oldSource === null ? "/dev/null" : "old.rs", newSource === null ? "/dev/null" : "new.rs"];
    let diff;
    try { diff = execFileSync("git", arguments_, { cwd: directory, encoding: "utf8" }); }
    catch (error) { if (error.status !== 1) throw error; diff = error.stdout; }
    return diff.replaceAll("a/old.rs", `a/${path}`).replaceAll("b/old.rs", `b/${path}`).replaceAll("a/new.rs", `a/${path}`).replaceAll("b/new.rs", `b/${path}`);
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

const prefix = `pub fn production() {
    println!("old production");
}

#[cfg(test)]
mod tests {
    use super::*;
${Array.from({ length: 40 }, (_, index) => `    const CONTEXT_${index}: u32 = ${index};`).join("\n")}

    #[test]
    fn checks() {
`;
const suffix = `    }
}

pub fn after_tests() -> u32 { 42 }
`;
const oldSource = prefix + "        assert_eq!(1, 1);\n".repeat(10) + suffix;
const newSource = prefix.replace("old production", "new production") + "        assert_eq!(2, 2);\n".repeat(200) + suffix;
module.exports = { makeDiff, oldSource, newSource, diff: makeDiff(oldSource, newSource), head: "1234567890abcdef1234567890abcdef12345678" };
