import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const PRISMA_IDLE_DISCONNECT_MS = 15_000;

function withPoolLimits(databaseUrl: string | undefined): string | undefined {
  if (!databaseUrl) return databaseUrl;
  try {
    const url = new URL(databaseUrl);
    if (!url.searchParams.has("connection_limit")) {
      url.searchParams.set("connection_limit", "5");
    }
    if (!url.searchParams.has("pool_timeout")) {
      url.searchParams.set("pool_timeout", "20");
    }
    return url.toString();
  } catch {
    return databaseUrl;
  }
}

const pooledUrl = withPoolLimits(process.env.DATABASE_URL);
if (pooledUrl) {
  process.env.DATABASE_URL = pooledUrl;
}

function createPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  const scheduleIdleDisconnect = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      client.$disconnect().catch(() => {});
    }, PRISMA_IDLE_DISCONNECT_MS);
  };

  return client.$extends({
    query: {
      async $allOperations({ query, args }) {
        try {
          return await query(args);
        } finally {
          scheduleIdleDisconnect();
        }
      },
    },
  }) as unknown as PrismaClient;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

globalForPrisma.prisma = prisma;
