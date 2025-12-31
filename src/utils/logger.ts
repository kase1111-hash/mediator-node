import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

const logLevel = process.env.LOG_LEVEL || 'info';
const logDir = process.env.LOG_DIR || './logs';

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
 * - Keeps 7 days of logs
 * - Max 50MB per file
 */
const combinedRotateTransport = new DailyRotateFile({
  filename: `${logDir}/combined-%DATE%.log`,
  datePattern: 'YYYY-MM-DD',
  maxSize: '50m',
  maxFiles: '7d',
  zippedArchive: true,
});

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
    winston.format.json()
  ),
  defaultMeta: { service: 'mediator-node' },
  transports: [
    errorRotateTransport,
    combinedRotateTransport,
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
});
