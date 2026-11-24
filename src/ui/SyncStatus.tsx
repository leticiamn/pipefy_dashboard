import type { SyncProgress } from '../data/sync';
import { formatNumber } from './labels';

export function SyncStatus({ progress, error }: { progress: SyncProgress; error: string | null }) {
  const loading = progress.phase === 'full';
  const pct =
    loading && progress.expected ? Math.min(100, Math.round((progress.loaded / progress.expected) * 100)) : null;

  return (
    <>
      {loading && (
        <div className="progress" role="status">
          <div className="progress-text">
            Carregando cards: {formatNumber(progress.loaded)}
            {progress.expected ? ` de ${formatNumber(progress.expected)}` : ''} · os gráficos se completam durante a
            carga
          </div>
          <div className="progress-bar">
            <div style={{ width: pct !== null ? `${pct}%` : '100%' }} className={pct === null ? 'indeterminate' : ''} />
          </div>
        </div>
      )}
      {error && <div className="alert">Falha ao sincronizar: {error}. O painel mostra o último dado salvo.</div>}
    </>
  );
}
