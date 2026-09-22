# Changelog

## 0.2.1

- Percentages are no longer rounded past their boundaries: a provider short of its limit never reads
  as 100 % (59,730 of 60,000 credits now shows 99 %, not 100 %), and a barely used one never reads as
  0 %. The colour thresholds keep using the exact figure.

## 0.2.0

- The status bar item now also reacts to a single provider: it turns amber when either the average
  reaches 80 % or any provider reaches 90 %, and red when either reaches 95 %. Previously only the
  average was considered, so one nearly exhausted allowance could stay unnoticed behind a low average.
- New settings `monthAiUsage.providerWarningThresholdPercent` (90) and
  `monthAiUsage.providerErrorThresholdPercent` (95).

## 0.1.0

- Status bar item showing `Usage: NN% / Month: NN%`: the average of the monthly AI allowance already
  consumed, next to the share of the working month that has gone by.
- GitHub Copilot usage read from the internal `copilot_internal/user` endpoint, using the GitHub
  session in VS Code. The account can be picked when several are signed in.
- Claude usage read from claude.ai with a `sessionKey` cookie kept in VS Code's secret storage.
- Configurable working days, refresh interval, spend limit override and colour thresholds: the item
  turns amber at 80 % usage and red at 95 %.
- Cached last reading, backoff on rate limits, refresh on window focus and on demand.
