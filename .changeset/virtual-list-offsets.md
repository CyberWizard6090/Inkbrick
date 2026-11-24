---
'@inkbrick/react': patch
---

The windowed renderer of large documents does less work per edit: it finds remeasured blocks by their last position
instead of searching all 50 000, recomputes block offsets only from the first changed block, and skips the window
recalculation when a remeasure changed nothing.
