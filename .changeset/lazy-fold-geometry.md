---
'@inkbrick/react': patch
---

Drawing many blocks at once is much faster: a block no longer reads its position on screen when it mounts, only when a
folded section actually animates. A 100 × 20 table appears in 0.5 s instead of 3 s.
