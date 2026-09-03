"""Coordinate contract helpers (design doc section 6).

- source: top-left (0, 0), x right, y down, unit = source image pixel.
- spine: origin at the hip (``setupOrigin``), x right, y up.
- Conversion: ``x_spine = x_source - hip_x``; ``y_spine = hip_y - y_source``.
- All floats keep at least 4 decimal places; rounding happens only at render.
"""

from __future__ import annotations

import math
from typing import Sequence, Tuple

Vector = Tuple[float, float]


def source_to_spine(point: Sequence[float], hip: Sequence[float]) -> Vector:
    return (float(point[0]) - float(hip[0]), float(hip[1]) - float(point[1]))


def spine_to_source(point: Sequence[float], hip: Sequence[float]) -> Vector:
    return (float(point[0]) + float(hip[0]), float(hip[1]) - float(point[1]))


def rotate(vec: Sequence[float], degrees: float) -> Vector:
    """Rotate a vector by ``degrees`` (counter-clockwise, y-up)."""
    rad = math.radians(degrees)
    c, s = math.cos(rad), math.sin(rad)
    return (c * vec[0] - s * vec[1], s * vec[0] + c * vec[1])


def sub(a: Sequence[float], b: Sequence[float]) -> Vector:
    return (a[0] - b[0], a[1] - b[1])


def add(a: Sequence[float], b: Sequence[float]) -> Vector:
    return (a[0] + b[0], a[1] + b[1])


def length(vec: Sequence[float]) -> float:
    return math.hypot(vec[0], vec[1])


def direction_degrees(frm: Sequence[float], to: Sequence[float]) -> float:
    """Angle of the vector frm->to in a y-up frame, degrees in (-180, 180]."""
    return normalize_degrees(math.degrees(math.atan2(to[1] - frm[1], to[0] - frm[0])))


def normalize_degrees(degrees: float) -> float:
    value = (degrees + 180.0) % 360.0 - 180.0
    # Normalize -180 to +180 for stable output.
    return 180.0 if value == -180.0 else value


def round4(value: float) -> float:
    rounded = round(float(value), 4)
    return 0.0 if rounded == 0 else rounded
