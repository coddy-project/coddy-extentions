import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

const ui = resolve(process.env.CODDY_AGENT_UI || "../coddy-agent/external/ui");

export default defineConfig({
  resolve: {
    alias: {
      "coddy-runtime": resolve(ui, "src/ui/extensions/runtime.ts"),
      "coddy-remote-env": resolve(ui, "src/ui/env/remoteEnv.ts"),
    },
  },
  test: { environment: "jsdom" },
});
