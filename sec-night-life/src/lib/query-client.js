import { QueryClient } from '@tanstack/react-query';


export const queryClientInstance = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			refetchOnMount: 'stale',
			refetchOnReconnect: true,
			retry: 1,
			staleTime: 2 * 60_000,
			gcTime: 10 * 60_000,
		},
	},
});