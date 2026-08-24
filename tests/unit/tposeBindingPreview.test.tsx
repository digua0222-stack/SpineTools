import { describe, expect, it } from "../bun-test";
import { fireEvent, render } from "@testing-library/react";

import {
  TposeBindingPreview,
  type TposeBindingViewManifest,
  type TposeBindingViewSolution,
} from "@/components/panels/TposeBindingPreview";

const manifest: TposeBindingViewManifest = {
  atlas: { file: "atlas.png", width: 256, height: 128 },
  parts: [
    {
      id: "torso",
      name: "Torso",
      rect: [0, 0, 64, 80],
      pivot: [32, 40],
      anchors: [
        { node: "torso", local: [0, 0] },
        { node: "neck", local: [0, -20] },
      ],
      bone: "torso",
      slot: "body",
      z: 0,
    },
    {
      id: "arm_front",
      name: "Front arm",
      rect: [80, 0, 40, 72],
      pivot: [10, 10],
      anchors: [{ node: "wrist_front", local: [20, 40] }],
      bone: "shoulder_front",
      slot: "arm-front",
      z: 3,
    },
  ],
};

const solutions: TposeBindingViewSolution[] = manifest.parts.map((part, index) => ({
  id: part.id,
  name: part.name,
  bone: part.bone,
  slot: part.slot,
  z: part.z,
  sourceRect: part.rect,
  pivot: part.pivot,
  visible: true,
  status: index === 0 ? "solved" : "translation-fallback",
  transform: {
    x: 100 + index * 40,
    y: 100,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    matrix: { a: 1, b: 0, c: 0, d: 1, tx: 100 + index * 40, ty: 100 },
  },
  rmse: index === 0 ? 1.5 : 5,
  maxError: index === 0 ? 2 : 5,
  usedAnchorCount: part.anchors.length,
}));

const points = {
  torso: {
    name: "torso",
    x: 100,
    y: 100,
    visible: true,
    complete: true,
    score: 0.9,
  },
  neck: {
    name: "neck",
    x: 100,
    y: 80,
    visible: true,
    complete: true,
    score: 0.9,
  },
  wrist_front: {
    name: "wrist_front",
    x: 160,
    y: 140,
    visible: true,
    complete: true,
    score: 0.8,
  },
};

function renderPreview() {
  return render(
    <TposeBindingPreview
      manifest={manifest}
      solutions={solutions}
      atlasUrl="/demo/zhaoyun/tpose-detailed/atlas.png"
      frameIdx={12}
      frameWidth={320}
      frameHeight={240}
      points={points}
      edges={[
        { source: "torso", destination: "neck" },
        { source: "neck", destination: "wrist_front" },
      ]}
    />,
  );
}

describe("TposeBindingPreview", () => {
  it("renders source parts, mapped metadata, bound layers, and overlays", () => {
    const view = renderPreview();

    expect(view.getByTestId("tpose-binding-source-atlas")).toBeInTheDocument();
    expect(view.getByTestId("tpose-bound-part-torso")).toBeInTheDocument();
    expect(view.getByTestId("tpose-bound-part-arm_front")).toBeInTheDocument();
    expect(view.getByText("bone torso · slot body · z 0")).toBeInTheDocument();
    expect(view.getAllByTestId("tpose-binding-bone")).toHaveLength(2);
    expect(view.getAllByTestId("tpose-binding-anchor")).toHaveLength(2);
    expect(view.getAllByTestId("tpose-binding-error")).toHaveLength(2);
    expect(view.getByText("Frame 12")).toBeInTheDocument();
  });

  it("selects a component, toggles its visibility, and honors master controls", () => {
    const view = renderPreview();
    const initialSelection = view.getByTestId("tpose-binding-source-selection");
    expect(initialSelection.getAttribute("x")).toBe("0");

    fireEvent.click(view.getByText("Front arm").closest("button")!);
    expect(view.getByTestId("tpose-binding-source-selection").getAttribute("x")).toBe("80");

    fireEvent.click(view.getByRole("button", { name: "Hide Front arm" }));
    expect(view.queryByTestId("tpose-bound-part-arm_front")).not.toBeInTheDocument();
    expect(view.getByText("1/2 visible")).toBeInTheDocument();

    fireEvent.click(view.getByRole("button", { name: "Toggle all binding overlays" }));
    expect(view.queryByTestId("tpose-binding-bone")).not.toBeInTheDocument();

    fireEvent.click(view.getByRole("button", { name: "Toggle all bound parts" }));
    expect(view.getByText("Binding preview hidden")).toBeInTheDocument();
  });

  it("surfaces an atlas load failure instead of leaving a silent blank preview", () => {
    const view = renderPreview();
    const atlasImage = view
      .getByTestId("tpose-binding-source-atlas")
      .querySelector("image");
    expect(atlasImage).not.toBeNull();

    fireEvent.error(atlasImage!);

    expect(view.getByTestId("tpose-binding-atlas-error")).toHaveTextContent(
      "T-Pose atlas could not be loaded",
    );
  });

  it("marks a manifest-hidden part unavailable instead of claiming it is visible", () => {
    const hiddenManifest: TposeBindingViewManifest = {
      ...manifest,
      parts: manifest.parts.map((part) =>
        part.id === "arm_front" ? { ...part, visible: false } : part,
      ),
    };
    const hiddenSolutions = solutions.map((solution) =>
      solution.id === "arm_front" ? { ...solution, visible: false } : solution,
    );
    const view = render(
      <TposeBindingPreview
        manifest={hiddenManifest}
        solutions={hiddenSolutions}
        atlasUrl="/demo/zhaoyun/tpose-detailed/atlas.png"
        frameIdx={12}
        frameWidth={320}
        frameHeight={240}
        points={points}
        edges={[]}
      />,
    );

    expect(view.getByText("1/2 visible")).toBeInTheDocument();
    expect(view.queryByTestId("tpose-bound-part-arm_front")).not.toBeInTheDocument();

    const unavailable = view.getByRole("button", { name: "Front arm unavailable" });
    expect(unavailable).toBeDisabled();
    expect(unavailable).toHaveAttribute("aria-pressed", "false");
  });
});
