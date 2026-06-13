import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastRoot } from '@/components/ui/toaster';
import { AppRouter } from '@/routes';
import { ThemeApplier } from '@/layouts/ThemeApplier';
import { useThemeStore, useNotificationStore } from '@/stores';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export default function App() {
  const theme = useThemeStore((s) => s.theme);
  const pushNotification = useNotificationStore((s) => s.push);

  useEffect(() => {
    document.documentElement.classList.add('ready');
  }, []);

  useEffect(() => {
    pushNotification({
      type: 'info',
      title: 'Welcome back',
      body: 'All systems nominal. Data is loaded from the local mock API.',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeApplier />
      <ToastRoot>
        <div data-theme={theme} className="h-full">
          <AppRouter />
        </div>
      </ToastRoot>
    </QueryClientProvider>
  );
}
