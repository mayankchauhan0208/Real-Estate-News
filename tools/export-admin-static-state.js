import fs from "node:fs/promises";
import path from "node:path";
import { getDashboardState } from "../src/admin-server.js";

const outputPath = path.resolve("admin", "static-state.json");
const state = await getDashboardState();
state.staticExport = true;
state.generatedFor = "github-pages";
await fs.writeFile(outputPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
console.log(`Wrote ${outputPath}`);