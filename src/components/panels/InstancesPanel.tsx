/**
 * Instances panel: lists instances on the current labeled frame.
 *
 * Shows track name, predicted status, visible node count, score,
 * and a color indicator matching the instance's palette color.
 */

import { useAppStore } from "../../stores/appStore";
import { getPaletteColor, rgbToCSS } from "../../lib/colorPalettes";
import { commandContext, AddInstance, DeleteSelectedInstance } from "../../commands";
import type { Instance, PredictedInstance } from "../../types";

function isPredicted(instance: Instance): instance is PredictedInstance {
  return "score" in instance && typeof (instance as PredictedInstance).score === "number";
}

function InstanceRow({
  instance,
  index,
  isSelected,
  onSelect,
  palette,
}: {
  instance: Instance | PredictedInstance;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  palette: string;
}) {
  const color = getPaletteColor(palette, index);
  const predicted = isPredicted(instance);
  const trackName = instance.track?.name ?? "[no track]";
  const visibleNodes = instance.nVisible;
  const totalNodes = instance.points.length;
  const score = predicted ? (instance as PredictedInstance).score : null;

  return (
    <tr
      onClick={onSelect}
      className={`cursor-pointer transition-colors ${
        isSelected
          ? "bg-[var(--color-sleap-primary)]/20 text-white"
          : "hover:bg-[var(--color-sleap-border)]/50 text-[var(--color-sleap-text)]"
      }`}
    >
      <td className="py-1 px-2">
        <div
          className="w-3 h-3 rounded-sm"
          style={{ backgroundColor: rgbToCSS(color) }}
        />
      </td>
      <td className="py-1 px-2 text-xs">{trackName}</td>
      <td className="py-1 px-2 text-xs text-[var(--color-sleap-text-muted)]">
        {predicted ? "pred" : "user"}
      </td>
      <td className="py-1 px-2 text-xs text-right tabular-nums">
        {visibleNodes}/{totalNodes}
      </td>
      <td className="py-1 px-2 text-xs text-right tabular-nums text-[var(--color-sleap-text-muted)]">
        {score !== null ? score.toFixed(2) : "--"}
      </td>
    </tr>
  );
}

export function InstancesPanel() {
  const labels = useAppStore((s) => s.labels);
  const video = useAppStore((s) => s.video);
  const frameIdx = useAppStore((s) => s.frameIdx);
  const currentInstance = useAppStore((s) => s.instance);
  const setInstance = useAppStore((s) => s.setInstance);
  const palette = useAppStore((s) => s.palette);

  // Find the labeled frame for current video + frame
  const labeledFrames = labels && video
    ? labels.find({ video, frameIdx })
    : [];
  const labeledFrame = labeledFrames.length > 0 ? labeledFrames[0] : null;
  const instances = labeledFrame?.instances ?? [];

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto">
        {instances.length === 0 ? (
          <p className="text-xs text-[var(--color-sleap-text-muted)] p-2">
            No instances on this frame.
          </p>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="text-[var(--color-sleap-text-muted)]">
                <th className="py-1 px-2 text-xs font-normal w-6"></th>
                <th className="py-1 px-2 text-xs font-normal">Track</th>
                <th className="py-1 px-2 text-xs font-normal">Type</th>
                <th className="py-1 px-2 text-xs font-normal text-right">Nodes</th>
                <th className="py-1 px-2 text-xs font-normal text-right">Score</th>
              </tr>
            </thead>
            <tbody>
              {instances.map((instance, i) => (
                <InstanceRow
                  key={i}
                  instance={instance}
                  index={i}
                  isSelected={instance === currentInstance}
                  onSelect={() => setInstance(instance)}
                  palette={palette}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-1 p-2 border-t border-[var(--color-sleap-border)]">
        <button
          className="px-2 py-1 text-xs bg-[var(--color-sleap-surface)] hover:bg-[var(--color-sleap-border)] text-[var(--color-sleap-text)] rounded transition-colors"
          onClick={() => commandContext.execute(AddInstance)}
        >
          Add Instance
        </button>
        <button
          className="px-2 py-1 text-xs bg-[var(--color-sleap-surface)] hover:bg-[var(--color-sleap-border)] text-[var(--color-sleap-text)] rounded transition-colors"
          onClick={() => commandContext.execute(DeleteSelectedInstance)}
        >
          Delete Instance
        </button>
      </div>
    </div>
  );
}
