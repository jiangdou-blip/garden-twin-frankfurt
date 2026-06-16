import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 5174);
const types = {
  ".html": "text/html;charset=utf-8",
  ".js": "text/javascript;charset=utf-8",
  ".css": "text/css;charset=utf-8",
  ".json": "application/json;charset=utf-8",
  ".webmanifest": "application/manifest+json;charset=utf-8",
  ".png": "image/png",
  ".csv": "text/csv;charset=utf-8"
};

const server = http.createServer((request, response) => {
  let pathname = decodeURIComponent(request.url.split("?")[0]);
  if (pathname === "/" || pathname === "") pathname = "/index.html";
  const file = path.normalize(path.join(root, pathname));

  if (!file.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(file, (error, data) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    response.writeHead(200, {
      "Content-Type": types[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "Pragma": "no-cache",
      "Expires": "0"
    });
    response.end(data);
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Garden Twin is running at http://127.0.0.1:${port}`);
});
