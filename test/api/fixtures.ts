import { env } from 'cloudflare:workers';
import { createDb } from '../../src/api/db';
import { createOrganization } from '../../src/api/db/platform';
import { forTenant } from '../../src/api/db/tenant';

/**
 * An organization with one of everything: a pedagog, a template, a course, a group, a lab with its
 * access rule, a ready notebook with one embed, and the course's share link.
 */
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

  const notebook = await tenant.notebooks.create({
    labId: lab.id,
    kind: 'main',
    title: 'Grafet',
    position: 1,
    originalName: 'laborator-04.ipynb',
    sha256: '0'.repeat(64),
    readyAt: new Date(),
  });
  await tenant.notebooks.setEmbeds(notebook.id, [{ cell: 2, viz: 'grafet', title: 'Grafi', props: null }]);

  const courseShare = await tenant.shares.set(course.id, false);

  return { db, org, tenant, user, template, course, group, lab, labAccess, membership, notebook, courseShare };
}

export type Seeded = Awaited<ReturnType<typeof seedOrganization>>;
