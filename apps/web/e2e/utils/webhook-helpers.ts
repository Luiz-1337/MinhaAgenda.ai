/**
 * Webhook helpers for E2E tests
 * 
 * Provides utilities for:
 * - Making webhook requests
 * - Validating responses
 * - Generating Twilio signatures
 */

import { APIRequestContext, APIResponse } from "@playwright/test";
import crypto from "crypto";

/**
 * Webhook client interface
 */
export interface WebhookClient {
  /** Post a webhook request */
  postWebhook(payload: URLSearchParams, options?: WebhookOptions): Promise<APIResponse>;
  
  /** Post a webhook with signature */
  postWebhookWithSignature(
    payload: URLSearchParams, 
    authToken: string,
    options?: WebhookOptions
  ): Promise<APIResponse>;
  
  /** Get health check */
  getHealth(includeMetrics?: boolean): Promise<APIResponse>;
}

/**
 * Options for webhook requests
 */
export interface WebhookOptions {
  /** Custom headers */
  headers?: Record<string, string>;
  /** Skip signature validation */
  skipSignature?: boolean;
}

/**
 * Creates a webhook client
 */
export function createWebhookClient(request: APIRequestContext): WebhookClient {
  const baseURL = process.env.TEST_BASE_URL || "http://localhost:3000";
  const webhookPath = "/api/webhook/whatsapp";
  const healthPath = "/api/webhook/whatsapp/health";

  return {
    async postWebhook(
      payload: URLSearchParams,
      options?: WebhookOptions
    ): Promise<APIResponse> {
      const headers: Record<string, string> = {
        "Content-Type": "application/x-www-form-urlencoded",
        ...options?.headers,
      };

      return request.post(webhookPath, {
        data: payload.toString(),
        headers,
      });
    },

    async postWebhookWithSignature(
      payload: URLSearchParams,
      authToken: string,
      options?: WebhookOptions
    ): Promise<APIResponse> {
      const url = `${baseURL}${webhookPath}`;
      const signature = generateTwilioSignature(authToken, url, payload);

      const headers: Record<string, string> = {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Twilio-Signature": signature,
        ...options?.headers,
      };

      return request.post(webhookPath, {
        data: payload.toString(),
        headers,
      });
    },

    async getHealth(includeMetrics = false): Promise<APIResponse> {
      const url = includeMetrics ? `${healthPath}?metrics=true` : healthPath;
      return request.get(url);
    },
  };
}

/**
 * Generates a Twilio signature for request validation
 * 
 * @param authToken - Twilio auth token
 * @param url - Full request URL
 * @param params - Request parameters
 * @returns Base64-encoded HMAC-SHA1 signature
 */
export function generateTwilioSignature(
  authToken: string,
  url: string,
  params: URLSearchParams
): string {
  // Sort parameters alphabetically and concatenate
  const sortedParams = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}${value}`)
    .join("");

  const data = url + sortedParams;

  // Generate HMAC-SHA1 signature
  const hmac = crypto.createHmac("sha1", authToken);
  hmac.update(data);

  return hmac.digest("base64");
}

/**
 * Validates a webhook response
 */
export function validateWebhookResponse(
  response: APIResponse,
  expectedStatus = 200
): void {
  if (response.status() !== expectedStatus) {
    throw new Error(
      `Expected status ${expectedStatus}, got ${response.status()}`
    );
  }
}

/**
 * Extracts response body safely
 */
export async function getResponseBody(
  response: APIResponse
): Promise<Record<string, unknown> | string> {
  const contentType = response.headers()["content-type"] || "";

  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch {
      return await response.text();
    }
  }

  return await response.text();
}

/**
 * Waits for the webhook to process (useful for async tests)
 */
export async function waitForProcessing(ms = 1000): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Creates multiple webhook requests in parallel
 */
export async function postMultipleWebhooks(
  client: WebhookClient,
  payloads: URLSearchParams[],
  options?: WebhookOptions
): Promise<APIResponse[]> {
  return Promise.all(
    payloads.map((payload) => client.postWebhook(payload, options))
  );
}

/**
 * Creates multiple webhook requests sequentially
 */
export async function postSequentialWebhooks(
  client: WebhookClient,
  payloads: URLSearchParams[],
  delayMs = 100,
  options?: WebhookOptions
): Promise<APIResponse[]> {
  const responses: APIResponse[] = [];

  for (const payload of payloads) {
    const response = await client.postWebhook(payload, options);
    responses.push(response);

    if (delayMs > 0) {
      await waitForProcessing(delayMs);
    }
  }

  return responses;
}

/**
 * Health check response structure
 */
export interface HealthCheckResponse {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  uptime: number;
  checks: {
    redis: { status: string; latencyMs?: number };
    queue: { status: string; details?: Record<string, number> };
  };
  metrics?: Record<string, unknown>;
}

/**
 * Parses health check response
 */
export async function parseHealthResponse(
  response: APIResponse
): Promise<HealthCheckResponse> {
  return await response.json();
}
