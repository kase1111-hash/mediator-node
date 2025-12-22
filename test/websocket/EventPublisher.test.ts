import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import WebSocket from 'ws';
import { WebSocketServer } from '../../src/websocket/WebSocketServer';
import { EventPublisher } from '../../src/websocket/EventPublisher';
import {
  IntentEventPayload,
  SettlementEventPayload,
  MP05SettlementEventPayload,
  BurnEventPayload,
  DisputeEventPayload,
  Intent,
  ProposedSettlement,
  Settlement,
  BurnTransaction,
  DisputeDeclaration,
  SubscriptionRequest,
  WebSocketEventType,
} from '../../src/types';

describe('EventPublisher', () => {
  let server: WebSocketServer;
  let publisher: EventPublisher;
  let client: WebSocket;
  const testPort = 9002;

  beforeEach(async () => {
    server = new WebSocketServer({
      port: testPort,
      authRequired: false,
    });

    await server.start();

    publisher = new EventPublisher(server);
  });

  afterEach(async () => {
    if (client && client.readyState === WebSocket.OPEN) {
      client.close();
    }

    if (server) {
      await server.stop();
    }
  });

  describe('Event Publishing', () => {
    it('should publish events to subscribed clients', (done) => {
      client = new WebSocket(`ws://localhost:${testPort}`);

      client.on('open', () => {
        // Subscribe to intent events
        const subRequest: SubscriptionRequest = {
          action: 'subscribe',
          topics: ['intent.submitted'] as WebSocketEventType[],
        };

        client.send(JSON.stringify(subRequest));

        // Wait for subscription confirmation, then publish event
        setTimeout(() => {
          const testIntent: Intent = {
            hash: 'test-hash',
            author: 'test-author',
            prose: 'Test intent',
            desires: ['test desire'],
            constraints: [],
            timestamp: Date.now(),
            status: 'pending',
          };

          const payload: IntentEventPayload = {
            intent: testIntent,
          };

          publisher.publish('intent.submitted', payload);
        }, 200);
      });

      let messageCount = 0;
      client.on('message', (data: Buffer) => {
        messageCount++;

        // Third message should be our published event
        if (messageCount === 3) {
          const message = JSON.parse(data.toString());
          expect(message.type).toBe('intent.submitted');
          expect(message.payload.intent.hash).toBe('test-hash');
          done();
        }
      });
    });

    it('should not publish to unsubscribed clients', (done) => {
      client = new WebSocket(`ws://localhost:${testPort}`);

      client.on('open', () => {
        // Subscribe to different event type
        const subRequest: SubscriptionRequest = {
          action: 'subscribe',
          topics: ['settlement.proposed'] as WebSocketEventType[],
        };

        client.send(JSON.stringify(subRequest));

        // Wait for subscription, then publish different event
        setTimeout(() => {
          const testIntent: Intent = {
            hash: 'test-hash',
            author: 'test-author',
            prose: 'Test intent',
            desires: ['test desire'],
            constraints: [],
            timestamp: Date.now(),
            status: 'pending',
          };

          const payload: IntentEventPayload = {
            intent: testIntent,
          };

          publisher.publish('intent.submitted', payload);

          // Wait and verify we didn't receive it
          setTimeout(() => {
            done();
          }, 200);
        }, 200);
      });

      let messageCount = 0;
      client.on('message', () => {
        messageCount++;

        // Should only get connection ack + subscription response
        expect(messageCount).toBeLessThanOrEqual(2);
      });
    });

    it('should filter events by party', (done) => {
      client = new WebSocket(`ws://localhost:${testPort}`);

      client.on('open', () => {
        // Subscribe with party filter
        const subRequest: SubscriptionRequest = {
          action: 'subscribe',
          topics: ['intent.submitted'] as WebSocketEventType[],
          filters: {
            parties: ['matching-author'],
          },
        };

        client.send(JSON.stringify(subRequest));

        setTimeout(() => {
          // Publish matching event
          const matchingIntent: Intent = {
            hash: 'test-hash-1',
            author: 'matching-author',
            prose: 'Test intent',
            desires: [],
            constraints: [],
            timestamp: Date.now(),
            status: 'pending',
          };

          publisher.publish('intent.submitted', { intent: matchingIntent });

          // Publish non-matching event
          const nonMatchingIntent: Intent = {
            hash: 'test-hash-2',
            author: 'other-author',
            prose: 'Test intent',
            desires: [],
            constraints: [],
            timestamp: Date.now(),
            status: 'pending',
          };

          publisher.publish('intent.submitted', { intent: nonMatchingIntent });
        }, 200);
      });

      let eventCount = 0;
      let messageCount = 0;

      client.on('message', (data: Buffer) => {
        messageCount++;
        const message = JSON.parse(data.toString());

        if (message.type === 'intent.submitted') {
          eventCount++;
          expect(message.payload.intent.author).toBe('matching-author');
        }
      });

      setTimeout(() => {
        expect(eventCount).toBe(1); // Only matching event received
        done();
      }, 500);
    });

    it('should filter events by settlement ID', (done) => {
      client = new WebSocket(`ws://localhost:${testPort}`);

      client.on('open', () => {
        const subRequest: SubscriptionRequest = {
          action: 'subscribe',
          topics: ['mp05.settlement.initiated'] as WebSocketEventType[],
          filters: {
            settlementIds: ['settlement-123'],
          },
        };

        client.send(JSON.stringify(subRequest));

        setTimeout(() => {
          // Publish matching event
          const matchingSettlement: Settlement = {
            settlementId: 'settlement-123',
            status: 'declared',
            referencedAgreements: [],
            referencedReceipts: [],
            requiredParties: ['party-1'],
            declarations: [],
            settlementStatement: 'Test settlement',
            initiatedAt: Date.now(),
            initiatedBy: 'party-1',
            isStaged: false,
            settlementHash: 'hash',
            immutable: false,
          };

          const payload: MP05SettlementEventPayload = {
            settlement: matchingSettlement,
          };

          publisher.publish('mp05.settlement.initiated', payload);

          // Publish non-matching event
          const nonMatchingSettlement: Settlement = {
            ...matchingSettlement,
            settlementId: 'settlement-456',
          };

          publisher.publish('mp05.settlement.initiated', {
            settlement: nonMatchingSettlement,
          });
        }, 200);
      });

      let eventCount = 0;

      client.on('message', (data: Buffer) => {
        const message = JSON.parse(data.toString());

        if (message.type === 'mp05.settlement.initiated') {
          eventCount++;
          expect(message.payload.settlement.settlementId).toBe('settlement-123');
        }
      });

      setTimeout(() => {
        expect(eventCount).toBe(1);
        done();
      }, 500);
    });

    it('should filter events by receipt ID', (done) => {
      client = new WebSocket(`ws://localhost:${testPort}`);

      client.on('open', () => {
        const subRequest: SubscriptionRequest = {
          action: 'subscribe',
          topics: ['mp05.settlement.initiated'] as WebSocketEventType[],
          filters: {
            receiptIds: ['receipt-123'],
          },
        };

        client.send(JSON.stringify(subRequest));

        setTimeout(() => {
          const matchingSettlement: Settlement = {
            settlementId: 'settlement-1',
            status: 'declared',
            referencedAgreements: [],
            referencedReceipts: ['receipt-123'],
            requiredParties: ['party-1'],
            declarations: [],
            settlementStatement: 'Test settlement',
            initiatedAt: Date.now(),
            initiatedBy: 'party-1',
            isStaged: false,
            settlementHash: 'hash',
            immutable: false,
          };

          publisher.publish('mp05.settlement.initiated', { settlement: matchingSettlement });
        }, 200);
      });

      let eventCount = 0;

      client.on('message', (data: Buffer) => {
        const message = JSON.parse(data.toString());

        if (message.type === 'mp05.settlement.initiated') {
          eventCount++;
          expect(message.payload.settlement.referencedReceipts).toContain('receipt-123');
        }
      });

      setTimeout(() => {
        expect(eventCount).toBe(1);
        done();
      }, 500);
    });
  });

  describe('Batch Processing', () => {
    it('should handle high-volume event publishing', (done) => {
      client = new WebSocket(`ws://localhost:${testPort}`);

      client.on('open', () => {
        const subRequest: SubscriptionRequest = {
          action: 'subscribe',
          topics: ['burn.executed'] as WebSocketEventType[],
        };

        client.send(JSON.stringify(subRequest));

        setTimeout(() => {
          // Publish 50 events rapidly
          for (let i = 0; i < 50; i++) {
            const burn: BurnTransaction = {
              id: `burn-${i}`,
              type: 'base_filing',
              author: 'test-user',
              amount: 0.1,
              timestamp: Date.now(),
            };

            const payload: BurnEventPayload = {
              burn,
            };

            publisher.publish('burn.executed', payload);
          }
        }, 200);
      });

      let eventCount = 0;

      client.on('message', (data: Buffer) => {
        const message = JSON.parse(data.toString());

        if (message.type === 'burn.executed') {
          eventCount++;
        }
      });

      // Wait for all events to be processed
      setTimeout(() => {
        expect(eventCount).toBe(50);
        done();
      }, 2000);
    }, 5000);
  });

  describe('Statistics', () => {
    it('should track publishing statistics', (done) => {
      client = new WebSocket(`ws://localhost:${testPort}`);

      client.on('open', () => {
        const subRequest: SubscriptionRequest = {
          action: 'subscribe',
          topics: ['intent.submitted'] as WebSocketEventType[],
        };

        client.send(JSON.stringify(subRequest));

        setTimeout(() => {
          const intent: Intent = {
            hash: 'test-hash',
            author: 'test-author',
            prose: 'Test intent',
            desires: [],
            constraints: [],
            timestamp: Date.now(),
            status: 'pending',
          };

          publisher.publish('intent.submitted', { intent });

          setTimeout(() => {
            const stats = publisher.getStatistics();
            expect(stats.totalPublished).toBeGreaterThan(0);
            expect(stats.publishedByType['intent.submitted']).toBeGreaterThan(0);
            done();
          }, 200);
        }, 200);
      });
    });

    it('should track filtered events', (done) => {
      client = new WebSocket(`ws://localhost:${testPort}`);

      client.on('open', () => {
        // Subscribe to different event type
        const subRequest: SubscriptionRequest = {
          action: 'subscribe',
          topics: ['settlement.proposed'] as WebSocketEventType[],
        };

        client.send(JSON.stringify(subRequest));

        setTimeout(() => {
          // Publish unsubscribed event
          const intent: Intent = {
            hash: 'test-hash',
            author: 'test-author',
            prose: 'Test intent',
            desires: [],
            constraints: [],
            timestamp: Date.now(),
            status: 'pending',
          };

          publisher.publish('intent.submitted', { intent });

          setTimeout(() => {
            const stats = publisher.getStatistics();
            expect(stats.totalFiltered).toBeGreaterThan(0);
            done();
          }, 200);
        }, 200);
      });
    });
  });

  describe('Multiple Clients', () => {
    it('should publish to multiple clients with different subscriptions', (done) => {
      const client1 = new WebSocket(`ws://localhost:${testPort}`);
      const client2 = new WebSocket(`ws://localhost:${testPort}`);

      let client1Ready = false;
      let client2Ready = false;

      client1.on('open', () => {
        const subRequest: SubscriptionRequest = {
          action: 'subscribe',
          topics: ['intent.submitted'] as WebSocketEventType[],
        };

        client1.send(JSON.stringify(subRequest));
        client1Ready = true;

        if (client1Ready && client2Ready) {
          publishEvents();
        }
      });

      client2.on('open', () => {
        const subRequest: SubscriptionRequest = {
          action: 'subscribe',
          topics: ['burn.executed'] as WebSocketEventType[],
        };

        client2.send(JSON.stringify(subRequest));
        client2Ready = true;

        if (client1Ready && client2Ready) {
          publishEvents();
        }
      });

      const publishEvents = () => {
        setTimeout(() => {
          const intent: Intent = {
            hash: 'test-hash',
            author: 'test-author',
            prose: 'Test intent',
            desires: [],
            constraints: [],
            timestamp: Date.now(),
            status: 'pending',
          };

          publisher.publish('intent.submitted', { intent });

          const burn: BurnTransaction = {
            id: 'burn-1',
            type: 'base_filing',
            author: 'test-user',
            amount: 0.1,
            timestamp: Date.now(),
          };

          publisher.publish('burn.executed', { burn });
        }, 200);
      };

      let client1Events = 0;
      let client2Events = 0;

      client1.on('message', (data: Buffer) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'intent.submitted') {
          client1Events++;
        }
        // Should NOT receive burn events
        expect(message.type).not.toBe('burn.executed');
      });

      client2.on('message', (data: Buffer) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'burn.executed') {
          client2Events++;
        }
        // Should NOT receive intent events
        expect(message.type).not.toBe('intent.submitted');
      });

      setTimeout(() => {
        expect(client1Events).toBe(1);
        expect(client2Events).toBe(1);

        client1.close();
        client2.close();
        done();
      }, 1000);
    });
  });
});
