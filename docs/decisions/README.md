# Architecture Decision Records

Use ADRs only for important decisions whose rationale is likely to matter later.

## When to create an ADR

- The decision affects multiple components or boundaries.
- Reasonable alternatives exist.
- Future contributors or agents may ask why the choice was made.

Small implementation choices should remain in Git history or the relevant issue.

## Minimal format

```md
# Title

Status: Proposed | Accepted | Superseded

## Context

Why a decision is needed.

## Options

1. Option A
2. Option B

## Decision

Chosen option.

## Reason

Why it was chosen.

## Consequences

Important trade-offs or follow-up constraints.
```
