# CLAUDE.md

GLOBAL CONTEXT: A full representation of the codebase is available in `codebase_graph.md`. ONLY read this file if you need a deep, cross-file architectural understanding of the entire project. For specific, localized edits, DO NOT read this file to save token costs. Instead, use standard grep and specific file reads.

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- After modifying code files in this session, run `python3 -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))"` to keep the graph current

## Graphify
To run graphify: `graphify . --obsidian --wiki && graphify claude install`
See GRAPHIFY.md for full reference.
