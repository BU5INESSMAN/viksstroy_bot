"""Guard against production-only React crashes from missing motion imports."""

from pathlib import Path
import re


FRONTEND_SRC = Path(__file__).resolve().parents[1] / "frontend" / "src"


def test_every_motion_component_imports_motion():
    missing = []
    for path in FRONTEND_SRC.rglob("*.jsx"):
        source = path.read_text(encoding="utf-8")
        executable = re.sub(r"/\*.*?\*/", "", source, flags=re.DOTALL)
        executable = re.sub(r"//[^\n]*", "", executable)
        if re.search(r"<motion\.", executable) and not re.search(
            r"import\s*\{[^}]*\bmotion\b[^}]*\}\s*from\s*['\"]framer-motion['\"]",
            executable,
        ):
            missing.append(str(path.relative_to(FRONTEND_SRC)))

    assert not missing, "Missing framer-motion import: " + ", ".join(missing)
