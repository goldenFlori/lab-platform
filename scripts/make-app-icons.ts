// Draws the app's install icons (#89) from public/favicon.svg with Playwright's Chromium:
// `node scripts/make-app-icons.ts`. Rerun it when the logo changes, and commit the PNGs.
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const logo = readFileSync('public/favicon.svg', 'utf8');
// The logo's own rounded square, and a full-bleed one whose mark sits inside the safe zone, which
// Android crops to a circle or squircle ("maskable").
const fullBleed = logo
  .replace('rx="11"', 'rx="0"')
  .replace(/<path|<circle/, (tag) => `<g transform="translate(20 20) scale(.72) translate(-20 -20)">${tag}`)
  .replace('</svg>', '</g></svg>');

const icons = [
  { file: 'icon-192.png', size: 192, svg: logo },
  { file: 'icon-512.png', size: 512, svg: logo },
  { file: 'maskable-512.png', size: 512, svg: fullBleed },
  { file: 'apple-touch-icon.png', size: 180, svg: fullBleed },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const { file, size, svg } of icons) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
  );
  await page.screenshot({ path: `public/icons/${file}`, omitBackground: true });
}
await browser.close();
