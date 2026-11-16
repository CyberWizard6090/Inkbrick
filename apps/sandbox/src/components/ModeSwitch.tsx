import { useSandboxI18n } from '../i18n';

/** Переключатель «Правка / Чтение»: общий у редактора документа и редактора таблицы. */
export function ModeSwitch({
  readOnly,
  onChange,
}: {
  readOnly: boolean;
  onChange(readOnly: boolean): void;
}) {
  const { t } = useSandboxI18n();

  return (
    <span
      className="sandbox-nav__group"
      role="group"
      aria-label={t('nav.mode')}
      data-testid="mode-switch"
    >
      <button
        type="button"
        className={readOnly ? '' : 'is-active'}
        data-testid="mode-edit"
        aria-pressed={!readOnly}
        onClick={() => onChange(false)}
      >
        {t('nav.edit')}
      </button>
      <button
        type="button"
        className={readOnly ? 'is-active' : ''}
        data-testid="mode-read"
        aria-pressed={readOnly}
        onClick={() => onChange(true)}
      >
        {t('nav.read')}
      </button>
    </span>
  );
}
