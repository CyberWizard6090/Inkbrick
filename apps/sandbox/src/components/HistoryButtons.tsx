import { useHistory, useT } from '@inkbrick/react';

export function HistoryButtons() {
  const { canUndo, canRedo, undo, redo } = useHistory();
  const t = useT();

  return (
    <div className="history-buttons">
      <button type="button" data-testid="undo" disabled={!canUndo} onClick={undo}>
        ↶ {t('history.undo')}
      </button>
      <button type="button" data-testid="redo" disabled={!canRedo} onClick={redo}>
        ↷ {t('history.redo')}
      </button>
    </div>
  );
}
