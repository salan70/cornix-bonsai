# Device write boundary

Status: Proposed

## Context

AI agents and normal CLI workflows should not be able to write directly to a physical keyboard without explicit human action.

## Proposed direction

Keep device writes behind a separate, human-confirmed apply boundary with backup, strict validation, semantic diff, write, and re-read verification.

## Open decision

Finalize the boundary after device write failure behavior is researched.
