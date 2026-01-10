/**
 * Webhook Service for MM Verifier API
 *
 * Sends HTTP callbacks when verification jobs complete.
 * Prevents polling by notifying subscribers of status changes.
 *
 * Features:
 * - Webhook registration per job or global
 * - Retry with exponential backoff
 * - Signature verification (HMAC-SHA256)
 * - Event filtering
 * - Delivery status tracking
 */

import crypto from 'crypto';
import axios from 'axios';
import { EventEmitter } from 'events';

export enum WebhookEvent {
  JOB_CREATED = 'job.created',
  JOB_COMMITTED = 'job.committed',
  JOB_REVEALED = 'job.revealed',
  JOB_COMPLETED = 'job.completed',
  JOB_FAILED = 'job.failed',
  JOB_DISPUTED = 'job.disputed',
  JOB_RESOLVED = 'job.resolved',
}

export interface WebhookSubscription {
  id: string;
  url: string;
  secret: string;
  events: WebhookEvent[];
  enabled: boolean;
  createdAt: number;
  lastDelivery?: number;
  deliveryCount: number;
  failureCount: number;
}

export interface WebhookPayload {
  event: WebhookEvent;
  timestamp: number;
  jobId: string;
  data: any;
}

export interface WebhookDelivery {
  id: string;
  subscriptionId: string;
  event: WebhookEvent;
  payload: WebhookPayload;
  attempt: number;
  status: 'pending' | 'delivered' | 'failed';
  statusCode?: number;
  error?: string;
  deliveredAt?: number;
}

export class WebhookService extends EventEmitter {
  private subscriptions: Map<string, WebhookSubscription> = new Map();
  private deliveries: Map<string, WebhookDelivery> = new Map();
  private maxRetries = 3;
  private retryDelay = 1000; // Base delay in ms

  constructor() {
    super();
  }

  /**
   * Subscribe to webhook events
   */
  subscribe(
    url: string,
    secret: string,
    events: WebhookEvent[] = Object.values(WebhookEvent)
  ): WebhookSubscription {
    const id = crypto.randomUUID();

    const subscription: WebhookSubscription = {
      id,
      url,
      secret,
      events,
      enabled: true,
      createdAt: Date.now(),
      deliveryCount: 0,
      failureCount: 0,
    };

    this.subscriptions.set(id, subscription);

    console.log(`✓ Webhook subscribed: ${url} (${events.length} events)`);

    return subscription;
  }

  /**
   * Unsubscribe from webhooks
   */
  unsubscribe(subscriptionId: string): boolean {
    const deleted = this.subscriptions.delete(subscriptionId);

    if (deleted) {
      console.log(`✓ Webhook unsubscribed: ${subscriptionId}`);
    }

    return deleted;
  }

  /**
   * Send webhook notification
   */
  async send(
    event: WebhookEvent,
    jobId: string,
    data: any
  ): Promise<void> {
    const payload: WebhookPayload = {
      event,
      timestamp: Date.now(),
      jobId,
      data,
    };

    // Find matching subscriptions
    const subscriptions = Array.from(this.subscriptions.values()).filter(
      (sub) => sub.enabled && sub.events.includes(event)
    );

    if (subscriptions.length === 0) {
      console.log(`ℹ No subscribers for event: ${event}`);
      return;
    }

    console.log(`📤 Sending ${event} to ${subscriptions.length} subscribers...`);

    // Send to all subscriptions
    const deliveries = subscriptions.map((sub) =>
      this.deliver(sub, payload)
    );

    await Promise.allSettled(deliveries);
  }

  /**
   * Deliver webhook to a single subscription
   */
  private async deliver(
    subscription: WebhookSubscription,
    payload: WebhookPayload,
    attempt: number = 0
  ): Promise<void> {
    const deliveryId = crypto.randomUUID();

    const delivery: WebhookDelivery = {
      id: deliveryId,
      subscriptionId: subscription.id,
      event: payload.event,
      payload,
      attempt,
      status: 'pending',
    };

    this.deliveries.set(deliveryId, delivery);

    try {
      // Generate signature
      const signature = this.generateSignature(payload, subscription.secret);

      // Send HTTP POST
      const response = await axios.post(subscription.url, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Event': payload.event,
          'X-Webhook-Signature': signature,
          'X-Webhook-Delivery-ID': deliveryId,
          'User-Agent': 'MM-Verifier-Webhooks/1.0',
        },
        timeout: 5000,
      });

      // Mark as delivered
      delivery.status = 'delivered';
      delivery.statusCode = response.status;
      delivery.deliveredAt = Date.now();

      subscription.deliveryCount++;
      subscription.lastDelivery = Date.now();

      console.log(`✓ Webhook delivered to ${subscription.url} (${response.status})`);

    } catch (error: any) {
      delivery.status = 'failed';
      delivery.statusCode = error.response?.status;
      delivery.error = error.message;

      subscription.failureCount++;

      console.error(`✗ Webhook delivery failed to ${subscription.url}: ${error.message}`);

      // Retry with exponential backoff
      if (attempt < this.maxRetries) {
        const delay = this.retryDelay * Math.pow(2, attempt);
        console.log(`⏳ Retrying in ${delay}ms (attempt ${attempt + 1}/${this.maxRetries})...`);

        await this.sleep(delay);
        return this.deliver(subscription, payload, attempt + 1);
      } else {
        console.error(`✗ Webhook delivery failed after ${this.maxRetries} retries`);

        // Disable subscription if too many failures
        if (subscription.failureCount >= 10) {
          subscription.enabled = false;
          console.log(`⚠️  Subscription disabled due to repeated failures: ${subscription.id}`);
        }
      }
    }
  }

  /**
   * Generate HMAC signature for payload
   */
  private generateSignature(payload: WebhookPayload, secret: string): string {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(payload));
    return hmac.digest('hex');
  }

  /**
   * Verify webhook signature (for receiving webhooks)
   */
  static verifySignature(
    payload: any,
    signature: string,
    secret: string
  ): boolean {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(payload));
    const expectedSignature = hmac.digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  /**
   * Get all subscriptions
   */
  getSubscriptions(): WebhookSubscription[] {
    return Array.from(this.subscriptions.values());
  }

  /**
   * Get subscription by ID
   */
  getSubscription(id: string): WebhookSubscription | undefined {
    return this.subscriptions.get(id);
  }

  /**
   * Update subscription
   */
  updateSubscription(
    id: string,
    updates: Partial<Omit<WebhookSubscription, 'id' | 'createdAt'>>
  ): WebhookSubscription | undefined {
    const subscription = this.subscriptions.get(id);

    if (!subscription) {
      return undefined;
    }

    Object.assign(subscription, updates);

    console.log(`✓ Subscription updated: ${id}`);

    return subscription;
  }

  /**
   * Get delivery history
   */
  getDeliveries(subscriptionId?: string, limit: number = 100): WebhookDelivery[] {
    let deliveries = Array.from(this.deliveries.values());

    if (subscriptionId) {
      deliveries = deliveries.filter((d) => d.subscriptionId === subscriptionId);
    }

    return deliveries.slice(-limit);
  }

  /**
   * Get delivery statistics
   */
  getStats(subscriptionId?: string): {
    totalDeliveries: number;
    successfulDeliveries: number;
    failedDeliveries: number;
    successRate: number;
  } {
    const deliveries = this.getDeliveries(subscriptionId, 10000);

    const totalDeliveries = deliveries.length;
    const successfulDeliveries = deliveries.filter(
      (d) => d.status === 'delivered'
    ).length;
    const failedDeliveries = deliveries.filter((d) => d.status === 'failed').length;
    const successRate =
      totalDeliveries > 0 ? (successfulDeliveries / totalDeliveries) * 100 : 0;

    return {
      totalDeliveries,
      successfulDeliveries,
      failedDeliveries,
      successRate,
    };
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Clear old deliveries (cleanup)
   */
  clearOldDeliveries(maxAge: number = 7 * 24 * 60 * 60 * 1000): number {
    const now = Date.now();
    let count = 0;

    for (const [id, delivery] of this.deliveries.entries()) {
      if (now - delivery.payload.timestamp > maxAge) {
        this.deliveries.delete(id);
        count++;
      }
    }

    if (count > 0) {
      console.log(`🗑️  Cleared ${count} old webhook deliveries`);
    }

    return count;
  }
}

// Example usage
if (require.main === module) {
  const webhooks = new WebhookService();

  // Subscribe to job completion events
  const subscription = webhooks.subscribe(
    'https://example.com/webhook',
    'secret123',
    [WebhookEvent.JOB_COMPLETED, WebhookEvent.JOB_FAILED]
  );

  console.log('Subscription created:', subscription.id);

  // Send a test webhook
  webhooks
    .send(WebhookEvent.JOB_COMPLETED, 'job-123', {
      score: 95,
      verdict: 'reliable',
      confidence: 0.98,
    })
    .then(() => {
      const stats = webhooks.getStats(subscription.id);
      console.log('Delivery stats:', stats);
    });
}

export default WebhookService;
