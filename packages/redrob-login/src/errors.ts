/**
 * Login cannot be used here: no issuer configured, the server does not know this client, the
 * grant is not enabled for it, or there is no keychain to keep the session in. The caller keeps
 * using its existing `rrk_` Console key path.
 */
export class NotAvailableError extends Error {
  readonly reason: string;
  constructor(reason: string, message?: string) {
    super(message ?? reason);
    this.name = "NotAvailableError";
    this.reason = reason;
  }
}

/** Any other failure of a login, refresh or device flow, carrying the OAuth error code when there is one. */
export class LoginError extends Error {
  readonly code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.name = "LoginError";
    this.code = code;
  }
}
