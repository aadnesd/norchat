import { describe, expect, it } from "vitest";
import {
  createStructuredLogger,
  createTypedError,
  serializeTypedError
} from "@norway-support/shared";

describe("shared runtime utilities", () => {
  it("emits structured logger payloads with tenant and trace context", () => {
    const entries: Array<Record<string, unknown>> = [];
    const logger = createStructuredLogger({
      service: "worker",
      context: {
        tenantId: "tenant_1",
        traceId: "trace_1"
      },
      sink: (entry) => {
        entries.push(entry);
      }
    });

    logger.info("job.started", {
      userId: "user_1",
      jobId: "job_1"
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      level: "info",
      message: "job.started",
      service: "worker",
      tenantId: "tenant_1",
      traceId: "trace_1",
      userId: "user_1",
      jobId: "job_1"
    });
    expect(typeof entries[0].timestamp).toBe("string");
  });

  it("serializes typed errors with status, details, and cause", () => {
    const error = createTypedError({
      code: "job_failed",
      message: "job execution failed",
      statusCode: 503,
      details: {
        jobId: "job_1"
      },
      cause: new Error("temporary outage")
    });

    const serialized = serializeTypedError(error);

    expect(serialized).toMatchObject({
      error: "job_failed",
      message: "job execution failed",
      statusCode: 503,
      details: {
        jobId: "job_1"
      },
      cause: "temporary outage"
    });
  });
});
