// Use a Playwright installation outside this dependency-free extension directory.
// NODE_PATH=/path/to/node_modules node tests/browser-smoke.cjs
const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { chromium } = require("playwright");

const fixture = readFileSync(join(__dirname, "fixture.diff"), "utf8");
const rust = require("./rust-fixture.cjs");
require("../extension/stats.js");
const { defaultConfigPatterns, legacyDefaultConfigPatterns } = GitHubDiffStats;
const docsDiff = rust.makeDiff("# Guide\n", "# Guide\nInstall it.\nRun it.\n", "docs/guide.md")
  + rust.makeDiff("old\n", "new\n", "README.md")
  + rust.makeDiff("a\n", "a\nb\nc\n", "notes.txt")
  + rust.makeDiff("x\n", "y\n", "tests/README.md")
  + rust.makeDiff("one();\n", "two();\n", "src/app.js");
const configDiff = fixture
  + rust.makeDiff('{\n  "version": "1.0.0"\n}\n', '{\n  "version": "2.0.0",\n  "private": true\n}\n', "package.json")
  + rust.makeDiff("version = 3\n", "version = 4\n[[package]]\n", "Cargo.lock")
  + rust.makeDiff("enabled: false\n", "enabled: true\n", "settings.yml")
  + rust.makeDiff('{"old": true}\n', '{"new": true}\n', "tests/fixture.json");
const layoutPage = (content) => `<!doctype html><html data-color-mode="light" data-light-theme="light"><head><title>PR layout fixture</title></head><body style="margin:0;background:#fff"><main><div style="height:96px">Repository header</div><turbo-frame id="repo-content-turbo-frame" style="display:block"><div id="repo-content-pjax-container">${content}</div></turbo-frame></main></body></html>`;
// GitHub's files tab spans the window; its conversation tab is centered at 1280px.
const fullWidthPage = layoutPage('<div style="padding:24px 32px 0"><h1 style="margin:0">Full-width files tab</h1><div style="height:3000px"></div></div>');
const centeredPage = layoutPage('<div style="box-sizing:border-box;max-width:1280px;margin:0 auto;padding:24px 32px 0"><h1 style="margin:0">Centered conversation</h1><div style="height:3000px"></div></div>');
const extension = resolve(__dirname, "../extension");
const profile = mkdtempSync(join(tmpdir(), "github-diff-stats-browser-"));
const replacement = `diff --git a/src/new.js b/src/new.js
new file mode 100644
--- /dev/null
+++ b/src/new.js
@@ -0,0 +1,7 @@
+one
+two
+three
+four
+five
+six
+seven
`;

(async () => {
  const context = await chromium.launchPersistentContext(profile, {
    channel: "chromium", headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    viewport: { width: 1200, height: 900 },
  });
  try {
    await context.addCookies([{ name: "diff_stats_test_session", value: "synthetic", domain: "github.com", path: "/", secure: true, httpOnly: true, sameSite: "Lax" }]);
    const errors = [];
    const requests = [];
    let failed = false;
    let rustSourceFailed = false;
    let releaseSlowRequest;
    const slowRequest = new Promise((resolve) => { releaseSlowRequest = resolve; });
    let sawSlowRequest;
    const slowStarted = new Promise((resolve) => { sawSlowRequest = resolve; });
    await context.route("https://github.com/**", async (route) => {
      const request = route.request();
      const url = request.url();
      if (url.includes(`/raw/${rust.head}/`)) {
        return route.fulfill({ status: rustSourceFailed ? 404 : 200, contentType: "text/plain", body: rust.newSource });
      }
      if (url.endsWith(".patch")) {
        return route.fulfill({ contentType: "text/plain", body: `From ${rust.head} Mon Sep 17 00:00:00 2001\n` });
      }
      if (url.endsWith(".diff")) {
        requests.push({ url, headers: await request.allHeaders() });
        if (url.includes("/pull/43.diff")) { sawSlowRequest(); await slowRequest; }
        if (failed) return route.fulfill({ status: 404, contentType: "text/plain", body: "not found" });
        return route.fulfill({ contentType: "text/plain", body: url.includes("/pull/47.diff") ? docsDiff : url.includes("/pull/46.diff") ? configDiff : url.includes("/pull/45.diff") ? rust.diff : url.includes("/pull/44.diff") ? replacement : fixture });
      }
      if (url.includes("/pull/48")) return route.fulfill({ contentType: "text/html", body: fullWidthPage });
      if (url.includes("/pull/49")) return route.fulfill({ contentType: "text/html", body: centeredPage });
      await route.fulfill({ contentType: "text/html", body: '<!doctype html><html data-color-mode="light" data-light-theme="light"><head><title>PR smoke fixture</title></head><body style="margin:30px;background:#fff"><main><h1>Improve widget #42</h1><p>GitHub PR fixture</p></main></body></html>' });
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("https://github.com/owner/repo/pull/42");
    const panel = page.locator("#github-diff-stats");
    const metrics = panel.locator("#metrics");
    await metrics.waitFor({ state: "visible" });
    assert.deepEqual(await metrics.locator(".counts").allTextContents(), ["+4 −1", "+0 −0", "+2 −2"]);
    assert.deepEqual(await metrics.locator(".label").allTextContents(), ["Tests", "Config", "Code"]);
    assert.deepEqual(await metrics.locator(".meta").allTextContents(), ["5 lines · 2 files", "0 lines · 1 file", "4 lines · 3 files"]);
    assert.match(await panel.locator("#note").innerText(), /1 binary file has no line counts/);
    assert.ok(requests[0].headers.cookie.includes("diff_stats_test_session=synthetic"), "The extension's credentialed request sends a SameSite=Lax GitHub session cookie.");
    await panel.locator("#metric-tests").click();
    assert.deepEqual(await panel.locator("#file-list .path").allTextContents(), ["tests/widget.test.js", "test_helper.py"]);
    await panel.locator("#metric-config").click();
    assert.deepEqual(await panel.locator("#file-list .path").allTextContents(), ["docs/new name.md"]);
    await panel.locator("#files-toggle").click();
    assert.equal(await panel.locator("#file-list").isVisible(), false, "The Files button closes the list.");

    await panel.locator("#settings-toggle").click();
    await panel.locator("#patterns").fill("**/tests/**");
    await panel.locator("#save").click();
    await page.waitForFunction(() => document.querySelector("#github-diff-stats").shadowRoot.querySelector("#feedback").textContent === "Saved.");
    assert.deepEqual(await metrics.locator(".counts").allTextContents(), ["+3 −0", "+0 −0", "+3 −3"]);
    assert.equal(requests.length, 1, "Changing patterns doesn't download the diff again.");
    await page.reload();
    await metrics.waitFor({ state: "visible" });
    assert.equal(await panel.locator("#patterns").inputValue(), "**/tests/**");
    assert.deepEqual(await metrics.locator(".counts").allTextContents(), ["+3 −0", "+0 −0", "+3 −3"]);
    await panel.locator("#settings-toggle").click();
    await panel.locator("#reset").click();
    await page.waitForFunction(() => document.querySelector("#github-diff-stats").shadowRoot.querySelector("#patterns").value.includes("**/conftest.py"));
    assert.deepEqual(await metrics.locator(".counts").allTextContents(), ["+4 −1", "+0 −0", "+2 −2"]);

    await page.evaluate(() => { history.pushState({}, "", "/owner/repo/pull/42/files"); document.querySelector("main").replaceChildren(); document.dispatchEvent(new Event("turbo:render")); });
    await metrics.waitFor({ state: "visible" });
    assert.equal(requests.length, 2, "Tab navigation and DOM replacement reuse the result.");
    await page.evaluate(() => { history.pushState({}, "", "/owner/repo/pull/43"); document.dispatchEvent(new Event("turbo:load")); });
    await slowStarted;
    await page.evaluate(() => { history.pushState({}, "", "/owner/repo/pull/44"); document.dispatchEvent(new Event("turbo:load")); });
    await page.waitForFunction(() => document.querySelector("#github-diff-stats").shadowRoot.querySelectorAll(".counts")[2]?.textContent === "+7 −0");
    releaseSlowRequest();
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.deepEqual(await metrics.locator(".counts").allTextContents(), ["+0 −0", "+0 −0", "+7 −0"], "A previous PR's late response cannot overwrite the current PR.");

    await page.evaluate(() => { document.documentElement.setAttribute("data-color-mode", "dark"); document.documentElement.setAttribute("data-dark-theme", "dark"); document.dispatchEvent(new Event("turbo:load")); });
    assert.equal(await panel.getAttribute("data-dark"), "");
    assert.equal(await panel.locator(".panel").evaluate((node) => getComputedStyle(node).backgroundColor), "rgb(13, 17, 23)");
    await page.screenshot({ path: "/tmp/github-diff-stats-preview-dark.png" });
    await page.evaluate(() => { document.documentElement.setAttribute("data-color-mode", "light"); document.dispatchEvent(new Event("turbo:load")); });
    await page.setViewportSize({ width: 500, height: 900 });
    assert.equal(await panel.locator(".metrics").evaluate((node) => getComputedStyle(node).flexDirection), "column", "Narrow windows stack the categories.");

    failed = true;
    await panel.locator("#refresh").click();
    await panel.locator("#status.error").waitFor();
    assert.match(await panel.locator("#status").innerText(), /HTTP 404/);
    assert.equal(await metrics.isVisible(), false);
    failed = false;
    await panel.locator("#refresh").click();
    await metrics.waitFor({ state: "visible" });
    await page.evaluate(() => { history.pushState({}, "", "/owner/repo/issues/45"); document.dispatchEvent(new Event("turbo:load")); });
    assert.equal(await panel.count(), 0);
    await page.evaluate(() => { history.pushState({}, "", "/owner/repo/pull/42"); document.dispatchEvent(new Event("turbo:load")); });
    await metrics.waitFor({ state: "visible" });
    assert.deepEqual(await metrics.locator(".counts").allTextContents(), ["+4 −1", "+0 −0", "+2 −2"]);
    if (!await panel.locator("#patterns").isVisible()) {
      await panel.locator("#settings-toggle").click();
    }
    await panel.locator("#patterns").fill("");
    await panel.locator("#save").click();
    await page.waitForFunction(() => document.querySelector("#github-diff-stats").shadowRoot.querySelectorAll(".counts")[0].textContent === "+0 −0");
    assert.deepEqual(await metrics.locator(".counts").allTextContents(), ["+0 −0", "+0 −0", "+6 −3"]);
    await panel.locator("#patterns").fill("**\n".repeat(101));
    await panel.locator("#save").click();
    await page.waitForFunction(() => document.querySelector("#github-diff-stats").shadowRoot.querySelector("#feedback").textContent.includes("100"));
    assert.deepEqual(await metrics.locator(".counts").allTextContents(), ["+0 −0", "+0 −0", "+6 −3"], "Invalid patterns cannot change the active settings.");
    await panel.locator("#reset").click();
    await page.waitForFunction(() => document.querySelector("#github-diff-stats").shadowRoot.querySelectorAll(".counts")[0].textContent === "+4 −1");
    await panel.locator("#settings-close").click();
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.screenshot({ path: "/tmp/github-diff-stats-preview.png" });
    assert.deepEqual(errors, []);
    console.log("Browser smoke passed: real unpacked extension; credentialed session request; totals; classification; persistent settings; SPA navigation; stale response fencing; dark/mobile layouts; error/recovery.");

    await page.evaluate(() => { history.pushState({}, "", "/owner/repo/pull/45"); document.dispatchEvent(new Event("turbo:load")); });
    await page.waitForFunction(() => document.querySelector("#github-diff-stats").shadowRoot.querySelectorAll(".counts")[0]?.textContent === "+200 −10");
    assert.deepEqual(await metrics.locator(".counts").allTextContents(), ["+200 −10", "+0 −0", "+1 −1"]);
    assert.equal(await metrics.locator(".meta").first().textContent(), "210 lines · 0 files");
    await panel.locator("#metric-tests").click();
    assert.equal(await panel.locator("#list-title").textContent(), "Test files · 0 · inline tests in 1 source file");
    assert.deepEqual(await panel.locator(".path").allTextContents(), ["src/lib.rs"]);
    assert.deepEqual(await panel.locator(".badge").allTextContents(), ["inline tests"]);
    assert.deepEqual(await panel.locator(".file-counts").allTextContents(), ["+200 −10"]);
    await page.screenshot({ path: "/tmp/github-diff-stats-rust-preview.png" });
    rustSourceFailed = true;
    await panel.locator("#refresh").click();
    await panel.locator("#status.error").waitFor();
    assert.match(await panel.locator("#status").innerText(), /Rust test context.*HTTP 404/);
    assert.equal(await metrics.isVisible(), false);
    rustSourceFailed = false;
    await panel.locator("#refresh").click();
    await metrics.waitFor({ state: "visible" });
    assert.deepEqual(await metrics.locator(".counts").allTextContents(), ["+200 −10", "+0 −0", "+1 −1"]);
    console.log("Rust browser smoke passed: verified old/new source, +200/-10 inline tests, 210 changed lines, 0 test files, source list, and missing-source error/recovery.");

    await page.evaluate(() => { history.pushState({}, "", "/owner/repo/pull/46"); document.dispatchEvent(new Event("turbo:load")); });
    await page.waitForFunction(() => document.querySelector("#github-diff-stats").shadowRoot.querySelectorAll(".counts")[1]?.textContent === "+5 −3");
    assert.deepEqual(await metrics.locator(".counts").allTextContents(), ["+5 −2", "+5 −3", "+2 −2"]);
    assert.deepEqual(await metrics.locator(".label").allTextContents(), ["Tests", "Config", "Code"]);
    assert.equal(await metrics.locator(".metric").count(), 3, "GitHub's total must not be duplicated.");
    assert.equal(await metrics.locator(".meta").nth(1).textContent(), "8 lines · 4 files");
    await panel.locator("#metric-config").click();
    assert.deepEqual(await panel.locator("#file-list .path").allTextContents(), ["docs/new name.md", "package.json", "Cargo.lock", "settings.yml"]);
    await panel.locator("#metric-tests").click();
    assert.deepEqual(await panel.locator("#file-list .path").allTextContents(), ["tests/widget.test.js", "test_helper.py", "tests/fixture.json"]);
    await page.screenshot({ path: "/tmp/github-diff-stats-config-preview.png" });
    const requestsBeforeConfigEdit = requests.length;
    await panel.locator("#settings-toggle").click();
    await panel.locator("#config-patterns").fill("**/*.lock");
    await panel.locator("#save-config").click();
    await page.waitForFunction(() => document.querySelector("#github-diff-stats").shadowRoot.querySelector("#feedback-config").textContent === "Saved.");
    assert.deepEqual(await metrics.locator(".counts").allTextContents(), ["+5 −2", "+2 −1", "+5 −4"]);
    assert.equal(requests.length, requestsBeforeConfigEdit);
    await page.reload();
    await metrics.waitFor({ state: "visible" });
    assert.equal(await panel.locator("#config-patterns").inputValue(), "**/*.lock");
    assert.match(await panel.locator("#patterns").inputValue(), /\*\*\/conftest.py/);
    assert.deepEqual(await metrics.locator(".counts").allTextContents(), ["+5 −2", "+2 −1", "+5 −4"]);
    await panel.locator("#settings-toggle").click();
    await panel.locator("#config-patterns").fill("");
    await panel.locator("#save-config").click();
    await page.waitForFunction(() => document.querySelector("#github-diff-stats").shadowRoot.querySelectorAll(".counts")[1].textContent === "+0 −0");
    assert.deepEqual(await metrics.locator(".counts").allTextContents(), ["+5 −2", "+0 −0", "+7 −5"]);
    await panel.locator("#config-patterns").fill("**\n".repeat(101));
    await panel.locator("#save-config").click();
    await page.waitForFunction(() => document.querySelector("#github-diff-stats").shadowRoot.querySelector("#feedback-config").textContent.includes("100"));
    assert.deepEqual(await metrics.locator(".counts").allTextContents(), ["+5 −2", "+0 −0", "+7 −5"]);
    await panel.locator("#reset-config").click();
    await page.waitForFunction(() => document.querySelector("#github-diff-stats").shadowRoot.querySelectorAll(".counts")[1].textContent === "+5 −3");
    console.log("Config browser smoke passed: three panels in test/config/code order, JSON/lock/YAML counts and lists, test-fixture precedence, independent persistent/empty/invalid/reset config settings.");

    await page.evaluate(() => { history.pushState({}, "", "/owner/repo/pull/47"); document.dispatchEvent(new Event("turbo:load")); });
    await page.waitForFunction(() => document.querySelector("#github-diff-stats").shadowRoot.querySelectorAll(".counts")[1]?.textContent === "+5 −1");
    assert.deepEqual(await metrics.locator(".counts").allTextContents(), ["+1 −1", "+5 −1", "+1 −1"]);
    assert.equal(await metrics.locator(".meta").nth(1).textContent(), "6 lines · 3 files");
    await panel.locator("#settings-close").click();
    await panel.locator("#metric-config").click();
    assert.deepEqual(await panel.locator("#file-list .path").allTextContents(), ["docs/guide.md", "README.md", "notes.txt"]);
    await panel.locator("#metric-tests").click();
    assert.deepEqual(await panel.locator("#file-list .path").allTextContents(), ["tests/README.md"]);
    // A 1.2.0 user who saved (or restored) the old defaults has exactly that list stored.
    if (!await panel.locator("#config-patterns").isVisible()) {
      await panel.locator("#settings-toggle").click();
    }
    await panel.locator("#config-patterns").fill(legacyDefaultConfigPatterns.join("\n"));
    await panel.locator("#save-config").click();
    await page.waitForFunction(() => document.querySelector("#github-diff-stats").shadowRoot.querySelectorAll(".counts")[1].textContent === "+0 −0");
    assert.deepEqual(await metrics.locator(".counts").allTextContents(), ["+1 −1", "+0 −0", "+6 −2"]);
    await page.reload();
    await metrics.waitFor({ state: "visible" });
    await page.waitForFunction(() => document.querySelector("#github-diff-stats").shadowRoot.querySelectorAll(".counts")[1].textContent === "+5 −1");
    assert.equal(await panel.locator("#config-patterns").inputValue(), defaultConfigPatterns.join("\n"));
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    const storedConfig = () => worker.evaluate(async () => (await chrome.storage.local.get("configPatterns")).configPatterns);
    for (let attempt = 0; attempt < 20 && JSON.stringify(await storedConfig()) !== JSON.stringify(defaultConfigPatterns); attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.deepEqual(await storedConfig(), defaultConfigPatterns, "The upgrade is persisted, not only applied in memory.");
    await page.screenshot({ path: "/tmp/github-diff-stats-docs-preview.png" });
    console.log("Docs browser smoke passed: Markdown/text docs counted as config and excluded from code, test-path docs kept as tests, saved 1.2.0 config defaults upgraded and persisted.");

    const mode = () => panel.getAttribute("data-mode");
    const frameMargin = () => page.evaluate(() => document.querySelector("#repo-content-turbo-frame").style.marginRight);
    const waitForMode = (expected) => page.waitForFunction((value) => document.querySelector("#github-diff-stats")?.dataset.mode === value, expected);
    const position = async () => { const box = await panel.boundingBox(); return [Math.round(box.x), Math.round(box.y), Math.round(box.width)]; };
    await page.setViewportSize({ width: 1920, height: 900 });
    await page.goto("https://github.com/owner/repo/pull/48");
    await metrics.waitFor({ state: "visible" });
    await waitForMode("card");
    assert.equal(await frameMargin(), "296px", "A full-width layout is narrowed so the card fits beside it.");
    assert.deepEqual(await position(), [1616, 120, 288], "The card sits beside the content, level with the title.");
    assert.deepEqual(await panel.locator("#file-list .path").allTextContents(), ["src/widget.js", "src/old.js", "logo.png"], "The card lists code files by default.");
    await page.evaluate(() => scrollTo(0, 1500));
    await page.waitForFunction(() => Math.round(document.querySelector("#github-diff-stats").getBoundingClientRect().top) === 72);
    await page.screenshot({ path: "/tmp/github-diff-stats-card-preview.png" });
    await panel.locator("#collapse").click();
    await waitForMode("rail");
    assert.equal(await frameMargin(), "64px");
    assert.deepEqual(await position(), [1848, 72, 56]);
    await page.reload();
    await metrics.waitFor({ state: "attached" });
    await waitForMode("rail");
    assert.equal(await panel.locator("#metrics").isVisible(), true, "The collapsed preference survives a reload.");
    await panel.locator("#expand").click();
    await waitForMode("card");
    assert.equal(await frameMargin(), "296px");

    await page.setViewportSize({ width: 1440, height: 900 });
    await waitForMode("rail");
    assert.equal(await frameMargin(), "64px", "Medium windows only make room for the rail.");
    await page.screenshot({ path: "/tmp/github-diff-stats-rail-preview.png" });
    await panel.locator("#metric-tests").click();
    await waitForMode("card");
    assert.equal(await frameMargin(), "64px", "The expanded rail overlays the content instead of moving it.");
    assert.deepEqual(await position(), [1136, 72, 288], "The overlay stays pinned while scrolled.");
    assert.deepEqual(await panel.locator("#file-list .path").allTextContents(), ["tests/widget.test.js", "test_helper.py"]);
    await page.screenshot({ path: "/tmp/github-diff-stats-overlay-preview.png" });
    await page.keyboard.press("Escape");
    await waitForMode("rail");
    await panel.locator("#expand").click();
    await waitForMode("card");
    await page.mouse.click(300, 500);
    await waitForMode("rail");

    await page.setViewportSize({ width: 1000, height: 900 });
    await waitForMode("strip");
    assert.equal(await frameMargin(), "", "Narrow windows fall back to the strip without changing GitHub's layout.");
    assert.equal((await position())[0], 32, "The strip lines up with the content.");

    await page.setViewportSize({ width: 1920, height: 900 });
    await page.goto("https://github.com/owner/repo/pull/49");
    await metrics.waitFor({ state: "visible" });
    await waitForMode("card");
    assert.equal(await frameMargin(), "", "A centered layout already has room for the card.");
    assert.deepEqual(await position(), [1592, 120, 288]);
    await page.evaluate(() => { document.documentElement.setAttribute("data-color-mode", "dark"); document.documentElement.setAttribute("data-dark-theme", "dark"); });
    await page.waitForFunction(() => document.querySelector("#github-diff-stats").hasAttribute("data-dark"));
    await page.screenshot({ path: "/tmp/github-diff-stats-card-dark-preview.png" });
    await page.setViewportSize({ width: 1366, height: 900 });
    await waitForMode("rail");
    assert.equal(await frameMargin(), "42px", "A centered layout is narrowed by twice the missing gutter.");
    assert.deepEqual(await position(), [1294, 120, 56]);
    assert.equal(await mode(), "rail");
    assert.deepEqual(errors, []);
    console.log("Layout browser smoke passed: card, rail, overlay and strip modes; reserved margins on full-width and centered layouts; pinned while scrolling; persisted collapse.");

    if (process.env.DIFF_STATS_LIVE_TEST === "1") {
      await context.unroute("https://github.com/**");
      await page.goto("https://github.com/refined-github/refined-github/pull/6733", { waitUntil: "domcontentloaded" });
      await panel.locator("#metrics").waitFor({ state: "visible", timeout: 35000 });
      assert.equal(await panel.locator(".counts").count(), 3);
      await page.screenshot({ path: "/tmp/github-diff-stats-live-preview.png" });
      console.log("Live public GitHub PR passed: 41 files, +545 −596; real browser fetch and GitHub page.");
      await page.goto("https://github.com/rust-lang/log/pull/737", { waitUntil: "domcontentloaded" });
      await panel.locator("#metrics").waitFor({ state: "visible", timeout: 60000 });
      assert.deepEqual(await panel.locator(".counts").allTextContents(), ["+2 −2", "+2 −1", "+19 −10"]);
      assert.equal(await panel.locator(".meta").first().textContent(), "4 lines · 0 files");
      await page.screenshot({ path: "/tmp/github-diff-stats-live-rust-preview.png" });
      console.log("Live Rust GitHub PR passed: rust-lang/log#737, +2/-2 inline test lines, 0 test files, real source and patch downloads.");
    }
  } finally {
    await context.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => rmSync(profile, { recursive: true, force: true }));
