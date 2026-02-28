/**
 * Skeleton panel: displays and edits the current skeleton structure.
 *
 * Shows skeleton name, node/edge counts, node list, edge list,
 * and controls for editing and loading templates.
 */

import { useState } from "react";
import { useAppStore } from "../../stores/appStore";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { Skeleton } from "../../types";

export function SkeletonPanel() {
  const skeleton = useAppStore((s) => s.skeleton);
  const [selectedNodeIdx, setSelectedNodeIdx] = useState<number | null>(null);
  const [selectedEdgeIdx, setSelectedEdgeIdx] = useState<number | null>(null);

  // Dialog state for add node
  const [addNodeOpen, setAddNodeOpen] = useState(false);
  const [newNodeName, setNewNodeName] = useState("");

  // Dialog state for delete node confirmation
  const [deleteNodeOpen, setDeleteNodeOpen] = useState(false);

  // Dialog state for add edge
  const [addEdgeOpen, setAddEdgeOpen] = useState(false);
  const [edgeSrcName, setEdgeSrcName] = useState("");
  const [edgeDstName, setEdgeDstName] = useState("");

  if (!skeleton) {
    return (
      <p className="text-xs text-muted-foreground p-2">No skeleton loaded.</p>
    );
  }

  const nodes = skeleton.nodes ?? [];
  const edges = skeleton.edges ?? [];

  const addNode = () => {
    if (!newNodeName.trim()) return;
    skeleton.nodes.push({ name: newNodeName.trim() } as Skeleton["nodes"][0]);
    useAppStore.getState().markChanged();
    setSelectedNodeIdx(skeleton.nodes.length - 1);
    setNewNodeName("");
    setAddNodeOpen(false);
  };

  const deleteNode = () => {
    if (selectedNodeIdx === null || selectedNodeIdx >= nodes.length) return;
    const node = nodes[selectedNodeIdx];
    // Remove edges referencing this node
    skeleton.edges = skeleton.edges.filter(
      (e) => e.source !== node && e.destination !== node
    );
    skeleton.nodes.splice(selectedNodeIdx, 1);
    setSelectedNodeIdx(null);
    useAppStore.getState().markChanged();
    setDeleteNodeOpen(false);
  };

  const addEdge = () => {
    const src = nodes.find((n) => n.name === edgeSrcName);
    const dst = nodes.find((n) => n.name === edgeDstName);
    if (!src || !dst) return;
    skeleton.edges.push({
      source: src,
      destination: dst,
    } as Skeleton["edges"][0]);
    useAppStore.getState().markChanged();
    setSelectedEdgeIdx(skeleton.edges.length - 1);
    setEdgeSrcName("");
    setEdgeDstName("");
    setAddEdgeOpen(false);
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
      <div className="px-2 py-1.5 border-b border-border">
        <div className="text-xs font-medium text-foreground">
          {skeleton.name || "Unnamed skeleton"}
        </div>
        <div className="text-xs text-muted-foreground">
          {nodes.length} node{nodes.length !== 1 ? "s" : ""},{" "}
          {edges.length} edge{edges.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Template selector */}
      <div className="px-2 py-1.5 border-b border-border">
        <label className="text-xs text-muted-foreground block mb-1">
          Load template
        </label>
        <Select onValueChange={(v) => console.log("Load template:", v)}>
          <SelectTrigger className="w-full h-7 text-xs" size="sm">
            <SelectValue placeholder="Select skeleton template..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fly">Fly (32 nodes)</SelectItem>
            <SelectItem value="mouse_topdown">
              Mouse top-down (12 nodes)
            </SelectItem>
            <SelectItem value="mouse_sideview">
              Mouse side-view (8 nodes)
            </SelectItem>
            <SelectItem value="human">Human (17 nodes)</SelectItem>
            <SelectItem value="hand">Hand (21 nodes)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabs for Nodes / Edges */}
      <Tabs defaultValue="nodes" className="flex flex-col flex-1 min-h-0 gap-0">
        <TabsList
          variant="line"
          className="w-full justify-center border-b border-border px-2"
        >
          <TabsTrigger value="nodes" className="text-xs h-7">
            Nodes ({nodes.length})
          </TabsTrigger>
          <TabsTrigger value="edges" className="text-xs h-7">
            Edges ({edges.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="nodes" className="flex flex-col flex-1 min-h-0 mt-0">
          <ScrollArea className="flex-1">
            <NodesTable
              nodes={nodes}
              selectedIdx={selectedNodeIdx}
              onSelect={setSelectedNodeIdx}
            />
          </ScrollArea>
          <Separator />
          <div className="flex gap-1 p-2">
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                setNewNodeName(`node_${nodes.length}`);
                setAddNodeOpen(true);
              }}
            >
              New Node
            </Button>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setDeleteNodeOpen(true)}
              disabled={selectedNodeIdx === null}
            >
              Delete Node
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="edges" className="flex flex-col flex-1 min-h-0 mt-0">
          <ScrollArea className="flex-1">
            <EdgesTable
              edges={edges}
              selectedIdx={selectedEdgeIdx}
              onSelect={setSelectedEdgeIdx}
            />
          </ScrollArea>
          <Separator />
          <div className="flex gap-1 p-2">
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                setEdgeSrcName("");
                setEdgeDstName("");
                setAddEdgeOpen(true);
              }}
              disabled={nodes.length < 2}
            >
              New Edge
            </Button>
            <Button
              variant="ghost"
              size="xs"
              onClick={deleteEdge}
              disabled={selectedEdgeIdx === null}
            >
              Delete Edge
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      {/* Add Node Dialog */}
      <Dialog open={addNodeOpen} onOpenChange={setAddNodeOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Node</DialogTitle>
            <DialogDescription>
              Enter a name for the new skeleton node.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={newNodeName}
            onChange={(e) => setNewNodeName(e.target.value)}
            placeholder="Node name"
            onKeyDown={(e) => {
              if (e.key === "Enter") addNode();
            }}
            autoFocus
          />
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAddNodeOpen(false)}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={addNode} disabled={!newNodeName.trim()}>
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Node Confirmation Dialog */}
      <Dialog open={deleteNodeOpen} onOpenChange={setDeleteNodeOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Node</DialogTitle>
            <DialogDescription>
              Delete node "
              {selectedNodeIdx !== null && selectedNodeIdx < nodes.length
                ? nodes[selectedNodeIdx].name
                : ""}
              "? This will also remove any edges connected to it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteNodeOpen(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={deleteNode}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Edge Dialog */}
      <Dialog open={addEdgeOpen} onOpenChange={setAddEdgeOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Edge</DialogTitle>
            <DialogDescription>
              Select source and destination nodes for the new edge.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                Source
              </label>
              <Select value={edgeSrcName} onValueChange={setEdgeSrcName}>
                <SelectTrigger className="w-full" size="sm">
                  <SelectValue placeholder="Select source node..." />
                </SelectTrigger>
                <SelectContent>
                  {nodes.map((n, i) => (
                    <SelectItem key={i} value={n.name}>
                      {n.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                Destination
              </label>
              <Select value={edgeDstName} onValueChange={setEdgeDstName}>
                <SelectTrigger className="w-full" size="sm">
                  <SelectValue placeholder="Select destination node..." />
                </SelectTrigger>
                <SelectContent>
                  {nodes.map((n, i) => (
                    <SelectItem key={i} value={n.name}>
                      {n.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAddEdgeOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={addEdge}
              disabled={!edgeSrcName || !edgeDstName}
            >
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NodesTable({
  nodes,
  selectedIdx,
  onSelect,
}: {
  nodes: { name: string }[];
  selectedIdx: number | null;
  onSelect: (idx: number | null) => void;
}) {
  if (nodes.length === 0) {
    return (
      <p className="text-xs text-muted-foreground p-2">No nodes defined.</p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="border-b hover:bg-transparent">
          <TableHead className="py-1 px-2 text-xs font-normal h-auto">
            #
          </TableHead>
          <TableHead className="py-1 px-2 text-xs font-normal h-auto">
            Name
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {nodes.map((node, i) => (
          <TableRow
            key={i}
            onClick={() => onSelect(selectedIdx === i ? null : i)}
            className={cn(
              "cursor-pointer border-b-0",
              selectedIdx === i
                ? "bg-orange-500/10 border-l-2 border-l-orange-500 text-foreground"
                : "hover:bg-muted/50 text-foreground"
            )}
          >
            <TableCell className="py-0.5 px-2 text-xs text-muted-foreground">
              {i}
            </TableCell>
            <TableCell className="py-0.5 px-2 text-xs">{node.name}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
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
      <p className="text-xs text-muted-foreground p-2">No edges defined.</p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="border-b hover:bg-transparent">
          <TableHead className="py-1 px-2 text-xs font-normal h-auto">
            #
          </TableHead>
          <TableHead className="py-1 px-2 text-xs font-normal h-auto">
            Source
          </TableHead>
          <TableHead className="py-1 px-2 text-xs font-normal h-auto" />
          <TableHead className="py-1 px-2 text-xs font-normal h-auto">
            Destination
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {edges.map((edge, i) => (
          <TableRow
            key={i}
            onClick={() => onSelect(selectedIdx === i ? null : i)}
            className={cn(
              "cursor-pointer border-b-0",
              selectedIdx === i
                ? "bg-orange-500/10 border-l-2 border-l-orange-500 text-foreground"
                : "hover:bg-muted/50 text-foreground"
            )}
          >
            <TableCell className="py-0.5 px-2 text-xs text-muted-foreground">
              {i}
            </TableCell>
            <TableCell className="py-0.5 px-2 text-xs">
              {edge.source.name}
            </TableCell>
            <TableCell className="py-0.5 px-1 text-xs text-muted-foreground">
              &rarr;
            </TableCell>
            <TableCell className="py-0.5 px-2 text-xs">
              {edge.destination.name}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
