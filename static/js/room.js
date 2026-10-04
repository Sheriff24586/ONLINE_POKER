const socket = io({ transports: ['polling'] });
const code = window.ROOM_CODE;
const name = sessionStorage.getItem('poker_name') || '';
const playersEl = document.querySelector('#players');
const statusEl = document.querySelector('#status');
const copyBtn = document.querySelector('#copy');

function esc(s){ return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function render(s){
  playersEl.innerHTML = s.players.map((p,i)=>`<div class="player-row"><span>SEAT ${i+1} · ${esc(p.name)}</span><span>${p.id===s.host_id?'HOST':''}${p.connected?'':'OFFLINE'}</span></div>`).join('');
  const required = Number(s.config && s.config.max_players) || 2;
  const remaining = Math.max(0, required - s.players.length);
  statusEl.textContent = s.stage === 'waiting' ? `${s.players.length}/${required} players joined · Waiting for ${remaining} more...` : 'Starting the game...';
  if (s.stage !== 'waiting') setTimeout(()=>location.href='/game/'+code, 250);
}
socket.on('connect',()=>socket.emit('resume_room',{code,player_id:sessionStorage.getItem('poker_id')}));
socket.on('resumed',d=>sessionStorage.setItem('poker_id',d.player_id));
socket.on('state',render);
socket.on('error_message',d=>statusEl.textContent=d.message);
socket.on('session_closed',()=>{ sessionStorage.removeItem('poker_id'); sessionStorage.removeItem('poker_code'); location.href='/'; });
copyBtn.addEventListener('click', async()=>{ try{ await navigator.clipboard.writeText(code); copyBtn.textContent='COPIED'; setTimeout(()=>copyBtn.textContent='COPY ROOM CODE',1200); }catch(e){} });
