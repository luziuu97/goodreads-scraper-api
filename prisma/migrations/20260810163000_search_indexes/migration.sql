CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "Work_canonicalTitle_trgm_idx"
ON "Work" USING GIN ("canonicalTitle" gin_trgm_ops);

CREATE INDEX "WorkTitle_normalizedTitle_trgm_idx"
ON "WorkTitle" USING GIN ("normalizedTitle" gin_trgm_ops);

CREATE INDEX "Author_name_trgm_idx"
ON "Author" USING GIN ("name" gin_trgm_ops);

CREATE INDEX "Series_canonicalName_trgm_idx"
ON "Series" USING GIN ("canonicalName" gin_trgm_ops);
