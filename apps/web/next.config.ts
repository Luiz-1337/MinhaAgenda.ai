import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  transpilePackages: ["@repo/mcp-server", "@repo/db"],
  // Excluir pino do bundling - usa worker threads que não são compatíveis com Turbopack
  serverExternalPackages: ["pino", "pino-pretty", "thread-stream"],
};

export default nextConfig;
