import { CALLOUT_TONES, getBlockAlign } from '@inkbrick/document';

import { useT } from '../hooks/useT';
import { Icon, type IconName } from '../icons/Icon';

import { Editable } from './Editable';
import type { BlockViewProps } from '../ui/types';

const ICONS: Record<(typeof CALLOUT_TONES)[number], IconName> = {
  info: 'info',
  warning: 'warning',
  success: 'success',
  danger: 'danger',
};

type Tone = (typeof CALLOUT_TONES)[number];

const isTone = (value: unknown): value is Tone => CALLOUT_TONES.includes(value as Tone);

export function CalloutBlock({ block, editor, selected, readOnly }: BlockViewProps) {
  const t = useT();
  const tone: Tone = isTone(block.props.tone) ? block.props.tone : 'info';
  const icon =
    typeof block.props.icon === 'string' && block.props.icon !== '' ? (
      block.props.icon
    ) : (
      <Icon name={ICONS[tone]} />
    );

  const nextTone = CALLOUT_TONES[(CALLOUT_TONES.indexOf(tone) + 1) % CALLOUT_TONES.length];

  return (
    <div
      className="block block-callout"
      data-inkbrick-block="callout"
      data-align={getBlockAlign(block) ?? 'left'}
      data-tone={tone}
      data-block-id={block.id}
      data-selected={selected || undefined}
    >
      <button
        type="button"
        className="callout-icon"
        data-inkbrick-part="icon"
        contentEditable={false}
        disabled={readOnly}
        aria-label={t('block.callout.label', { tone: t(`block.callout.tone.${tone}`) })}
        title={t('block.callout.change')}
        onClick={() =>
          editor.dispatch({
            type: 'setBlockProps',
            payload: { blockId: block.id, props: { tone: nextTone } },
          })
        }
      >
        {icon}
      </button>
      <Editable block={block} />
    </div>
  );
}
