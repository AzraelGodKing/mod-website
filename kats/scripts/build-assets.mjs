import { cpSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const katsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const siteRoot = path.resolve(katsRoot, "..");
const source = process.env.KATS_RICS ?? path.resolve(siteRoot, "../KatsRics/docs");
const assets = path.join(katsRoot, "assets");

rmSync(assets, { recursive: true, force: true });
mkdirSync(assets, { recursive: true });
cpSync(source, assets, { recursive: true });
cpSync(path.join(katsRoot, "portal", "upload.html"), path.join(assets, "upload.html"));
cpSync(
  path.join(siteRoot, "node_modules", "node-unrar-js", "esm", "js", "unrar.wasm"),
  path.join(assets, "unrar.wasm"),
);

await esbuild.build({
  entryPoints: [path.join(katsRoot, "portal", "main.js")],
  outfile: path.join(assets, "portal.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  logLevel: "info",
});
