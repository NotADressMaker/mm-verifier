/**
 * Webhook Service Tests
 *
 * Tests the webhook notification system including:
 * - Subscription management
 * - Event delivery
 * - HMAC signature verification
 * - Retry logic with exponential backoff
 * - Delivery tracking
 */

import { expect } from 'chai';
import { WebhookService, WebhookEvent, WebhookSubscription } from '../src/services/webhooks';
import * as crypto from 'crypto';
import axios from 'axios';
import * as sinon from 'sinon';

describe('WebhookService', () => {
  let webhookService: WebhookService;
  let axiosStub: sinon.SinonStub;

  beforeEach(() => {
    webhookService = new WebhookService();
    // Stub axios to prevent actual HTTP requests
    axiosStub = sinon.stub(axios, 'post');
  });

  afterEach(() => {
    axiosStub.restore();
  });

  // ============================================================================
  // SUBSCRIPTION MANAGEMENT TESTS
  // ============================================================================

  describe('Subscription Management', () => {
    it('Should create a subscription', () => {
      const sub = webhookService.subscribe(
        'https://example.com/webhook',
        'secret123',
        [WebhookEvent.JOB_COMPLETED]
      );

      expect(sub).to.have.property('id');
      expect(sub.url).to.equal('https://example.com/webhook');
      expect(sub.events).to.deep.equal([WebhookEvent.JOB_COMPLETED]);
      expect(sub.enabled).to.be.true;
    });

    it('Should generate unique IDs for subscriptions', () => {
      const sub1 = webhookService.subscribe(
        'https://example.com/webhook1',
        'secret1',
        [WebhookEvent.JOB_COMPLETED]
      );

      const sub2 = webhookService.subscribe(
        'https://example.com/webhook2',
        'secret2',
        [WebhookEvent.JOB_COMPLETED]
      );

      expect(sub1.id).to.not.equal(sub2.id);
    });

    it('Should retrieve subscription by ID', () => {
      const sub = webhookService.subscribe(
        'https://example.com/webhook',
        'secret',
        [WebhookEvent.JOB_COMPLETED]
      );

      const retrieved = webhookService.getSubscription(sub.id);

      expect(retrieved).to.deep.equal(sub);
    });

    it('Should list all subscriptions', () => {
      webhookService.subscribe('https://example.com/webhook1', 'secret1', [WebhookEvent.JOB_COMPLETED]);
      webhookService.subscribe('https://example.com/webhook2', 'secret2', [WebhookEvent.JOB_CREATED]);

      const subscriptions = webhookService.listSubscriptions();

      expect(subscriptions).to.have.lengthOf(2);
    });

    it('Should unsubscribe by ID', () => {
      const sub = webhookService.subscribe(
        'https://example.com/webhook',
        'secret',
        [WebhookEvent.JOB_COMPLETED]
      );

      const result = webhookService.unsubscribe(sub.id);

      expect(result).to.be.true;
      expect(webhookService.getSubscription(sub.id)).to.be.undefined;
    });

    it('Should return false when unsubscribing non-existent subscription', () => {
      const result = webhookService.unsubscribe('non-existent-id');

      expect(result).to.be.false;
    });

    it('Should disable subscription', () => {
      const sub = webhookService.subscribe(
        'https://example.com/webhook',
        'secret',
        [WebhookEvent.JOB_COMPLETED]
      );

      webhookService.disableSubscription(sub.id);

      const updated = webhookService.getSubscription(sub.id);
      expect(updated?.enabled).to.be.false;
    });

    it('Should enable subscription', () => {
      const sub = webhookService.subscribe(
        'https://example.com/webhook',
        'secret',
        [WebhookEvent.JOB_COMPLETED]
      );

      webhookService.disableSubscription(sub.id);
      webhookService.enableSubscription(sub.id);

      const updated = webhookService.getSubscription(sub.id);
      expect(updated?.enabled).to.be.true;
    });
  });

  // ============================================================================
  // EVENT DELIVERY TESTS
  // ============================================================================

  describe('Event Delivery', () => {
    it('Should deliver event to subscribed webhook', async () => {
      axiosStub.resolves({ status: 200, data: {} });

      webhookService.subscribe(
        'https://example.com/webhook',
        'secret123',
        [WebhookEvent.JOB_COMPLETED]
      );

      await webhookService.send(WebhookEvent.JOB_COMPLETED, 'job-123', {
        score: 95,
        verdict: 'reliable',
      });

      expect(axiosStub.calledOnce).to.be.true;

      const callArgs = axiosStub.firstCall.args;
      expect(callArgs[0]).to.equal('https://example.com/webhook');
      expect(callArgs[1]).to.have.property('event', WebhookEvent.JOB_COMPLETED);
      expect(callArgs[1]).to.have.property('jobId', 'job-123');
    });

    it('Should not deliver event to non-subscribed webhooks', async () => {
      webhookService.subscribe(
        'https://example.com/webhook',
        'secret123',
        [WebhookEvent.JOB_COMPLETED]
      );

      await webhookService.send(WebhookEvent.JOB_CREATED, 'job-123', {});

      expect(axiosStub.called).to.be.false;
    });

    it('Should deliver to multiple subscribers', async () => {
      axiosStub.resolves({ status: 200, data: {} });

      webhookService.subscribe(
        'https://example.com/webhook1',
        'secret1',
        [WebhookEvent.JOB_COMPLETED]
      );

      webhookService.subscribe(
        'https://example.com/webhook2',
        'secret2',
        [WebhookEvent.JOB_COMPLETED]
      );

      await webhookService.send(WebhookEvent.JOB_COMPLETED, 'job-123', {});

      expect(axiosStub.calledTwice).to.be.true;
    });

    it('Should not deliver to disabled subscriptions', async () => {
      const sub = webhookService.subscribe(
        'https://example.com/webhook',
        'secret123',
        [WebhookEvent.JOB_COMPLETED]
      );

      webhookService.disableSubscription(sub.id);

      await webhookService.send(WebhookEvent.JOB_COMPLETED, 'job-123', {});

      expect(axiosStub.called).to.be.false;
    });

    it('Should include timestamp in payload', async () => {
      axiosStub.resolves({ status: 200, data: {} });

      webhookService.subscribe(
        'https://example.com/webhook',
        'secret123',
        [WebhookEvent.JOB_COMPLETED]
      );

      const beforeSend = Date.now();
      await webhookService.send(WebhookEvent.JOB_COMPLETED, 'job-123', {});
      const afterSend = Date.now();

      const payload = axiosStub.firstCall.args[1];
      expect(payload.timestamp).to.be.greaterThanOrEqual(beforeSend);
      expect(payload.timestamp).to.be.lessThanOrEqual(afterSend);
    });
  });

  // ============================================================================
  // SIGNATURE VERIFICATION TESTS
  // ============================================================================

  describe('HMAC Signature', () => {
    it('Should include HMAC signature in request headers', async () => {
      axiosStub.resolves({ status: 200, data: {} });

      webhookService.subscribe(
        'https://example.com/webhook',
        'secret123',
        [WebhookEvent.JOB_COMPLETED]
      );

      await webhookService.send(WebhookEvent.JOB_COMPLETED, 'job-123', {});

      const headers = axiosStub.firstCall.args[2].headers;
      expect(headers).to.have.property('X-Webhook-Signature');
    });

    it('Should generate valid HMAC signature', async () => {
      axiosStub.resolves({ status: 200, data: {} });

      const secret = 'test-secret';

      webhookService.subscribe(
        'https://example.com/webhook',
        secret,
        [WebhookEvent.JOB_COMPLETED]
      );

      await webhookService.send(WebhookEvent.JOB_COMPLETED, 'job-123', { score: 95 });

      const payload = axiosStub.firstCall.args[1];
      const signature = axiosStub.firstCall.args[2].headers['X-Webhook-Signature'];

      // Verify signature
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(payload))
        .digest('hex');

      expect(signature).to.equal(expectedSignature);
    });

    it('Should provide static signature verification method', () => {
      const secret = 'secret123';
      const payload = {
        event: WebhookEvent.JOB_COMPLETED,
        timestamp: Date.now(),
        jobId: 'job-123',
        data: { score: 95 },
      };

      const signature = crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(payload))
        .digest('hex');

      const isValid = WebhookService.verifySignature(payload, signature, secret);

      expect(isValid).to.be.true;
    });

    it('Should reject invalid signatures', () => {
      const payload = {
        event: WebhookEvent.JOB_COMPLETED,
        timestamp: Date.now(),
        jobId: 'job-123',
        data: {},
      };

      const isValid = WebhookService.verifySignature(payload, 'invalid-signature', 'secret123');

      expect(isValid).to.be.false;
    });
  });

  // ============================================================================
  // RETRY LOGIC TESTS
  // ============================================================================

  describe('Retry Logic', () => {
    it('Should retry on delivery failure', async function () {
      this.timeout(5000);

      let attempts = 0;
      axiosStub.callsFake(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Network error');
        }
        return { status: 200, data: {} };
      });

      webhookService.subscribe(
        'https://example.com/webhook',
        'secret123',
        [WebhookEvent.JOB_COMPLETED]
      );

      await webhookService.send(WebhookEvent.JOB_COMPLETED, 'job-123', {});

      expect(attempts).to.equal(3);
    });

    it('Should use exponential backoff for retries', async function () {
      this.timeout(5000);

      const timestamps: number[] = [];

      axiosStub.callsFake(async () => {
        timestamps.push(Date.now());
        throw new Error('Always fails');
      });

      webhookService.subscribe(
        'https://example.com/webhook',
        'secret123',
        [WebhookEvent.JOB_COMPLETED]
      );

      try {
        await webhookService.send(WebhookEvent.JOB_COMPLETED, 'job-123', {});
      } catch (e) {
        // Expected
      }

      // Check delays are increasing
      for (let i = 1; i < timestamps.length - 1; i++) {
        const delay1 = timestamps[i] - timestamps[i - 1];
        const delay2 = timestamps[i + 1] - timestamps[i];

        expect(delay2).to.be.greaterThan(delay1 * 0.8); // Allow for some variance
      }
    });

    it('Should stop retrying after max attempts', async function () {
      this.timeout(10000);

      axiosStub.rejects(new Error('Always fails'));

      webhookService.subscribe(
        'https://example.com/webhook',
        'secret123',
        [WebhookEvent.JOB_COMPLETED]
      );

      await webhookService.send(WebhookEvent.JOB_COMPLETED, 'job-123', {});

      // Default max retries = 3, so 4 total attempts (initial + 3 retries)
      expect(axiosStub.callCount).to.be.lessThanOrEqual(4);
    });
  });

  // ============================================================================
  // DELIVERY TRACKING TESTS
  // ============================================================================

  describe('Delivery Tracking', () => {
    it('Should increment delivery count on success', async () => {
      axiosStub.resolves({ status: 200, data: {} });

      const sub = webhookService.subscribe(
        'https://example.com/webhook',
        'secret123',
        [WebhookEvent.JOB_COMPLETED]
      );

      await webhookService.send(WebhookEvent.JOB_COMPLETED, 'job-123', {});

      const updated = webhookService.getSubscription(sub.id);
      expect(updated?.deliveryCount).to.equal(1);
    });

    it('Should increment failure count on failure', async function () {
      this.timeout(5000);

      axiosStub.rejects(new Error('Network error'));

      const sub = webhookService.subscribe(
        'https://example.com/webhook',
        'secret123',
        [WebhookEvent.JOB_COMPLETED]
      );

      await webhookService.send(WebhookEvent.JOB_COMPLETED, 'job-123', {});

      const updated = webhookService.getSubscription(sub.id);
      expect(updated?.failureCount).to.equal(1);
    });

    it('Should update lastDeliveryAt on success', async () => {
      axiosStub.resolves({ status: 200, data: {} });

      const sub = webhookService.subscribe(
        'https://example.com/webhook',
        'secret123',
        [WebhookEvent.JOB_COMPLETED]
      );

      const beforeSend = Date.now();
      await webhookService.send(WebhookEvent.JOB_COMPLETED, 'job-123', {});
      const afterSend = Date.now();

      const updated = webhookService.getSubscription(sub.id);
      expect(updated?.lastDeliveryAt).to.be.greaterThanOrEqual(beforeSend);
      expect(updated?.lastDeliveryAt).to.be.lessThanOrEqual(afterSend);
    });

    it('Should update lastFailureAt on failure', async function () {
      this.timeout(5000);

      axiosStub.rejects(new Error('Network error'));

      const sub = webhookService.subscribe(
        'https://example.com/webhook',
        'secret123',
        [WebhookEvent.JOB_COMPLETED]
      );

      const beforeSend = Date.now();
      await webhookService.send(WebhookEvent.JOB_COMPLETED, 'job-123', {});
      const afterSend = Date.now();

      const updated = webhookService.getSubscription(sub.id);
      expect(updated?.lastFailureAt).to.be.greaterThanOrEqual(beforeSend);
      expect(updated?.lastFailureAt).to.be.lessThanOrEqual(afterSend);
    });

    it('Should auto-disable after excessive failures', async function () {
      this.timeout(10000);

      axiosStub.rejects(new Error('Always fails'));

      const sub = webhookService.subscribe(
        'https://example.com/webhook',
        'secret123',
        [WebhookEvent.JOB_COMPLETED]
      );

      // Trigger multiple failures (default threshold: 10)
      for (let i = 0; i < 11; i++) {
        await webhookService.send(WebhookEvent.JOB_COMPLETED, `job-${i}`, {});
      }

      const updated = webhookService.getSubscription(sub.id);
      expect(updated?.enabled).to.be.false;
    });
  });

  // ============================================================================
  // EDGE CASES
  // ============================================================================

  describe('Edge Cases', () => {
    it('Should handle empty data payload', async () => {
      axiosStub.resolves({ status: 200, data: {} });

      webhookService.subscribe(
        'https://example.com/webhook',
        'secret123',
        [WebhookEvent.JOB_COMPLETED]
      );

      await webhookService.send(WebhookEvent.JOB_COMPLETED, 'job-123', {});

      expect(axiosStub.calledOnce).to.be.true;
    });

    it('Should handle complex nested data', async () => {
      axiosStub.resolves({ status: 200, data: {} });

      webhookService.subscribe(
        'https://example.com/webhook',
        'secret123',
        [WebhookEvent.JOB_COMPLETED]
      );

      const complexData = {
        score: 95,
        details: {
          claims: ['claim1', 'claim2'],
          evidence: {
            citations: [{ url: 'https://example.com', title: 'Source' }],
          },
        },
      };

      await webhookService.send(WebhookEvent.JOB_COMPLETED, 'job-123', complexData);

      const payload = axiosStub.firstCall.args[1];
      expect(payload.data).to.deep.equal(complexData);
    });

    it('Should handle HTTP timeout', async function () {
      this.timeout(10000);

      axiosStub.rejects({ code: 'ECONNABORTED' });

      webhookService.subscribe(
        'https://example.com/webhook',
        'secret123',
        [WebhookEvent.JOB_COMPLETED]
      );

      await webhookService.send(WebhookEvent.JOB_COMPLETED, 'job-123', {});

      // Should have attempted delivery despite timeout
      expect(axiosStub.called).to.be.true;
    });

    it('Should handle multiple subscriptions to same URL', async () => {
      axiosStub.resolves({ status: 200, data: {} });

      webhookService.subscribe(
        'https://example.com/webhook',
        'secret1',
        [WebhookEvent.JOB_COMPLETED]
      );

      webhookService.subscribe(
        'https://example.com/webhook',
        'secret2',
        [WebhookEvent.JOB_CREATED]
      );

      await webhookService.send(WebhookEvent.JOB_COMPLETED, 'job-123', {});

      // Only one subscription should be triggered
      expect(axiosStub.calledOnce).to.be.true;
    });

    it('Should handle subscription to multiple events', async () => {
      axiosStub.resolves({ status: 200, data: {} });

      webhookService.subscribe(
        'https://example.com/webhook',
        'secret123',
        [WebhookEvent.JOB_COMPLETED, WebhookEvent.JOB_FAILED, WebhookEvent.JOB_DISPUTED]
      );

      await webhookService.send(WebhookEvent.JOB_COMPLETED, 'job-1', {});
      await webhookService.send(WebhookEvent.JOB_FAILED, 'job-2', {});
      await webhookService.send(WebhookEvent.JOB_DISPUTED, 'job-3', {});

      expect(axiosStub.calledThrice).to.be.true;
    });
  });

  // ============================================================================
  // PERFORMANCE TESTS
  // ============================================================================

  describe('Performance', () => {
    it('Should handle high volume of deliveries', async function () {
      this.timeout(5000);

      axiosStub.resolves({ status: 200, data: {} });

      webhookService.subscribe(
        'https://example.com/webhook',
        'secret123',
        [WebhookEvent.JOB_COMPLETED]
      );

      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(webhookService.send(WebhookEvent.JOB_COMPLETED, `job-${i}`, {}));
      }

      await Promise.all(promises);

      expect(axiosStub.callCount).to.equal(100);
    });

    it('Should handle many subscriptions efficiently', async () => {
      axiosStub.resolves({ status: 200, data: {} });

      // Create 50 subscriptions
      for (let i = 0; i < 50; i++) {
        webhookService.subscribe(
          `https://example.com/webhook-${i}`,
          `secret-${i}`,
          [WebhookEvent.JOB_COMPLETED]
        );
      }

      const start = Date.now();
      await webhookService.send(WebhookEvent.JOB_COMPLETED, 'job-123', {});
      const duration = Date.now() - start;

      // Should complete in reasonable time (< 2 seconds)
      expect(duration).to.be.lessThan(2000);
    });
  });
});
