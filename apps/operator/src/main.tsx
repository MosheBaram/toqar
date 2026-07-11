import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../../skills/toqar-design/styles.css';
import { App } from './App.tsx';
import { createOperatorApi } from './api.js';

function Bootstrap() {
  const [apiUrl, setApiUrl] = useState(localStorage.getItem('toqar_operator_api_url') ?? 'http://localhost:3000');
  const [token, setToken] = useState(localStorage.getItem('toqar_operator_token') ?? '');
  const [connected, setConnected] = useState(Boolean(localStorage.getItem('toqar_operator_token')));

  if (!connected) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-sans)', display: 'grid', placeItems: 'center' }}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            localStorage.setItem('toqar_operator_api_url', apiUrl);
            localStorage.setItem('toqar_operator_token', token);
            setConnected(true);
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '360px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '20px' }}
        >
          <h1 style={{ margin: 0, fontSize: 'var(--fs-h3)', fontWeight: 600 }}>Toqar Operator</h1>
          <input value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} placeholder="registry service URL" style={{ padding: '8px 10px', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-small)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--surface)', color: 'var(--text)' }} />
          <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="operator token" type="password" style={{ padding: '8px 10px', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-small)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--surface)', color: 'var(--text)' }} />
          <button type="submit" style={{ padding: '8px 16px', fontWeight: 600, fontSize: 'var(--fs-small)', background: 'var(--primary)', color: 'var(--primary-fg)', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>
            Connect
          </button>
        </form>
      </div>
    );
  }

  return <App api={createOperatorApi(apiUrl, token)} label={new URL(apiUrl).host} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Bootstrap />
  </StrictMode>,
);
