---
'@inkbrick/document': patch
'@inkbrick/engine': patch
---

Inserting, removing and moving blocks in a long list copies its child list once instead of two or three times, and
`moveBlock` no longer builds a copy of the siblings to find its place: 2 000 moves in a document of 10 000 blocks take
0.5 s instead of 1.6 s.
