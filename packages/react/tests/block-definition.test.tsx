// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';

import { z, type BlockSchema } from '@inkbrick/document';
import {
  Editor,
  defineBlockCommand,
  defineBlockController,
  type CaretResult,
} from '@inkbrick/engine';

import {
  DocumentView,
  EditorProvider,
  EditorView,
  defineBlock,
  useBlockController,
  useEditorUI,
  type CustomBlockViewProps,
  type EditorUIConfig,
  type KeymapContext,
} from '../src';
import { buildBlockActions } from '../src/block-handle/actions';
import { handleKeyDown } from '../src/keymap/keymap';
import { createTranslator, resolveMessages } from '../src/i18n/translate';

type PollProps = { votes: number };

const pollSchema: BlockSchema = {
  flavour: 'test:poll',
  name: 'Poll',
  icon: 'list',
  propsSchema: z.object({ votes: z.number().int().min(0).default(0) }),
  allowedParents: ['role:hub'],
  allowedChildren: [],
  commands: [],
  shortcuts: [],
  rendererHint: 'poll',
};

const pollController = defineBlockController<PollProps>({
  commands: [
    defineBlockCommand<PollProps>({
      type: 'poll.vote',
      execute: ({ block, setProps }) => setProps({ votes: block.props.votes + 1 }),
    }),
  ],
  slashItems: [{ id: 'poll', title: 'Poll', keywords: ['vote'], icon: 'list' }],
  menuItems: [
    {
      id: 'poll.vote',
      title: 'Vote',
      icon: 'check',
      isDisabled: ({ can }) => !can('poll.vote'),
      run: ({ execute }) => execute('poll.vote'),
    },
  ],
  keymap: [{ id: 'poll.vote', keys: 'Mod-Enter', run: ({ execute }) => void execute('poll.vote') }],
});

function PollView({ block, readOnly, controller }: CustomBlockViewProps<PollProps>) {
  const poll = useBlockController<PollProps>(block);

  return (
    <div data-poll={block.id} data-votes={block.props.votes} data-readonly={readOnly}>
      <span data-has-controller={controller === pollController} />
      <span data-can-vote={poll.can('poll.vote')} />
    </div>
  );
}

const pollBlock = defineBlock<PollProps>({
  schema: pollSchema,
  component: PollView,
  controller: pollController,
});

function setup() {
  const editor = new Editor({ blocks: [pollBlock] });
  const noteId = editor.document.getBlock(editor.document.rootId)!.children[0];
  const firstId = editor.document.getBlock(noteId)!.children[0];
  const pollId = (
    editor.dispatch({
      type: 'insertBlock',
      payload: { flavour: 'test:poll', afterId: firstId },
    }) as CaretResult
  ).blockId;

  return { editor, firstId, pollId };
}

function uiOf(editor: Editor, props: Partial<Parameters<typeof EditorProvider>[0]> = {}) {
  let ui: EditorUIConfig | undefined;

  const Probe = () => {
    ui = useEditorUI();
    return null;
  };

  renderToString(
    <EditorProvider editor={editor} blocks={[pollBlock]} {...props}>
      <Probe />
    </EditorProvider>,
  );

  return ui!;
}

describe('defineBlock', () => {
  it('renders the component with the controller and read-only flag', () => {
    const { editor, pollId } = setup();

    const html = renderToString(
      <EditorProvider editor={editor} blocks={[pollBlock]}>
        <DocumentView />
      </EditorProvider>,
    );

    expect(html).toContain(`data-poll="${pollId}"`);
    expect(html).toContain('data-has-controller="true"');
    expect(html).toContain('data-can-vote="true"');
    expect(html).toContain('data-readonly="false"');

    const readOnly = renderToString(
      <EditorProvider editor={editor} blocks={[pollBlock]} readOnly>
        <DocumentView />
      </EditorProvider>,
    );

    expect(readOnly).toContain('data-readonly="true"');
  });

  it('lets the components prop override the definition component', () => {
    const { editor } = setup();
    const Mine = () => <b data-mine />;
    const html = renderToString(
      <EditorProvider editor={editor} blocks={[pollBlock]} components={{ 'test:poll': Mine }}>
        <DocumentView />
      </EditorProvider>,
    );

    expect(html).toContain('data-mine');
    expect(html).not.toContain('data-poll');
  });

  it('adds slash items of controllers; an app item with the same id wins; false disables the menu', () => {
    const { editor } = setup();

    const item = uiOf(editor).slashItems.find((entry) => entry.id === 'poll');
    expect(item).toMatchObject({ title: 'Poll', flavour: 'test:poll', keywords: ['vote'] });
    expect(item?.icon).toBeTruthy();

    const overridden = uiOf(editor, {
      slashItems: [{ id: 'poll', title: 'My poll', flavour: 'test:poll' }],
    }).slashItems.filter((entry) => entry.id === 'poll');
    expect(overridden).toEqual([{ id: 'poll', title: 'My poll', flavour: 'test:poll' }]);

    expect(uiOf(editor, { slashItems: false }).slashItems).toEqual([]);
  });

  it('puts controller menu items first, only for blocks of its type', () => {
    const { editor, firstId, pollId } = setup();
    const view = new EditorView();
    const t = createTranslator(resolveMessages({}));

    const { actions } = buildBlockActions(editor, view, pollId, [], t);
    expect(actions[0]).toMatchObject({ id: 'poll.vote', title: 'Vote', disabled: false });
    expect(actions[0].icon).toBeTruthy();

    const paragraph = buildBlockActions(editor, view, firstId, [], t);
    expect(paragraph.actions.some((action) => action.id === 'poll.vote')).toBe(false);

    editor.setReadOnly(true);
    expect(buildBlockActions(editor, view, pollId, [], t).actions[0].disabled).toBe(true);
  });

  it('binds controller keys only while the caret is in a block of its type', () => {
    const { editor, firstId, pollId } = setup();
    const { keymap } = uiOf(editor);
    const press = (blockId: string) => {
      const event = {
        key: 'Enter',
        code: 'Enter',
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        preventDefault: () => {},
      } as unknown as KeyboardEvent;
      const context = {
        editor,
        event,
        selection: () => ({
          from: { blockId, offset: 0 },
          to: { blockId, offset: 0 },
          collapsed: true,
        }),
      } as unknown as KeymapContext;

      return handleKeyDown(
        keymap.filter((binding) => binding.id === 'poll.vote'),
        context,
      );
    };

    expect(press(firstId)).toBe(false);
    expect(press(pollId)).toBe(true);
    expect(editor.store.getBlock(pollId)!.props.votes).toBe(1);

    const custom = uiOf(editor, {
      keymap: [{ id: 'poll.vote', keys: 'F2', run: () => true }],
    }).keymap.filter((binding) => binding.id === 'poll.vote');
    expect(custom).toHaveLength(1);
    expect(custom[0].keys).toBe('F2');
  });
});
