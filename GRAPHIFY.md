# Graphify — Quick Reference

## Installation
graphify is already installed globally via pip.

## Commands

### Full run (obsidian + wiki):
```bash
graphify . --obsidian --wiki
```

### Install context for Claude Code:
```bash
graphify claude install
```

### Output locations:
- graphify-out/GRAPH_REPORT.md — audit report
- graphify-out/graph.html — interactive graph (browser)
- graphify-out/graph.json — queryable graph data
- graphify-out/obsidian/ — Obsidian vault (968 notes + canvas)
- graphify-out/wiki/ — Agent-crawlable wiki (137 articles)

### When to run:
Run after every major feature or batch of fixes to keep the architecture graph up to date.

### Full update sequence:
```bash
graphify . --obsidian --wiki
graphify claude install
# Then update Architecture_Map.txt and Context_App.txt
```
