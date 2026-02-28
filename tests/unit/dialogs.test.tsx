/**
 * Tests for dialog components.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useAppStore } from "@/stores/appStore";

// Mock platform module
vi.mock("@/lib/platform", () => ({
  isTauri: false,
  isMac: false,
  modKey: "Ctrl",
}));

/** Reset the store between tests. */
function resetStore() {
  useAppStore.setState(useAppStore.getInitialState());
}

describe("Dialog components", () => {
  beforeEach(() => {
    resetStore();
  });

  describe("GoToFrameDialog", () => {
    it("renders when open", async () => {
      useAppStore.getState().setGoToFrameDialogOpen(true);

      const { GoToFrameDialog } = await import(
        "@/components/dialogs/GoToFrameDialog"
      );
      render(<GoToFrameDialog />);

      expect(screen.getByText("Go to Frame")).toBeInTheDocument();
    });

    it("does not render content when closed", async () => {
      useAppStore.getState().setGoToFrameDialogOpen(false);

      const { GoToFrameDialog } = await import(
        "@/components/dialogs/GoToFrameDialog"
      );
      render(<GoToFrameDialog />);

      expect(screen.queryByText("Go to Frame")).not.toBeInTheDocument();
    });

    it("has an input for frame number", async () => {
      useAppStore.getState().setGoToFrameDialogOpen(true);

      const { GoToFrameDialog } = await import(
        "@/components/dialogs/GoToFrameDialog"
      );
      render(<GoToFrameDialog />);

      const input = screen.getByRole("spinbutton");
      expect(input).toBeInTheDocument();
    });

    it("has Go and Cancel buttons", async () => {
      useAppStore.getState().setGoToFrameDialogOpen(true);

      const { GoToFrameDialog } = await import(
        "@/components/dialogs/GoToFrameDialog"
      );
      render(<GoToFrameDialog />);

      expect(screen.getByText("Go")).toBeInTheDocument();
      expect(screen.getByText("Cancel")).toBeInTheDocument();
    });

    it("shows valid range when video has shape", async () => {
      const video = {
        filename: "test.mp4",
        shape: [100, 480, 640, 3],
        backend: null,
        source_video: null,
      };
      useAppStore.setState({
        video: video as unknown as import("@/types").Video,
        goToFrameDialogOpen: true,
      });

      const { GoToFrameDialog } = await import(
        "@/components/dialogs/GoToFrameDialog"
      );
      render(<GoToFrameDialog />);

      expect(screen.getByText("Valid range: 0 to 99")).toBeInTheDocument();
    });
  });

  describe("TrainingDialog", () => {
    it("renders when open", async () => {
      useAppStore.getState().setTrainingDialogOpen(true);

      const { TrainingDialog } = await import(
        "@/components/dialogs/TrainingDialog"
      );
      render(<TrainingDialog />);

      expect(screen.getByText("Training Configuration")).toBeInTheDocument();
    });

    it("does not render content when closed", async () => {
      useAppStore.getState().setTrainingDialogOpen(false);

      const { TrainingDialog } = await import(
        "@/components/dialogs/TrainingDialog"
      );
      render(<TrainingDialog />);

      expect(
        screen.queryByText("Training Configuration")
      ).not.toBeInTheDocument();
    });

    it("shows Coming Soon badge", async () => {
      useAppStore.getState().setTrainingDialogOpen(true);

      const { TrainingDialog } = await import(
        "@/components/dialogs/TrainingDialog"
      );
      render(<TrainingDialog />);

      const badges = screen.getAllByText("Coming Soon");
      expect(badges.length).toBeGreaterThanOrEqual(1);
    });

    it("has Cancel button", async () => {
      useAppStore.getState().setTrainingDialogOpen(true);

      const { TrainingDialog } = await import(
        "@/components/dialogs/TrainingDialog"
      );
      render(<TrainingDialog />);

      expect(screen.getByText("Cancel")).toBeInTheDocument();
    });

    it("has disabled Start Training button", async () => {
      useAppStore.getState().setTrainingDialogOpen(true);

      const { TrainingDialog } = await import(
        "@/components/dialogs/TrainingDialog"
      );
      render(<TrainingDialog />);

      const startButton = screen.getByText("Start Training").closest("button");
      expect(startButton).toBeDisabled();
    });

    it("shows Model Type selector", async () => {
      useAppStore.getState().setTrainingDialogOpen(true);

      const { TrainingDialog } = await import(
        "@/components/dialogs/TrainingDialog"
      );
      render(<TrainingDialog />);

      expect(screen.getByText("Model Type")).toBeInTheDocument();
    });

    it("shows Training Profile selector", async () => {
      useAppStore.getState().setTrainingDialogOpen(true);

      const { TrainingDialog } = await import(
        "@/components/dialogs/TrainingDialog"
      );
      render(<TrainingDialog />);

      expect(screen.getByText("Training Profile")).toBeInTheDocument();
    });

    it("shows sleap-nn integration info", async () => {
      useAppStore.getState().setTrainingDialogOpen(true);

      const { TrainingDialog } = await import(
        "@/components/dialogs/TrainingDialog"
      );
      render(<TrainingDialog />);

      expect(
        screen.getByText("sleap-nn integration planned")
      ).toBeInTheDocument();
    });
  });

  describe("InferenceDialog", () => {
    it("renders when open", async () => {
      useAppStore.getState().setInferenceDialogOpen(true);

      const { InferenceDialog } = await import(
        "@/components/dialogs/InferenceDialog"
      );
      render(<InferenceDialog />);

      // "Run Inference" appears in both title and button, so use getAllByText
      const elements = screen.getAllByText("Run Inference");
      expect(elements.length).toBeGreaterThanOrEqual(1);
    });

    it("does not render content when closed", async () => {
      useAppStore.getState().setInferenceDialogOpen(false);

      const { InferenceDialog } = await import(
        "@/components/dialogs/InferenceDialog"
      );
      render(<InferenceDialog />);

      expect(screen.queryByText("Run Inference")).not.toBeInTheDocument();
    });

    it("shows Coming Soon badge", async () => {
      useAppStore.getState().setInferenceDialogOpen(true);

      const { InferenceDialog } = await import(
        "@/components/dialogs/InferenceDialog"
      );
      render(<InferenceDialog />);

      const badges = screen.getAllByText("Coming Soon");
      expect(badges.length).toBeGreaterThanOrEqual(1);
    });

    it("has Cancel button", async () => {
      useAppStore.getState().setInferenceDialogOpen(true);

      const { InferenceDialog } = await import(
        "@/components/dialogs/InferenceDialog"
      );
      render(<InferenceDialog />);

      expect(screen.getByText("Cancel")).toBeInTheDocument();
    });

    it("has disabled Run Inference button", async () => {
      useAppStore.getState().setInferenceDialogOpen(true);

      const { InferenceDialog } = await import(
        "@/components/dialogs/InferenceDialog"
      );
      render(<InferenceDialog />);

      // Find the Run Inference button (not the title)
      const buttons = screen.getAllByRole("button");
      const runButton = buttons.find(
        (b) => b.textContent?.includes("Run Inference") && b.tagName === "BUTTON"
      );
      expect(runButton).toBeDefined();
      expect(runButton).toBeDisabled();
    });

    it("shows Model selector", async () => {
      useAppStore.getState().setInferenceDialogOpen(true);

      const { InferenceDialog } = await import(
        "@/components/dialogs/InferenceDialog"
      );
      render(<InferenceDialog />);

      expect(screen.getByText("Model")).toBeInTheDocument();
    });

    it("shows Tracking Method selector", async () => {
      useAppStore.getState().setInferenceDialogOpen(true);

      const { InferenceDialog } = await import(
        "@/components/dialogs/InferenceDialog"
      );
      render(<InferenceDialog />);

      expect(screen.getByText("Tracking Method")).toBeInTheDocument();
    });

    it("shows sleap-nn integration info", async () => {
      useAppStore.getState().setInferenceDialogOpen(true);

      const { InferenceDialog } = await import(
        "@/components/dialogs/InferenceDialog"
      );
      render(<InferenceDialog />);

      expect(
        screen.getByText("sleap-nn integration planned")
      ).toBeInTheDocument();
    });
  });
});
