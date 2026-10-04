const name = document.querySelector('#name');
const code = document.querySelector('#code');
const error = document.querySelector('#error');
const avatarChoice = document.querySelector('#avatar-choice');
const avatarLabel = document.querySelector('#avatar-label');
const avatarDialog = document.querySelector('#avatar-dialog');
const girlfriendDialog = document.querySelector('#girlfriend-dialog');
let selectedGender = '';
let pendingAction = null;
sessionStorage.removeItem('poker_gender');
sessionStorage.removeItem('poker_is_developers_girlfriend');

function fail(message) {
  error.textContent = message || '';
}

function updateAvatarSummary() {
  const selected = selectedGender === 'male' || selectedGender === 'female';
  avatarChoice.classList.toggle('hidden', !selected);
  avatarLabel.textContent = selected ? `Avatar: ${selectedGender.toUpperCase()}` : '';
}

function requestAction(action) {
  fail('');
  const playerName = name.value.trim();
  if (!playerName) {
    fail('Enter a player name.');
    name.focus();
    return;
  }
  if (action === 'join' && !/^\d{6}$/.test(code.value.trim())) {
    fail('Enter a six-digit room code.');
    code.focus();
    return;
  }
  if (selectedGender !== 'male' && selectedGender !== 'female') {
    pendingAction = {action, playerName};
    avatarDialog.showModal();
    return;
  }
  askGirlfriendIfEligible(action, playerName);
}

function askGirlfriendIfEligible(action, playerName) {
  const specialName = ['manomita', 'diya'].includes(playerName.trim().toLowerCase());
  if (specialName && selectedGender === 'female') {
    pendingAction = {action, playerName};
    girlfriendDialog.showModal();
    return;
  }
  continueAction(action, playerName, false);
}

function continueAction(action, playerName, isDevelopersGirlfriend) {
  sessionStorage.setItem('poker_name', playerName);
  sessionStorage.setItem('poker_gender', selectedGender);
  sessionStorage.setItem('poker_is_developers_girlfriend', String(isDevelopersGirlfriend));
  if (action === 'create') {
    location.href = '/setup?name=' + encodeURIComponent(playerName);
    return;
  }

  const socket = io();
  socket.on('joined', data => {
    sessionStorage.setItem('poker_id', data.player_id);
    sessionStorage.setItem('poker_code', data.code);
    location.href = '/room/' + data.code;
  });
  socket.on('error_message', data => fail(data.message));
  socket.emit('join_room', {
    name: playerName,
    gender: selectedGender,
    developers_girlfriend: isDevelopersGirlfriend,
    code: code.value.trim()
  });
}

document.querySelector('#create').addEventListener('click', () => requestAction('create'));
document.querySelector('#join').addEventListener('click', () => requestAction('join'));
document.querySelector('#change-avatar').addEventListener('click', () => {
  pendingAction = null;
  avatarDialog.showModal();
});

document.querySelectorAll('[data-gender]').forEach(button => {
  button.addEventListener('click', () => {
    selectedGender = button.dataset.gender;
    sessionStorage.setItem('poker_gender', selectedGender);
    updateAvatarSummary();
    avatarDialog.close();
    const action = pendingAction;
    pendingAction = null;
    if (action) askGirlfriendIfEligible(action.action, action.playerName);
  });
});

document.querySelectorAll('[data-girlfriend-answer]').forEach(button => {
  button.addEventListener('click', () => {
    const answer = button.dataset.girlfriendAnswer === 'yes';
    const action = pendingAction;
    pendingAction = null;
    girlfriendDialog.close();
    if (action) continueAction(action.action, action.playerName, answer);
  });
});

document.querySelector('#cancel-avatar').addEventListener('click', () => {
  pendingAction = null;
  avatarDialog.close();
});

avatarDialog.addEventListener('click', event => {
  if (event.target === avatarDialog) {
    pendingAction = null;
    avatarDialog.close();
  }
});

girlfriendDialog.addEventListener('click', event => {
  if (event.target === girlfriendDialog) {
    pendingAction = null;
    girlfriendDialog.close();
  }
});

avatarDialog.addEventListener('cancel', () => { pendingAction = null; });
girlfriendDialog.addEventListener('cancel', () => { pendingAction = null; });

updateAvatarSummary();
