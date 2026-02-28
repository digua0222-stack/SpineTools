import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { loadSlp } from "@talmolab/sleap-io.js";
import { useAppStore } from "./stores/appStore";
import { commandContext } from "./commands";

// Expose key APIs on window for testing/debugging
declare global {
  interface Window {
    sleap: {
      loadSlp: typeof loadSlp;
      store: typeof useAppStore;
      commandContext: typeof commandContext;
    };
  }
}
window.sleap = { loadSlp, store: useAppStore, commandContext };

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
