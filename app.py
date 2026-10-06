import os
import uuid
from flask import Flask, render_template, session, request
from flask_socketio import SocketIO, emit, join_room, leave_room as socket_leave_room
from server.rooms import RoomManager

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret-change-me')
socketio = SocketIO(app, cors_allowed_origins='*', async_mode='threading')
rooms = RoomManager(socketio)

@app.get('/')
def index():
    return render_template('index.html')

@app.get('/setup')
def setup_page():
    return render_template('setup.html', player_name=request.args.get('name', '').strip()[:20])

@app.get('/room/<code>')
def room_page(code):
    return render_template('waiting.html', room_code=code.upper())

@app.get('/game/<code>')
def game_page(code):
    return render_template('game.html', room_code=code.upper())

@socketio.on('create_room')
def create_room(data):
    data = data or {}
    name = str(data.get('name', '')).strip()[:20]
    gender = str(data.get('gender', '')).strip().lower()
    special_name = name.casefold() in ('manomita', 'diya')
    developers_girlfriend = data.get('developers_girlfriend') is True and special_name and gender == 'female'
    config = data.get('config') or {}
    if not name:
        return emit('error_message', {'message': 'Enter a player name.'})
    if gender not in ('male', 'female'):
        return emit('error_message', {'message': 'Choose Male or Female for your avatar.'})
    player_id = str(uuid.uuid4())
    session['player_id'] = player_id
    room = rooms.create_room(name, player_id, request.sid, config, gender, developers_girlfriend)
    join_room(room.code)
    emit('room_created', {'code': room.code, 'player_id': player_id})
    emit('state', room.public_state(player_id), to=room.code)

@socketio.on('join_room')
def join_existing(data):
    data = data or {}
    name = str(data.get('name', '')).strip()[:20]
    gender = str(data.get('gender', '')).strip().lower()
    special_name = name.casefold() in ('manomita', 'diya')
    developers_girlfriend = data.get('developers_girlfriend') is True and special_name and gender == 'female'
    code = str(data.get('code', '')).strip().upper()
    if not name or len(code) != 6 or gender not in ('male', 'female'):
        return emit('error_message', {'message': 'Enter a name, choose Male or Female, and enter a six-digit room code.'})
    player_id = session.get('player_id')
    # A socket session cookie may outlive an explicit EXIT. Reuse it only when
    # the server still recognizes this player as a member of this room.
    if not player_id or rooms.player_room.get(player_id) != code:
        player_id = str(uuid.uuid4())
    session['player_id'] = player_id
    result = rooms.join_room(code, name, player_id, request.sid, gender, developers_girlfriend)
    if isinstance(result, str):
        return emit('error_message', {'message': result})
    join_room(code)
    emit('joined', {'code': code, 'player_id': player_id})
    rooms.broadcast_state(code)

@socketio.on('resume_room')
def resume_room(data):
    data = data or {}
    code = str(data.get('code', '')).upper()
    # Socket.IO event sessions are not written back to the browser's Flask
    # session cookie. The client therefore supplies its saved player ID when
    # opening a new socket, and RoomManager verifies that it belongs to code.
    player_id = session.get('player_id') or data.get('player_id')
    if not isinstance(player_id, str) or not player_id:
        return emit('error_message', {'message': 'Your player session has expired. Return to the lobby.'})
    room = rooms.resume_player(code, player_id, request.sid)
    if isinstance(room, str):
        return emit('error_message', {'message': room})
    session['player_id'] = player_id
    join_room(code)
    emit('resumed', {'code': code, 'player_id': player_id, 'stage': room.game.stage if room.game else 'waiting'})
    rooms.broadcast_state(code)

@socketio.on('action')
def action(data):
    player_id = session.get('player_id')
    data = data or {}
    code = str(data.get('code', '')).upper()
    msg = rooms.action(code, player_id, data.get('action'), data.get('amount'))
    if msg:
        return emit('error_message', {'message': msg})
    rooms.broadcast_state(code)

@socketio.on('undo_action')
def undo_action(data):
    data = data or {}
    code = str(data.get('code', '')).upper()
    msg = rooms.undo(code, session.get('player_id'))
    if msg:
        return emit('error_message', {'message': msg})
    rooms.broadcast_state(code)

@socketio.on('redo_action')
def redo_action(data):
    data = data or {}
    code = str(data.get('code', '')).upper()
    msg = rooms.redo(code, session.get('player_id'))
    if msg:
        return emit('error_message', {'message': msg})
    rooms.broadcast_state(code)

@socketio.on('next_hand')
def next_hand(data):
    data = data or {}
    code = str(data.get('code', '')).upper()
    msg = rooms.next_hand(code, session.get('player_id'))
    if msg:
        return emit('error_message', {'message': msg})
    rooms.broadcast_state(code)

@socketio.on('new_session')
def new_session(data):
    data = data or {}
    code = str(data.get('code', '')).upper()
    msg = rooms.new_session(code, session.get('player_id'))
    if msg:
        return emit('error_message', {'message': msg})

@socketio.on('leave_room')
def leave_current_room(data):
    data = data or {}
    code = str(data.get('code', '')).upper()
    player_id = session.get('player_id') or data.get('player_id')
    if not isinstance(player_id, str) or not player_id:
        return emit('error_message', {'message': 'Your player session has expired. Return to the lobby.'})
    msg = rooms.leave_room(code, player_id)
    if msg:
        return emit('error_message', {'message': msg})
    session.pop('player_id', None)
    socket_leave_room(code)
    emit('left_room', {'code': code})
    rooms.broadcast_state(code)

@socketio.on('disconnect')
def disconnected():
    player_id = session.get('player_id')
    if player_id:
        rooms.mark_disconnected(player_id)

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=int(os.environ.get('PORT', 5000)), debug=True)
