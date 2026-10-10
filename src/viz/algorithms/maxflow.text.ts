import { bilingual } from '../kit/text';

// What the maximum-flow steps say (#19). rritRrjedhë is the lecture's name for augment.

const sq = {
  greedyName: 'algoritmi greedy',
  adversaryName: 'Ford-Fulkerson me rrugë të zgjedhura keq',
  greedyStart:
    'Algoritmi greedy (slide 26): nis me **f = 0** dhe shton rrjedhë vetëm përgjatë rrugëve ku **f(e) < c(e)** — pa brinjë kthyese.',
  fromGiven: (name: string, value: number) =>
    `**${name}** nis nga rrjedha e dhënë (v(f) = ${value}) dhe kërkon rrugë rritëse në G_f.`,
  start: (name: string) =>
    `**${name}**: nis me f = 0. Sa kohë ka një rrugë s → t në rrjetën mbetëse G_f, rrit rrjedhën përgjatë saj.`,
  path: (it: number, path: string, back: boolean, caps: string, x: number) =>
    `Iterimi ${it}: rruga rritëse **${path}**${back ? ' — kalon nëpër një **brinjë kthyese**' : ''}. Ngushtica x = min(${caps}) = **${x}**.`,
  augmentBack: (x: number, value: number) =>
    `rritRrjedhë: +${x} në brinjët e drejta, **−${x} në brinjën kthyese** (zhbëjmë rrjedhë). v(f) = **${value}**.`,
  augment: (x: number, value: number) => `rritRrjedhë: +${x} në çdo brinjë të rrugës. v(f) = **${value}**.`,
  stuck: (value: number) =>
    `Greedy ngeci me **v(f) = ${value}**, por ende ka rrugë rritëse në G_f që kalon nëpër një brinjë kthyese. Pa mundësi për të "zhbërë" rrjedhë, greedy nuk e gjen maksimumin.`,
  done: (cut: string, cap: number, value: number, iterations: number) =>
    `Nuk ka më rrugë s → t në G_f. Kulmet e arritshme S = {${cut}} japin prerjen me kapacitet **${cap} = v(f) = ${value}**. Sipas teoremës, kjo është **rrjedha maksimale** (${iterations} iterime).`,
};

export type MaxflowText = typeof sq;

export const MAXFLOW_TEXT = bilingual<MaxflowText>(sq, {
  greedyName: 'the greedy algorithm',
  adversaryName: 'Ford-Fulkerson with badly chosen paths',
  greedyStart:
    'The greedy algorithm (slide 26): start with **f = 0** and add flow only along paths where **f(e) < c(e)** — no back edges.',
  fromGiven: (name, value) =>
    `**${name}** starts from the given flow (v(f) = ${value}) and looks for augmenting paths in G_f.`,
  start: (name) =>
    `**${name}**: start with f = 0. As long as there is a path s → t in the residual network G_f, push flow along it.`,
  path: (it, path, back, caps, x) =>
    `Iteration ${it}: augmenting path **${path}**${back ? ' — it uses a **back edge**' : ''}. Bottleneck x = min(${caps}) = **${x}**.`,
  augmentBack: (x, value) =>
    `augment: +${x} on the forward edges, **−${x} on the back edge** (undoing flow). v(f) = **${value}**.`,
  augment: (x, value) => `augment: +${x} on every edge of the path. v(f) = **${value}**.`,
  stuck: (value) =>
    `Greedy got stuck at **v(f) = ${value}**, yet G_f still has an augmenting path through a back edge. Unable to "undo" flow, greedy does not find the maximum.`,
  done: (cut, cap, value, iterations) =>
    `No more paths s → t in G_f. The reachable vertices S = {${cut}} give a cut of capacity **${cap} = v(f) = ${value}**. By the theorem, this is the **maximum flow** (${iterations} iterations).`,
});
