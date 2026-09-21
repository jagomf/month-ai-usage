import { FetchLike, ProviderError, UsageSnapshot, retryAfterMs } from './types';

const BASE = 'https://claude.ai/api';
const LABEL = 'Claude';

// claude.ai sits behind bot protection that rejects non-browser user agents.
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export function claudeHeaders(sessionKey: string): Record<string, string> {
  return {
    Cookie: `sessionKey=${sessionKey}`,
    Accept: 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    'User-Agent': BROWSER_USER_AGENT,
    Referer: 'https://claude.ai/settings/usage',
    Origin: 'https://claude.ai',
    'anthropic-client-platform': 'web_claude_ai',
  };
}

export interface ClaudeDeps {
  fetch: FetchLike;
  /** Resolves the claude.ai `sessionKey` cookie, or null when it has not been provided yet. */
  getSessionKey: () => Promise<string | undefined>;
  /** Organization uuid from settings; empty means auto-detect. */
  organizationId?: string;
  /** Override from settings, in USD. 0 or undefined means read the limit from claude.ai. */
  monthlyLimitUsd?: number;
  onOrganizationId?: (organizationId: string) => void;
  now?: Date;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** `{ amount_minor, currency, exponent }` money objects used by /usage. */
function amountMinor(value: unknown): number | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  return asNumber((value as Record<string, unknown>).amount_minor);
}

export function pickOrganizationId(json: unknown): string {
  if (!Array.isArray(json) || json.length === 0) {
    throw new ProviderError('schema', 'claude.ai returned no organizations.');
  }
  const organizations = json.filter(
    (entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object',
  );
  const enterprise = organizations.find((entry) => {
    const capabilities = entry.capabilities;
    return (
      Array.isArray(capabilities) &&
      capabilities.some((capability) => typeof capability === 'string' && capability.includes('enterprise'))
    );
  });
  const chosen = enterprise ?? organizations[0];
  const uuid = chosen?.uuid;
  if (typeof uuid !== 'string' || uuid.length === 0) {
    throw new ProviderError('schema', 'The claude.ai organization has no uuid.');
  }
  return uuid;
}

/** Monthly limit in USD cents, or undefined when claude.ai does not report a personal one. */
export function parseSpendLimit(json: unknown): number | undefined {
  if (!json || typeof json !== 'object') {
    return undefined;
  }
  const body = json as Record<string, unknown>;
  if (body.is_enabled === false) {
    return undefined;
  }
  // An organization-wide pool is not this user's allowance.
  if (body.limit_type === 'organization' && !body.account_uuid && !body.group_uuid) {
    return undefined;
  }
  const limit = asNumber(body.monthly_credit_limit);
  return limit !== undefined && limit > 0 ? limit : undefined;
}

export interface ClaudeUsageTotals {
  usedMinorUnits?: number;
  limitMinorUnits?: number;
}

/** Personal spend as shown by claude.ai's usage screen. */
export function parseUsage(json: unknown): ClaudeUsageTotals {
  if (!json || typeof json !== 'object') {
    return {};
  }
  const body = json as Record<string, unknown>;

  const spend = body.spend;
  if (spend && typeof spend === 'object') {
    const row = spend as Record<string, unknown>;
    const used = amountMinor(row.used);
    const limit = amountMinor(row.limit);
    if (used !== undefined || limit !== undefined) {
      return { usedMinorUnits: used, limitMinorUnits: limit };
    }
  }

  const extra = body.extra_usage;
  if (extra && typeof extra === 'object') {
    const row = extra as Record<string, unknown>;
    const used = asNumber(row.used_credits);
    const limit = asNumber(row.monthly_limit);
    if (used !== undefined || limit !== undefined) {
      return {
        usedMinorUnits: used === undefined ? undefined : Math.round(used),
        limitMinorUnits: limit,
      };
    }
  }

  return {};
}

/** Total spend of the period, in USD cents. */
export function parseSpend(json: unknown): number {
  if (!json || typeof json !== 'object') {
    throw new ProviderError('schema', 'The claude.ai spend response is not a JSON object.');
  }
  const body = json as Record<string, unknown>;
  const rows = Array.isArray(body.totals) ? body.totals : Array.isArray(body.series) ? body.series : undefined;
  if (!rows) {
    throw new ProviderError('schema', 'The claude.ai spend response has neither totals nor series.');
  }

  return rows.reduce<number>((total, entry) => {
    if (!entry || typeof entry !== 'object') {
      return total;
    }
    return total + (asNumber((entry as Record<string, unknown>).cost_minor_units) ?? 0);
  }, 0);
}

export function buildClaudeSnapshot(
  usedMinorUnits: number,
  limitMinorUnits: number | undefined,
): UsageSnapshot {
  if (limitMinorUnits === undefined) {
    return {
      provider: 'claude',
      label: LABEL,
      usedPct: null,
      used: usedMinorUnits,
      unit: 'usd',
      error: { kind: 'config', message: 'No monthly limit known; set monthAiUsage.claude.monthlyLimitUsd.' },
    };
  }
  return {
    provider: 'claude',
    label: LABEL,
    usedPct: (usedMinorUnits / limitMinorUnits) * 100,
    used: usedMinorUnits,
    limit: limitMinorUnits,
    unit: 'usd',
  };
}

/** The Claude spend limit resets on the 1st at 00:00 UTC, so the range is computed in UTC. */
export function spendRange(now: Date): { start: string; end: string } {
  const year = now.getUTCFullYear();
  const month = `${now.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${now.getUTCDate()}`.padStart(2, '0');
  return { start: `${year}-${month}-01`, end: `${year}-${month}-${day}` };
}

async function getJson(deps: ClaudeDeps, url: string, sessionKey: string): Promise<unknown> {
  let response;
  try {
    response = await deps.fetch(url, { headers: claudeHeaders(sessionKey) });
  } catch (error) {
    throw new ProviderError('network', error instanceof Error ? error.message : String(error));
  }

  const body = await response.text();

  if (response.status === 401 || response.status === 403) {
    throw looksLikeBotProtection(body)
      ? new ProviderError('network', 'claude.ai blocked the request (bot protection), not your session key.')
      : new ProviderError('auth', 'Your claude.ai session key expired or is not valid.');
  }
  if (response.status === 429) {
    throw new ProviderError('ratelimit', 'claude.ai rate-limited the requests.', retryAfterMs(response));
  }
  if (!response.ok) {
    throw new ProviderError('network', `claude.ai responded ${response.status}.`);
  }

  try {
    return JSON.parse(body);
  } catch {
    throw new ProviderError('schema', 'claude.ai returned a non-JSON response.');
  }
}

/** Cloudflare and friends answer with an HTML challenge instead of JSON. */
export function looksLikeBotProtection(body: string): boolean {
  const head = body.slice(0, 500).toLowerCase();
  return head.includes('<html') || head.includes('cloudflare') || head.includes('just a moment');
}

export async function fetchClaudeUsage(deps: ClaudeDeps): Promise<UsageSnapshot> {
  const sessionKey = await deps.getSessionKey();
  if (!sessionKey) {
    throw new ProviderError('config', 'Missing the claude.ai session key.');
  }

  let organizationId = deps.organizationId;
  if (!organizationId) {
    organizationId = pickOrganizationId(await getJson(deps, `${BASE}/organizations`, sessionKey));
    deps.onOrganizationId?.(organizationId);
  }

  const usage = parseUsage(await getJson(deps, `${BASE}/organizations/${organizationId}/usage`, sessionKey));

  let used = usage.usedMinorUnits;
  if (used === undefined) {
    const { start, end } = spendRange(deps.now ?? new Date());
    const spendUrl =
      `${BASE}/organizations/${organizationId}/usage/spend` +
      `?start_date=${start}&end_date=${end}&granularity=daily`;
    used = parseSpend(await getJson(deps, spendUrl, sessionKey));
  }

  const override = deps.monthlyLimitUsd && deps.monthlyLimitUsd > 0 ? deps.monthlyLimitUsd * 100 : undefined;
  let limit = override ?? usage.limitMinorUnits;
  if (limit === undefined) {
    const limitJson = await getJson(
      deps,
      `${BASE}/organizations/${organizationId}/overage_spend_limit`,
      sessionKey,
    );
    limit = parseSpendLimit(limitJson);
  }

  return buildClaudeSnapshot(used, limit);
}
