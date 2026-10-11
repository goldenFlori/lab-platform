// The Python side of running a notebook's cells (#47, #48), loaded once into each Pyodide worker.
//
// - Every cell runs in one namespace per notebook, as in Jupyter. The value of a cell's last
//   expression is shown like Jupyter's Out.
// - A traceback keeps only the student's own lines; the `<cell N>` file names say which cell failed.
// - Figures go to the page through the `_lab_display` module the worker provides: matplotlib draws
//   off-screen and each `plt.show()` (or figure left open at the end) becomes a PNG; plotly's
//   `fig.show()` sends the figure's JSON. A figure as a cell's last value shows as a figure.

export const RUNNER_PY = `
import io
import os
import sys
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


async def _lab_run(code, filename):
    try:
        _lab_prepare(code)
        value = await eval_code_async(code, _lab_namespace, filename=filename)
        shown = None if value is None else _lab_display_value(value)
    except KeyboardInterrupt:
        return ("interrupted", None)
    except BaseException as error:
        frames = error.__traceback__
        while frames is not None and not frames.tb_frame.f_code.co_filename.startswith("<cell"):
            frames = frames.tb_next
        return ("error", "".join(traceback.format_exception(type(error), error, frames)))
    finally:
        try:
            _lab_show_figures()
        except Exception:
            pass
    return ("ok", shown)
`;

export type RunOutcome =
  | { kind: 'ok'; value: string | null }
  | { kind: 'error'; traceback: string }
  | { kind: 'interrupted' };

/** The cell's file name in tracebacks, numbered from 1 as students count cells. */
export const cellFile = (index: number) => `<cell ${index + 1}>`;

/** Packages a cell needs that Pyodide does not ship; installed with micropip from PyPI. */
export const MICROPIP_PACKAGES: Record<string, RegExp> = { plotly: /^\s*(?:import|from)\s+plotly\b/m };
