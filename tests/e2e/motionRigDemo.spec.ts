import { test, expect } from "@playwright/test";
import path from "path";

const DEMO_ROOT = path.resolve("demo/zhaoyun");

test("Zhao Yun demo loads an editable motion-rig review workspace", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");

  await page.getByTestId("load-zhaoyun-demo").click();
  await expect(page.getByTestId("motion-rig-panel")).toBeVisible({ timeout: 30_000 });
  const closeToast = page.getByRole("button", { name: "Close toast" });
  if (await closeToast.isVisible()) await closeToast.click();

  const reference = page.getByTestId("motion-rig-tpose");
  await expect(reference).toBeVisible();
  await expect
    .poll(() => reference.evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBe(1024);

  await expect(page.getByText("107 frames", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Frame 0 / 106" })).toBeVisible();
  await expect(page.getByText("zhaoyun (18/18 nodes)", { exact: true })).toBeVisible();

  const nextIssue = page.getByRole("button", { name: /Next issue Frame 1/ });
  await expect(nextIssue).toBeEnabled();
  await nextIssue.click();
  await expect(page.getByRole("button", { name: "Frame 1 / 106" })).toBeVisible();

  const lockRoot = page.getByRole("button", { name: "Lock root on frame 1" });
  await lockRoot.click();
  await expect(page.getByRole("button", { name: "Unlock root on frame 1" })).toBeVisible();

  await page.getByLabel("Review notes").fill("Demo 验收：root 已人工确认");
  await page.getByRole("button", { name: "Copy review JSON" }).click();
  await expect(page.getByRole("button", { name: "Copied review JSON" })).toBeVisible();

  const manifest = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
  expect(manifest.schema).toBe("motion-rig-review@1");
  expect(manifest.coordinateSpace).toEqual({ units: "image-pixels", origin: "top-left" });
  expect(manifest.review.lockedPoints).toContain("1:zhaoyun:root");
  expect(manifest.review.notesByFrame["1"]).toBe("Demo 验收：root 已人工确认");
});

test("portable Motion Rig files can be imported with an optional T-Pose", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("motion-rig-file-input").setInputFiles([
    path.join(DEMO_ROOT, "zhaoyun.motionrig.json"),
    path.join(DEMO_ROOT, "assets/银枪三连刺.mp4"),
    path.join(DEMO_ROOT, "assets/tpos分离部件.png"),
  ]);

  await expect(page.getByTestId("motion-rig-panel")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("107 frames", { exact: true })).toBeVisible();
  await expect(page.getByText("zhaoyun (18/18 nodes)", { exact: true })).toBeVisible();
  await expect
    .poll(() =>
      page
        .getByTestId("motion-rig-tpose")
        .evaluate((image) => (image as HTMLImageElement).naturalWidth),
    )
    .toBe(1024);

  // Repeat without a reference image: a generic project must not silently
  // inherit the Zhao Yun T-Pose used by the bundled demo.
  await page.reload();
  await page.getByTestId("motion-rig-file-input").setInputFiles([
    path.join(DEMO_ROOT, "zhaoyun.motionrig.json"),
    path.join(DEMO_ROOT, "assets/银枪三连刺.mp4"),
  ]);
  await expect(page.getByTestId("motion-rig-panel")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("motion-rig-tpose")).toHaveCount(0);
  await expect(page.getByText("No T-Pose reference is attached.", { exact: false })).toBeVisible();
});
