import { useQuery } from '@tanstack/react-query';
import { adminWorkflowService } from '../services/adminWorkflowService';

export const useOptimizedWorkflows = () => {
    // Master Index: Lightweight fetch, cached for 24h
    const { data: indexData, isLoading, error, refetch } = useQuery({
        queryKey: ['workflows-index-v2'],
        queryFn: () => adminWorkflowService.getWorkflowIndex(),
        staleTime: 1000 * 60 * 60, // Fresh for 1 hour
        gcTime: 1000 * 60 * 60 * 24, // Keep in cache for 24 hours (gcTime replaces cacheTime in v5)
    });

    return {
        workflows: indexData || [],
        isLoading,
        error,
        refetch
    };
};
