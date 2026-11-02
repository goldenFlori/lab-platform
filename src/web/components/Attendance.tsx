import { AlertDialog, Button } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, Download, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { ATTENDANCE_STATUSES, type AttendanceStatus } from '../../shared/attendance-status';
import type { GroupStudent } from '../../shared/students';
import { useT } from '../i18n';
import { attendanceQuery, todayHere, useAttendanceChanges } from '../lib/attendance';
import { downloadCsv, fileSlug } from '../lib/csv';
import { labsQuery } from '../lib/labs';
import { ScrollRegion } from './ScrollRegion';

// Attendance for a lab hour (#222), on the group's page: a register per hour, filled in from who
// opened its lab that day, every mark changeable, and the whole term as CSV for the records.

export function GroupAttendance({
  org,
  courseId,
  groupId,
  groupName,
  students,
}: {
  org: string;
  courseId: string;
  groupId: string;
  groupName: string;
  students: GroupStudent[];
}) {
  const t = useT();
  const query = useQuery(attendanceQuery(org, courseId, groupId));
  const labs = useQuery(labsQuery(org, courseId)).data?.labs ?? [];
  const changes = useAttendanceChanges(org, courseId, groupId);
  const [failed, setFailed] = useState(false);
  const sessions = query.data?.sessions ?? [];
  const statusOf = (sessionId: string, userId: string) =>
    query.data?.marks.find((m) => m.sessionId === sessionId && m.userId === userId)?.status;

  async function open(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setFailed(false);
    try {
      await changes.open.mutateAsync({ day: String(form.get('day')), labId: String(form.get('lab')) });
    } catch {
      setFailed(true);
    }
  }

  function download() {
    const header = [
      t.attendance.username,
      t.attendance.fullName,
      ...sessions.map((s) => `${s.day} ${s.label}`),
      t.attendance.presentTotal,
    ];
    const rows = students.map((student) => {
      const marks = sessions.map((s) => statusOf(s.id, student.id));
      return [
        student.username,
        student.fullName,
        ...marks.map((m) => (m ? t.attendance.statuses[m] : '')),
        marks.filter((m) => m === 'present').length,
      ];
    });
    downloadCsv(`prezenca-${fileSlug(groupName)}.csv`, [header, ...rows]);
  }

  const field = 'h-10 rounded-xl border border-border bg-surface px-3 text-sm';
  return (
    <section aria-labelledby="attendance" className="mt-10" data-testid="attendance">
      <h2 id="attendance" className="flex items-center gap-2 text-xl font-semibold tracking-tight">
        <ClipboardList className="size-5 text-accent" aria-hidden="true" /> {t.attendance.title}
      </h2>
      <p className="mt-1 max-w-3xl text-sm text-muted">{t.attendance.help}</p>
      <form onSubmit={(e) => void open(e)} className="mt-4 flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">{t.attendance.day}</span>
          <input type="date" name="day" required defaultValue={todayHere()} className={field} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">{t.attendance.lab}</span>
          <select name="lab" required className={field} defaultValue={labs[0]?.id}>
            {labs.map((lab) => (
              <option key={lab.id} value={lab.id}>
                {lab.n}. {lab.title}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="primary" isPending={changes.open.isPending} isDisabled={labs.length === 0}>
          {t.attendance.open}
        </Button>
        {sessions.length > 0 && (
          <Button variant="secondary" onPress={download}>
            <Download className="size-4" /> {t.attendance.download}
          </Button>
        )}
      </form>
      {failed && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {t.attendance.failed}
        </p>
      )}
      {sessions.length === 0 ? (
        <p className="mt-4 text-sm text-muted">{t.attendance.none}</p>
      ) : (
        <ScrollRegion label={t.attendance.title} className="mt-4">
          <table className="text-left text-sm" data-testid="attendance-table">
            <thead className="text-xs text-muted">
              <tr className="border-b border-separator">
                <th scope="col" className="py-2 pr-4 font-medium">
                  {t.attendance.student}
                </th>
                {sessions.map((s) => (
                  <th key={s.id} scope="col" className="py-2 pr-3 align-bottom font-medium">
                    <span className="flex items-center gap-1 whitespace-nowrap">
                      {s.day}
                      <RemoveSession label={`${s.day} ${s.label}`} onRemove={() => changes.remove.mutate(s.id)} />
                    </span>
                    <span className="block max-w-36 truncate font-normal">{s.label}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {students.map((student) => (
                <tr key={student.id} className="border-b border-separator/60 last:border-0">
                  <th scope="row" className="py-2 pr-4 font-medium whitespace-nowrap">
                    {student.fullName}
                  </th>
                  {sessions.map((s) => (
                    <td key={s.id} className="py-1.5 pr-3">
                      <select
                        value={statusOf(s.id, student.id) ?? ''}
                        aria-label={t.attendance.markOf(student.fullName, s.day)}
                        onChange={(e) =>
                          changes.mark.mutate({
                            sessionId: s.id,
                            userId: student.id,
                            status: e.target.value as AttendanceStatus,
                          })
                        }
                        className="h-8 rounded-lg border border-border bg-surface px-1.5 text-xs"
                      >
                        <option value="" disabled>
                          —
                        </option>
                        {ATTENDANCE_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {t.attendance.statuses[status]}
                          </option>
                        ))}
                      </select>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
      )}
    </section>
  );
}

function RemoveSession({ label, onRemove }: { label: string; onRemove: () => void }) {
  const t = useT();
  return (
    <AlertDialog>
      <Button isIconOnly size="sm" variant="ghost" aria-label={t.attendance.remove(label)}>
        <Trash2 className="size-3.5" />
      </Button>
      <AlertDialog.Backdrop>
        <AlertDialog.Container>
          <AlertDialog.Dialog>
            <AlertDialog.Header>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Heading>{t.attendance.remove(label)}</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>{t.attendance.removeText}</AlertDialog.Body>
            <AlertDialog.Footer>
              <Button slot="close" variant="tertiary">
                {t.common.cancel}
              </Button>
              <Button slot="close" variant="danger" onPress={onRemove}>
                {t.attendance.removeButton}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  );
}
