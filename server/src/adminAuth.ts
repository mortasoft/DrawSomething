import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const DEFAULT_ADMIN_PASSWORD = 'admin123';

const MAX_FAILED_ATTEMPTS = 10;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

export interface AdminAuthOptions {
  password?: string;
  secret?: string;
  tokenTtlMs?: number;
  disableRateLimit?: boolean;
}

interface TokenPayload {
  role: 'admin';
  exp: number;
  nonce: string;
}

interface FailureRecord {
  count: number;
  windowStart: number;
}

function sha256(value: string): Buffer {
  return crypto.createHash('sha256').update(value, 'utf8').digest();
}

function safeEqualStrings(a: string, b: string): boolean {
  return crypto.timingSafeEqual(sha256(a), sha256(b));
}

function toBase64Url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function fromBase64Url(input: string): Buffer {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + '='.repeat(padLen), 'base64');
}

/**
 * Stateless HMAC-SHA256 admin authentication with per-IP login rate limiting.
 */
export class AdminAuth {
  private readonly configuredPassword: string;
  public readonly isDefaultPassword: boolean;
  private readonly secret: string;
  private readonly tokenTtlMs: number;
  private readonly disableRateLimit: boolean;
  private readonly failedAttempts = new Map<string, FailureRecord>();

  constructor(options: AdminAuthOptions = {}) {
    const envPassword = process.env.ADMIN_PASSWORD?.trim() || undefined;
    const envSecret = process.env.ADMIN_SESSION_SECRET?.trim() || undefined;
    this.configuredPassword =
      options.password ?? envPassword ?? DEFAULT_ADMIN_PASSWORD;
    this.isDefaultPassword = !options.password && !envPassword;
    this.secret =
      options.secret ??
      envSecret ??
      crypto.randomBytes(32).toString('hex');
    this.tokenTtlMs = options.tokenTtlMs ?? 24 * 60 * 60 * 1000;
    this.disableRateLimit = Boolean(options.disableRateLimit);
  }

  public isRateLimited(ip: string): boolean {
    if (this.disableRateLimit) return false;
    const record = this.failedAttempts.get(ip);
    if (!record) return false;

    const now = Date.now();
    if (now - record.windowStart > RATE_LIMIT_WINDOW_MS) {
      this.failedAttempts.delete(ip);
      return false;
    }

    return record.count >= MAX_FAILED_ATTEMPTS;
  }

  public recordFailedAttempt(ip: string): void {
    if (this.disableRateLimit) return;
    const now = Date.now();
    const existing = this.failedAttempts.get(ip);
    if (!existing || now - existing.windowStart > RATE_LIMIT_WINDOW_MS) {
      this.failedAttempts.set(ip, { count: 1, windowStart: now });
      return;
    }
    existing.count += 1;
  }

  public clearFailedAttempts(ip: string): void {
    this.failedAttempts.delete(ip);
  }

  public verifyPassword(password: string): boolean {
    if (typeof password !== 'string' || password.length === 0) {
      return false;
    }
    return safeEqualStrings(password, this.configuredPassword);
  }

  public issueToken(): { token: string; expiresAt: number } {
    const expiresAt = Date.now() + this.tokenTtlMs;
    const payload: TokenPayload = {
      role: 'admin',
      exp: expiresAt,
      nonce: crypto.randomBytes(12).toString('hex'),
    };
    const encodedPayload = toBase64Url(JSON.stringify(payload));
    const signature = this.sign(encodedPayload);
    return {
      token: `${encodedPayload}.${signature}`,
      expiresAt,
    };
  }

  public verifyToken(token: string): boolean {
    if (typeof token !== 'string') return false;
    const parts = token.split('.');
    if (parts.length !== 2) return false;

    const [encodedPayload, signature] = parts;
    if (!encodedPayload || !signature) return false;

    const expectedSig = this.sign(encodedPayload);
    const sigBuf = Buffer.from(signature, 'utf8');
    const expBuf = Buffer.from(expectedSig, 'utf8');
    if (sigBuf.length !== expBuf.length) return false;
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) return false;

    try {
      const parsed = JSON.parse(
        fromBase64Url(encodedPayload).toString('utf8')
      ) as Partial<TokenPayload>;
      if (parsed.role !== 'admin') return false;
      if (typeof parsed.exp !== 'number' || Date.now() > parsed.exp) return false;
      return true;
    } catch {
      return false;
    }
  }

  private sign(encodedPayload: string): string {
    return toBase64Url(
      crypto
        .createHmac('sha256', this.secret)
        .update(encodedPayload, 'utf8')
        .digest()
    );
  }

  public requireAdmin = (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    const authHeader = req.headers.authorization;
    const token =
      typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.slice('Bearer '.length).trim()
        : '';

    if (!token || !this.verifyToken(token)) {
      res.status(401).json({
        ok: false,
        error: 'No autorizado. Inicia sesión como administrador.',
      });
      return;
    }

    next();
  };
}
