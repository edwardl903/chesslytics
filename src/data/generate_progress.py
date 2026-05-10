"""
Ephemeral JSON progress files for POST /generate (subprocess cannot stream to HTTP).

The CLI runner and processor call write_generate_progress(); Flask exposes GET
/generate/progress and clears the file after the subprocess finishes.
"""

from __future__ import annotations

import json
import os
import re
from typing import Any, Dict, Optional


def _project_root() -> str:
    return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def _safe_slug(username: str) -> str:
    return re.sub(r"[^\w\-]", "_", username, flags=re.I)[:120]


def progress_file_path(username: str, year: str) -> str:
    slug = _safe_slug(username)
    y = str(year).replace("/", "_")
    return os.path.join(_project_root(), "data", "json", f".generate_progress_{slug}_{y}.json")


def write_generate_progress(username: str, year: str, payload: Dict[str, Any]) -> None:
    """Merge with previous progress so fields like games survive stage updates."""
    path = progress_file_path(username, year)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    prev: Dict[str, Any] = {}
    if os.path.isfile(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                prev = json.load(f)
        except (json.JSONDecodeError, OSError):
            prev = {}
    merged = {**prev, **payload}
    if "games" in prev and "games" not in payload:
        merged["games"] = prev["games"]
    merged["username"] = username
    merged["year"] = str(year)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(merged, f)


def clear_generate_progress(username: str, year: str) -> None:
    path = progress_file_path(username, year)
    try:
        if os.path.isfile(path):
            os.remove(path)
    except OSError:
        pass


def read_generate_progress(username: str, year: str) -> Optional[Dict[str, Any]]:
    path = progress_file_path(username, year)
    if not os.path.isfile(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return None
