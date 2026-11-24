-- Registro de mudanças vindas dos webhooks do Pipefy. Só ids e horários, nunca conteúdo de card.
CREATE TABLE IF NOT EXISTS changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pipe_id TEXT NOT NULL,
  card_id TEXT NOT NULL,
  action TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_changes_pipe_at ON changes (pipe_id, at);
