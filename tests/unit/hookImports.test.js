import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// A React hook used without being imported builds fine and then crashes the page to a blank screen when it first renders.
const HOOKS = ['useEffect', 'useMemo', 'useState', 'useRef', 'useId', 'useCallback', 'useContext', 'useReducer', 'useLayoutEffect'];
const files = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? files(path.join(dir, e.name)) : /\.jsx?$/.test(e.name) ? [path.join(dir, e.name)] : []));

test('every React hook a source file calls is imported from react there', () => {
  const root = new URL('../../src', import.meta.url).pathname, missing = [];
  for (const file of files(root)) {
    const text = fs.readFileSync(file, 'utf8');
    const imported = [...text.matchAll(/import\s*\{([^}]*)\}\s*from\s*'react'/g)].flatMap(m => m[1].split(',').map(x => x.trim().split(/\s+as\s+/).pop()));
    for (const hook of HOOKS) if (new RegExp(`(?<![\\w.])${hook}\\(`).test(text) && !imported.includes(hook)) missing.push(`${path.relative(root, file)}: ${hook}`);
  }
  assert.deepEqual(missing, []);
});
