import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes fresh
      cacheTime: 24 * 60 * 60 * 1000, // 24 hours kept in memory
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});
