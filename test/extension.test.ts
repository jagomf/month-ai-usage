import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension', () => {
  test('activates and registers its commands', async () => {
    const extension = vscode.extensions.getExtension('lunadevel.month-ai-usage');
    assert.ok(extension, 'extension not found');
    await extension.activate();

    const commands = await vscode.commands.getCommands(true);
    for (const id of [
      'monthAiUsage.refresh',
      'monthAiUsage.showDetails',
      'monthAiUsage.setClaudeSessionKey',
      'monthAiUsage.clearClaudeSessionKey',
    ]) {
      assert.ok(commands.includes(id), `missing command ${id}`);
    }
  });
});
