export interface HealthResponse {
  status: 'ok';
  service: string;
  version: string;
  environment: string;
}

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '/api/v1').replace(/\/$/, '');

export async function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch(`${apiBaseUrl}/health`, {
    headers: { Accept: 'application/json' },
    signal,
  });

  if (!response.ok) {
    throw new Error(`健康检查失败 (${response.status})`);
  }

  return (await response.json()) as HealthResponse;
}
