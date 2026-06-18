"""
pipeline.storage.file - In-memory file representation.
"""

from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass
class File:
    """A file held entirely in memory.

    Parameters
    ----------
    filename:
        Name including extension, e.g. ``"pipeline_results.json"``.
    path:
        Relative directory path from the project root,
        e.g. ``"output/abc123"``.  Does **not** include the filename.
    content:
        The payload — ``str`` for text files, ``bytes`` for binary
        (e.g. PDF).
    """

    filename: str
    path: str
    content: str | bytes

    @property
    def full_path(self) -> str:
        """Return ``path/filename``, e.g. ``"output/abc123/report.pdf"``."""
        return os.path.join(self.path, self.filename)

    @property
    def name(self) -> str:
        """Filename without extension, e.g. ``"report"``."""
        return os.path.splitext(self.filename)[0]

    @property
    def extension(self) -> str:
        """Extension including the dot, e.g. ``".pdf"``."""
        return os.path.splitext(self.filename)[1]

    @property
    def is_binary(self) -> bool:
        return isinstance(self.content, bytes)
