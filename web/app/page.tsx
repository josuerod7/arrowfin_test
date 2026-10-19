'use client';
import { useEffect, useState } from 'react';
import { SnapshotWidget } from '@/components/SnapshotWidget';

// Dev stand-in for login: paste a token from `pnpm --filter api token T-xxx`.
// In production the token would live in an httpOnly cookie, not in JS-readable storage.
const KEY = 'dev-token';

export default function Page() {
  const [token, setToken] = useState('');
  const [draft, setDraft] = useState('');

  useEffect(() => setToken(sessionStorage.getItem(KEY) ?? ''), []);

  const save = (t: string) => {
    sessionStorage.setItem(KEY, t);
    setToken(t);
  };

  return (
    <main className="px-4 pb-10">
      <form
        className="mx-auto mt-6 flex max-w-3xl gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          save(draft.trim());
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Paste dev JWT"
          className="flex-1 rounded border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300"
        />
        <button className="rounded bg-zinc-800 px-3 text-xs hover:bg-zinc-700">Use token</button>
      </form>
      {token ? (
        <SnapshotWidget key={token} token={token} />
      ) : (
        <p className="mt-10 text-center text-sm text-zinc-500">No session. Paste a dev token above.</p>
      )}
    </main>
  );
}
