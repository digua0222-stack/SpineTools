/**
 * Draggable resize divider between main content and side panel.
 */

import { useCallback, useRef, useState } from "react";

interface ResizeDividerProps {
  onResize: (delta: number) => void;
}

export function ResizeDivider({ onResize }: ResizeDividerProps) {
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      startXRef.current = e.clientX;
      setIsDragging(true);

      const handleMouseMove = (ev: MouseEvent) => {
        const delta = startXRef.current - ev.clientX;
        startXRef.current = ev.clientX;
        onResize(delta);
      };

      const handleMouseUp = () => {
        setIsDragging(false);
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    },
    [onResize]
  );

  return (
    <div
      className={`w-1 cursor-col-resize flex-shrink-0 transition-colors ${
        isDragging
          ? "bg-[var(--color-sleap-primary)]"
          : "bg-[var(--color-sleap-border)] hover:bg-[var(--color-sleap-primary)]/50"
      }`}
      onMouseDown={handleMouseDown}
    />
  );
}
