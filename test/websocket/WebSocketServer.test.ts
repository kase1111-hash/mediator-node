import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import WebSocket from 'ws';
import { WebSocketServer } from '../../src/websocket/WebSocketServer';
import { AuthenticationService } from '../../src/websocket/AuthenticationService';
import {
  AuthenticationMessage,
  SubscriptionRequest,
  WebSocketEventType,
} from '../../src/types';

describe('WebSocketServer', () => {
  let server: WebSocketServer;
  let client: WebSocket;
  const testPort = 9001;

  beforeEach(async () => {
    // Create server with auth disabled for most tests
    server = new WebSocketServer({
      port: testPort,
      authRequired: false,
      heartbeatInterval: 5000,
    });

    await server.start();
  });

  afterEach(async () => {
    if (client && client.readyState === WebSocket.OPEN) {
      client.close();
    }

    if (server) {
      await server.stop();
    }
  });

  describe('Connection Management', () => {
    it('should accept client connections', (done) => {
      client = new WebSocket(`ws://localhost:${testPort}`);

      client.on('open', () => {
        expect(client.readyState).toBe(WebSocket.OPEN);
        done();
      });

      client.on('error', (err) => {
        done(err);
      });
    });

    it('should track active connections', (done) => {
      client = new WebSocket(`ws://localhost:${testPort}`);

      client.on('open', () => {
        setTimeout(() => {
          const connections = server.getConnections();
          expect(connections.length).toBe(1);
          expect(connections[0].authenticated).toBe(true); // Auth disabled
          done();
        }, 100);
      });
    });

    it('should send connection acknowledgment', (done) => {
      client = new WebSocket(`ws://localhost:${testPort}`);

      client.on('message', (data: Buffer) => {
        const message = JSON.parse(data.toString());
        expect(message.type).toBe('system.node_status_changed');
        expect(message.payload.message).toContain('Connected');
        expect(message.payload.connectionId).toBeDefined();
        done();
      });
    });

    it('should handle client disconnect', (done) => {
      client = new WebSocket(`ws://localhost:${testPort}`);

      client.on('open', () => {
        setTimeout(() => {
          expect(server.getConnections().length).toBe(1);
          client.close();
        }, 100);
      });

      setTimeout(() => {
        expect(server.getConnections().length).toBe(0);
        done();
      }, 300);
    });

    it('should enforce max connections limit', async () => {
      await server.stop();

      server = new WebSocketServer({
        port: testPort,
        authRequired: false,
        maxConnections: 2,
      });

      await server.start();

      const client1 = new WebSocket(`ws://localhost:${testPort}`);
      const client2 = new WebSocket(`ws://localhost:${testPort}`);
      const client3 = new WebSocket(`ws://localhost:${testPort}`);

      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(server.getConnections().length).toBeLessThanOrEqual(2);

      client1.close();
      client2.close();
      client3.close();
    });
  });

  describe('Authentication', () => {
    beforeEach(async () => {
      await server.stop();

      server = new WebSocketServer({
        port: testPort,
        authRequired: true,
        authTimeout: 2000,
      });

      await server.start();
    });

    it('should require authentication when enabled', (done) => {
      client = new WebSocket(`ws://localhost:${testPort}`);

      client.on('open', () => {
        setTimeout(() => {
          const connections = server.getConnections();
          expect(connections.length).toBe(1);
          expect(connections[0].authenticated).toBe(false);
          done();
        }, 100);
      });
    });

    it('should close connection on auth timeout', (done) => {
      client = new WebSocket(`ws://localhost:${testPort}`);

      client.on('close', () => {
        done();
      });
    }, 5000);

    it('should authenticate valid clients', (done) => {
      client = new WebSocket(`ws://localhost:${testPort}`);

      client.on('open', () => {
        // Use same timestamp and nonce for signature creation and message
        const timestamp = Date.now();
        const nonce = AuthenticationService.generateNonce();

        const authMessage: AuthenticationMessage = {
          action: 'authenticate',
          identity: 'test-user',
          timestamp: timestamp,
          signature: AuthenticationService.createSignature(
            'test-user',
            timestamp,
            nonce
          ),
          nonce: nonce,
        };

        client.send(JSON.stringify(authMessage));
      });

      let messageCount = 0;
      client.on('message', (data: Buffer) => {
        messageCount++;

        const message = JSON.parse(data.toString());

        // Second message should be auth response
        if (messageCount === 2) {
          expect(message.payload.success).toBe(true);
          expect(message.payload.connectionId).toBeDefined();

          setTimeout(() => {
            const connections = server.getConnections();
            expect(connections[0].authenticated).toBe(true);
            expect(connections[0].identity).toBe('test-user');
            done();
          }, 100);
        }
      });
    });
  });

  describe('Subscription Management', () => {
    it('should handle subscription requests', (done) => {
      client = new WebSocket(`ws://localhost:${testPort}`);

      client.on('open', () => {
        const subRequest: SubscriptionRequest = {
          action: 'subscribe',
          topics: ['intent.submitted', 'settlement.proposed'] as WebSocketEventType[],
          filters: {
            parties: ['test-party-1'],
          },
        };

        client.send(JSON.stringify(subRequest));
      });

      let messageCount = 0;
      client.on('message', (data: Buffer) => {
        messageCount++;

        // Second message should be subscription response
        if (messageCount === 2) {
          const message = JSON.parse(data.toString());
          expect(message.payload.success).toBe(true);
          expect(message.payload.subscriptionId).toBeDefined();
          expect(message.payload.activeSubscriptions).toHaveLength(1);
          done();
        }
      });
    });

    it('should handle unsubscribe requests', (done) => {
      client = new WebSocket(`ws://localhost:${testPort}`);

      let subscriptionId: string;

      client.on('open', () => {
        const subRequest: SubscriptionRequest = {
          action: 'subscribe',
          topics: ['intent.submitted'] as WebSocketEventType[],
        };

        client.send(JSON.stringify(subRequest));
      });

      let messageCount = 0;
      client.on('message', (data: Buffer) => {
        messageCount++;

        const message = JSON.parse(data.toString());

        // Second message: subscription response
        if (messageCount === 2) {
          subscriptionId = message.payload.subscriptionId;

          const unsubRequest: SubscriptionRequest = {
            action: 'unsubscribe',
            subscriptionId,
          };

          client.send(JSON.stringify(unsubRequest));
        }

        // Third message: unsubscribe response
        if (messageCount === 3) {
          expect(message.payload.success).toBe(true);
          expect(message.payload.activeSubscriptions).toHaveLength(0);
          done();
        }
      });
    });

    it('should update existing subscriptions', (done) => {
      client = new WebSocket(`ws://localhost:${testPort}`);

      let subscriptionId: string;

      client.on('open', () => {
        const subRequest: SubscriptionRequest = {
          action: 'subscribe',
          topics: ['intent.submitted'] as WebSocketEventType[],
        };

        client.send(JSON.stringify(subRequest));
      });

      let messageCount = 0;
      client.on('message', (data: Buffer) => {
        messageCount++;

        const message = JSON.parse(data.toString());

        // Second message: initial subscription
        if (messageCount === 2) {
          subscriptionId = message.payload.subscriptionId;

          const updateRequest: SubscriptionRequest = {
            action: 'update',
            subscriptionId,
            topics: ['intent.submitted', 'intent.accepted'] as WebSocketEventType[],
            filters: {
              parties: ['new-party'],
            },
          };

          client.send(JSON.stringify(updateRequest));
        }

        // Third message: update response
        if (messageCount === 3) {
          expect(message.payload.success).toBe(true);
          expect(message.payload.activeSubscriptions).toHaveLength(1);
          expect(message.payload.activeSubscriptions[0].topics).toHaveLength(2);
          done();
        }
      });
    });
  });

  describe('Broadcasting', () => {
    it('should broadcast messages to all connections', (done) => {
      const client1 = new WebSocket(`ws://localhost:${testPort}`);
      const client2 = new WebSocket(`ws://localhost:${testPort}`);

      let client1Ready = false;
      let client2Ready = false;

      const checkReady = () => {
        if (client1Ready && client2Ready) {
          const testMessage = {
            type: 'intent.submitted' as WebSocketEventType,
            timestamp: Date.now(),
            eventId: 'test-event',
            version: '1.0',
            payload: { test: 'data' },
          };

          server.broadcast(testMessage);
        }
      };

      client1.on('open', () => {
        client1Ready = true;
        checkReady();
      });

      client2.on('open', () => {
        client2Ready = true;
        checkReady();
      });

      let client1Received = false;
      let client2Received = false;

      client1.on('message', (data: Buffer) => {
        const message = JSON.parse(data.toString());
        if (message.eventId === 'test-event') {
          client1Received = true;
          if (client1Received && client2Received) {
            client1.close();
            client2.close();
            done();
          }
        }
      });

      client2.on('message', (data: Buffer) => {
        const message = JSON.parse(data.toString());
        if (message.eventId === 'test-event') {
          client2Received = true;
          if (client1Received && client2Received) {
            client1.close();
            client2.close();
            done();
          }
        }
      });
    });

    it('should send to specific connections', (done) => {
      client = new WebSocket(`ws://localhost:${testPort}`);

      client.on('open', () => {
        setTimeout(() => {
          const connections = server.getConnections();
          const connectionId = connections[0].connectionId;

          const testMessage = {
            type: 'intent.submitted' as WebSocketEventType,
            timestamp: Date.now(),
            eventId: 'test-event',
            version: '1.0',
            payload: { test: 'data' },
          };

          server.send(connectionId, testMessage);
        }, 100);
      });

      let messageCount = 0;
      client.on('message', (data: Buffer) => {
        messageCount++;

        // Second message should be our test message
        if (messageCount === 2) {
          const message = JSON.parse(data.toString());
          expect(message.eventId).toBe('test-event');
          done();
        }
      });
    });
  });

  describe('Statistics', () => {
    it('should provide server statistics', async () => {
      const client1 = new WebSocket(`ws://localhost:${testPort}`);
      const client2 = new WebSocket(`ws://localhost:${testPort}`);

      await new Promise((resolve) => setTimeout(resolve, 200));

      const stats = server.getStatistics();

      expect(stats.totalConnections).toBe(2);
      expect(stats.authenticatedConnections).toBe(2); // Auth disabled

      client1.close();
      client2.close();
    });
  });

  describe('Disconnection', () => {
    it('should allow manual disconnection of clients', (done) => {
      client = new WebSocket(`ws://localhost:${testPort}`);

      client.on('open', () => {
        setTimeout(() => {
          const connections = server.getConnections();
          server.disconnect(connections[0].connectionId, 'Test disconnect');
        }, 100);
      });

      client.on('close', () => {
        done();
      });
    });
  });
});
