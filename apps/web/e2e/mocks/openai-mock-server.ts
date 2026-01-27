import http from "http";

/**
 * Recorded call to OpenAI
 */
export interface OpenAICall {
  model: string;
  messages: Array<{ role: string; content: string }>;
  tools?: unknown[];
  timestamp: Date;
}

/**
 * Mock response configuration
 */
export interface OpenAIMockResponse {
  content?: string;
  toolCalls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
  error?: string;
  status?: number;
}

/**
 * OpenAI mock server interface
 */
export interface OpenAIMockServer {
  server: http.Server;
  
  /** Get all recorded calls */
  getCalls(): OpenAICall[];
  
  /** Get the last recorded call */
  getLastCall(): OpenAICall | undefined;
  
  /** Clear all recorded calls */
  clearCalls(): void;
  
  /** Set the next response to return */
  setNextResponse(response: OpenAIMockResponse): void;
  
  /** Queue multiple responses */
  queueResponses(responses: OpenAIMockResponse[]): void;
  
  /** Reset to default behavior */
  reset(): void;
  
  /** Get call count */
  getCallCount(): number;
}

/**
 * Creates an OpenAI mock server
 * 
 * Intercepts:
 * - POST /v1/chat/completions
 */
export function createOpenAIMockServer(): OpenAIMockServer {
  const calls: OpenAICall[] = [];
  const responseQueue: OpenAIMockResponse[] = [];
  let defaultResponse: OpenAIMockResponse = {
    content: "Esta é uma resposta de teste do mock do OpenAI.",
  };

  const server = http.createServer((req, res) => {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      res.writeHead(200, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      });
      res.end();
      return;
    }

    // Only handle POST requests to chat completions endpoint
    if (req.method === "POST" && req.url?.includes("/chat/completions")) {
      let body = "";

      req.on("data", (chunk) => {
        body += chunk.toString();
      });

      req.on("end", () => {
        try {
          const request = JSON.parse(body);

          // Record the call
          calls.push({
            model: request.model || "unknown",
            messages: request.messages || [],
            tools: request.tools,
            timestamp: new Date(),
          });

          // Get response from queue or use default
          const response = responseQueue.shift() || defaultResponse;

          // Check for error response
          if (response.error) {
            res.writeHead(response.status || 500, {
              "Content-Type": "application/json",
            });
            res.end(JSON.stringify({
              error: {
                message: response.error,
                type: "api_error",
                code: response.status || 500,
              },
            }));
            return;
          }

          // Success response
          res.writeHead(200, {
            "Content-Type": "application/json",
          });
          res.end(JSON.stringify(createChatCompletionResponse(response, request.model)));
        } catch (error) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            error: {
              message: "Invalid JSON",
              type: "invalid_request_error",
            },
          }));
        }
      });
    } else {
      // Unknown endpoint
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "Not found" } }));
    }
  });

  return {
    server,
    getCalls: () => [...calls],
    getLastCall: () => calls[calls.length - 1],
    clearCalls: () => {
      calls.length = 0;
    },
    setNextResponse: (response: OpenAIMockResponse) => {
      responseQueue.unshift(response);
    },
    queueResponses: (responses: OpenAIMockResponse[]) => {
      responseQueue.push(...responses);
    },
    reset: () => {
      calls.length = 0;
      responseQueue.length = 0;
    },
    getCallCount: () => calls.length,
  };
}

/**
 * Creates a chat completion response
 */
function createChatCompletionResponse(
  response: OpenAIMockResponse,
  model: string
): Record<string, unknown> {
  const id = `chatcmpl-${generateRandomId()}`;
  const created = Math.floor(Date.now() / 1000);

  const message: Record<string, unknown> = {
    role: "assistant",
    content: response.content || null,
  };

  if (response.toolCalls && response.toolCalls.length > 0) {
    message.tool_calls = response.toolCalls;
    message.content = null;
  }

  return {
    id,
    object: "chat.completion",
    created,
    model: model || "gpt-4o-mini",
    choices: [
      {
        index: 0,
        message,
        logprobs: null,
        finish_reason: response.toolCalls ? "tool_calls" : "stop",
      },
    ],
    usage: {
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
    },
    system_fingerprint: "fp_test123",
  };
}

/**
 * Generates random ID
 */
function generateRandomId(): string {
  return Array.from({ length: 29 }, () => 
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[
      Math.floor(Math.random() * 62)
    ]
  ).join("");
}
