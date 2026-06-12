"""
MCP tool implementations
All file operations are restricted to the injected base_dir (path traversal prevention)

Multi-token support change:
  Removed single config.BASE_DIR -> switched to base_dir: Path parameter injection.
  base_dir argument added to all public functions / dispatch().
"""
import json
import os
import shutil
import stat
from datetime import datetime
from pathlib import Path

import config as _cfg


class ToolError(Exception):
    pass


def _resolve_safe(path: str, base_dir: Path) -> Path:
    target = (base_dir / path).resolve()
    try:
        target.relative_to(base_dir)
    except ValueError:
        raise ToolError(f"Access denied: path outside base_dir ({path})")

    rel = str(target.relative_to(base_dir))
    for pattern in _cfg.BLOCKED_PATTERNS:
        if rel == pattern or rel.startswith(pattern + os.sep) or rel.startswith(pattern + "/"):
            raise ToolError(f"Access denied: blocked path ({pattern})")

    # 확장자 차단
    if target.suffix.lower() in _cfg.BLOCKED_EXTENSIONS:
        raise ToolError(f"Access denied: blocked file type ({target.suffix})")

    # 파일명 완전 일치 차단
    if target.name in _cfg.BLOCKED_FILENAMES:
        raise ToolError(f"Access denied: blocked filename ({target.name})")

    return target


TOOL_DEFINITIONS = [
    {
        "name": "read_file",
        "description": "Read and return file contents.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "File path (relative to base_dir)"},
            },
            "required": ["path"],
        },
    },
    {
        "name": "write_file",
        "description": "Write content to a file. Creates the file if it does not exist, overwrites if it does.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "path":    {"type": "string", "description": "File path (relative to base_dir)"},
                "content": {"type": "string", "description": "Full content to write"},
            },
            "required": ["path", "content"],
        },
    },
    {
        "name": "create_file",
        "description": "Create a new file. Intermediate directories are created automatically.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "path":    {"type": "string", "description": "File path (relative to base_dir)"},
                "content": {"type": "string", "description": "Initial content (default: empty string)"},
            },
            "required": ["path"],
        },
    },
    {
        "name": "list_directory",
        "description": "Return list of files/directories inside a directory.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Directory path (default: . = base_dir)"},
            },
            "required": [],
        },
    },
    {
        "name": "delete_file",
        "description": "Delete a file. Directories cannot be deleted.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "File path (relative to base_dir)"},
            },
            "required": ["path"],
        },
    },
    {
        "name": "create_directory",
        "description": "Create a new directory (including intermediate directories).",
        "inputSchema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Directory path (relative to base_dir)"},
            },
            "required": ["path"],
        },
    },
    {
        "name": "move_file",
        "description": "Move or rename a file or directory.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "src":  {"type": "string", "description": "Source path (relative to base_dir)"},
                "dest": {"type": "string", "description": "Destination path (relative to base_dir)"},
            },
            "required": ["src", "dest"],
        },
    },
    {
        "name": "copy_file",
        "description": "Copy a file to another location.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "src":  {"type": "string", "description": "Source file path (relative to base_dir)"},
                "dest": {"type": "string", "description": "Destination file path (relative to base_dir)"},
            },
            "required": ["src", "dest"],
        },
    },
    {
        "name": "delete_directory",
        "description": "Delete a directory and all its contents recursively.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Directory path (relative to base_dir)"},
            },
            "required": ["path"],
        },
    },
    {
        "name": "search_files",
        "description": "Search for files by name pattern or content keyword within base_dir.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "pattern":  {"type": "string", "description": "Filename pattern to match (e.g. '*.txt'). Optional."},
                "keyword":  {"type": "string", "description": "Keyword to search inside file contents. Optional."},
                "path":     {"type": "string", "description": "Directory to search in (default: base_dir root)"},
            },
            "required": [],
        },
    },
    {
        "name": "get_file_info",
        "description": "Get metadata of a file or directory: size, modified time, type.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "File or directory path (relative to base_dir)"},
            },
            "required": ["path"],
        },
    },
]


def read_file(path: str, base_dir: Path) -> str:
    target = _resolve_safe(path, base_dir)

    if not target.exists():
        raise ToolError(f"File not found: {path}")
    if not target.is_file():
        raise ToolError(f"Not a file: {path}")

    size = target.stat().st_size
    if size > _cfg.MAX_FILE_SIZE:
        raise ToolError(f"File too large: {size} bytes (max {_cfg.MAX_FILE_SIZE} bytes)")

    return target.read_text(encoding="utf-8", errors="replace")


def write_file(path: str, content: str, base_dir: Path) -> str:
    target = _resolve_safe(path, base_dir)

    if len(content.encode("utf-8")) > _cfg.MAX_FILE_SIZE:
        raise ToolError(f"Content too large (max {_cfg.MAX_FILE_SIZE} bytes)")

    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    return f"Saved: {path} ({len(content)} chars)"


def create_file(path: str, base_dir: Path, content: str = "") -> str:
    target = _resolve_safe(path, base_dir)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    return f"Created: {path}"


def delete_file(path: str, base_dir: Path) -> str:
    target = _resolve_safe(path, base_dir)

    if not target.exists():
        raise ToolError(f"File not found: {path}")
    if not target.is_file():
        raise ToolError(f"Cannot delete directory: {path}")

    try:
        target.unlink()
    except PermissionError:
        try:
            target.chmod(stat.S_IWRITE | stat.S_IREAD)
            target.unlink()
        except PermissionError:
            raise ToolError(
                f"Delete failed - file in use or permission denied: {path}"
            )

    return f"Deleted: {path}"


def create_directory(path: str, base_dir: Path) -> str:
    target = _resolve_safe(path, base_dir)
    target.mkdir(parents=True, exist_ok=True)
    return f"Created directory: {path}"


def move_file(src: str, dest: str, base_dir: Path) -> str:
    src_target  = _resolve_safe(src, base_dir)
    dest_target = _resolve_safe(dest, base_dir)

    if not src_target.exists():
        raise ToolError(f"Source not found: {src}")

    dest_target.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(src_target), str(dest_target))
    return f"Moved: {src} → {dest}"


def copy_file(src: str, dest: str, base_dir: Path) -> str:
    src_target  = _resolve_safe(src, base_dir)
    dest_target = _resolve_safe(dest, base_dir)

    if not src_target.exists():
        raise ToolError(f"Source not found: {src}")
    if not src_target.is_file():
        raise ToolError(f"Source is not a file: {src}")

    dest_target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(str(src_target), str(dest_target))
    return f"Copied: {src} → {dest}"


def delete_directory(path: str, base_dir: Path) -> str:
    target = _resolve_safe(path, base_dir)

    if not target.exists():
        raise ToolError(f"Directory not found: {path}")
    if not target.is_dir():
        raise ToolError(f"Not a directory: {path}")
    if target == base_dir:
        raise ToolError("Cannot delete base_dir itself.")

    shutil.rmtree(str(target))
    return f"Deleted directory: {path}"


def search_files(base_dir: Path, pattern: str = "", keyword: str = "", path: str = ".") -> list[dict]:
    import fnmatch

    search_root = _resolve_safe(path, base_dir)
    if not search_root.is_dir():
        raise ToolError(f"Not a directory: {path}")

    results = []
    for item in search_root.rglob("*"):
        # 차단 경로 필터
        try:
            rel = str(item.relative_to(base_dir))
        except ValueError:
            continue
        if any(
            rel == p or rel.startswith(p + os.sep) or rel.startswith(p + "/")
            for p in _cfg.BLOCKED_PATTERNS
        ):
            continue

        # 파일명 패턴 검색
        if pattern and not fnmatch.fnmatch(item.name, pattern):
            continue

        # 내용 키워드 검색 (파일만)
        if keyword:
            if not item.is_file():
                continue
            if item.stat().st_size > _cfg.MAX_FILE_SIZE:
                continue
            try:
                text = item.read_text(encoding="utf-8", errors="ignore")
                if keyword.lower() not in text.lower():
                    continue
            except Exception:
                continue

        results.append({
            "name": item.name,
            "type": "directory" if item.is_dir() else "file",
            "path": rel.replace("\\", "/"),
        })

        if len(results) >= 100:  # 최대 100개 반환
            break

    return results


def get_file_info(path: str, base_dir: Path) -> dict:
    target = _resolve_safe(path, base_dir)

    if not target.exists():
        raise ToolError(f"Not found: {path}")

    st = target.stat()
    return {
        "name":     target.name,
        "type":     "directory" if target.is_dir() else "file",
        "path":     path,
        "size":     st.st_size if target.is_file() else None,
        "modified": datetime.fromtimestamp(st.st_mtime).strftime("%Y-%m-%d %H:%M:%S"),
        "created":  datetime.fromtimestamp(st.st_ctime).strftime("%Y-%m-%d %H:%M:%S"),
    }


def list_directory(base_dir: Path, path: str = ".") -> list[dict]:
    target = _resolve_safe(path, base_dir)

    if not target.exists():
        raise ToolError(f"Directory not found: {path}")
    if not target.is_dir():
        raise ToolError(f"Not a directory: {path}")

    entries = []
    for item in sorted(target.iterdir()):
        rel = str(item.relative_to(base_dir))
        skip = any(
            rel == pattern or rel.startswith(pattern + os.sep) or rel.startswith(pattern + "/")
            for pattern in _cfg.BLOCKED_PATTERNS
        )
        if skip:
            continue

        entries.append({
            "name": item.name,
            "type": "directory" if item.is_dir() else "file",
            "path": rel.replace("\\", "/"),
            "size": item.stat().st_size if item.is_file() else None,
        })

    return entries


def dispatch(name: str, arguments: dict, base_dir: Path) -> dict:
    """Dispatch tool call with injected base_dir. Returns MCP content format."""
    try:
        if name == "read_file":
            result = read_file(arguments["path"], base_dir)
            return {"content": [{"type": "text", "text": result}]}

        elif name == "write_file":
            result = write_file(arguments["path"], arguments["content"], base_dir)
            return {"content": [{"type": "text", "text": result}]}

        elif name == "create_file":
            result = create_file(arguments["path"], base_dir, arguments.get("content", ""))
            return {"content": [{"type": "text", "text": result}]}

        elif name == "delete_file":
            result = delete_file(arguments["path"], base_dir)
            return {"content": [{"type": "text", "text": result}]}

        elif name == "list_directory":
            result = list_directory(base_dir, arguments.get("path", "."))
            return {"content": [{"type": "text", "text": json.dumps(result, ensure_ascii=False)}]}

        elif name == "create_directory":
            result = create_directory(arguments["path"], base_dir)
            return {"content": [{"type": "text", "text": result}]}

        elif name == "move_file":
            result = move_file(arguments["src"], arguments["dest"], base_dir)
            return {"content": [{"type": "text", "text": result}]}

        elif name == "copy_file":
            result = copy_file(arguments["src"], arguments["dest"], base_dir)
            return {"content": [{"type": "text", "text": result}]}

        elif name == "delete_directory":
            result = delete_directory(arguments["path"], base_dir)
            return {"content": [{"type": "text", "text": result}]}

        elif name == "search_files":
            result = search_files(
                base_dir,
                pattern=arguments.get("pattern", ""),
                keyword=arguments.get("keyword", ""),
                path=arguments.get("path", "."),
            )
            return {"content": [{"type": "text", "text": json.dumps(result, ensure_ascii=False)}]}

        elif name == "get_file_info":
            result = get_file_info(arguments["path"], base_dir)
            return {"content": [{"type": "text", "text": json.dumps(result, ensure_ascii=False)}]}

        else:
            return {
                "isError": True,
                "content": [{"type": "text", "text": f"Unknown tool: {name}"}],
            }

    except ToolError as e:
        return {
            "isError": True,
            "content": [{"type": "text", "text": str(e)}],
        }
    except KeyError as e:
        return {
            "isError": True,
            "content": [{"type": "text", "text": f"Missing required argument: {e}"}],
        }
    except Exception:
        return {
            "isError": True,
            "content": [{"type": "text", "text": "Internal error occurred."}],
        }
