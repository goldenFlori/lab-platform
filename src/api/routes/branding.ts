import { zValidator } from '@hono/zod-validator';
import { type Context, Hono } from 'hono';
import { z } from 'zod';
import { ACCENT_PATTERN, accentIssue, type Branding, isLogoType, LOGO_BYTES } from '../../shared/branding';
import { normalizeJoinCode } from '../../shared/join-code';
import type { TenantEnv } from '../auth/access';
import { createDb } from '../db';
import { brandingByJoinCode } from '../db/join';
import type { AppEnv } from '../env';
import { forbidden, invalidRequest } from './course-context';

// An institution's branding (#201). Members read it under /api/orgs/:org; its admins (org.manage)
// change the name, the accent (readable by WCAG AA, as accentIssue checks) and the logo. The sign-in
// page reached from a join code reads it by that code: the code is the invitation.

const brandingInput = z
  .object({ name: z.string().trim().min(2).max(120), accent: z.string().regex(ACCENT_PATTERN).nullable() })
  .refine((b) => !b.accent || !accentIssue(b.accent), { message: 'contrast', path: ['accent'] });

/** A logo, served so that even an SVG never runs code on this origin, kept until its version changes. */
function logoResponse(logo: { data: Uint8Array; type: string }) {
  return new Response(logo.data, {
    headers: {
      'Content-Type': logo.type,
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}

const view = (
  row: { name: string; accent: string | null; logoVersion: number | null },
  logoPath: string,
): Branding => ({
  name: row.name,
  accent: row.accent,
  logo: row.logoVersion ? `${logoPath}?v=${row.logoVersion}` : null,
});

export const orgBrandingRoutes = new Hono<TenantEnv>()
  .get('/branding', async (c) => {
    const row = await c.var.tenant.branding.get();
    if (!row) return c.json({ error: 'not_found' }, 404);
    return c.json(view(row, `/api/orgs/${c.req.param('org')}/logo`));
  })

  .put('/branding', zValidator('json', brandingInput, invalidRequest), async (c) => {
    if (!c.var.access.can('org.manage')) return forbidden(c);
    await c.var.tenant.branding.set(c.req.valid('json'));
    const row = await c.var.tenant.branding.get();
    return c.json(view(row as NonNullable<typeof row>, `/api/orgs/${c.req.param('org')}/logo`));
  })

  .get('/logo', async (c) => {
    const logo = await c.var.tenant.branding.logo();
    return logo ? logoResponse(logo) : c.json({ error: 'not_found' }, 404);
  })

  .put('/logo', async (c) => {
    if (!c.var.access.can('org.manage')) return forbidden(c);
    const type = (c.req.header('Content-Type') ?? '').split(';')[0]?.trim() ?? '';
    if (!isLogoType(type)) return c.json({ error: 'invalid_request' }, 400);
    const data = new Uint8Array(await c.req.arrayBuffer());
    if (data.length === 0 || data.length > LOGO_BYTES) return c.json({ error: 'invalid_request' }, 413);
    await c.var.tenant.branding.setLogo({ data, type });
    return c.body(null, 204);
  })

  .delete('/logo', async (c) => {
    if (!c.var.access.can('org.manage')) return forbidden(c);
    await c.var.tenant.branding.setLogo(null);
    return c.body(null, 204);
  });

/** The institution behind a join code, or a 404 as for any code that joins nothing. */
async function byCode(c: Context<AppEnv>) {
  const code = normalizeJoinCode(c.req.param('code') ?? '');
  return code ? brandingByJoinCode(createDb(c.env.DB), code) : undefined;
}

export const joinBrandingRoutes = new Hono<AppEnv>()
  .get('/:code/branding', async (c) => {
    const row = await byCode(c);
    if (!row) return c.json({ error: 'not_found' }, 404);
    return c.json(view(row, `/api/join/${encodeURIComponent(c.req.param('code'))}/logo`));
  })
  .get('/:code/logo', async (c) => {
    const row = await byCode(c);
    return row?.logo && row.logoType
      ? logoResponse({ data: row.logo, type: row.logoType })
      : c.json({ error: 'not_found' }, 404);
  });
