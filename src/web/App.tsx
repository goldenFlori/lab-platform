import { useEffect, useState } from 'react';

export function App() {
  const [api, setApi] = useState('…');

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json() as Promise<{ status: string }>)
      .then((d) => setApi(d.status))
      .catch(() => setApi('offline'));
  }, []);

  return (
    <main>
      <h1>Lab Platform</h1>
      <p>API: {api}</p>
    </main>
  );
}
