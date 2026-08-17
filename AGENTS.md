# AGENTS.md

## Project

Cornix Bonsai is a keymap editor for Cornix LP.

## Allowed

- Edit project source and documentation.
- Edit `keymap.yaml` when a workspace fixture or example exists.
- Run validation, analysis, diff, render, and export commands.
- Create or update tests and fixtures.
- Create commits and pull requests when requested.

## Forbidden

- Write configuration directly to a physical keyboard.
- Flash firmware.
- Enter or manipulate bootloader / UF2 state.
- Perform reset, clear-peer, or other destructive device operations.

## Design rules

- Keep the Semantic Core independent from React, filesystem, and WebHID details.
- Treat Vial / WebHID as external adapters.
- Distinguish Fact, Inference, Decision, and Open Question in research work.
- Validate uncertain external behavior with research or a minimal spike before fixing architecture around it.
- Record important architectural decisions in `docs/decisions/`.
- Avoid duplicating detailed information across README, issues, ADRs, and other docs.

## Device safety

Device writes require explicit human action. The intended apply flow is: read current state → backup → strict validation → semantic diff → human confirmation → differential write → re-read and verify.
