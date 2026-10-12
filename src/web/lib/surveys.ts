import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type { SurveyAnswerInput, SurveyView } from '../../shared/surveys';
import { api } from './api';

// The end-of-semester survey (#102).

const surveyPath = (org: string, courseId: string) =>
  `/orgs/${encodeURIComponent(org)}/courses/${encodeURIComponent(courseId)}/survey`;

export const surveyQuery = (org: string, courseId: string) =>
  queryOptions({
    queryKey: ['orgs', org, 'courses', courseId, 'survey'],
    queryFn: () => api<SurveyView>(surveyPath(org, courseId)),
  });

export function useSurveyChanges(org: string, courseId: string) {
  const queryClient = useQueryClient();
  const onSuccess = () => queryClient.invalidateQueries({ queryKey: surveyQuery(org, courseId).queryKey });
  return {
    open: useMutation({
      mutationFn: (closesAt: string) => api<void>(surveyPath(org, courseId), { method: 'PUT', body: { closesAt } }),
      onSuccess,
    }),
    answer: useMutation({
      mutationFn: (answer: SurveyAnswerInput) =>
        api<void>(`${surveyPath(org, courseId)}/answers`, { method: 'POST', body: answer }),
    }),
  };
}
