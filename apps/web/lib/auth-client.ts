'use client';

import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  baseURL:
    typeof window === 'undefined'
      ? process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
      : '',
});

export const { useSession, signIn, signOut, signUp } = authClient;