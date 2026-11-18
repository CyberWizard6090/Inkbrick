# @inkbrick/styles

Default styles of [Inkbrick](https://github.com/CyberWizard6090/Inkbrick): design tokens, light and dark themes, block
and UI styles.

```bash
npm install @inkbrick/styles
```

```ts
import '@inkbrick/styles';
```

Or only the parts you need: `@inkbrick/styles/tokens.css`, `base.css`, `blocks.css`, `ui.css`.

- **Your rules win without `!important`:** every rule sits in `@layer inkbrick.*` and inside `:where()` (specificity
  0).
- **Stable hooks:** styles target `data-inkbrick-*` attributes (`data-inkbrick-block`, `data-inkbrick-part`,
  `data-inkbrick-ui`, `data-state`…), not class names.
- **Tokens:** colors, fonts, spacing, radii and shadows are CSS variables (`--inkbrick-*`); override any of them.
- **Themes:** follows `prefers-color-scheme`; `data-inkbrick-theme="light"` or `"dark"` on any element (including
  `<html>`) forces a theme for everything inside it.

## License

MIT
