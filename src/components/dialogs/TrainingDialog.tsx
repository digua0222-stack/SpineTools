/**
 * Training configuration dialog.
 *
 * Placeholder UI for configuring and launching model training.
 * Training requires sleap-nn and cannot run in the browser -- this dialog
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

type ModelType = "single_animal" | "top_down" | "bottom_up";
type Backbone = "UNET" | "LEAP" | "HourGlass";
type TrainingProfile = "default" | "fast" | "accurate";

const MODEL_TYPE_LABELS: Record<ModelType, string> = {
  single_animal: "Single Animal",
  top_down: "Top-Down (Centroid + Centered Instance)",
  bottom_up: "Bottom-Up",
};

const BACKBONE_LABELS: Record<Backbone, string> = {
  UNET: "UNet",
  LEAP: "LEAP CNN",
  HourGlass: "Stacked Hourglass",
};

const PROFILE_LABELS: Record<TrainingProfile, string> = {
  default: "Default",
  fast: "Fast (fewer epochs, smaller backbone)",
  accurate: "Accurate (more epochs, larger backbone)",
};

export function TrainingDialog() {
  const open = useAppStore((s) => s.trainingDialogOpen);
  const setOpen = useAppStore((s) => s.setTrainingDialogOpen);

  const [modelType, setModelType] = useState<ModelType>("top_down");
  const [profile, setProfile] = useState<TrainingProfile>("default");
  const [backbone, setBackbone] = useState<Backbone>("UNET");
  const [epochs, setEpochs] = useState("100");
  const [batchSize, setBatchSize] = useState("4");

  // Top-down specific
  const [centroidBackbone, setCentroidBackbone] = useState<Backbone>("UNET");
  const [centroidEpochs, setCentroidEpochs] = useState("100");
  const [centeredBackbone, setCenteredBackbone] = useState<Backbone>("UNET");
  const [centeredEpochs, setCenteredEpochs] = useState("100");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Training Configuration
            <Badge variant="outline" className="text-xs font-normal">
              Coming Soon
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Configure model training parameters. Training requires the sleap-nn
            backend and cannot run directly in the browser.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Model Type */}
          <div className="space-y-2">
            <Label>Model Type</Label>
            <Select
              value={modelType}
              onValueChange={(v) => setModelType(v as ModelType)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(MODEL_TYPE_LABELS) as [ModelType, string][]).map(
                  ([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Training Profile */}
          <div className="space-y-2">
            <Label>Training Profile</Label>
            <Select
              value={profile}
              onValueChange={(v) => setProfile(v as TrainingProfile)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(
                  Object.entries(PROFILE_LABELS) as [TrainingProfile, string][]
                ).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Model-specific configuration */}
          {modelType === "top_down" ? (
            <Tabs defaultValue="centroid">
              <TabsList className="w-full">
                <TabsTrigger value="centroid" className="flex-1">
                  Centroid Model
                </TabsTrigger>
                <TabsTrigger value="centered" className="flex-1">
                  Centered Instance Model
                </TabsTrigger>
              </TabsList>

              <TabsContent value="centroid" className="space-y-3 mt-3">
                <div className="space-y-2">
                  <Label>Backbone</Label>
                  <Select
                    value={centroidBackbone}
                    onValueChange={(v) =>
                      setCentroidBackbone(v as Backbone)
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(
                        Object.entries(BACKBONE_LABELS) as [Backbone, string][]
                      ).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Epochs</Label>
                  <Input
                    type="number"
                    min={1}
                    max={1000}
                    value={centroidEpochs}
                    onChange={(e) => setCentroidEpochs(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Batch Size</Label>
                  <Input
                    type="number"
                    min={1}
                    max={64}
                    value={batchSize}
                    onChange={(e) => setBatchSize(e.target.value)}
                  />
                </div>
              </TabsContent>

              <TabsContent value="centered" className="space-y-3 mt-3">
                <div className="space-y-2">
                  <Label>Backbone</Label>
                  <Select
                    value={centeredBackbone}
                    onValueChange={(v) =>
                      setCenteredBackbone(v as Backbone)
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(
                        Object.entries(BACKBONE_LABELS) as [Backbone, string][]
                      ).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Epochs</Label>
                  <Input
                    type="number"
                    min={1}
                    max={1000}
                    value={centeredEpochs}
                    onChange={(e) => setCenteredEpochs(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Batch Size</Label>
                  <Input
                    type="number"
                    min={1}
                    max={64}
                    value={batchSize}
                    onChange={(e) => setBatchSize(e.target.value)}
                  />
                </div>
              </TabsContent>
            </Tabs>
          ) : (
            /* Single animal or bottom-up config */
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Backbone</Label>
                <Select
                  value={backbone}
                  onValueChange={(v) => setBackbone(v as Backbone)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(
                      Object.entries(BACKBONE_LABELS) as [Backbone, string][]
                    ).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Epochs</Label>
                <Input
                  type="number"
                  min={1}
                  max={1000}
                  value={epochs}
                  onChange={(e) => setEpochs(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Batch Size</Label>
                <Input
                  type="number"
                  min={1}
                  max={64}
                  value={batchSize}
                  onChange={(e) => setBatchSize(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        <Separator />

        <div className="rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 p-3 text-sm text-muted-foreground">
          <p className="font-medium mb-1">sleap-nn integration planned</p>
          <p>
            Training will be supported via the sleap-nn backend. For now, you
            can train models using:
          </p>
          <ul className="list-disc pl-4 mt-1 space-y-0.5">
            <li>
              SLEAP desktop app:{" "}
              <span className="font-mono text-xs">sleap-label</span>
            </li>
            <li>
              Command line:{" "}
              <span className="font-mono text-xs">sleap-nn train</span>
            </li>
            <li>Google Colab notebook</li>
          </ul>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled>
            Start Training
            <Badge variant="secondary" className="ml-2 text-xs">
              Coming Soon
            </Badge>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
