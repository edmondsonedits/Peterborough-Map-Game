# Route Mapping decision practice

Approved scope: implement the six recommendations approved by the user on 2026-10-10. Local worktree only; no publication.

- Player tracing ends at pointer release, supports continuation and stroke undo, and preserves legal wrong turns, loops and bridge choices. Completion requires a road-network arrival within 40 m of the call access; proximity across a disconnected barrier is insufficient.
- Match ordered stroke samples within a zoom-aware 12-40 m road corridor. Do not optimize the player route or silently discard disconnected intent. Use fractional road positions so short strokes do not jump to distant graph nodes.
- Reference routing uses shortest legal distance, including fractional departure/access positions. Preserve available direction and bridge metadata; infer roundabout direction only when no explicit oneway=no.
- Favor meaningful departure/crossing/obstacle decisions from the actual service base, leaving about 20% refreshers. Analyze committed alternatives separately from lawful immediate recovery. Do not delete authoritative dispatch data.
- Credit observed decisions once and attribute extra distance to divergence/rejoin sections. Repeat weaknesses after intervening calls. Preserve ratings; discard obsolete inferred weakness records during migration.
- Address-first header, quieter existing map, explicit drawing/panning control, external accessible zoom buttons, aligned markers, clear arrival status. Reuse existing map/data and dependencies.

Architecture: a pure trace core owns geometry-faithful player routing and fractional endpoints; a pure learning core owns comparison and regret attribution. Existing app owns map/UI, directed reference search, persistence and exercise selection. No modes or provider changes.

Acceptance: 50 m real Station 1 stroke remains partial; alternative bridges and loops survive; invalid/disconnected/one-way traces are rejected without replacing existing work; near-call arrival is network-validated; undo restores the whole prior stroke. Decision scoring covers same-name departure alternatives and bridge commitments. Near ties get fair feedback. Browser controls work while drawing.
