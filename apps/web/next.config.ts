import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: false, // Desativado: babel-plugin-react-compiler não resolve com webpack/pnpm
  transpilePackages: ["@repo/mcp-server", "@repo/db"],
  // Excluir pacotes do bundling - usam recursos nativos não compatíveis com webpack
  serverExternalPackages: [
    "pino",
    "pino-pretty",
    "thread-stream",
    "bullmq",
    "ioredis",
    // Pacotes pesados usados apenas em API routes / server-side
    "googleapis",
    "google-auth-library",
    "@aws-sdk/client-s3",
    "stripe",
    "pdf-parse",
    "ngrok",
    "qrcode",
  ],
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
  experimental: {
    // Tree-shaking agressivo para pacotes com muitos exports
    optimizePackageImports: [
      "lucide-react",
      "date-fns",
      "recharts",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-select",
      "@radix-ui/react-tabs",
      "@radix-ui/react-tooltip",
      "@radix-ui/react-popover",
    ],
  },
};

export default nextConfig;

