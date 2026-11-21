import { projectId } from '../shared/firebase-project.js';

// Firestore verifies the Google signature, token lifetime and project, then applies
// the very same membership rule used by cloud sync. Never trust a decoded token alone.
export async function checkAccess(header, request = fetch) {
  const match = /^Bearer ([\w-]+\.[\w-]+\.[\w-]+)$/i.exec(header || '');
  if (!match || match[1].length > 8192) return 401;
  let claims;
  try { claims = JSON.parse(Buffer.from(match[1].split('.')[1], 'base64url').toString('utf8')); }
  catch { return 401; }
  if (claims?.aud !== projectId || claims.iss !== 'https://securetoken.google.com/' + projectId ||
    claims.firebase?.sign_in_provider !== 'google.com' || claims.email_verified !== true ||
    typeof claims.email !== 'string' || !/^[^/\s@]+@[^/\s@]+$/.test(claims.email) || claims.email.length > 254) return 401;
  const url = 'https://firestore.googleapis.com/v1/projects/' + projectId +
    '/databases/(default)/documents/members/' + encodeURIComponent(claims.email.toLowerCase());
  try {
    const response = await request(url, { headers: { Authorization: 'Bearer ' + match[1] }, signal: AbortSignal.timeout(7000) });
    if (response.status === 401) return 401;
    if ([403, 404].includes(response.status)) return 403;
    if (!response.ok) return 503;
    return (await response.json()).fields?.enabled?.booleanValue === true ? 200 : 403;
  } catch { return 503; }
}
