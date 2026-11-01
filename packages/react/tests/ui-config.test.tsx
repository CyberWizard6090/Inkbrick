// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';

import { Editor } from '@inkbrick/engine';
import { createSchemaRegistry, deserializeDocument, serializeDocument } from '@inkbrick/document';

import {
  BlockChildren,
  DocumentView,
  EditorProvider,
  defaultBlockComponents,
  definePresentation,
  useEditorUI,
  resolveBlockComponent,
  type BlockComponentRegistry,
  type BlockViewProps,
  type EditorSlots,
  type UnknownBlockViewProps,
} from '../src';

const Mine = ({ block }: BlockViewProps) => <p data-mine={block.id}>mine</p>;
const Other = ({ block }: BlockViewProps) => <p data-other={block.id}>other</p>;

describe('resolveBlockComponent', () => {
  it('prefers the custom component for the exact flavour', () => {
    expect(resolveBlockComponent('block:paragraph', { 'block:paragraph': Mine })).toBe(Mine);
  });

  it('falls back to the default component, then to undefined', () => {
    expect(resolveBlockComponent('block:paragraph', {})).toBe(
      defaultBlockComponents['block:paragraph'],
    );
    expect(resolveBlockComponent('block:nope', {})).toBeUndefined();
  });

  it('accepts partial configuration', () => {
    const custom: BlockComponentRegistry = { 'block:list': Mine };

    expect(resolveBlockComponent('block:heading', custom)).toBe(
      defaultBlockComponents['block:heading'],
    );
  });

  it('does not resolve inherited object properties', () => {
    for (const key of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(resolveBlockComponent(key, {})).toBeUndefined();
    }
  });

  it('has defaults for every built-in block', () => {
    expect(Object.keys(defaultBlockComponents).sort()).toEqual([
      'block:callout',
      'block:code',
      'block:divider',
      'block:formula',
      'block:heading',
      'block:image',
      'block:list',
      'block:note',
      'block:page',
      'block:paragraph',
      'block:quote',
    ]);
  });
});

describe('EditorProvider.components (server render)', () => {
  const paragraphId = (editor: Editor) => {
    const note = editor.document.getBlock(editor.document.rootId)!.children[0];
    return editor.document.getBlock(note)!.children[0];
  };

  it('renders the default components without configuration', () => {
    const editor = new Editor();
    const html = renderToString(
      <EditorProvider editor={editor}>
        <DocumentView />
      </EditorProvider>,
    );

    expect(html).toContain('block-paragraph');
  });

  it('renders custom components instead of the defaults', () => {
    const editor = new Editor();
    const html = renderToString(
      <EditorProvider editor={editor} components={{ 'block:paragraph': Mine }}>
        <DocumentView />
      </EditorProvider>,
    );

    expect(html).toContain(`data-mine="${paragraphId(editor)}"`);
    expect(html).not.toContain('block-paragraph');
    expect(html).toContain('page-content'); // остальные блоки — стандартные
  });

  it('keeps configurations of different editors independent', () => {
    const a = new Editor();
    const b = new Editor();

    const html = renderToString(
      <>
        <EditorProvider editor={a} components={{ 'block:paragraph': Mine }}>
          <DocumentView />
        </EditorProvider>
        <EditorProvider editor={b} components={{ 'block:paragraph': Other }}>
          <DocumentView />
        </EditorProvider>
      </>,
    );

    expect(html).toContain(`data-mine="${paragraphId(a)}"`);
    expect(html).toContain(`data-other="${paragraphId(b)}"`);
    expect(html).not.toContain(`data-mine="${paragraphId(b)}"`);
    expect(html).not.toContain(`data-other="${paragraphId(a)}"`);
  });

  it('passes the editor to custom components and never stores them in the document', () => {
    const editor = new Editor();
    let received: unknown;

    const Spy = (props: BlockViewProps) => {
      received = props.editor;
      return null;
    };

    renderToString(
      <EditorProvider editor={editor} components={{ 'block:paragraph': Spy }}>
        <DocumentView />
      </EditorProvider>,
    );

    expect(received).toBe(editor);
    expect(JSON.stringify(serializeDocument(editor.document))).not.toContain('Spy');
  });

  it('renders custom container components with children', () => {
    const editor = new Editor();
    const Note = ({ block }: BlockViewProps) => (
      <div data-custom-note>
        <BlockChildren id={block.id} />
      </div>
    );

    const html = renderToString(
      <EditorProvider editor={editor} components={{ 'block:note': Note }}>
        <DocumentView />
      </EditorProvider>,
    );

    expect(html).toContain('data-custom-note');
    expect(html).toContain('block-paragraph');
  });
});

describe('unknown blocks', () => {
  function editorWithUnknown() {
    const source = new Editor();
    const snapshot = serializeDocument(source.document);
    const note = snapshot.blocks[snapshot.rootId].children[0];

    snapshot.blocks['u1'] = {
      id: 'u1',
      flavour: 'block:mystery',
      parentId: note,
      children: [],
      content: [],
      props: {},
    };
    snapshot.blocks[note].children.push('u1');

    const schema = createSchemaRegistry();

    return new Editor({ schema, document: deserializeDocument(snapshot, { schema }) });
  }

  it('render a diagnostic fallback that names the flavour', () => {
    const html = renderToString(
      <EditorProvider editor={editorWithUnknown()}>
        <DocumentView />
      </EditorProvider>,
    );

    expect(html).toContain('data-unknown-flavour="block:mystery"');
    expect(html).toContain('block:mystery');
    expect(html).toContain('block-paragraph'); // остальной документ рисуется
  });

  it('can be replaced through slots.UnknownBlock', () => {
    const Custom = ({ block }: UnknownBlockViewProps) => <i data-slot={block.flavour} />;
    const slots: EditorSlots = { UnknownBlock: Custom };

    const html = renderToString(
      <EditorProvider editor={editorWithUnknown()} slots={slots}>
        <DocumentView />
      </EditorProvider>,
    );

    expect(html).toContain('data-slot="block:mystery"');
    expect(html).not.toContain('data-unknown-flavour');
  });

  it('are never replaced by a different block type', () => {
    const html = renderToString(
      <EditorProvider editor={editorWithUnknown()} components={{ 'block:paragraph': Mine }}>
        <DocumentView />
      </EditorProvider>,
    );

    expect(html.match(/data-mine=/g)?.length).toBe(1); // только настоящий параграф
  });
});

describe('EditorProvider.presentation', () => {
  const Heading = ({ block }: BlockViewProps) => <h6 data-ds-heading={block.id}>ds</h6>;
  const Code = () => <pre data-ds-code="">code</pre>;
  const designSystem = definePresentation({
    components: { 'block:paragraph': Mine, 'block:heading': Heading },
    slots: { Toolbar: null },
    slashItems: false,
    highlighter: false,
  });

  function Probe() {
    const ui = useEditorUI();

    return (
      <output
        data-toolbar={String(ui.slots.Toolbar)}
        data-slash={ui.slashItems.length}
        data-highlighter={String(ui.highlighter)}
        data-paragraph={ui.components['block:paragraph'] === Mine ? 'mine' : 'other'}
        data-heading={ui.components['block:heading'] === Heading ? 'ds' : 'default'}
        data-code={ui.components['block:code'] === Code ? 'prop' : 'default'}
      />
    );
  }

  it('applies the whole visual layer from one object', () => {
    const editor = new Editor();
    const html = renderToString(
      <EditorProvider editor={editor} presentation={designSystem}>
        <DocumentView />
        <Probe />
      </EditorProvider>,
    );

    expect(html).toContain('data-mine=');
    expect(html).toContain('data-toolbar="null"');
    expect(html).toContain('data-slash="0"');
    expect(html).toContain('data-highlighter="null"');
  });

  it('separate props refine it: components and slots merge, the rest replaces', () => {
    const editor = new Editor();
    const html = renderToString(
      <EditorProvider
        editor={editor}
        presentation={designSystem}
        components={{ 'block:paragraph': Other, 'block:code': Code }}
        slashItems={[]}
      >
        <Probe />
      </EditorProvider>,
    );

    expect(html).toContain('data-paragraph="other"');
    expect(html).toContain('data-heading="ds"');
    expect(html).toContain('data-code="prop"');
    expect(html).toContain('data-toolbar="null"');
    expect(html).not.toContain('data-slash="0"');
  });
});
