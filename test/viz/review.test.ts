import { describe, expect, it } from 'vitest';
import { REVIEW_TOPICS, topicsOfEmbed } from '../../src/shared/review';
import { PREDICT_TEXT } from '../../src/viz/algorithms/predict.text';
import { rng } from '../../src/viz/algorithms/sorting';
import { makeItem, SESSION_LENGTH, sessionTopics, weightOf } from '../../src/viz/review';

// The review session (#152): every topic makes a question on a fresh input, with a right answer
// among its options, and the session brings weak topics back more often without repeating one.

const T = PREDICT_TEXT.sq;

describe('review questions', () => {
  it.each(REVIEW_TOPICS)('%s makes a fair question on any input', (topic) => {
    for (let seed = 1; seed <= 150; seed++) {
      const item = makeItem(topic, T, rng(seed));
      const ids = item.question.options.map((o) => o.id);
      expect(item.topic).toBe(topic);
      expect(item.question.topic).toBe(topic);
      expect(ids.length, `seed ${seed}`).toBeGreaterThanOrEqual(2);
      expect(item.question.answers.length).toBeGreaterThan(0);
      for (const a of item.question.answers) expect(ids, `seed ${seed}`).toContain(a);
      // Not every option is right: there is something to decide.
      expect(item.question.answers.length).toBeLessThan(ids.length);
    }
  });

  it('merge: the smaller head is written next', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const item = makeItem('merge', T, rng(seed));
      if (item.view.kind !== 'merge') throw new Error('a merge view');
      const [a, b] = [item.view.left[0] ?? 0, item.view.right[0] ?? 0];
      expect(item.question.answers).toEqual([a <= b ? 'left' : 'right']);
      expect(item.view.written).toEqual([...item.view.written].sort((x, y) => x - y));
    }
  });
});

describe('the session', () => {
  it('brings the topics with wrong first tries back more often', () => {
    const results = [
      { topic: 'bfs' as const, asked: 10, right: 2 },
      { topic: 'dfs' as const, asked: 10, right: 10 },
    ];
    expect(weightOf('bfs', results)).toBeGreaterThan(weightOf('dfs', results));
    let bfs = 0;
    let dfs = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const topics = sessionTopics(['bfs', 'dfs', 'prim'], results, rng(seed));
      bfs += topics.filter((t) => t === 'bfs').length;
      dfs += topics.filter((t) => t === 'dfs').length;
    }
    expect(bfs).toBeGreaterThan(dfs);
  });

  it('interleaves topics, at most three of each', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const topics = sessionTopics(['bfs', 'dfs', 'prim', 'merge'], [], rng(seed));
      expect(topics).toHaveLength(SESSION_LENGTH);
      for (let i = 1; i < topics.length; i++) expect(topics[i]).not.toBe(topics[i - 1]);
      for (const t of new Set(topics)) expect(topics.filter((x) => x === t).length).toBeLessThanOrEqual(3);
    }
    // One topic alone: as many as it may give.
    expect(sessionTopics(['prim'], [], rng(1))).toEqual(['prim', 'prim', 'prim']);
  });

  it("knows what each lab's visualizations practise", () => {
    expect(topicsOfEmbed('renditja', { algo: 'selection' })).toEqual(['selection']);
    expect(topicsOfEmbed('grafet', { mode: 'traverse' })).toEqual(['bfs', 'dfs']);
    expect(topicsOfEmbed('grafet', { mode: 'build' })).toEqual([]);
    expect(topicsOfEmbed('tabela-gjurmimit', { preset: 'lab06-kahn' })).toEqual(['topo']);
    expect(topicsOfEmbed('rruget', { view: 'both' })).toEqual(['dijkstra', 'bellman']);
    expect(topicsOfEmbed('kompleksiteti', null)).toEqual([]);
  });
});
