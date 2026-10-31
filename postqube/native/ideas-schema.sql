-- CreateTable
CREATE TABLE "IdeaItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "parentId" TEXT,
    "title" TEXT NOT NULL,
    "blocks" JSONB NOT NULL DEFAULT '[]',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "IdeaItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IdeaItem_organizationId_kind_parentId_deletedAt_idx" ON "IdeaItem"("organizationId", "kind", "parentId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdeaItem_id_organizationId_key" ON "IdeaItem"("id", "organizationId");

-- AddForeignKey
ALTER TABLE "IdeaItem" ADD CONSTRAINT "IdeaItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdeaItem" ADD CONSTRAINT "IdeaItem_parentId_organizationId_fkey" FOREIGN KEY ("parentId", "organizationId") REFERENCES "IdeaItem"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

