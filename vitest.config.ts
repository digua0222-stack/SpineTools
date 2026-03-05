import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";
import { existsSync } from "fs";

// Resolve h5wasm builds for tests
// ESM (browser) build for the main h5wasm import
const localH5wasmEsm = path.resolve(
  __dirname,
  "../sleap-io.js/node_modules/h5wasm/dist/esm/hdf5_hl.js"
);
const npmH5wasmEsm = path.resolve(
  __dirname,
  "node_modules/h5wasm/dist/esm/hdf5_hl.js"
);
const h5wasmPath = existsSync(localH5wasmEsm) ? localH5wasmEsm : npmH5wasmEsm;

// Node build for h5wasm/node import (uses real filesystem, not MEMFS)
const localH5wasmNode = path.resolve(
  __dirname,
  "../sleap-io.js/node_modules/h5wasm/dist/node/hdf5_hl.js"
);
const npmH5wasmNode = path.resolve(
  __dirname,
  "node_modules/h5wasm/dist/node/hdf5_hl.js"
);
const h5wasmNodePath = existsSync(localH5wasmNode)
  ? localH5wasmNode
  : npmH5wasmNode;

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
      "h5wasm/node": h5wasmNodePath,
      h5wasm: h5wasmPath,
    },
  },
});
