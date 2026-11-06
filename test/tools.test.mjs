import assert from "node:assert/strict";
import test from "node:test";
import { TOOLS, fetchLatestRelease, parseToolPath, releaseFiles, toolsForGame } from "../src/downloads/tools.mjs";

const release = {
  tag_name: "v0.4.0",
  published_at: "2026-10-28T17:52:10Z",
  html_url: "https://github.com/AzraelGodKing/Survivor-s-Toolkit/releases/tag/v0.4.0",
  assets: [
    { name: "RELEASES", browser_download_url: "https://example.test/RELEASES", size: 100 },
    { name: "SurvivorsToolkit-0.4.0-Setup.exe", browser_download_url: "https://example.test/setup.exe", size: 83308477 },
    { name: "SurvivorsToolkit-0.4.0-win-x64.exe", browser_download_url: "https://example.test/x64.exe", size: 182604589 },
    { name: "SurvivorsToolkit-0.4.0-win-x64-framework-dependent.zip", browser_download_url: "https://example.test/fd.zip", size: 1502913 },
  ],
};

test("each game page gets its own tool", () => {
  assert.deepEqual(toolsForGame("rimworld").map((tool) => tool.slug), ["modwright"]);
  assert.deepEqual(toolsForGame("7-days-to-die").map((tool) => tool.slug), ["survivors-toolkit"]);
  assert.deepEqual(toolsForGame("sun-haven"), []);
});

test("tool paths pick the installer unless exe or zip is asked for", () => {
  assert.equal(parseToolPath("/download/tools/modwright").variant, "setup");
  assert.equal(parseToolPath("/download/tools/modwright/").variant, "setup");
  assert.equal(parseToolPath("/download/tools/survivors-toolkit/zip").variant, "zip");
  assert.equal(parseToolPath("/download/tools/survivors-toolkit/exe").tool.repo, "AzraelGodKing/Survivor-s-Toolkit");
  assert.equal(parseToolPath("/download/tools/nope"), null);
  assert.equal(parseToolPath("/download/tools/modwright/dmg"), null);
});

test("a release's three files are matched by name, not by order", () => {
  const files = releaseFiles(release);
  assert.equal(files.version, "0.4.0");
  assert.equal(files.files.setup.url, "https://example.test/setup.exe");
  assert.equal(files.files.exe.url, "https://example.test/x64.exe");
  assert.equal(files.files.zip.url, "https://example.test/fd.zip");
  assert.equal(files.files.zip.bytes, 1502913);
});

test("ModWright's SteamCmdHelper file names still match", () => {
  const files = releaseFiles({
    tag_name: "v2.1.1",
    assets: [
      { name: "SteamCmdHelper-2.1.1-Setup.exe", browser_download_url: "a" },
      { name: "SteamCmdHelper-2.1.1-win-x64.exe", browser_download_url: "b" },
      { name: "SteamCmdHelper-2.1.1-win-x64-framework-dependent.zip", browser_download_url: "c" },
      { name: "AzraelGodKing.SteamCMDHelper-2.1.1-full.nupkg", browser_download_url: "d" },
    ],
  });
  assert.deepEqual(Object.fromEntries(Object.entries(files.files).map(([key, file]) => [key, file.url])), { setup: "a", exe: "b", zip: "c" });
});

test("a failed GitHub read gives null instead of throwing", async () => {
  const tool = TOOLS[0];
  assert.equal(await fetchLatestRelease(tool, async () => new Response("rate limited", { status: 403 })), null);
  assert.equal(await fetchLatestRelease(tool, async () => { throw new Error("offline"); }), null);
  const ok = await fetchLatestRelease(tool, async (url) => {
    assert.equal(url, "https://api.github.com/repos/AzraelGodKing/ModWright/releases/latest");
    return Response.json(release);
  });
  assert.equal(ok.version, "0.4.0");
});

test("tool counts come from the site's clicks, with Survivor's Toolkit's test click taken off", async () => {
  const { toolCounts } = await import("../src/downloads/tools.mjs");
  assert.equal(toolCounts(null), null);
  assert.deepEqual(toolCounts({ "tools/modwright": 12, "tools/survivors-toolkit": 5, "rimworld/strata": 99 }), {
    "tools/modwright": { downloads: 12 },
    "tools/survivors-toolkit": { downloads: 4 },
  });
  assert.deepEqual(toolCounts({}), { "tools/modwright": { downloads: 0 }, "tools/survivors-toolkit": { downloads: 0 } });
});

test("GitHub counts add up the installer, exe and zip of every release", async () => {
  const { githubDownloads } = await import("../src/downloads/tools.mjs");
  const counts = githubDownloads([
    {
      tag_name: "v2.1.1",
      assets: [
        { name: "SteamCmdHelper-2.1.1-Setup.exe", download_count: 3 },
        { name: "SteamCmdHelper-2.1.1-win-x64.exe", download_count: 1 },
        { name: "SteamCmdHelper-2.1.1-win-x64-framework-dependent.zip", download_count: 1 },
        { name: "AzraelGodKing.SteamCMDHelper-2.1.1-full.nupkg", download_count: 40 },
        { name: "SHA256SUMS.txt", download_count: 1 },
      ],
    },
    { tag_name: "v2.1.0", assets: [{ name: "SteamCmdHelper-2.1.0-Setup.exe", download_count: 7 }] },
    { tag_name: "v9.9.9", draft: true, assets: [{ name: "x-Setup.exe", download_count: 5 }] },
  ]);
  assert.deepEqual(counts, { total: 12, versions: { "2.1.1": 5, "2.1.0": 7 } });
  assert.equal(githubDownloads(null), null);
});

test("site clicks for a tool are split by version, newest first", async () => {
  const { siteVersions } = await import("../src/downloads/tools.mjs");
  const rows = [
    { key: "tools/modwright", version: "2.1.0", count: 4 },
    { key: "tools/modwright", version: "2.1.1", count: 9 },
    { key: "tools/modwright", version: "2.0.10", count: 2 },
    { key: "tools/survivors-toolkit", version: "0.4.0", count: 20 },
  ];
  assert.deepEqual(siteVersions(TOOLS[0], rows), [
    { version: "2.1.1", count: 9 },
    { version: "2.1.0", count: 4 },
    { version: "2.0.10", count: 2 },
  ]);
  assert.equal(siteVersions(TOOLS[0], null), null);
});
