import { createExtractorFromData } from "node-unrar-js";
import { buildCatalog } from "./catalog.mjs";

const form = document.querySelector("#upload-form");
const status = document.querySelector("#status");

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
  const rar = form.querySelector("#rar").files[0];
  const gameFiles = [...form.querySelector("#game-files").files];
  if (!password) {
    setStatus("Enter the upload password.");
    return;
  }
  if (!rar && gameFiles.length === 0) {
    setStatus("Choose a CAP export, or the gene and backstory files.");
    return;
  }

  const entries = [];
  try {
    if (rar) {
      setStatus("Reading the export…");
      const bytes = await rar.arrayBuffer();
      const extractor = await createExtractorFromData({ data: bytes });
      const extracted = extractor.extract();
      const decoder = new TextDecoder("utf-8");
      for (const file of extracted.files) {
        if (file.fileHeader.flags.directory || !file.extraction) continue;
        entries.push({ path: file.fileHeader.name, text: decoder.decode(file.extraction) });
      }
    }
    for (const file of gameFiles) {
      entries.push({ path: file.name, text: await file.text() });
    }
    const built = buildCatalog(entries);
    const names = Object.keys(built.files);
    if (names.length === 0) {
      setStatus("That upload did not contain store, trait, race, incident, weather, command, gene, or backstory data.");
      return;
    }
    setStatus("Publishing the catalog…");
    await publish(String(password), built.files);
    const skipped = built.skipped.length ? ` Left out: ${built.skipped.join(", ")}.` : "";
    setStatus(`Updated ${countLine(built.counts)}.${skipped}`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "The upload failed.");
  }
});
