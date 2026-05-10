import type { GenerateProgressPayload } from '@/types/generateProgress';
import type { StatsResponse } from '@/types/stats';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Calls `POST /generate` and returns the parsed stats payload.
 *
 * In dev, Vite proxies `/generate` to the Flask backend on :5001
 * (see vite.config.ts). In prod, Flask serves the React bundle and the
 * API on the same origin, so the relative URL still works.
 */
export async function fetchGenerateProgress(
  username: string,
  year: string,
): Promise<GenerateProgressPayload | null> {
  const params = new URLSearchParams({ username, year });
  const response = await fetch(`/generate/progress?${params.toString()}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) return null;
  try {
    const data = (await response.json()) as GenerateProgressPayload & { error?: string };
    if (data.error) return null;
    return data;
  } catch {
    return null;
  }
}

export async function generateStats(username: string, year: string): Promise<StatsResponse> {
  const response = await fetch('/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, year }),
  });

  // The backend may return a JSON error body even on non-2xx; try to surface it.
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError(
      `Server returned a non-JSON response (status ${response.status})`,
      response.status,
    );
  }

  if (!response.ok) {
    const message =
      isErrorPayload(payload) && payload.error
        ? payload.error
        : `Request failed with status ${response.status}`;
    throw new ApiError(message, response.status);
  }

  if (isErrorPayload(payload)) {
    throw new ApiError(payload.error);
  }

  return payload as StatsResponse;
}

function isErrorPayload(value: unknown): value is { error: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as { error: unknown }).error === 'string'
  );
}
