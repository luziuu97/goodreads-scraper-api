CREATE TABLE "DataConflict" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "existingWorkId" TEXT,
    "incomingWorkId" TEXT,
    "provider" TEXT,
    "incomingData" JSONB,
    "resolution" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    CONSTRAINT "DataConflict_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DataConflict_type_resolution_idx" ON "DataConflict"("type", "resolution");
CREATE INDEX "DataConflict_identifier_idx" ON "DataConflict"("identifier");
