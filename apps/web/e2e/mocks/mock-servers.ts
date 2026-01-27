import http from "http";
import { TwilioMockServer, createTwilioMockServer } from "./twilio-mock-server";
import { OpenAIMockServer, createOpenAIMockServer } from "./openai-mock-server";

/**
 * Mock servers container
 */
export interface MockServers {
  twilioServer: TwilioMockServer;
  twilioPort: number;
  openaiServer: OpenAIMockServer;
  openaiPort: number;
}

// Default ports for mock servers
const TWILIO_MOCK_PORT = 3001;
const OPENAI_MOCK_PORT = 3002;

/**
 * Starts all mock servers
 */
export async function startMockServers(): Promise<MockServers> {
  // Start Twilio mock server
  const twilioServer = createTwilioMockServer();
  const twilioPort = await startServer(twilioServer.server, TWILIO_MOCK_PORT);

  // Start OpenAI mock server
  const openaiServer = createOpenAIMockServer();
  const openaiPort = await startServer(openaiServer.server, OPENAI_MOCK_PORT);

  return {
    twilioServer,
    twilioPort,
    openaiServer,
    openaiPort,
  };
}

/**
 * Stops all mock servers
 */
export async function stopMockServers(servers: MockServers): Promise<void> {
  await Promise.all([
    stopServer(servers.twilioServer.server),
    stopServer(servers.openaiServer.server),
  ]);
}

/**
 * Starts an HTTP server on the specified port
 */
async function startServer(server: http.Server, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        // Port in use, try next port
        server.listen(port + 1);
      } else {
        reject(err);
      }
    });

    server.on("listening", () => {
      const address = server.address();
      const actualPort = typeof address === "object" ? address?.port : port;
      resolve(actualPort || port);
    });

    server.listen(port);
  });
}

/**
 * Stops an HTTP server
 */
async function stopServer(server: http.Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

// Re-export types
export type { TwilioMockServer } from "./twilio-mock-server";
export type { OpenAIMockServer } from "./openai-mock-server";
