import { pino, type DestinationStream, type Logger } from 'pino';

/** Structured JSON logger. Credentials and tokens are redacted wherever they could appear. */
export function createLogger(level: string, destination?: DestinationStream): Logger {
  return pino(
    {
      level,
      base: { service: 'dealership-api' },
      timestamp: pino.stdTimeFunctions.isoTime,
      redact: {
        paths: [
          'password',
          '*.password',
          'newPassword',
          '*.newPassword',
          'token',
          '*.token',
          'accessToken',
          '*.accessToken',
          'refreshToken',
          '*.refreshToken',
          'authorization',
          '*.authorization',
          'cookie',
          '*.cookie',
          'req.headers.authorization',
          'req.headers.cookie',
          'res.headers["set-cookie"]',
        ],
        censor: '[REDACTED]',
      },
    },
    destination,
  );
}
