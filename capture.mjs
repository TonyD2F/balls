import { createRequire } from "node:module";
import { mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const url = process.env.CAPTURE_URL;
const outputDir = process.env.CAPTURE_DIR;

if (!url || !outputDir) {
  console.error("[capture] CAPTURE_URL and CAPTURE_DIR are required");
  process.exit(1);
}

let parsed;
try {
  parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("unsupported protocol");
} catch (error) {
  console.error(`[capture] invalid CAPTURE_URL: ${error.message}`);
  process.exit(1);
}

const runtime = join(homedir(), ".local/share/omgithub-playwright");
const require = createRequire(join(runtime, "package.json"));
const { chromium } = require("playwright");
const config = JSON.parse(
  readFileSync(join(runtime, process.platform === "darwin" ? "metal.json" : "linux.json"), "utf8"),
);

if (process.platform === "linux") {
  process.env.DISPLAY ||= `:${readFileSync(join(runtime, "display"), "utf8").trim()}`;
}

mkdirSync(outputDir, { recursive: true });

const timings = [];
async function step(label, action) {
  const started = performance.now();
  try {
    return await action();
  } finally {
    const elapsed = Math.round(performance.now() - started);
    timings.push({ label, elapsed });
    console.log(`[capture] ${label}: ${elapsed}ms`);
  }
}

function transientError(message, cause) {
  const error = new Error(message);
  error.exitCode = 75;
  error.cause = cause;
  return error;
}

function isTransient(error) {
  return /net::|ERR_|ECONN|ENOTFOUND|EAI_AGAIN|socket hang up|Timeout|timed out|Target closed|browser has disconnected|Protocol error|Navigation failed/i.test(
    String(error?.message || error),
  );
}

function defect(message) {
  const error = new Error(message);
  error.exitCode = 1;
  return error;
}

async function canvasHasPixels(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    if (!canvas) return { ok: false, reason: "no canvas element" };
    if (!canvas.width || !canvas.height) return { ok: false, reason: "canvas has zero size" };

    const context = canvas.getContext("2d");
    if (!context) return { ok: true, reason: "non-2d canvas" };

    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let painted = 0;
    for (let i = 3; i < data.length; i += 4 * 61) {
      if (data[i] > 8) painted += 1;
      if (painted > 40) return { ok: true, painted };
    }
    return { ok: false, reason: `only ${painted} painted samples`, painted };
  });
}

const viewports = [
  { name: "desktop", width: 1440, height: 900, isMobile: false },
  { name: "mobile", width: 390, height: 844, isMobile: true },
];

let browser;
let exitCode = 0;
const defects = [];

try {
  browser = await step("launch browser", () =>
    chromium.launch({ ...config.browser.launchOptions, timeout: 30000 }),
  ).catch((error) => {
    throw transientError(`browser launch failed: ${error.message}`, error);
  });

  for (const viewport of viewports) {
    const page = await step(`new ${viewport.name} page`, () =>
      browser.newPage({
        viewport: { width: viewport.width, height: viewport.height },
        isMobile: viewport.isMobile,
        hasTouch: viewport.isMobile,
        deviceScaleFactor: 1,
      }),
    ).catch((error) => {
      throw transientError(`could not create ${viewport.name} page: ${error.message}`, error);
    });

    page.setDefaultTimeout(30000);
    page.setDefaultNavigationTimeout(45000);

    const pageErrors = [];
    page.on("pageerror", (error) => {
      console.error(`[capture] ${viewport.name} page error: ${error.message}`);
      pageErrors.push(error.message);
    });
    page.on("console", (message) => {
      if (message.type() === "error") {
        console.error(`[capture] ${viewport.name} console error: ${message.text()}`);
        pageErrors.push(message.text());
      }
    });
    page.on("response", (response) => {
      const status = response.status();
      if (status >= 400 && response.url().startsWith(parsed.origin)) {
        pageErrors.push(`HTTP ${status}: ${response.url()}`);
      }
    });

    try {
      let response;
      try {
        response = await step(`navigate ${viewport.name}`, () =>
          page.goto(url, { waitUntil: "load", timeout: 45000 }),
        );
      } catch (error) {
        throw transientError(`navigation failed for ${viewport.name}: ${error.message}`, error);
      }

      if (!response) throw transientError(`no response while loading ${viewport.name}`);
      const status = response.status();
      if (!response.ok()) {
        const temporary = status === 408 || status === 429 || status >= 500;
        const error = new Error(`HTTP ${status} loading ${url}`);
        error.exitCode = temporary ? 75 : 1;
        throw error;
      }

      try {
        await step(`wait for app ready (${viewport.name})`, () =>
          page.waitForFunction(() => window.__APP_READY__ === true, null, { timeout: 30000 }),
        );
      } catch (error) {
        throw defect(`app never signalled __APP_READY__ (${viewport.name}): ${error.message}`);
      }

      await step(`wait for fonts (${viewport.name})`, () =>
        page.evaluate(() => document.fonts.ready.then(() => true)).catch(() => undefined),
      );

      const render = await step(`verify rendered canvas (${viewport.name})`, () =>
        canvasHasPixels(page),
      );
      if (!render.ok) throw defect(`canvas did not render (${viewport.name}): ${render.reason}`);

      await page.waitForTimeout(600);

      const screenshot = join(outputDir, `final-${viewport.name}.png`);
      try {
        await step(`screenshot ${viewport.name}`, () =>
          page.screenshot({ path: screenshot, type: "png", timeout: 30000 }),
        );
      } catch (error) {
        throw transientError(`screenshot failed for ${viewport.name}: ${error.message}`, error);
      }
      console.log(`[capture] wrote ${screenshot}`);

      if (pageErrors.length) {
        defects.push(`${viewport.name}: ${pageErrors.join("; ")}`);
      }
    } finally {
      await page.close().catch(() => undefined);
    }
  }
} catch (error) {
  console.error(`[capture] ${error.message}`);
  if (error.cause) console.error(error.cause);
  exitCode = error.exitCode || (isTransient(error) ? 75 : 1);
} finally {
  if (browser) {
    await step("close browser", () => browser.close()).catch((error) => {
      console.error(`[capture] browser close failed: ${error.message}`);
      exitCode ||= 75;
    });
  }

  const total = timings.reduce((sum, item) => sum + item.elapsed, 0);
  console.log(`[capture] total measured time: ${total}ms`);

  if (defects.length && !exitCode) {
    console.error(`[capture] rendering defects: ${defects.join(" | ")}`);
    exitCode = 1;
  }
}

process.exitCode = exitCode;
