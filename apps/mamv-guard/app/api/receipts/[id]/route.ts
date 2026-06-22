import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { toPublicResult } from '@/lib/verifier';
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) { const { id } = await params; const v = await prisma.verification.findUnique({ where: { id } }); if (!v) return NextResponse.json({ error: 'Not found' }, { status: 404 }); return NextResponse.json({ ...toPublicResult(v), receipt: v.receiptJson ? JSON.parse(v.receiptJson) : null }); }
