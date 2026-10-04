const socket = io();
const code = window.ROOM_CODE;
let previousHandNumber = null;
let previousBoardCount = 0;
let latestState = null;
const esc = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

socket.on('connect', () => socket.emit('resume_room', {
  code,
  player_id: sessionStorage.getItem('poker_id')
}));

function render(state) {
  latestState = state;
  document.querySelector('#pot').textContent = `POT ${state.pot}`;
  const sameHand = previousHandNumber === state.hand_number;
  const newHandStarted = state.hand_number > 0 && (previousHandNumber === null
    ? state.stage === 'preflop'
    : state.hand_number !== previousHandNumber);
  const dealtNewCards = sameHand && state.board.length > previousBoardCount;
  document.querySelector('#board').innerHTML = state.board.map((value, index) => renderCard(
    value,
    dealtNewCards && index >= previousBoardCount,
    Math.max(0, index - previousBoardCount) * 130
  )).join('');
  previousHandNumber = state.hand_number;
  previousBoardCount = state.board.length;
  document.querySelector('#stage').textContent = state.stage.toUpperCase();
  document.querySelector('#current-bet').textContent = state.current_bet;
  document.querySelector('#turn').textContent = state.turn_name || 'No action pending';
  document.querySelector('#status').textContent = state.last_action || `Stage: ${state.stage.toUpperCase()}`;
  document.querySelector('#players').textContent = `${state.players.length}/10 players`;
  document.querySelector('#actions').classList.toggle(
    'hidden', !(state.stage !== 'waiting' && state.stage !== 'showdown' && state.turn_id === getId())
  );
  updateActionButtons();
  document.querySelector('#newHandBtn').classList.toggle('hidden', state.stage !== 'showdown');
  document.querySelector('#newSessionBtn').classList.toggle('hidden', state.host_id !== getId());

  const seats = document.querySelector('#seats');
  seats.innerHTML = '';
  const winnerIds = new Set(state.stage === 'showdown' ? (state.winner_ids || []) : []);
  const settled = state.stage === 'showdown' && winnerIds.size > 0;
  state.players.forEach((player, index) => {
    const seat = document.createElement('div');
    const winner = winnerIds.has(player.id);
    const stateClass = player.id === state.turn_id ? ' active' : winner ? ' winner' : settled ? ' loser' : '';
    seat.className = `seat seat${index}${stateClass}`;
    seat.innerHTML = `<div class="player-avatar" style="--avatar-hue:${(index * 47 + 24) % 360}" aria-hidden="true"><span class="avatar-head"></span><span class="avatar-neck"></span><span class="avatar-body"></span><span class="avatar-collar"></span></div>
      <div class="seat-info">
        <div class="name">${esc(player.name)}${player.id === state.dealer_id ? ' <i>D</i>' : ''}</div>
        <div class="stack">STACK ${player.stack}</div>
        <div class="bet">BET ${player.bet}${player.all_in ? ' · ALL-IN' : ''}${player.folded ? ' · FOLDED' : ''}</div>
      <div class="cards">${player.hole.map((value, cardIndex) => renderHoleCard(
        value,
        newHandStarted,
        800 + (cardIndex * state.players.length + index) * 90
      )).join('')}</div>
      </div>`;
    seats.appendChild(seat);
  });
  if (newHandStarted) animateNewHand();

  const history = document.querySelector('#actionHistory');
  history.replaceChildren();
  (state.history || []).forEach(entry => {
    const item = document.createElement('li');
    const street = document.createElement('span');
    street.className = 'history-street';
    street.textContent = entry.street.toUpperCase();
    const label = document.createElement('span');
    label.textContent = entry.label;
    item.append(street, label);
    history.appendChild(item);
  });
  history.scrollTop = history.scrollHeight;
  document.querySelector('#undoBtn').disabled = !state.can_undo;
  document.querySelector('#redoBtn').disabled = !state.can_redo;
}

function updateActionButtons() {
  const activeStage = latestState && ['preflop', 'flop', 'turn', 'river'].includes(latestState.stage);
  const isMyTurn = Boolean(activeStage && latestState.turn_id === getId());
  const player = latestState && latestState.players.find(item => item.id === getId());
  const currentBet = Number(latestState && latestState.current_bet) || 0;
  const playerBet = Number(player && player.bet) || 0;
  const stack = Number(player && player.stack) || 0;
  const toCall = Math.max(0, currentBet - playerBet);
  const maxTarget = playerBet + stack;

  document.querySelector('[data-action="fold"]').disabled = !isMyTurn;
  document.querySelector('[data-action="check"]').disabled = !isMyTurn || toCall > 0;
  document.querySelector('[data-action="call"]').disabled = !isMyTurn || toCall <= 0;
  document.querySelector('[data-action="allin"]').disabled = !isMyTurn || stack <= 0;

  const raiseInput = document.querySelector('#raise');
  const raiseButton = document.querySelector('#raiseBtn');
  const canRaise = isMyTurn && stack > 0 && maxTarget > currentBet;
  raiseInput.disabled = !canRaise;
  if (canRaise) {
    raiseInput.min = String(currentBet + 1);
    raiseInput.max = String(maxTarget);
  } else {
    raiseInput.removeAttribute('min');
    raiseInput.removeAttribute('max');
  }
  const target = Number(raiseInput.value);
  raiseButton.disabled = !canRaise || !Number.isInteger(target) || target <= currentBet || target > maxTarget;
}

function cardParts(value) {
  const rank = value[0] === 'T' ? '10' : value[0];
  const suit = {c: '♣', d: '♦', h: '♥', s: '♠'}[value[1]];
  const color = value[1] === 'd' || value[1] === 'h' ? 'red' : 'black';
  return {rank, suit, color};
}

function renderCard(value, animate = false, delay = 0) {
  const {rank, suit, color} = cardParts(value);
  const classes = `card ${color}${animate ? ' card-dealt' : ''}`;
  const style = animate ? ` style="animation-delay:${delay}ms"` : '';
  return `<span class="${classes}"${style}><span class="card-corner">${rank}<small>${suit}</small></span><span class="card-pip">${suit}</span><span class="card-corner card-corner-bottom">${rank}<small>${suit}</small></span></span>`;
}

function renderMiniCard(value) {
  const {rank, suit, color} = cardParts(value);
  return `<span class="mini-card ${color}">${rank}<small>${suit}</small></span>`;
}

function renderHoleCard(value, animate, delay) {
  const dealClass = animate ? ' hole-deal' : '';
  const dealAttrs = animate ? ` data-hole-deal="true" style="animation-delay:${delay}ms"` : '';
  if (!value) return `<span class="mini-card card-back${dealClass}"${dealAttrs}>🂠</span>`;
  const {rank, suit, color} = cardParts(value);
  return `<span class="mini-card ${color}${dealClass}"${dealAttrs}>${rank}<small>${suit}</small></span>`;
}

function animateNewHand() {
  const overlay = document.querySelector('#dealOverlay');
  overlay.classList.add('hidden');
  overlay.classList.remove('shuffling');
  void overlay.offsetWidth;
  overlay.classList.remove('hidden');
  overlay.classList.add('shuffling');
  window.setTimeout(() => {
    overlay.classList.add('hidden');
    overlay.classList.remove('shuffling');
  }, 1050);

  window.requestAnimationFrame(() => {
    const felt = document.querySelector('.felt').getBoundingClientRect();
    const deckX = felt.left + felt.width / 2;
    const deckY = felt.top + felt.height / 2;
    document.querySelectorAll('[data-hole-deal="true"]').forEach(card => {
      const rect = card.getBoundingClientRect();
      card.style.setProperty('--deal-x', `${deckX - (rect.left + rect.width / 2)}px`);
      card.style.setProperty('--deal-y', `${deckY - (rect.top + rect.height / 2)}px`);
    });
  });
}

function getId() {
  return sessionStorage.getItem('poker_id') || '';
}

socket.on('resumed', data => sessionStorage.setItem('poker_id', data.player_id));
socket.on('state', render);
socket.on('error_message', data => alert(data.message));
socket.on('session_closed', () => {
  sessionStorage.removeItem('poker_id');
  sessionStorage.removeItem('poker_code');
  location.href = '/';
});

document.querySelectorAll('[data-action]').forEach(button => {
  button.onclick = () => socket.emit('action', {code, action: button.dataset.action});
});
document.querySelector('#raiseBtn').onclick = () => socket.emit('action', {
  code,
  action: 'raise',
  amount: document.querySelector('#raise').value
});
document.querySelector('#raise').addEventListener('input', updateActionButtons);
document.querySelector('#undoBtn').onclick = () => socket.emit('undo_action', {code});
document.querySelector('#redoBtn').onclick = () => socket.emit('redo_action', {code});
document.querySelector('#newHandBtn').onclick = () => socket.emit('next_hand', {code});
document.querySelector('#newSessionBtn').onclick = () => {
  if (confirm('End this session for everyone and return all players to the lobby?')) {
    socket.emit('new_session', {code});
  }
};
