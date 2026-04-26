const path = require("node:path");
const { spawn } = require("node:child_process");

const guardPath = path.join(__dirname, "next-fetch-guard.cjs");
const nextBinPath = require.resolve("next/dist/bin/next");

const child = spawn(
  process.execPath,
  ["-r", guardPath, nextBinPath, "dev", ...process.argv.slice(2)],
  {
    stdio: "inherit",
    env: process.env,
  },
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
