import type { NestExpressApplication } from '@nestjs/platform-express';
import { AuthService } from './auth.service';
import { isTrustedMutationOrigin } from './auth-policy';
import type { Request, Response, NextFunction } from 'express';

/** Call before app.init/listen so auth reads the unconsumed request stream. */
export async function configureAuth(
  app: NestExpressApplication,
): Promise<void> {
  const auth = app.get(AuthService);
  app.enableCors({ origin: auth.config.trustedOrigins, credentials: true });
  app.use(
    '/api/auth',
    (request: Request, response: Response, next: NextFunction) => {
      if (
        !['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
        !isTrustedMutationOrigin(
          request.get('origin'),
          auth.config.trustedOrigins,
        )
      ) {
        response
          .status(403)
          .json({ message: 'Origine de la requête non autorisée.' });
        return;
      }
      next();
    },
    await auth.nodeHandler(),
  );
}
