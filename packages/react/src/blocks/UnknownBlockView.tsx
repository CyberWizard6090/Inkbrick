import { useT } from '../hooks/useT';
import type { UnknownBlockViewProps } from '../ui/types';

/**
 * Стандартная заглушка для блока с незарегистрированным flavour.
 * Не редактируется; данные блока остаются в документе нетронутыми.
 */
export function UnknownBlockView({ block, children }: UnknownBlockViewProps) {
  const t = useT();

  return (
    <div
      className="block block-unknown"
      data-inkbrick-block="unknown"
      role="note"
      contentEditable={false}
      data-block-id={block.id}
      data-unknown-flavour={block.flavour}
    >
      <div className="block-unknown__message" data-inkbrick-part="message">
        {t('block.unknown.title')} <code>{block.flavour}</code>. {t('block.unknown.hint')}{' '}
        <code>components</code>.
      </div>
      {children}
    </div>
  );
}
