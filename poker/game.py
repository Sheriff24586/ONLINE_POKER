from dataclasses import dataclass, field
from .cards import Deck
from .evaluator import best_score, category

STARTING_STACK = 1000
SMALL_BLIND = 10
BIG_BLIND = 20

@dataclass
class Player:
    id: str
    name: str
    seat: int
    stack: int = STARTING_STACK
    connected: bool = True
    folded: bool = False
    all_in: bool = False
    hole: list = field(default_factory=list)
    committed: int = 0
    street_bet: int = 0

class PokerGame:
    def __init__(self, players, config=None):
        self.players = players
        config = config or {}
        self.small_blind = int(config.get('small_blind', SMALL_BLIND))
        self.big_blind = int(config.get('big_blind', BIG_BLIND))
        self.dealer_index = 0
        self.deck = None
        self.board = []
        self.pot = 0
        self.current_bet = 0
        self.turn_index = None
        self.pending_actions = set()
        self.stage = 'waiting'
        self.hand_number = 0
        self.last_action = ''
        self.winner_ids = []

    def active_players(self):
        return [p for p in self.players if not p.folded and (p.stack > 0 or p.all_in)]

    def eligible(self):
        return [p for p in self.players if not p.folded]

    def start_hand(self):
        live = [p for p in self.players if p.stack > 0]
        if len(live) < 2:
            self.stage='game_over'; self.turn_index=None; self.pending_actions.clear(); return
        self.hand_number += 1
        self.deck = Deck(); self.board=[]; self.pot=0; self.current_bet=0; self.last_action=''; self.winner_ids=[]
        for p in self.players:
            p.folded=p.stack <= 0; p.all_in=False; p.committed=0; p.street_bet=0; p.hole=[]
        self.dealer_index %= len(self.players)
        order = self.seat_order_from(self.dealer_index)
        live_order = [p for p in order if p.stack > 0]
        for p in live_order:
            p.hole = self.deck.draw(2)
        if len(live) == 2:
            sb, bb = live_order[0], live_order[1]
        else:
            sb, bb = live_order[1], live_order[2]
        self.post_blind(sb, self.small_blind); self.post_blind(bb, self.big_blind)
        self.current_bet = max(p.street_bet for p in self.players)
        self.pot = sum(p.committed for p in self.players)
        self.stage='preflop'
        self.pending_actions = {p.id for p in self.players if not p.folded and not p.all_in and p.stack > 0}
        self.turn_index = self.next_action_index(self.players.index(bb))
        self.ensure_turn()

    def seat_order_from(self, idx):
        return [self.players[(idx+i)%len(self.players)] for i in range(len(self.players))]

    def post_blind(self,p,amount):
        put=min(amount,p.stack); p.stack-=put; p.committed+=put; p.street_bet+=put
        if p.stack==0: p.all_in=True

    def next_action_index(self, idx):
        for step in range(1,len(self.players)+1):
            j=(idx+step)%len(self.players); p=self.players[j]
            if not p.folded and not p.all_in and p.stack>0: return j
        return None

    def next_pending_index(self, idx):
        for step in range(1,len(self.players)+1):
            j=(idx+step)%len(self.players); p=self.players[j]
            if p.id in self.pending_actions and not p.folded and not p.all_in and p.stack>0: return j
        return None

    def ensure_turn(self):
        if self.turn_index is not None: return
        self.advance_street()

    def advance_street(self):
        self.pot = sum(p.committed for p in self.players)
        for p in self.players: p.street_bet=0
        self.current_bet=0
        if self.stage=='preflop': self.board += self.deck.draw(3); self.stage='flop'
        elif self.stage=='flop': self.board.append(self.deck.draw()); self.stage='turn'
        elif self.stage=='turn': self.board.append(self.deck.draw()); self.stage='river'
        elif self.stage=='river': return self.showdown()
        candidates=[i for i,p in enumerate(self.players) if not p.folded and not p.all_in and p.stack>0]
        if candidates:
            self.pending_actions = {self.players[i].id for i in candidates}
            live_count = sum(not p.folded for p in self.players)
            first_after = self.dealer_index - (1 if live_count == 2 else 0)
            self.turn_index=self.next_pending_index(first_after)
        else: self.showdown()

    def act(self, player_id, action, amount=None):
        if self.stage in ('waiting','game_over','showdown'): return 'Game is not accepting actions.'
        p=self.players[self.turn_index] if self.turn_index is not None else None
        if not p or p.id != player_id: return 'It is not your turn.'
        to_call=max(0,self.current_bet-p.street_bet)
        raised = False
        if action=='fold': p.folded=True; self.last_action=f'{p.name} folded'
        elif action=='check':
            if to_call: return 'You cannot check; you must call or fold.'
            self.last_action=f'{p.name} checked'
        elif action=='call':
            put=min(to_call,p.stack); p.stack-=put; p.street_bet+=put; p.committed+=put
            if p.stack==0: p.all_in=True
            self.last_action=f'{p.name} called {put}'
        elif action=='raise':
            try: target=int(amount)
            except: return 'Enter a valid raise amount.'
            if target <= self.current_bet: return 'Raise must be greater than the current bet.'
            required=target-p.street_bet
            if required<=0 or required>p.stack: return 'Raise amount is outside your available stack.'
            p.stack-=required; p.street_bet=target; p.committed+=required; self.current_bet=target
            if p.stack==0: p.all_in=True
            raised = True
            self.last_action=f'{p.name} raised to {target}'
        elif action=='allin':
            target=p.street_bet+p.stack; raised = target > self.current_bet; p.committed+=p.stack; p.street_bet=target; p.stack=0; p.all_in=True
            if target>self.current_bet: self.current_bet=target
            self.last_action=f'{p.name} went all-in'
        else: return 'Unknown action.'
        self.pot = sum(x.committed for x in self.players)
        if len([x for x in self.players if not x.folded])==1: return self.showdown()
        self.pending_actions.discard(p.id)
        if raised:
            self.pending_actions = {x.id for x in self.players if x is not p and not x.folded and not x.all_in and x.stack > 0}
        if not self.pending_actions:
            self.advance_street()
        else:
            self.turn_index=self.next_pending_index(self.players.index(p))
        return None

    def showdown(self):
        self.pot=sum(p.committed for p in self.players)
        while len(self.board) < 5: self.board.append(self.deck.draw())
        eligible=[p for p in self.players if not p.folded]
        if not eligible: self.stage='showdown'; self.turn_index=None; self.winner_ids=[]; return None
        scores={p.id:best_score(p.hole+self.board) for p in eligible}
        # Build layered side pots from each player's total commitment.
        levels=sorted({p.committed for p in self.players if p.committed>0})
        paid_to=set()
        prev=0
        for level in levels:
            layer=max(0,level-prev)
            contributors=[p for p in self.players if p.committed>=level]
            amount=layer*len(contributors)
            contenders=[p for p in contributors if not p.folded]
            if amount and contenders:
                best=max(scores[p.id] for p in contenders)
                winners=[p for p in contenders if scores[p.id]==best]
                paid_to.update(w.id for w in winners)
                share,rem=divmod(amount,len(winners))
                for i,w in enumerate(winners): w.stack += share + (1 if i<rem else 0)
            prev=level
        best=max(scores.values())
        winners=[p for p in eligible if p.id in paid_to] or [p for p in eligible if scores[p.id]==best]
        self.winner_ids=[p.id for p in winners]
        self.last_action='Winner: '+', '.join(w.name for w in winners)+' — '+category(best)
        self.stage='showdown'; self.turn_index=None
        return None

    def next_hand(self):
        if self.stage != 'showdown': return 'Finish the current hand first.'
        if sum(p.stack>0 for p in self.players)<2: self.stage='game_over'; return None
        for step in range(1, len(self.players) + 1):
            next_index = (self.dealer_index + step) % len(self.players)
            if self.players[next_index].stack > 0:
                self.dealer_index = next_index
                break
        self.start_hand(); return None
