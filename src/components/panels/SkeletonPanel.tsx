/**
 * Skeleton panel: displays and edits the current skeleton structure.
 *
 * Shows skeleton name, node/edge counts, node list, edge list,
 * and placeholder controls for editing and loading templates.
 */

import { useState } from "react";
import { useAppStore } from "../../stores/appStore";
import type { Skeleton } from "../../types";

export function SkeletonPanel() {
  const skeleton = useAppStore((s) => s.skeleton);
  const [activeTab, setActiveTab] = useState<"nodes" | "edges">("nodes");

  if (!skeleton) {
    return (
      <p className="text-xs text-[var(--color-sleap-text-muted)] p-2">
        No skeleton loaded.
      </p>
    );
  }

  const nodes = skeleton.nodes ?? [];
  const edges = skeleton.edges ?? [];
  const [selectedNodeIdx, setSelectedNodeIdx] = useState<number | null>(null);
  const [selectedEdgeIdx, setSelectedEdgeIdx] = useState<number | null>(null);

  const addNode = () => {
    const name = prompt("Node name:", `node_${nodes.length}`);
    if (!name) return;
    skeleton.nodes.push({ name } as Skeleton["nodes"][0]);
    useAppStore.getState().markChanged();
    // Force re-render by toggling a dummy state
    setSelectedNodeIdx(skeleton.nodes.length - 1);
  };

  const deleteNode = () => {
    if (selectedNodeIdx === null || selectedNodeIdx >= nodes.length) return;
    if (!confirm(`Delete node "${nodes[selectedNodeIdx].name}"?`)) return;
    const node = nodes[selectedNodeIdx];
    // Remove edges referencing this node
    skeleton.edges = skeleton.edges.filter(
      (e) => e.source !== node && e.destination !== node
    );
    skeleton.nodes.splice(selectedNodeIdx, 1);
    setSelectedNodeIdx(null);
    useAppStore.getState().markChanged();
  };

  const addEdge = () => {
    if (nodes.length < 2) return;
    const srcName = prompt("Source node name:");
    if (!srcName) return;
    const dstName = prompt("Destination node name:");
    if (!dstName) return;
    const src = nodes.find((n) => n.name === srcName);
    const dst = nodes.find((n) => n.name === dstName);
    if (!src || !dst) {
      alert("Node not found");
      return;
    }
    skeleton.edges.push({ source: src, destination: dst } as Skeleton["edges"][0]);
    useAppStore.getState().markChanged();
    setSelectedEdgeIdx(skeleton.edges.length - 1);
  };

  const deleteEdge = () => {
    if (selectedEdgeIdx === null || selectedEdgeIdx >= edges.length) return;
    skeleton.edges.splice(selectedEdgeIdx, 1);
    setSelectedEdgeIdx(null);
    useAppStore.getState().markChanged();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Skeleton info header */}
      <div className="px-2 py-1.5 border-b border-[var(--color-sleap-border)]">
        <div className="text-xs font-medium text-white">
          {skeleton.name || "Unnamed skeleton"}
        </div>
        <div className="text-xs text-[var(--color-sleap-text-muted)]">
          {nodes.length} node{nodes.length !== 1 ? "s" : ""},{" "}
          {edges.length} edge{edges.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Template selector */}
      <div className="px-2 py-1.5 border-b border-[var(--color-sleap-border)]">
        <label className="text-xs text-[var(--color-sleap-text-muted)] block mb-1">
          Load template
        </label>
        <select
          className="w-full text-xs bg-[var(--color-sleap-surface)] border border-[var(--color-sleap-border)] text-[var(--color-sleap-text)] rounded px-1.5 py-1"
          defaultValue=""
          onChange={(e) => console.log("Load template:", e.target.value)}
        >
          <option value="" disabled>
            Select skeleton template...
          </option>
          <option value="fly">Fly (32 nodes)</option>
          <option value="mouse_topdown">Mouse top-down (12 nodes)</option>
          <option value="mouse_sideview">Mouse side-view (8 nodes)</option>
          <option value="human">Human (17 nodes)</option>
          <option value="hand">Hand (21 nodes)</option>
        </select>
      </div>

      {/* Tabs for Nodes / Edges */}
      <div className="flex border-b border-[var(--color-sleap-border)]">
        <button
          onClick={() => setActiveTab("nodes")}
          className={`flex-1 px-2 py-1 text-xs transition-colors ${
            activeTab === "nodes"
              ? "text-white border-b-2 border-[var(--color-sleap-primary)]"
              : "text-[var(--color-sleap-text-muted)] hover:text-white"
          }`}
        >
          Nodes ({nodes.length})
        </button>
        <button
          onClick={() => setActiveTab("edges")}
          className={`flex-1 px-2 py-1 text-xs transition-colors ${
            activeTab === "edges"
              ? "text-white border-b-2 border-[var(--color-sleap-primary)]"
              : "text-[var(--color-sleap-text-muted)] hover:text-white"
          }`}
        >
          Edges ({edges.length})
        </button>
      </div>

      {/* Table content */}
      <div className="flex-1 overflow-auto">
        {activeTab === "nodes" ? (
          <NodesTable nodes={nodes} selectedIdx={selectedNodeIdx} onSelect={setSelectedNodeIdx} />
        ) : (
          <EdgesTable edges={edges} selectedIdx={selectedEdgeIdx} onSelect={setSelectedEdgeIdx} />
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-1 p-2 border-t border-[var(--color-sleap-border)]">
        {activeTab === "nodes" ? (
          <>
            <button
              className="px-2 py-1 text-xs bg-[var(--color-sleap-surface)] hover:bg-[var(--color-sleap-border)] text-[var(--color-sleap-text)] rounded transition-colors"
              onClick={addNode}
            >
              New Node
            </button>
            <button
              className="px-2 py-1 text-xs bg-[var(--color-sleap-surface)] hover:bg-[var(--color-sleap-border)] text-[var(--color-sleap-text)] rounded transition-colors disabled:opacity-50"
              onClick={deleteNode}
              disabled={selectedNodeIdx === null}
            >
              Delete Node
            </button>
          </>
        ) : (
          <>
            <button
              className="px-2 py-1 text-xs bg-[var(--color-sleap-surface)] hover:bg-[var(--color-sleap-border)] text-[var(--color-sleap-text)] rounded transition-colors"
              onClick={addEdge}
            >
              New Edge
            </button>
            <button
              className="px-2 py-1 text-xs bg-[var(--color-sleap-surface)] hover:bg-[var(--color-sleap-border)] text-[var(--color-sleap-text)] rounded transition-colors disabled:opacity-50"
              onClick={deleteEdge}
              disabled={selectedEdgeIdx === null}
            >
              Delete Edge
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function NodesTable({ nodes, selectedIdx, onSelect }: {
  nodes: { name: string }[];
  selectedIdx: number | null;
  onSelect: (idx: number | null) => void;
}) {
  if (nodes.length === 0) {
    return (
      <p className="text-xs text-[var(--color-sleap-text-muted)] p-2">
        No nodes defined.
      </p>
    );
  }

  return (
    <table className="w-full text-left">
      <thead>
        <tr className="text-[var(--color-sleap-text-muted)]">
          <th className="py-1 px-2 text-xs font-normal">#</th>
          <th className="py-1 px-2 text-xs font-normal">Name</th>
        </tr>
      </thead>
      <tbody>
        {nodes.map((node, i) => (
          <tr
            key={i}
            onClick={() => onSelect(selectedIdx === i ? null : i)}
            className={`cursor-pointer transition-colors ${
              selectedIdx === i
                ? "bg-[var(--color-sleap-primary)]/20 text-white"
                : "hover:bg-[var(--color-sleap-border)]/50 text-[var(--color-sleap-text)]"
            }`}
          >
            <td className="py-1 px-2 text-xs text-[var(--color-sleap-text-muted)]">
              {i}
            </td>
            <td className="py-1 px-2 text-xs">{node.name}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EdgesTable({
  edges,
  selectedIdx,
  onSelect,
}: {
  edges: { source: { name: string }; destination: { name: string } }[];
  selectedIdx: number | null;
  onSelect: (idx: number | null) => void;
}) {
  if (edges.length === 0) {
    return (
      <p className="text-xs text-[var(--color-sleap-text-muted)] p-2">
        No edges defined.
      </p>
    );
  }

  return (
    <table className="w-full text-left">
      <thead>
        <tr className="text-[var(--color-sleap-text-muted)]">
          <th className="py-1 px-2 text-xs font-normal">#</th>
          <th className="py-1 px-2 text-xs font-normal">Source</th>
          <th className="py-1 px-2 text-xs font-normal"></th>
          <th className="py-1 px-2 text-xs font-normal">Destination</th>
        </tr>
      </thead>
      <tbody>
        {edges.map((edge, i) => (
          <tr
            key={i}
            onClick={() => onSelect(selectedIdx === i ? null : i)}
            className={`cursor-pointer transition-colors ${
              selectedIdx === i
                ? "bg-[var(--color-sleap-primary)]/20 text-white"
                : "hover:bg-[var(--color-sleap-border)]/50 text-[var(--color-sleap-text)]"
            }`}
          >
            <td className="py-1 px-2 text-xs text-[var(--color-sleap-text-muted)]">
              {i}
            </td>
            <td className="py-1 px-2 text-xs">{edge.source.name}</td>
            <td className="py-0.5 px-1 text-xs text-[var(--color-sleap-text-muted)]">
              &rarr;
            </td>
            <td className="py-1 px-2 text-xs">{edge.destination.name}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
