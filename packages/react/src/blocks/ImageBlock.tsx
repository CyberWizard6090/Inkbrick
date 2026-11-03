import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { isSafeImageUrl } from '@inkbrick/document';
import type { Editor } from '@inkbrick/engine';

import { useEditorView } from '../hooks/useEditorView';
import { useT } from '../hooks/useT';
import type { MessageKey } from '../i18n/en';
import { Icon, type IconName } from '../icons/Icon';
import { formatImageError } from '../images/ImageError';
import { fillImageBlock } from '../images/insertImages';
import { normalizeImageUrl } from '../images/upload';
import { DEFAULT_IMAGE_TYPES } from '../images/types';
import { Select } from '../ui/Select';
import { useEditorUI } from '../ui/EditorUIContext';
import type { BlockViewProps } from '../ui/types';
import { CommitInput } from './CommitInput';

const WIDTHS = [25, 50, 75, 100];
const ALIGNS: ReadonlyArray<{ value: string; label: MessageKey; icon: IconName }> = [
  { value: 'left', label: 'image.align.left', icon: 'align-left' },
  { value: 'center', label: 'image.align.center', icon: 'align-center' },
  { value: 'right', label: 'image.align.right', icon: 'align-right' },
];

const setProps = (editor: Editor, blockId: string, props: Record<string, unknown>) =>
  editor.dispatch({ type: 'setBlockProps', payload: { blockId, props: props as never } });

function ImagePicker({ blockId, editor }: { blockId: string; editor: Editor }) {
  const view = useEditorView();
  const t = useT();
  const { images } = useEditorUI();
  const [url, setUrl] = useState('');
  const [linkError, setLinkError] = useState<MessageKey | null>(null);
  const uploadError = useSyncExternalStore(
    view.uploads.subscribe,
    () => view.uploads.errorDetailsOf(blockId),
    () => undefined,
  );
  const error = linkError ? t(linkError) : uploadError ? formatImageError(uploadError, t) : null;
  const file = useRef<HTMLInputElement>(null);
  const zone = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const embed = () => {
    const normalized = normalizeImageUrl(url);

    if (!normalized) {
      setLinkError('image.error.invalidLink');
      return;
    }

    if (
      editor.dispatch({
        type: 'setBlockProps',
        payload: { blockId, props: { src: normalized } },
      }) === undefined
    ) {
      setLinkError('image.error.unsupportedAddress');
    }
  };

  const upload = async (selected: File | undefined) => {
    if (!selected) return;

    setLinkError(null);
    await fillImageBlock(editor, view, images, blockId, selected);
  };

  useEffect(() => {
    const element = zone.current;

    if (!element) return;

    const hasFiles = (event: DragEvent) => [...(event.dataTransfer?.types ?? [])].includes('Files');
    const over = (event: DragEvent) => {
      if (!hasFiles(event)) return;

      event.preventDefault();
      event.stopPropagation();
      setDragging(true);
    };
    const leave = (event: DragEvent) => {
      if (!(event.relatedTarget instanceof Node && element.contains(event.relatedTarget))) {
        setDragging(false);
      }
    };
    const drop = (event: DragEvent) => {
      if (!hasFiles(event)) return;

      event.preventDefault();
      event.stopPropagation();
      setDragging(false);
      void upload(event.dataTransfer?.files[0]);
    };

    element.addEventListener('dragenter', over);
    element.addEventListener('dragover', over);
    element.addEventListener('dragleave', leave);
    element.addEventListener('drop', drop);

    return () => {
      element.removeEventListener('dragenter', over);
      element.removeEventListener('dragover', over);
      element.removeEventListener('dragleave', leave);
      element.removeEventListener('drop', drop);
    };
  });

  return (
    <div
      ref={zone}
      className="image-picker"
      data-inkbrick-part="picker"
      data-testid="image-picker"
      data-dragging={dragging || undefined}
    >
      <div className="image-picker__head" data-inkbrick-part="picker-head">
        <span data-inkbrick-part="picker-icon">
          <Icon name="image" />
        </span>
        <span data-inkbrick-part="picker-text">
          <span data-inkbrick-part="picker-title">{t('image.picker.title')}</span>
          <span data-inkbrick-part="picker-hint">
            {dragging ? t('image.picker.drop') : t('image.picker.hint')}
          </span>
        </span>
        <button
          type="button"
          className="image-picker__upload"
          data-inkbrick-part="picker-upload"
          onClick={() => file.current?.click()}
        >
          <Icon name="upload" />
          {t('image.upload')}
        </button>
      </div>
      <div className="image-picker__row" data-inkbrick-part="picker-row">
        <input
          className="image-picker__input"
          data-inkbrick-part="picker-input"
          type="text"
          aria-label={t('image.url.label')}
          aria-invalid={linkError !== null}
          placeholder={t('image.url.placeholder')}
          value={url}
          onChange={(event) => {
            setUrl(event.target.value);
            setLinkError(null);
            view.uploads.clearError(blockId);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              embed();
            }
          }}
        />
        <button
          type="button"
          className="image-picker__button"
          data-inkbrick-part="picker-button"
          onClick={embed}
        >
          {t('image.embed')}
        </button>
        <input
          ref={file}
          type="file"
          hidden
          data-testid="image-file"
          accept={(images.acceptedTypes ?? DEFAULT_IMAGE_TYPES).join(',')}
          onChange={(event) => {
            void upload(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
      </div>
      {error && (
        <div className="image-picker__error" data-inkbrick-part="picker-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}

export function ImageBlock({ block, editor, selected, readOnly }: BlockViewProps) {
  const view = useEditorView();
  const t = useT();
  const uploading = useSyncExternalStore(
    view.uploads.subscribe,
    () => view.uploads.has(block.id),
    () => false,
  );

  const { src, alt, caption } = block.props as { src?: string; alt?: string; caption?: string };
  const width = typeof block.props.width === 'number' ? block.props.width : 100;
  const align = typeof block.props.align === 'string' ? block.props.align : 'center';
  const address = typeof src === 'string' ? src : '';

  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [address]);

  let content;

  if (uploading) {
    content = (
      <div className="image-status" data-inkbrick-part="status" data-state="loading" role="status">
        {t('image.status.uploading')}
      </div>
    );
  } else if (address === '') {
    content = readOnly ? (
      <div className="image-status" data-inkbrick-part="status" data-state="empty">
        {t('image.status.none')}
      </div>
    ) : (
      <ImagePicker blockId={block.id} editor={editor} />
    );
  } else if (!isSafeImageUrl(address)) {
    content = (
      <div
        className="image-status image-status--error"
        data-inkbrick-part="status"
        data-state="error"
      >
        {t('image.status.unsupported')}
      </div>
    );
  } else if (failed) {
    content = (
      <div
        className="image-status image-status--error"
        data-inkbrick-part="status"
        data-state="error"
        role="alert"
      >
        {t('image.status.failed')}
        {!readOnly && (
          <button
            type="button"
            className="image-picker__button"
            data-inkbrick-part="picker-button"
            onClick={() => setProps(editor, block.id, { src: '' })}
          >
            {t('image.status.retry')}
          </button>
        )}
      </div>
    );
  } else {
    content = (
      <figure
        className="image-figure"
        data-inkbrick-part="figure"
        data-align={align}
        style={{ width: `${width}%` }}
      >
        <img
          src={address}
          alt={alt ?? ''}
          loading="lazy"
          decoding="async"
          draggable={false}
          data-inkbrick-part="image"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />

        {!readOnly && (
          <div
            className="image-tools"
            data-inkbrick-part="tools"
            role="toolbar"
            aria-label={t('image.options')}
          >
            {ALIGNS.map(({ value, label, icon }) => (
              <button
                key={value}
                type="button"
                className="image-tools__button"
                data-inkbrick-part="tool"
                data-pressed={align === value || undefined}
                aria-label={t(label)}
                aria-pressed={align === value}
                title={t(label)}
                onClick={() => setProps(editor, block.id, { align: value })}
              >
                <Icon name={icon} />
              </button>
            ))}
            <Select
              className="image-tools__select"
              part="width"
              label={t('image.width')}
              value={String(width)}
              options={(WIDTHS.includes(width)
                ? WIDTHS
                : [...WIDTHS, width].sort((a, b) => a - b)
              ).map((w) => ({ value: String(w), label: `${w}%` }))}
              onChange={(value) => setProps(editor, block.id, { width: Number(value) })}
            />
            <CommitInput
              className="image-tools__alt"
              part="alt"
              label={t('image.alt')}
              placeholder={t('image.alt')}
              value={alt ?? ''}
              onCommit={(value) => setProps(editor, block.id, { alt: value })}
            />
            <button
              type="button"
              className="image-tools__button"
              data-inkbrick-part="tool"
              aria-label={t('image.replace')}
              title={t('image.replace')}
              onClick={() => setProps(editor, block.id, { src: '' })}
            >
              <Icon name="refresh-cw" />
            </button>
          </div>
        )}

        {readOnly ? (
          caption ? (
            <figcaption className="image-caption" data-inkbrick-part="caption">
              {caption}
            </figcaption>
          ) : null
        ) : (
          <CommitInput
            className="image-caption image-caption--input"
            part="caption"
            label={t('image.caption.label')}
            placeholder={t('image.caption.placeholder')}
            value={caption ?? ''}
            onCommit={(value) => setProps(editor, block.id, { caption: value })}
          />
        )}
      </figure>
    );
  }

  return (
    <div
      className="block block-image"
      data-inkbrick-block="image"
      data-block-id={block.id}
      data-selected={selected || undefined}
      contentEditable={false}
    >
      {content}
    </div>
  );
}
