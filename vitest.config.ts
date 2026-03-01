import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";
import { existsSync } from "fs";

// Resolve h5wasm ESM build for tests (same logic as vite.config.ts)
const localH5wasm = path.resolve(
  __dirname,
  "../sleap-io.js/node_modules/h5wasm/dist/esm/hdf5_hl.js"
);
const npmH5wasm = path.resolve(
  __dirname,
  "node_modules/h5wasm/dist/esm/hdf5_hl.js"
);
const h5wasmPath = existsSync(localH5wasm) ? localH5wasm : npmH5wasm;

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "h5wasm/node": h5wasmPath,
      h5wasm: h5wasmPath,
    },
  },
});
