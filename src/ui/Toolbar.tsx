interface Props {
  busy: boolean;
  onNewView: () => void;
  onReloadAll: () => void;
  onResetDefault: () => void;
}

export function Toolbar({ busy, onNewView, onReloadAll, onResetDefault }: Props) {
  return (
    <div className="toolbar">
      <button type="button" className="primary" onClick={onNewView}>
        + Nova visão
      </button>
      <button type="button" disabled={busy} onClick={onReloadAll}>
        Atualizar tudo
      </button>
      <button type="button" onClick={onResetDefault}>
        Restaurar padrão
      </button>
    </div>
  );
}
