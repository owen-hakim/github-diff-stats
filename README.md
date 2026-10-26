# GitHub Diff Stats

A dependency-free Manifest V3 extension for Chrome and Firefox, including Zen. Every
GitHub pull request gets a panel with **Tests**, **Config**, and **Code**, in that
order: added lines, deleted lines, total changed lines (additions + deletions), and
changed files. GitHub's own total isn't duplicated.

## Install

### Chrome

1. Download `github-diff-stats.zip` from the latest release and unzip it, or clone
   this repository.
2. Open `chrome://extensions` in Chrome and turn on **Developer mode**.
3. Click **Load unpacked** and select the **extension** folder.
4. Reload any open GitHub PR. The panel docks beside the PR, or sits above it on
   narrow windows.

Keep the extension folder in place; Chrome loads its files from that location.
No build, account, API token, or Chrome Web Store upload is needed. To update,
replace the folder's contents with a newer release, then click the reload icon on
the extension's card in `chrome://extensions`.

### Firefox and Zen

Download `github-diff-stats-firefox.xpi` from the latest release. It needs Firefox 128
or later and isn't signed by Mozilla, so how you install it depends on the browser:

- **Zen**, Firefox Developer Edition and Nightly allow unsigned add-ons. Open
  `about:config` and set `xpinstall.signatures.required` to `false`. Then open
  `about:addons`, click the gear, choose **Install Add-on From File…**, and pick the
  `.xpi`. It stays installed across restarts. To update, install a newer `.xpi` the
  same way.
- **Firefox** (release) only accepts it as a temporary add-on: open
  `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…**, and pick
  the `.xpi` (or `extension/manifest.json` in a clone). Firefox removes it when it quits.

## Layout

The panel picks the largest form that fits beside GitHub's PR content:

- **Card** (wide windows): a 288px card docked in the right margin. It stays level
  with the PR title, then stays pinned below GitHub's sticky header while you scroll.
  Its file list shows the selected category.
- **Rail** (medium windows, or after **Collapse**): a 56px column with the split bar
  and each category's changed lines. Click it to open the card over the page;
  Escape or a click elsewhere closes it. When the card fits, expanding docks it
  again. The collapsed preference is saved.
- **Strip** (narrow windows): one row above the PR title, with **Files** to list a
  category's files.

Centered pages such as Conversation usually have a free margin. Full-width pages such
as Files changed are narrowed just enough for the panel, but never below 1,240px of
content for the card or 1,000px for the rail; otherwise the strip is used and the page
is left alone.

## Use

- Click **Tests**, **Config**, or **Code** to list the files classified there, with
  each file's additions/deletions. **Code** contains the remaining changes after
  removing test, config and documentation changes.
- Click the gear to edit **Classification patterns**. Test-file patterns: one glob per line;
  matching ignores case. `**/` also matches the repository root. Patterns support
  `*`, `**`, and `?`; braces and bracket expressions are literal characters.
- Defaults cover test/tests, spec/specs, `__tests__`, `__snapshots__`, e2e,
  Cypress and Playwright directories; `test_*`, `*_test.*`, `*.test.*`,
  `*.spec.*`, and `conftest.py` filenames. Fixtures inside these directories
  count as tests. Other fixture folders and CamelCase `FooTest.java` names need
  a custom pattern (for example `**/*Test.java`).
- Config-file patterns are customized separately from test globs. Defaults include `.json`, `.jsonc`, `.json5`, `.lock`, `.lockb`, `.toml`,
  `.yaml`, `.yml`, `.ini`, `.cfg`, `.conf`, `.config`, and `.properties`;
  environment, ignore and formatter dotfiles; dependency files such as `go.sum`,
  `Pipfile`, and `gradle.lockfile`; `*.config.js`/`.ts` variants; and
  documentation: `.md`, `.mdx`, `.markdown`, `.rst`, `.adoc`, and `.txt`
  (including `requirements*.txt`). Documentation counts as config because it
  isn't production code. Classification is by path, so JSON and `.txt` data
  files are included until you change the patterns. An empty config list
  disables config classification.
- Test-file patterns take precedence over config patterns: `tests/fixture.json`
  and `tests/README.md` count as test files. The three categories don't overlap.
  Existing test settings and customized config settings are retained when
  updating. A saved config list that still equals the 1.2.0 defaults is upgraded
  to the current defaults, so it picks up the documentation patterns.
- Renamed files use their destination path; deleted files use their original path.
- Rust source files split their changed lines into production and inline-test
  changes. Scopes marked `#[cfg(test)]` (including helpers inside test modules),
  `#[test]`, `#[tokio::test]` and other `::test` attributes, `#[rstest]`, and
  `#[quickcheck]` are recognized. `cfg(all(test, ...))` and other predicates that
  require `test` are supported; `cfg(not(test))` and code also compiled without
  `test` stay in production. Attribute and closing-brace lines count with their
  scope, along with comments/blank lines inside it. A physical line touching a
  test scope counts as one test line.
- Inline Rust tests add **lines**, not test files: for example **Tests
  +200 −10 · 210 lines · 0 files**. Their source paths appear in the test list
  with an **inline tests** badge. Whole-file glob matches still take precedence.
- Click **Refresh** after new commits. Moving between tabs of the same PR reuses
  the current result; moving to another PR loads its diff automatically.

## Data and limits

The extension downloads the PR's `.diff` from the GitHub page using your existing
GitHub session. If a redirect is blocked by browser cross-origin rules, the
background worker retries with its raw-diff host permission. Firefox always takes
this route for public PRs, because GitHub's content security policy blocks the
redirect for content scripts there. For modified Rust files it also reads GitHub's
PR patch and full source at the patch's final commit, reconstructs the old version
from the diff, and validates both Git blob hashes.
Added/deleted Rust files are reconstructed directly from the diff. It never
reads cookies through the cookies API or sends code to another service. Only
test and config patterns and the collapsed-rail preference are persisted locally. Diff text is parsed in memory and discarded;
file paths and counts remain in the open tab. Rust source snapshots and hunk
contents are also discarded after counting. There is no analytics or telemetry.

Collapsed or unloaded file panels don't affect the counts. Binary files contribute
to file totals but have no added/deleted line counts. Renames and mode changes
can contribute a file with zero changed lines. Changed lines means additions plus
deletions, not net growth, and includes whitespace changes.

GitHub can limit large diffs. The panel labels results **Downloaded diff**;
it validates hunk lengths and reports an error for malformed/truncated hunks, HTML
sign-in responses, HTTP errors, and timeouts. Whole files omitted by GitHub cannot
be detected from raw diff text, so these are counts of the downloaded diff, not
an independent guarantee of repository-wide completeness. Private repository
access depends on your existing session and your organization’s policies. A
private diff redirected off GitHub can still be affected by Chrome's cookie
restrictions. Private repositories haven't been tested in Firefox. Self-hosted
GitHub Enterprise is outside this extension's scope.

Rust detection recognizes explicit syntax rather than expanding macros or
running a compiler. Tests generated entirely by macros, arbitrary `cfg_attr`
effects, cross-file test-module membership, and Rustdoc examples aren't inferred.
Unmarked code remains production. Source snapshot mismatches (including a patch
whose final commit doesn't represent the current head), unavailable source, and
invalid/unbalanced Rust syntax produce an error instead of guessed counts.
Explicit test attributes and `cfg` guards are interpreted using the
[Rust testing reference](https://doc.rust-lang.org/reference/attributes/testing.html)
and [conditional-compilation reference](https://doc.rust-lang.org/reference/conditional-compilation.html).

## Verify

From this directory, run `node --test tests/*.test.cjs`. Tests cover classification,
diff parsing, malformed responses, request routing (including Firefox's
background-script loading), authentication handling, and the upgrade of saved
config defaults.
The browser smoke test also covers the actual unpacked extension, the card, rail,
overlay and strip layouts on full-width and centered pages, settings,
navigation, stale responses, error display, dark mode, Rust inline tests with the
+200/-10/210-lines/0-test-files example, separate persistent config settings,
documentation classified as config, and the upgrade of saved 1.2.0 config defaults.

With Playwright installed, run `NODE_PATH=/path/to/node_modules node
tests/browser-smoke.cjs`. Set `DIFF_STATS_LIVE_TEST=1` to also verify a real public
PR. Browser fixtures test private-session cookie delivery using a synthetic
cookie; they don't establish access to a real private repository.

Chrome's [network request documentation](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)
and [cookie documentation](https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies)
describe the host permissions and credentialed extension requests used here.

## Third-party notices

The panel's icons are path data from [GitHub Octicons](https://github.com/primer/octicons)
(`@primer/octicons` 19.15.0), used under the MIT License:

```text
MIT License

Copyright (c) 2025 GitHub Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
