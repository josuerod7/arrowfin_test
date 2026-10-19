'use client';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { API_URL, fetchSnapshot, HttpError } from './api';

export type LinkStatus = 'connecting' | 'live' | 'reconnecting' | 'rejected';

const snapshotKey = (token: string) => ['snapshot', token] as const;

export function useSnapshotQuery(token: string) {
  return useQuery({
    queryKey: snapshotKey(token),
    queryFn: () => fetchSnapshot(token),
    enabled: !!token,
    // 401/404 won't fix themselves on retry.
    retry: (n, err) => !(err instanceof HttpError && err.status < 500) && n < 2,
  });
}

// The socket carries "something changed", the REST endpoint carries the numbers. Every fill and
// every (re)connect triggers a refetch, so a gap while offline is closed by the next snapshot.
export function useSnapshotSocket(token: string): LinkStatus {
  const qc = useQueryClient();
  const [status, setStatus] = useState<LinkStatus>('connecting');

  useEffect(() => {
    if (!token) return;
    const refresh = () => qc.invalidateQueries({ queryKey: snapshotKey(token) });

    // Token in the handshake `auth` payload, not the URL. The server picks the room from it.
    const socket = io(`${API_URL}/snapshot`, {
      auth: { token },
      transports: ['websocket'],
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10_000, // exponential backoff with jitter (socket.io default)
    });

    socket.on('connect', () => {
      setStatus('live');
      refresh(); // also after a reconnect: we may have missed fills
    });
    socket.on('disconnect', () => setStatus('reconnecting'));
    socket.on('connect_error', (err) => {
      // Auth failures are final; network failures keep retrying.
      if (err.message === 'unauthorized' || err.message === 'not_found') {
        setStatus('rejected');
        socket.disconnect();
      } else {
        setStatus('reconnecting');
      }
    });
    socket.on('fill', refresh);

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [token, qc]);

  return status;
}
