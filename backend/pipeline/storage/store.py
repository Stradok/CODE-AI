"""
pipeline.storage.store - In-memory file collection with optional disk flush.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field

from pipeline.storage.file import File


@dataclass
class FileStore:
    """A keyed collection of :class:`File` objects.

    Files are stored by their ``full_path`` (relative to the project root).
    Call :meth:`flush` to write all files to disk.
    """

    _files: dict[str, File] = field(default_factory=dict)

    def put(self, f: File) -> None:
        """Add or overwrite a file in the store."""
        self._files[f.full_path] = f

    def get(self, full_path: str) -> File | None:
        """Retrieve a file by its full relative path, or ``None``."""
        return self._files.get(full_path)

    def exists(self, full_path: str) -> bool:
        return full_path in self._files

    def remove(self, full_path: str) -> bool:
        """Remove a file. Returns ``True`` if it existed."""
        return self._files.pop(full_path, None) is not None

    def list(self, prefix: str = "") -> list[File]:
        """Return all files whose ``full_path`` starts with *prefix*."""
        return [f for key, f in self._files.items() if key.startswith(prefix)]

    def clear(self, prefix: str = "") -> None:
        """Remove all files, or only those matching *prefix*."""
        if not prefix:
            self._files.clear()
        else:
            keys = [k for k in self._files if k.startswith(prefix)]
            for k in keys:
                del self._files[k]

    def flush(self, base_dir: str = ".") -> list[str]:
        """Write every file in the store to disk under *base_dir*.

        Creates directories as needed.  Returns the list of absolute
        paths written.
        """
        written: list[str] = []
        for f in self._files.values():
            dest = os.path.join(base_dir, f.full_path)
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            if f.is_binary:
                with open(dest, "wb") as fh:
                    fh.write(f.content)
            else:
                with open(dest, "w", encoding="utf-8") as fh:
                    fh.write(f.content)
            written.append(os.path.abspath(dest))
        return written
