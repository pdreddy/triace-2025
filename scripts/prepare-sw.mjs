import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const assets = (await readdir(new URL('../dist/assets/', import.meta.url))).filter(name => /\.(js|css)$/.test(name)).sort().map(name => `/assets/${name}`);
const swPath = new URL('../dist/sw.js', import.meta.url);
const source = await readFile(swPath, 'utf8');
const buildId = createHash('sha256').update(assets.join('\n')).digest('hex').slice(0, 12);
if (!source.includes("const ASSET_PRECACHE = [];") || !source.includes('__BUILD_ID__')) throw new Error('Service worker placeholders are missing.');
await writeFile(swPath, source.replace('__BUILD_ID__', buildId).replace('const ASSET_PRECACHE = [];', `const ASSET_PRECACHE = ${JSON.stringify(assets)};`));
