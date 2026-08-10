-- CreateTable
CREATE TABLE "Work" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "canonicalTitle" TEXT NOT NULL,
    "originalLanguage" TEXT,
    "publicationYear" INTEGER,
    "averageRating" DOUBLE PRECISION,
    "ratingsCount" INTEGER,
    "reviewsCount" INTEGER,
    "textReviewsCount" INTEGER,
    "popularityScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Work_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkTranslation" (
    "id" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "WorkTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkTitle" (
    "id" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "language" TEXT,
    "title" TEXT NOT NULL,
    "normalizedTitle" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT,

    CONSTRAINT "WorkTitle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Series" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "booksCount" INTEGER,

    CONSTRAINT "Series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeriesTranslation" (
    "id" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "SeriesTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkSeries" (
    "workId" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "position" DOUBLE PRECISION,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "WorkSeries_pkey" PRIMARY KEY ("workId","seriesId")
);

-- CreateTable
CREATE TABLE "Author" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,

    CONSTRAINT "Author_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkContributor" (
    "workId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'AUTHOR',
    "position" INTEGER NOT NULL DEFAULT 0,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "WorkContributor_pkey" PRIMARY KEY ("workId","authorId","role")
);

-- CreateTable
CREATE TABLE "EditionContributor" (
    "editionId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'AUTHOR',
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EditionContributor_pkey" PRIMARY KEY ("editionId","authorId","role")
);

-- CreateTable
CREATE TABLE "Edition" (
    "id" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'OTHER',
    "language" TEXT,
    "isbn10" TEXT,
    "isbn13" TEXT,
    "asin" TEXT,
    "publisher" TEXT,
    "publicationDate" TEXT,
    "pages" INTEGER,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "ratingsCount" INTEGER,
    "textReviewsCount" INTEGER,
    "popularityScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Edition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EditionCover" (
    "id" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "pixelCount" INTEGER,
    "imageFormat" TEXT DEFAULT 'jpeg',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EditionCover_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Genre" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Genre_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GenreOnWork" (
    "workId" TEXT NOT NULL,
    "genreId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'canonical',
    "score" INTEGER,

    CONSTRAINT "GenreOnWork_pkey" PRIMARY KEY ("workId","genreId","source")
);

-- CreateTable
CREATE TABLE "WorkExternalId" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "workId" TEXT NOT NULL,

    CONSTRAINT "WorkExternalId_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EditionExternalId" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,

    CONSTRAINT "EditionExternalId_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthorExternalId" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,

    CONSTRAINT "AuthorExternalId_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeriesExternalId" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,

    CONSTRAINT "SeriesExternalId_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Work_slug_key" ON "Work"("slug");

-- CreateIndex
CREATE INDEX "Work_canonicalTitle_idx" ON "Work"("canonicalTitle");

-- CreateIndex
CREATE INDEX "Work_ratingsCount_idx" ON "Work"("ratingsCount");

-- CreateIndex
CREATE INDEX "Work_popularityScore_idx" ON "Work"("popularityScore");

-- CreateIndex
CREATE UNIQUE INDEX "WorkTranslation_workId_language_key" ON "WorkTranslation"("workId", "language");

-- CreateIndex
CREATE INDEX "WorkTitle_normalizedTitle_idx" ON "WorkTitle"("normalizedTitle");

-- CreateIndex
CREATE INDEX "WorkTitle_workId_language_idx" ON "WorkTitle"("workId", "language");

-- CreateIndex
CREATE UNIQUE INDEX "WorkTitle_workId_language_normalizedTitle_key" ON "WorkTitle"("workId", "language", "normalizedTitle");

-- CreateIndex
CREATE UNIQUE INDEX "Series_slug_key" ON "Series"("slug");

-- CreateIndex
CREATE INDEX "Series_canonicalName_idx" ON "Series"("canonicalName");

-- CreateIndex
CREATE UNIQUE INDEX "SeriesTranslation_seriesId_language_key" ON "SeriesTranslation"("seriesId", "language");

-- CreateIndex
CREATE INDEX "WorkSeries_seriesId_position_idx" ON "WorkSeries"("seriesId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Author_slug_key" ON "Author"("slug");

-- CreateIndex
CREATE INDEX "Author_name_idx" ON "Author"("name");

-- CreateIndex
CREATE INDEX "WorkContributor_authorId_idx" ON "WorkContributor"("authorId");

-- CreateIndex
CREATE INDEX "WorkContributor_workId_isPrimary_idx" ON "WorkContributor"("workId", "isPrimary");

-- CreateIndex
CREATE INDEX "EditionContributor_authorId_idx" ON "EditionContributor"("authorId");

-- CreateIndex
CREATE INDEX "Edition_workId_idx" ON "Edition"("workId");

-- CreateIndex
CREATE INDEX "Edition_isbn10_idx" ON "Edition"("isbn10");

-- CreateIndex
CREATE INDEX "Edition_isbn13_idx" ON "Edition"("isbn13");

-- CreateIndex
CREATE INDEX "Edition_asin_idx" ON "Edition"("asin");

-- CreateIndex
CREATE INDEX "Edition_popularityScore_idx" ON "Edition"("popularityScore");

-- CreateIndex
CREATE INDEX "EditionCover_editionId_idx" ON "EditionCover"("editionId");

-- CreateIndex
CREATE UNIQUE INDEX "EditionCover_editionId_url_key" ON "EditionCover"("editionId", "url");

-- CreateIndex
CREATE UNIQUE INDEX "Genre_name_key" ON "Genre"("name");

-- CreateIndex
CREATE INDEX "GenreOnWork_genreId_idx" ON "GenreOnWork"("genreId");

-- CreateIndex
CREATE INDEX "WorkExternalId_workId_idx" ON "WorkExternalId"("workId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkExternalId_provider_externalId_key" ON "WorkExternalId"("provider", "externalId");

-- CreateIndex
CREATE INDEX "EditionExternalId_editionId_idx" ON "EditionExternalId"("editionId");

-- CreateIndex
CREATE UNIQUE INDEX "EditionExternalId_provider_externalId_key" ON "EditionExternalId"("provider", "externalId");

-- CreateIndex
CREATE INDEX "AuthorExternalId_authorId_idx" ON "AuthorExternalId"("authorId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthorExternalId_provider_externalId_key" ON "AuthorExternalId"("provider", "externalId");

-- CreateIndex
CREATE INDEX "SeriesExternalId_seriesId_idx" ON "SeriesExternalId"("seriesId");

-- CreateIndex
CREATE UNIQUE INDEX "SeriesExternalId_provider_externalId_key" ON "SeriesExternalId"("provider", "externalId");

-- AddForeignKey
ALTER TABLE "WorkTranslation" ADD CONSTRAINT "WorkTranslation_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkTitle" ADD CONSTRAINT "WorkTitle_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeriesTranslation" ADD CONSTRAINT "SeriesTranslation_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkSeries" ADD CONSTRAINT "WorkSeries_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkSeries" ADD CONSTRAINT "WorkSeries_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkContributor" ADD CONSTRAINT "WorkContributor_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkContributor" ADD CONSTRAINT "WorkContributor_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Author"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditionContributor" ADD CONSTRAINT "EditionContributor_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "Edition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditionContributor" ADD CONSTRAINT "EditionContributor_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Author"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Edition" ADD CONSTRAINT "Edition_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditionCover" ADD CONSTRAINT "EditionCover_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "Edition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenreOnWork" ADD CONSTRAINT "GenreOnWork_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenreOnWork" ADD CONSTRAINT "GenreOnWork_genreId_fkey" FOREIGN KEY ("genreId") REFERENCES "Genre"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkExternalId" ADD CONSTRAINT "WorkExternalId_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditionExternalId" ADD CONSTRAINT "EditionExternalId_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "Edition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthorExternalId" ADD CONSTRAINT "AuthorExternalId_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Author"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeriesExternalId" ADD CONSTRAINT "SeriesExternalId_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series"("id") ON DELETE CASCADE ON UPDATE CASCADE;
