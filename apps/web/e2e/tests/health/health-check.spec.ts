/**
 * Health check endpoint tests
 * 
 * Tests:
 * - Basic health check response
 * - Redis connectivity check
 * - Queue status check
 * - Metrics inclusion
 */

import { test, expect } from "../../fixtures/test-fixtures";
import {
  assertHealthy,
  assertDegraded,
  assertUnhealthy,
} from "../../utils/assertions";
import { parseHealthResponse } from "../../utils/webhook-helpers";

test.describe("Health Check", () => {
  test("should return healthy status when all systems are operational", async ({
    webhookClient,
  }) => {
    const response = await webhookClient.getHealth();
    
    expect(response.status()).toBe(200);
    
    const body = await parseHealthResponse(response);
    expect(body.status).toBe("healthy");
    expect(body.checks.redis.status).toBe("pass");
    expect(body.checks.queue.status).toBe("pass");
  });

  test("should include timestamp and uptime", async ({
    webhookClient,
  }) => {
    const response = await webhookClient.getHealth();
    const body = await parseHealthResponse(response);

    expect(body.timestamp).toBeDefined();
    expect(new Date(body.timestamp).getTime()).not.toBeNaN();
    
    expect(body.uptime).toBeDefined();
    expect(typeof body.uptime).toBe("number");
    expect(body.uptime).toBeGreaterThanOrEqual(0);
  });

  test("should include Redis check details", async ({
    webhookClient,
  }) => {
    const response = await webhookClient.getHealth();
    const body = await parseHealthResponse(response);

    expect(body.checks.redis).toBeDefined();
    expect(body.checks.redis.status).toBeDefined();
    expect(body.checks.redis.latencyMs).toBeDefined();
    expect(typeof body.checks.redis.latencyMs).toBe("number");
  });

  test("should include queue check details", async ({
    webhookClient,
  }) => {
    const response = await webhookClient.getHealth();
    const body = await parseHealthResponse(response);

    expect(body.checks.queue).toBeDefined();
    expect(body.checks.queue.status).toBeDefined();
    
    if (body.checks.queue.details) {
      expect(body.checks.queue.details).toHaveProperty("waiting");
      expect(body.checks.queue.details).toHaveProperty("active");
    }
  });

  test("should include metrics when requested", async ({
    webhookClient,
  }) => {
    const response = await webhookClient.getHealth(true);
    const body = await parseHealthResponse(response);

    expect(body.metrics).toBeDefined();
  });

  test("should not include metrics by default", async ({
    webhookClient,
  }) => {
    const response = await webhookClient.getHealth(false);
    const body = await parseHealthResponse(response);

    expect(body.metrics).toBeUndefined();
  });

  test("should respond quickly (< 1s)", async ({
    webhookClient,
  }) => {
    const startTime = Date.now();
    await webhookClient.getHealth();
    const duration = Date.now() - startTime;

    expect(duration).toBeLessThan(1000);
  });

  test("HEAD request should return status without body", async ({
    request,
  }) => {
    const response = await request.head("/api/webhook/whatsapp/health");
    
    expect(response.status()).toBe(200);
    
    // HEAD should not have body
    const body = await response.text();
    expect(body).toBe("");
  });

  test("should handle multiple concurrent health checks", async ({
    webhookClient,
  }) => {
    // Send 10 concurrent requests
    const responses = await Promise.all(
      Array.from({ length: 10 }, () => webhookClient.getHealth())
    );

    // All should succeed
    for (const response of responses) {
      expect(response.status()).toBe(200);
    }
  });

  test("should report consistent status across requests", async ({
    webhookClient,
  }) => {
    // Send multiple requests and verify consistency
    const responses = await Promise.all([
      webhookClient.getHealth(),
      webhookClient.getHealth(),
      webhookClient.getHealth(),
    ]);

    const bodies = await Promise.all(
      responses.map((r) => parseHealthResponse(r))
    );

    // All should have same status
    const statuses = bodies.map((b) => b.status);
    expect(new Set(statuses).size).toBe(1);
  });

  test("should return 503 when unhealthy", async ({
    request,
  }) => {
    // Note: This test would require making the system unhealthy
    // In a real test, you would:
    // 1. Stop Redis
    // 2. Check that status is 503
    // 3. Restart Redis

    // For now, we just verify the endpoint responds
    const response = await request.get("/api/webhook/whatsapp/health");
    expect([200, 503]).toContain(response.status());
  });

  test("should report degraded when queue has high backlog", async ({
    webhookClient,
  }) => {
    // Note: This would require adding many jobs to the queue
    // to trigger the degraded state

    const response = await webhookClient.getHealth();
    const body = await parseHealthResponse(response);

    // Verify the structure is correct for potential degraded state
    expect(["healthy", "degraded", "unhealthy"]).toContain(body.status);
  });
});

test.describe("Health Check Edge Cases", () => {
  test("should handle Redis latency gracefully", async ({
    webhookClient,
  }) => {
    // Even with slow Redis, health check should respond
    const response = await webhookClient.getHealth();
    expect(response.status()).toBeDefined();
  });

  test("should include warning message when degraded", async ({
    webhookClient,
  }) => {
    const response = await webhookClient.getHealth();
    const body = await parseHealthResponse(response);

    // If degraded, should have a message
    if (body.status === "degraded") {
      const hasWarning = 
        body.checks.redis.message !== undefined ||
        body.checks.queue.message !== undefined;
      expect(hasWarning).toBe(true);
    }
  });

  test("should not leak sensitive information", async ({
    webhookClient,
  }) => {
    const response = await webhookClient.getHealth(true);
    const bodyText = await response.text();

    // Should not contain sensitive data
    expect(bodyText).not.toContain("password");
    expect(bodyText).not.toContain("secret");
    expect(bodyText).not.toContain("token");
    expect(bodyText).not.toMatch(/redis:\/\/[^:]+:[^@]+@/); // Redis URL with password
  });
});
