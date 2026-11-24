---
'@inkbrick/engine': minor
'@inkbrick/react': minor
---

More editing logic works without a UI, in `@inkbrick/engine`: find and replace (`findMatches`, `replaceMatches`,
`searchPattern`), the blocks hidden by folded headings (`computeFolds`), the footnote number index, the Markdown rules applied
while typing (`**bold**`, `[link](url)`), Delete at the end of a block (new command `deleteForward`) and clearing the text of a
range of table cells (table command `clearTableCellsText`). `@inkbrick/react` uses them and re-exports what it exported before.
