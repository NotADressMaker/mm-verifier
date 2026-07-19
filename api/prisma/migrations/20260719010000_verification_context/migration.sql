-- Verification context is additive. Existing receipt-like task records remain untouched.
CREATE TABLE "VerificationProgram" (
 "id" TEXT PRIMARY KEY, "organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
 "name" TEXT NOT NULL, "description" TEXT NOT NULL, "version" INTEGER NOT NULL, "domain" TEXT NOT NULL,
 "claimExtractionPolicy" JSONB NOT NULL, "evidenceAdmissibilityRules" JSONB NOT NULL, "sourceIndependenceRules" JSONB NOT NULL,
 "materialityRules" JSONB NOT NULL, "contradictionRules" JSONB NOT NULL, "verdictThresholds" JSONB NOT NULL,
 "abstentionRules" JSONB NOT NULL, "modelRoles" JSONB NOT NULL, "jurisdictionLocale" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "archivedAt" TIMESTAMP(3), "createdBy" TEXT NOT NULL, UNIQUE("organizationId", "name", "version"));
CREATE TABLE "VerificationReceipt" (
 "id" TEXT PRIMARY KEY, "organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
 "taskId" TEXT REFERENCES "VerificationTask"("id") ON DELETE SET NULL, "verificationProgramId" TEXT REFERENCES "VerificationProgram"("id") ON DELETE RESTRICT,
 "status" TEXT NOT NULL DEFAULT 'PENDING', "contextVersion" TEXT NOT NULL DEFAULT 'context-v1', "contextSnapshot" JSONB,
 "receiptHash" TEXT, "verdict" TEXT, "verdictExplanation" TEXT, "evidenceCoverage" DOUBLE PRECISION,
 "supportedClaimRatio" DOUBLE PRECISION, "contradictedClaimRatio" DOUBLE PRECISION, "independentSupportCount" INTEGER NOT NULL DEFAULT 0,
 "unresolvedMaterialContradictions" INTEGER NOT NULL DEFAULT 0, "limitations" JSONB, "signerMetadata" JSONB, "onchainAnchorMetadata" JSONB,
 "previousReceiptId" TEXT REFERENCES "VerificationReceipt"("id") ON DELETE RESTRICT, "reverifyReason" TEXT,
 "contextChanged" BOOLEAN NOT NULL DEFAULT false, "programChanged" BOOLEAN NOT NULL DEFAULT false, "evidenceChanged" BOOLEAN NOT NULL DEFAULT false,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "completedAt" TIMESTAMP(3));
CREATE TABLE "VerificationClaim" ("id" TEXT PRIMARY KEY, "receiptId" TEXT NOT NULL REFERENCES "VerificationReceipt"("id") ON DELETE CASCADE, "parentClaimId" TEXT REFERENCES "VerificationClaim"("id") ON DELETE RESTRICT, "sourceSpan" JSONB, "originalText" TEXT NOT NULL, "normalizedText" TEXT NOT NULL, "claimType" TEXT NOT NULL, "materialityWeight" DOUBLE PRECISION NOT NULL, "assumptions" JSONB, "scope" JSONB, "status" TEXT NOT NULL, "version" INTEGER NOT NULL DEFAULT 1, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE "EvidenceRelation" ("id" TEXT PRIMARY KEY, "claimId" TEXT NOT NULL REFERENCES "VerificationClaim"("id") ON DELETE CASCADE, "evidenceId" TEXT NOT NULL, "relationType" TEXT NOT NULL, "weight" DOUBLE PRECISION, "rationale" TEXT, "sourceIndependenceGroup" TEXT, "reviewerOrModelProvenance" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE "VerificationTransition" ("id" TEXT PRIMARY KEY, "receiptId" TEXT NOT NULL REFERENCES "VerificationReceipt"("id") ON DELETE CASCADE, "claimId" TEXT, "previousState" JSONB, "nextState" JSONB NOT NULL, "reason" TEXT NOT NULL, "triggeringEvidenceOrAction" JSONB, "actor" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "VerificationProgram_organizationId_name_archivedAt_idx" ON "VerificationProgram"("organizationId", "name", "archivedAt");
CREATE INDEX "VerificationReceipt_organizationId_createdAt_idx" ON "VerificationReceipt"("organizationId", "createdAt");
CREATE INDEX "VerificationReceipt_organizationId_taskId_idx" ON "VerificationReceipt"("organizationId", "taskId");
CREATE INDEX "VerificationClaim_receiptId_createdAt_idx" ON "VerificationClaim"("receiptId", "createdAt");
CREATE INDEX "EvidenceRelation_claimId_relationType_idx" ON "EvidenceRelation"("claimId", "relationType");
CREATE INDEX "VerificationTransition_receiptId_createdAt_idx" ON "VerificationTransition"("receiptId", "createdAt");
-- Completed receipts and all frozen provenance are append-only at the database layer.
CREATE OR REPLACE FUNCTION mamv_reject_context_mutation() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'verification context records are immutable'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER verification_program_no_update BEFORE UPDATE OR DELETE ON "VerificationProgram" FOR EACH ROW EXECUTE FUNCTION mamv_reject_context_mutation();
CREATE TRIGGER completed_receipt_no_update BEFORE UPDATE OR DELETE ON "VerificationReceipt" FOR EACH ROW WHEN (OLD."status" = 'COMPLETED') EXECUTE FUNCTION mamv_reject_context_mutation();
CREATE TRIGGER claim_no_update BEFORE UPDATE OR DELETE ON "VerificationClaim" FOR EACH ROW EXECUTE FUNCTION mamv_reject_context_mutation();
CREATE TRIGGER relation_no_update BEFORE UPDATE OR DELETE ON "EvidenceRelation" FOR EACH ROW EXECUTE FUNCTION mamv_reject_context_mutation();
CREATE TRIGGER transition_no_update BEFORE UPDATE OR DELETE ON "VerificationTransition" FOR EACH ROW EXECUTE FUNCTION mamv_reject_context_mutation();
