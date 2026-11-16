import { describe, useSandboxI18n } from '../i18n';
/** `value` — сообщение или ошибка: переводятся при показе, поэтому смена языка меняет и видимое уведомление. */
export interface Notice {
  value: unknown;
  error?: boolean;
}

export function NoticeBar({ notice, onClose }: { notice: Notice | null; onClose(): void }) {
  const { t } = useSandboxI18n();

  if (!notice) return null;

  return (
    <div
      className={notice.error ? 'sandbox-notice sandbox-notice--error' : 'sandbox-notice'}
      role={notice.error ? 'alert' : 'status'}
      data-testid="notice"
    >
      <span>{describe(t, notice.value)}</span>
      <button type="button" aria-label={t('notice.close')} onClick={onClose}>
        ×
      </button>
    </div>
  );
}
