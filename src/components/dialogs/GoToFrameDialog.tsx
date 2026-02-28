/**
 * Go to Frame dialog.
 *
 * Allows the user to type a frame number and navigate to it.
 * Triggered by Ctrl+G (or Ctrl+J matching SLEAP's shortcut).
 */

import { useState, useCallback } from "react";
import { useAppStore } from "../../stores/appStore";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function GoToFrameDialog() {
  const open = useAppStore((s) => s.goToFrameDialogOpen);
  const setOpen = useAppStore((s) => s.setGoToFrameDialogOpen);
  const frameIdx = useAppStore((s) => s.frameIdx);
  const video = useAppStore((s) => s.video);
  const setFrameIdx = useAppStore((s) => s.setFrameIdx);

  const [value, setValue] = useState("");

  const totalFrames = video?.shape?.[0] ?? null;
  const maxFrame = totalFrames !== null ? totalFrames - 1 : null;

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (newOpen) {
        setValue(String(frameIdx));
      }
      setOpen(newOpen);
    },
    [frameIdx, setOpen]
  );

  const handleSubmit = useCallback(() => {
    const frame = parseInt(value, 10);
    if (!isNaN(frame) && frame >= 0) {
      setFrameIdx(frame);
      setOpen(false);
    }
  }, [value, setFrameIdx, setOpen]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[300px]">
        <DialogHeader>
          <DialogTitle>Go to Frame</DialogTitle>
        </DialogHeader>
        <div className="py-2">
          <Input
            type="number"
            min={0}
            max={maxFrame ?? undefined}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Frame number (0${maxFrame !== null ? `-${maxFrame}` : ""})`}
            autoFocus
          />
          {maxFrame !== null && (
            <p className="text-xs text-muted-foreground mt-1">
              Valid range: 0 to {maxFrame}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit}>Go</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
