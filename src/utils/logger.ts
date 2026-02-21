import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { redactSecrets } from './secret-scanner';

const logLevel = process.env.LOG_LEVEL || 'info';
const logDir = process.env.LOG_DIR || './logs';

/**
 * Custom Winston format that redacts secrets from log messages and metadata.
 * Prevents accidental leakage of API keys, PEM keys, etc. to log files.
 */
const secretRedactionFormat = winston.format((info) => {
  if (typeof info.message === 'string') {
    info.message = redactSecrets(info.message);
  }
  for (const key of Object.keys(info)) {
    if (key !== 'level' && key !== 'timestamp' && key !== 'service' && typeof info[key] === 'string') {
      info[key] = redactSecrets(info[key]);
    }
  }
  return info;
})();

/**
 * Daily rotating file transport for error logs
 * - Rotates daily
 * - Keeps 14 days of logs
 * - Max 20MB per file
 */
const errorRotateTransport = new DailyRotateFile({
  filename: `${logDir}/error-%DATE%.log`,
  datePattern: 'YYYY-MM-DD',
  level: 'error',
  maxSize: '20m',
  maxFiles: '14d',
  zippedArchive: true,
});

/**
 * Daily rotating file transport for combined logs
 * - Rotates daily
 * - Keeps 30 days of logs (aligned with settlement dispute window)
 * - Max 50MB per file
 */
const combinedRotateTransport = new DailyRotateFile({
  filename: `${logDir}/combined-%DATE%.log`,
  datePattern: 'YYYY-MM-DD',
  maxSize: '50m',
  maxFiles: '30d',
  zippedArchive: true,
});

/**
 * Security audit log transport
 * - Captures only security-tagged events (metadata.security === true)
 * - Keeps 90 days for forensic analysis
 * - Max 20MB per file
 */
const securityRotateTransport = new DailyRotateFile({
  filename: `${logDir}/security-%DATE%.log`,
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '90d',
  zippedArchive: true,
});

// Filter: only pass log entries with security: true metadata
const securityFilter = winston.format((info) => {
  return info.security === true ? info : false;
})();

securityRotateTransport.format = winston.format.combine(
  securityFilter,
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.json()
);

// Log rotation events
errorRotateTransport.on('rotate', (oldFilename, newFilename) => {
  logger.info('Error log rotated', { oldFilename, newFilename });
});

combinedRotateTransport.on('rotate', (oldFilename, newFilename) => {
  logger.info('Combined log rotated', { oldFilename, newFilename });
});

export const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    secretRedactionFormat,
    winston.format.json()
  ),
  defaultMeta: { service: 'mediator-node' },
  transports: [
    errorRotateTransport,
    combinedRotateTransport,
    securityRotateTransport,
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
});
