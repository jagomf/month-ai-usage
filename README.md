# Month AI Usage

A VS Code extension that shows, permanently in the status bar, how much of your monthly AI
credits you have used (GitHub Copilot and Claude) next to how much of the **working month**
(Monday to Friday) has already gone by. If your usage runs ahead of the calendar, the item
changes colour.

> Status: early development. See [PLAN.md](PLAN.md) for the roadmap.

![Status bar item showing "Uso: 62% / Mes: 68%"](resources/screenshot-status-bar.png)

Hover the item to see the breakdown per provider:

![Tooltip showing "Copilot: 75% - Claude: 49%"](resources/screenshot-tooltip.png)

## How it works

- **GitHub Copilot** – reads your AI credits quota through the same internal GitHub endpoint the
  Copilot extension uses, authenticated with your GitHub session in VS Code.
- **Claude** – reads your monthly spend and spend limit from claude.ai, authenticated with your
  claude.ai `sessionKey` cookie, which is stored in VS Code's secret storage.

Both sources are **unofficial internal APIs** and may change without notice. When one fails
the extension shows the other and reports the problem in the tooltip.

## Development

```bash
npm install
npm run watch      # rebuild on change
# press F5 in VS Code to launch the Extension Development Host
npm test
```

## License

MIT
