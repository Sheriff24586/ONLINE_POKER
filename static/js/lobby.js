const name = document.querySelector('#name');
const code = document.querySelector('#code');
const error = document.querySelector('#error');
function fail(m){error.textContent=m||'';}
document.querySelector('#create').onclick=()=>{
  const playerName=name.value.trim();
  if(!playerName) return fail('Enter a player name.');
  sessionStorage.setItem('poker_name',playerName);
  location.href='/setup?name='+encodeURIComponent(playerName);
};
document.querySelector('#join').onclick=()=>{
  const playerName=name.value.trim(); const roomCode=code.value.trim();
  if(!playerName) return fail('Enter a player name.');
  if(!/^\d{6}$/.test(roomCode)) return fail('Enter a six-digit room code.');
  sessionStorage.setItem('poker_name',playerName);
  // Joining uses the lightweight Socket.IO client on the lobby page.
  const socket=io();
  socket.on('joined',d=>{sessionStorage.setItem('poker_id',d.player_id);sessionStorage.setItem('poker_code',d.code);location.href='/room/'+d.code;});
  socket.on('error_message',d=>fail(d.message));
  socket.emit('join_room',{name:playerName,code:roomCode});
};
