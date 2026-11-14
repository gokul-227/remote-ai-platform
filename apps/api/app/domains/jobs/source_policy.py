"""Source redistribution boundaries, verified against official API terms.

Remotive/Himalayas prohibit Google Jobs syndication; Adzuna/Working Nomads
need explicit redistribution permission before use. Keep all four out of
search notifications and our indexable sitemap pending a policy review.
"""

SEARCH_SYNDICATION_BLOCKED_SOURCES = frozenset({"REMOTIVE", "HIMALAYAS", "WORKINGNOMADS", "ADZUNA"})
