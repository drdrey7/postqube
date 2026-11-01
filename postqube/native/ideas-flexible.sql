-- Additive and compatible with the previous runtime. Existing notes/parents are preserved.
ALTER TABLE "IdeaItem" ADD COLUMN IF NOT EXISTS "pinned" BOOLEAN NOT NULL DEFAULT false;
