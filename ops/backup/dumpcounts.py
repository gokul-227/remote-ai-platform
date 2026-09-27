"""Row count per public table, read from `pg_restore --data-only --file=-` on stdin.

Counting the dump (not the live database) keeps the expected counts in the same
snapshot as the data. COPY text format writes one line per row (embedded
newlines are escaped), and every table has a COPY block, even when empty.
"""

import re
import sys

COPY = re.compile(r'^COPY public\.("?)(.+?)\1 (?:\(.*\) )?FROM stdin;$')

counts: dict[str, int] = {}
table = None
for line in sys.stdin:
    line = line.rstrip("\n")
    if table is None:
        m = COPY.match(line)
        if m:
            table = m.group(2).replace('""', '"')
            counts[table] = 0
    elif line == "\\.":
        table = None
    else:
        counts[table] += 1
for name in sorted(counts):
    print(f"{name}\t{counts[name]}")
