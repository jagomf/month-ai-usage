# Next steps

Planned work that is not part of a release yet.

## Replace the Personal Access Token with OIDC trusted publishing

### Why

[.github/workflows/release.yml](.github/workflows/release.yml) authenticates against the Marketplace with a
Personal Access Token stored in the `VSCE_PAT` repository secret. That is a long-lived credential: anyone
who reads it can publish under this publisher until it expires, and deleting the secret does not revoke it.

There is also a deadline. Microsoft [retires global Personal Access Tokens in Azure DevOps on
1 December 2026](https://devblogs.microsoft.com/devops/retirement-of-global-personal-access-tokens-in-azure-devops/),
so this workflow stops working on that date unless it is migrated.

### The mechanism

`vsce publish --oidc` ("trusted publishing") removes the stored secret entirely. It asks GitHub Actions for a
short-lived OIDC token with the `marketplace.visualstudio.com` audience, exchanges it at
`POST /_apis/gallery/token` for a Marketplace credential valid for minutes, and publishes with that. The trust
is bound to a specific repository and workflow instead of to a person.

Verified facts, as of September 2026:

- Implemented in [`src/oidc.ts`](https://github.com/microsoft/vscode-vsce/blob/main/src/oidc.ts), added by
  [PR #1291](https://github.com/microsoft/vscode-vsce/pull/1291) and shipped in `@vscode/vsce` **4.0.0**. The file
  does not exist in the `v3.9.3` tag, so 4.x is the minimum version. This repository already depends on `^4.0.0`.
- Documented only in the [vsce README](https://github.com/microsoft/vscode-vsce#trusted-publishing). The official
  [publishing guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) does not
  mention it, and [PR #1297](https://github.com/microsoft/vscode-vsce/pull/1297) deliberately hides the flag from
  `vsce publish --help`.
- GitHub Actions is the only supported provider. There is no fallback to a PAT: if the exchange fails, the publish
  step fails.

### Blocker

The client side is ready; the server side is not reachable yet. Publishing this way requires a **trusted publishing
policy** registered for the repository and workflow on the Marketplace publisher management page, and that section
does not exist there yet. Without a matching policy the token exchange answers
`No matching trusted publishing policy`.

The hidden CLI flag and the missing documentation both suggest a staged rollout, so this is a matter of waiting.

### What to do once the policy UI appears

1. Register the policy for this repository and the `release.yml` workflow on the publisher management page.
2. In [.github/workflows/release.yml](.github/workflows/release.yml), add `id-token: write` to the job
   `permissions` and replace the publish step with:

   ```yaml
   - name: Publish to the VS Code Marketplace
     run: npx vsce publish --oidc --packagePath month-ai-usage-${{ github.ref_name }}.vsix
   ```

   The `env: VSCE_PAT` block goes away.
3. Tag a release and confirm the publish step succeeds.
4. Delete the `VSCE_PAT` repository secret **and** revoke the token in Azure DevOps. Deleting the secret alone
   leaves a live credential behind.

The `.vsix` is attached to the GitHub release before the publish step runs, so a failed publish never blocks a
release: the package can always be uploaded by hand from the publisher management page.
