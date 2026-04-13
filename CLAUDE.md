# Project Standards & Handoff Guide

## 1. Core Principles
- **Sequence:** Always follow `Specify → Plan → Task → Implement`.
- **Deterministic Code:** Provide exact values and hex codes; never use vague goals.
- **Scope:** Define exactly what to touch AND what not to touch in every prompt.

## 2. Structured Communication (XML)
Use these semantic layers for all complex tasks:
- `<technical_context>`: Stack, frameworks, and constraints.
- `<functional_requirements>`: User behavior and acceptance criteria.
- `<integration_details>`: API, state, and edge cases.
- `<verification_protocol>`: Test commands or audit steps.

## 3. Persistent Constraints
- **Always:** Use Red/Green TDD (write tests first).
- **Ask First:** Before adding new dependencies or changing database schemas.
- **Never:** Commit to Git automatically; never bypass safety checks.

## 4. Intent Inheritance (Decision Log)
*Record major architectural changes here to maintain intent across chat resets*.

- [Project Standards]: Added `CLAUDE.md` to enforce systematic workflow (Specify → Plan → Task → Implement) and deterministic code standards.
- [Version Update]: Bumped version to 1.2.2 for new release and fixed version metadata mismatch (standardized on SemVer).
- [Week Transition & Sync]: Bumped version to 1.2.4. Implemented robust week-rollover detection (persistent last-seen Monday), hardened sync by fixing UUID identifier syntax (Supabase compliant), and resolved stopwatch flickering. Made carry-forward logic automatic (removed prompt dialog), and resolved a critical UI persistent bug restricting category deletion.
- [Performance & Reliability]: Bumped version to 1.2.5. Implemented "Optimistic Rendering" for instant startup on reload. Optimized Lucide icon rendering by adding element-scoping to prevent expensive full-DOM scans. Fixed a critical responsive bug in the stopwatch start button by switching to `closest()` delegation. Resolved "ghost scrolling" in the Stack tab by adding `preventScroll: true` to focus logic. Unified UI aesthetic by applying premium dropdown styles to the stopwatch modal.

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- After modifying code files in this session, run `python3 -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))"` to keep the graph current
