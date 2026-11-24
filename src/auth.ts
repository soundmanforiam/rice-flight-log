// Editing is protected by Cloudflare Access (Zero Trust). Access sits in front of /admin/*,
// signs the user in (email one-time code) and adds a signed JWT to each request it lets through.
// The Worker verifies that JWT itself, so a forged header on an unprotected path is rejected.

export interface AuthEnv {
  ACCESS_TEAM_DOMAIN?: string; // e.g. "riceaviation.cloudflareaccess.com"
  ACCESS_AUD?: string; // Application Audience (AUD) tag from the Access application
  ALLOW_OPEN_WRITES?: string; // "true" only before Access is set up
}

interface Jwk { kid: string; kty: string; n: string; e: string; alg?: string }
let certCache: { keys: Jwk[]; fetched: number } | null = null;

function b64urlToBytes(s: string): Uint8Array {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function getKeys(team: string): Promise<Jwk[]> {
  if (certCache && Date.now() - certCache.fetched < 60 * 60 * 1000) return certCache.keys;
  const res = await fetch(`https://${team}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error('could not fetch Access certs');
  const data = (await res.json()) as { keys: Jwk[] };
  certCache = { keys: data.keys, fetched: Date.now() };
  return data.keys;
}

/** Returns the signed-in user's email, or null if the request is not authenticated. */
export async function accessUser(request: Request, env: AuthEnv): Promise<string | null> {
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) {
    return env.ALLOW_OPEN_WRITES === 'true' ? 'open-writes' : null;
  }
  const token =
    request.headers.get('Cf-Access-Jwt-Assertion') ||
    (request.headers.get('Cookie') || '').match(/CF_Authorization=([^;]+)/)?.[1];
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[0])));
    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[1])));
    const keys = await getKeys(env.ACCESS_TEAM_DOMAIN);
    const jwk = keys.find((k) => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey(
      'jwk',
      { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const ok = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      b64urlToBytes(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
    );
    if (!ok) return null;
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!aud.includes(env.ACCESS_AUD)) return null;
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    if (payload.iss && payload.iss !== `https://${env.ACCESS_TEAM_DOMAIN}`) return null;
    return payload.email || 'signed-in';
  } catch {
    return null;
  }
}
