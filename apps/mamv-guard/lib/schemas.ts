import { z } from 'zod';
export const outputSchema = z.union([z.string(), z.object({ id: z.string().optional(), content: z.string(), model: z.string().optional() })]);
export const policySchema = z.object({ domain: z.string().default('general'), models: z.array(z.string()).default(['gpt-4', 'claude-3']), taskType: z.string().default('factual-qa'), programId: z.string().default('factual-consensus'), programVersion: z.string().default('1.0.0'), thresholdBps: z.number().int().min(0).max(10000).default(7500), requireWorthy: z.boolean().default(true), anchor: z.boolean().default(false), timeoutMs: z.number().int().positive().default(300000), pollIntervalMs: z.number().int().positive().default(5000), webhooks: z.array(z.string().url()).default([]) });
export const verifyRequestSchema = z.object({ prompt: z.string().min(1), outputs: z.array(outputSchema).min(1), metadata: z.record(z.unknown()).default({}), policy: policySchema.partial().default({}), idempotencyKey: z.string().optional() });
export const batchRequestSchema = z.object({ items: z.array(verifyRequestSchema).min(1).max(100), policy: policySchema.partial().default({}) });
export type VerifyRequestInput = z.infer<typeof verifyRequestSchema>;
export type GuardPolicy = z.infer<typeof policySchema>;
