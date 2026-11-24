---
'@inkbrick/document': patch
---

`fromMarkdown` no longer slows down on paragraphs with thousands of unclosed links (`[a](` repeated): the end of a link
address is found once per paragraph instead of being searched again from every bracket (50 000 brackets: 4 s → 40 ms).
