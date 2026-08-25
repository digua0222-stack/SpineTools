#!/usr/bin/env python3
"""Reconstruct a See-through layer export and compare it with the source image."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--layer-json", type=Path, required=True)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--title", default="See-through reconstruction")
    return parser.parse_args()


def load_rgba(path: Path) -> np.ndarray:
    with Image.open(path) as image:
        return np.asarray(image.convert("RGBA"), dtype=np.uint8)


def save_rgba(path: Path, rgba: np.ndarray) -> None:
    Image.fromarray(rgba.astype(np.uint8), mode="RGBA").save(path)


def center_square_pad_resize(rgba: np.ndarray, width: int, height: int) -> np.ndarray:
    source_height, source_width = rgba.shape[:2]
    square_size = max(source_height, source_width)
    square = np.zeros((square_size, square_size, 4), dtype=np.uint8)
    left = (square_size - source_width) // 2
    top = (square_size - source_height) // 2
    square[top : top + source_height, left : left + source_width] = rgba
    if square_size == width == height:
        return square
    return cv2.resize(square, (width, height), interpolation=cv2.INTER_LINEAR)


def resize_rgba(rgba: np.ndarray, width: int, height: int) -> np.ndarray:
    if rgba.shape[1] == width and rgba.shape[0] == height:
        return rgba
    return cv2.resize(rgba, (width, height), interpolation=cv2.INTER_LINEAR)


def reconstruct(layer_info: dict, layer_root: Path) -> tuple[np.ndarray, list[str]]:
    width = int(layer_info["width"])
    height = int(layer_info["height"])
    destination_premultiplied = np.zeros((height, width, 3), dtype=np.float32)
    destination_alpha = np.zeros((height, width, 1), dtype=np.float32)
    order: list[str] = []

    # The JSON is saved in descending depth_median order: back to front.
    for layer in layer_info["layers"]:
        source = load_rgba(layer_root / layer["filename"])
        left = int(layer["left"])
        top = int(layer["top"])
        right = int(layer["right"])
        bottom = int(layer["bottom"])
        expected_width = max(0, right - left)
        expected_height = max(0, bottom - top)
        source = resize_rgba(source, expected_width, expected_height)

        canvas_left = max(0, left)
        canvas_top = max(0, top)
        canvas_right = min(width, right)
        canvas_bottom = min(height, bottom)
        if canvas_left >= canvas_right or canvas_top >= canvas_bottom:
            continue

        source_left = canvas_left - left
        source_top = canvas_top - top
        source_right = source_left + (canvas_right - canvas_left)
        source_bottom = source_top + (canvas_bottom - canvas_top)
        source = source[source_top:source_bottom, source_left:source_right]

        source_rgb = source[..., :3].astype(np.float32) / 255.0
        source_alpha = source[..., 3:4].astype(np.float32) / 255.0
        destination_rgb_region = destination_premultiplied[canvas_top:canvas_bottom, canvas_left:canvas_right]
        destination_alpha_region = destination_alpha[canvas_top:canvas_bottom, canvas_left:canvas_right]

        destination_premultiplied[canvas_top:canvas_bottom, canvas_left:canvas_right] = (
            source_rgb * source_alpha + destination_rgb_region * (1.0 - source_alpha)
        )
        destination_alpha[canvas_top:canvas_bottom, canvas_left:canvas_right] = (
            source_alpha + destination_alpha_region * (1.0 - source_alpha)
        )
        order.append(str(layer["name"]))

    straight_rgb = np.divide(
        destination_premultiplied,
        np.maximum(destination_alpha, 1e-8),
        out=np.zeros_like(destination_premultiplied),
        where=destination_alpha > 1e-8,
    )
    rgba = np.concatenate([straight_rgb, destination_alpha], axis=2)
    return np.clip(np.rint(rgba * 255.0), 0, 255).astype(np.uint8), order


def premultiplied(rgba: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    normalized = rgba.astype(np.float32) / 255.0
    alpha = normalized[..., 3:4]
    return normalized[..., :3] * alpha, alpha


def composite_on(rgba: np.ndarray, background: np.ndarray) -> np.ndarray:
    rgb, alpha = premultiplied(rgba)
    return np.clip(rgb + background * (1.0 - alpha), 0.0, 1.0)


def checkerboard(width: int, height: int, block: int = 24) -> np.ndarray:
    yy, xx = np.indices((height, width))
    parity = ((xx // block) + (yy // block)) % 2
    dark = np.array([0.62, 0.64, 0.68], dtype=np.float32)
    light = np.array([0.82, 0.84, 0.87], dtype=np.float32)
    return np.where(parity[..., None] == 0, light, dark)


def calculate_metrics(reference: np.ndarray, reconstructed: np.ndarray) -> tuple[dict, np.ndarray]:
    reference_premultiplied, reference_alpha = premultiplied(reference)
    reconstructed_premultiplied, reconstructed_alpha = premultiplied(reconstructed)
    reference_mask = reference_alpha[..., 0] > (12 / 255.0)
    reconstructed_mask = reconstructed_alpha[..., 0] > (12 / 255.0)
    intersection = reference_mask & reconstructed_mask
    union = reference_mask | reconstructed_mask

    intersection_pixels = int(np.count_nonzero(intersection))
    union_pixels = int(np.count_nonzero(union))
    reference_pixels = int(np.count_nonzero(reference_mask))
    reconstructed_pixels = int(np.count_nonzero(reconstructed_mask))

    alpha_iou = intersection_pixels / max(1, union_pixels)
    alpha_precision = intersection_pixels / max(1, reconstructed_pixels)
    alpha_recall = intersection_pixels / max(1, reference_pixels)

    reference_vector = np.concatenate([reference_premultiplied, reference_alpha], axis=2)
    reconstructed_vector = np.concatenate([reconstructed_premultiplied, reconstructed_alpha], axis=2)
    absolute_rgba_difference = np.abs(reference_vector - reconstructed_vector)
    premultiplied_rgba_mae = float(np.mean(absolute_rgba_difference))

    gray = np.full(reference_premultiplied.shape, 0.5, dtype=np.float32)
    reference_gray = reference_premultiplied + gray * (1.0 - reference_alpha)
    reconstructed_gray = reconstructed_premultiplied + gray * (1.0 - reconstructed_alpha)
    gray_difference = np.abs(reference_gray - reconstructed_gray)
    gray_mae = float(np.mean(gray_difference))
    gray_mse = float(np.mean((reference_gray - reconstructed_gray) ** 2))
    gray_psnr = math.inf if gray_mse == 0 else float(10.0 * math.log10(1.0 / gray_mse))
    changed_pixels = np.max(gray_difference, axis=2) > (10 / 255.0)

    if intersection_pixels:
        reference_straight = reference[..., :3].astype(np.float32) / 255.0
        reconstructed_straight = reconstructed[..., :3].astype(np.float32) / 255.0
        intersection_rgb_mae = float(
            np.mean(np.abs(reference_straight[intersection] - reconstructed_straight[intersection]))
        )
    else:
        intersection_rgb_mae = 1.0

    heat = np.mean(absolute_rgba_difference, axis=2)
    metrics = {
        "alpha_threshold": 12,
        "reference_foreground_pixels": reference_pixels,
        "reconstructed_foreground_pixels": reconstructed_pixels,
        "intersection_pixels": intersection_pixels,
        "union_pixels": union_pixels,
        "alpha_iou": alpha_iou,
        "alpha_precision": alpha_precision,
        "alpha_recall": alpha_recall,
        "premultiplied_rgba_mae": premultiplied_rgba_mae,
        "gray_composite_mae": gray_mae,
        "gray_composite_psnr_db": gray_psnr,
        "intersection_rgb_mae": intersection_rgb_mae,
        "changed_pixels_over_10_of_255": float(np.mean(changed_pixels)),
    }
    return metrics, heat


def get_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        Path("C:/Windows/Fonts/msyhbd.ttc" if bold else "C:/Windows/Fonts/msyh.ttc"),
        Path("C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size)
    return ImageFont.load_default()


def labelled_panel(rgb: np.ndarray, label: str, detail: str) -> Image.Image:
    image = Image.fromarray(np.clip(np.rint(rgb * 255), 0, 255).astype(np.uint8), mode="RGB")
    label_height = 76
    panel = Image.new("RGB", (image.width, image.height + label_height), (24, 27, 33))
    panel.paste(image, (0, label_height))
    draw = ImageDraw.Draw(panel)
    draw.text((18, 9), label, font=get_font(22, bold=True), fill=(242, 245, 250))
    draw.text((18, 43), detail, font=get_font(13), fill=(187, 194, 205))
    return panel


def create_comparison(
    reference: np.ndarray,
    reconstructed: np.ndarray,
    heat: np.ndarray,
    metrics: dict,
    title: str,
) -> Image.Image:
    height, width = reference.shape[:2]
    checker = checkerboard(width, height)
    reference_view = composite_on(reference, checker)
    reconstructed_view = composite_on(reconstructed, checker)
    overlay = reference_view * 0.5 + reconstructed_view * 0.5

    heat_u8 = np.clip(np.rint(heat * 255.0 * 2.0), 0, 255).astype(np.uint8)
    heat_rgb = cv2.cvtColor(cv2.applyColorMap(heat_u8, cv2.COLORMAP_TURBO), cv2.COLOR_BGR2RGB)
    heat_view = heat_rgb.astype(np.float32) / 255.0

    panels = [
        labelled_panel(reference_view, "原图（同尺度留边）", f"{width}×{height}"),
        labelled_panel(reconstructed_view, "19部件重组", "按 depth_median 从后向前叠加"),
        labelled_panel(overlay, "50% 叠加", "重影越明显，位置或形状差异越大"),
        labelled_panel(
            heat_view,
            "RGBA 差异热图",
            f"Alpha IoU {metrics['alpha_iou'] * 100:.2f}% · MAE {metrics['premultiplied_rgba_mae'] * 100:.2f}%",
        ),
    ]
    panel_width = panels[0].width
    panel_height = panels[0].height
    header_height = 82
    canvas = Image.new("RGB", (panel_width * 2, header_height + panel_height * 2), (16, 18, 23))
    draw = ImageDraw.Draw(canvas)
    draw.text((20, 15), title, font=get_font(28, bold=True), fill=(244, 247, 251))
    draw.text(
        (20, 52),
        "差异度采用预乘RGBA与Alpha轮廓计算；不是感知相似度评分。",
        font=get_font(14),
        fill=(181, 188, 201),
    )
    for index, panel in enumerate(panels):
        x = (index % 2) * panel_width
        y = header_height + (index // 2) * panel_height
        canvas.paste(panel, (x, y))
    return canvas


def write_summary(path: Path, metrics: dict, layer_count: int, order: list[str]) -> None:
    content = f"""# 部件重组差异报告

本报告把 `{layer_count}` 个 RGBA 部件按 `layers.json` 中的顺序（深度中位数由大到小，即从后向前）重组。
原图使用与 See-through 相同的居中正方形留边和双线性缩放后再比较。

| 指标 | 结果 |
|---|---:|
| Alpha 轮廓 IoU | {metrics['alpha_iou'] * 100:.2f}% |
| Alpha 精确率 | {metrics['alpha_precision'] * 100:.2f}% |
| Alpha 召回率 | {metrics['alpha_recall'] * 100:.2f}% |
| 预乘 RGBA 平均绝对误差 | {metrics['premultiplied_rgba_mae'] * 100:.2f}% |
| 灰底合成 RGB 平均绝对误差 | {metrics['gray_composite_mae'] * 100:.2f}% |
| 灰底合成 PSNR | {metrics['gray_composite_psnr_db']:.2f} dB |
| 交集区域 RGB 平均绝对误差 | {metrics['intersection_rgb_mae'] * 100:.2f}% |
| 差异超过 10/255 的像素 | {metrics['changed_pixels_over_10_of_255'] * 100:.2f}% |

`Alpha IoU` 反映整体轮廓覆盖；`预乘 RGBA MAE` 同时计入颜色与透明度。
这些是像素级诊断值，不应当解读为人眼感知质量或 Spine 可用率。

## 叠加顺序

{' → '.join(order)}
"""
    path.write_text(content, encoding="utf-8")


def main() -> None:
    args = parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    layer_json_path = args.layer_json.resolve()
    with layer_json_path.open("r", encoding="utf-8") as file:
        layer_info = json.load(file)

    reconstructed, order = reconstruct(layer_info, layer_json_path.parent)
    reference = center_square_pad_resize(
        load_rgba(args.source.resolve()),
        int(layer_info["width"]),
        int(layer_info["height"]),
    )
    metrics, heat = calculate_metrics(reference, reconstructed)
    metrics.update(
        {
            "canvas_width": int(layer_info["width"]),
            "canvas_height": int(layer_info["height"]),
            "layer_count": len(order),
            "layer_order_back_to_front": order,
        }
    )

    save_rgba(args.output_dir / "source_padded.png", reference)
    save_rgba(args.output_dir / "reconstructed.png", reconstructed)
    comparison = create_comparison(reference, reconstructed, heat, metrics, args.title)
    comparison.save(args.output_dir / "comparison.png")
    with (args.output_dir / "metrics.json").open("w", encoding="utf-8") as file:
        json.dump(metrics, file, ensure_ascii=False, indent=2)
    write_summary(args.output_dir / "README.zh-CN.md", metrics, len(order), order)
    print(json.dumps(metrics, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
