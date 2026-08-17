# Cornix Bonsai

Keymap editor for Cornix LP 💚

Cornix Bonsai is a local-first tool for reading, editing, validating, visualizing, and versioning Cornix LP keymaps from a browser, CLI, Git, and AI agents.

## Status

Early design / research phase.

## Direction

- Cornix LP first
- Semantic model independent from raw Vial representation
- `keymap.yaml` as Git-managed desired state
- Browser UI and CLI sharing the same core
- `.vil` import / export
- Validation, reference analysis, semantic diff, SVG / PDF rendering
- Device read through Vial / WebHID
- Human-confirmed device writes with backup and verification
- AI agents may edit configuration and run checks, but may not write directly to the keyboard

Important architectural decisions are recorded under `docs/decisions/`.
