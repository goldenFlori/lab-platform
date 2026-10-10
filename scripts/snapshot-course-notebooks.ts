// Records what the course site's converter makes of each fixture notebook, as the expected output
// for the TypeScript converter's tests (#13). Run it with the course repository at hand:
//
//   node scripts/snapshot-course-notebooks.ts ~/Desktop/discrete-structures-algorithms-course
//
// It imports site/scripts/notebook.mjs from there (with that repository's own dependencies) and
// writes test/notebook/fixtures/expected/<notebook>.json. Rerun only on purpose: the snapshots
// define what "the same cells as the current site" means. It also copies the site's embeds for
// these notebooks (site/content/course.mjs) to test/notebook/fixtures/embeds.json.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { normalize } from '../test/notebook/normalize.ts';

const courseRepo = process.argv[2];
if (!courseRepo) {
  console.error('Usage: node scripts/snapshot-course-notebooks.ts <path to the course repository>');
  process.exit(1);
}

const converter = pathToFileURL(resolve(courseRepo, 'site/scripts/notebook.mjs')).href;
const { renderNotebook } = (await import(converter)) as {
  renderNotebook: (raw: string, options: { assets: Map<string, Uint8Array> }) => Promise<Record<string, unknown>>;
};

const fixtures = 'test/notebook/fixtures';
for (const file of readdirSync(join(fixtures, 'notebooks'))
  .filter((f) => f.endsWith('.ipynb'))
  .sort()) {
  const assets = new Map<string, Uint8Array>();
  const result = await renderNotebook(readFileSync(join(fixtures, 'notebooks', file), 'utf8'), { assets });
  const expected = await normalize({ ...result, assets });
  writeFileSync(
    join(fixtures, 'expected', file.replace(/\.ipynb$/, '.json')),
    `${JSON.stringify(expected, null, 2)}\n`,
  );
  console.log(`✔ ${file}`);
}

// Where the site places its visualizations in these notebooks: notebook → [{ cell, viz, title, props }].
const course = pathToFileURL(resolve(courseRepo, 'site/content/course.mjs')).href;
const { embeds } = (await import(course)) as { embeds: Record<string, unknown[]> };
const notebooks = new Set(readdirSync(join(fixtures, 'notebooks')));
const fixtureEmbeds = Object.fromEntries(
  Object.entries(embeds)
    .filter(([file]) => notebooks.has(file))
    .sort(([a], [b]) => a.localeCompare(b)),
);
writeFileSync(join(fixtures, 'embeds.json'), `${JSON.stringify(fixtureEmbeds, null, 2)}\n`);
console.log(`✔ embeds.json (${Object.keys(fixtureEmbeds).length} notebooks)`);
