# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

Pre-implementation. The repository currently contains only IntelliJ IDEA project scaffolding (`.idea/`, `PrescientCalendar.iml`) — no source code, build configuration, README, or dependency manifest exists yet. The IntelliJ module is declared as `GENERAL_MODULE` (language-agnostic), so the target language and toolchain have not been chosen.

When source, a README, or a build file (`pom.xml`, `build.gradle*`, `package.json`, `pyproject.toml`, etc.) is added, expand this file with:
- The actual build / test / run commands once a toolchain exists.
- The high-level architecture once there are multiple files whose relationships aren't obvious from reading any single one.