import { useEffect, useRef } from 'react';
import { defaultKeymap } from '@inkbrick/react';

import { useSandboxI18n, type SandboxT } from '../i18n';

const isMac = /Mac|iPhone|iPad/.test(navigator.platform);

const KEY_NAMES: Record<string, string> = isMac
  ? { Mod: '⌘', Ctrl: '⌃', Alt: '⌥', Shift: '⇧', Enter: '↵', Escape: 'Esc' }
  : { Mod: 'Ctrl', Enter: 'Enter', Escape: 'Esc' };

const ARROWS: Record<string, string> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
};

function formatKeys(combo: string): string {
  const parts = combo.split('-').map((part) => {
    if (KEY_NAMES[part]) return KEY_NAMES[part];
    if (ARROWS[part]) return ARROWS[part];

    return part.length === 1 ? part.toUpperCase() : part;
  });

  return isMac ? parts.join('') : parts.join('+');
}

/** Сочетания привязки по её `id` из стандартного keymap: справка не расходится с тем, что реально работает. */
function bindingKeys(id: string, only?: number): string[] {
  const binding = defaultKeymap.find((item) => item.id === id);
  const keys = binding ? ([] as string[]).concat(binding.keys as string | string[]) : [];

  return (only === undefined ? keys : keys.slice(0, only)).map(formatKeys);
}

interface Row {
  readonly keys: readonly string[];
  readonly label: string;
}

const bound = (id: string, label: string, only?: number): Row => ({
  keys: bindingKeys(id, only),
  label,
});

const buildSections = (t: SandboxT): readonly { title: string; rows: readonly Row[] }[] => [
  {
    title: t('shortcuts.section.format'),
    rows: [
      bound('format.bold', t('shortcuts.bold')),
      bound('format.italic', t('shortcuts.italic')),
      bound('format.underline', t('shortcuts.underline')),
      bound('format.strike', t('shortcuts.strike')),
      bound('format.code', t('shortcuts.code')),
      bound('link', t('shortcuts.link')),
      bound('formula.inline', t('shortcuts.formula')),
    ],
  },
  {
    title: t('shortcuts.section.align'),
    rows: [
      bound('align.left', t('shortcuts.alignLeft')),
      bound('align.center', t('shortcuts.alignCenter')),
      bound('align.right', t('shortcuts.alignRight')),
      bound('align.justify', t('shortcuts.alignJustify')),
    ],
  },
  {
    title: t('shortcuts.section.edit'),
    rows: [
      bound('undo', t('shortcuts.undo')),
      bound('redo', t('shortcuts.redo')),
      bound('selectAll', t('shortcuts.selectAll')),
      { keys: bindingKeys('indent'), label: t('shortcuts.indent') },
      { keys: ['Ctrl+Shift+V'], label: t('shortcuts.pastePlain') },
      { keys: [`Ctrl+${t('shortcuts.ctrlClick')}`], label: t('shortcuts.openLink') },
      { keys: ['Enter Enter'], label: t('shortcuts.exitBlock') },
    ],
  },
  {
    title: t('shortcuts.section.menus'),
    rows: [
      { keys: ['/'], label: t('shortcuts.slashMenu') },
      { keys: ['↑', '↓'], label: t('shortcuts.pickItem') },
      { keys: ['Enter'], label: t('shortcuts.applyItem') },
      { keys: ['Esc'], label: t('shortcuts.closeMenu') },
      { keys: [formatKeys('Mod-/')], label: t('shortcuts.thisHelp') },
    ],
  },
  {
    title: t('shortcuts.section.markdown'),
    rows: [
      { keys: ['# ', '## ', '###### '], label: t('shortcuts.mdHeading') },
      { keys: ['- ', '* '], label: t('shortcuts.mdBullet') },
      { keys: ['1. '], label: t('shortcuts.mdNumbered') },
      { keys: ['[] '], label: t('shortcuts.mdTodo') },
      { keys: ['> '], label: t('shortcuts.mdQuote') },
      { keys: ['``` '], label: t('shortcuts.mdCode') },
      { keys: ['---'], label: t('shortcuts.mdDivider') },
      { keys: ['$$ '], label: t('shortcuts.mdFormulaBlock') },
      { keys: ['$x^2$'], label: t('shortcuts.mdFormulaInline') },
    ],
  },
];

export function ShortcutsHelp({ onClose }: { onClose(): void }) {
  const dialog = useRef<HTMLDivElement>(null);
  const { t } = useSandboxI18n();
  const sections = buildSections(t);

  useEffect(() => {
    dialog.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', onKeyDown);

    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className="shortcuts-backdrop"
      onPointerDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        ref={dialog}
        className="shortcuts"
        role="dialog"
        aria-modal="true"
        aria-label={t('shortcuts.title')}
        data-testid="shortcuts-help"
        tabIndex={-1}
      >
        <header>
          <h2>{t('shortcuts.title')}</h2>
          <button
            type="button"
            aria-label={t('shortcuts.close')}
            data-testid="shortcuts-close"
            onClick={onClose}
          >
            ✕
          </button>
        </header>
        <div className="shortcuts__body">
          {sections.map((section) => (
            <section key={section.title}>
              <h3>{section.title}</h3>
              <dl>
                {section.rows.map((row) => (
                  <div key={row.label}>
                    <dt>
                      {row.keys.map((keys) => (
                        <kbd key={keys}>{keys}</kbd>
                      ))}
                    </dt>
                    <dd>{row.label}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
