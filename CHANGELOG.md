# Changelog

## 0.1.0

- Status bar item showing `Usage: NN% / Month: NN%`: the average of the monthly AI allowance already
  consumed, next to the share of the working month that has gone by.
- GitHub Copilot usage read from the internal `copilot_internal/user` endpoint, using the GitHub
  session in VS Code. The account can be picked when several are signed in.
- Claude usage read from claude.ai with a `sessionKey` cookie kept in VS Code's secret storage.
- Configurable working days, refresh interval, spend limit override and colour thresholds: the item
  turns amber at 80 % usage and red at 95 %.
- Cached last reading, backoff on rate limits, refresh on window focus and on demand.
