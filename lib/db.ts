import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const db = globalForPrisma.prisma || new PrismaClient();

// Reuse the same client everywhere (also in production) so every request does not open new DB connections.
globalForPrisma.prisma = db;