// Builds the static site into dist/: esbuild bundle + index.html + public/ (which holds data/).
// `node scripts/build.mjs --serve` serves the project root for local preview (dist/ and sample-data/).
import { build } from 'esbuild';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = join(root, 'dist');

async function bundle() {
  rmSync(dist, { recursive: true, force: true });
  mkdirSync(join(dist, 'assets'), { recursive: true });
  await build({
    entryPoints: [join(root, 'src/main.tsx')],
    outdir: join(dist, 'assets'),
    entryNames: 'main',
    bundle: true,
    format: 'esm',
    target: ['es2022', 'safari16'],
    minify: true,
    sourcemap: true,
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'info',
  });
  cpSync(join(root, 'index.html'), join(dist, 'index.html'));
  if (existsSync(join(root, 'public'))) cpSync(join(root, 'public'), dist, { recursive: true });
  // Local preview only: sample data is never part of a deploy (it is gitignored).
  if (process.argv.includes('--with-sample') && existsSync(join(root, 'sample-data'))) {
    cpSync(join(root, 'sample-data'), join(dist, 'sample-data'), { recursive: true });
  }
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.map': 'application/json' };

function serve(port = 4173) {
  createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    let path = join(dist, decodeURIComponent(url.pathname));
    try {
      if ((await stat(path)).isDirectory()) path = join(path, 'index.html');
      res.writeHead(200, { 'Content-Type': TYPES[extname(path)] ?? 'application/octet-stream' });
      res.end(await readFile(path));
    } catch {
      res.writeHead(404).end('not found');
    }
  }).listen(port, () => console.log(`http://127.0.0.1:${port}/  (add ?sample for synthetic data)`));
}

await bundle();
if (process.argv.includes('--serve')) serve();
