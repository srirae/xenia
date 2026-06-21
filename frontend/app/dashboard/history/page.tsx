'use client';

import { useEffect, useState } from 'react';
import { apiFetch, type ScanHistoryRow } from '@/lib/api';
import { CLIENT_MODELS } from '@/lib/models';
import { useBalance } from '@/components/dashboard/BalanceContext';

function modelLabel(id: string) {
  return CLIENT_MODELS.find((m) => m.id === id)?.label ?? id;
}

export default function HistoryPage() {
  const { tier } = useBalance();
  const [rows, setRows] = useState<ScanHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ scans: ScanHistoryRow[] }>('/api/user/history')
      .then((d) => setRows(d.scans))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 className="font-display" style={{ fontSize: 34, margin: 0 }}>
        Scan history
      </h1>
      <p style={{ marginTop: 8, color: 'var(--color-muted)', fontSize: 14 }}>
        Saved scans from your paid AI vulnerability checks. We log the model, token usage and cost —
        never the image itself.
      </p>

      {loading ? (
        <p style={{ marginTop: 30, color: 'var(--color-muted)' }}>Loading…</p>
      ) : rows.length === 0 ? (
        <div className="card" style={{ marginTop: 24, borderRadius: 16, padding: 30, textAlign: 'center' }}>
          <p style={{ color: 'var(--color-muted)', fontSize: 14 }}>
            {tier === 'paid'
              ? 'No scans yet. Run an AI scan from the Scanner tab to start building history.'
              : 'Scan history is a paid feature. Add credits to start saving your scans.'}
          </p>
        </div>
      ) : (
        <div style={{ marginTop: 24, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--color-muted-2)' }}>
                {['When', 'Model', 'Risk', 'Tokens (in/out)', 'Cost'].map((h) => (
                  <th key={h} style={{ padding: '10px 12px', borderBottom: '1px solid var(--color-border)', fontWeight: 500 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={td}>{new Date(r.created_at).toLocaleString()}</td>
                  <td style={td}>{modelLabel(r.model_used)}</td>
                  <td style={td}>{r.risk_level ?? '—'}</td>
                  <td style={td}>
                    {r.tokens_input.toLocaleString()} / {r.tokens_output.toLocaleString()}
                  </td>
                  <td style={td}>${Number(r.cost_deducted).toFixed(6)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const td: React.CSSProperties = {
  padding: '10px 12px',
  borderBottom: '1px solid var(--color-border)',
  color: 'var(--color-ink)',
};
