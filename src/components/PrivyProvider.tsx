'use client';

import { PrivyProvider as PrivyProviderBase } from '@privy-io/react-auth';
import { ReactNode } from 'react';

const PRIVY_APP_ID = 'cm2rxwlpy000slc0mlkrg0t6g';

export function PrivyProvider({ children }: { children: ReactNode }) {
  return (
    <PrivyProviderBase
      appId={PRIVY_APP_ID}
      config={{
        appearance: {
          theme: 'dark',
          accentColor: '#f97316',
        },
        loginMethods: ['wallet', 'email', 'google'],
      }}
    >
      {children}
    </PrivyProviderBase>
  );
}
