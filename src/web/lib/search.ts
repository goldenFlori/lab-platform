import { queryOptions } from '@tanstack/react-query';
import type { SearchIndex } from '../../shared/search';
import { api } from './api';

// Search (#17) runs here, over the indexes of the user's courses. The server sends only what the
// user may see, so matching needs no permission checks: it is instant as you type, and costs the
// database one read per course while the index is fresh.

export const searchIndexQuery = (org: string, courseId: string) =>
  queryOptions({
    queryKey: ['orgs', org, 'courses', courseId, 'search'],
    queryFn: () => api<SearchIndex>(`/orgs/${encodeURIComponent(org)}/courses/${encodeURIComponent(courseId)}/search`),
    staleTime: 5 * 60_000,
  });
