import { execFileSync } from "node:child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function localCommitSha(): string {
  try {
    return (
      execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim() || "dev"
    );
  } catch {
    return "dev";
  }
}

const commitSha = (process.env.GITHUB_SHA || localCommitSha()).slice(0, 7);

export default defineConfig({
  base: "/cornix-bonsai/",
  define: {
    __BUILD_INFO__: JSON.stringify({
      commitSha,
      builtAt: new Date().toISOString(),
    }),
  },
  plugins: [react()],
});
