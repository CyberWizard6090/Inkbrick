// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';

import { Editor } from '@inkbrick/engine';

import { DocumentView, EditorProvider } from '../src';
import { BlockHandleController } from '../src/block-handle/BlockHandleController';
import { ToolbarController } from '../src/toolbar/ToolbarController';

const range = {
  from: { blockId: 'a', offset: 0 },
  to: { blockId: 'a', offset: 3 },
  collapsed: false,
};
const formats = { bold: false, italic: false, underline: false, strike: false, code: false };

describe('ToolbarController', () => {
  it('shows, avoids redundant notifications, opens the link field and hides', () => {
    const c = new ToolbarController();
    let notified = 0;
    c.subscribe(() => notified++);

    c.show(range, formats, { x: 10, y: 20 });
    expect(c.getState()).toMatchObject({ visible: true, linkOpen: false });
    expect(notified).toBe(1);

    c.show(range, { ...formats }, { x: 10, y: 20 }); // то же самое — без уведомления
    expect(notified).toBe(1);

    c.show(range, { ...formats, bold: true }, { x: 10, y: 20 });
    expect(notified).toBe(2);

    c.openLink();
    expect(c.getState().linkOpen).toBe(true);
    c.closeLink();
    expect(c.getState().linkOpen).toBe(false);

    c.hide();
    expect(c.getState().visible).toBe(false);
    c.openLink(); // скрыт — игнорируется
    expect(c.getState().linkOpen).toBe(false);
  });
});

describe('BlockHandleController', () => {
  it('tracks hover, menu and a drag, ignoring updates when idle', () => {
    const c = new BlockHandleController();
    let notified = 0;
    c.subscribe(() => notified++);

    c.setHover({ blockId: 'a', x: 1, y: 2 });
    c.setHover({ blockId: 'a', x: 1, y: 2 }); // без изменений
    expect(notified).toBe(1);

    c.updateDrag({ targetId: 'b' }); // нет перетаскивания — игнорируется
    expect(c.getState().drag).toBeNull();

    c.openMenu({ blockId: 'a', x: 1, y: 2 });
    c.startDrag('a'); // начало переноса закрывает меню
    expect(c.getState().menu).toBeNull();
    expect(c.getState().drag).toMatchObject({ blockId: 'a', targetId: null });

    c.updateDrag({ targetId: 'b', position: 'after', indicator: { left: 0, top: 5, width: 100 } });
    const before = c.getState();
    c.updateDrag({ targetId: 'b', position: 'after', indicator: { left: 0, top: 5, width: 100 } });
    expect(c.getState()).toBe(before);

    c.endDrag();
    expect(c.getState().drag).toBeNull();
  });
});

describe('server rendering', () => {
  it('renders no floating UI (toolbar, handles, menus) until the user interacts', () => {
    const html = renderToString(
      <EditorProvider editor={new Editor()}>
        <DocumentView />
      </EditorProvider>,
    );

    expect(html).not.toContain('inkbrick-toolbar');
    expect(html).not.toContain('inkbrick-block-handle');
    expect(html).not.toContain('inkbrick-block-menu');
    expect(html).not.toContain('inkbrick-slash-menu');
  });
});
