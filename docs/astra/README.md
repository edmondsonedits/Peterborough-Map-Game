# Astra / ChatGPT Handoff System

This directory keeps long-running Peterborough 3D work durable while minimizing expensive Astra context usage.

## Normal cycle
1. Regular ChatGPT reads GitHub/state and prepares `ASTRA-EXECUTION-PACKET.md`.
2. Astra executes only that bounded objective, renders/measures what regular chat cannot, and returns a compact factual receipt.
3. Regular ChatGPT independently critiques visual outputs, updates these state files, and performs any safe GitHub-side work before another Astra session.

## Files
- `PROJECT-CHARTER.md` — durable mission, invariants and completion rules.
- `PROJECT-STATE.md` — compact current truth.
- `DECISION-LOG.md` — durable decisions only.
- `REFERENCE-MANIFEST.md` — reference/provenance summary and handling rules.
- `VISUAL-QA.md` — named views, critic findings and outstanding work orders.
- `PERFORMANCE-BASELINE.md` — measured baseline and protocol.
- `NEXT-ACTIONS.md` — 3–7 current priorities; obsolete todos are removed.
- `ASTRA-EXECUTION-PACKET.md` — the smallest practical context for the next Astra execution session.

State documents describe repository truth but never override code or source data. If state and code disagree, verify the code/data and repair the state document.