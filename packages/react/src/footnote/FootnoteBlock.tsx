import { useSyncExternalStore } from 'react';

import { useT } from '../hooks/useT';
import { useEditor } from '../hooks/useEditor';
import { useEditorView } from '../hooks/useEditorView';
import { Editable } from '../blocks/Editable';
import type { BlockProps } from '../blocks/BlockProps';
import { goToReference } from './actions';
import { getFootnoteIndex } from './FootnoteIndex';

/**
 * Текст сноски внизу заметки: номер, текст и кнопка возврата к ссылке. Номер берётся из индекса сносок (порядок ссылок в
 * документе), у сноски без ссылки вместо номера «?».
 */
export function FootnoteBlock({ block, selected }: BlockProps) {
  const editor = useEditor();
  const view = useEditorView();
  const t = useT();
  const index = getFootnoteIndex(editor);
  const id = typeof block.props.id === 'string' ? block.props.id : '';

  useSyncExternalStore(index.subscribe, index.getVersion, index.getVersion);

  const number = index.numberOf(id);
  const referenced = index.referenceOf(id) !== undefined;

  return (
    <div
      className="block block-footnote"
      data-inkbrick-block="footnote"
      data-block-id={block.id}
      data-footnote-id={id}
      data-selected={selected || undefined}
      data-orphan={!referenced || undefined}
    >
      <span data-inkbrick-part="footnote-number" contentEditable={false}>
        {number ?? '?'}
      </span>
      <Editable block={block} />
      {referenced && (
        <button
          type="button"
          data-inkbrick-part="footnote-back"
          contentEditable={false}
          aria-label={t('footnote.back')}
          title={t('footnote.back')}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => goToReference(editor, view, id)}
        >
          ↩
        </button>
      )}
    </div>
  );
}
