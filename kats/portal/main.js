import { createExtractorFromData } from "node-unrar-js";
import { buildCatalog, diffCatalog, hasChanges } from "./catalog.mjs";

const form = document.querySelector("#upload-form");
const fields = document.querySelector("#upload-fields");
const status = document.querySelector("#status");
const fileName = document.querySelector("#file-name");
const exportInput = document.querySelector("#export");
const current = document.querySelector("#current");
const rollback = document.querySelector("#rollback");
const confirmBox = document.querySelector("#confirm");
const preview = document.querySelector("#preview");
const confirmYes = document.querySelector("#confirm-yes");
const confirmNo = document.querySelector("#confirm-no");

/** Shows what the upload would change and waits for File it or Cancel. */
function askToFile(text) {
  preview.textContent = text;
  confirmBox.hidden = false;
  confirmYes.focus();
  return new Promise((resolve) => {
    const done = (answer) => {
      confirmBox.hidden = true;
      confirmYes.removeEventListener("click", yes);
      confirmNo.removeEventListener("click", no);
      resolve(answer);
    };
    const yes = () => done(true);
    const no = () => done(false);
    confirmYes.addEventListener("click", yes);
    confirmNo.addEventListener("click", no);
  });
}

function detail(changes) {
  const lines = [];
  for (const [name, diff] of Object.entries(changes)) {
    if (!diff) continue;
    const show = (title, list, fmt) => {
      if (!list.total) return;
      const items = list.list.slice(0, 8).map(fmt).join(", ");
      lines.push(`  ${name} ${title}: ${items}${list.total > 8 ? ` and ${list.total - 8} more` : ""}`);
    };
    show("new", diff.added, (x) => x);
    show("removed", diff.removed, (x) => x);
    show("price", diff.prices, (x) => `${x.name} ${x.from}→${x.to}`);
    show("turned on", diff.enabled, (x) => x);
    show("turned off", diff.disabled, (x) => x);
  }
  return lines.join("\n");
}

exportInput.addEventListener("change", () => {
  const names = [...exportInput.files].map((file) => file.name);
  fileName.textContent = names.length ? names.join(", ") : "No file selected";
});

function setStatus(message) {
  status.textContent = message;
}

function busy(on) {
  fields.disabled = on;
  rollback.disabled = on || rollback.dataset.available !== "true";
}

function when(iso) {
  if (!iso) return "Unknown";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString();
}

async function showCurrent() {
  try {
    const response = await fetch("/data/meta.json", { cache: "no-store" });
    const meta = response.ok ? await response.json() : null;
    current.textContent = meta?.updatedAt ? `Current catalog filed ${when(meta.updatedAt)}.` : "No revision has been filed here yet.";
    rollback.dataset.available = meta?.canRollBack ? "true" : "false";
    rollback.title = meta?.previousUpdatedAt ? `Go back to the revision filed ${when(meta.previousUpdatedAt)}` : "";
  } catch {
    current.textContent = "The current catalog could not be read.";
    rollback.dataset.available = "false";
  }
  rollback.disabled = rollback.dataset.available !== "true";
}

async function api(password, method, path, body) {
  const response = await fetch(path, {
    method,
    headers: { authorization: `Bearer ${password}`, "content-type": "application/json" },
    body,
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`${detail || "The request failed."} (${response.status})`);
  }
  return response.json();
}

async function readEntries(files) {
  const entries = [];
  const decoder = new TextDecoder("utf-8");
  for (const file of files) {
    if (/\.json$/i.test(file.name)) {
      entries.push({ path: file.name, text: await file.text() });
      continue;
    }
    const extractor = await createExtractorFromData({ data: await file.arrayBuffer() });
    const extracted = extractor.extract();
    for (const item of extracted.files) {
      if (item.fileHeader.flags.directory || !item.extraction) continue;
      entries.push({ path: item.fileHeader.name, text: decoder.decode(item.extraction) });
    }
  }
  return entries;
}

async function changesFor(files) {
  const changes = {};
  for (const [name, json] of Object.entries(files)) {
    try {
      const response = await fetch(`/data/${name}.json`, { cache: "no-store" });
      const before = response.ok ? await response.json() : null;
      changes[name] = diffCatalog(name, before, JSON.parse(json));
    } catch {
      changes[name] = null;
    }
  }
  return changes;
}

function summary(counts, changes) {
  return Object.entries(counts)
    .map(([name, count]) => {
      const diff = changes[name];
      if (!diff) return `${name} ${count}`;
      if (!hasChanges(diff)) return `${name} ${count} (no changes)`;
      const parts = [
        diff.added.total && `+${diff.added.total}`,
        diff.removed.total && `-${diff.removed.total}`,
        diff.prices.total && `${diff.prices.total} price`,
      ].filter(Boolean);
      return `${name} ${count} (${parts.join(", ") || "flags changed"})`;
    })
    .join("\n");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = String(new FormData(form).get("password") ?? "");
  const files = [...exportInput.files];
  if (!password) {
    setStatus("Clearance was not entered.");
    return;
  }
  if (!files.length) {
    setStatus("No export is attached to this revision.");
    return;
  }

  busy(true);
  try {
    setStatus("Revision in progress. The export is under review.");
    const built = buildCatalog(await readEntries(files));
    const names = Object.keys(built.files);
    if (names.length === 0) {
      setStatus("The export did not contain store, trait, race, incident, weather, command, gene, or backstory data.");
      return;
    }
    setStatus("Checking clearance.");
    const { id } = await api(password, "POST", "/api/revisions");
    setStatus("Comparing against the current catalog.");
    const changes = await changesFor(built.files);
    const more = detail(changes);
    setStatus("Waiting for review. Nothing has been filed yet.");
    const go = await askToFile(`${summary(built.counts, changes)}${more ? `\n\n${more}` : ""}`);
    if (!go) {
      setStatus("Revision cancelled. The live catalog was not changed.");
      return;
    }
    setStatus("Filing the revision.");
    for (const name of names) {
      setStatus(`Filing ${name}.`);
      await api(password, "PUT", `/api/revisions/${id}/${name}`, built.files[name]);
    }
    await api(
      password,
      "POST",
      `/api/revisions/${id}/commit`,
      JSON.stringify({ counts: built.counts, changes, geneRates: built.geneRates }),
    );
    const withheld = built.skipped.length ? "\nPrivate records were not filed." : "";
    setStatus(`FILE STATUS: Active. Revision filed.\n${summary(built.counts, changes)}${withheld}`);
    await showCurrent();
  } catch (error) {
    const message = error instanceof Error ? error.message : "The upload failed.";
    setStatus(`${message}\nThe live catalog was not changed.`);
  } finally {
    busy(false);
  }
});

rollback.addEventListener("click", async () => {
  const password = String(new FormData(form).get("password") ?? "");
  if (!password) {
    setStatus("Enter clearance before restoring the previous revision.");
    return;
  }
  if (!window.confirm("Restore the previous revision? The current one will be withdrawn.")) return;
  busy(true);
  try {
    const meta = await api(password, "POST", "/api/rollback");
    setStatus(`Previous revision restored. Filed ${when(meta.updatedAt)}.`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "The restore failed.");
  } finally {
    await showCurrent();
    busy(false);
  }
});

showCurrent();
