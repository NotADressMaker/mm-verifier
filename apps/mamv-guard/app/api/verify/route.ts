import { NextRequest, NextResponse } from 'next/server';
import { verifyRequestSchema } from '@/lib/schemas';
import { verifyWithMamv } from '@/lib/verifier';
import { assertRateLimit } from '@/lib/rate-limit';
export async function POST(req: NextRequest) { try { assertRateLimit(req); const input = verifyRequestSchema.parse(await req.json()); const result = await verifyWithMamv(input); return NextResponse.json(result, { status: result.status === 'FAILED' ? 502 : 200 }); } catch (error: any) { return NextResponse.json({ error: error.message ?? 'Invalid request' }, { status: error.status ?? 400 }); } }
