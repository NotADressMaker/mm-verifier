import crypto from 'node:crypto';
import { prisma } from './db';
import { config } from './config';
export async function deliverWebhooks(verificationId: string, urls: string[], payload: unknown) {
  await Promise.all(urls.map(async (url) => {
    const body = JSON.stringify(payload);
    const signature = crypto.createHmac('sha256', config.webhookSecret).update(body).digest('hex');
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-mamv-guard-signature': signature }, body });
      await prisma.webhookDelivery.create({ data: { verificationId, url, statusCode: res.status, ok: res.ok, error: res.ok ? undefined : await res.text() } });
    } catch (error) {
      await prisma.webhookDelivery.create({ data: { verificationId, url, ok: false, error: error instanceof Error ? error.message : String(error) } });
    }
  }));
}
