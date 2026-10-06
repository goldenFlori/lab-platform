import { env } from 'cloudflare:workers';
import { createDb } from '../../src/api/db';
import { createOrganization } from '../../src/api/db/platform';
import { forTenant } from '../../src/api/db/tenant';

/** An organization with one of everything: a pedagog, a template, a course, a group, a lab and its access. */
export async function seedOrganization(slug: string) {
  const db = createDb(env.DB);
  const org = await createOrganization(db, { name: `Org ${slug}`, slug });
  const tenant = forTenant(db, org.id);

  const user = await tenant.users.create({ username: `pedagog.${slug}`, fullName: `Pedagog ${slug}` }, 'pedagog');
  const template = await tenant.courseTemplates.create({ title: 'SDA', ownerUserId: user.id });
  const course = await tenant.courses.create({
    title: 'SDA 2026/27',
    academicYear: '2026/27',
    templateId: template.id,
  });
  const group = await tenant.groups.create({ courseId: course.id, name: 'Grupi A' });
  const lab = await tenant.labs.create({ courseId: course.id, n: 1, title: 'Grafet', position: 1 });
  const labAccess = await tenant.labAccess.create({ labId: lab.id, groupId: group.id });
  const membership = await tenant.memberships.create({ userId: user.id, courseId: course.id, role: 'pedagog' });

  return { db, org, tenant, user, template, course, group, lab, labAccess, membership };
}

export type Seeded = Awaited<ReturnType<typeof seedOrganization>>;
