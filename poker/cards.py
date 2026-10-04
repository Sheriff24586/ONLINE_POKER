import random
from dataclasses import dataclass

RANKS = '23456789TJQKA'
SUITS = 'cdhs'

@dataclass(frozen=True)
class Card:
    rank: str
    suit: str
    def label(self):
        return self.rank + self.suit

class Deck:
    def __init__(self):
        self.cards = [Card(r, s) for s in SUITS for r in RANKS]
        random.shuffle(self.cards)
    def draw(self, n=1):
        if n == 1:
            return self.cards.pop()
        return [self.cards.pop() for _ in range(n)]
