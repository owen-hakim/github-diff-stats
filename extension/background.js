// Chrome runs this file as a service worker. Firefox has no extension service workers and loads
// the manifest's background scripts in order instead.
if (typeof importScripts === "function") importScripts("rust-tests.js", "stats.js");

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "load-pr-diff") return;
  // The sender's actual PR URL is the authority, never a caller-supplied fetch URL.
  const pullRequest = GitHubDiffStats.pullRequestFromUrl(sender.url);
  if (!pullRequest || sender.id !== chrome.runtime.id) {
    sendResponse({ error: "Open a GitHub pull request to load its diff." });
    return;
  }
  GitHubDiffStats.fetchDiff(pullRequest).then(sendResponse).catch((error) => {
    sendResponse({ error: GitHubDiffStats.errorMessage(error) });
  });
  return true;
});
