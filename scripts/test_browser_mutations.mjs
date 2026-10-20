// Run the real Chromium lifecycle regression against isolated broken copies.
import { mkdtemp, cp, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('..', import.meta.url));
const temp = await mkdtemp(path.join(tmpdir(), 'chatsprig-browser-mutants-'));
try {
  for (const dir of ['content', 'shared', 'tests', 'scripts']) await cp(path.join(root, dir), path.join(temp, dir), { recursive: true });
  await symlink(path.join(root, 'node_modules'), path.join(temp, 'node_modules'), 'dir');
  const run = (suite = 'provider-lifecycle') => spawnSync(process.execPath, ['scripts/test_browser.mjs', suite], { cwd: temp, encoding: 'utf8' });
  const baseline = run();
  if (baseline.status !== 0) throw new Error(`Browser baseline failed:\n${baseline.stdout}\n${baseline.stderr}`);
  console.log('PASS pristine Chromium lifecycle baseline');
  for (const [name, file, from, to, expected, suite] of [
    ['privacy', 'frame-privacy-gate.js', 'if (window.top === window.self || !names.has(window.name)) return;', 'window.cgptSetFramePrivacyReady = () => {}; return;', 'private gate accepted keyboard input'],
    ['IME', 'frame-privacy-gate.js', 'if (!root.inert) root.inert = true;', '/* deliberate missing document lock */', 'closed gate accepted noncancelable IME input', 'provider-helper-gate'],
    ['draft', 'overlay.js', 'if (reload || !frames.has(frameKey()))', 'if (true)', 'switching lost draft']
  ]) {
    const target = path.join(temp, 'content', file), source = await readFile(target, 'utf8');
    if (!source.includes(from)) throw new Error(`Missing mutant target: ${name}`);
    await writeFile(target, source.replace(from, to));
    const result = run(suite);
    await writeFile(target, source);
    if (result.status !== 1 || !result.stderr.includes(expected)) throw new Error(`Wrong mutant outcome: ${name}\n${result.stdout}\n${result.stderr}`);
    console.log(`PASS ${name} mutant rejected: ${expected}`);
  }
} finally { await rm(temp, { recursive: true, force: true }); }
