/**
 * Delete Predictions Dialog.
 *
 * Provides multiple deletion strategies for predicted instances:
 * - By score threshold
 * - By frame range
 * - On user-labeled frames only
 * - By max instances per frame
 */

import { useState, useCallback } from "react";
import { useAppStore } from "../../stores/appStore";
import { commandContext } from "../../commands/CommandContext";
import {
  DeletePredictionsByScore,
  DeletePredictionsByRange,
  DeletePredictionsOnLabeledFrames,
  DeletePredictionsByMaxCount,
} from "../../commands/fileCommands";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";

type DeleteMode = "score" | "range" | "labeled" | "maxCount";

interface DeletePredictionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeletePredictionsDialog({
  open,
  onOpenChange,
}: DeletePredictionsDialogProps) {
  const video = useAppStore((s) => s.video);
  const totalFrames = video?.shape?.[0] ?? 0;

  const [mode, setMode] = useState<DeleteMode>("score");
  const [scoreThreshold, setScoreThreshold] = useState(0.5);
  const [rangeStart, setRangeStart] = useState(0);
  const [rangeEnd, setRangeEnd] = useState(totalFrames > 0 ? totalFrames - 1 : 0);
  const [maxCount, setMaxCount] = useState(2);

  const handleDelete = useCallback(async () => {
    switch (mode) {
      case "score":
        await commandContext.execute(DeletePredictionsByScore, {
          threshold: scoreThreshold,
        });
        break;
      case "range":
        await commandContext.execute(DeletePredictionsByRange, {
          startFrame: rangeStart,
          endFrame: rangeEnd,
        });
        break;
      case "labeled":
        await commandContext.execute(DeletePredictionsOnLabeledFrames);
        break;
      case "maxCount":
        await commandContext.execute(DeletePredictionsByMaxCount, {
          maxInstances: maxCount,
        });
        break;
    }
    onOpenChange(false);
  }, [mode, scoreThreshold, rangeStart, rangeEnd, maxCount, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Delete Predictions</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Deletion method</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as DeleteMode)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="score">By score threshold</SelectItem>
                <SelectItem value="range">By frame range</SelectItem>
                <SelectItem value="labeled">On user-labeled frames</SelectItem>
                <SelectItem value="maxCount">By max instances per frame</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {mode === "score" && (
            <div className="space-y-2">
              <Label>
                Delete predictions with score below: {scoreThreshold.toFixed(2)}
              </Label>
              <Slider
                min={0}
                max={1}
                step={0.01}
                value={[scoreThreshold]}
                onValueChange={([v]) => setScoreThreshold(v)}
              />
              <p className="text-xs text-muted-foreground">
                Predictions with an instance score below this threshold will be removed.
              </p>
            </div>
          )}

          {mode === "range" && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Start frame</Label>
                  <Input
                    type="number"
                    min={0}
                    max={totalFrames > 0 ? totalFrames - 1 : undefined}
                    value={rangeStart}
                    onChange={(e) => setRangeStart(parseInt(e.target.value, 10) || 0)}
                  />
                </div>
                <div>
                  <Label>End frame</Label>
                  <Input
                    type="number"
                    min={0}
                    max={totalFrames > 0 ? totalFrames - 1 : undefined}
                    value={rangeEnd}
                    onChange={(e) => setRangeEnd(parseInt(e.target.value, 10) || 0)}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Delete all predictions in frames {rangeStart} to {rangeEnd} (inclusive).
              </p>
            </div>
          )}

          {mode === "labeled" && (
            <p className="text-sm text-muted-foreground">
              Delete all predicted instances on frames that also contain
              user-labeled instances.
            </p>
          )}

          {mode === "maxCount" && (
            <div className="space-y-2">
              <Label>Max predictions per frame: {maxCount}</Label>
              <Input
                type="number"
                min={1}
                max={100}
                value={maxCount}
                onChange={(e) => setMaxCount(parseInt(e.target.value, 10) || 1)}
              />
              <p className="text-xs text-muted-foreground">
                Keep only the top {maxCount} predictions per frame (by score),
                removing the rest.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete}>
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
