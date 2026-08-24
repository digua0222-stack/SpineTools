from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path

from huggingface_hub import snapshot_download


def load_config(path: Path) -> dict:
    return json.loads(path.read_text("utf-8"))


def directory_size(root: Path) -> int:
    return sum(path.stat().st_size for path in root.rglob("*") if path.is_file())


def valid_existing_model(root: Path, revision: str) -> bool:
    marker = root / ".seethrough-model.json"
    model_index = root / "model_index.json"
    if not marker.is_file() or not model_index.is_file():
        return False
    try:
        return json.loads(marker.read_text("utf-8")).get("revision") == revision
    except (OSError, json.JSONDecodeError):
        return False


def main() -> int:
    parser = argparse.ArgumentParser(description="Download pinned See-through models from Hugging Face.")
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--model-root", type=Path, required=True)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--endpoint", default="")
    args = parser.parse_args()

    config = load_config(args.config)
    args.model_root.mkdir(parents=True, exist_ok=True)
    if args.endpoint:
        os.environ["HF_ENDPOINT"] = args.endpoint.rstrip("/")

    report = {
        "schemaVersion": 1,
        "downloadedAt": datetime.now(timezone.utc).isoformat(),
        "endpoint": os.environ.get("HF_ENDPOINT", "https://huggingface.co"),
        "models": [],
    }

    for model in config["models"]:
        destination = args.model_root / model["directoryName"]
        if valid_existing_model(destination, model["revision"]) and not args.force:
            print(f"[skip] {model['repository']} is already pinned at {model['revision']}", flush=True)
        else:
            destination.mkdir(parents=True, exist_ok=True)
            print(f"[download] {model['repository']} @ {model['revision']}", flush=True)
            snapshot_download(
                repo_id=model["repository"],
                revision=model["revision"],
                local_dir=destination,
            )
            marker = {
                "repository": model["repository"],
                "revision": model["revision"],
                "license": model["license"],
                "downloadedAt": datetime.now(timezone.utc).isoformat(),
            }
            (destination / ".seethrough-model.json").write_text(
                json.dumps(marker, ensure_ascii=False, indent=2) + "\n", "utf-8"
            )

        if not (destination / "model_index.json").is_file():
            raise RuntimeError(f"Incomplete model snapshot: {destination}")
        report["models"].append(
            {
                **model,
                "path": str(destination),
                "bytes": directory_size(destination),
            }
        )

    report_path = args.model_root / "seethrough-models.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", "utf-8")
    print(f"Model report: {report_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
