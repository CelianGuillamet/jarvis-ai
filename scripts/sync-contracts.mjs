import { readFile, mkdir, writeFile } from "node:fs/promises";
const root = new URL("../", import.meta.url);
const source = await readFile(new URL("contracts/v1.ts", root), "utf8");
const generated =
  "// Generated from contracts/v1.ts. Do not edit this copy.\n" + source;
for (const path of [
  "api/src/contracts/v1.ts",
  "web/src/core/contracts/v1.ts",
]) {
  const target = new URL(path, root);
  if (process.argv.includes("--check")) {
    if ((await readFile(target, "utf8").catch(() => "")) !== generated)
      throw new Error(
        `Contract drift: ${path}. Run node scripts/sync-contracts.mjs.`,
      );
  } else {
    await mkdir(new URL("./", target), { recursive: true });
    await writeFile(target, generated);
  }
}
