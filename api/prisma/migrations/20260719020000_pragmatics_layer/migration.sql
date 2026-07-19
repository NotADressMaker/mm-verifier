-- Pragmatics metadata is additive: existing receipts retain their historic meaning.
ALTER TABLE "VerificationClaim" ADD COLUMN "statementType" JSONB;
ALTER TABLE "VerificationClaim" ADD COLUMN "claimContent" JSONB;
ALTER TABLE "VerificationClaim" ADD COLUMN "contentRole" TEXT;
ALTER TABLE "EvidenceRelation" ADD COLUMN "evidenceRelationBasis" TEXT NOT NULL DEFAULT 'unspecified';
ALTER TABLE "EvidenceRelation" ADD COLUMN "basisDetail" TEXT;
