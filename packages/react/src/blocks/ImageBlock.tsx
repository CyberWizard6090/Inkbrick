import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from 'react';

import { flushSync } from 'react-dom';

import { isSafeImageUrl } from '@inkbrick/document';
import type { Editor } from '@inkbrick/engine';
import { formatImageError } from '@inkbrick/view';

import { useEditorView } from '../hooks/useEditorView';
import { useT } from '../hooks/useT';
import type { MessageKey } from '../i18n/en';
import { Icon } from '../icons/Icon';
import { fillImageBlock } from '../images/insertImages';
import { normalizeImageUrl } from '../images/upload';
import { DEFAULT_IMAGE_TYPES } from '../images/types';
import { FULL, cropOf, isCropped, originalOf, styleCrop, type BlockCrop } from '../images/crop';
import { consumeCrop, dropCropRequest, requestCrop } from '../images/cropRequests';
import { downloadOriginal, downloadShown, saveCrop } from '../images/saveCrop';
import { useEditorUI } from '../ui/EditorUIContext';
import type { BlockViewProps } from '../ui/types';
import { CommitInput } from './CommitInput';
import {
  CropDialog,
  ViewDialog,
  documentImages,
  themeOf,
  type DocumentImage,
} from './ImageDialogs';
import { ImageToolbar, ResizeHandles } from './ImageToolbar';

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
  const [tab, setTab] = useState<'upload' | 'link'>('upload');
  // Поле ссылки получает фокус, когда вкладку открыли щелчком; стрелками фокус остаётся на вкладках.
  const [focusLink, setFocusLink] = useState(false);
  const tabsId = useId();

  const embed = (value = url) => {
    const normalized = normalizeImageUrl(value);

    if (!normalized) {
      setLinkError('image.error.invalidLink');
      return;
    }

    // Запрос ставится до записи адреса: блок забирает его, когда получит картинку (и после неудачи снимаем).
    if (images.cropOnAdd !== false) requestCrop(blockId);

    editor.dispatch({ type: 'setBlockProps', payload: { blockId, props: { src: normalized } } });

    // Команда ничего не возвращает: принят ли адрес, видно по самому блоку.
    if (editor.store.getBlock(blockId)?.props.src !== normalized) {
      dropCropRequest(blockId);
      setLinkError('image.error.unsupportedAddress');
    }
  };

  const upload = async (selected: File | undefined) => {
    if (!selected) return;

    setLinkError(null);

    if (images.cropOnAdd !== false) requestCrop(blockId);

    await fillImageBlock(editor, view, images, blockId, selected);

    // Файл не принят: блок остался без картинки, запрос на кадр не нужен.
    if (!editor.store.getBlock(blockId)?.props.src) dropCropRequest(blockId);
  };

  useEffect(() => {
    const element = zone.current;

    if (!element) return;

    const types = (event: DragEvent) => [...(event.dataTransfer?.types ?? [])];
    const accepts = (event: DragEvent) =>
      types(event).includes('Files') || types(event).includes('text/uri-list');
    // Над выбором линия вставки документа не нужна: картинка встанет в этот блок.
    const hideLine = () => {
      if (view.blocks.getState().drag?.blockId === 'inkbrick:external') view.blocks.endDrag();
    };
    const over = (event: DragEvent) => {
      if (!accepts(event)) return;

      event.preventDefault();
      event.stopPropagation();
      hideLine();
      setDragging(true);
    };
    const leave = (event: DragEvent) => {
      if (!(event.relatedTarget instanceof Node && element.contains(event.relatedTarget))) {
        setDragging(false);
      }
    };
    const drop = (event: DragEvent) => {
      if (!accepts(event)) return;

      event.preventDefault();
      event.stopPropagation();
      hideLine();
      setDragging(false);

      // Файл — загружаем; картинку с сайта — вставляем по ссылке.
      if (types(event).includes('Files')) {
        void upload(event.dataTransfer?.files[0]);
      } else {
        const link = event.dataTransfer?.getData('text/uri-list').split(/\r?\n/)[0] ?? '';

        setTab('link');
        setUrl(link);
        embed(link);
      }
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
      <div
        role="tablist"
        aria-label={t('image.picker.title')}
        data-inkbrick-part="picker-tabs"
        onKeyDown={(event) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;

          event.preventDefault();

          const next = tab === 'upload' ? 'link' : 'upload';

          setFocusLink(false);
          flushSync(() => setTab(next));
          (
            event.currentTarget.querySelector(`[data-tab="${next}"]`) as HTMLElement | null
          )?.focus();
        }}
      >
        {(['upload', 'link'] as const).map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            id={`${tabsId}-${name}`}
            aria-selected={tab === name}
            aria-controls={`${tabsId}-panel`}
            tabIndex={tab === name ? 0 : -1}
            data-inkbrick-part="picker-tab"
            data-tab={name}
            onClick={() => {
              setFocusLink(true);
              setTab(name);
            }}
          >
            {t(name === 'upload' ? 'image.picker.upload' : 'image.picker.link')}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${tabsId}-panel`}
        aria-labelledby={`${tabsId}-${tab}`}
        data-inkbrick-part="picker-panel"
      >
        {tab === 'upload' ? (
          <>
            {/* Настоящее поле файла поверх кнопки: так выбор файла открывается и во встроенных браузерах телефонов (скрытое поле и `click()` из скрипта там не срабатывают). */}
            <label className="image-picker__upload" data-inkbrick-part="picker-upload">
              <Icon name="upload" />
              {t('image.uploadFile')}
              <input
                ref={file}
                type="file"
                className="image-picker__file"
                data-inkbrick-part="picker-file"
                data-testid="image-file"
                aria-label={t('image.uploadFile')}
                accept={(images.acceptedTypes ?? DEFAULT_IMAGE_TYPES).join(',')}
                onChange={(event) => {
                  void upload(event.target.files?.[0]);
                  event.target.value = '';
                }}
              />
            </label>
            <span data-inkbrick-part="picker-hint">
              {dragging ? t('image.picker.drop') : t('image.picker.hint')}
            </span>
          </>
        ) : (
          <div className="image-picker__row" data-inkbrick-part="picker-row">
            <input
              className="image-picker__input"
              data-inkbrick-part="picker-input"
              type="text"
              aria-label={t('image.url.label')}
              aria-invalid={linkError !== null}
              placeholder={t('image.url.placeholder')}
              value={url}
              autoFocus={focusLink}
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
              onClick={() => embed()}
            >
              {t('image.embed')}
            </button>
          </div>
        )}
      </div>
      {error && (
        <div className="image-picker__error" data-inkbrick-part="picker-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}

interface PictureProps {
  readonly src: string;
  readonly alt: string;
  readonly crop: BlockCrop;
  /** Обрезать стилем: файла обрезки нет, `src` — оригинал. */
  readonly styled: boolean;
  onError(): void;
}

/**
 * Сама картинка. Обычно это просто `<img>` (файл обрезки или картинка без обрезки). Если файла обрезки нет, кадр с
 * пропорциями рамки показывает нужную часть оригинала.
 */
function Picture({ src, alt, crop, styled, onError }: PictureProps) {
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => setNatural(null), [src]);

  const image = (style?: CSSProperties) => (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      draggable={false}
      data-inkbrick-part="image"
      referrerPolicy="no-referrer"
      style={style}
      onLoad={(event) => {
        const { naturalWidth, naturalHeight } = event.currentTarget;

        if (naturalWidth > 0 && naturalHeight > 0) {
          setNatural({ width: naturalWidth, height: naturalHeight });
        }
      }}
      onError={onError}
    />
  );

  if (!styled) return image();

  const place = natural ? styleCrop(crop.rect, natural) : null;

  return (
    <div
      className="image-frame"
      data-inkbrick-part="frame"
      data-ready={place ? '' : undefined}
      style={{ aspectRatio: place ? String(place.ratio) : undefined }}
    >
      {image(
        place
          ? {
              left: `${place.left}%`,
              top: `${place.top}%`,
              width: `${place.width}%`,
              height: `${place.height}%`,
            }
          : undefined,
      )}
    </div>
  );
}

export function ImageBlock({ block, editor, selected, readOnly }: BlockViewProps) {
  const view = useEditorView();
  const t = useT();
  const { images } = useEditorUI();
  const uploading = useSyncExternalStore(
    view.uploads.subscribe,
    () => view.uploads.has(block.id),
    () => false,
  );

  const props = block.props;
  const text = (value: unknown) => (typeof value === 'string' ? value : '');
  const address = text(props.src);
  const originalSrc = text(props.originalSrc);
  const alt = text(props.alt);
  const caption = text(props.caption);
  const captionShown = props.showCaption === true || caption !== '';
  const width = typeof props.width === 'number' ? props.width : 100;
  const align = typeof props.align === 'string' ? props.align : 'center';
  const crop = cropOf(props);
  const cropped = isCropped(crop);

  const figure = useRef<HTMLElement>(null);
  const [failed, setFailed] = useState(false);
  const [cropping, setCropping] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftWidth, setDraftWidth] = useState<number | null>(null);
  const [focusCaption, setFocusCaption] = useState(false);
  const [viewer, setViewer] = useState<{ images: DocumentImage[]; index: number } | null>(null);

  useEffect(() => setFailed(false), [address]);

  // Картинка только что добавлена из выбора: сразу открываем обрезку (если не выключено `images.cropOnAdd`).
  useEffect(() => {
    if (address !== '' && !readOnly && consumeCrop(block.id)) setCropping(true);
  }, [address, block.id, readOnly]);

  const save = async (rect: BlockCrop['rect'], aspect: BlockCrop['aspect']) => {
    setSaving(true);

    try {
      await saveCrop(editor, images, block.id, rect, aspect);
    } finally {
      setSaving(false);
      setCropping(false);
    }
  };

  const openViewer = () => {
    const list = documentImages(editor);
    const index = list.findIndex((item) => item.blockId === block.id);

    if (index >= 0) setViewer({ images: list, index });
  };

  const toggleCaption = () => {
    if (captionShown) {
      setProps(editor, block.id, { showCaption: false, caption: '' });
    } else {
      setFocusCaption(true);
      setProps(editor, block.id, { showCaption: true });
    }
  };

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
            onClick={() => setProps(editor, block.id, { src: '', originalSrc: '' })}
          >
            {t('image.status.retry')}
          </button>
        )}
      </div>
    );
  } else {
    const shownWidth = draftWidth ?? width;

    content = (
      <figure
        ref={figure}
        className="image-figure"
        data-inkbrick-part="figure"
        data-align={align}
        data-shape={crop.aspect === 'circle' ? 'circle' : undefined}
        data-resizing={draftWidth !== null || undefined}
        style={{ width: `${shownWidth}%` }}
        // На сенсорном экране нет наведения: касание фокусирует картинку, и панель (`:focus-within`) показывается.
        tabIndex={-1}
      >
        <div data-inkbrick-part="picture">
          <Picture
            src={address}
            alt={alt}
            crop={crop}
            styled={originalSrc === '' && cropped}
            onError={() => setFailed(true)}
          />
          {!readOnly && (
            <ResizeHandles
              width={width}
              align={align}
              onPreview={setDraftWidth}
              onCommit={(next) => setProps(editor, block.id, { width: next })}
            />
          )}
        </div>

        <ImageToolbar
          align={align}
          alt={alt}
          captionShown={captionShown}
          cropped={cropped}
          readOnly={readOnly}
          onAlign={(value) => setProps(editor, block.id, { align: value })}
          onToggleCaption={toggleCaption}
          onCrop={() => setCropping(true)}
          onView={openViewer}
          onDownload={() => void downloadShown(props)}
          onDownloadOriginal={() => void downloadOriginal(props)}
          onAlt={(value) => setProps(editor, block.id, { alt: value })}
          onReplace={() => setProps(editor, block.id, { src: '', originalSrc: '' })}
          onResetCrop={() =>
            setProps(editor, block.id, {
              src: originalOf(props),
              originalSrc: '',
              aspect: 'free',
              cropX: 0,
              cropY: 0,
              cropWidth: 100,
              cropHeight: 100,
            })
          }
        />

        {readOnly ? (
          caption ? (
            <figcaption className="image-caption" data-inkbrick-part="caption">
              {caption}
            </figcaption>
          ) : null
        ) : captionShown ? (
          <CommitInput
            className="image-caption image-caption--input"
            part="caption"
            label={t('image.caption.label')}
            placeholder={t('image.caption.placeholder')}
            value={caption}
            autoFocus={focusCaption}
            onCommit={(value) => setProps(editor, block.id, { caption: value })}
            onDone={() => setFocusCaption(false)}
          />
        ) : null}

        {cropping && !readOnly && (
          <CropDialog
            src={originalOf(props)}
            alt={alt}
            crop={cropped ? crop : { rect: FULL, aspect: crop.aspect }}
            busy={saving}
            theme={themeOf(figure.current)}
            onSave={(rect, aspect) => void save(rect, aspect)}
            onCancel={() => setCropping(false)}
          />
        )}

        {viewer && (
          <ViewDialog
            images={viewer.images}
            index={viewer.index}
            theme={themeOf(figure.current)}
            onIndexChange={(index) => setViewer({ ...viewer, index })}
            onClose={() => setViewer(null)}
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
