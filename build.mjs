import { cp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = dirname(fileURLToPath(import.meta.url));
const sourceDir = join(projectDir, "src");
const outputDir = join(projectDir, "dist");

const started = performance.now();

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
await cp(sourceDir, outputDir, { recursive: true });

const index = await stat(join(outputDir, "index.html"));
if (!index.isFile()) {
  throw new Error("Build did not produce dist/index.html");
}

await writeFile(
  join(outputDir, "build.json"),
  `${JSON.stringify(
    {
      project: "balls",
      builtAt: new Date().toISOString(),
      files: ["index.html", "styles.css", "main.js"],
    },
    null,
    2,
  )}\n`,
);

const elapsed = Math.round(performance.now() - started);
console.log(`[build] dist ready at ${resolve(outputDir)} (${elapsed}ms)`);
