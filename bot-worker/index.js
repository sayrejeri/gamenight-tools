import { existsSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env");

if (existsSync(envPath)) {
  try {
    process.loadEnvFile(envPath);
    console.log(`Loaded worker environment from ${envPath}.`);
  } catch (error) {
    console.error("Could not load Four Seasons .env file:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

await import("./index.mjs");
