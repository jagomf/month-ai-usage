import * as esbuild from 'esbuild';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/** Prints build boundaries and one-line diagnostics so the VS Code task can track the watcher. */
const watchLogger = {
  name: 'watch-logger',
  setup(build) {
    build.onStart(() => console.log('[watch] build started'));
    build.onEnd((result) => {
      const report = (severity) => ({ text, location }) => {
        const where = location ? `${location.file}:${location.line}:${location.column}` : 'esbuild.mjs:1:1';
        console.error(`${where}: ${severity}: ${text}`);
      };
      result.errors.forEach(report('error'));
      result.warnings.forEach(report('warning'));
      console.log('[watch] build finished');
    });
  },
};

const ctx = await esbuild.context({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  format: 'cjs',
  minify: production,
  sourcemap: !production,
  sourcesContent: false,
  platform: 'node',
  outfile: 'dist/extension.js',
  external: ['vscode'],
  logLevel: watch ? 'silent' : 'info',
  plugins: watch ? [watchLogger] : [],
});

if (watch) {
  await ctx.watch();
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
