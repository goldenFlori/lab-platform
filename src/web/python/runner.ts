// The Python side of running a notebook's cells (#47, #48), loaded once into each Pyodide worker.
//
// - Every cell runs in one namespace per notebook, as in Jupyter. The value of a cell's last
//   expression is shown like Jupyter's Out.
// - An exercise's run (#51) also checks it: the cell's own `kontrollo(title, tests)` call, or a
//   visible test run after the cell. A check passes, fails with its assert's message, finds the
//   exercise not written yet (NotImplementedError), or reports the error that stopped it.
// - A traceback keeps only the student's own lines; the `<cell N>` file names say which cell failed,
//   and each cell's source is kept for tracebacks and `inspect`.
// - Figures go to the page through the `_lab_display` module the worker provides: matplotlib draws
//   off-screen and each `plt.show()` (or figure left open at the end) becomes a PNG; plotly's
//   `fig.show()` sends the figure's JSON. A figure as a cell's last value shows as a figure.

import type { CheckStatus } from '../../shared/exercises';

export const RUNNER_PY = `
import io
import linecache
import os
import sys
import textwrap
import traceback
import warnings

# Pyodide sets its own canvas backend; figures here are drawn off-screen instead.
os.environ["MPLBACKEND"] = "AGG"

import _lab_display
from pyodide.code import eval_code_async

_lab_namespace = {"__name__": "__main__"}


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

/** Packages a cell needs that Pyodide does not ship; installed with micropip from PyPI. */
export const MICROPIP_PACKAGES: Record<string, RegExp> = { plotly: /^\s*(?:import|from)\s+plotly\b/m };
