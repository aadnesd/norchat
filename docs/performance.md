# Performance Benchmark Harness and SLO Gates

This repository includes a repeatable load benchmark for concurrent chat + ingestion traffic:

- Harness: `scripts/load-test.ts`
- Command: `npm run perf:load`
- Manual CI entry point: `.github/workflows/performance-bench.yml` (`workflow_dispatch`)

## Run locally

```bash
npm run perf:load -- --output artifacts/performance/local-report.json
```

Optional runtime knobs:

- `--chat-concurrency` (default `8`)
- `--ingestion-concurrency` (default `4`)
- `--requests-per-worker` (default `20`)
- `--user-id` (default `user_admin`)
- `--output` (optional JSON report path)

The harness seeds a tenant/agent/source, then runs chat and ingestion requests concurrently. Output includes per-flow and combined:

- latency: `p50`, `p90`, `p99`, min/max/avg
- throughput: requests per second
- error rate

## Initial SLO thresholds

| Scope | Metric | Threshold |
| --- | --- | --- |
| Chat | p50 latency | <= 200 ms |
| Chat | p90 latency | <= 400 ms |
| Chat | p99 latency | <= 800 ms |
| Chat | error rate | <= 1% |
| Ingestion (`/sources/:id/ingest-text`) | p50 latency | <= 350 ms |
| Ingestion (`/sources/:id/ingest-text`) | p90 latency | <= 750 ms |
| Ingestion (`/sources/:id/ingest-text`) | p99 latency | <= 1600 ms |
| Ingestion (`/sources/:id/ingest-text`) | error rate | <= 1% |
| Combined traffic | throughput | >= 10 req/s |
| Combined traffic | error rate | <= 1% |

## Regression criteria (sprint gate)

A benchmark run is **pass** only when all threshold checks pass. Any single threshold breach is a **regression** and fails the run with non-zero exit code.

For sprint acceptance, record at least one passing run report from the harness output (local or workflow-dispatch run) and attach the JSON evidence to the issue/PR.

## CI/manual run

1. Open **Actions** in GitHub.
2. Run **Performance Benchmarks** workflow.
3. (Optional) Override concurrency/request inputs.
4. Download `performance-report` artifact and review the SLO verdict + metrics.
