"""
pipeline.storage - In-memory file storage.

Provides ``File`` for representing files that would otherwise be written
to disk, and ``FileStore`` for collecting them by job/run.
"""

from pipeline.storage.file import File
from pipeline.storage.store import FileStore

__all__ = ["File", "FileStore"]
