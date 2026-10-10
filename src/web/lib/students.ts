import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { hashPassword } from '../../shared/password';
import { generateStudentPassword, IMPORT_CHUNK, parseNameList, usernameBase } from '../../shared/student-names';
import type { GroupStudent } from '../../shared/students';
import { api } from './api';

/** What goes on a printed slip. The password exists only here, in this browser, until printed. */
export type Slip = { fullName: string; username: string; password: string };

const groupPath = (org: string, courseId: string, groupId: string) =>
  `/orgs/${encodeURIComponent(org)}/courses/${encodeURIComponent(courseId)}/groups/${encodeURIComponent(groupId)}`;

export const groupStudentsQuery = (org: string, courseId: string, groupId: string) =>
  queryOptions({
    queryKey: ['orgs', org, 'courses', courseId, 'groups', groupId, 'students'],
    queryFn: () => api<GroupStudent[]>(`${groupPath(org, courseId, groupId)}/students`),
  });

/** Names from an uploaded class list: CSV or text, or the first sheet of an Excel file. */
export async function namesFromFile(file: File): Promise<string[]> {
  if (/\.xlsx$/i.test(file.name)) {
    // Loaded only when someone picks an Excel file.
    const { readSheet } = await import('read-excel-file/browser');
    const rows = await readSheet(file);
    return parseNameList(
      rows.map((row) => row.map((cell) => (cell === null ? '' : String(cell))).join('\t')).join('\n'),
    );
  }
  return parseNameList(await file.text());
}

/**
 * Creates the accounts in chunks: for each name a password is generated and hashed here, and only
 * the hash is sent. Stops at the first failed chunk and reports how far it got.
 */
export async function importStudents(
  org: string,
  courseId: string,
  groupId: string,
  names: string[],
  onProgress: (done: number) => void,
): Promise<{ slips: Slip[]; error?: unknown }> {
  const slips: Slip[] = [];
  for (let start = 0; start < names.length; start += IMPORT_CHUNK) {
    const chunk = await Promise.all(
      names.slice(start, start + IMPORT_CHUNK).map(async (fullName) => {
        const password = generateStudentPassword();
        return { fullName, username: usernameBase(fullName), password, passwordHash: await hashPassword(password) };
      }),
    );
    try {
      const { students } = await api<{ students: GroupStudent[] }>(`${groupPath(org, courseId, groupId)}/students`, {
        method: 'POST',
        body: { students: chunk.map(({ fullName, username, passwordHash }) => ({ fullName, username, passwordHash })) },
      });
      students.forEach((student, i) => {
        slips.push({ fullName: student.fullName, username: student.username, password: chunk[i]?.password ?? '' });
      });
      onProgress(slips.length);
    } catch (error) {
      return { slips, error };
    }
  }
  return { slips };
}

/** A new password for one student: generated and hashed here; the slip is the only copy. */
export function useResetPassword(org: string, courseId: string, groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (student: GroupStudent): Promise<Slip> => {
      const password = generateStudentPassword();
      await api<void>(`${groupPath(org, courseId, groupId)}/students/${encodeURIComponent(student.id)}/password`, {
        method: 'POST',
        body: { passwordHash: await hashPassword(password) },
      });
      return { fullName: student.fullName, username: student.username, password };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['orgs', org, 'courses', courseId, 'groups', groupId] }),
  });
}
