import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';

import { ALIGNMENTS, COLOR_NAMES, isColorName, type Alignment } from '@inkbrick/document';

import { useT } from '../hooks/useT';
import { Icon, type IconName } from '../icons/Icon';
import type { InlineFormat, ToolbarPanel, ToolbarProps } from './types';

const BUTTONS: readonly { format: InlineFormat; icon: IconName }[] = [
  { format: 'bold', icon: 'bold' },
  { format: 'italic', icon: 'italic' },
  { format: 'underline', icon: 'underline' },
  { format: 'strike', icon: 'strike' },
  { format: 'code', icon: 'code' },
];

const ALIGN_ICONS: Record<Alignment, IconName> = {
  left: 'align-left',
  center: 'align-center',
  right: 'align-right',
  justify: 'align-justify',
};

const PANELS: readonly { panel: ToolbarPanel; icon: IconName }[] = [
  { panel: 'color', icon: 'baseline' },
  { panel: 'highlight', icon: 'highlighter' },
];

export function DefaultToolbar({
  formats,
  position,
  placement = 'floating',
  linkOpen,
  panel,
  onToggle,
  onOpenLink,
  onApplyLink,
  onCancelLink,
  onTogglePanel,
  onApplyColor,
  onAlign,
  onInsertFormula,
  turnInto,
  scope = 'text',
  onClearFormat,
}: ToolbarProps) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const ref = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [below, setBelow] = useState(false);
  const [width, setWidth] = useState(0);
  const [turnOpen, setTurnOpen] = useState(false);

  useEffect(() => {
    if (!linkOpen) return;

    setValue(formats.link ?? '');
    setInvalid(false);
    input.current?.focus();
    input.current?.select();
  }, [linkOpen]);

  /*
   * У верхнего края окна показываем под выделением. На сенсорных экранах — всегда под ним: сверху системное
   * меню выделения («Копировать», «Вставить») закрыло бы toolbar.
   */
  useLayoutEffect(() => {
    const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;

    setBelow(coarse || position.y - (ref.current?.offsetHeight ?? 40) - 12 < 0);
    setWidth(ref.current?.offsetWidth ?? 0);
  }, [position.x, position.y, linkOpen, panel]);

  const inline = placement === 'inline';
  const left = Math.max(8, Math.min(position.x - width / 2, window.innerWidth - width - 8));

  const submit = (event: FormEvent) => {
    event.preventDefault();

    if (!onApplyLink(value)) setInvalid(true);
  };

  const colorKind = panel === 'highlight' ? 'backgroundColor' : 'color';
  const currentColor = panel === 'highlight' ? formats.backgroundColor : formats.color;

  return (
    <div
      ref={ref}
      className="inkbrick-toolbar"
      role="toolbar"
      aria-label={t('toolbar.label')}
      data-inkbrick-ui="toolbar"
      data-placement={inline ? 'inline' : below ? 'below' : 'above'}
      data-testid="toolbar"
      style={
        inline
          ? undefined
          : {
              left,
              top: position.y,
              transform: below ? 'translateY(28px)' : 'translateY(calc(-100% - 8px))',
            }
      }
      onMouseDown={(event) => {
        if (event.target !== input.current) event.preventDefault();
      }}
    >
      {linkOpen ? (
        <form className="inkbrick-toolbar__link" data-inkbrick-part="link-form" onSubmit={submit}>
          <input
            ref={input}
            data-inkbrick-part="input"
            data-invalid={invalid || undefined}
            type="text"
            aria-label={t('toolbar.link.url')}
            aria-invalid={invalid}
            placeholder={t('toolbar.link.placeholder')}
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setInvalid(false);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                onCancelLink();
              }
            }}
          />
          <button
            type="submit"
            className="inkbrick-toolbar__button"
            data-inkbrick-part="button"
            aria-label={t('toolbar.link.apply')}
            title={t('toolbar.link.apply')}
          >
            <Icon name="check" />
          </button>
          {formats.link && (
            <button
              type="button"
              className="inkbrick-toolbar__button"
              data-inkbrick-part="button"
              aria-label={t('toolbar.link.remove')}
              title={t('toolbar.link.remove')}
              onClick={() => onApplyLink(null)}
            >
              <Icon name="unlink" />
            </button>
          )}
        </form>
      ) : (
        <>
          {turnInto && (
            <>
              <button
                type="button"
                className="inkbrick-toolbar__button inkbrick-toolbar__turn"
                data-inkbrick-part="button"
                data-format="turn-into"
                aria-haspopup="menu"
                aria-expanded={turnOpen}
                aria-label={t('toolbar.turnInto.label', { type: turnInto.title })}
                title={t('toolbar.turnInto.title')}
                onClick={() => setTurnOpen((open) => !open)}
              >
                <span data-inkbrick-part="turn-title">{turnInto.title}</span>
                <Icon name="chevron-down" />
              </button>
              {turnOpen && (
                <div
                  className="inkbrick-toolbar__turn-menu"
                  data-inkbrick-part="turn-menu"
                  role="menu"
                  aria-label={t('toolbar.turnInto.title')}
                >
                  {turnInto.options.map((option) => (
                    <div
                      key={option.id}
                      role="menuitemradio"
                      aria-checked={option.active}
                      tabIndex={0}
                      data-action={option.id}
                      data-inkbrick-part="turn-option"
                      data-active={option.active || undefined}
                      onClick={() => {
                        setTurnOpen(false);
                        if (!option.active) option.run();
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setTurnOpen(false);
                          if (!option.active) option.run();
                        } else if (event.key === 'Escape') {
                          event.preventDefault();
                          setTurnOpen(false);
                        }
                      }}
                    >
                      {option.icon !== undefined && (
                        <span data-inkbrick-part="icon">{option.icon}</span>
                      )}
                      {option.title}
                    </div>
                  ))}
                </div>
              )}
              <span
                className="inkbrick-toolbar__separator"
                data-inkbrick-part="separator"
                role="separator"
              />
            </>
          )}
          {BUTTONS.map(({ format, icon }) => (
            <button
              key={format}
              type="button"
              className="inkbrick-toolbar__button"
              data-inkbrick-part="button"
              data-format={format}
              data-pressed={formats[format] || undefined}
              aria-label={t(`toolbar.${format}.label`)}
              aria-pressed={formats[format]}
              title={t(`toolbar.${format}.title`)}
              onClick={() => onToggle(format)}
            >
              <Icon name={icon} />
            </button>
          ))}
          <span
            className="inkbrick-toolbar__separator"
            data-inkbrick-part="separator"
            role="separator"
          />
          {scope !== 'cells' && (
            <>
              <button
                type="button"
                className="inkbrick-toolbar__button"
                data-inkbrick-part="button"
                data-format="link"
                data-pressed={formats.link !== undefined || undefined}
                aria-label={t('toolbar.link.label')}
                aria-pressed={formats.link !== undefined}
                title={t('toolbar.link.title')}
                onClick={onOpenLink}
              >
                <Icon name="link" />
              </button>
              <button
                type="button"
                className="inkbrick-toolbar__button"
                data-inkbrick-part="button"
                data-format="formula"
                aria-label={t('toolbar.formula.label')}
                title={t('toolbar.formula.title')}
                onClick={onInsertFormula}
              >
                <Icon name="sigma" />
              </button>
              <span
                className="inkbrick-toolbar__separator"
                data-inkbrick-part="separator"
                role="separator"
              />
            </>
          )}
          {PANELS.map(({ panel: name, icon }) => {
            const current = name === 'color' ? formats.color : formats.backgroundColor;

            return (
              <button
                key={name}
                type="button"
                className="inkbrick-toolbar__button"
                data-inkbrick-part="button"
                data-format={name}
                data-pressed={panel === name || undefined}
                data-current-color={isColorName(current) ? current : undefined}
                aria-label={t(`toolbar.${name}.label`)}
                aria-haspopup="true"
                aria-expanded={panel === name}
                title={t(`toolbar.${name}.title`)}
                onClick={() => onTogglePanel(name)}
              >
                <Icon name={icon} />
                <span className="inkbrick-toolbar__indicator" data-inkbrick-part="indicator" />
              </button>
            );
          })}
          <span
            className="inkbrick-toolbar__separator"
            data-inkbrick-part="separator"
            role="separator"
          />
          {ALIGNMENTS.map((align) => (
            <button
              key={align}
              type="button"
              className="inkbrick-toolbar__button"
              data-inkbrick-part="button"
              data-format={`align-${align}`}
              data-pressed={formats.align === align || undefined}
              aria-label={t(`toolbar.align.${align}.label`)}
              aria-pressed={formats.align === align}
              title={t(`toolbar.align.${align}.title`)}
              onClick={() => onAlign(align)}
            >
              <Icon name={ALIGN_ICONS[align]} />
            </button>
          ))}
          {onClearFormat && (
            <button
              type="button"
              className="inkbrick-toolbar__button"
              data-inkbrick-part="button"
              data-format="clear"
              aria-label={t('toolbar.clear.label')}
              title={t('toolbar.clear.title')}
              onClick={onClearFormat}
            >
              <Icon name="x" />
            </button>
          )}
          {panel && (
            <div
              key={panel}
              className="inkbrick-toolbar__panel"
              data-inkbrick-part="panel"
              data-kind={panel}
              role="group"
              aria-label={t(`toolbar.${panel}.label`)}
            >
              <button
                type="button"
                data-inkbrick-part="swatch"
                data-color=""
                data-pressed={currentColor === undefined || undefined}
                aria-label={t(
                  panel === 'color' ? 'toolbar.color.default' : 'toolbar.highlight.none',
                )}
                title={t(panel === 'color' ? 'toolbar.color.default' : 'toolbar.highlight.none')}
                onClick={() => onApplyColor(colorKind, null)}
              >
                <Icon name="x" />
              </button>
              {COLOR_NAMES.map((name) => (
                <button
                  key={name}
                  type="button"
                  data-inkbrick-part="swatch"
                  data-color={name}
                  data-pressed={currentColor === name || undefined}
                  aria-label={t(`color.${name}`)}
                  title={t(`color.${name}`)}
                  onClick={() => onApplyColor(colorKind, name)}
                >
                  {panel === 'color' ? 'A' : null}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
