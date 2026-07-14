import { copyFile, cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createManifest } from "./build-manifest.mjs";

const root = process.cwd();
const dist = path.join(root, "dist");

if (path.resolve(dist) === path.resolve(root)) {
  throw new Error("Refusing to build into the repository root.");
}

await rm(dist, { recursive: true, force: true });
await mkdir(path.join(dist, "assets"), { recursive: true });
await mkdir(path.join(dist, "data"), { recursive: true });

const manifest = await createManifest(root);

await writeFile(
  path.join(dist, "data", "books.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);

await copyFile(path.join(root, "index.html"), path.join(dist, "index.html"));
await copyFile(path.join(root, "_headers"), path.join(dist, "_headers"));
await cp(path.join(root, "assets"), path.join(dist, "assets"), { recursive: true });

for (const book of manifest.books) {
  await copyFile(path.join(root, book.file), path.join(dist, book.file));
}

console.log(`Built dist with ${manifest.books.length} books.`);
