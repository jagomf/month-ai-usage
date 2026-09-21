import {
  FetchLike,
  ProviderError,
  UsageSnapshot,
  retryAfterMs,
} from './types';

const ENDPOINT = 'https://api.github.com/copilot_internal/user';
const LABEL = 'Copilot';
const PREFERRED_QUOTA_ID = 'premium_interactions';

export interface CopilotDeps {
  fetch: FetchLike;
  /** Resolves the GitHub access token, or null when there is no usable session. */
  getToken: () => Promise<string | null>;
  onQuotaId?: (quotaId: string) => void;
}

interface QuotaSnapshot {
  quota_id?: unknown;
  entitlement?: unknown;
  remaining?: unknown;
  quota_remaining?: unknown;
  percent_remaining?: unknown;
  credits_used?: unknown;
  unlimited?: unknown;
  has_quota?: unknown;
  overage_count?: unknown;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function pickQuota(snapshots: Record<string, unknown>): { id: string; quota: QuotaSnapshot } | undefined {
  const preferred = snapshots[PREFERRED_QUOTA_ID];
  if (preferred && typeof preferred === 'object') {
    return { id: PREFERRED_QUOTA_ID, quota: preferred as QuotaSnapshot };
  }

  let best: { id: string; quota: QuotaSnapshot; entitlement: number } | undefined;
  for (const [id, value] of Object.entries(snapshots)) {
    if (!value || typeof value !== 'object') {
      continue;
    }
    const quota = value as QuotaSnapshot;
    if (quota.has_quota === false || quota.unlimited === true) {
      continue;
    }
    const entitlement = asNumber(quota.entitlement);
    if (entitlement === undefined) {
      continue;
    }
    if (!best || entitlement > best.entitlement) {
      best = { id, quota, entitlement };
    }
  }
  return best ? { id: best.id, quota: best.quota } : undefined;
}

export function parseCopilot(json: unknown, onQuotaId?: (quotaId: string) => void): UsageSnapshot {
  if (!json || typeof json !== 'object') {
    throw new ProviderError('schema', 'The Copilot response is not a JSON object.');
  }
  const body = json as Record<string, unknown>;
  const snapshots = body.quota_snapshots;
  if (!snapshots || typeof snapshots !== 'object') {
    throw new ProviderError('schema', 'The Copilot response has no quota_snapshots.');
  }

  const unlimitedPreferred = (snapshots as Record<string, unknown>)[PREFERRED_QUOTA_ID];
  if (
    unlimitedPreferred &&
    typeof unlimitedPreferred === 'object' &&
    (unlimitedPreferred as QuotaSnapshot).unlimited === true
  ) {
    onQuotaId?.(PREFERRED_QUOTA_ID);
    return { provider: 'copilot', label: LABEL, usedPct: null, unlimited: true };
  }

  const picked = pickQuota(snapshots as Record<string, unknown>);
  if (!picked) {
    throw new ProviderError('schema', 'Copilot returned no quota with a known limit.');
  }
  onQuotaId?.(picked.id);

  if (picked.quota.unlimited === true) {
    return { provider: 'copilot', label: LABEL, usedPct: null, unlimited: true };
  }

  const entitlement = asNumber(picked.quota.entitlement);
  if (entitlement === undefined || entitlement <= 0) {
    throw new ProviderError('schema', `Copilot quota "${picked.id}" has no entitlement.`);
  }

  const remaining = asNumber(picked.quota.remaining) ?? asNumber(picked.quota.quota_remaining);
  const creditsUsed = asNumber(picked.quota.credits_used);
  let used: number;
  // Under token-based billing `credits_used` is the authoritative figure and does not always
  // match `entitlement - remaining`.
  if (creditsUsed !== undefined && creditsUsed > 0) {
    used = creditsUsed;
  } else if (remaining !== undefined) {
    used = Math.max(0, entitlement - remaining);
  } else {
    const percentRemaining = asNumber(picked.quota.percent_remaining);
    if (percentRemaining === undefined) {
      throw new ProviderError('schema', `Copilot quota "${picked.id}" reports no consumption.`);
    }
    used = Math.max(0, Math.round((entitlement * (100 - percentRemaining)) / 100));
  }

  return {
    provider: 'copilot',
    label: LABEL,
    usedPct: (used / entitlement) * 100,
    used,
    limit: entitlement,
    unit: 'credits',
  };
}

export async function fetchCopilotUsage(deps: CopilotDeps): Promise<UsageSnapshot> {
  const token = await deps.getToken();
  if (!token) {
    throw new ProviderError('auth', 'Sign in to GitHub with the account that has Copilot.');
  }

  let response;
  try {
    response = await deps.fetch(ENDPOINT, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'User-Agent': 'month-ai-usage',
      },
    });
  } catch (error) {
    throw new ProviderError('network', error instanceof Error ? error.message : String(error));
  }

  if (response.status === 401 || response.status === 403) {
    throw new ProviderError('auth', 'GitHub rejected the token; pick the right account.');
  }
  if (response.status === 404) {
    throw new ProviderError('config', 'The selected GitHub account has no Copilot.');
  }
  if (response.status === 429) {
    throw new ProviderError('ratelimit', 'GitHub rate-limited the requests.', retryAfterMs(response));
  }
  if (!response.ok) {
    throw new ProviderError('network', `GitHub responded ${response.status}.`);
  }

  return parseCopilot(await response.json(), deps.onQuotaId);
}
