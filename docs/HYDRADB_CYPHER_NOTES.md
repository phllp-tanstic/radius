# HydraDB Cypher Subset — Working Notes

Sourced directly from `cypher-compat.md` in the HydraDB repo
(github.com/hydra-db/hydradb), not inferred from trial and error.
Keep this updated if we discover more constraints during Phase 1+.

## Non-negotiable structural rules

- **Every node needs an `id`** (non-negative integer) to be matched
  precisely. A bare `MATCH (n)` with no id, label, or property predicate
  is rejected outright.
- **Relationship patterns are directed, single-type, single-hop** unless
  using bounded variable-length (`*1..3` — max is required, unbounded `*`
  or `*1..` is rejected).
- **One statement per request.** No semicolon-chained multi-statements.

## RETURN

- Only `<binding>.<property>` projections or aggregates: `count`, `sum`,
  `avg`, `collect`. `count(*)` works; `count(n)` (whole-node) does not.
- No `min`/`max`. No `DISTINCT` inside an aggregate argument.
- `RETURN *` is not executable — always name columns explicitly.
- `ORDER BY`, `SKIP`, `LIMIT`, `DISTINCT` (on the projection) are supported.

## WHERE

- Boolean combos of property comparisons: `=`, `<>`, `<`, `>`, `<=`, `>=`,
  `STARTS WITH` (string/param only).
- **Not supported:** `IN`, `ENDS WITH`, `CONTAINS`, `IS NULL`.

## Writes

- `CREATE`: one or more relationship paths, source + destination id
  required. Cannot chain another clause after it. No variable-length rels.
- `MERGE`: matches on id only, creates if absent. **No `ON CREATE` /
  `ON MATCH`** — apply extra properties via a following `SET` instead.
- `SET` / `REMOVE` / `DELETE` / `DETACH DELETE`: always need a preceding
  `MATCH`. The `id` property itself is immutable.

## Bulk loading — UNWIND

- Input **must** be a parameter (`$rows`) holding a list of maps — never
  an inline list.
- One relationship pattern per batch, one hop, directed.
- Vertex upsert pattern: `MERGE (n {id: row.vertex}) SET n:Label, n.prop = row.prop`
  — do **not** fold extra properties into the `MERGE` pattern itself
  (that rewrites the match identity, and is rejected).
- This only works through the Bolt/client transport, not the in-process
  shard API (`execute_cypher` on a shard rejects all `UNWIND` batch forms
  — scalar params only there).

## Path procedures (the ones Radius actually depends on)

```cypher
CALL algo.SSpaths({sourceNode: 7, relTypes: ['DEPENDS_ON'], maxLen: 11})
  YIELD path
  RETURN path
```

- Three procs: `algo.SPpaths` (single source→target), `algo.SSpaths` (one
  source, many reachable), `algo.MSpaths` (many sources).
- `RETURN` after `CALL` may only reference yielded columns (`path`,
  `pathWeight`, `pathCost`).

## Debugging a query before running it for real

`EXPLAIN` is exposed via the shard API's `explain_opencypher_rows` — same
rejection messages as a real run, without touching data. Useful during
Phase 1 ingestion-query development.