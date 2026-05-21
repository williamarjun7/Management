import * as Sentry from '@sentry/react';
import { logger } from './logger';

export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) {
    logger.warn('SENTRY_DSN not configured — skipping Sentry init', 'sentry');
    return;
  }

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 0.0,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    beforeSend(event) {
      if (event.request?.data) {
        const sensitive = ['password', 'token', 'secret', 'authorization', 'apiKey'];
        const reqData = event.request.data as Record<string, unknown>;
        for (const key of sensitive) {
          delete reqData[key];
        }
      }
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.slice(-50);
      }
      return event;
    },
    initialScope: {
      tags: {
        tab_id: logger.getTabId(),
        device_id: logger.getDeviceId(),
      },
    },
  });

  logger.info('sentry_initialized', 'sentry', {
    metadata: { environment: import.meta.env.MODE },
  });
}

export function captureError(error: unknown, context?: Record<string, unknown>): void {
  logger.error('captured_by_sentry', 'sentry', { metadata: context ?? {} });
  Sentry.captureException(error, { extra: context });
}

export function captureMessage(message: string, level?: 'log' | 'debug' | 'info' | 'warning' | 'error'): void {
  logger.info('sentry_message', 'sentry', { metadata: { message, level } });
  Sentry.captureMessage(message, level);
}

export function updateSentryTags(tags: Record<string, string>): void {
  for (const [key, value] of Object.entries(tags)) {
    Sentry.setTag(key, value);
  }
}

export { Sentry };
