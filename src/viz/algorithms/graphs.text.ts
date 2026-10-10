import { bilingual } from '../kit/text';

// What the traversal and spanning-tree steps say (#19).

const sq = {
  bfs: {
    start: (s: string) => `Nisim BFS nga **${s}**: e shënojmë si të vizituar dhe e fusim në radhë.`,
    dequeue: (v: string, level: number) => `Nxjerrim **${v}** nga fillimi i radhës (FIFO). Niveli i tij: ${level}.`,
    seen: (w: string) => `${w} është tashmë i vizituar — e kapërcejmë.`,
    enqueue: (w: string, level: number) =>
      `${w} i pavizituar: e shënojmë, i japim nivelin ${level} dhe e shtojmë **në fund** të radhës.`,
    done: (order: string, missing: number, start: string) =>
      `Radha u zbraz. Rendi i vizitës: ${order}.${missing ? ` ${missing} kulme nuk arrihen nga ${start} — grafi nuk është i lidhur.` : ' BFS gjen rrugët me më pak brinjë: niveli = largesa.'}`,
  },
  dfs: {
    start: (s: string) => `Nisim DFS nga **${s}**: e vendosim në stivë (LIFO).`,
    stale: (v: string) => `${v} ishte vizituar ndërkohë — e hedhim.`,
    pop: (v: string) => `Nxjerrim **${v}** nga maja e stivës dhe e vizitojmë.`,
    push: (v: string, list: string, first: string) =>
      `Shtyjmë në stivë fqinjët e pavizituar të ${v}: ${list}. I pari që do të dalë: ${first}.`,
    done: (order: string, missing: number, start: string) =>
      `Stiva u zbraz. Rendi i vizitës: ${order}.${missing ? ` ${missing} kulme nuk arrihen nga ${start}.` : ' DFS shkon sa më thellë, pastaj kthehet mbrapa.'}`,
  },
  kruskal: {
    start: (list: string) => `Renditim brinjët sipas peshës: ${list}.`,
    consider: (edge: string, u: string, ru: string, v: string, rv: string) =>
      `Shqyrtojmë **${edge}**: find(${u}) = ${ru}, find(${v}) = ${rv}.`,
    accept: (n: number, total: number) => `Bashkësi të ndryshme → **pranohet**. Pema ka ${n} brinjë, pesha ${total}.`,
    reject: 'E njëjta bashkësi → **refuzohet**: do të formonte cikël.',
    done: (n: number, total: number) => `Përfundoi: ${n} brinjë (= |V| − 1), pesha totale **w(T) = ${total}**.`,
    forest: (n: number) => `Grafi nuk është i lidhur: u gjet një pyll me ${n} brinjë, jo një pemë përfshirëse.`,
  },
  prim: {
    start: (s: string) => `Nisim Prim-in nga **${s}**. Pema përmban vetëm këtë kulm.`,
    stuck: 'Asnjë brinjë nuk e zgjeron pemën — grafi nuk është i lidhur.',
    candidates: (list: string, best: string) => `Brinjët që dalin nga pema: ${list}. Më e lehta: **${best}**.`,
    add: (v: string, edge: string, total: number) => `Shtojmë kulmin **${v}** dhe brinjën ${edge}. Pesha: ${total}.`,
    done: (total: number) =>
      `Përfundoi: pesha totale **w(T) = ${total}** — e njëjtë me Kruskal-in mbi të njëjtin graf.`,
  },
};

export type GraphsText = typeof sq;

export const GRAPHS_TEXT = bilingual<GraphsText>(sq, {
  bfs: {
    start: (s) => `Start BFS from **${s}**: mark it visited and put it in the queue.`,
    dequeue: (v, level) => `Take **${v}** from the front of the queue (FIFO). Its level: ${level}.`,
    seen: (w) => `${w} is already visited — skip it.`,
    enqueue: (w, level) =>
      `${w} is unvisited: mark it, give it level ${level} and add it **to the back** of the queue.`,
    done: (order, missing, start) =>
      `The queue is empty. Visiting order: ${order}.${missing ? ` ${missing} vertices cannot be reached from ${start} — the graph is not connected.` : ' BFS finds the paths with the fewest edges: level = distance.'}`,
  },
  dfs: {
    start: (s) => `Start DFS from **${s}**: put it on the stack (LIFO).`,
    stale: (v) => `${v} was visited in the meantime — drop it.`,
    pop: (v) => `Take **${v}** from the top of the stack and visit it.`,
    push: (v, list, first) =>
      `Push the unvisited neighbours of ${v} on the stack: ${list}. The first to come out: ${first}.`,
    done: (order, missing, start) =>
      `The stack is empty. Visiting order: ${order}.${missing ? ` ${missing} vertices cannot be reached from ${start}.` : ' DFS goes as deep as it can, then backtracks.'}`,
  },
  kruskal: {
    start: (list) => `Sort the edges by weight: ${list}.`,
    consider: (edge, u, ru, v, rv) => `Consider **${edge}**: find(${u}) = ${ru}, find(${v}) = ${rv}.`,
    accept: (n, total) => `Different sets → **accepted**. The tree has ${n} edges, weight ${total}.`,
    reject: 'The same set → **rejected**: it would form a cycle.',
    done: (n, total) => `Done: ${n} edges (= |V| − 1), total weight **w(T) = ${total}**.`,
    forest: (n) => `The graph is not connected: a forest of ${n} edges was found, not a spanning tree.`,
  },
  prim: {
    start: (s) => `Start Prim from **${s}**. The tree holds only this vertex.`,
    stuck: 'No edge extends the tree — the graph is not connected.',
    candidates: (list, best) => `The edges leaving the tree: ${list}. The lightest: **${best}**.`,
    add: (v, edge, total) => `Add the vertex **${v}** and the edge ${edge}. Weight: ${total}.`,
    done: (total) => `Done: total weight **w(T) = ${total}** — the same as Kruskal on the same graph.`,
  },
});
