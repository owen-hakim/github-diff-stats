(() => {
  const { defaultPatterns, defaultConfigPatterns, upgradeConfigPatterns, pullRequestFromUrl, patternMatcher, classifyFile, summarize, fetchDiff, errorMessage } = GitHubDiffStats;
  // Docked panel geometry, in CSS pixels. GAP separates the panel from GitHub's content (whose tab
  // bar overhangs it by 16px) and EDGE from the window. The card needs a wide window; GitHub's
  // content is narrowed to make room, but never below MIN_CONTENT_WIDTH.
  const CARD_WIDTH = 288;
  const RAIL_WIDTH = 56;
  const GAP = 24;
  const EDGE = 16;
  const TOP = 72;
  const MIN_CONTENT_WIDTH = { card: 1240, rail: 1000 };
  const categories = [
    { key: "tests", name: "tests", label: "Tests", list: "Test files" },
    { key: "config", name: "config", label: "Config", list: "Config files" },
    { key: "withoutTestsAndConfig", name: "code", label: "Code", list: "Code files" },
  ];
  // GitHub Octicons (MIT).
  const svg = (path) => `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="${path}"/></svg>`;
  const icons = {
    diff: svg("M1 1.75C1 .784 1.784 0 2.75 0h7.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16H2.75A1.75 1.75 0 0 1 1 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25V4.664a.25.25 0 0 0-.073-.177l-2.914-2.914a.25.25 0 0 0-.177-.073ZM8 3.25a.75.75 0 0 1 .75.75v1.5h1.5a.75.75 0 0 1 0 1.5h-1.5v1.5a.75.75 0 0 1-1.5 0V7h-1.5a.75.75 0 0 1 0-1.5h1.5V4A.75.75 0 0 1 8 3.25Zm-3 8a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1-.75-.75Z"),
    sync: svg("M1.705 8.005a.75.75 0 0 1 .834.656 5.5 5.5 0 0 0 9.592 2.97l-1.204-1.204a.25.25 0 0 1 .177-.427h3.646a.25.25 0 0 1 .25.25v3.646a.25.25 0 0 1-.427.177l-1.38-1.38A7.002 7.002 0 0 1 1.05 8.84a.75.75 0 0 1 .656-.834ZM8 2.5a5.487 5.487 0 0 0-4.131 1.869l1.204 1.204A.25.25 0 0 1 4.896 6H1.25A.25.25 0 0 1 1 5.75V2.104a.25.25 0 0 1 .427-.177l1.38 1.38A7.002 7.002 0 0 1 14.95 7.16a.75.75 0 0 1-1.49.178A5.5 5.5 0 0 0 8 2.5Z"),
    gear: svg("M8 0a8.2 8.2 0 0 1 .701.031C9.444.095 9.99.645 10.16 1.29l.288 1.107c.018.066.079.158.212.224.231.114.454.243.668.386.123.082.233.09.299.071l1.103-.303c.644-.176 1.392.021 1.82.63.27.385.506.792.704 1.218.315.675.111 1.422-.364 1.891l-.814.806c-.049.048-.098.147-.088.294.016.257.016.515 0 .772-.01.147.038.246.088.294l.814.806c.475.469.679 1.216.364 1.891a7.977 7.977 0 0 1-.704 1.217c-.428.61-1.176.807-1.82.63l-1.102-.302c-.067-.019-.177-.011-.3.071a5.909 5.909 0 0 1-.668.386c-.133.066-.194.158-.211.224l-.29 1.106c-.168.646-.715 1.196-1.458 1.26a8.006 8.006 0 0 1-1.402 0c-.743-.064-1.289-.614-1.458-1.26l-.289-1.106c-.018-.066-.079-.158-.212-.224a5.738 5.738 0 0 1-.668-.386c-.123-.082-.233-.09-.299-.071l-1.103.303c-.644.176-1.392-.021-1.82-.63a8.12 8.12 0 0 1-.704-1.218c-.315-.675-.111-1.422.363-1.891l.815-.806c.05-.048.098-.147.088-.294a6.214 6.214 0 0 1 0-.772c.01-.147-.038-.246-.088-.294l-.815-.806C.635 6.045.431 5.298.746 4.623a7.92 7.92 0 0 1 .704-1.217c.428-.61 1.176-.807 1.82-.63l1.102.302c.067.019.177.011.3-.071.214-.143.437-.272.668-.386.133-.066.194-.158.211-.224l.29-1.106C6.009.645 6.556.095 7.299.03 7.53.01 7.764 0 8 0Zm-.571 1.525c-.036.003-.108.036-.137.146l-.289 1.105c-.147.561-.549.967-.998 1.189-.173.086-.34.183-.5.29-.417.278-.97.423-1.529.27l-1.103-.303c-.109-.03-.175.016-.195.045-.22.312-.412.644-.573.99-.014.031-.021.11.059.19l.815.806c.411.406.562.957.53 1.456a4.709 4.709 0 0 0 0 .582c.032.499-.119 1.05-.53 1.456l-.815.806c-.081.08-.073.159-.059.19.162.346.353.677.573.989.02.03.085.076.195.046l1.102-.303c.56-.153 1.113-.008 1.53.27.161.107.328.204.501.29.447.222.85.629.997 1.189l.289 1.105c.029.109.101.143.137.146a6.6 6.6 0 0 0 1.142 0c.036-.003.108-.036.137-.146l.289-1.105c.147-.561.549-.967.998-1.189.173-.086.34-.183.5-.29.417-.278.97-.423 1.529-.27l1.103.303c.109.029.175-.016.195-.045.22-.313.411-.644.573-.99.014-.031.021-.11-.059-.19l-.815-.806c-.411-.406-.562-.957-.53-1.456a4.709 4.709 0 0 0 0-.582c-.032-.499.119-1.05.53-1.456l.815-.806c.081-.08.073-.159.059-.19a6.464 6.464 0 0 0-.573-.989c-.02-.03-.085-.076-.195-.046l-1.102.303c-.56.153-1.113.008-1.53-.27a4.44 4.44 0 0 0-.501-.29c-.447-.222-.85-.629-.997-1.189l-.289-1.105c-.029-.11-.101-.143-.137-.146a6.6 6.6 0 0 0-1.142 0ZM11 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM9.5 8a1.5 1.5 0 1 0-3.001.001A1.5 1.5 0 0 0 9.5 8Z"),
    chevron: svg("M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z"),
    alert: svg("M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"),
    close: svg("M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"),
  };
  const metric = ({ name, label }) => `<button class="metric" id="metric-${name}" type="button" data-category="${name}" aria-pressed="false"><span class="swatch"></span><span class="label">${label}</span><span class="counts"></span><span class="lines"></span><span class="meta"></span></button>`;

  const host = document.createElement("section");
  host.id = "github-diff-stats";
  host.setAttribute("aria-label", "GitHub diff statistics");
  host.dataset.mode = "strip";
  const shadow = host.attachShadow({ mode: "open" });
  // This template is static. All filenames, errors, and settings use textContent/value.
  // Colors come from GitHub's Primer variables when the page defines them, so the panel follows the active theme.
  shadow.innerHTML = `
    <style>
      :host { display:block; margin:16px 0; z-index:20; color-scheme:light;
        --bg:var(--bgColor-default, #ffffff); --float-bg:var(--overlay-bgColor, #ffffff); --fg:var(--fgColor-default, #1f2328); --fg-muted:var(--fgColor-muted, #59636e);
        --border:var(--borderColor-default, #d1d9e0); --border-muted:var(--borderColor-muted, #d1d9e0b3); --hover:var(--control-transparent-bgColor-hover, #818b981a); --selected:var(--control-transparent-bgColor-selected, #818b9826);
        --added:var(--fgColor-success, #1a7f37); --deleted:var(--fgColor-danger, #d1242f); --track:var(--bgColor-neutral-muted, #818b981f); --focus:var(--focus-outlineColor, #0969da);
        --button-bg:var(--button-default-bgColor-rest, #f6f8fa); --button-bg-hover:var(--button-default-bgColor-hover, #eff2f5); --button-border:var(--button-default-borderColor-rest, #d1d9e0);
        --primary-bg:var(--button-primary-bgColor-rest, #1f883d); --primary-bg-hover:var(--button-primary-bgColor-hover, #1c8139); --primary-fg:var(--button-primary-fgColor-rest, #ffffff); --primary-border:var(--button-primary-borderColor-rest, #1f232826);
        --shadow:var(--shadow-floating-small, 0 0 0 1px #d1d9e040, 0 6px 12px -3px #25292e0a, 0 6px 18px 0 #25292e1f);
        --tests:var(--data-purple-color-emphasis, #894ceb); --config:var(--data-orange-color-emphasis, #eb670f); --code:var(--data-blue-color-emphasis, #006edb);
        --font:var(--fontStack-system, -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif); --mono:var(--fontStack-monospace, ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace); }
      :host([data-dark]) { color-scheme:dark;
        --bg:var(--bgColor-default, #0d1117); --float-bg:var(--overlay-bgColor, #151b23); --fg:var(--fgColor-default, #f0f6fc); --fg-muted:var(--fgColor-muted, #9198a1);
        --border:var(--borderColor-default, #3d444d); --border-muted:var(--borderColor-muted, #3d444db3); --hover:var(--control-transparent-bgColor-hover, #656c7633); --selected:var(--control-transparent-bgColor-selected, #656c7640);
        --added:var(--fgColor-success, #3fb950); --deleted:var(--fgColor-danger, #f85149); --track:var(--bgColor-neutral-muted, #656c7633); --focus:var(--focus-outlineColor, #1f6feb);
        --button-bg:var(--button-default-bgColor-rest, #212830); --button-bg-hover:var(--button-default-bgColor-hover, #262c36); --button-border:var(--button-default-borderColor-rest, #3d444d);
        --primary-bg:var(--button-primary-bgColor-rest, #238636); --primary-bg-hover:var(--button-primary-bgColor-hover, #29903b); --primary-border:var(--button-primary-borderColor-rest, #ffffff26);
        --shadow:var(--shadow-floating-small, 0 0 0 1px #3d444d, 0 6px 12px -3px #01040966, 0 6px 18px 0 #01040966);
        --tests:var(--data-purple-color-emphasis, #975bf1); --config:var(--data-orange-color-emphasis, #db6d28); --code:var(--data-blue-color-emphasis, #0576ff); }
      :host([data-mode="card"]), :host([data-mode="rail"]) { position:fixed; margin:0; }
      :host([data-mode="card"]) { width:${CARD_WIDTH}px; } :host([data-mode="rail"]) { width:${RAIL_WIDTH}px; }
      * { box-sizing:border-box; } [hidden] { display:none !important; }
      .panel { display:grid; font:13px/1.5 var(--font); color:var(--fg); background:var(--bg); border:1px solid var(--border); border-radius:8px; overflow:hidden; }
      button { font:inherit; color:inherit; cursor:pointer; }
      button:focus-visible, textarea:focus-visible { outline:2px solid var(--focus); outline-offset:-2px; }
      .icon-button { display:inline-flex; align-items:center; justify-content:center; width:32px; height:32px; padding:0; color:var(--fg-muted); background:transparent; border:0; border-radius:6px; }
      .icon-button:hover, .toggle:hover, .metric:hover { background:var(--hover); color:var(--fg); }
      #refresh:disabled { cursor:progress; } #refresh:disabled svg, .panel.loading .status-icon svg { animation:spin 1s linear infinite; }
      @keyframes spin { to { transform:rotate(360deg); } }
      @media (prefers-reduced-motion:reduce) { #refresh:disabled svg, .panel.loading .status-icon svg { animation:none; } }
      #expand { grid-area:expand; display:none; } #collapse { grid-area:collapse; display:none; } #files-toggle { grid-area:toggle; display:none; }
      #settings-toggle { grid-area:settings; } #refresh { grid-area:refresh; }
      .title { grid-area:title; display:flex; align-items:center; gap:8px; white-space:nowrap; } .title svg { color:var(--fg-muted); }
      h2 { margin:0; font-size:13px; font-weight:600; }
      .metrics { grid-area:metrics; display:flex; min-width:0; }
      .metric { display:flex; align-items:center; gap:8px; padding:0; text-align:left; background:transparent; border:0; }
      .metric[aria-pressed="true"] { background:var(--selected); }
      .swatch { flex:none; width:8px; height:8px; border-radius:50%; }
      [data-category="tests"] .swatch, .segment.tests { background:var(--tests); } [data-category="config"] .swatch, .segment.config { background:var(--config); } [data-category="code"] .swatch, .segment.code { background:var(--code); }
      .label { font-weight:600; } .lines { display:none; font-weight:600; font-variant-numeric:tabular-nums; }
      .counts { font-weight:600; font-variant-numeric:tabular-nums; white-space:nowrap; }
      .added { color:var(--added); } .deleted { color:var(--deleted); } .added.zero, .deleted.zero { color:var(--fg-muted); }
      .meta, .updated, .note { color:var(--fg-muted); font-size:12px; } .meta, .updated { white-space:nowrap; }
      .status { grid-area:metrics; margin:0; align-self:center; color:var(--fg-muted); } .status.error { color:var(--deleted); }
      .status-icon { grid-area:metrics; display:none; justify-content:center; padding:12px 0; color:var(--fg-muted); } .status-icon svg + svg, .panel.error .status-icon svg:first-child { display:none; } .panel.error .status-icon { color:var(--deleted); } .panel.error .status-icon svg + svg { display:block; }
      .updated { grid-area:updated; } .note { grid-area:note; margin:0; }
      .meter { grid-area:meter; display:flex; gap:2px; } .segment { flex:0 0 0; min-width:0; min-height:0; }
      .files { grid-area:files; display:flex; flex-direction:column; min-height:0; }
      .list-title { margin:0; color:var(--fg-muted); font-size:11px; font-weight:600; letter-spacing:.04em; text-transform:uppercase; }
      ul { list-style:none; margin:0; padding:0; overflow:auto; } li.empty { color:var(--fg-muted); }
      .path { min-width:0; } .dir { color:var(--fg-muted); }
      .badge { justify-self:end; padding:0 6px; font-size:11px; line-height:18px; color:var(--fg-muted); border:1px solid var(--border); border-radius:999px; white-space:nowrap; }
      .mini { display:none; } .file-counts { white-space:nowrap; text-align:right; font:12px/1.5 var(--mono); }
      .panel:not(.loaded) :is(.metrics, .meter, .files, .note, .updated, #files-toggle) { display:none !important; } .panel.loaded .status { display:none; }

      :host([data-mode="strip"]) .panel { grid-template-columns:auto minmax(0, 1fr) auto auto auto auto; grid-template-areas:"title metrics updated toggle settings refresh" "meter meter meter meter meter meter" "files files files files files files" "note note note note note note"; align-items:center; }
      :host([data-mode="strip"]) .title { min-height:48px; padding:0 14px; }
      :host([data-mode="strip"]) .metrics { align-self:stretch; flex-wrap:wrap; }
      :host([data-mode="strip"]) .metric { padding:6px 14px; border-left:1px solid var(--border-muted); }
      :host([data-mode="strip"]) .status { padding:12px 0; }
      :host([data-mode="strip"]) .updated { padding:0 8px; }
      :host([data-mode="strip"]) #files-toggle { display:inline-flex; align-items:center; gap:4px; height:32px; padding:0 6px 0 10px; font-weight:500; background:transparent; border:0; border-radius:6px; }
      :host([data-mode="strip"]) #files-toggle svg { color:var(--fg-muted); transform:rotate(90deg); } :host([data-mode="strip"]) #files-toggle[aria-expanded="true"] { background:var(--selected); } :host([data-mode="strip"]) #files-toggle[aria-expanded="true"] svg { transform:rotate(-90deg); }
      :host([data-mode="strip"]) #refresh { margin-right:6px; }
      :host([data-mode="strip"]) .meter { height:3px; }
      :host([data-mode="strip"]) .files { border-top:1px solid var(--border-muted); }
      :host([data-mode="strip"]) .list-title { padding:10px 16px 2px; }
      :host([data-mode="strip"]) ul { max-height:280px; padding-bottom:6px; }
      :host([data-mode="strip"]) li { display:flex; align-items:center; gap:12px; padding:5px 16px; }
      :host([data-mode="strip"]) .path { flex:1; overflow-wrap:anywhere; }
      :host([data-mode="strip"]) .mini { display:flex; flex:none; gap:1px; width:72px; height:6px; overflow:hidden; border-radius:3px; background:var(--track); } .mini .added { background:var(--added); } .mini .deleted { background:var(--deleted); }
      :host([data-mode="strip"]) .file-counts { flex:none; width:96px; }
      :host([data-mode="strip"]) .note { padding:8px 16px 10px; border-top:1px solid var(--border-muted); } :host([data-mode="strip"]) .files[hidden] ~ .note { display:none; }
      @media (max-width:760px) {
        :host([data-mode="strip"]) .panel { grid-template-columns:minmax(0, 1fr) auto auto auto; grid-template-areas:"title toggle settings refresh" "metrics metrics metrics metrics" "meter meter meter meter" "files files files files" "note note note note"; }
        :host([data-mode="strip"]) .updated { display:none; }
        :host([data-mode="strip"]) .metrics { flex-direction:column; border-top:1px solid var(--border-muted); }
        :host([data-mode="strip"]) .metric { padding:8px 14px; border-left:0; } :host([data-mode="strip"]) .metric + .metric { border-top:1px solid var(--border-muted); }
        :host([data-mode="strip"]) .status { padding:12px 14px; }
      }

      :host([data-mode="card"]) .panel, :host([data-mode="rail"]) .panel { background:var(--float-bg); border-radius:14px; box-shadow:var(--shadow); }
      :host([data-mode="card"]) .panel { max-height:var(--max-height, 80vh); grid-template-columns:minmax(0, 1fr) auto auto auto; grid-template-rows:auto auto auto minmax(0, 1fr) auto auto; grid-template-areas:"title refresh settings collapse" "meter meter meter meter" "metrics metrics metrics metrics" "files files files files" "updated updated updated updated" "note note note note"; align-items:center; }
      :host([data-mode="card"]) .title { min-height:44px; padding:0 0 0 14px; }
      :host([data-mode="card"]) #collapse { display:inline-flex; margin-right:6px; }
      :host([data-mode="card"]) .meter { height:3px; }
      :host([data-mode="card"]) .metrics { flex-direction:column; gap:2px; padding:6px; }
      :host([data-mode="card"]) .metric { display:grid; grid-template-columns:8px minmax(0, 1fr) auto; gap:0 10px; padding:7px 8px; border-radius:8px; }
      :host([data-mode="card"]) .meta { grid-column:2 / 4; }
      :host([data-mode="card"]) .status { padding:12px 14px; }
      :host([data-mode="card"]) .files { align-self:stretch; border-top:1px solid var(--border-muted); }
      :host([data-mode="card"]) .list-title { padding:10px 14px 4px; }
      :host([data-mode="card"]) ul { min-height:0; padding:0 6px 6px; }
      :host([data-mode="card"]) li { display:grid; grid-template-columns:minmax(0, 1fr) auto; grid-template-areas:"path counts" "path badge"; column-gap:8px; padding:5px 8px; border-radius:6px; }
      :host([data-mode="card"]) li.empty { display:block; }
      :host([data-mode="card"]) .path { grid-area:path; display:flex; flex-direction:column-reverse; }
      :host([data-mode="card"]) :is(.dir, .name) { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; } :host([data-mode="card"]) .dir { font-size:11px; }
      :host([data-mode="card"]) .file-counts { grid-area:counts; font-size:11.5px; } :host([data-mode="card"]) .badge { grid-area:badge; }
      :host([data-mode="card"]) .updated { padding:8px 14px 0; border-top:1px solid var(--border-muted); font-size:11.5px; }
      :host([data-mode="card"]) .note { padding:0 14px 10px; font-size:11.5px; }

      :host([data-mode="rail"]) .panel { grid-template-columns:minmax(0, 1fr); grid-template-areas:"expand" "meter" "metrics" "refresh" "settings"; justify-items:center; }
      :host([data-mode="rail"]) :is(.title, .updated, .files, .note, .status) { display:none; }
      :host([data-mode="rail"]) .panel:not(.loaded) .status-icon { display:flex; }
      :host([data-mode="rail"]) #expand { display:flex; width:100%; height:44px; border-bottom:1px solid var(--border-muted); border-radius:0; }
      :host([data-mode="rail"]) .meter { flex-direction:column; width:6px; height:112px; margin:14px 0 10px; overflow:hidden; border-radius:3px; background:var(--track); }
      :host([data-mode="rail"]) .metrics { flex-direction:column; gap:4px; width:100%; padding-bottom:10px; }
      :host([data-mode="rail"]) .metric { flex-direction:column; gap:0; width:100%; padding:4px 0; }
      :host([data-mode="rail"]) :is(.counts, .meta) { display:none; }
      :host([data-mode="rail"]) .lines { display:block; order:1; margin-top:2px; font-size:13px; line-height:18px; }
      :host([data-mode="rail"]) .label { order:2; font-size:10.5px; font-weight:400; line-height:12px; color:var(--fg-muted); text-transform:lowercase; }
      :host([data-mode="rail"]) :is(#refresh, #settings-toggle) { width:100%; height:40px; border-radius:0; } :host([data-mode="rail"]) #refresh { border-top:1px solid var(--border-muted); }

      dialog { width:min(760px, calc(100vw - 32px)); max-height:calc(100vh - 64px); padding:0; font:13px/1.5 var(--font); color:var(--fg); background:var(--float-bg); border:1px solid var(--border); border-radius:12px; box-shadow:var(--shadow); }
      dialog::backdrop { background:rgba(31, 35, 40, .4); }
      .dialog-header { display:flex; align-items:center; gap:8px; padding:8px 8px 8px 16px; border-bottom:1px solid var(--border-muted); } .dialog-header h2 { flex:1; font-size:14px; }
      .fields { display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:16px 24px; padding:16px; }
      .field { display:grid; grid-row:span 5; grid-template-rows:subgrid; row-gap:0; }
      .field label { display:block; font-weight:600; } .hint { margin:4px 0 8px; font-size:12px; color:var(--fg-muted); }
      textarea { display:block; width:100%; min-height:200px; resize:vertical; padding:8px; font:12px/1.5 var(--mono); color:var(--fg); background:var(--bg); border:1px solid var(--border); border-radius:6px; }
      .actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:8px; }
      .button { height:32px; padding:0 12px; font-weight:500; background:var(--button-bg); border:1px solid var(--button-border); border-radius:6px; } .button:hover { background:var(--button-bg-hover); }
      .button.primary { color:var(--primary-fg); background:var(--primary-bg); border-color:var(--primary-border); } .button.primary:hover { background:var(--primary-bg-hover); }
      .feedback { min-height:18px; margin:8px 0 0; font-size:12px; color:var(--fg-muted); } .feedback.error { color:var(--deleted); }
    </style>
    <div class="panel loading" id="panel">
      <button id="expand" class="icon-button" type="button" aria-label="Show diff size details" aria-expanded="false" title="Diff size">${icons.diff}</button>
      <div class="title">${icons.diff}<h2>Diff size</h2></div>
      <div class="metrics" id="metrics">${categories.map(metric).join("")}</div>
      <p class="status" id="status" role="status" aria-live="polite">Loading diff…</p>
      <span class="status-icon" aria-hidden="true">${icons.sync}${icons.alert}</span>
      <span class="updated" id="updated"></span>
      <button id="files-toggle" class="toggle" type="button" aria-expanded="false" aria-controls="files">Files${icons.chevron}</button>
      <button id="settings-toggle" class="icon-button" type="button" aria-label="Classification patterns" title="Classification patterns">${icons.gear}</button>
      <button id="refresh" class="icon-button" type="button" aria-label="Refresh" title="Refresh">${icons.sync}</button>
      <button id="collapse" class="icon-button" type="button" aria-label="Collapse to rail" aria-expanded="true" title="Collapse">${icons.chevron}</button>
      <div class="meter" aria-hidden="true">${categories.map(({ name }) => `<span class="segment ${name}" id="segment-${name}"></span>`).join("")}</div>
      <div class="files" id="files" hidden><p class="list-title" id="list-title"></p><ul id="file-list"></ul></div>
      <p class="note" id="note"></p>
    </div>
    <dialog id="settings" aria-labelledby="settings-title">
      <div class="dialog-header"><h2 id="settings-title">Classification patterns</h2><button id="settings-close" class="icon-button" type="button" aria-label="Close">${icons.close}</button></div>
      <div class="fields">
        <div class="field">
          <label for="patterns">Test-file patterns</label>
          <p class="hint" id="patterns-hint">One glob per line; matches count as tests. * matches within a filename, ** across folders, ? one character. Matching ignores case. Rust inline tests are detected separately and don't add to the test-file count.</p>
          <textarea id="patterns" spellcheck="false" aria-describedby="patterns-hint"></textarea>
          <div class="actions"><button id="save" class="button primary" type="button">Save patterns</button><button id="reset" class="button" type="button">Restore defaults</button></div>
          <p id="feedback" class="feedback" role="status"></p>
        </div>
        <div class="field">
          <label for="config-patterns">Config-file patterns</label>
          <p class="hint" id="config-patterns-hint">One glob per line; matches count as config. JSON, lockfiles, YAML, TOML, other config formats and documentation (.md, .mdx, .markdown, .rst, .adoc, .txt) are included by default. Test files take precedence. Empty patterns turn off config classification.</p>
          <textarea id="config-patterns" spellcheck="false" aria-describedby="config-patterns-hint"></textarea>
          <div class="actions"><button id="save-config" class="button primary" type="button">Save patterns</button><button id="reset-config" class="button" type="button">Restore defaults</button></div>
          <p id="feedback-config" class="feedback" role="status"></p>
        </div>
      </div>
    </dialog>`;

  const element = (id) => shadow.getElementById(id);
  const node = (tag, className, text) => {
    const created = document.createElement(tag);
    created.className = className;
    if (text !== undefined) created.textContent = text;
    return created;
  };
  let patterns = [...defaultPatterns];
  let configPatterns = [...defaultConfigPatterns];
  let files = null;
  let loadedAt = null;
  let route = null;
  let generation = 0;
  let settingsReady = false;
  let selected = "withoutTestsAndConfig";
  let filesOpen = false;
  let railCollapsed = false;
  let overlayOpen = false;
  let frame = null;
  let fitted = "strip";
  let layoutKey = null;
  const format = (number) => number.toLocaleString();
  const plural = (count, noun) => `${format(count)} ${noun}${count === 1 ? "" : "s"}`;
  const listVisible = () => host.dataset.mode === "card" || (host.dataset.mode === "strip" && filesOpen);

  function counts(additions, deletions) {
    const added = node("span", additions ? "added" : "added zero", `+${format(additions)}`);
    added.title = "Lines added";
    const deleted = node("span", deletions ? "deleted" : "deleted zero", `−${format(deletions)}`);
    deleted.title = "Lines deleted";
    return [added, " ", deleted];
  }

  function fileRow({ file, additions, deletions, inline }) {
    const row = document.createElement("li");
    row.title = file.path;
    const cut = file.path.lastIndexOf("/") + 1;
    const path = node("span", "path");
    path.append(node("span", "dir", file.path.slice(0, cut)), node("span", "name", file.path.slice(cut)));
    row.append(path);
    if (inline) row.append(node("span", "badge", "inline tests"));
    const lines = additions + deletions;
    const mini = node("span", "mini");
    mini.setAttribute("aria-hidden", "true");
    for (const [kind, value] of [["added", additions], ["deleted", deletions]]) {
      const part = node("span", kind);
      part.style.width = `${lines ? (value / lines) * 100 : 0}%`;
      mini.append(part);
    }
    const fileCounts = node("span", "file-counts");
    if (file.binary) fileCounts.textContent = "binary";
    else fileCounts.append(...counts(additions, deletions));
    row.append(mini, fileCounts);
    return row;
  }

  function render() {
    if (!files) return;
    const summary = summarize(files, patterns, configPatterns);
    const isTest = patternMatcher(patterns);
    const isConfig = patternMatcher(configPatterns);
    const total = categories.reduce((sum, { key }) => sum + summary[key].additions + summary[key].deletions, 0);
    for (const { key, name, label } of categories) {
      const group = summary[key];
      const lines = group.additions + group.deletions;
      const item = element(`metric-${name}`);
      item.querySelector(".counts").replaceChildren(...counts(group.additions, group.deletions));
      item.querySelector(".lines").textContent = format(lines);
      item.querySelector(".meta").textContent = `${plural(lines, "line")} · ${plural(group.files, "file")}`;
      item.title = `${label}: ${plural(lines, "changed line")}${total ? ` (${Math.round((lines / total) * 100)}%)` : ""}`;
      item.setAttribute("aria-pressed", String(key === selected && listVisible()));
      element(`segment-${name}`).style.flexGrow = lines;
      element(`segment-${name}`).hidden = !lines;
    }
    const entries = [];
    for (const file of files) {
      const counted = classifyFile(file, isTest, isConfig);
      if (counted.category === selected) entries.push({ file, additions: counted.additions, deletions: counted.deletions });
      else if (selected === "tests" && counted.inline.additions + counted.inline.deletions > 0) entries.push({ file, ...counted.inline, inline: true });
    }
    const category = categories.find(({ key }) => key === selected);
    const inlineCount = entries.filter((entry) => entry.inline).length;
    element("list-title").textContent = `${category.list} · ${format(summary[selected].files)}${inlineCount ? ` · inline tests in ${plural(inlineCount, "source file")}` : ""}`;
    element("file-list").replaceChildren(...(entries.length ? entries.map(fileRow) : [node("li", "empty", `No ${category.list.toLowerCase()} in this diff.`)]));
    element("files").hidden = !listVisible();
    element("files-toggle").setAttribute("aria-expanded", String(host.dataset.mode === "strip" && filesOpen));
    const time = new Date(loadedAt);
    element("updated").textContent = `Updated ${time.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
    element("updated").title = `Downloaded at ${time.toLocaleTimeString()}`;
    const binary = summary.all.binary;
    const binaryNote = binary ? ` · ${binary === 1 ? "1 binary file has" : `${format(binary)} binary files have`} no line counts` : "";
    element("note").textContent = `Downloaded diff${binaryNote} · GitHub may limit very large diffs`;
  }

  function showStatus(state, message) {
    element("panel").className = `panel ${state}`;
    element("status").className = state === "error" ? "status error" : "status";
    element("status").textContent = message;
  }

  async function load() {
    const requestGeneration = ++generation;
    files = null;
    element("refresh").disabled = true;
    showStatus("loading", "Loading diff…");
    try {
      let result;
      try {
        // Same-origin requests preserve private-repo sessions even when Chrome
        // blocks third-party cookies for extension-origin network requests.
        result = await fetchDiff(pullRequestFromUrl(location.href));
      } catch (error) {
        if (requestGeneration !== generation) return;
        // Public raw-diff redirects can require the worker's cross-origin permission.
        if (error.name !== "TypeError") throw error;
        result = await chrome.runtime.sendMessage({ type: "load-pr-diff" });
      }
      if (requestGeneration !== generation) return;
      if (!result || result.error) throw new Error(result?.error || "No response from the extension. Reload this page.");
      files = result.files;
      loadedAt = result.loadedAt;
      element("panel").className = "panel loaded";
      render();
    } catch (error) {
      if (requestGeneration !== generation) return;
      showStatus("error", errorMessage(error));
    } finally {
      if (requestGeneration === generation) element("refresh").disabled = false;
    }
  }

  function updateTheme() {
    const root = document.documentElement;
    const mode = root.getAttribute("data-color-mode");
    const scheme = mode === "light" || mode === "dark" ? mode : matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    host.toggleAttribute("data-dark", /dark/.test(root.getAttribute(`data-${scheme}-theme`) || scheme));
  }

  // The first rendered PR title; GitHub can keep a hidden copy for its sticky header.
  const visibleTitle = () => frame && [...frame.querySelectorAll("h1")].find((title) => title.getClientRects().length);

  // GitHub's PR content sits in this frame with symmetric side padding, so the title's
  // left offset gives the right edge of the content as well.
  function contentBox() {
    const title = visibleTitle();
    if (!title) return null;
    const box = frame.getBoundingClientRect();
    const inset = title.getBoundingClientRect().left - box.left;
    const right = box.right - inset;
    return { inset, right, width: box.width - 2 * inset, gutter: document.documentElement.clientWidth - right };
  }

  // Narrows the frame until the right gutter is `needed` wide. A centered layout gains half of
  // each pixel of margin and a full-width one all of it, so this settles within a few passes.
  function reserveGutter(needed) {
    let margin = 0;
    for (let pass = 0; pass < 4; pass++) {
      const box = contentBox();
      if (!box || (box.gutter >= needed && (!margin || box.gutter - needed < 1))) return;
      margin = Math.max(0, box.gutter < needed ? margin + 2 * (needed - box.gutter) : margin - (box.gutter - needed));
      frame.style.marginRight = margin ? `${Math.ceil(margin)}px` : "";
    }
  }

  function currentLayoutKey() {
    const title = visibleTitle();
    return [document.documentElement.clientWidth, frame, title, title && Math.round(title.getBoundingClientRect().left), railCollapsed, overlayOpen];
  }

  function layout() {
    // Keep a docked panel in place while the title is briefly unmeasurable, e.g. mid-render.
    if (host.dataset.mode !== "strip" && layoutKey?.[1] === frame && frame && !visibleTitle()) return;
    if (frame) frame.style.marginRight = "";
    const natural = contentBox();
    const fits = (width, mode) => natural && (natural.gutter >= width + GAP + EDGE || natural.width - (width + GAP + EDGE - natural.gutter) >= MIN_CONTENT_WIDTH[mode]);
    fitted = fits(CARD_WIDTH, "card") ? "card" : fits(RAIL_WIDTH, "rail") ? "rail" : "strip";
    const docked = fitted === "card" && railCollapsed ? "rail" : fitted;
    if (docked !== "rail") overlayOpen = false;
    host.dataset.mode = overlayOpen ? "card" : docked;
    host.style.cssText = "";
    if (docked === "strip") {
      // Line the strip up with the PR content; without the frame it keeps its default margins.
      if (natural) host.style.margin = `24px ${natural.inset}px 0`;
    } else {
      reserveGutter((docked === "card" ? CARD_WIDTH : RAIL_WIDTH) + GAP + EDGE);
      const box = contentBox() ?? natural;
      const width = host.dataset.mode === "card" ? CARD_WIDTH : RAIL_WIDTH;
      host.style.left = `${Math.round(Math.min(box.right + GAP, document.documentElement.clientWidth - EDGE - width))}px`;
      place();
    }
    layoutKey = currentLayoutKey();
    render();
  }

  // Keeps a docked panel level with the PR title, then pinned below GitHub's sticky header.
  function place() {
    if (host.dataset.mode === "strip" || !frame) return;
    const title = visibleTitle();
    const top = Math.max(TOP, title ? title.getBoundingClientRect().top : TOP);
    host.style.top = `${Math.round(top)}px`;
    host.style.setProperty("--max-height", `${Math.round(Math.max(160, innerHeight - top - EDGE))}px`);
  }

  function layoutIfChanged() {
    const key = currentLayoutKey();
    if (!layoutKey || key.some((part, index) => part !== layoutKey[index])) layout();
  }

  function mount(main) {
    const nextFrame = main.querySelector("#repo-content-turbo-frame");
    if (frame && frame !== nextFrame) frame.style.marginRight = "";
    frame = nextFrame;
    if (frame ? host.nextElementSibling === frame : host.isConnected) return;
    // Moving the host would leave an open modal dialog stranded outside the top layer.
    if (element("settings").open) element("settings").close();
    if (frame) frame.before(host);
    else main.prepend(host);
    layoutKey = null;
  }

  function unmount() {
    if (frame) frame.style.marginRight = "";
    frame = null;
    layoutKey = null;
    if (element("settings").open) element("settings").close();
    host.remove();
  }

  function checkRoute() {
    if (!settingsReady) return;
    const pullRequest = pullRequestFromUrl(location.href);
    const nextRoute = pullRequest ? `${pullRequest.owner}/${pullRequest.repository}/${pullRequest.number}` : null;
    updateTheme();
    if (!nextRoute) {
      if (route) generation++;
      route = null;
      unmount();
      return;
    }
    const main = document.querySelector("main");
    if (!main) return;
    mount(main);
    if (nextRoute !== route) {
      route = nextRoute;
      selected = "withoutTestsAndConfig";
      filesOpen = false;
      overlayOpen = false;
      void load();
    }
    layoutIfChanged();
  }

  function setRailCollapsed(collapsed) {
    railCollapsed = collapsed;
    chrome.storage.local.set({ railCollapsed }).catch(() => {});
  }

  function expand() {
    if (fitted === "card") setRailCollapsed(false);
    else overlayOpen = true;
    layout();
    element("collapse").focus();
  }

  function collapse() {
    if (overlayOpen) overlayOpen = false;
    else setRailCollapsed(true);
    layout();
    element("expand").focus();
  }

  function applyPatterns(nextPatterns, config) {
    if (config) configPatterns = nextPatterns;
    else patterns = nextPatterns;
    element(config ? "config-patterns" : "patterns").value = nextPatterns.join("\n");
  }

  async function savePatterns(nextPatterns, config = false) {
    const feedback = element(config ? "feedback-config" : "feedback");
    try {
      patternMatcher(nextPatterns);
      await chrome.storage.local.set({ [config ? "configPatterns" : "testPatterns"]: nextPatterns });
      applyPatterns(nextPatterns, config);
      feedback.classList.remove("error");
      feedback.textContent = "Saved.";
      render();
    } catch (error) {
      feedback.classList.add("error");
      feedback.textContent = error.message;
    }
  }
  for (const { key, name } of categories) {
    element(`metric-${name}`).addEventListener("click", () => {
      const mode = host.dataset.mode;
      if (mode === "strip") filesOpen = !(filesOpen && selected === key);
      selected = key;
      if (mode === "rail") expand();
      else render();
    });
  }
  element("files-toggle").addEventListener("click", () => { filesOpen = !filesOpen; render(); });
  element("expand").addEventListener("click", expand);
  element("collapse").addEventListener("click", collapse);
  element("refresh").addEventListener("click", () => void load());
  element("settings-toggle").addEventListener("click", () => element("settings").showModal());
  element("settings-close").addEventListener("click", () => element("settings").close());
  element("save").addEventListener("click", () => void savePatterns(element("patterns").value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)));
  element("reset").addEventListener("click", () => void savePatterns([...defaultPatterns]));
  element("save-config").addEventListener("click", () => void savePatterns(element("config-patterns").value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean), true));
  element("reset-config").addEventListener("click", () => void savePatterns([...defaultConfigPatterns], true));
  host.addEventListener("keydown", (event) => { if (event.key === "Escape" && overlayOpen) collapse(); });
  document.addEventListener("click", (event) => { if (overlayOpen && !event.composedPath().includes(host)) { overlayOpen = false; layout(); } });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    for (const config of [false, true]) {
      const change = changes[config ? "configPatterns" : "testPatterns"];
      if (!change) continue;
      try {
        const nextPatterns = change.newValue ?? [...(config ? defaultConfigPatterns : defaultPatterns)];
        patternMatcher(nextPatterns);
        applyPatterns(nextPatterns, config);
      } catch { /* Keep the last valid settings if storage was edited externally. */ }
    }
    if (changes.railCollapsed) railCollapsed = changes.railCollapsed.newValue === true;
    if (host.isConnected) layout();
  });
  (async () => {
    try {
      const stored = await chrome.storage.local.get(["testPatterns", "configPatterns", "railCollapsed"]);
      railCollapsed = stored.railCollapsed === true;
      const upgraded = upgradeConfigPatterns(stored.configPatterns);
      if (upgraded !== stored.configPatterns) {
        stored.configPatterns = upgraded;
        // If saving fails, the same upgrade is applied again on the next load.
        chrome.storage.local.set({ configPatterns: upgraded }).catch(() => {});
      }
      for (const config of [false, true]) {
        const value = stored[config ? "configPatterns" : "testPatterns"];
        if (value === undefined) continue;
        try {
          patternMatcher(value);
          applyPatterns(value, config);
        } catch {
          const feedback = element(config ? "feedback-config" : "feedback");
          feedback.classList.add("error");
          feedback.textContent = "Saved patterns were invalid; using defaults.";
        }
      }
    } catch {
      element("feedback").classList.add("error");
      element("feedback").textContent = "Saved settings could not be read; using defaults.";
    }
    element("patterns").value = patterns.join("\n");
    element("config-patterns").value = configPatterns.join("\n");
    settingsReady = true;
    checkRoute();
  })();
  let resizeRequest = 0;
  let scrollRequest = 0;
  document.addEventListener("turbo:load", checkRoute);
  document.addEventListener("turbo:render", checkRoute);
  window.addEventListener("popstate", checkRoute);
  window.addEventListener("resize", () => {
    cancelAnimationFrame(resizeRequest);
    resizeRequest = requestAnimationFrame(() => { if (host.isConnected) layoutIfChanged(); });
  });
  window.addEventListener("scroll", () => {
    cancelAnimationFrame(scrollRequest);
    scrollRequest = requestAnimationFrame(place);
  }, { passive: true });
  // Covers GitHub's client-side navigation, replaced page containers, and theme changes.
  setInterval(checkRoute, 1000);
})();
