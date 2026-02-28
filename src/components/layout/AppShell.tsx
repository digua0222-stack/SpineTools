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

import { useCallback } from "react";
import { loadSlp } from "@talmolab/sleap-io.js";
import { MenuBar } from "./MenuBar";
import { StatusBar } from "./StatusBar";
import { VideoPlayer } from "../video/VideoPlayer";
import { VideosPanel } from "../panels/VideosPanel";
import { SkeletonPanel } from "../panels/SkeletonPanel";
import { InstancesPanel } from "../panels/InstancesPanel";
import { SuggestionsPanel } from "../panels/SuggestionsPanel";
import { WelcomeScreen } from "./WelcomeScreen";
import { useAppStore } from "../../stores/appStore";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export function AppShell() {
  const projectLoaded = useAppStore((s) => s.projectLoaded);

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
      className="flex flex-col h-full w-full bg-background"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <MenuBar />

      <div className="flex-1 flex overflow-hidden">
        {projectLoaded ? (
          <ResizablePanelGroup orientation="horizontal">
            <ResizablePanel defaultSize={75} minSize={50}>
              <div className="flex-1 flex flex-col min-w-0 h-full">
                <VideoPlayer />
              </div>
            </ResizablePanel>

            <ResizableHandle className="w-1 bg-border hover:bg-primary/50 data-[resize-handle-active]:bg-primary transition-colors" />

            <ResizablePanel defaultSize={25} minSize={10} maxSize={40}>
              <SidePanel />
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          <WelcomeScreen />
        )}
      </div>

      <StatusBar />
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
