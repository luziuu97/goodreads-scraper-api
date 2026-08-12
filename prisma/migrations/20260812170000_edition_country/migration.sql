-- Add country fields on editions (Hardcover country / code2).
ALTER TABLE "Edition" ADD COLUMN IF NOT EXISTS "country" TEXT;
ALTER TABLE "Edition" ADD COLUMN IF NOT EXISTS "countryCode" TEXT;
