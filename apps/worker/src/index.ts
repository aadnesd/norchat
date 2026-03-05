import { fileURLToPath } from "node:url";

const DEFAULT_POLL_INTERVAL_MS = 5000;

export function parsePollInterval(value = process.env.WORKER_POLL_INTERVAL_MS): number {
  if (value === undefined) {
    return DEFAULT_POLL_INTERVAL_MS;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("WORKER_POLL_INTERVAL_MS must be a positive integer");
  }

  return parsed;
}

export function runWorkerTick(now = new Date()): string {
  return `[worker] heartbeat ${now.toISOString()}`;
}

export function startWorker(log: Pick<Console, "info"> = console): NodeJS.Timeout {
  const pollIntervalMs = parsePollInterval();
  log.info(`[worker] started (poll interval: ${pollIntervalMs}ms)`);

  return setInterval(() => {
    log.info(runWorkerTick());
  }, pollIntervalMs);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startWorker();
}
