# Radius

Graph-native incident response for supply-chain compromises, built on [HydraDB](https://github.com/hydra-db/hydradb).

Radius answers the question every security team asks the moment a package is
flagged compromised: **what's exposed, right now, and what's the smallest
fix that clears it?** It ingests real npm registry data and real synthetic
service ownership into a HydraDB graph, then runs native graph traversal to
compute blast radius, minimal remediation, and related risk signals in
real time.

Built for [Hack Hydra](https://hackhydra.hydradb.com), Track 2A (Repositories,
Dependencies & Code as Graphs).

---

## Demo

**[▶ Watch the demo (2 min)](https://youtu.be/YMfJ2n4opX0)** — blast radius,
minimal remediation, resolution-window audit, and the lockfile exposure check,
running against the real ingested incident.

---

## What it does

- **Blast radius** — given a compromised package version, traverses the real
  dependency graph to find every downstream version and service exposed to it.
- **Minimal remediation** — computes the smallest set of upgrades that clears
  the most exposure, instead of just listing what's affected.
- **Typosquat detection** — ranks similarly-named packages by edit distance
  and real npm download-count disparity.
- **Shared-maintainer / shared-infra detection** — traces human co-maintainers
  and shared CI/publish identity across the dependency graph.
- **Resolution-window audit** — finds which lockfiles resolved to a bad
  version during the actual compromise window.
- **Lockfile exposure check** — upload a real `package-lock.json` and check
  it against the ingested incident, using the lockfile's own fully-resolved
  dependency tree.
- **AI incident summary** — a plain-English narration of already-computed
  blast-radius and remediation results. Strictly a report-writer: it never
  performs traversal or invents a finding, service, or remediation step not
  already returned by HydraDB.
- **Propagation animation** — hop-by-hop visualization of the blast radius,
  built directly on real query results.

### The incident behind the data

Radius ingests a real, documented supply-chain attack: **CVE-2026-45321**
([GHSA-g7cv-rxg3-hmpx](https://github.com/TanStack/router/security/advisories/GHSA-g7cv-rxg3-hmpx)),
the May 2026 TanStack npm compromise — 84 malicious versions published
across 42 real `@tanstack/*` packages within a 6-minute window via a
compromised GitHub Actions trusted-publisher OIDC binding. All package
names, versions, timestamps, and the CVE itself are real and independently
verifiable; only the six "our services" and their lockfiles are synthetic
(Radius is a generic tool with no single company's infrastructure to point
at, so a realistic synthetic layer stands in for "our systems").

---

## Why HydraDB

The core question — *"which of my systems transitively depend on this
compromised version, and what's the minimal fix?"* — is a bounded,
multi-hop graph traversal, not a similarity search or a join a relational
database expresses cleanly at scale.

Radius uses:

- **`algo.SSpaths`** for blast-radius traversal — a single compromised
  `Version` as source, walking `DEPENDS_ON` edges in reverse (`relDirection:
  incoming`) to find every dependent, bounded by hop count.
- **Minimal remediation** runs as a greedy set-cover approximation in
  application code, but over the real subgraph HydraDB's traversal returns
  — not a separate, disconnected computation. This mirrors the standard
  approach to this class of optimization problem (set cover is NP-hard;
  greedy is the standard bounded approximation) layered on top of a real
  traversal, not a HydraDB-native procedure.
- **Typosquat, shared-maintainer, shared-infra, and resolution-window**
  queries are plain Cypher over typed nodes and edges (`SIMILAR_NAME`,
  `MAINTAINS`, `PUBLISHED_BY`, `RESOLVED`), each a real multi-hop or
  property-bounded traversal.

If HydraDB were replaced with a vector database, "transitively depends on"
has no representation in a vector index. Replaced with a relational
database, the same query requires hand-rolled recursive CTEs that don't
scale cleanly to ecosystem-sized graphs.

**Note:** Radius also includes an optional LLM layer that narrates
already-computed structured results without performing or substituting for
traversal (all security-relevant decisions — exposure, remediation — are
deterministic graph queries, never LLM-generated). It requires
`OPENAI_API_KEY`; every query above is built and functional without it.

---

## Architecture

```
npm registry + npm download-stats API (real data)
        │
        ▼
Ingestion scripts (scripts/*.ts)
        │  writes typed nodes/edges via Bolt
        ▼
HydraDB (Docker, built from source)
   Package / Version / Maintainer / Service / Lockfile
   DEPENDS_ON / RESOLVED / USES / MAINTAINS / PUBLISHED_BY / SIMILAR_NAME
        │  algo.SSpaths + Cypher queries
        ▼
Next.js API routes (src/app/api/*)
        │
        ▼
Next.js UI (src/app/*) — homepage, incident detail, lockfile check
```

---

## Prerequisites

- [Node.js](https://nodejs.org) 20+
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- Git

Radius runs entirely locally — clone, build, run. There is no hosted
deployment; HydraDB requires a locally-running server (see [Setup](#setup)).

---

## Setup

### 1. Build HydraDB

HydraDB has no published Docker image at time of writing, so it's built
from source:

```bash
git clone https://github.com/hydra-db/hydradb.git
cd hydradb
docker build --target runtime -t hydradb:local .
```

This compiles a Rust server with native GraphBLAS/libcypher-parser
dependencies — expect 15–30+ minutes on first build.

### 2. Initialize a data volume

```bash
docker run --rm -v hydradb-data:/data --user root --entrypoint sh hydradb:local \
  -c "mkdir -p /data/store /data/cache && printf 'local-development-token-32-bytes\n' > /data/auth-token && chown -R 10001:10001 /data"
```

### 3. Run HydraDB

```bash
docker run -d --name hydradb \
  -p 7687:7687 -p 8443:8443 -p 9090:9090 \
  -v hydradb-data:/data \
  -e CLOUD_PROVIDER=local \
  -e LOCAL_PATH=/data/store \
  -e GRAPH_NAMESPACE=default \
  -e GRAPH_ID=default \
  -e GRAPH_CELL_ID=cell-0 \
  -e GRAPH_CELLS=cell-0 \
  -e GRAPH_NODE_ID=node-0 \
  -e GRAPH_BOLT_NODE_ADDRESSES=node-0=127.0.0.1:7687 \
  -e GRAPH_ADVERTISED_BOLT_ADDR=127.0.0.1:7687 \
  -e GRAPH_DATA_CACHE_DIR=/data/cache \
  -e GRAPH_AUTH_TOKEN_FILE=/data/auth-token \
  -e GRAPH_ALLOW_PLAINTEXT=true \
  -e RUST_MIN_STACK=33554432 \
  hydradb:local
```

`GRAPH_ALLOW_PLAINTEXT=true` is a local-development setting only — a
production deployment needs `GRAPH_TLS_CERTIFICATE`/`GRAPH_TLS_PRIVATE_KEY`
instead.

Verify:

```bash
curl http://127.0.0.1:9090/readyz
```

### 4. Clone Radius and install

```bash
git clone https://github.com/phllp-tanstic/radius.git
cd radius
npm install
cp .env.example .env.local
```

`.env.local` should already match the container config above (see
[Environment variables](#environment-variables)).

### 5. Ingest data

Run in order. Each script is idempotent against a fresh volume:

```bash
npx tsx scripts/fetch-npm-metadata.ts       # real npm registry data, 42 packages
npx tsx scripts/transform-npm-data.ts       # curated version/dependency shaping
npx tsx scripts/load-graph.ts               # Package/Version nodes, DEPENDS_ON edges
npx tsx scripts/load-services.ts            # synthetic Service/Lockfile layer
npx tsx scripts/load-maintainers.ts         # real Maintainer nodes, MAINTAINS/PUBLISHED_BY
npx tsx scripts/fetch-download-counts.ts    # real npm download stats
npx tsx scripts/load-similar-names.ts       # SIMILAR_NAME edges (Levenshtein distance)
```

Re-running ingestion against an already-populated container may fail with
`internal query execution error`. This is an upstream HydraDB limitation in
its local-disk storage backend (`CLOUD_PROVIDER=local`) — `put_opts` with
mode `PutMode::Update` is not yet implemented by `LocalFileSystem`, visible
in `docker logs hydradb`. It is not a Radius bug and does not affect
first-time setup on a fresh volume. If you hit it, recreate the volume and
repeat steps 2–5:

```bash
docker rm -f hydradb && docker volume rm hydradb-data
```

### 6. Run

```bash
npm run dev
```

Open `http://localhost:3000`.

---

## Environment variables

Defined in `.env.local` (copy from `.env.example`):

| Variable | Purpose |
|---|---|
| `HYDRADB_BOLT_URI` | Bolt connection string, e.g. `bolt://127.0.0.1:7687` |
| `HYDRADB_AUTH_TOKEN` | Bearer token matching the container's `/data/auth-token` |
| `HYDRADB_NAMESPACE` | Graph namespace (`default`) — container config, mirrored here for reference; not read by the Next.js app |
| `HYDRADB_GRAPH_ID` | Graph/database identifier (`default`) |
| `HYDRADB_CELL_ID` | Cell identifier (`cell-0`) — container config, mirrored here for reference; not read by the Next.js app |
| `OPENAI_API_KEY` | Required for the AI incident summary feature only — every other feature works without it |
| `OPENAI_EXPLAINER_MODEL` | Optional, defaults to `gpt-4.1-mini` |

Note: use `bolt://`, not `neo4j://` — the latter's cluster-routing
handshake has an intermittent incompatibility with this HydraDB build (see
`docs/HYDRADB_CYPHER_NOTES.md`).

---

## Usage

| Page | Route | Description |
|---|---|---|
| Homepage | `/` | Overview, live ingestion stats, capabilities |
| Incident detail | `/incident` | Select a compromised version → blast radius, remediation, typosquat, shared-infra, resolution-window, propagation animation |
| Check lockfile | `/check-lockfile` | Upload or paste a real `package-lock.json`, check exposure |

API routes (`POST` unless noted):

| Route | Body | Returns |
|---|---|---|
| `/api/blast-radius` | `{ packageName, semver, maxHops? }` | Exposed versions and services |
| `/api/minimal-remediation` | `{ packageName, semver, maxHops? }` | Minimal patch set |
| `/api/typosquat` | `{ packageName }` | Similarly-named packages, ranked |
| `/api/shared-infra` | `{ packageName, semver }` | Shared maintainers and publish-identity |
| `/api/resolution-window` | `{ packageName, semver }` | Lockfiles resolved during the compromise window |
| `/api/incident-summary` | `{ packageName, semver }` | Plain-English narration of real blast-radius and remediation results |
| `/api/check-lockfile` | `{ lockfileContent }` | Exposure findings for an uploaded lockfile |
| `/api/stats`, `/api/versions-list`, `/api/health/hydradb` | `GET` | Ingestion stats, selectable versions, connectivity check |

`maxHops` is optional and defaults to 6; valid range is 1–16. The upper
bound is HydraDB's own limit — its admission control rejects a
`native_path_max_len` above 16.

---

## Project structure

```
scripts/              Ingestion pipeline (run in order, see Setup)
src/app/               Pages and API routes (Next.js App Router)
src/components/         Propagation animation
src/lib/                HydraDB driver, id generation, query modules, lockfile parser
src/data/               Real TanStack incident data (GHSA-sourced)
docs/HYDRADB_CYPHER_NOTES.md   Confirmed HydraDB Cypher subset constraints
test-fixtures/          Sample lockfile for testing the exposure check
```

---

## Data & scope notes

- **Curated, not a full-registry crawl.** 42 packages, 126 versions, 273
  `DEPENDS_ON` edges — the real incident's package family plus enough
  surrounding data for meaningful traversal, per the hackathon's own
  guidance against full-registry ingestion.
- **Malicious tarballs were removed from the public npm registry** as part
  of incident remediation (confirmed directly against the live registry).
  Their real semver strings, publish timestamps, and compromise window are
  preserved exactly; dependency *edges* for those specific versions use the
  nearest still-available real version's dependency data as a disclosed
  substitute (see `scripts/transform-npm-data.ts`).
- **`SHARES_INFRA`** is expressed as a graph traversal over real
  `MAINTAINS`/`PUBLISHED_BY` edges rather than a separate materialized edge
  type — for this dataset's real maintainer/publisher structure, that's the
  more accurate representation of the same signal.
- **No hosted deployment.** Radius runs locally against a locally-run
  HydraDB instance; there is no public URL.

---

## License & attribution

Radius is licensed under the [MIT License](./LICENSE).

HydraDB ([github.com/hydra-db/hydradb](https://github.com/hydra-db/hydradb))
is licensed separately under AGPL-3.0 and is used here as an external,
unmodified dependency accessed over Bolt — no HydraDB source is included in
this repository.

Third-party data and services:

- Package, version, dependency, and maintainer data: the
  [npm registry](https://registry.npmjs.org) (public API)
- Download statistics: the
  [npm download-counts API](https://github.com/npm/registry/blob/master/docs/download-counts.md)
- Incident data: [CVE-2026-45321](https://nvd.nist.gov) /
  [GHSA-g7cv-rxg3-hmpx](https://github.com/TanStack/router/security/advisories/GHSA-g7cv-rxg3-hmpx),
  TanStack's official incident postmortem

Third-party libraries: see `package.json`. Notably
[`neo4j-driver`](https://www.npmjs.com/package/neo4j-driver) (pinned to
`5.20.0` — newer versions have an intermittent handshake-negotiation
incompatibility with this HydraDB build, see `docs/HYDRADB_CYPHER_NOTES.md`)
and the [OpenAI API](https://platform.openai.com) (`gpt-4.1-mini` by
default), used strictly as a report-writer over already-computed graph
results — never for traversal or remediation decisions.