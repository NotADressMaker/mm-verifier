import { promises as fs } from 'fs';
import path from 'path';
import { logger } from '../utils/logger';

export async function writeMMVAuditRecord(record: Record<string, unknown>): Promise<void> {
  const logPath = process.env.MAMV_AUDIT_LOG_PATH || process.env.MMV_AUDIT_LOG_PATH || 'logs/mamv-audit.jsonl';
  const dir = path.dirname(logPath);

  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.appendFile(logPath, `${JSON.stringify(record)}\n`, 'utf8');
  } catch (error) {
    logger.warn('Failed to write MAMV audit record', { error });
  }
}
