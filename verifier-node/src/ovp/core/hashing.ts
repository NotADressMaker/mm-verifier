import { createHash, randomUUID } from 'crypto';
export function sha256(value: string): string { return `sha256:${createHash('sha256').update(value).digest('hex')}`; }
export function identifier(prefix: string): string { return `${prefix}-${randomUUID()}`; }
export function utcNow(): string { return new Date().toISOString(); }
