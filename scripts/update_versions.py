#!/usr/bin/env python3
"""update_versions.py

Fetch the latest released versions of:
* PyPI package `kernel`
* npm package `@onkernel/sdk`

and update every version constraint inside:
* templates/python/*/pyproject.toml  -> "kernel>=<latest>"
* templates/typescript/*/package.json -> "@onkernel/sdk": ">=<latest>"

If a file is modified, it is overwritten in-place. The script exits with code 0
whether or not modifications were required. However, it prints a summary that is
useful inside CI to decide if a commit is necessary.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import List

try:
    import requests  # type: ignore
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "requests"])
    import requests  # type: ignore

REPO_ROOT = Path(__file__).resolve().parent.parent
PY_TEMPLATES_GLOB = REPO_ROOT / "templates" / "python" / "*" / "pyproject.toml"
TS_TEMPLATES_GLOB = REPO_ROOT / "templates" / "typescript" / "*" / "package.json"


# ---------------------------------------------------------------------------
# Helpers to fetch latest versions
# ---------------------------------------------------------------------------

def _get_latest_pypi_version(package: str) -> str:
    url = f"https://pypi.org/pypi/{package}/json"
    resp = requests.get(url, timeout=10)
    resp.raise_for_status()
    data = resp.json()
    return data["info"]["version"]


def _get_latest_npm_version(package: str) -> str:
    # NPM package names are url-encoded
    import urllib.parse as _up

    encoded = _up.quote(package, safe="")
    url = f"https://registry.npmjs.org/{encoded}"
    resp = requests.get(url, timeout=10)
    resp.raise_for_status()
    data = resp.json()
    return data["dist-tags"]["latest"]


# ---------------------------------------------------------------------------
# Updaters
# ---------------------------------------------------------------------------

_KERN_DEP_REGEX = re.compile(r"(\"kernel)([^\"]*)(\")")


def _update_pyproject(file_path: Path, new_version: str) -> bool:
    """Return True if file changed."""
    text = file_path.read_text()

    # Replace any appearance like "kernel>=0.8.0", "kernel==0.5.0", "kernel~=0.7"
    new_constraint = f'"kernel>={new_version}"'
    new_text = re.sub(r'"kernel[<>=~!0-9.]*"', new_constraint, text)

    if new_text != text:
        file_path.write_text(new_text)
        return True
    return False


def _update_package_json(file_path: Path, new_version: str) -> bool:
    data = json.loads(file_path.read_text())
    changed = False

    for section in ("dependencies", "peerDependencies" , "devDependencies"):
        deps = data.get(section)
        if deps and "@onkernel/sdk" in deps:
            if deps["@onkernel/sdk"] != f">={new_version}":
                deps["@onkernel/sdk"] = f">={new_version}"
                changed = True

    if changed:
        file_path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    return changed


# ---------------------------------------------------------------------------
# Main execution
# ---------------------------------------------------------------------------

def main() -> None:
    latest_kernel = _get_latest_pypi_version("kernel")
    latest_sdk = _get_latest_npm_version("@onkernel/sdk")

    print(f"Latest kernel version on PyPI: {latest_kernel}")
    print(f"Latest @onkernel/sdk version on npm: {latest_sdk}")

    modified_files: List[Path] = []

    # Python templates
    for file_path in REPO_ROOT.glob("templates/python/*/pyproject.toml"):
        if _update_pyproject(file_path, latest_kernel):
            modified_files.append(file_path.relative_to(REPO_ROOT))

    # Typescript templates
    for file_path in REPO_ROOT.glob("templates/typescript/*/package.json"):
        if _update_package_json(file_path, latest_sdk):
            modified_files.append(file_path.relative_to(REPO_ROOT))

    if modified_files:
        print("Updated the following files:")
        for p in modified_files:
            print(f" - {p}")
    else:
        print("All template files already up-to-date. No changes made.")


if __name__ == "__main__":
    main() 
