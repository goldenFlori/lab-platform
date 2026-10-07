import { createFileRoute, redirect } from '@tanstack/react-router';
import { meQuery } from '../lib/auth';

// Pages under _authed/ need a signed-in user. Everyone else is sent to the login page, and comes
// back to the page they asked for afterwards. (The API checks every request on its own too.)
export const Route = createFileRoute('/_authed')({
  beforeLoad: async ({ context, location }) => {
    const me = await context.queryClient.ensureQueryData(meQuery);
    if (!me) throw redirect({ to: '/login', search: { redirect: location.href } });
    return { me };
  },
});
