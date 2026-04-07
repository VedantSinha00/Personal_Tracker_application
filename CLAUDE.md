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
- [Version Update]: Bumped version to 1.2.01 for new release and restored uncommitted local UI changes (CSS/JS tweaks).
