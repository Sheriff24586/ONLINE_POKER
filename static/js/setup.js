const socket = io();
const form = document.querySelector('#setup-form');
const error = document.querySelector('#setup-error');
function fail(message){ error.textContent = message || 'Something went wrong.'; }

socket.on('connect_error', () => fail('Unable to connect to the game server.'));
socket.on('room_created', d => {
  sessionStorage.setItem('poker_id', d.player_id);
  sessionStorage.setItem('poker_code', d.code);
  sessionStorage.setItem('poker_name', window.PLAYER_NAME || 'Player');
  location.href = '/room/' + d.code;
});
socket.on('error_message', d => fail(d.message));

form.addEventListener('submit', e => {
  e.preventDefault();
  error.textContent = '';
  const small = Number(document.querySelector('#small_blind').value);
  const big = Number(document.querySelector('#big_blind').value);
  const stack = Number(document.querySelector('#starting_stack').value);
  const maxPlayers = Number(document.querySelector('#max_players').value);
  const timer = Number(document.querySelector('#action_timer').value);
  if (!window.PLAYER_NAME) return fail('Your player name is missing. Go back and enter a name.');
  if (!Number.isInteger(small) || small < 1) return fail('Small blind must be at least 1.');
  if (!Number.isInteger(big) || big <= small) return fail('Big blind must be greater than the small blind.');
  if (!Number.isInteger(stack) || stack < big) return fail('Starting stack must be at least the big blind.');
  socket.emit('create_room', {name: window.PLAYER_NAME, config: {small_blind: small, big_blind: big, starting_stack: stack, max_players: maxPlayers, action_timer: timer}});
});
