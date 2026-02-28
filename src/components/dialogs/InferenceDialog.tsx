/**
 * Inference / prediction dialog.
 *
 * Placeholder UI for configuring and running model inference.
 * Inference requires sleap-nn and cannot run in the browser -- this dialog
 * provides the UI structure and shows a "Coming Soon" badge.
 */

import { useState } from "react";
import { useAppStore } from "../../stores/appStore";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";

type FrameRange = "all" | "labeled" | "custom";
type TrackingMethod = "simple" | "flow" | "identity";

const TRACKING_LABELS: Record<TrackingMethod, string> = {
  simple: "Simple (greedy matching)",
  flow: "Optical Flow",
  identity: "Identity (re-ID network)",
};

export function InferenceDialog() {
  const open = useAppStore((s) => s.inferenceDialogOpen);
  const setOpen = useAppStore((s) => s.setInferenceDialogOpen);
  const labels = useAppStore((s) => s.labels);

  const [selectedModel, setSelectedModel] = useState("none");
  const [selectedVideo, setSelectedVideo] = useState("all");
  const [frameRange, setFrameRange] = useState<FrameRange>("all");
  const [frameStart, setFrameStart] = useState("0");
  const [frameEnd, setFrameEnd] = useState("1000");
  const [trackingMethod, setTrackingMethod] =
    useState<TrackingMethod>("simple");
  const [maxInstances, setMaxInstances] = useState("2");

  const videos = labels?.videos ?? [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Run Inference
            <Badge variant="outline" className="text-xs font-normal">
              Coming Soon
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Configure and run pose estimation inference on video frames.
            Requires trained models and the sleap-nn backend.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Model Selection */}
          <div className="space-y-2">
            <Label>Model</Label>
            <Select value={selectedModel} onValueChange={setSelectedModel}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a trained model" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" disabled>
                  No trained models available
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Train a model first, or load a trained model configuration.
            </p>
          </div>

          <Separator />

          {/* Video Selection */}
          <div className="space-y-2">
            <Label>Video</Label>
            <Select value={selectedVideo} onValueChange={setSelectedVideo}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All videos</SelectItem>
                {videos.map((video, i) => (
                  <SelectItem key={i} value={String(i)}>
                    {video.filename ??
                      video.backendMetadata?.filename ??
                      `Video ${i + 1}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Frame Range */}
          <div className="space-y-2">
            <Label>Frame Range</Label>
            <Select
              value={frameRange}
              onValueChange={(v) => setFrameRange(v as FrameRange)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All frames</SelectItem>
                <SelectItem value="labeled">Labeled frames only</SelectItem>
                <SelectItem value="custom">Custom range</SelectItem>
              </SelectContent>
            </Select>
            {frameRange === "custom" && (
              <div className="flex items-center gap-2 mt-2">
                <Input
                  type="number"
                  min={0}
                  placeholder="Start"
                  value={frameStart}
                  onChange={(e) => setFrameStart(e.target.value)}
                  className="flex-1"
                />
                <span className="text-sm text-muted-foreground">to</span>
                <Input
                  type="number"
                  min={0}
                  placeholder="End"
                  value={frameEnd}
                  onChange={(e) => setFrameEnd(e.target.value)}
                  className="flex-1"
                />
              </div>
            )}
          </div>

          <Separator />

          {/* Tracking */}
          <div className="space-y-2">
            <Label>Tracking Method</Label>
            <Select
              value={trackingMethod}
              onValueChange={(v) => setTrackingMethod(v as TrackingMethod)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(
                  Object.entries(TRACKING_LABELS) as [TrackingMethod, string][]
                ).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Max Instances */}
          <div className="space-y-2">
            <Label>Max Instances per Frame</Label>
            <Input
              type="number"
              min={1}
              max={100}
              value={maxInstances}
              onChange={(e) => setMaxInstances(e.target.value)}
            />
          </div>
        </div>

        <Separator />

        <div className="rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 p-3 text-sm text-muted-foreground">
          <p className="font-medium mb-1">sleap-nn integration planned</p>
          <p>
            Inference will be supported via the sleap-nn backend. For now, you
            can run predictions using:
          </p>
          <ul className="list-disc pl-4 mt-1 space-y-0.5">
            <li>
              SLEAP desktop app:{" "}
              <span className="font-mono text-xs">sleap-label</span>
            </li>
            <li>
              Command line:{" "}
              <span className="font-mono text-xs">sleap-nn inference</span>
            </li>
            <li>Google Colab notebook</li>
          </ul>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled>
            Run Inference
            <Badge variant="secondary" className="ml-2 text-xs">
              Coming Soon
            </Badge>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
