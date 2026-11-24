---
'@inkbrick/store': minor
'@inkbrick/engine': patch
---

Large batches are much faster: inside `editor.batch` each command now normalizes only the blocks it changed, not every
block changed earlier in the batch (that made a batch quadratic). Pasting 5 000 lines of text takes 0.5 s instead of
6 s. New `Transaction.getChangedBlocksSince(mark)`; an `AfterCommand` hook receives `since`, the index of the
command's first change.
