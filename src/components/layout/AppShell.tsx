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

import { useCallback, useEffect } from "react";
import { Toaster } from "sonner";
import { MenuBar } from "./MenuBar";
import { StatusBar } from "./StatusBar";
import { VideoPlayer } from "../video/VideoPlayer";
import { VideosPanel } from "../panels/VideosPanel";
import { SkeletonPanel } from "../panels/SkeletonPanel";
import { InstancesPanel } from "../panels/InstancesPanel";
import { SuggestionsPanel } from "../panels/SuggestionsPanel";
import { WelcomeScreen } from "./WelcomeScreen";
import { TrainingDialog } from "../dialogs/TrainingDialog";
import { InferenceDialog } from "../dialogs/InferenceDialog";
import { GoToFrameDialog } from "../dialogs/GoToFrameDialog";
import { useAppStore } from "../../stores/appStore";
import { loadProjectFromFile } from "../../lib/loadProject";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export function AppShell() {
  const projectLoaded = useAppStore((s) => s.projectLoaded);
  const isLoading = useAppStore((s) => s.isLoading);
  const loadingMessage = useAppStore((s) => s.loadingMessage);

  // Unsaved changes protection: warn before closing/refreshing
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (useAppStore.getState().hasChanges) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // Global drag-and-drop for SLP files (uses consolidated loader)
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith(".slp")) {
      await loadProjectFromFile(file);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  return (
    <div
      className="flex flex-col h-full w-full bg-background"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <MenuBar />

      <div className="flex-1 flex overflow-hidden relative">
        {projectLoaded ? (
          <ResizablePanelGroup orientation="horizontal">
            <ResizablePanel defaultSize="70%" minSize="40%">
              <div className="flex-1 flex flex-col min-w-0 h-full">
                <VideoPlayer />
              </div>
            </ResizablePanel>

            <ResizableHandle className="w-1 bg-border hover:bg-primary/50 data-[resize-handle-active]:bg-primary transition-colors" />

            <ResizablePanel defaultSize="30%" minSize="15%" maxSize="50%">
              <SidePanel />
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          <WelcomeScreen />
        )}

        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              <p className="text-sm text-muted-foreground">
                {loadingMessage || "Loading..."}
              </p>
            </div>
          </div>
        )}
      </div>

      <StatusBar />

      {/* Global dialogs */}
      <TrainingDialog />
      <InferenceDialog />
      <GoToFrameDialog />

      {/* Toast notifications */}
      <Toaster
        theme="dark"
        position="bottom-right"
        toastOptions={{
          className: "bg-card border-border text-foreground",
        }}
      />
    </div>
  );
}

function SidePanel() {
  return (
    <Tabs defaultValue="videos" className="h-full gap-0">
      <TabsList
        variant="line"
        className="w-full justify-start rounded-none border-b border-border bg-card h-8 px-0"
      >
        <TabsTrigger
          value="videos"
          className="rounded-none px-3 py-1.5 text-xs capitalize h-full data-[state=active]:text-foreground data-[state=active]:shadow-none"
        >
          Videos
        </TabsTrigger>
        <TabsTrigger
          value="skeleton"
          className="rounded-none px-3 py-1.5 text-xs capitalize h-full data-[state=active]:text-foreground data-[state=active]:shadow-none"
        >
          Skeleton
        </TabsTrigger>
        <TabsTrigger
          value="instances"
          className="rounded-none px-3 py-1.5 text-xs capitalize h-full data-[state=active]:text-foreground data-[state=active]:shadow-none"
        >
          Instances
        </TabsTrigger>
        <TabsTrigger
          value="suggestions"
          className="rounded-none px-3 py-1.5 text-xs capitalize h-full data-[state=active]:text-foreground data-[state=active]:shadow-none"
        >
          Suggestions
        </TabsTrigger>
      </TabsList>
      <TabsContent value="videos" className="overflow-auto p-2 mt-0">
        <VideosPanel />
      </TabsContent>
      <TabsContent value="skeleton" className="overflow-auto p-2 mt-0">
        <SkeletonPanel />
      </TabsContent>
      <TabsContent value="instances" className="overflow-auto p-2 mt-0">
        <InstancesPanel />
      </TabsContent>
      <TabsContent value="suggestions" className="overflow-auto p-2 mt-0">
        <SuggestionsPanel />
      </TabsContent>
    </Tabs>
  );
}
