import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      staleTime: 30_000,
    },
    mutations: {
      retry: 1,
      retryDelay: 1000,
    },
  },
});

export function refetchAllQueries(): void {
  queryClient.invalidateQueries();
}
