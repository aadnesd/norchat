import path from "node:path";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { performance } from "node:perf_hooks";

type BenchmarkConfig = {
  userId: string;
  chatConcurrency: number;
  ingestionConcurrency: number;
  requestsPerWorker: number;
  output?: string;
};

type OperationSample = {
  ok: boolean;
  statusCode: number;
  latencyMs: number;
  startedAtMs: number;
  endedAtMs: number;
};

type FlowSummary = {
  requests: number;
  successful: number;
  failed: number;
  errorRatePct: number;
  throughputRps: number;
  latencyMs: {
    min: number;
    max: number;
    avg: number;
    p50: number;
    p90: number;
    p99: number;
  };
};

type CheckResult = {
  name: string;
  pass: boolean;
  actual: number;
  threshold: number;
  operator: "<=" | ">=";
};

type BenchmarkReport = {
  generatedAt: string;
  config: BenchmarkConfig;
  setup: {
    tenantId: string;
    agentId: string;
    chatSourceId: string;
    ingestionSourceIds: string[];
  };
  results: {
    chat: FlowSummary;
    ingestion: FlowSummary;
    combined: FlowSummary;
  };
  slo: {
    thresholds: {
      chat: {
        p50Ms: number;
        p90Ms: number;
        p99Ms: number;
        maxErrorRatePct: number;
      };
      ingestion: {
        p50Ms: number;
        p90Ms: number;
        p99Ms: number;
        maxErrorRatePct: number;
      };
      combined: {
        minThroughputRps: number;
        maxErrorRatePct: number;
      };
    };
    checks: CheckResult[];
    verdict: "pass" | "fail";
  };
};

const defaultConfig: BenchmarkConfig = {
  userId: "user_admin",
  chatConcurrency: 8,
  ingestionConcurrency: 4,
  requestsPerWorker: 20
};

const readCliArgs = () => {
  const args = process.argv.slice(2);
  const values = new Map<string, string>();
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith("--")) {
      continue;
    }
    const [key, inline] = arg.slice(2).split("=", 2);
    if (inline !== undefined) {
      values.set(key, inline);
      continue;
    }
    const next = args[i + 1];
    if (!next || next.startsWith("--")) {
      values.set(key, "true");
      continue;
    }
    values.set(key, next);
    i += 1;
  }
  return values;
};

const readIntArg = (
  args: Map<string, string>,
  name: string,
  fallback: number,
  minimum = 1
) => {
  const raw = args.get(name);
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < minimum) {
    throw new Error(`Invalid --${name} value: ${raw}`);
  }
  return parsed;
};

const round = (value: number, precision = 2) =>
  Number.isFinite(value) ? Number(value.toFixed(precision)) : 0;

const percentile = (values: number[], pct: number) => {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((pct / 100) * sorted.length);
  const index = Math.min(Math.max(rank - 1, 0), sorted.length - 1);
  return sorted[index];
};

const summarizeFlow = (samples: OperationSample[]): FlowSummary => {
  if (samples.length === 0) {
    return {
      requests: 0,
      successful: 0,
      failed: 0,
      errorRatePct: 0,
      throughputRps: 0,
      latencyMs: {
        min: 0,
        max: 0,
        avg: 0,
        p50: 0,
        p90: 0,
        p99: 0
      }
    };
  }

  const successful = samples.filter((sample) => sample.ok).length;
  const failed = samples.length - successful;
  const latencies = samples.map((sample) => sample.latencyMs);
  const minStart = Math.min(...samples.map((sample) => sample.startedAtMs));
  const maxEnd = Math.max(...samples.map((sample) => sample.endedAtMs));
  const elapsedMs = Math.max(maxEnd - minStart, 1);

  return {
    requests: samples.length,
    successful,
    failed,
    errorRatePct: round((failed / samples.length) * 100, 3),
    throughputRps: round(samples.length / (elapsedMs / 1000), 3),
    latencyMs: {
      min: round(Math.min(...latencies), 3),
      max: round(Math.max(...latencies), 3),
      avg: round(latencies.reduce((total, value) => total + value, 0) / latencies.length, 3),
      p50: round(percentile(latencies, 50), 3),
      p90: round(percentile(latencies, 90), 3),
      p99: round(percentile(latencies, 99), 3)
    }
  };
};

const createCheck = (
  name: string,
  actual: number,
  threshold: number,
  operator: "<=" | ">="
): CheckResult => ({
  name,
  actual: round(actual, 3),
  threshold,
  operator,
  pass: operator === "<=" ? actual <= threshold : actual >= threshold
});

const main = async () => {
  const args = readCliArgs();
  const config: BenchmarkConfig = {
    userId: args.get("user-id") ?? defaultConfig.userId,
    chatConcurrency: readIntArg(
      args,
      "chat-concurrency",
      defaultConfig.chatConcurrency
    ),
    ingestionConcurrency: readIntArg(
      args,
      "ingestion-concurrency",
      defaultConfig.ingestionConcurrency
    ),
    requestsPerWorker: readIntArg(
      args,
      "requests-per-worker",
      defaultConfig.requestsPerWorker
    ),
    output: args.get("output")
  };

  const thresholds = {
    chat: {
      p50Ms: 200,
      p90Ms: 400,
      p99Ms: 800,
      maxErrorRatePct: 1
    },
    ingestion: {
      p50Ms: 350,
      p90Ms: 750,
      p99Ms: 1600,
      maxErrorRatePct: 1
    },
    combined: {
      minThroughputRps: 10,
      maxErrorRatePct: 1
    }
  };

  const { buildServer } = await import("../apps/api/src/index.ts");

  const tempRoot = await mkdtemp(path.join(tmpdir(), "norchat-perf-"));
  const vectorStoreDir = path.join(tempRoot, "vector-store");
  const runtimeStoreDir = path.join(tempRoot, "runtime-store");
  await mkdir(vectorStoreDir, { recursive: true });
  await mkdir(runtimeStoreDir, { recursive: true });

  const server = await buildServer({
    vectorStoreDir,
    runtimeStoreDir
  });
  await server.ready();
  server.log.level = "silent";

  try {
    const injectAsAdmin = (options: {
      method: string;
      url: string;
      payload?: unknown;
    }) =>
      server.inject({
        ...options,
        headers: {
          "x-user-id": config.userId
        }
      });

    const assertOk = (response: Awaited<ReturnType<typeof injectAsAdmin>>, step: string) => {
      if (response.statusCode >= 200 && response.statusCode < 300) {
        return;
      }
      throw new Error(
        `${step} failed with ${response.statusCode}: ${response.body}`
      );
    };

    const tenantResponse = await injectAsAdmin({
      method: "POST",
      url: "/tenants",
      payload: {
        name: "Performance Bench Tenant",
        region: "no"
      }
    });
    assertOk(tenantResponse, "create tenant");
    const tenant = tenantResponse.json();

    const agentResponse = await injectAsAdmin({
      method: "POST",
      url: "/agents",
      payload: {
        tenantId: tenant.id,
        name: "Performance Bench Agent"
      }
    });
    assertOk(agentResponse, "create agent");
    const agent = agentResponse.json();

    const chatSourceResponse = await injectAsAdmin({
      method: "POST",
      url: "/sources",
      payload: {
        agentId: agent.id,
        type: "text",
        value: "chat-benchmark-source"
      }
    });
    assertOk(chatSourceResponse, "create chat source");
    const chatSource = chatSourceResponse.json();

    const seedChatResponse = await injectAsAdmin({
      method: "POST",
      url: `/sources/${chatSource.id}/ingest-text`,
      payload: {
        text: "Norchat benchmark baseline: refunds are processed within five business days and shipping updates are available 24/7.",
        chunkSize: 30,
        chunkOverlap: 5
      }
    });
    assertOk(seedChatResponse, "seed chat source");

    const ingestionSourceIds: string[] = [];
    const ingestionSourceCount = Math.max(config.ingestionConcurrency, 1);
    for (let index = 0; index < ingestionSourceCount; index += 1) {
      const sourceResponse = await injectAsAdmin({
        method: "POST",
        url: "/sources",
        payload: {
          agentId: agent.id,
          type: "text",
          value: `ingestion-benchmark-source-${index}`
        }
      });
      assertOk(sourceResponse, `create ingestion source ${index}`);
      ingestionSourceIds.push(sourceResponse.json().id);
    }

    const measure = async (
      operation: () => Promise<Awaited<ReturnType<typeof injectAsAdmin>>>
    ) => {
      const startedAtMs = performance.now();
      try {
        const response = await operation();
        const endedAtMs = performance.now();
        return {
          ok: response.statusCode >= 200 && response.statusCode < 300,
          statusCode: response.statusCode,
          latencyMs: endedAtMs - startedAtMs,
          startedAtMs,
          endedAtMs
        } satisfies OperationSample;
      } catch {
        const endedAtMs = performance.now();
        return {
          ok: false,
          statusCode: 0,
          latencyMs: endedAtMs - startedAtMs,
          startedAtMs,
          endedAtMs
        } satisfies OperationSample;
      }
    };

    const chatSamples: OperationSample[] = [];
    const ingestionSamples: OperationSample[] = [];

    const runChatWorker = async (worker: number) => {
      for (let requestIndex = 0; requestIndex < config.requestsPerWorker; requestIndex += 1) {
        const sample = await measure(() =>
          server.inject({
            method: "POST",
            url: "/chat",
            payload: {
              agentId: agent.id,
              message: `What is the refund timeline? worker=${worker} request=${requestIndex}`,
              maxResults: 3
            }
          })
        );
        chatSamples.push(sample);
      }
    };

    const runIngestionWorker = async (worker: number) => {
      for (let requestIndex = 0; requestIndex < config.requestsPerWorker; requestIndex += 1) {
        const sourceId =
          ingestionSourceIds[(worker + requestIndex) % ingestionSourceIds.length];
        const text = Array.from({ length: 48 }, (_, tokenIndex) =>
          `worker${worker}-request${requestIndex}-token${tokenIndex}`
        ).join(" ");
        const sample = await measure(() =>
          injectAsAdmin({
            method: "POST",
            url: `/sources/${sourceId}/ingest-text`,
            payload: {
              text,
              chunkSize: 24,
              chunkOverlap: 6,
              metadata: {
                benchmarkWorker: worker,
                benchmarkRequest: requestIndex
              }
            }
          })
        );
        ingestionSamples.push(sample);
      }
    };

    await Promise.all([
      ...Array.from({ length: config.chatConcurrency }, (_, index) =>
        runChatWorker(index)
      ),
      ...Array.from({ length: config.ingestionConcurrency }, (_, index) =>
        runIngestionWorker(index)
      )
    ]);

    const chatSummary = summarizeFlow(chatSamples);
    const ingestionSummary = summarizeFlow(ingestionSamples);
    const combinedSummary = summarizeFlow([...chatSamples, ...ingestionSamples]);

    const checks: CheckResult[] = [
      createCheck("chat latency p50", chatSummary.latencyMs.p50, thresholds.chat.p50Ms, "<="),
      createCheck("chat latency p90", chatSummary.latencyMs.p90, thresholds.chat.p90Ms, "<="),
      createCheck("chat latency p99", chatSummary.latencyMs.p99, thresholds.chat.p99Ms, "<="),
      createCheck(
        "chat error rate",
        chatSummary.errorRatePct,
        thresholds.chat.maxErrorRatePct,
        "<="
      ),
      createCheck(
        "ingestion latency p50",
        ingestionSummary.latencyMs.p50,
        thresholds.ingestion.p50Ms,
        "<="
      ),
      createCheck(
        "ingestion latency p90",
        ingestionSummary.latencyMs.p90,
        thresholds.ingestion.p90Ms,
        "<="
      ),
      createCheck(
        "ingestion latency p99",
        ingestionSummary.latencyMs.p99,
        thresholds.ingestion.p99Ms,
        "<="
      ),
      createCheck(
        "ingestion error rate",
        ingestionSummary.errorRatePct,
        thresholds.ingestion.maxErrorRatePct,
        "<="
      ),
      createCheck(
        "combined throughput",
        combinedSummary.throughputRps,
        thresholds.combined.minThroughputRps,
        ">="
      ),
      createCheck(
        "combined error rate",
        combinedSummary.errorRatePct,
        thresholds.combined.maxErrorRatePct,
        "<="
      )
    ];

    const report: BenchmarkReport = {
      generatedAt: new Date().toISOString(),
      config,
      setup: {
        tenantId: tenant.id,
        agentId: agent.id,
        chatSourceId: chatSource.id,
        ingestionSourceIds
      },
      results: {
        chat: chatSummary,
        ingestion: ingestionSummary,
        combined: combinedSummary
      },
      slo: {
        thresholds,
        checks,
        verdict: checks.every((check) => check.pass) ? "pass" : "fail"
      }
    };

    if (config.output) {
      const outputPath = path.resolve(config.output);
      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    }

    console.log(JSON.stringify(report, null, 2));

    if (report.slo.verdict === "fail") {
      process.exitCode = 1;
    }
  } finally {
    await server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
};

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
