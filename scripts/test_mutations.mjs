// Deliberately break isolated copies, never the working tree. Exit 0 only if
// the baseline passes and both known safety/lifecycle mutants are detected.
import { mkdtemp, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('..', import.meta.url));
const temp = await mkdtemp(path.join(tmpdir(), 'chatsprig-mutations-'));
const mutants = [
  ['privacy gate', 'value.frame.inert = !value.ready;', 'value.frame.inert = false;', 'Claude and Grok stay covered'],
  ['draft retention', 'if (reload || !frames.has(frameKey()))', 'if (true)', 'Claude and Grok overlays load']
];
try {
  for (const dir of ['content', 'shared', 'tests']) await cp(path.join(root, dir), path.join(temp, dir), { recursive: true });
  for (const file of ['background.js', 'manifest.json', 'rules.json']) await cp(path.join(root, file), path.join(temp, file));
  const sourcePath = path.join(temp, 'content/overlay.js');
  const source = await readFile(sourcePath, 'utf8');
  for (const [name, from, to, pattern] of mutants) {
    if (!source.includes(from)) throw new Error(`Mutation target missing: ${name}`);
    const run = () => spawnSync(process.execPath, ['--test', `--test-name-pattern=${pattern}`, 'tests/claude-grok.test.mjs'], { cwd: temp, encoding: 'utf8' });
    await writeFile(sourcePath, source);
    const baseline = run();
    if (baseline.status !== 0) throw new Error(`Baseline failed: ${baseline.stdout}\n${baseline.stderr}`);
    await writeFile(sourcePath, source.replace(from, to));
    const result = run();
    if (result.status !== 1 || !result.stdout.includes('AssertionError')) throw new Error(`Mutant was not caught by an assertion: ${name}\n${result.stdout}\n${result.stderr}`);
    console.log(`PASS: ${name} mutant rejected (baseline exit 0, mutant exit ${result.status})`);
    console.log(result.stdout);
  }
} finally { await rm(temp, { recursive: true, force: true }); }
