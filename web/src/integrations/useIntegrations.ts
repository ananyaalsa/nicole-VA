// web/src/integrations/useIntegrations.ts
import { useCallback, useEffect, useState } from 'react';
import { fetchIntegrations, type IntegrationStatus } from './integrationsApi';

export interface UseIntegrations {
  statuses: IntegrationStatus[];
  loading: boolean;
  error: boolean;
  refresh(): void;
}

export function useIntegrations(token: string | null): UseIntegrations {
  const [statuses, setStatuses] = useState<IntegrationStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const refresh = useCallback(() => {
    if (!token) return;
    setLoading(true);
    setError(false);
    fetchIntegrations(token)
      .then((s) => { setStatuses(s); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, [token]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const on = () => refresh();
    window.addEventListener('nicole:integrations-updated', on);
    return () => window.removeEventListener('nicole:integrations-updated', on);
  }, [refresh]);

  return { statuses, loading, error, refresh };
}
