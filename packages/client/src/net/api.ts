const SERVER_URL = (import.meta.env['VITE_SERVER_URL'] as string | undefined) ?? 'http://localhost:3001';

export async function devLogin(displayName: string): Promise<{
  token: string;
  user: { id: string; email: string; displayName: string | null };
}> {
  const res = await fetch(`${SERVER_URL}/auth/dev-login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ displayName }),
  });
  if (!res.ok) throw new Error(`dev login failed: ${res.status}`);
  return res.json();
}
