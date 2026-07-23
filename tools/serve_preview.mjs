import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";

const port = Number.parseInt(process.env.PREVIEW_PORT || "4173", 10);
const root = path.resolve("preview");
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

function isInsideRoot(filePath) {
  const relative = path.relative(root, filePath);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
}

const server = http.createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url || "/", `http://127.0.0.1:${port}`);
    let filePath = requestUrl.pathname === "/"
      ? path.join(root, "index.html")
      : path.resolve(root, `.${requestUrl.pathname}`);

    if (requestUrl.pathname === "/data/feed-preview.json") {
      filePath = path.resolve("data/feed-preview.json");
    }

    if (requestUrl.pathname !== "/data/feed-preview.json" && !isInsideRoot(filePath)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    const content = await fs.readFile(filePath);
    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    response.end(content);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Feed preview running at http://127.0.0.1:${port}`);
});
