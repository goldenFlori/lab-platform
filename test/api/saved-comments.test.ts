import { describe, expect, it } from 'vitest';
import type { SavedComment } from '../../src/shared/grading';
import { seedOrganization } from './fixtures';
import { account } from './http';

// #221: a comment saved once, given again at the same cell. The notebook's, for staff who grade.

async function setup() {
  const seed = await seedOrganization('fshn');
  const pedagog = await account(seed, 'pedagog', { courseId: seed.course.id });
  const assistant = await account(seed, 'assistant', { groupId: seed.group.id });
  const path = `/orgs/fshn/courses/${seed.course.id}/labs/${seed.lab.id}/notebooks/${seed.notebook.id}/saved-comments`;
  return { seed, pedagog, assistant, path };
}

describe('saved comments', () => {
  it('are saved, listed by cell and removed by staff who grade', async () => {
    const { pedagog, path } = await setup();
    const res = await pedagog.call(path, { method: 'POST', body: { cell: 4, text: 'Kujdes me rastin bosh.' } });
    expect(res.status).toBe(201);
    const saved = (await res.json()) as SavedComment;
    const list = async () => ((await (await pedagog.call(path)).json()) as { comments: SavedComment[] }).comments;
    // The seed's own, at cell 2, comes first.
    expect((await list()).map((c) => [c.cell, c.text])).toEqual([
      [2, 'Mirë.'],
      [4, 'Kujdes me rastin bosh.'],
    ]);
    expect((await pedagog.call(`${path}/${saved.id}`, { method: 'DELETE' })).status).toBe(204);
    expect((await list()).map((c) => c.cell)).toEqual([2]);
    expect((await pedagog.call(`${path}/${saved.id}`, { method: 'DELETE' })).status).toBe(404);
    expect((await pedagog.call(path, { method: 'POST', body: { cell: 4, text: ' ' } })).status).toBe(400);
  });

  it('are not for staff who do not grade', async () => {
    const { assistant, path, seed } = await setup();
    expect((await assistant.call(path)).status).toBe(403);
    expect((await assistant.call(path, { method: 'POST', body: { cell: 4, text: 'x' } })).status).toBe(403);
    expect((await assistant.call(`${path}/${seed.savedComment.id}`, { method: 'DELETE' })).status).toBe(403);
  });
});
