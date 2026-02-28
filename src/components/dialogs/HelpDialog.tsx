/**
 * Help / About Dialog.
 *
 * Shows application name, version, and credits.
 */

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface HelpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function HelpDialog({ open, onOpenChange }: HelpDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[360px]">
        <DialogHeader>
          <DialogTitle>About SLEAP Label</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2 text-sm">
          <div>
            <p className="font-semibold">SLEAP Label Web</p>
            <p className="text-muted-foreground">Version 0.1.0</p>
          </div>

          <p className="text-muted-foreground">
            Web-based labeling interface for SLEAP (Social LEAP Estimates Animal
            Poses). Built with React, TypeScript, and Canvas 2D.
          </p>

          <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t border-border">
            <p>
              SLEAP is developed by the{" "}
              <a
                href="https://talmolab.org"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground"
              >
                Talmo Lab
              </a>
              .
            </p>
            <p>
              <a
                href="https://sleap.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground"
              >
                sleap.ai
              </a>
              {" | "}
              <a
                href="https://github.com/talmolab/sleap"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground"
              >
                GitHub
              </a>
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
