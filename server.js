const { createServer } = require("node:http");
const { parse } = require("node:url");
const next = require("next");

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = Number.parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    createServer(async (request, response) => {
      try {
        const parsedUrl = parse(request.url || "/", true);
        await handle(request, response, parsedUrl);
      } catch (error) {
        console.error("Unhandled request error", error);
        response.statusCode = 500;
        response.end("Internal server error");
      }
    })
      .once("error", (error) => {
        console.error("Server startup error", error);
        process.exit(1);
      })
      .listen(port, hostname, () => {
        console.log(`Game Night Tools ready on http://${hostname}:${port}`);
      });
  })
  .catch((error) => {
    console.error("Next.js failed to prepare", error);
    process.exit(1);
  });
