import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { ErrorBoundary } from './ErrorBoundary';
import { routes } from './routes';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5_000,
        refetchOnWindowFocus: true,
        // Panel działa w sieci lokalnej – zapytania nie mogą czekać na „internet”.
        networkMode: 'always',
      },
      mutations: { networkMode: 'always' },
    },
  });
}

type Router = ReturnType<typeof createBrowserRouter>;

export function App({ router }: { router?: Router }) {
  const [queryClient] = useState(createQueryClient);
  const [appRouter] = useState(() => router ?? createBrowserRouter(routes));

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={appRouter} />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
