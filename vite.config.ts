import { execFileSync } from "node:child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function localCommitSha(): string {
  try {
    return (
      execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim() || "dev"
    );
  } catch {
    return "dev";
  }
}

const commitSha = (process.env.GITHUB_SHA || localCommitSha()).slice(0, 7);

export default defineConfig({
  base: "/",
  define: {
    "import.meta.env.BUILD_INFO": JSON.stringify({
      commitSha,
      builtAt: new Date().toISOString(),
    }),
  },
  plugins: [react()],
});
