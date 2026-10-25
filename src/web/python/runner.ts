// The Python side of running a notebook's cells (#47, #48), loaded once into each Pyodide worker.
//
// - Every cell runs in one namespace per notebook, as in Jupyter. The value of a cell's last
//   expression is shown like Jupyter's Out.
// - An exercise's run (#51) also checks it: the cell's own `kontrollo(title, tests)` call, or a
//   visible test run after the cell. A check passes, fails with its assert's message, finds the
//   exercise not written yet (NotImplementedError), or reports the error that stopped it.
// - A traceback keeps only the student's own lines; the `<cell N>` file names say which cell failed,
//   and each cell's source is kept for tracebacks and `inspect`.
// - "Your code, visualized" (#69, #70): the `vizlab` module records what a student's sort does to a
//   list they track, or what their traversal does on a graph; when the cell ends, the steps go to
//   the page, which plays them with the course's visualizers.
// - Figures go to the page through the `_lab_display` module the worker provides: matplotlib draws
//   off-screen and each `plt.show()` (or figure left open at the end) becomes a PNG; plotly's
//   `fig.show()` sends the figure's JSON. A figure as a cell's last value shows as a figure.

import type { CheckStatus } from '../../shared/exercises';

export const RUNNER_PY = `
import io
import json
import linecache
import os
import sys
import textwrap
import traceback
import warnings

# Pyodide sets its own canvas backend; figures here are drawn off-screen instead.
os.environ["MPLBACKEND"] = "AGG"

import types

import _lab_display
from pyodide.code import eval_code_async

_lab_namespace = {"__name__": "__main__"}

# vizlab (#69): what a student's code does to a list it tracks, for the page to play.
_vizlab_events = []
_vizlab_list = [None]
_VIZLAB_LIMIT = 5000


def _vizlab_number(value):
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) else 0


def _vizlab_record(op, **details):
    if _vizlab_list[0] is None or len(_vizlab_events) >= _VIZLAB_LIMIT:
        return
    _vizlab_events.append({"op": op, "arr": [_vizlab_number(v) for v in _vizlab_list[0]], **details})


class _VizlabList(list):
    """A list whose writes are recorded."""

    def __setitem__(self, index, value):
        super().__setitem__(index, value)
        if self is _vizlab_list[0] and isinstance(index, int):
            _vizlab_record("write", i=index % len(self))


def _vizlab_index(i):
    lst = _vizlab_list[0]
    if lst is None:
        raise RuntimeError("vizlab: thirrni fillimisht vizlab.track(lista)")
    i = int(i)
    if not -len(lst) <= i < len(lst):
        raise IndexError(f"vizlab: indeksi {i} është jashtë listës")
    return i % len(lst)


def _vizlab_track(values):
    """Starts recording: returns a copy of the list whose writes are shown."""
    _vizlab_events.clear()
    _vizlab_graph_on[0] = False
    _vizlab_list[0] = _VizlabList(values)
    _vizlab_record("start")
    return _vizlab_list[0]


def _vizlab_compare(i, j):
    """Shows a comparison of A[i] and A[j]; always True, so it fits inside a condition."""
    _vizlab_record("compare", i=_vizlab_index(i), j=_vizlab_index(j))
    return True


def _vizlab_swap(i, j):
    """Swaps A[i] and A[j], and shows it."""
    i, j = _vizlab_index(i), _vizlab_index(j)
    lst = _vizlab_list[0]
    a, b = lst[i], lst[j]
    list.__setitem__(lst, i, b)
    list.__setitem__(lst, j, a)
    _vizlab_record("swap", i=i, j=j)


def _vizlab_done(*indices):
    """Shows these positions as final."""
    _vizlab_record("done", indices=[_vizlab_index(i) for i in indices])


_vizlab_graph_on = [False]


def _vizlab_graph_record(op, **details):
    if not _vizlab_graph_on[0] or len(_vizlab_events) >= _VIZLAB_LIMIT:
        return
    _vizlab_events.append({"op": op, **details})


def _vizlab_graph(graph, directed=False):
    """Starts recording on a graph: a dict of neighbours (or of {neighbour: weight}), or a list of edges."""
    nodes, edges, seen = [], [], set()

    def node(x):
        x = str(x)
        if x not in nodes:
            nodes.append(x)
        return x

    def edge(u, v, w=None):
        u, v = node(u), node(v)
        key = (u, v) if directed else tuple(sorted((u, v)))
        if key in seen:
            return
        seen.add(key)
        edges.append([u, v, _vizlab_number(w) if w is not None else None])

    if isinstance(graph, dict):
        for u, around in graph.items():
            node(u)
            pairs = around.items() if isinstance(around, dict) else ((v, None) for v in around)
            for v, w in pairs:
                edge(u, v, w)
    else:
        for item in graph:
            edge(*item[:3])
    if len(nodes) > 60 or len(edges) > 300:
        raise ValueError("vizlab: grafi është shumë i madh për t'u shfaqur (deri në 60 kulme dhe 300 brinjë)")
    _vizlab_events.clear()
    _vizlab_list[0] = None
    _vizlab_graph_on[0] = True
    _vizlab_graph_record("graph", nodes=nodes, edges=edges, directed=bool(directed))
    return graph


def _vizlab_visit(node):
    """Shows that the code visits this vertex."""
    _vizlab_graph_record("visit", node=str(node))


def _vizlab_relax(u, v, dist):
    """Shows the edge u→v relaxed, with v's new distance."""
    _vizlab_graph_record("relax", u=str(u), v=str(v), dist=_vizlab_number(dist))


def _vizlab_mark(edge, state="tree"):
    """Shows an edge (u, v) as part of the tree ("tree") or looked at ("seen")."""
    u, v = edge[0], edge[1]
    _vizlab_graph_record("mark", u=str(u), v=str(v), state="seen" if state == "seen" else "tree")


vizlab = types.ModuleType(
    "vizlab",
    "Shfaqni si punon kodi juaj: renditja (track, compare, swap, done) dhe grafet (graph, visit, relax, mark).",
)
vizlab.graph = _vizlab_graph
vizlab.visit = _vizlab_visit
vizlab.relax = _vizlab_relax
vizlab.mark = _vizlab_mark
vizlab.track = _vizlab_track
vizlab.compare = _vizlab_compare
vizlab.swap = _vizlab_swap
vizlab.done = _vizlab_done
sys.modules["vizlab"] = vizlab


def _vizlab_flush():
    if _vizlab_events:
        truncated = len(_vizlab_events) >= _VIZLAB_LIMIT
        kind = "graph" if _vizlab_graph_on[0] else "sorting"
        _lab_display.vizlab(json.dumps({"kind": kind, "events": _vizlab_events, "truncated": truncated}))
    _vizlab_events.clear()
    _vizlab_list[0] = None
    _vizlab_graph_on[0] = False


def _lab_show_figures(*args, **kwargs):
    plt = sys.modules.get("matplotlib.pyplot")
    if plt is None:
        return
    for number in plt.get_fignums():
        _lab_show_matplotlib(plt.figure(number))
    plt.close("all")


def _lab_show_matplotlib(figure):
    buffer = io.BytesIO()
    # Saving is ours, not the student's code: matplotlib's own deprecation notices stay out.
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", DeprecationWarning)
        figure.savefig(buffer, format="png", dpi=110, bbox_inches="tight")
    _lab_display.image(buffer.getvalue())


def _lab_show_plotly(figure, *args, **kwargs):
    _lab_display.plotly(figure.to_json())


def _lab_prepare(code):
    # networkx draws with matplotlib.
    if "matplotlib" in code or "networkx" in code:
        import matplotlib

        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        plt.show = _lab_show_figures
    if "plotly" in code:
        import plotly.io
        from plotly.basedatatypes import BaseFigure

        BaseFigure.show = _lab_show_plotly
        plotly.io.show = _lab_show_plotly


def _lab_display_value(value):
    if hasattr(value, "to_plotly_json") and hasattr(value, "to_json"):
        _lab_show_plotly(value)
        return None
    if hasattr(value, "savefig") and hasattr(value, "canvas"):
        _lab_show_matplotlib(value)
        sys.modules["matplotlib.pyplot"].close(value)
        return None
    return repr(value)


def _lab_try(tests):
    try:
        tests()
    except NotImplementedError:
        return ("todo", "")
    except AssertionError as error:
        return ("fail", str(error))
    except Exception as error:
        return ("error", f"{type(error).__name__}: {error}")
    return ("pass", "")


_lab_missing = object()


async def _lab_run(code, filename, exercise=False, test=None):
    checks = []
    previous = _lab_namespace.get("kontrollo", _lab_missing)
    if exercise:
        # Ours while the exercise runs, whatever the notebook's helper cell defined.
        _lab_namespace["kontrollo"] = lambda title, tests: checks.append(_lab_try(tests))
    # The cell's source, as Jupyter keeps it: tracebacks show its lines, and inspect.getsource()
    # finds the functions it defines (some checks look for an assert written in one).
    linecache.cache[filename] = (len(code), None, code.splitlines(True), filename)
    try:
        _lab_prepare(code)
        value = await eval_code_async(code, _lab_namespace, filename=filename)
        shown = None if value is None else _lab_display_value(value)
        if exercise and isinstance(test, str):
            body = textwrap.indent(test.strip() or "pass", "    ")
            exec(compile(f"def _lab_test():\\n{body}\\n", "<cell test>", "exec"), _lab_namespace)
            checks.append(_lab_try(_lab_namespace.pop("_lab_test")))
    except KeyboardInterrupt:
        return ("interrupted", None, None)
    except BaseException as error:
        frames = error.__traceback__
        while frames is not None and not frames.tb_frame.f_code.co_filename.startswith("<cell"):
            frames = frames.tb_next
        return ("error", "".join(traceback.format_exception(type(error), error, frames)), None)
    finally:
        if exercise:
            if previous is _lab_missing:
                _lab_namespace.pop("kontrollo", None)
            else:
                _lab_namespace["kontrollo"] = previous
        try:
            _lab_show_figures()
        except Exception:
            pass
        _vizlab_flush()
    # Several checks in one cell: the first that did not pass speaks for all.
    check = next((c for c in checks if c[0] != "pass"), checks[0] if checks else None)
    return ("ok", shown, check)
`;

export type CheckResult = { status: CheckStatus; message: string };

export type RunOutcome =
  | { kind: 'ok'; value: string | null; check?: CheckResult }
  | { kind: 'error'; traceback: string }
  | { kind: 'interrupted' };

/** How a run checks an exercise: with the cell's own kontrollo(…) call, or a visible test after it. */
export type RunCheck = { test: string | null };

/** The cell's file name in tracebacks, numbered from 1 as students count cells. */
export const cellFile = (index: number) => `<cell ${index + 1}>`;

/**
 * The line of cell `number` where a traceback stopped (#131), from its last frame in that cell;
 * null when the error happened elsewhere, for example in a function defined in another cell.
 */
export function errorLine(traceback: string, number: number): number | null {
  let line: number | null = null;
  for (const match of traceback.matchAll(/File "<cell (\d+)>", line (\d+)/g)) {
    if (Number(match[1]) === number) line = Number(match[2]);
  }
  return line;
}

/** Packages a cell needs that Pyodide does not ship; installed with micropip from PyPI. */
export const MICROPIP_PACKAGES: Record<string, RegExp> = { plotly: /^\s*(?:import|from)\s+plotly\b/m };
