import copy
import random
import string
import threading
import time
from poker.game import Player, PokerGame

DEFAULT_CONFIG = {'small_blind': 5, 'big_blind': 10, 'starting_stack': 1000, 'max_players': 10, 'action_timer': 30}

class Room:
    def __init__(self, code, host_id, config):
        self.code=code; self.host_id=host_id; self.config={**DEFAULT_CONFIG, **config}; self.players=[]; self.game=None; self.lock=threading.RLock(); self.last_seen=time.time()
        self.action_history=[]; self.undo_stack=[]; self.redo_stack=[]
    def add(self,p): self.players.append(p); self.last_seen=time.time()
    def public_state(self, viewer_id):
        with self.lock:
            game=self.game
            ps=[]
            for p in self.players:
                ps.append({'id':p.id,'name':p.name,'gender':p.gender,'developers_girlfriend':p.developers_girlfriend,'seat':p.seat,'stack':p.stack,'connected':p.connected,'folded':p.folded,'all_in':p.all_in,'bet':p.street_bet,'hole':[c.label() for c in p.hole] if game and (p.id==viewer_id or game.stage=='showdown') else [None,None]})
            turn_player=game.players[game.turn_index] if game and game.turn_index is not None else None
            return {'code':self.code,'host_id':self.host_id,'players':ps,'stage':game.stage if game else 'waiting','board':[c.label() for c in game.board] if game else [],'pot':game.pot if game else 0,'current_bet':game.current_bet if game else 0,'turn_id':turn_player.id if turn_player else None,'turn_name':turn_player.name if turn_player else None,'winner_ids':list(game.winner_ids) if game else [],'dealer_id':game.players[game.dealer_index].id if game else (self.players[0].id if self.players else None),'last_action':game.last_action if game else '','hand_number':game.hand_number if game else 0,'history':list(self.action_history),'can_undo':bool(self.undo_stack),'can_redo':bool(self.redo_stack),'config':self.config}

class RoomManager:
    def __init__(self,socketio): self.socketio=socketio; self.rooms={}; self.player_room={}; self.player_sid={}; self.lock=threading.RLock()
    def _code(self):
        while True:
            c=''.join(random.choice(string.digits) for _ in range(6))
            if c not in self.rooms: return c
    def _clean_config(self, raw):
        c=dict(DEFAULT_CONFIG)
        try: c['small_blind']=max(1,int(raw.get('small_blind',c['small_blind']))); c['big_blind']=max(c['small_blind']+1,int(raw.get('big_blind',c['big_blind']))); c['starting_stack']=max(c['big_blind'],int(raw.get('starting_stack',c['starting_stack']))); c['max_players']=min(10,max(2,int(raw.get('max_players',c['max_players'])))); c['action_timer']=max(0,int(raw.get('action_timer',c['action_timer'])))
        except (TypeError,ValueError): pass
        return c
    def create_room(self,name,pid,sid=None,config=None,gender='male',developers_girlfriend=False):
        with self.lock:
            code=self._code(); cfg=self._clean_config(config or {}); r=Room(code,pid,cfg); r.add(Player(pid,name,0,stack=cfg['starting_stack'],gender=gender,developers_girlfriend=developers_girlfriend)); self.rooms[code]=r; self.player_room[pid]=code; self.player_sid[pid]=sid; return r
    def join_room(self,code,name,pid,sid=None,gender='male',developers_girlfriend=False):
        with self.lock:
            r=self.rooms.get(code)
            if not r: return 'Room not found.'
            if len(r.players)>=r.config['max_players'] and pid not in self.player_room: return 'Room is full.'
            existing=next((p for p in r.players if p.id==pid),None)
            if existing: existing.connected=True; existing.name=name; existing.gender=gender; existing.developers_girlfriend=developers_girlfriend; self.player_sid[pid]=sid; return r
            if r.game and r.game.stage not in ('waiting','showdown'): return 'A hand is already in progress.'
            seat=max([p.seat for p in r.players],default=-1)+1; p=Player(pid,name,seat,stack=r.config['starting_stack'],gender=gender,developers_girlfriend=developers_girlfriend); r.add(p); self.player_room[pid]=code; self.player_sid[pid]=sid
            if len(r.players) >= r.config['max_players'] and r.game is None:
                r.game=PokerGame(r.players, r.config); r.game.start_hand()
            return r
    def resume_player(self,code,pid,sid=None):
        with self.lock:
            r=self.rooms.get(code)
            if not r: return 'Room not found.'
            if self.player_room.get(pid) != code: return 'Player session is not part of this room.'
            p=next((x for x in r.players if x.id==pid),None)
            if not p: return 'Player session is not part of this room.'
            p.connected=True; self.player_sid[pid]=sid; return r
    def action(self,code,pid,action,amount):
        r=self.rooms.get(code)
        if not r or not r.game: return 'Game not started.'
        with r.lock:
            player=next((p for p in r.players if p.id==pid),None)
            if not player: return 'Player session is not part of this room.'
            stage=r.game.stage
            if action=='fold': label=f'{player.name} folded'
            elif action=='check': label=f'{player.name} checked'
            elif action=='call': label=f'{player.name} called {min(max(0,r.game.current_bet-player.street_bet),player.stack)}'
            elif action=='raise': label=f'{player.name} raised to {amount}'
            elif action=='allin': label=f'{player.name} went all-in'
            else: label=f'{player.name}: {action}'
            snapshot=copy.deepcopy((r.players,r.game,r.action_history))
            error=r.game.act(pid,action,amount)
            if error: return error
            r.undo_stack.append(snapshot)
            if len(r.undo_stack)>100: r.undo_stack.pop(0)
            r.redo_stack.clear()
            r.action_history.append({'street':stage,'label':label})
            if len(r.action_history)>200: r.action_history=r.action_history[-200:]
            return None
    def undo(self,code,pid):
        r=self.rooms.get(code)
        if not r: return 'Room not found.'
        with r.lock:
            if not any(p.id==pid for p in r.players): return 'Player session is not part of this room.'
            if not r.undo_stack: return 'There is no action to undo.'
            r.redo_stack.append(copy.deepcopy((r.players,r.game,r.action_history)))
            r.players,r.game,r.action_history=copy.deepcopy(r.undo_stack.pop())
            return None
    def redo(self,code,pid):
        r=self.rooms.get(code)
        if not r: return 'Room not found.'
        with r.lock:
            if not any(p.id==pid for p in r.players): return 'Player session is not part of this room.'
            if not r.redo_stack: return 'There is no action to redo.'
            r.undo_stack.append(copy.deepcopy((r.players,r.game,r.action_history)))
            r.players,r.game,r.action_history=copy.deepcopy(r.redo_stack.pop())
            return None
    def next_hand(self,code,pid):
        r=self.rooms.get(code)
        if not r: return 'Room not found.'
        with r.lock:
            if not any(p.id==pid for p in r.players): return 'Player session is not part of this room.'
            if not r.game: return 'Game has not started.'
            error=r.game.next_hand()
            if error: return error
            # A new hand starts a fresh action log and cannot undo actions from
            # the hand that has already settled.
            r.action_history.clear(); r.undo_stack.clear(); r.redo_stack.clear()
            return None
    def new_session(self,code,pid):
        with self.lock:
            r=self.rooms.get(code)
            if not r: return 'Room not found.'
            with r.lock:
                if pid != r.host_id: return 'Only the room creator can start a new session.'
                player_ids=[p.id for p in r.players]
                for player_id in player_ids:
                    sid=self.player_sid.get(player_id)
                    if sid: self.socketio.emit('session_closed', {'code':code}, to=sid)
                self.rooms.pop(code,None)
                for player_id in player_ids:
                    self.player_room.pop(player_id,None)
                    self.player_sid.pop(player_id,None)
                return None
    def broadcast_state(self,code):
        r=self.rooms.get(code)
        if not r: return
        for p in r.players:
            sid=self.player_sid.get(p.id)
            if sid: self.socketio.emit('state', r.public_state(p.id), to=sid)
    def mark_disconnected(self,pid):
        code=self.player_room.get(pid); r=self.rooms.get(code) if code else None
        if r:
            with r.lock:
                p=next((x for x in r.players if x.id==pid),None)
                if p: p.connected=False
