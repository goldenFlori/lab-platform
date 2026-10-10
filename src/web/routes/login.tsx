import { Alert, Button, FieldError, Form, Input, Label, TextField } from '@heroui/react';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { Eye, EyeOff } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { t as messages, useT } from '../i18n';
import { ApiError } from '../lib/api';
import { meQuery, useLogin } from '../lib/auth';
import { APP_NAME } from '../lib/brand';

type LoginSearch = { redirect?: string };

/** Only paths on this site, so a crafted link cannot send someone elsewhere after login. */
function safeRedirect(value: unknown) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : undefined;
}

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({ redirect: safeRedirect(search.redirect) }),
  beforeLoad: async ({ context, search }) => {
    if (await context.queryClient.ensureQueryData(meQuery)) throw redirect({ href: search.redirect ?? '/courses' });
  },
  head: () => ({ meta: [{ title: `${messages().login.pageTitle} · ${APP_NAME}` }] }),
  component: LoginPage,
});

function errorMessage(error: Error) {
  const t = messages();
  if (!(error instanceof ApiError)) return t.common.somethingWrong;
  switch (error.code) {
    case 'invalid_credentials':
      return t.login.wrong;
    case 'too_many_attempts':
      return t.login.tooMany(Math.max(1, Math.ceil((error.retryAfterSeconds ?? 900) / 60)));
    case 'network':
      return t.common.network;
    default:
      return t.common.somethingWrong;
  }
}

function LoginPage() {
  const { redirect: target } = Route.useSearch();
  const navigate = useNavigate();
  const login = useLogin();
  const [showPassword, setShowPassword] = useState(false);
  const t = useT();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    login.mutate(
      { username: String(data.get('username') ?? ''), password: String(data.get('password') ?? '') },
      { onSuccess: () => navigate({ href: target ?? '/courses' }) },
    );
  }

  return (
    <section className="container-page grid min-h-[calc(100dvh-var(--nav-h))] place-items-center py-12">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-bold tracking-tight">{t.login.title}</h1>
        <p className="mt-2 text-muted">{t.login.lead}</p>

        <Form className="mt-8 grid gap-5" onSubmit={onSubmit}>
          <TextField name="username" isRequired fullWidth>
            <Label>{t.login.username}</Label>
            <Input autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoFocus />
            <FieldError>{t.login.usernameMissing}</FieldError>
          </TextField>

          <TextField name="password" type={showPassword ? 'text' : 'password'} isRequired fullWidth>
            <Label>{t.login.password}</Label>
            <div className="relative">
              <Input autoComplete="current-password" className="w-full pr-11" />
              <Button
                isIconOnly
                size="sm"
                variant="ghost"
                className="absolute top-1/2 right-1 -translate-y-1/2"
                aria-label={showPassword ? t.login.hidePassword : t.login.showPassword}
                onPress={() => setShowPassword((shown) => !shown)}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </Button>
            </div>
            <FieldError>{t.login.passwordMissing}</FieldError>
          </TextField>

          {login.error && (
            <Alert status="danger" role="alert">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Description>{errorMessage(login.error)}</Alert.Description>
              </Alert.Content>
            </Alert>
          )}

          <Button type="submit" variant="primary" fullWidth isPending={login.isPending}>
            {login.isPending ? t.login.submitting : t.login.submit}
          </Button>
        </Form>

        <p className="mt-6 text-sm text-muted">{t.login.forgot}</p>
      </div>
    </section>
  );
}
