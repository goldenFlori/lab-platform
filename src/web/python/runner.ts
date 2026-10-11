// The Python side of running a notebook's cells (#47), loaded once into each Pyodide worker.
// Every cell runs in one namespace per notebook, as in Jupyter. The value of a cell's last
// expression is shown like Jupyter's Out. A traceback keeps only the student's own lines.
// The `<cell N>` file names make the traceback say which cell failed.

export const RUNNER_PY = `
import traceback
from pyodide.code import eval_code_async

_lab_namespace = {"__name__": "__main__"}


async def _lab_run(code, filename):
    try:
        value = await eval_code_async(code, _lab_namespace, filename=filename)
    except KeyboardInterrupt:
        return ("interrupted", None)
    except BaseException as error:
        frames = error.__traceback__
        while frames is not None and not frames.tb_frame.f_code.co_filename.startswith("<cell"):
            frames = frames.tb_next
        return ("error", "".join(traceback.format_exception(type(error), error, frames)))
    return ("ok", None if value is None else repr(value))
`;

export type RunOutcome =
  | { kind: 'ok'; value: string | null }
  | { kind: 'error'; traceback: string }
  | { kind: 'interrupted' };

/** The cell's file name in tracebacks, numbered from 1 as students count cells. */
export const cellFile = (index: number) => `<cell ${index + 1}>`;
