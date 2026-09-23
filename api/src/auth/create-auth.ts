import type { PrismaService } from '../prisma/prisma.service';
import type { AuthConfig } from './auth-config';
import { isAccountAdmitted, normalizeAccountEmail } from './auth-policy';

/** Native import keeps the maintained ESM auth library outside Nest's CJS output. */
export async function createAuth(prisma: PrismaService, config: AuthConfig) {
  const { betterAuth } = await import('better-auth');
  const { prismaAdapter } = await import('better-auth/adapters/prisma');
  return betterAuth({
    appName: 'Jarvis',
    baseURL: config.baseURL,
    basePath: '/api/auth',
    onAPIError: { errorURL: `${config.appOrigin}/` },
    secret: config.secret,
    trustedOrigins: config.trustedOrigins,
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    telemetry: { enabled: false },
    emailAndPassword: { enabled: false },
    socialProviders: config.google ? { google: config.google } : {},
    user: {
      validateUserInfo: async ({ user, source }) => {
        if (
          source.method !== 'oauth' ||
          source.oauth?.providerId !== 'google' ||
          !user.email ||
          user.emailVerified !== true
        ) {
          return { error: 'Invitation et identité Google vérifiée requises.' };
        }
        const email = normalizeAccountEmail(user.email);
        const invite = await prisma.betaInvite.findUnique({ where: { email } });
        if (
          !isAccountAdmitted(
            { email, emailVerified: true, disabled: false },
            invite,
          )
        ) {
          return { error: 'Invitation requise.' };
        }
      },
      additionalFields: {
        disabled: { type: 'boolean', defaultValue: false, input: false },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24,
      updateAge: 60 * 60,
      cookieCache: { enabled: false },
    },
    account: {
      accountLinking: { enabled: false },
      storeStateStrategy: 'database',
    },
    advanced: {
      useSecureCookies: config.secureCookies,
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', path: '/' },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const email = normalizeAccountEmail(user.email);
            const invite = await prisma.betaInvite.findUnique({
              where: { email },
            });
            if (
              !isAccountAdmitted(
                { email, emailVerified: user.emailVerified, disabled: false },
                invite,
              )
            )
              return false;
            return { data: { ...user, email } };
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            const user = await prisma.user.findUnique({
              where: { id: session.userId },
            });
            if (!user) return false;
            const invite = await prisma.betaInvite.findUnique({
              where: { email: normalizeAccountEmail(user.email) },
            });
            return isAccountAdmitted(user, invite);
          },
        },
      },
      account: {
        create: {
          // Login only needs the verified subject. Gmail/Calendar authorization is separate.
          before: (account) =>
            Promise.resolve({
              data: {
                ...account,
                accessToken: null,
                refreshToken: null,
                idToken: null,
              },
            }),
        },
        update: {
          before: (account) =>
            Promise.resolve({
              data: {
                ...account,
                accessToken: null,
                refreshToken: null,
                idToken: null,
              },
            }),
        },
      },
    },
  });
}
