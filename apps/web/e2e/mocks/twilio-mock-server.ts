import http from "http";

/**
 * Recorded call to Twilio
 */
export interface TwilioCall {
  to: string;
  from: string;
  body: string;
  timestamp: Date;
}

/**
 * Mock response configuration
 */
export interface TwilioMockResponse {
  status?: number;
  body?: Record<string, unknown>;
  error?: string;
}

/**
 * Twilio mock server interface
 */
export interface TwilioMockServer {
  server: http.Server;
  
  /** Get all recorded calls */
  getCalls(): TwilioCall[];
  
  /** Get the last recorded call */
  getLastCall(): TwilioCall | undefined;
  
  /** Clear all recorded calls */
  clearCalls(): void;
  
  /** Set the next response to return */
  setNextResponse(response: TwilioMockResponse): void;
  
  /** Reset to default behavior */
  reset(): void;
  
  /** Get call count */
  getCallCount(): number;
}

/**
 * Creates a Twilio mock server
 * 
 * Intercepts:
 * - POST /2010-04-01/Accounts/{AccountSid}/Messages.json
 */
export function createTwilioMockServer(): TwilioMockServer {
  const calls: TwilioCall[] = [];
  let nextResponse: TwilioMockResponse | null = null;

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

    // Only handle POST requests to Messages endpoint
    if (req.method === "POST" && req.url?.includes("/Messages")) {
      let body = "";

      req.on("data", (chunk) => {
        body += chunk.toString();
      });

      req.on("end", () => {
        // Parse URL-encoded body
        const params = new URLSearchParams(body);
        const to = params.get("To") || "";
        const from = params.get("From") || "";
        const messageBody = params.get("Body") || "";

        // Record the call
        calls.push({
          to,
          from,
          body: messageBody,
          timestamp: new Date(),
        });

        // Check for custom response
        if (nextResponse) {
          const response = nextResponse;
          nextResponse = null; // Reset after use

          if (response.error) {
            res.writeHead(response.status || 500, {
              "Content-Type": "application/json",
            });
            res.end(JSON.stringify({
              code: response.status || 500,
              message: response.error,
              status: response.status || 500,
            }));
            return;
          }

          res.writeHead(response.status || 201, {
            "Content-Type": "application/json",
          });
          res.end(JSON.stringify(response.body || createSuccessResponse(to, from, messageBody)));
          return;
        }

        // Default success response
        res.writeHead(201, {
          "Content-Type": "application/json",
        });
        res.end(JSON.stringify(createSuccessResponse(to, from, messageBody)));
      });
    } else {
      // Unknown endpoint
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
    }
  });

  return {
    server,
    getCalls: () => [...calls],
    getLastCall: () => calls[calls.length - 1],
    clearCalls: () => {
      calls.length = 0;
    },
    setNextResponse: (response: TwilioMockResponse) => {
      nextResponse = response;
    },
    reset: () => {
      calls.length = 0;
      nextResponse = null;
    },
    getCallCount: () => calls.length,
  };
}

/**
 * Creates a successful Twilio message response
 */
function createSuccessResponse(to: string, from: string, body: string): Record<string, unknown> {
  const sid = `SM${generateRandomHex(32)}`;
  
  return {
    sid,
    date_created: new Date().toISOString(),
    date_updated: new Date().toISOString(),
    date_sent: null,
    account_sid: "ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    to,
    from,
    messaging_service_sid: null,
    body,
    status: "queued",
    num_segments: "1",
    num_media: "0",
    direction: "outbound-api",
    api_version: "2010-04-01",
    price: null,
    price_unit: "USD",
    error_code: null,
    error_message: null,
    uri: `/2010-04-01/Accounts/ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX/Messages/${sid}.json`,
  };
}

/**
 * Generates random hex string
 */
function generateRandomHex(length: number): string {
  return Array.from({ length }, () => 
    Math.floor(Math.random() * 16).toString(16)
  ).join("");
}
