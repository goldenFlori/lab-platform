import { Alert, Button, FieldError, Form, Input, Label, TextField } from '@heroui/react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import type { FormEvent } from 'react';
import { ApiError } from '../../lib/api';
import { APP_NAME } from '../../lib/brand';
import { useJoin } from '../../lib/courses';

type JoinSearch = { code?: string };

// The QR code on the projector opens /join?code=…; signed-out students log in first and come back.
export const Route = createFileRoute('/_authed/join')({
  validateSearch: (search: Record<string, unknown>): JoinSearch => ({
    code: typeof search.code === 'string' ? search.code.slice(0, 32) : undefined,
  }),
  head: () => ({ meta: [{ title: `Bashkohu me kod · ${APP_NAME}` }] }),
  component: JoinPage,
});

function errorMessage(error: Error) {
  if (error instanceof ApiError && error.code === 'not_found') {
    return 'Ky kod nuk funksionon. Kontrolloni shkronjat, ose kërkojini pedagogut një kod të ri.';
  }
  if (error instanceof ApiError && error.code === 'too_many_attempts') {
    const minutes = Math.max(1, Math.ceil((error.retryAfterSeconds ?? 900) / 60));
    return `Shumë kode të gabuara. Provoni përsëri pas ${minutes} ${minutes === 1 ? 'minute' : 'minutash'}.`;
  }
  if (error instanceof ApiError && error.code === 'network') {
    return 'Nuk u lidhëm dot me serverin. Kontrolloni internetin dhe provoni përsëri.';
  }
  return 'Diçka shkoi keq. Provoni përsëri.';
}

function JoinPage() {
  const { code } = Route.useSearch();
  const join = useJoin();
  const navigate = useNavigate();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    join.mutate(String(new FormData(event.currentTarget).get('code') ?? ''), {
      onSuccess: (result) =>
        navigate({
          to: '/o/$org/courses/$courseId',
          params: { org: result.organization.slug, courseId: result.course.id },
        }),
    });
  }

  return (
    <section className="container-page grid min-h-[calc(100dvh-var(--nav-h))] place-items-center py-12">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-bold tracking-tight">Bashkohu me grupin</h1>
        <p className="mt-2 text-muted">Shkruani kodin që shfaq pedagogu në ekran, ose skanoni kodin QR.</p>

        <Form className="mt-8 grid gap-5" onSubmit={onSubmit}>
          <TextField name="code" isRequired fullWidth defaultValue={code}>
            <Label>Kodi i grupit</Label>
            <Input
              placeholder="p.sh. K7QM-4XPA"
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              className="font-mono text-lg tracking-widest uppercase placeholder:font-sans placeholder:text-base placeholder:tracking-normal placeholder:normal-case"
              autoFocus={!code}
            />
            <FieldError>Shkruani kodin e grupit.</FieldError>
          </TextField>

          {join.error && (
            <Alert status="danger" role="alert">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Description>{errorMessage(join.error)}</Alert.Description>
              </Alert.Content>
            </Alert>
          )}

          <Button type="submit" variant="primary" fullWidth isPending={join.isPending}>
            {join.isPending ? 'Duke u bashkuar…' : 'Bashkohu'}
          </Button>
        </Form>
      </div>
    </section>
  );
}
