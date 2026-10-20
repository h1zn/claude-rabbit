// Runs tools/check_jj2.mjs over every JJ2 level in a headless browser
// (serve.py on port 8770 first) and lists each level's traps: places the
// player can reach but never leave. usage: node tools/check_jj2_run.mjs [filter]
import { createRequire } from 'node:module';
const require = createRequire('/opt/node-tools/node_modules/');
const pw = require('playwright');

const args = process.argv.slice(2);
const physics = args.includes('--play');
const filter = args.find((a) => !a.startsWith('--')) || '';
// --shard=k/n: every n-th level from the k-th (to run several at once).
const shard = (args.find((a) => a.startsWith('--shard=')) || '--shard=0/1').slice(8).split('/').map(Number);
const browser = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://127.0.0.1:8770/'); await page.waitForFunction(() => window.kip);
const keys = await page.evaluate(async (f) => {
  const cat = await import('/src/jj2/catalog.js'); await cat.scanPlayable();
  return cat.playableJJ2().filter((d) => d.key.includes(f)).map((d) => d.key);
}, filter);
const mine = keys.filter((_, i) => i % shard[1] === shard[0]);
let total = 0;
for (const key of mine) {
  const r = physics ? await page.evaluate(async (key) => {
    const { jj2Def } = await import('/src/jj2/catalog.js');
    const { explore } = await import('/tools/check_jj2_play.mjs');
    const def = jj2Def(key);
    await window.kip.play(key);
    const g = window.kip.game;
    const t0 = performance.now();
    const res = explore(g);
    window.kip.go('title');
    return { title: def.title, mp: def.mp, ms: Math.round(performance.now() - t0), hasExit: !def.mp, ...res, home: undefined };
  }, key) : await page.evaluate(async (key) => {
    const { jj2Def } = await import('/src/jj2/catalog.js');
    const { analyze } = await import('/tools/check_jj2.mjs');
    const def = jj2Def(key); await def.prepare();
    const level = def({ party: def.mp });
    const t0 = performance.now();
    const res = analyze(level, { party: def.mp });
    return { title: def.title, mp: def.mp, ms: Math.round(performance.now() - t0), ...res, edgesOf: undefined, nodeAt: undefined, debug: undefined };
  }, key);
  const big = (r.traps || []).filter((t) => t.size >= 1);
  total += big.length;
  const exit = r.hasExit ? (r.exitReached ? '' : '  EXIT NOT REACHED') : '';
  console.log(`${key.padEnd(18)} ${String(r.title).slice(0, 26).padEnd(26)} nodes ${String(r.nodes).padStart(5)} traps ${big.length}${exit}${r.error ? ' ' + r.error : ''}  (${r.ms} ms)`);
  for (const t of big.slice(0, 6)) console.log(`     ${t.size} cells x${t.x0}-${t.x1} y${t.y0}-${t.y1} from ${t.from}`);
}
console.log(total, 'traps;', errors.length ? errors.slice(0, 3) : 'no errors');
await browser.close();
