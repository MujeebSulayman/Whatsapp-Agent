import { forwardAndSetSession } from '@/lib/auth-route';

export const POST = (req: Request) => forwardAndSetSession('auth/social/complete', req);
