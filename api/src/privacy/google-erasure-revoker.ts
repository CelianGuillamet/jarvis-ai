import { Injectable } from '@nestjs/common';

/** No token in the URL, logs or error messages. Only a 200 proves revocation. */
@Injectable()
export class GoogleErasureRevoker {
  async revoke(token: string): Promise<boolean> {
    if (!token) return false;
    try {
      const response = await fetch('https://oauth2.googleapis.com/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token }),
        redirect: 'error',
        signal: AbortSignal.timeout(5000),
      });
      // The body is not needed, and can contain sensitive provider diagnostics.
      await response.body?.cancel();
      return response.status === 200;
    } catch {
      return false;
    }
  }
}
