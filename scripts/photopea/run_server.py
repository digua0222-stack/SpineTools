"""Launch a separately checked-out Photopea MCP with Windows native DLLs primed."""
import argparse
import os
import sys
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--upstream", required=True, type=Path)
    args = parser.parse_args()
    root = args.upstream.resolve()
    if not (root / "mcp_server/server.py").is_file():
        parser.error("--upstream must contain mcp_server/server.py")
    sys.path.insert(0, str(root))
    os.chdir(root)
    os.environ.setdefault("PHOTOPEA_ENGINE", "chromium")
    os.environ.setdefault("PHOTOPEA_HEADLESS", "1")
    # Import before FastMCP starts its STDIO reader threads. Lazy NumPy DLL
    # loading hung on the validated Windows host after those threads started.
    import numpy  # noqa: F401
    from PIL import Image  # noqa: F401
    import psd_tools  # noqa: F401
    from mcp_server.server import main as serve
    serve()


if __name__ == "__main__":
    main()
