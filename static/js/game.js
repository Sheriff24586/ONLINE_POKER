const socket = io();
const code = window.ROOM_CODE;
let previousHandNumber = null;
let previousBoardCount = 0;
let latestState = null;
let previousVisualState = null;
let potPaidHandNumber = null;
const esc = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

socket.on('connect', () => socket.emit('resume_room', {
  code,
  player_id: sessionStorage.getItem('poker_id')
}));

function render(state) {
  const priorVisualState = previousVisualState;
  const chipContributions = getChipContributions(priorVisualState, state);
  const potAward = shouldAnimatePotAward(priorVisualState, state);
  const actionSound = getActionSound(priorVisualState, state);
  latestState = state;
  document.querySelector('#pot').textContent = potPaidHandNumber === state.hand_number && state.stage === 'showdown'
    ? 'POT PAID'
    : `POT ${state.pot}`;
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
  const viewerIndex = state.players.findIndex(player => player.id === getId());
  const orderedPlayers = viewerIndex < 0
    ? state.players
    : [...state.players.slice(viewerIndex), ...state.players.slice(0, viewerIndex)];
  orderedPlayers.forEach((player, seatIndex) => {
    const index = state.players.indexOf(player);
    const seat = document.createElement('div');
    const winner = winnerIds.has(player.id);
    const stateClass = player.id === state.turn_id ? ' active' : winner ? ' winner' : settled ? ' loser' : '';
    seat.className = `seat seat${seatIndex}${player.id === getId() ? ' seat-self' : ''}${stateClass}`;
    const position = seatPosition(seatIndex, orderedPlayers.length);
    const chipSide = 'chips-right';
    seat.dataset.playerId = player.id;
    seat.style.left = `${position.left}%`;
    seat.style.top = `${position.top}%`;
    const gender = player.gender === 'female' ? 'female' : 'male';
    const isDevelopersGirlfriend = player.developers_girlfriend === true;
    if (isDevelopersGirlfriend) seat.classList.add('special-girlfriend');
    const avatar = isDevelopersGirlfriend
      ? '<div class="player-avatar special-girlfriend"><img src="/static/images/developers-girlfriend.webp" alt=""></div>'
      : `<div class="player-avatar ${gender}" style="--avatar-hue:${gender === 'female' ? 338 : (index * 47 + 24) % 360}" aria-hidden="true"><span class="avatar-head"></span><span class="avatar-neck"></span><span class="avatar-body"></span><span class="avatar-collar"></span><span class="avatar-eyes"></span><span class="avatar-nose"></span></div>`;
    const specialTitle = isDevelopersGirlfriend ? '<div class="girlfriend-title">DEVELOPER\'S<br>GIRLFRIEND</div>' : '';
    seat.innerHTML = `${renderChipStack(chipSide)}${avatar}
      <div class="seat-info">
        ${specialTitle}
        <div class="name">${esc(player.name)}${player.id === state.dealer_id ? ' <i>D</i>' : ''}</div>
        <div class="stack">STACK ${player.stack}</div>
        <div class="bet">BET ${player.bet}${player.all_in ? ' · ALL-IN' : ''}${player.folded ? ' · FOLDED' : ''}</div>
      <div class="cards">${player.hole.map((value, cardIndex) => renderHoleCard(
        value,
        newHandStarted,
        250 + (cardIndex * state.players.length + index) * 105
      )).join('')}</div>
      </div>`;
    seats.appendChild(seat);
  });
  if (newHandStarted) animateNewHand();
  else if (dealtNewCards) animateCommunityDeal();
  if (chipContributions.length) animateChipContributions(chipContributions);
  if (potAward) animatePotAward(priorVisualState, state);
  if (actionSound) playActionSound(actionSound);

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
  previousVisualState = snapshotVisualState(state);
}

function seatPosition(seatIndex, playerCount) {
  if (seatIndex === 0) return {left: 50, top: 87};
  const opponents = playerCount - 1;
  const spread = opponents > 1 ? (seatIndex - 1) / (opponents - 1) : 0.5;
  const angle = (140 + 260 * spread) * Math.PI / 180;
  return {
    left: 50 + 43 * Math.cos(angle),
    top: 50 + 36 * Math.sin(angle)
  };
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

function snapshotVisualState(state) {
  return {
    hand_number: state.hand_number,
    stage: state.stage,
    pot: Number(state.pot) || 0,
    history_length: (state.history || []).length,
    last_action: state.last_action || '',
    players: state.players.map(player => ({
      id: player.id,
      stack: Number(player.stack) || 0,
      committed: Number(player.committed) || 0
    }))
  };
}

function getActionSound(previous, state) {
  const history = state.history || [];
  if (!previous || previous.hand_number !== state.hand_number
      || history.length <= previous.history_length
      || state.last_action === previous.last_action) return null;
  const label = history[history.length - 1]?.label || '';
  if (label !== state.last_action) return null;
  if (/ folded$/.test(label)) return 'fold';
  if (/ checked$/.test(label)) return 'check';
  if (/ called\b/.test(label)) return 'call';
  if (/ raised to\b/.test(label)) return 'raise';
  if (/ went all-in$/.test(label)) return 'allin';
  return null;
}

function getChipContributions(previous, state) {
  if (!previous) return [];
  const sameHand = previous.hand_number === state.hand_number;
  const previousPlayers = new Map(previous.players.map(player => [player.id, player]));
  return state.players.map(player => {
    const committed = Number(player.committed) || 0;
    const oldCommitted = Number(previousPlayers.get(player.id)?.committed) || 0;
    return {id: player.id, amount: Math.max(0, sameHand ? committed - oldCommitted : committed)};
  }).filter(contribution => contribution.amount > 0);
}

function shouldAnimatePotAward(previous, state) {
  return Boolean(previous
    && previous.hand_number === state.hand_number
    && previous.stage !== 'showdown'
    && state.stage === 'showdown'
    && (state.winner_ids || []).length);
}

function renderChipStack(side) {
  return `<div class="player-chip-stack ${side}" aria-hidden="true">${['red', 'blue', 'green', 'black', 'gold']
    .map(color => `<i class="poker-chip chip-${color}"></i>`).join('')}</div>`;
}

function chipCountForAmount(amount) {
  return Math.min(6, Math.max(2, Math.ceil(Math.log10(Math.max(1, amount))) + 1));
}

function flyChipTokens(source, target, count, delay = 0, award = false) {
  if (!source || !target) return;
  const from = source.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  const startX = from.left + from.width / 2;
  const startY = from.top + from.height / 2;
  const dx = to.left + to.width / 2 - startX;
  const dy = to.top + to.height / 2 - startY;
  for (let index = 0; index < count; index += 1) {
    const chip = document.createElement('span');
    const colors = award ? ['gold', 'red', 'blue', 'gold', 'green', 'gold'] : ['red', 'blue', 'green', 'black', 'gold', 'red'];
    chip.className = `chip-flight chip-${colors[index % colors.length]}`;
    chip.style.left = `${startX + ((index % 3) - 1) * 5}px`;
    chip.style.top = `${startY + (Math.floor(index / 3) - 1) * 4}px`;
    chip.style.setProperty('--chip-x', `${dx}px`);
    chip.style.setProperty('--chip-y', `${dy}px`);
    chip.style.setProperty('--chip-mid-x', `${dx * .48}px`);
    chip.style.setProperty('--chip-mid-y', `${dy * .48}px`);
    chip.style.animationDelay = `${delay + index * 58}ms`;
    document.body.appendChild(chip);
    window.setTimeout(() => chip.remove(), delay + index * 58 + 1050);
  }
}

function animateChipContributions(contributions) {
  const pot = document.querySelector('#pot');
  let moved = false;
  contributions.forEach(({id, amount}) => {
    const seat = [...document.querySelectorAll('#seats .seat')].find(item => item.dataset.playerId === id);
    const stack = seat && seat.querySelector('.player-chip-stack');
    if (!stack) return;
    stack.classList.remove('chips-moving');
    void stack.offsetWidth;
    stack.classList.add('chips-moving');
    window.setTimeout(() => stack.classList.remove('chips-moving'), 900);
    flyChipTokens(stack, pot, chipCountForAmount(amount));
    moved = true;
  });
  if (moved) playChipSound('bet');
}

function animatePotAward(previous, state) {
  const pot = document.querySelector('#pot');
  const previousPlayers = new Map(previous.players.map(player => [player.id, player]));
  const winners = (state.winner_ids || []).map(id => ({
    id,
    player: state.players.find(player => player.id === id),
    previous: previousPlayers.get(id)
  })).filter(item => item.player);
  let animatedWinnerCount = 0;
  winners.forEach(({id, player, previous}, index) => {
    const seat = [...document.querySelectorAll('#seats .seat')].find(item => item.dataset.playerId === id);
    if (!seat) return;
    const stack = seat.querySelector('.player-chip-stack');
    const payout = Math.max(0, (Number(player.stack) || 0) - (Number(previous && previous.stack) || 0));
    flyChipTokens(pot, stack || seat, Math.max(3, chipCountForAmount(payout)), 850 + index * 210, true);
    seat.classList.add('collecting-chips');
    window.setTimeout(() => seat.classList.remove('collecting-chips'), 2200 + index * 210);
    animatedWinnerCount += 1;
  });
  if (animatedWinnerCount) {
    potPaidHandNumber = state.hand_number;
    window.setTimeout(() => { pot.textContent = 'POT PAID'; }, 850);
    window.setTimeout(() => playChipSound('award'), 850);
  }
}

let gameAudio = null;
let gameAudioEnabled = true;
const casinoMusic = new Audio('/static/audio/casino-background.mp3');
casinoMusic.loop = true;
casinoMusic.preload = 'auto';
casinoMusic.volume = .22;

function unlockGameAudio() {
  const AudioContextType = window.AudioContext || window.webkitAudioContext;
  try {
    if (AudioContextType) {
      gameAudio ||= new AudioContextType();
      if (gameAudio.state === 'suspended') gameAudio.resume().catch(() => {});
    }
    if (gameAudioEnabled) startCasinoMusic();
  } catch (_) { /* Sound is optional when the browser blocks audio. */ }
}

document.addEventListener('pointerdown', unlockGameAudio);

function startCasinoMusic() {
  if (!gameAudioEnabled || !casinoMusic.paused) return;
  const playback = casinoMusic.play();
  if (playback && typeof playback.catch === 'function') playback.catch(() => {});
}

function stopCasinoMusic() {
  casinoMusic.pause();
}

function playActionSound(action) {
  if (!gameAudioEnabled || !gameAudio || gameAudio.state !== 'running') return;
  const sounds = {
    fold: {notes: [420, 310], shape: 'triangle', duration: .16, volume: .035},
    check: {notes: [1046], shape: 'sine', duration: .09, volume: .025},
    call: {notes: [660, 880], shape: 'triangle', duration: .12, volume: .026},
    raise: {notes: [523, 784, 1046], shape: 'triangle', duration: .19, volume: .03},
    allin: {notes: [196, 392, 784], shape: 'sawtooth', duration: .24, volume: .027}
  }[action];
  if (!sounds) return;
  const now = gameAudio.currentTime;
  sounds.notes.forEach((frequency, index) => {
    const start = now + index * (action === 'allin' ? .055 : .045);
    const oscillator = gameAudio.createOscillator();
    const volume = gameAudio.createGain();
    oscillator.type = sounds.shape;
    oscillator.frequency.setValueAtTime(frequency, start);
    if (action === 'fold') oscillator.frequency.exponentialRampToValueAtTime(frequency * .72, start + sounds.duration);
    volume.gain.setValueAtTime(.0001, start);
    volume.gain.exponentialRampToValueAtTime(sounds.volume, start + .008);
    volume.gain.exponentialRampToValueAtTime(.0001, start + sounds.duration);
    oscillator.connect(volume);
    volume.connect(gameAudio.destination);
    oscillator.start(start);
    oscillator.stop(start + sounds.duration + .01);
  });
}

function playChipSound(kind) {
  if (!gameAudioEnabled || !gameAudio || gameAudio.state !== 'running') return;
  const now = gameAudio.currentTime;
  const clinks = kind === 'award'
    ? [[880, 1320], [1175, 1760], [988, 1480], [1396, 2093]]
    : [[1046, 1570], [1318, 1977]];
  clinks.forEach((partials, index) => {
    const start = now + index * (kind === 'award' ? .085 : .055);
    partials.forEach((frequency, partialIndex) => {
      const oscillator = gameAudio.createOscillator();
      const volume = gameAudio.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, start);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * .94, start + .12);
      volume.gain.setValueAtTime(.0001, start);
      volume.gain.exponentialRampToValueAtTime(partialIndex === 0 ? .035 : .016, start + .004);
      volume.gain.exponentialRampToValueAtTime(.0001, start + (kind === 'award' ? .22 : .16));
      oscillator.connect(volume);
      volume.connect(gameAudio.destination);
      oscillator.start(start);
      oscillator.stop(start + (kind === 'award' ? .23 : .17));
    });
  });
}
const soundToggle = document.querySelector('#soundToggle');
soundToggle.addEventListener('click', () => {
  gameAudioEnabled = !gameAudioEnabled;
  soundToggle.textContent = gameAudioEnabled ? '🔊' : '🔇';
  soundToggle.setAttribute('aria-label', gameAudioEnabled ? 'Mute music and game sounds' : 'Enable music and game sounds');
  soundToggle.title = gameAudioEnabled ? 'Mute music and game sounds' : 'Enable music and game sounds';
  if (gameAudioEnabled) unlockGameAudio();
  else stopCasinoMusic();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && gameAudioEnabled && casinoMusic.paused) startCasinoMusic();
});
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

function setCardFlightOrigins(cards) {
  const deck = document.querySelector('#cardDeck');
  if (!deck) return;
  const deckRect = deck.getBoundingClientRect();
  const deckX = deckRect.left + deckRect.width / 2;
  const deckY = deckRect.top + deckRect.height / 2;
  cards.forEach(card => {
    const rect = card.getBoundingClientRect();
    card.style.setProperty('--deal-x', `${deckX - (rect.left + rect.width / 2)}px`);
    card.style.setProperty('--deal-y', `${deckY - (rect.top + rect.height / 2)}px`);
  });
}

function animateCommunityDeal() {
  window.requestAnimationFrame(() => {
    setCardFlightOrigins(document.querySelectorAll('#board .card-dealt'));
  });
}

function animateNewHand() {
  const deck = document.querySelector('#cardDeck');
  deck.classList.remove('shuffling');
  void deck.offsetWidth;
  deck.classList.add('shuffling');
  window.setTimeout(() => deck.classList.remove('shuffling'), 720);

  window.requestAnimationFrame(() => {
    setCardFlightOrigins(document.querySelectorAll('.hole-deal'));
  });
}
function getId() {
  return sessionStorage.getItem('poker_id') || '';
}

socket.on('resumed', data => sessionStorage.setItem('poker_id', data.player_id));
socket.on('state', render);
socket.on('session_closed', () => {
  sessionStorage.removeItem('poker_id');
  sessionStorage.removeItem('poker_code');
  location.href = '/';
});
socket.on('left_room', () => {
  sessionStorage.removeItem('poker_id');
  sessionStorage.removeItem('poker_code');
  location.href = '/';
});
document.querySelector('#exitBtn').onclick = event => {
  event.currentTarget.disabled = true;
  socket.emit('leave_room', {code, player_id: getId()});
};
socket.on('error_message', data => {
  const exitButton = document.querySelector('#exitBtn');
  if (exitButton) exitButton.disabled = false;
  alert(data.message);
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

const fullscreenPrompt = document.querySelector('#fullscreenPrompt');
const fullscreenMessage = document.querySelector('#fullscreenMessage');
const fullscreenToggle = document.querySelector('#fullscreenToggle');
const isCompactDevice = window.matchMedia('(pointer: coarse), (max-width: 900px)').matches;
if (isCompactDevice) {
  document.body.classList.add('is-mobile-game');
  fullscreenPrompt.hidden = false;
}

function syncFullscreenControls() {
  const active = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
  document.body.classList.toggle('fullscreen-active', active);
  fullscreenToggle.setAttribute('aria-label', active ? 'Exit full screen' : 'Enter full screen');
  fullscreenToggle.title = active ? 'Exit full screen' : 'Enter full screen';
  if (active) fullscreenPrompt.hidden = true;
}

async function enterFullscreen() {
  const root = document.documentElement;
  const request = root.requestFullscreen || root.webkitRequestFullscreen;
  if (!request) {
    fullscreenMessage.textContent = 'This browser does not allow full screen mode. You can still continue playing.';
    return;
  }
  try {
    await request.call(root, {navigationUI: 'hide'});
    fullscreenPrompt.hidden = true;
    syncFullscreenControls();
    if (screen.orientation && screen.orientation.lock) {
      try { await screen.orientation.lock('landscape'); } catch (_) { /* Orientation lock is optional. */ }
    }
  } catch (_) {
    fullscreenMessage.textContent = 'Full screen was blocked by the browser. You can continue normally or try again.';
  }
}

document.querySelector('#enterFullscreenBtn').addEventListener('click', enterFullscreen);
document.querySelector('#continueWindowedBtn').addEventListener('click', () => {
  fullscreenPrompt.hidden = true;
});
fullscreenToggle.addEventListener('click', async () => {
  const active = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
  if (active) {
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    if (exit) await exit.call(document);
    return;
  }
  fullscreenMessage.textContent = 'Hide the browser bars for more room at the table. Turn your phone sideways for the best view.';
  fullscreenPrompt.hidden = false;
});
document.addEventListener('fullscreenchange', syncFullscreenControls);
document.addEventListener('webkitfullscreenchange', syncFullscreenControls);
