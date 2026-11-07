-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "faceMatchPassed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "faceMatchScore" DOUBLE PRECISION;
