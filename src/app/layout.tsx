import './globals.css';
import { PrivyProvider } from '@/components/PrivyProvider';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PrivyProvider>{children}</PrivyProvider>
      </body>
    </html>
  );
}
