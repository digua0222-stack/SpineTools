/**
 * Tests for SLP file writing (roundtrip tests).
 *
 * These tests verify that Labels can be written to SLP bytes and read back
 * with fidelity using the writeSlpToBytes function.
 *
 * @vitest-environment node
 */

import { describe, it, expect } from "vitest";
import { loadSlp, Labels, PredictedInstance } from "@talmolab/sleap-io.js";
import { writeSlpToBytes } from "@/lib/slpWriter";
import fs from "fs";
import path from "path";

const FIXTURES_DIR = path.resolve(__dirname, "../fixtures");

/** Load an SLP file from the fixtures directory. */
async function loadFixture(filename: string) {
  const filePath = path.join(FIXTURES_DIR, filename);
  const buffer = fs.readFileSync(filePath);
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  );
  return loadSlp(arrayBuffer, { openVideos: false });
}

/** Load Labels from raw bytes. */
async function loadFromBytes(bytes: Uint8Array) {
  return loadSlp(bytes.buffer, { openVideos: false });
}

const FIXTURES = [
  "minimal_instance.slp",
  "centered_pair.slp",
  "small_robot_minimal.slp",
];

describe("SLP writer roundtrip", () => {
  for (const fixture of FIXTURES) {
    describe(fixture, () => {
      it("roundtrips without error", async () => {
        const original = await loadFixture(fixture);
        const bytes = await writeSlpToBytes(original);
        expect(bytes).toBeInstanceOf(Uint8Array);
        expect(bytes.length).toBeGreaterThan(0);

        const reloaded = await loadFromBytes(bytes);
        expect(reloaded).toBeDefined();
      });

      it("preserves frame count", async () => {
        const original = await loadFixture(fixture);
        const bytes = await writeSlpToBytes(original);
        const reloaded = await loadFromBytes(bytes);
        expect(reloaded.labeledFrames.length).toBe(
          original.labeledFrames.length
        );
      });

      it("preserves total instance count", async () => {
        const original = await loadFixture(fixture);
        const bytes = await writeSlpToBytes(original);
        const reloaded = await loadFromBytes(bytes);

        const originalCount = original.labeledFrames.reduce(
          (sum, lf) => sum + lf.instances.length,
          0
        );
        const reloadedCount = reloaded.labeledFrames.reduce(
          (sum, lf) => sum + lf.instances.length,
          0
        );
        expect(reloadedCount).toBe(originalCount);
      });

      it("preserves skeleton node names", async () => {
        const original = await loadFixture(fixture);
        const bytes = await writeSlpToBytes(original);
        const reloaded = await loadFromBytes(bytes);

        expect(reloaded.skeletons.length).toBe(original.skeletons.length);
        for (let i = 0; i < original.skeletons.length; i++) {
          expect(reloaded.skeletons[i].nodeNames).toEqual(
            original.skeletons[i].nodeNames
          );
        }
      });

      it("preserves skeleton edge count", async () => {
        const original = await loadFixture(fixture);
        const bytes = await writeSlpToBytes(original);
        const reloaded = await loadFromBytes(bytes);

        for (let i = 0; i < original.skeletons.length; i++) {
          expect(reloaded.skeletons[i].edges.length).toBe(
            original.skeletons[i].edges.length
          );
        }
      });

      it("preserves video filenames", async () => {
        const original = await loadFixture(fixture);
        const bytes = await writeSlpToBytes(original);
        const reloaded = await loadFromBytes(bytes);

        expect(reloaded.videos.length).toBe(original.videos.length);
        for (let i = 0; i < original.videos.length; i++) {
          expect(reloaded.videos[i].filename).toBe(
            original.videos[i].filename
          );
        }
      });

      it("preserves point coordinates", async () => {
        const original = await loadFixture(fixture);
        const bytes = await writeSlpToBytes(original);
        const reloaded = await loadFromBytes(bytes);

        for (let fi = 0; fi < original.labeledFrames.length; fi++) {
          const origFrame = original.labeledFrames[fi];
          const reloadedFrame = reloaded.labeledFrames[fi];
          expect(reloadedFrame.frameIdx).toBe(origFrame.frameIdx);

          for (let ii = 0; ii < origFrame.instances.length; ii++) {
            const origInst = origFrame.instances[ii];
            const reloadedInst = reloadedFrame.instances[ii];
            expect(reloadedInst.points.length).toBe(origInst.points.length);

            for (let pi = 0; pi < origInst.points.length; pi++) {
              expect(reloadedInst.points[pi].xy[0]).toBeCloseTo(
                origInst.points[pi].xy[0],
                4
              );
              expect(reloadedInst.points[pi].xy[1]).toBeCloseTo(
                origInst.points[pi].xy[1],
                4
              );
            }
          }
        }
      });

      it("preserves track info if present", async () => {
        const original = await loadFixture(fixture);
        if (original.tracks.length === 0) return;

        const bytes = await writeSlpToBytes(original);
        const reloaded = await loadFromBytes(bytes);

        expect(reloaded.tracks.length).toBe(original.tracks.length);
        for (let i = 0; i < original.tracks.length; i++) {
          expect(reloaded.tracks[i].name).toBe(original.tracks[i].name);
        }
      });

      it("preserves predicted instances if present", async () => {
        const original = await loadFixture(fixture);
        const originalPredCount = original.labeledFrames.reduce(
          (sum, lf) =>
            sum +
            lf.instances.filter((inst) => inst instanceof PredictedInstance)
              .length,
          0
        );
        if (originalPredCount === 0) return;

        const bytes = await writeSlpToBytes(original);
        const reloaded = await loadFromBytes(bytes);

        const reloadedPredCount = reloaded.labeledFrames.reduce(
          (sum, lf) =>
            sum +
            lf.instances.filter((inst) => inst instanceof PredictedInstance)
              .length,
          0
        );
        expect(reloadedPredCount).toBe(originalPredCount);
      });
    });
  }

  describe("empty Labels", () => {
    it("roundtrips without error", async () => {
      const empty = new Labels();
      const bytes = await writeSlpToBytes(empty);
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBeGreaterThan(0);

      const reloaded = await loadFromBytes(bytes);
      expect(reloaded).toBeDefined();
      expect(reloaded.labeledFrames.length).toBe(0);
      expect(reloaded.videos.length).toBe(0);
      expect(reloaded.skeletons.length).toBe(0);
    });
  });

  describe("HDF5 structure", () => {
    it("has expected datasets and attributes", async () => {
      const labels = await loadFixture("minimal_instance.slp");
      const bytes = await writeSlpToBytes(labels);

      // Open the bytes with h5wasm to inspect structure
      const h5wasm = await import("h5wasm");
      await h5wasm.ready;

      const h5fs = (h5wasm as any).FS;
      const tmpPath = "/test-structure-check.slp";
      h5fs.writeFile(tmpPath, bytes);

      try {
        const file = new h5wasm.File(tmpPath, "r");
        try {
          // Check metadata group
          const metadataGroup = file.get("metadata");
          expect(metadataGroup).toBeDefined();

          // Check format_id attribute
          const formatId = metadataGroup.attrs["format_id"];
          expect(formatId).toBeDefined();
          expect(formatId.value).toBeCloseTo(1.4, 1);

          // Check json attribute exists
          const jsonAttr = metadataGroup.attrs["json"];
          expect(jsonAttr).toBeDefined();

          // Check datasets exist
          const expectedDatasets = [
            "videos_json",
            "tracks_json",
            "suggestions_json",
            "sessions_json",
            "frames",
            "instances",
            "points",
            "pred_points",
          ];
          for (const dsName of expectedDatasets) {
            const ds = file.get(dsName);
            expect(ds).toBeDefined();
          }

          // Check field_names attributes on matrix datasets
          const framesDs = file.get("frames");
          const framesFieldNames = framesDs.attrs["field_names"];
          expect(framesFieldNames).toBeDefined();
          expect(framesFieldNames.value).toContain("frame_id");

          const instancesDs = file.get("instances");
          const instancesFieldNames = instancesDs.attrs["field_names"];
          expect(instancesFieldNames).toBeDefined();
          expect(instancesFieldNames.value).toContain("instance_id");

          // Check shapes are 2D
          expect(framesDs.shape.length).toBe(2);
          expect(instancesDs.shape.length).toBe(2);
        } finally {
          file.close();
        }
      } finally {
        h5fs.unlink(tmpPath);
      }
    });
  });
});
