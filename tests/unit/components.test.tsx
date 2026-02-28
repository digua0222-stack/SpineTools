/**
 * Basic component rendering tests.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { useAppStore } from "@/stores/appStore";

// Mock the useFileIO hook used by WelcomeScreen
vi.mock("@/hooks/useFileIO", () => ({
  useFileIO: () => ({
    openProject: vi.fn(),
    openFromDrop: vi.fn(),
    loading: false,
    error: null,
  }),
}));

// Mock the platform module used by WelcomeScreen
vi.mock("@/lib/platform", () => ({
  isTauri: false,
  isMac: false,
  modKey: "Ctrl",
}));

/** Reset the store between tests. */
function resetStore() {
  useAppStore.setState(useAppStore.getInitialState());
}

describe("Component rendering", () => {
  beforeEach(() => {
    resetStore();
  });

  describe("StatusBar", () => {
    it("renders without crashing", async () => {
      const { StatusBar } = await import(
        "@/components/layout/StatusBar"
      );
      const { container } = render(<StatusBar />);
      expect(container).toBeTruthy();
    });

    it("shows 'No project loaded' when no labels", async () => {
      const { StatusBar } = await import(
        "@/components/layout/StatusBar"
      );
      render(<StatusBar />);
      expect(screen.getByText("No project loaded")).toBeInTheDocument();
    });
  });

  describe("WelcomeScreen", () => {
    it("renders without crashing", async () => {
      const { WelcomeScreen } = await import(
        "@/components/layout/WelcomeScreen"
      );
      const { container } = render(<WelcomeScreen />);
      expect(container).toBeTruthy();
    });

    it("has Open Project button", async () => {
      const { WelcomeScreen } = await import(
        "@/components/layout/WelcomeScreen"
      );
      render(<WelcomeScreen />);
      expect(screen.getByText("Open Project")).toBeInTheDocument();
    });

    it("shows drag and drop hint", async () => {
      const { WelcomeScreen } = await import(
        "@/components/layout/WelcomeScreen"
      );
      render(<WelcomeScreen />);
      expect(
        screen.getByText(/drag and drop a .slp file/i)
      ).toBeInTheDocument();
    });
  });

  describe("VideosPanel", () => {
    it("renders empty state", async () => {
      const { VideosPanel } = await import(
        "@/components/panels/VideosPanel"
      );
      render(<VideosPanel />);
      expect(
        screen.getByText("No videos in project.")
      ).toBeInTheDocument();
    });
  });

  describe("InstancesPanel", () => {
    it("renders empty state", async () => {
      const { InstancesPanel } = await import(
        "@/components/panels/InstancesPanel"
      );
      render(<InstancesPanel />);
      expect(
        screen.getByText("No instances on this frame.")
      ).toBeInTheDocument();
    });
  });
});
