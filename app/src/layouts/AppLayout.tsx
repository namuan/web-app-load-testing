import type { PropsWithChildren } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

export function AppLayout({ children }: PropsWithChildren) {
  return (
    <div className="flex h-full bg-background text-foreground">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 scrollbar-thin" data-testid="main-content">
          {children}
        </main>
        <footer className="border-t px-4 py-3 text-xs text-muted-foreground md:px-6">
          <div className="flex flex-col items-center justify-between gap-2 sm:flex-row">
            <span>© 2026 Acme Console · Offline-first demo</span>
            <span className="font-mono">API /api · App /</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
