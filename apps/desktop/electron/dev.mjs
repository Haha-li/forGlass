import { spawn } from "node:child_process";
import { request } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const devServerUrl = "http://127.0.0.1:5173";

function childEnv(extra = {}) {
  return Object.fromEntries(
    Object.entries({
      ...process.env,
      ...extra
    }).filter(([key, value]) => !key.startsWith("=") && value !== undefined)
  );
}

function spawnCommand(command, extraEnv = {}) {
  return spawn(command, {
    cwd: projectRoot,
    stdio: "inherit",
    env: childEnv(extraEnv),
    shell: true
  });
}

function waitForServer(url, retries = 40) {
  return new Promise((resolve, reject) => {
    const attempt = (remaining) => {
      const req = request(url, { method: "GET" }, () => {
        resolve();
      });

      req.on("error", () => {
        if (remaining <= 0) {
          reject(new Error(`Dev server did not start: ${url}`));
          return;
        }

        setTimeout(() => attempt(remaining - 1), 500);
      });

      req.end();
    };

    attempt(retries);
  });
}

const vite = spawnCommand("npx vite --host 127.0.0.1 --port 5173");

let electron = null;

waitForServer(devServerUrl)
  .then(() => {
    electron = spawnCommand("npx electron .", {
      VITE_DEV_SERVER_URL: devServerUrl
    });

    electron.on("exit", (code) => {
      vite.kill();
      process.exit(code ?? 0);
    });
  })
  .catch((error) => {
    console.error(error.message);
    vite.kill();
    process.exit(1);
  });

process.on("SIGINT", () => {
  electron?.kill();
  vite.kill();
  process.exit(0);
});
