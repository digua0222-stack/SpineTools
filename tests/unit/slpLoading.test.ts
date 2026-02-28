/**
 * Tests for SLP file loading.
 *
 * These tests verify that SLP files from the test fixtures can be loaded
 * using @talmolab/sleap-io.js.
 *
 * @vitest-environment node
 */

import { describe, it, expect } from "vitest";
import { loadSlp } from "@talmolab/sleap-io.js";
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
  // openVideos: false avoids MediaVideoBackend which requires browser APIs
  return loadSlp(arrayBuffer, { openVideos: false });
}

describe("SLP file loading", () => {
  describe("centered_pair.slp", () => {
    it("loads successfully", async () => {
      const labels = await loadFixture("centered_pair.slp");
      expect(labels).toBeDefined();
    });

    it("has videos", async () => {
      const labels = await loadFixture("centered_pair.slp");
      expect(labels.videos.length).toBeGreaterThan(0);
    });

    it("has skeletons", async () => {
      const labels = await loadFixture("centered_pair.slp");
      expect(labels.skeletons.length).toBeGreaterThan(0);
    });

    it("has labeled frames", async () => {
      const labels = await loadFixture("centered_pair.slp");
      expect(labels.labeledFrames.length).toBeGreaterThan(0);
    });

    it("has skeleton with nodes", async () => {
      const labels = await loadFixture("centered_pair.slp");
      const skeleton = labels.skeletons[0];
      expect(skeleton.nodes.length).toBeGreaterThan(0);
    });

    it("has skeleton with edges", async () => {
      const labels = await loadFixture("centered_pair.slp");
      const skeleton = labels.skeletons[0];
      expect(skeleton.edges.length).toBeGreaterThan(0);
    });

    it("has instances on labeled frames", async () => {
      const labels = await loadFixture("centered_pair.slp");
      // At least one labeled frame should have instances
      const hasInstances = labels.labeledFrames.some(
        (lf) => lf.instances.length > 0
      );
      expect(hasInstances).toBe(true);
    });
  });

  describe("minimal_instance.slp", () => {
    it("loads successfully", async () => {
      const labels = await loadFixture("minimal_instance.slp");
      expect(labels).toBeDefined();
    });

    it("has expected structure", async () => {
      const labels = await loadFixture("minimal_instance.slp");
      expect(labels.videos.length).toBeGreaterThan(0);
      expect(labels.skeletons.length).toBeGreaterThan(0);
    });

    it("has labeled frames with instances", async () => {
      const labels = await loadFixture("minimal_instance.slp");
      expect(labels.labeledFrames.length).toBeGreaterThan(0);
      const hasInstances = labels.labeledFrames.some(
        (lf) => lf.instances.length > 0
      );
      expect(hasInstances).toBe(true);
    });
  });

  describe("small_robot_minimal.slp", () => {
    it("loads successfully", async () => {
      const labels = await loadFixture("small_robot_minimal.slp");
      expect(labels).toBeDefined();
    });

    it("has expected structure", async () => {
      const labels = await loadFixture("small_robot_minimal.slp");
      expect(labels.videos.length).toBeGreaterThan(0);
      expect(labels.skeletons.length).toBeGreaterThan(0);
    });

    it("has labeled frames", async () => {
      const labels = await loadFixture("small_robot_minimal.slp");
      expect(labels.labeledFrames.length).toBeGreaterThan(0);
    });
  });
});
