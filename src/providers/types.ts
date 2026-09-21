export type ProviderId = 'copilot' | 'claude';

export type ProviderErrorKind = 'auth' | 'network' | 'schema' | 'ratelimit' | 'config' | 'disabled';

export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export interface UsageSnapshot {
  provider: ProviderId;
  label: string;
  /** Percentage of the monthly allowance already consumed, or null when unknown. */
  usedPct: number | null;
  used?: number;
  limit?: number;
  unit?: 'credits' | 'usd';
  unlimited?: boolean;
  error?: { kind: ProviderErrorKind; message: string };
}

export interface FetchResponse {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string> },
) => Promise<FetchResponse>;

export function errorSnapshot(provider: ProviderId, label: string, error: unknown): UsageSnapshot {
  const providerError =
    error instanceof ProviderError
      ? error
      : new ProviderError('network', error instanceof Error ? error.message : String(error));
  return {
    provider,
    label,
    usedPct: null,
    error: { kind: providerError.kind, message: providerError.message },
  };
}

export function retryAfterMs(response: FetchResponse): number | undefined {
  const header = response.headers.get('retry-after');
  if (!header) {
    return undefined;
  }
  const seconds = Number(header);
  return Number.isFinite(seconds) ? seconds * 1000 : undefined;
}
