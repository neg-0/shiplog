export class AdminApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function adminGet<T>(path: string): Promise<T> {
  const response = await fetch(`/api/admin${path}`, { credentials: 'include' });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new AdminApiError(body?.error || 'Could not load admin data.', response.status);
  }
  return response.json() as Promise<T>;
}
