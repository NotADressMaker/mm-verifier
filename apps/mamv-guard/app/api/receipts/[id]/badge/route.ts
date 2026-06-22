import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { badgeSvg } from '@/lib/badge';
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) { const { id } = await params; const v = await prisma.verification.findUnique({ where: { id } }); const label = v?.status === 'VERIFIED' ? `VERIFIED ${v.scoreBps}` : v?.status ?? 'UNKNOWN'; const color = v?.status === 'VERIFIED' ? '#16a34a' : v?.status === 'REJECTED' ? '#dc2626' : '#f59e0b'; return new NextResponse(badgeSvg(label, color), { headers: { 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=60' } }); }
