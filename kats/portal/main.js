import { createExtractorFromData } from "node-unrar-js";
import { buildCatalog } from "./catalog.mjs";

const form = document.querySelector("#upload-form");
const status = document.querySelector("#status");
const fileName = document.querySelector("#file-name");
const rarInput = document.querySelector("#rar");

rarInput.addEventListener("change", () => {
  fileName.textContent = rarInput.files[0]?.name ?? "No file selected";
});

function setStatus(message) {
  status.textContent = message;
}

async function publish(password, files) {
  const names = Object.keys(files);
  for (const name of names) {
    const response = await fetch(`/api/catalog/${name}`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${password}`,
        "content-type": "application/json",
      },
      body: files[name],
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`${name} was not saved (${response.status}). ${detail}`);
    }
  }
}

function countLine(counts) {
  return Object.entries(counts)
    .map(([name, count]) => `${name} ${count}`)
    .join(", ");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = new FormData(form).get("password");
  const rar = rarInput.files[0];
  if (!password) {
    setStatus("Clearance was not entered.");
    return;
  }
  if (!rar) {
    setStatus("No export is attached to this revision.");
    return;
  }

  const entries = [];
  try {
    setStatus("Revision in progress. The export is under review.");
    const bytes = await rar.arrayBuffer();
    const extractor = await createExtractorFromData({ data: bytes });
    const extracted = extractor.extract();
    const decoder = new TextDecoder("utf-8");
    for (const file of extracted.files) {
      if (file.fileHeader.flags.directory || !file.extraction) continue;
      entries.push({ path: file.fileHeader.name, text: decoder.decode(file.extraction) });
    }
    const built = buildCatalog(entries);
    const names = Object.keys(built.files);
    if (names.length === 0) {
      setStatus("The export did not contain store, trait, race, incident, weather, or command data.");
      return;
    }
    setStatus("Filing the revision.");
    await publish(String(password), built.files);
    const withheld = built.skipped.length ? " Private records were not filed." : "";
    setStatus(`FILE STATUS: Active. Revision filed. ${countLine(built.counts)}.${withheld}`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "The upload failed.");
  }
});
