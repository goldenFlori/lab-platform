import type { SessionUser } from './db/auth';

/** Bindings and per-request values every route sees. */
export type AppEnv = {
  Bindings: Env;
  Variables: {
    /** The signed-in user, or null. Set by the session middleware. */
    user: SessionUser | null;
    sessionId: string | null;
  };
};
