import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: false, // Desativado: babel-plugin-react-compiler não resolve com webpack/pnpm
  transpilePackages: ["@repo/mcp-server", "@repo/db"],
  // Excluir pacotes do bundling - usam recursos nativos não compatíveis com webpack
  serverExternalPackages: [
    "pino",
    "pino-pretty",
    "thread-stream",
    "bullmq",
    "ioredis",
  ],
};

export default nextConfig;

