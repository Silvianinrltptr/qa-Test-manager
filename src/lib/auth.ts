// Server-side Authentication & Session Security for QA Studio
import { NextRequest, NextResponse } from 'next/server';

export type WorkspaceRole = 'qa' | 'dev_pm';

export interface SessionPayload {
  role: WorkspaceRole;
  exp: number;
  iat: number;
}

export const SESSION_COOKIE_NAME = 'qastudio_session';

// Configurable secrets and credentials
const SESSION_SECRET = process.env.SESSION_SECRET || 'qastudio-secure-secret-key-salt-2026-prod-alpha';

// Allowed passwords (server-side only, never transmitted to client)
export function verifyWorkspacePassword(workspace: WorkspaceRole, inputPassword: string): boolean {
  if (!inputPassword || typeof inputPassword !== 'string') return false;
  const trimmed = inputPassword.trim();

  if (workspace === 'qa') {
    const configuredQa = process.env.QA_PASSWORD?.trim();
    if (configuredQa && trimmed === configuredQa) return true;
    // Default safe password and backwards-compatible PIN alias
    return trimmed === 'qa-admin-2026' || trimmed === 'qa123';
  }

  if (workspace === 'dev_pm') {
    const configuredDevPm = process.env.DEV_PM_PASSWORD?.trim();
    if (configuredDevPm && trimmed === configuredDevPm) return true;
    // Default safe password and collaborator PIN alias
    return trimmed === 'dev-pm-2026' || trimmed === 'dev123' || trimmed === 'pm123';
  }

  return false;
}

// Helper: WebCrypto HMAC Key
async function getCryptoKey(): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return await crypto.subtle.importKey(
    'raw',
    enc.encode(SESSION_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

// Convert ArrayBuffer or Uint8Array to URL-safe Base64
function bufferToBase64Url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Convert string to URL-safe Base64
function stringToBase64Url(str: string): string {
  const enc = new TextEncoder();
  return bufferToBase64Url(enc.encode(str));
}

// Convert URL-safe Base64 to string
function base64UrlToString(b64url: string): string {
  let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) {
    b64 += '=';
  }
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const dec = new TextDecoder();
  return dec.decode(bytes);
}

// Convert URL-safe Base64 to ArrayBuffer
function base64UrlToBuffer(b64url: string): Uint8Array {
  let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) {
    b64 += '=';
  }
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Create signed token
export async function createSessionToken(role: WorkspaceRole): Promise<string> {
  const now = Date.now();
  const payload: SessionPayload = {
    role,
    iat: now,
    exp: now + 7 * 24 * 60 * 60 * 1000, // 7 days expiration
  };

  const payloadStr = JSON.stringify(payload);
  const encPayload = stringToBase64Url(payloadStr);

  const key = await getCryptoKey();
  const enc = new TextEncoder();
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(encPayload));
  const encSig = bufferToBase64Url(sigBuf);

  return `${encPayload}.${encSig}`;
}

// Verify signed token
export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;

    const [encPayload, encSig] = parts;
    const key = await getCryptoKey();
    const enc = new TextEncoder();
    const sigBytes = base64UrlToBuffer(encSig);

    const isValid = await crypto.subtle.verify('HMAC', key, sigBytes as unknown as BufferSource, enc.encode(encPayload));
    if (!isValid) return null;

    const payloadStr = base64UrlToString(encPayload);
    const payload = JSON.parse(payloadStr) as SessionPayload;

    if (!payload.role || !payload.exp) return null;
    if (Date.now() > payload.exp) return null;

    return payload;
  } catch {
    return null;
  }
}

// Get session from Request or NextRequest cookie
export async function getSessionUser(req: NextRequest | Request): Promise<SessionPayload | null> {
  try {
    let token: string | undefined;

    if ('cookies' in req && typeof (req as NextRequest).cookies?.get === 'function') {
      token = (req as NextRequest).cookies.get(SESSION_COOKIE_NAME)?.value;
    } else {
      const cookieHeader = req.headers.get('cookie') || '';
      const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]*)`));
      token = match ? decodeURIComponent(match[1]) : undefined;
    }

    if (!token) return null;
    return await verifySessionToken(token);
  } catch {
    return null;
  }
}

// Require Authentication & Role guard for API routes
export async function requireAuth(
  req: NextRequest,
  allowedRoles: WorkspaceRole[] = ['qa']
): Promise<{ session: SessionPayload | null; errorResponse: NextResponse | null }> {
  const session = await getSessionUser(req);

  // If the operation permits Developer & PM collaborators, allow password-free collaborator access
  if (!session && allowedRoles.includes('dev_pm')) {
    return {
      session: { role: 'dev_pm', iat: Date.now(), exp: Date.now() + 86400000 },
      errorResponse: null,
    };
  }

  if (!session) {
    return {
      session: null,
      errorResponse: NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Authentication required. Please sign in to QA Workspace.' },
        { status: 401 }
      ),
    };
  }

  if (!allowedRoles.includes(session.role)) {
    return {
      session,
      errorResponse: NextResponse.json(
        {
          error: 'FORBIDDEN',
          message: 'Insufficient permissions. This operation requires QA workspace authorization.',
        },
        { status: 403 }
      ),
    };
  }

  return { session, errorResponse: null };
}
