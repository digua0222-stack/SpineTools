import { afterEach, describe, expect, it, vi } from "../bun-test";
import { act, render, waitFor } from "@testing-library/react";

import { TposeBindingSection } from "@/components/panels/TposeBindingSection";
import zhaoyunBindingManifest from "../../public/demo/zhaoyun/zhaoyun.tpose-bind.json";

const bindingManifest = {
  schema: "tpose-bind/v1",
  atlas: { file: "tpose-detailed/atlas.png", width: 128, height: 128, transparent: true },
  parts: [
    {
      id: "torso",
      name: "Torso",
      rect: [0, 0, 64, 80],
      pivot: [32, 40],
      anchors: [
        { node: "torso", local: [32, 40] },
        { node: "neck", local: [32, 10] },
      ],
      bone: "torso",
      slot: "body",
      z: 0,
      solve: "similarity-2d",
    },
  ],
};

const points = {
  torso: {
    name: "torso",
    x: 100,
    y: 120,
    visible: true,
    complete: true,
    score: 0.9,
  },
  neck: {
    name: "neck",
    x: 100,
    y: 90,
    visible: true,
    complete: true,
    score: 0.9,
  },
};

afterEach(() => vi.unstubAllGlobals());

describe("TposeBindingSection", () => {
  it("loads, evaluates, and displays a portable binding manifest", async () => {
    vi.stubGlobal(
      "fetch",
      async () => new Response(JSON.stringify(bindingManifest), { status: 200 }),
    );
    const view = render(
      <TposeBindingSection
        manifestUrl="/demo/zhaoyun/zhaoyun.tpose-bind.json"
        frameIdx={4}
        frameWidth={320}
        frameHeight={240}
        points={points}
        edges={[{ source: "torso", destination: "neck" }]}
      />,
    );

    await waitFor(() => expect(view.getByText("1 parts")).toBeInTheDocument());
    expect(view.getByText("1/1 resolved")).toBeInTheDocument();
    expect(view.getByText("RMSE 0.0 px")).toBeInTheDocument();
    expect(view.getByTestId("tpose-bound-part-torso")).toBeInTheDocument();
    const atlasImage = view
      .getByTestId("tpose-binding-source-atlas")
      .querySelector("image");
    expect(atlasImage?.getAttribute("href")).toContain(
      "/demo/zhaoyun/tpose-detailed/atlas.png",
    );
  });

  it("loads the bundled Zhao Yun 23-part binding contract", async () => {
    vi.stubGlobal(
      "fetch",
      async () => new Response(JSON.stringify(zhaoyunBindingManifest), { status: 200 }),
    );
    const view = render(
      <TposeBindingSection
        manifestUrl="/demo/zhaoyun/zhaoyun.tpose-bind.json"
        frameIdx={0}
        frameWidth={768}
        frameHeight={768}
        points={points}
        edges={[{ source: "torso", destination: "neck" }]}
      />,
    );

    await waitFor(() => expect(view.getByText("23 parts")).toBeInTheDocument());
    expect(view.getByText("Weapon")).toBeInTheDocument();
    expect(view.getByText("Torso")).toBeInTheDocument();
    expect(view.getByTestId("tpose-binding-component-list").children).toHaveLength(23);
    const atlasImage = view
      .getByTestId("tpose-binding-source-atlas")
      .querySelector("image");
    expect(atlasImage?.getAttribute("href")).toContain(
      "/demo/zhaoyun/tpose-detailed/atlas.png",
    );
  });

  it("uses deterministic previous-frame transforms after a direct seek", async () => {
    vi.stubGlobal(
      "fetch",
      async () => new Response(JSON.stringify(bindingManifest), { status: 200 }),
    );
    const view = render(
      <TposeBindingSection
        manifestUrl="/demo/zhaoyun/zhaoyun.tpose-bind.json"
        frameIdx={1}
        frameWidth={320}
        frameHeight={240}
        points={{}}
        frames={[
          { frameIdx: 0, points },
          { frameIdx: 1, points: {} },
        ]}
        edges={[{ source: "torso", destination: "neck" }]}
      />,
    );

    await waitFor(() => expect(view.getByText("1 parts")).toBeInTheDocument());
    expect(view.getByText("1/1 resolved")).toBeInTheDocument();
    expect(view.getByText("fallback")).toBeInTheDocument();
  });

  it("keeps landmark review available when binding data is absent", async () => {
    vi.stubGlobal("fetch", async () => new Response("", { status: 404 }));
    const view = render(
      <TposeBindingSection
        manifestUrl="/demo/zhaoyun/missing.json"
        frameIdx={0}
        frameWidth={320}
        frameHeight={240}
        points={{}}
        edges={[]}
      />,
    );

    await waitFor(() =>
      expect(view.getByText(/No binding manifest found/)).toBeInTheDocument(),
    );
    expect(view.getByText(/Landmark review is unaffected/)).toBeInTheDocument();
  });

  it("ignores a stale manifest response after the URL changes", async () => {
    const pending: Array<(response: Response) => void> = [];
    vi.stubGlobal(
      "fetch",
      () => new Promise<Response>((resolve) => pending.push(resolve)),
    );
    const view = render(
      <TposeBindingSection
        manifestUrl="/demo/first.json"
        frameIdx={0}
        frameWidth={320}
        frameHeight={240}
        points={points}
        edges={[]}
      />,
    );
    await waitFor(() => expect(pending).toHaveLength(1));

    view.rerender(
      <TposeBindingSection
        manifestUrl="/demo/second.json"
        frameIdx={0}
        frameWidth={320}
        frameHeight={240}
        points={points}
        edges={[]}
      />,
    );
    await waitFor(() => expect(pending).toHaveLength(2));

    await act(async () => {
      pending[1]!(new Response(JSON.stringify(bindingManifest), { status: 200 }));
    });
    await waitFor(() => expect(view.getByText("1 parts")).toBeInTheDocument());

    await act(async () => {
      // This mock deliberately ignores AbortSignal to exercise custom desktop
      // fetch implementations rather than the native fetch happy path.
      pending[0]!(new Response("", { status: 404 }));
    });
    expect(view.getByText("1 parts")).toBeInTheDocument();
    expect(view.queryByText(/No binding manifest found/)).not.toBeInTheDocument();
  });

  it("rejects executable atlas URL schemes", async () => {
    vi.stubGlobal(
      "fetch",
      async () => new Response(JSON.stringify({
        ...bindingManifest,
        atlas: { ...bindingManifest.atlas, file: "javascript:alert(1)" },
      }), { status: 200 }),
    );
    const view = render(
      <TposeBindingSection
        manifestUrl="/demo/binding.json"
        frameIdx={0}
        frameWidth={320}
        frameHeight={240}
        points={points}
        edges={[]}
      />,
    );

    await waitFor(() =>
      expect(view.getByText(/Unsupported T-Pose atlas URL scheme/)).toBeInTheDocument(),
    );
    expect(view.queryByTestId("tpose-binding-preview")).not.toBeInTheDocument();
  });
});
