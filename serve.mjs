import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";

const root = resolve(process.argv[2] || "dist");
const port = Number(process.argv[3] || process.env.PORT || 3000);

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error(`Invalid port: ${process.argv[3] ?? process.env.PORT}`);
}
if (!existsSync(join(root, "index.html"))) {
  throw new Error(`Static directory is missing index.html: ${root}`);
}

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
  ".glb": "model/gltf-binary",
};

function fileFor(pathname) {
  const decoded = decodeURIComponent(pathname.split("?")[0]);
  const target = resolve(root, `.${normalize(decoded)}`);
  if (target !== root && !target.startsWith(root + sep)) return null;
  try {
    const info = statSync(target);
    if (info.isDirectory()) {
      const index = join(target, "index.html");
      return existsSync(index) ? index : null;
    }
    if (info.isFile()) return target;
  } catch {
    return null;
  }
  return null;
}

const server = createServer((request, response) => {
  const url = new URL(request.url || "/", "http://localhost");
  let file = fileFor(url.pathname);

  if (!file) {
    file = join(root, "index.html");
  }

  const extension = extname(file).toLowerCase();
  response.writeHead(200, {
    "Content-Type": types[extension] || "application/octet-stream",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  createReadStream(file)
    .on("error", () => {
      if (!response.headersSent) response.writeHead(500);
      response.end("Internal server error");
    })
    .pipe(response);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`[serve] ${root} listening on http://0.0.0.0:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
