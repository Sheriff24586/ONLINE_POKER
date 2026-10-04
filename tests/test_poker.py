from poker.cards import Card
from poker.evaluator import best_score
from poker.game import Player, PokerGame

def P(i): return Player(str(i),f'P{i}',i)

def test_straight_flush_beats_four_kind():
    sf=[Card('A','s'),Card('K','s'),Card('Q','s'),Card('J','s'),Card('T','s'),Card('2','c'),Card('3','d')]
    fk=[Card('A','c'),Card('A','d'),Card('A','h'),Card('A','s'),Card('K','c'),Card('2','d'),Card('3','d')]
    assert best_score(sf)>best_score(fk)

def test_custom_raise_rule_allows_one_chip_more():
    ps=[P(1),P(2),P(3)]; g=PokerGame(ps); g.start_hand()
    actor=ps[g.turn_index]; target=g.current_bet+1
    assert g.act(actor.id,'raise',target) is None
    assert g.current_bet==target

def test_raise_cannot_equal_current_bet():
    ps=[P(1),P(2),P(3)]; g=PokerGame(ps); g.start_hand(); actor=ps[g.turn_index]
    assert 'greater' in g.act(actor.id,'raise',g.current_bet)

def test_all_in_updates_stack():
    ps=[P(1),P(2)]; g=PokerGame(ps); g.start_hand(); actor=ps[g.turn_index]
    assert g.act(actor.id,'allin') is None or g.stage in ('showdown','river','turn','flop')
    assert actor.stack==0 and actor.all_in

def test_custom_setup_blinds_and_stack_are_used():
    ps=[Player('1','P1',0), Player('2','P2',1), Player('3','P3',2)]
    g=PokerGame(ps, {'small_blind':5,'big_blind':15,'starting_stack':500})
    for p in ps: p.stack=500
    g.start_hand()
    assert g.current_bet == 15
    assert sum(p.committed for p in ps) == 20
