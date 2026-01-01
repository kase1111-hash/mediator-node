import { WebSocket, WebSocketServer as WSServer } from 'ws';
import { createServer, Server as HTTPServer } from 'http';
import { randomBytes } from 'crypto';
import {
  WebSocketConnection,
  WebSocketMessage,
  WebSocketEventType,
  AuthenticationMessage,
  AuthenticationResponse,
  SubscriptionRequest,
  SubscriptionResponse,
  WebSocketSubscription,
} from '../types';
import { logger } from '../utils/logger';
import { AuthenticationService } from './AuthenticationService';
import { WebSocketMessageSchema, AuthenticationMessageSchema } from '../validation/schemas';

/**
 * Configuration for WebSocket server
 */
export interface WebSocketServerConfig {
  port: number;
  host?: string;
  authRequired?: boolean;
  authTimeout?: number; // Milliseconds before unauthenticated connection is closed
  heartbeatInterval?: number; // Milliseconds between heartbeats
  maxConnections?: number;
  /**
   * Allowed origins for CORS. Must be explicitly configured.
   * Use ['*'] only in development - not recommended for production.
   */
  allowedOrigins: string[];
  enableCompression?: boolean;
  /**
   * Maximum messages per second per connection (rate limiting)
   * Default: 100
   */
  maxMessagesPerSecond?: number;
}

/**
 * Rate limit tracking for a connection
 */
interface RateLimitState {
  messageCount: number;
  windowStart: number;
}

/**
 * WebSocket Server for real-time event broadcasting
 *
 * Manages client connections, authentication, and message routing
 */
export class WebSocketServer {
  private wss: WSServer;
  private httpServer: HTTPServer;
  private connections: Map<string, WebSocketConnection>;
  private clients: Map<string, WebSocket>;
  private config: Required<WebSocketServerConfig>;
  private heartbeatIntervalId?: NodeJS.Timeout;
  private authTimeouts: Map<string, NodeJS.Timeout>;
  private authService: AuthenticationService;
  private rateLimitStates: Map<string, RateLimitState>;

  constructor(config: WebSocketServerConfig, authService?: AuthenticationService) {
    // SECURITY: Warn if wildcard CORS is used
    if (config.allowedOrigins.includes('*')) {
      logger.warn('WebSocket server configured with wildcard CORS origin (*). This is not recommended for production.');
    }

    this.config = {
      // Apply config first, then set defaults for missing values
      ...config,
      host: config.host || '0.0.0.0',
      authRequired: config.authRequired ?? true,
      authTimeout: config.authTimeout || 30000, // 30 seconds default
      heartbeatInterval: config.heartbeatInterval || 30000, // 30 seconds
      maxConnections: config.maxConnections || 1000,
      enableCompression: config.enableCompression ?? true,
      maxMessagesPerSecond: config.maxMessagesPerSecond || 100,
    };

    this.connections = new Map();
    this.clients = new Map();
    this.authTimeouts = new Map();
    this.rateLimitStates = new Map();
    this.authService = authService || new AuthenticationService();

    // Create HTTP server
    this.httpServer = createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('WebSocket server is running');
    });

    // Create WebSocket server
    this.wss = new WSServer({
      server: this.httpServer,
      perMessageDeflate: this.config.enableCompression,
    });

    this.setupEventHandlers();
  }

  /**
   * Start the WebSocket server
   */
  public start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.httpServer.listen(this.config.port, this.config.host, () => {
          logger.info('WebSocket server started', {
            port: this.config.port,
            host: this.config.host,
            authRequired: this.config.authRequired,
          });

          // Start heartbeat interval
          this.startHeartbeat();

          resolve();
        });

        this.httpServer.on('error', (err) => {
          logger.error('HTTP server error', { error: err.message });
          reject(err);
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Stop the WebSocket server
   */
  public stop(): Promise<void> {
    return new Promise((resolve) => {
      // Stop heartbeat
      if (this.heartbeatIntervalId) {
        clearInterval(this.heartbeatIntervalId);
      }

      // Clear all auth timeouts
      this.authTimeouts.forEach((timeout) => clearTimeout(timeout));
      this.authTimeouts.clear();

      // Cleanup authentication service
      this.authService.destroy();

      // Close all client connections
      this.clients.forEach((ws) => {
        ws.close(1000, 'Server shutting down');
      });

      // Close WebSocket server
      this.wss.close(() => {
        // Close HTTP server
        this.httpServer.close(() => {
          logger.info('WebSocket server stopped');
          resolve();
        });
      });
    });
  }

  /**
   * Get all active connections
   */
  public getConnections(): WebSocketConnection[] {
    return Array.from(this.connections.values());
  }

  /**
   * Get connection by ID
   */
  public getConnection(connectionId: string): WebSocketConnection | undefined {
    return this.connections.get(connectionId);
  }

  /**
   * Get connections by identity
   */
  public getConnectionsByIdentity(identity: string): WebSocketConnection[] {
    return Array.from(this.connections.values()).filter(
      (conn) => conn.identity === identity
    );
  }

  /**
   * Broadcast message to specific connections
   */
  public broadcast(
    message: WebSocketMessage,
    connectionIds?: string[]
  ): void {
    const targets = connectionIds
      ? connectionIds
      : Array.from(this.connections.keys());

    // Pre-serialize the message once for efficiency and to catch serialization errors early
    let serializedMessage: string;
    try {
      serializedMessage = JSON.stringify(message);
    } catch (serializeErr: any) {
      logger.error('Failed to serialize WebSocket message', {
        eventType: message.type,
        error: serializeErr.message || 'JSON stringify failed',
      });
      return;
    }

    for (const connId of targets) {
      const ws = this.clients.get(connId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(serializedMessage);
          logger.debug('Message sent to connection', {
            connectionId: connId,
            eventType: message.type,
          });
        } catch (err: any) {
          logger.error('Failed to send message to connection', {
            connectionId: connId,
            eventType: message.type,
            error: err.message || 'Unknown send error',
          });
        }
      }
    }
  }

  /**
   * Send message to specific connection
   */
  public send(connectionId: string, message: WebSocketMessage): void {
    this.broadcast(message, [connectionId]);
  }

  /**
   * Disconnect a specific connection
   */
  public disconnect(connectionId: string, reason?: string): void {
    const ws = this.clients.get(connectionId);
    if (ws) {
      ws.close(1000, reason || 'Disconnected by server');
    }
  }

  /**
   * Add subscription to a connection
   */
  public addSubscription(
    connectionId: string,
    subscription: WebSocketSubscription
  ): boolean {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return false;
    }

    // Check if subscription already exists
    const existingIndex = connection.subscriptions.findIndex(
      (sub) => sub.subscriptionId === subscription.subscriptionId
    );

    if (existingIndex >= 0) {
      // Update existing subscription
      connection.subscriptions[existingIndex] = subscription;
    } else {
      // Add new subscription
      connection.subscriptions.push(subscription);
    }

    logger.debug('Subscription added', {
      connectionId,
      subscriptionId: subscription.subscriptionId,
      topics: subscription.topics,
    });

    return true;
  }

  /**
   * Remove subscription from a connection
   */
  public removeSubscription(
    connectionId: string,
    subscriptionId: string
  ): boolean {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return false;
    }

    const index = connection.subscriptions.findIndex(
      (sub) => sub.subscriptionId === subscriptionId
    );

    if (index >= 0) {
      connection.subscriptions.splice(index, 1);
      logger.debug('Subscription removed', {
        connectionId,
        subscriptionId,
      });
      return true;
    }

    return false;
  }

  /**
   * Get statistics about server state
   */
  public getStatistics(): {
    totalConnections: number;
    authenticatedConnections: number;
    totalSubscriptions: number;
    connectionsByIdentity: Record<string, number>;
  } {
    const connections = Array.from(this.connections.values());
    const authenticatedConnections = connections.filter(
      (conn) => conn.authenticated
    ).length;

    const connectionsByIdentity: Record<string, number> = {};
    for (const conn of connections) {
      connectionsByIdentity[conn.identity] =
        (connectionsByIdentity[conn.identity] || 0) + 1;
    }

    const totalSubscriptions = connections.reduce(
      (sum, conn) => sum + conn.subscriptions.length,
      0
    );

    return {
      totalConnections: connections.length,
      authenticatedConnections,
      totalSubscriptions,
      connectionsByIdentity,
    };
  }

  /**
   * Setup WebSocket event handlers
   */
  private setupEventHandlers(): void {
    this.wss.on('connection', (ws: WebSocket, req) => {
      const connectionId = this.generateConnectionId();

      // Check max connections
      if (this.connections.size >= this.config.maxConnections) {
        ws.close(1008, 'Maximum connections reached');
        logger.warn('Connection rejected: max connections reached');
        return;
      }

      // Check origin
      const origin = req.headers.origin || '';
      if (
        this.config.allowedOrigins[0] !== '*' &&
        !this.config.allowedOrigins.includes(origin)
      ) {
        ws.close(1008, 'Origin not allowed');
        logger.warn('Connection rejected: origin not allowed', { origin });
        return;
      }

      // Create connection metadata
      const connection: WebSocketConnection = {
        connectionId,
        identity: '', // Set during authentication
        connectedAt: Date.now(),
        lastActivity: Date.now(),
        subscriptions: [],
        authenticated: !this.config.authRequired,
        metadata: {
          origin,
          userAgent: req.headers['user-agent'] || '',
          ip: req.socket.remoteAddress || '',
        },
      };

      this.connections.set(connectionId, connection);
      this.clients.set(connectionId, ws);

      logger.info('WebSocket connection established', {
        connectionId,
        origin,
        ip: connection.metadata?.ip,
      });

      // Set auth timeout if required
      if (this.config.authRequired) {
        const timeout = setTimeout(() => {
          if (!connection.authenticated) {
            logger.warn('Connection authentication timeout', {
              connectionId,
            });
            ws.close(1008, 'Authentication timeout');
          }
        }, this.config.authTimeout);

        this.authTimeouts.set(connectionId, timeout);
      }

      // Setup client event handlers
      ws.on('message', (data: Buffer) => {
        this.handleMessage(connectionId, data);
      });

      ws.on('close', (code: number, reason: Buffer) => {
        this.handleClose(connectionId, code, reason.toString());
      });

      ws.on('error', (error: Error) => {
        this.handleError(connectionId, error);
      });

      ws.on('pong', () => {
        connection.lastActivity = Date.now();
      });

      // Send connection acknowledgment
      const ackMessage: WebSocketMessage = {
        type: 'system.node_status_changed' as WebSocketEventType,
        timestamp: Date.now(),
        eventId: this.generateEventId(),
        version: '1.0',
        payload: {
          message: 'Connected to NatLangChain Mediator Node',
          connectionId,
          authRequired: this.config.authRequired,
        },
      };

      try {
        ws.send(JSON.stringify(ackMessage));
      } catch (err: any) {
        logger.error('Failed to send connection acknowledgment', {
          connectionId,
          error: err.message || 'Unknown error',
        });
      }
    });

    this.wss.on('error', (error: Error) => {
      logger.error('WebSocket server error', { error: error.message });
    });
  }

  /**
   * Handle incoming message from client with validation and size limits
   */
  private handleMessage(connectionId: string, data: Buffer): void {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }

    connection.lastActivity = Date.now();

    // SECURITY: Rate limiting per connection
    const now = Date.now();
    let rateState = this.rateLimitStates.get(connectionId);
    if (!rateState) {
      rateState = { messageCount: 0, windowStart: now };
      this.rateLimitStates.set(connectionId, rateState);
    }

    // Reset window if more than 1 second has passed
    if (now - rateState.windowStart >= 1000) {
      rateState.messageCount = 0;
      rateState.windowStart = now;
    }

    rateState.messageCount++;

    if (rateState.messageCount > this.config.maxMessagesPerSecond) {
      logger.warn('Rate limit exceeded, closing connection', {
        connectionId,
        messagesPerSecond: rateState.messageCount,
        limit: this.config.maxMessagesPerSecond,
      });
      const ws = this.clients.get(connectionId);
      if (ws) {
        ws.close(1008, 'Rate limit exceeded');
      }
      return;
    }

    try {
      // SECURITY: Enforce message size limit (100 KB)
      const MAX_MESSAGE_SIZE = 100 * 1024;
      if (data.length > MAX_MESSAGE_SIZE) {
        logger.warn('Message too large', {
          connectionId,
          size: data.length,
          maxSize: MAX_MESSAGE_SIZE,
        });
        this.send(connectionId, {
          type: 'system.node_status_changed' as WebSocketEventType,
          timestamp: Date.now(),
          eventId: this.generateEventId(),
          version: '1.0',
          payload: {
            success: false,
            error: `Message too large (${data.length} bytes, max ${MAX_MESSAGE_SIZE})`,
          },
        });
        return;
      }

      // Parse JSON
      const rawMessage = JSON.parse(data.toString());

      // Handle authentication (special case - different schema)
      if (rawMessage.action === 'authenticate') {
        // Validate authentication message
        const authResult = AuthenticationMessageSchema.safeParse(rawMessage);
        if (!authResult.success) {
          logger.warn('Invalid authentication message', {
            connectionId,
            errors: authResult.error.errors,
          });
          this.send(connectionId, {
            type: 'system.node_status_changed' as WebSocketEventType,
            timestamp: Date.now(),
            eventId: this.generateEventId(),
            version: '1.0',
            payload: {
              success: false,
              error: 'Invalid authentication message format',
            },
          });
          return;
        }
        this.handleAuthentication(connectionId, authResult.data as AuthenticationMessage);
        return;
      }

      // Check if connection is authenticated
      if (this.config.authRequired && !connection.authenticated) {
        const errorResponse: AuthenticationResponse = {
          success: false,
          error: 'Authentication required',
        };
        this.send(connectionId, {
          type: 'system.node_status_changed' as WebSocketEventType,
          timestamp: Date.now(),
          eventId: this.generateEventId(),
          version: '1.0',
          payload: errorResponse,
        });
        return;
      }

      // SECURITY: Validate message schema for subscription messages
      if (rawMessage.type === 'subscribe' || rawMessage.type === 'unsubscribe' || rawMessage.type === 'ping') {
        const validationResult = WebSocketMessageSchema.safeParse(rawMessage);
        if (!validationResult.success) {
          logger.warn('Invalid message format', {
            connectionId,
            messageType: rawMessage.type,
            errors: validationResult.error.errors,
          });
          this.send(connectionId, {
            type: 'system.node_status_changed' as WebSocketEventType,
            timestamp: Date.now(),
            eventId: this.generateEventId(),
            version: '1.0',
            payload: {
              success: false,
              error: `Invalid message format: ${validationResult.error.errors[0].message}`,
            },
          });
          return;
        }

        const message = validationResult.data;

        // Handle ping
        if (message.type === 'ping') {
          this.send(connectionId, {
            type: 'system.node_status_changed' as WebSocketEventType,
            timestamp: Date.now(),
            eventId: this.generateEventId(),
            version: '1.0',
            payload: {
              type: 'pong',
              timestamp: Date.now(),
            },
          });
          return;
        }

        // Handle subscription management
        if (message.type === 'subscribe' || message.type === 'unsubscribe') {
          // Convert to legacy format for handleSubscription
          const legacyMessage = {
            action: message.type,
            channels: message.channels,
            filters: 'filters' in message ? message.filters : undefined,
          };
          this.handleSubscription(connectionId, legacyMessage as SubscriptionRequest);
          return;
        }
      }

      // Handle legacy format for backward compatibility
      if (rawMessage.action === 'subscribe' || rawMessage.action === 'unsubscribe' || rawMessage.action === 'update') {
        this.handleSubscription(connectionId, rawMessage as SubscriptionRequest);
        return;
      }

      // Unknown message type
      logger.warn('Unknown message type', {
        connectionId,
        messageType: rawMessage.type || rawMessage.action,
      });
      this.send(connectionId, {
        type: 'system.node_status_changed' as WebSocketEventType,
        timestamp: Date.now(),
        eventId: this.generateEventId(),
        version: '1.0',
        payload: {
          success: false,
          error: 'Unknown message type',
        },
      });
    } catch (err: any) {
      logger.error('Failed to parse or validate message', {
        connectionId,
        error: err.message,
      });
      this.send(connectionId, {
        type: 'system.node_status_changed' as WebSocketEventType,
        timestamp: Date.now(),
        eventId: this.generateEventId(),
        version: '1.0',
        payload: {
          success: false,
          error: 'Message parsing failed',
        },
      });
    }
  }

  /**
   * Handle client authentication
   */
  private async handleAuthentication(
    connectionId: string,
    message: AuthenticationMessage
  ): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }

    const now = Date.now();

    // Verify authentication using AuthenticationService
    const result = await this.authService.verify(message);

    if (!result.success) {
      const response: AuthenticationResponse = {
        success: false,
        error: result.error,
      };

      this.send(connectionId, {
        type: 'system.node_status_changed' as WebSocketEventType,
        timestamp: now,
        eventId: this.generateEventId(),
        version: '1.0',
        payload: response,
      });

      // Close connection after failed auth
      setTimeout(() => {
        this.disconnect(connectionId, 'Authentication failed');
      }, 1000);

      return;
    }

    // Mark as authenticated
    connection.authenticated = true;
    connection.identity = result.identity!;
    if (result.metadata) {
      connection.metadata = { ...connection.metadata, ...result.metadata };
    }

    // Clear auth timeout
    const timeout = this.authTimeouts.get(connectionId);
    if (timeout) {
      clearTimeout(timeout);
      this.authTimeouts.delete(connectionId);
    }

    logger.info('Client authenticated', {
      connectionId,
      identity: result.identity,
    });

    // Send success response
    const response: AuthenticationResponse = {
      success: true,
      connectionId,
      expiresAt: now + 24 * 60 * 60 * 1000, // 24 hours
    };

    this.send(connectionId, {
      type: 'system.node_status_changed' as WebSocketEventType,
      timestamp: now,
      eventId: this.generateEventId(),
      version: '1.0',
      payload: response,
    });
  }

  /**
   * Handle subscription request
   */
  private handleSubscription(
    connectionId: string,
    request: SubscriptionRequest
  ): void {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }

    let response: SubscriptionResponse;

    if (request.action === 'subscribe') {
      const subscriptionId = request.subscriptionId || this.generateSubscriptionId();
      const subscription: WebSocketSubscription = {
        subscriptionId,
        topics: request.topics || [],
        filters: request.filters,
      };

      const success = this.addSubscription(connectionId, subscription);

      response = {
        success,
        subscriptionId,
        activeSubscriptions: connection.subscriptions,
      };
    } else if (request.action === 'unsubscribe') {
      if (!request.subscriptionId) {
        response = {
          success: false,
          error: 'subscriptionId required for unsubscribe',
        };
      } else {
        const success = this.removeSubscription(connectionId, request.subscriptionId);
        response = {
          success,
          activeSubscriptions: connection.subscriptions,
        };
      }
    } else if (request.action === 'update') {
      if (!request.subscriptionId) {
        response = {
          success: false,
          error: 'subscriptionId required for update',
        };
      } else {
        const subscription: WebSocketSubscription = {
          subscriptionId: request.subscriptionId,
          topics: request.topics || [],
          filters: request.filters,
        };

        const success = this.addSubscription(connectionId, subscription);
        response = {
          success,
          subscriptionId: request.subscriptionId,
          activeSubscriptions: connection.subscriptions,
        };
      }
    } else {
      response = {
        success: false,
        error: 'Invalid subscription action',
      };
    }

    this.send(connectionId, {
      type: 'system.node_status_changed' as WebSocketEventType,
      timestamp: Date.now(),
      eventId: this.generateEventId(),
      version: '1.0',
      payload: response,
    });
  }

  /**
   * Handle client disconnect
   */
  private handleClose(connectionId: string, code: number, reason: string): void {
    const connection = this.connections.get(connectionId);

    logger.info('WebSocket connection closed', {
      connectionId,
      code,
      reason,
      identity: connection?.identity || 'unauthenticated',
    });

    // Clear auth timeout if exists
    const timeout = this.authTimeouts.get(connectionId);
    if (timeout) {
      clearTimeout(timeout);
      this.authTimeouts.delete(connectionId);
    }

    // Clean up rate limit state
    this.rateLimitStates.delete(connectionId);

    this.connections.delete(connectionId);
    this.clients.delete(connectionId);
  }

  /**
   * Handle client error
   */
  private handleError(connectionId: string, error: Error): void {
    logger.error('WebSocket client error', {
      connectionId,
      error: error.message,
    });
  }

  /**
   * Start heartbeat ping/pong
   */
  private startHeartbeat(): void {
    this.heartbeatIntervalId = setInterval(() => {
      const now = Date.now();

      this.clients.forEach((ws, connectionId) => {
        const connection = this.connections.get(connectionId);
        if (!connection) {
          return;
        }

        // Close stale connections (no activity for 2x heartbeat interval)
        if (now - connection.lastActivity > this.config.heartbeatInterval * 2) {
          logger.warn('Closing stale connection', {
            connectionId,
            lastActivity: connection.lastActivity,
          });
          ws.close(1000, 'Connection timeout');
          return;
        }

        // Send ping
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        }
      });
    }, this.config.heartbeatInterval);
  }

  /**
   * Generate unique connection ID
   */
  private generateConnectionId(): string {
    return `conn-${Date.now()}-${randomBytes(6).toString('hex')}`;
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    return `evt-${Date.now()}-${randomBytes(6).toString('hex')}`;
  }

  /**
   * Generate unique subscription ID
   */
  private generateSubscriptionId(): string {
    return `sub-${Date.now()}-${randomBytes(6).toString('hex')}`;
  }
}
