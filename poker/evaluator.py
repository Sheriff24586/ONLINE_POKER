from itertools import combinations
from collections import Counter
from .cards import RANKS

VALUES = {r:i+2 for i,r in enumerate(RANKS)}

def five_score(cards):
    vals = sorted((VALUES[c.rank] for c in cards), reverse=True)
    counts = Counter(vals)
    groups = sorted(((n,v) for v,n in counts.items()), reverse=True)
    unique = sorted(set(vals), reverse=True)
    if 14 in unique: unique.append(1)
    straight_high = next((unique[i] for i in range(len(unique)-4) if unique[i]-unique[i+4] == 4), None)
    flush = len({c.suit for c in cards}) == 1
    if flush and straight_high: return (8, straight_high)
    quads = [v for v,n in counts.items() if n == 4]
    if quads: return (7, max(quads), max(v for v in vals if v != max(quads)))
    trips = sorted([v for v,n in counts.items() if n == 3], reverse=True)
    pairs = sorted([v for v,n in counts.items() if n == 2], reverse=True)
    if trips and (pairs or len(trips) > 1): return (6, trips[0], max(pairs + trips[1:]))
    if flush: return (5, *vals)
    if straight_high: return (4, straight_high)
    if trips: return (3, trips[0], *sorted([v for v in vals if v != trips[0]], reverse=True))
    if len(pairs) >= 2:
        p1,p2 = pairs[:2]; kicker = max(v for v in vals if v not in (p1,p2)); return (2,p1,p2,kicker)
    if len(pairs) == 1:
        p = pairs[0]; return (1,p,*sorted([v for v in vals if v != p], reverse=True))
    return (0,*vals)

def best_score(cards):
    return max(five_score(combo) for combo in combinations(cards, 5))

def category(score):
    return ['High Card','Pair','Two Pair','Three of a Kind','Straight','Flush','Full House','Four of a Kind','Straight Flush'][score[0]]
