/**
 * Main application shell layout.
 *
 * Structure:
 * ┌─────────────────────────────────────────┐
 * │ MenuBar                                 │
 * ├──────────────────────┬──────────────────┤
 * │                      │ Side Panels      │
 * │  VideoPlayer         │ (Videos,         │
 * │  + Canvas Overlay    │  Skeleton,       │
 * │  + Seekbar           │  Instances,      │
 * │                      │  Suggestions)    │
 * ├──────────────────────┴──────────────────┤
 * │ StatusBar                               │
 * └─────────────────────────────────────────┘
 */

import { useState, useCallback } from "react";
import { loadSlp } from "@talmolab/sleap-io.js";
import { MenuBar } from "./MenuBar";
import { StatusBar } from "./StatusBar";
import { ResizeDivider } from "./ResizeDivider";
import { VideoPlayer } from "../video/VideoPlayer";
import { VideosPanel } from "../panels/VideosPanel";
import { SkeletonPanel } from "../panels/SkeletonPanel";
import { InstancesPanel } from "../panels/InstancesPanel";
import { SuggestionsPanel } from "../panels/SuggestionsPanel";
import { WelcomeScreen } from "./WelcomeScreen";
import { useAppStore } from "../../stores/appStore";

const PANEL_TABS = ["videos", "skeleton", "instances", "suggestions"] as const;

const MIN_PANEL_WIDTH = 200;
const MAX_PANEL_WIDTH = 600;
const DEFAULT_PANEL_WIDTH = 320;

export function AppShell() {
  const projectLoaded = useAppStore((s) => s.projectLoaded);
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH);

  const handleResize = useCallback((delta: number) => {
    setPanelWidth((w) => Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, w + delta)));
  }, []);

  // Global drag-and-drop for SLP files
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith(".slp")) {
      try {
        const labels = await loadSlp(file, { openVideos: true });
        useAppStore.getState().setLabels(labels, file.name);
      } catch (err) {
        console.error("Failed to load SLP:", err);
      }
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  return (
    <div
      className="flex flex-col h-full w-full bg-[var(--color-sleap-bg)]"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <MenuBar />

      <div className="flex-1 flex overflow-hidden">
        {projectLoaded ? (
          <>
            {/* Main viewport */}
            <div className="flex-1 flex flex-col min-w-0">
              <VideoPlayer />
            </div>

            {/* Resize handle */}
            <ResizeDivider onResize={handleResize} />

            {/* Side panels */}
            <div
              className="flex flex-col"
              style={{ width: panelWidth }}
            >
              <SidePanel />
            </div>
          </>
        ) : (
          <WelcomeScreen />
        )}
      </div>

      <StatusBar />
    </div>
  );
}

function SidePanel() {
  const [activeTab, setActiveTab] = useState<(typeof PANEL_TABS)[number]>("videos");

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex border-b border-[var(--color-sleap-border)] bg-[var(--color-sleap-surface)]">
        {PANEL_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 text-xs capitalize transition-colors ${
              activeTab === tab
                ? "text-white border-b-2 border-[var(--color-sleap-primary)]"
                : "text-[var(--color-sleap-text-muted)] hover:text-white"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto p-2">
        {activeTab === "videos" && <VideosPanel />}
        {activeTab === "skeleton" && <SkeletonPanel />}
        {activeTab === "instances" && <InstancesPanel />}
        {activeTab === "suggestions" && <SuggestionsPanel />}
      </div>
    </div>
  );
}
