// poi.azraelsmods.com: the world map under the POI pins. The POI Registry mod uploads the
// world's own biomes.png and splat3.png (roads) once per world; the page draws them under
// the POIs. No Worker APIs here, so test/poi.test.mjs can run it in Node.

export const MAP_LAYERS = ["biomes", "roads"];
// KV keeps values up to 25 MiB.
export const MAX_MAP_BYTES = 24 * 1024 * 1024;
// 7 Days worlds go up to 16k; anything past this is not a world map.
const MAX_WORLD_SIZE = 32_768;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** The width and height from a PNG's IHDR chunk, or null when the bytes are not a PNG. */
export function pngSize(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 24) return null;
  if (PNG_SIGNATURE.some((byte, i) => bytes[i] !== byte)) return null;
  // IHDR is always the first chunk: length (4) + "IHDR" (4), then width and height.
  if (String.fromCharCode(...bytes.slice(12, 16)) !== "IHDR") return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  return width > 0 && height > 0 ? { width, height } : null;
}

export async function hashBytes(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function emptyMapMeta() {
  return { world: null, size: null, layers: {} };
}

/**
 * Checks an uploaded layer. `size` is the world size in metres from the query (the mod reads
 * it from map_info.xml); without it the image width is used, since these images are 1 px per metre.
 * Returns { ok: true, layer, world, size, image } or { ok: false, status, error }.
 */
export function checkMapUpload(layer, params, bytes) {
  if (!MAP_LAYERS.includes(layer)) return { ok: false, status: 404, error: `Layer must be ${MAP_LAYERS.join(" or ")}` };
  if (bytes.byteLength > MAX_MAP_BYTES) return { ok: false, status: 413, error: `The image is over ${MAX_MAP_BYTES / 1024 / 1024} MB` };
  const image = pngSize(bytes);
  if (!image) return { ok: false, status: 400, error: "Send a PNG" };
  const world = (params.get("world") ?? "").trim().slice(0, 100) || null;
  const raw = params.get("size");
  const size = raw === null || raw === "" ? Math.max(image.width, image.height) : Number(raw);
  if (!Number.isInteger(size) || size < 256 || size > MAX_WORLD_SIZE) return { ok: false, status: 400, error: "size must be the world size in metres" };
  return { ok: true, layer, world, size, image };
}

/**
 * The stored map description after one layer is replaced. A layer from another world (or a
 * different size) is dropped, so a new world never shows the old world's roads.
 */
export function nextMapMeta(meta, upload, hash, bytes, now = new Date()) {
  const current = { ...emptyMapMeta(), ...(meta ?? {}) };
  const sameWorld = current.world === upload.world && current.size === upload.size;
  const layers = sameWorld ? { ...current.layers } : {};
  layers[upload.layer] = {
    hash,
    bytes,
    width: upload.image.width,
    height: upload.image.height,
    uploadedAt: now.toISOString(),
  };
  return { world: upload.world, size: upload.size, layers };
}

/** True when this exact image is already stored for this world. */
export function sameMapLayer(meta, upload, hash) {
  return Boolean(meta && meta.world === upload.world && meta.size === upload.size && meta.layers?.[upload.layer]?.hash === hash);
}

/** What the page gets in GET /api/poi: null until a layer exists. */
export function publicMap(meta) {
  if (!meta || !meta.size || !Object.keys(meta.layers ?? {}).length) return null;
  const layers = {};
  for (const name of MAP_LAYERS) {
    const layer = meta.layers[name];
    if (layer) layers[name] = { hash: layer.hash.slice(0, 16), width: layer.width, height: layer.height };
  }
  return { world: meta.world, size: meta.size, layers };
}
