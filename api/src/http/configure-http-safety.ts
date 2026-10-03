import { ApiExceptionFilter } from './api-exception.filter';
import { errorCodeForStatus } from '../contracts/v1';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import { REQUEST_LIMITS, REQUEST_QUOTAS } from './request-limits';
import { RequestQuotaService } from './request-quota.service';

/** Register before authentication: its node adapter accepts the bounded parsed body. */
export function configureHttpSafety(app: NestExpressApplication): void {
  app.useGlobalFilters(new ApiExceptionFilter());
  const quota = app.get(RequestQuotaService);
  app.disable('x-powered-by');
  app.set('trust proxy', false);
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'no-store',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    });
    if (process.env.NODE_ENV === 'production') {
      res.set(
        'Content-Security-Policy',
        "default-src 'none'; frame-ancestors 'none'",
      );
      res.set('Strict-Transport-Security', 'max-age=31536000');
    }
    if (Buffer.byteLength(req.originalUrl) > REQUEST_LIMITS.urlBytes) {
      res.status(414).json({
        code: 'REQUEST_TOO_LARGE',
        message: 'Adresse de requête trop longue.',
      });
      return;
    }
    if (Number(req.headers['content-length']) > REQUEST_LIMITS.bodyBytes) {
      res.status(413).json({
        code: 'REQUEST_TOO_LARGE',
        message: 'Requête trop volumineuse.',
      });
      return;
    }
    const hasBody =
      Number(req.headers['content-length']) > 0 ||
      !!req.headers['transfer-encoding'];
    if (
      hasBody &&
      !req.is(['application/json', 'application/x-www-form-urlencoded'])
    ) {
      res.status(415).json({
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: 'Format de requête non pris en charge.',
      });
      return;
    }
    const path = req.path.toLowerCase();
    if (path === '/api/auth' || path.startsWith('/api/auth/')) {
      const retry = quota.consume(
        `auth:${req.socket.remoteAddress ?? 'unknown'}`,
        REQUEST_QUOTAS.authAddress,
      );
      if (retry !== null) {
        res.set('Retry-After', String(retry)).status(429).json({
          code: 'RATE_LIMITED',
          message: 'Trop de requêtes. Réessayez plus tard.',
        });
        return;
      }
    }
    next();
  });
  app.useBodyParser('json', {
    limit: REQUEST_LIMITS.bodyBytes,
    inflate: false,
  });
  app.useBodyParser('urlencoded', {
    limit: REQUEST_LIMITS.bodyBytes,
    extended: false,
    parameterLimit: 50,
    inflate: false,
  });
  app.use(
    (error: unknown, _req: Request, res: Response, next: NextFunction) => {
      const type =
        error && typeof error === 'object' && 'type' in error
          ? error.type
          : undefined;
      if (typeof type !== 'string') {
        next(error);
        return;
      }
      const status =
        type === 'entity.too.large' || type === 'parameters.too.many'
          ? 413
          : type === 'encoding.unsupported'
            ? 415
            : 400;
      res.status(status).json({
        code: errorCodeForStatus(status),
        message:
          status === 413 ? 'Requête trop volumineuse.' : 'Requête invalide.',
      });
    },
  );
}
