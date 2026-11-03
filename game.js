(() => {
  'use strict';
  const canvas = document.querySelector('#game');
  const ctx = canvas.getContext('2d');
  const wrap = document.querySelector('#canvasWrap');
  const screen = document.querySelector('#screen');
  const playButton = document.querySelector('#playButton');
  const playLabel = document.querySelector('#playLabel');
  const screenTitle = document.querySelector('#screenTitle');
  const screenEyebrow = document.querySelector('#screenEyebrow');
  const screenCopy = document.querySelector('#screenCopy');
  const screenHint = document.querySelector('#screenHint');
  const scoreNode = document.querySelector('#score');
  const timeNode = document.querySelector('#time');
  const livesNode = document.querySelector('#lives');
  const bestNode = document.querySelector('#bestScore');
  const statusNode = document.querySelector('#statusText');
  const soundButton = document.querySelector('#soundButton');

  let width = 800, height = 510, dpr = 1, last = 0;
  let state = 'title', score = 0, elapsed = 0, lives = 3, spawnClock = 0, invulnerable = 0;
  let dashTime = 0, dashCooldown = 0, soundOn = true, audio;
  let entities = [], particles = [], stars = [], keys = new Set(), pointer = null;
  let best = Number(localStorage.getItem('lastLightBest') || 0);
  bestNode.textContent = pad(best);

  function pad(n) { return String(Math.floor(n)).padStart(6, '0'); }
  function resize() {
    const rect = wrap.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(280, rect.width);
    height = Math.max(270, rect.height);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    stars = Array.from({length: Math.floor(width * height / 3000)}, () => ({x: Math.random()*width,y:Math.random()*height,r:Math.random()*1.25+.25,a:Math.random()*.55+.12,tw:Math.random()*5}));
    if (player) { player.x = clamp(player.x, player.r, width-player.r); player.y = clamp(player.y, player.r, height-player.r); }
  }
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  let player = {x:400,y:350,r:11,vx:0,vy:0,targetX:null,targetY:null};
  new ResizeObserver(resize).observe(wrap);
  resize();

  function showScreen(kind) {
    state = kind;
    screen.classList.remove('hidden');
    if (kind === 'title') {
      screenMark('✳'); screenEyebrow.textContent='READY WHEN YOU ARE'; screenTitle.innerHTML='Find your<br><em>way through.</em>';
      screenCopy.textContent='Collect sparks to score. Three hits and the light goes out.'; playLabel.textContent='START GAME'; screenHint.textContent='ARROW KEYS OR A / D TO MOVE'; statusNode.textContent='SYSTEM STANDBY';
    } else if (kind === 'paused') {
      screenMark('Ⅱ'); screenEyebrow.textContent='TAKE A BREATH'; screenTitle.innerHTML='A moment<br><em>of quiet.</em>';
      screenCopy.textContent='Your run is paused. The sparks can wait.'; playLabel.textContent='RESUME RUN'; screenHint.textContent='PRESS P OR ESC TO RESUME'; statusNode.textContent='RUN PAUSED';
    } else if (kind === 'gameover') {
      screenMark('✳'); screenEyebrow.textContent='THE LIGHT FADES'; screenTitle.innerHTML='A lovely<br><em>little run.</em>';
      screenCopy.textContent=`You gathered ${score} points and lasted ${formatTime(elapsed)}. Ready for another?`; playLabel.textContent='PLAY AGAIN'; screenHint.textContent=score >= best ? 'A NEW PERSONAL BEST — NICE WORK' : 'ONE MORE TRY?'; statusNode.textContent='RUN COMPLETE';
    }
  }
  function screenMark(text) { document.querySelector('#screenMark').textContent = text; }
  function startGame() {
    score=0; elapsed=0; lives=3; spawnClock=.5; invulnerable=1; dashTime=0; dashCooldown=0; entities=[]; particles=[];
    player={x:width/2,y:height*.72,r:11,vx:0,vy:0,targetX:null,targetY:null};
    scoreNode.textContent=pad(0); timeNode.textContent='00:00'; updateLives();
    state='running'; screen.classList.add('hidden'); statusNode.textContent='LIGHT: HOLDING'; last=performance.now();
    tone(480,.08,'sine',.045);
  }
  function formatTime(s) { const m=Math.floor(s/60), sec=Math.floor(s%60); return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`; }
  function updateLives() { livesNode.textContent=Array.from({length:3},(_,i)=>i<lives?'●':'○').join(' '); livesNode.setAttribute('aria-label',`${lives} shields`); }
  function tone(freq,duration=.08,type='sine',volume=.035) {
    if (!soundOn) return;
    try { audio ||= new (window.AudioContext||window.webkitAudioContext)(); if(audio.state==='suspended') audio.resume(); const osc=audio.createOscillator(), gain=audio.createGain(); osc.type=type; osc.frequency.value=freq; gain.gain.setValueAtTime(volume,audio.currentTime); gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration); osc.connect(gain);gain.connect(audio.destination);osc.start();osc.stop(audio.currentTime+duration); } catch (_) {}
  }
  function addBurst(x,y,color,count=14,power=150) {
    for(let i=0;i<count;i++){const a=Math.random()*Math.PI*2,s=Math.random()*power;particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.35+Math.random()*.5,max:.85,r:1+Math.random()*2,color});}
  }
  function spawn() {
    const ramp=Math.min(1,elapsed/75), type=Math.random() < .31 + ramp*.12 ? 'hazard':'spark';
    const r=type==='hazard'?10+Math.random()*7:5+Math.random()*2;
    entities.push({type,x:r+Math.random()*(width-2*r),y:-r-4,r,vy:(type==='hazard'?105:90)+Math.random()*80+elapsed*1.35,vx:(Math.random()-.5)*(type==='hazard'?24:12),spin:Math.random()*6.28,rot:Math.random()*3-1.5,pulse:Math.random()*6});
  }
  function gameStep(dt) {
    elapsed+=dt; score+=dt*2;
    spawnClock-=dt; const spawnEvery=Math.max(.31,.82-elapsed*.004);
    if(spawnClock<=0){spawn(); if(Math.random()<Math.min(.5,elapsed/100)) spawn(); spawnClock=spawnEvery;}
    invulnerable=Math.max(0,invulnerable-dt); dashTime=Math.max(0,dashTime-dt); dashCooldown=Math.max(0,dashCooldown-dt);

    let ix=(keys.has('ArrowRight')||keys.has('d')?1:0)-(keys.has('ArrowLeft')||keys.has('a')?1:0);
    let iy=(keys.has('ArrowDown')||keys.has('s')?1:0)-(keys.has('ArrowUp')||keys.has('w')?1:0);
    if(ix||iy){const len=Math.hypot(ix,iy)||1;ix/=len;iy/=len;player.vx=ix*260;player.vy=iy*260;player.targetX=null;player.targetY=null;}
    else if(pointer){player.targetX=pointer.x;player.targetY=pointer.y;const dx=player.targetX-player.x,dy=player.targetY-player.y,len=Math.hypot(dx,dy);if(len>3){player.vx=dx/len*Math.min(360,len*7);player.vy=dy/len*Math.min(360,len*7);}else{player.vx=0;player.vy=0;}}
    else {player.vx*=Math.pow(.001,dt);player.vy*=Math.pow(.001,dt);}
    const speed=dashTime>0?2.45:1;
    player.x=clamp(player.x+player.vx*dt*speed,player.r+4,width-player.r-4);
    player.y=clamp(player.y+player.vy*dt*speed,player.r+4,height-player.r-4);

    for(let i=entities.length-1;i>=0;i--){const e=entities[i];e.y+=e.vy*dt;e.x+=e.vx*dt;e.spin+=e.rot*dt;e.pulse+=dt*4;
      if(e.x<e.r||e.x>width-e.r)e.vx*=-1;
      if(e.y>height+e.r+5){entities.splice(i,1);continue;}
      const dx=e.x-player.x,dy=e.y-player.y,dist=Math.hypot(dx,dy);
      if(dist < e.r+player.r*.78){
        entities.splice(i,1);
        if(e.type==='spark'){score+=100;addBurst(e.x,e.y,'#ffdc8d',12,100);tone(720+Math.random()*220,.09,'sine',.04);}
        else if(invulnerable<=0){lives--;invulnerable=1.35;addBurst(player.x,player.y,'#ff7081',18,180);tone(145,.22,'sawtooth',.045);updateLives();if(lives<=0){finishGame();return;}}
      }
    }
    for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.life-=dt;if(p.life<=0){particles.splice(i,1);continue;}p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=Math.pow(.08,dt);p.vy*=Math.pow(.08,dt);}
    scoreNode.textContent=pad(score);timeNode.textContent=formatTime(elapsed);
    if(dashCooldown>0){statusNode.textContent=`DASH RECHARGING · ${dashCooldown.toFixed(1)}S`;}else statusNode.textContent='LIGHT: HOLDING';
  }
  function finishGame(){state='gameover';score=Math.floor(score);scoreNode.textContent=pad(score);if(score>best){best=score;localStorage.setItem('lastLightBest',String(best));bestNode.textContent=pad(best);}showScreen('gameover');}
  function draw() {
    ctx.clearRect(0,0,width,height);
    const bg=ctx.createLinearGradient(0,0,0,height);bg.addColorStop(0,'#0a1120');bg.addColorStop(1,'#080c18');ctx.fillStyle=bg;ctx.fillRect(0,0,width,height);
    // Quiet starfield and a faint center glow.
    const glow=ctx.createRadialGradient(width*.5,height*.45,0,width*.5,height*.45,width*.65);glow.addColorStop(0,'rgba(39,77,104,.14)');glow.addColorStop(1,'rgba(7,12,24,0)');ctx.fillStyle=glow;ctx.fillRect(0,0,width,height);
    for(const s of stars){ctx.globalAlpha=s.a*(.72+.28*Math.sin(performance.now()/900+s.tw));ctx.fillStyle='#b9d6e8';ctx.fillRect(s.x,s.y,s.r,s.r);}ctx.globalAlpha=1;
    // Subtle scan lines and a boundary grid.
    ctx.strokeStyle='rgba(117,151,186,.055)';ctx.lineWidth=1;for(let x=0;x<width;x+=48){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,height);ctx.stroke();}for(let y=0;y<height;y+=48){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(width,y);ctx.stroke();}
    for(const e of entities){ctx.save();ctx.translate(e.x,e.y);ctx.rotate(e.spin);if(e.type==='spark'){const pulse=1+Math.sin(e.pulse)*.12;ctx.scale(pulse,pulse);ctx.shadowBlur=18;ctx.shadowColor='#ffd47c';ctx.fillStyle='#ffdc8d';ctx.beginPath();ctx.arc(0,0,e.r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#fff7d9';ctx.beginPath();ctx.arc(-e.r*.2,-e.r*.2,e.r*.28,0,Math.PI*2);ctx.fill();}else{ctx.shadowBlur=13;ctx.shadowColor='#ff526b';ctx.strokeStyle='#ff6377';ctx.fillStyle='rgba(255,66,91,.16)';ctx.lineWidth=1.7;ctx.beginPath();for(let j=0;j<6;j++){const a=j*Math.PI/3;const rr=e.r*(j%2?.82:1);const x=Math.cos(a)*rr,y=Math.sin(a)*rr;j?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();ctx.fill();ctx.stroke();ctx.shadowBlur=0;ctx.fillStyle='#ff8290';ctx.beginPath();ctx.arc(0,0,2,0,Math.PI*2);ctx.fill();}ctx.restore();}
    for(const p of particles){ctx.globalAlpha=Math.max(0,p.life/p.max);ctx.fillStyle=p.color;ctx.shadowBlur=8;ctx.shadowColor=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;ctx.shadowBlur=0;
    // Player aura and directional trail.
    const flicker=invulnerable>0&&Math.floor(performance.now()/85)%2===0;
    if(!flicker){ctx.save();if(dashTime>0){ctx.strokeStyle='rgba(157,246,207,.26)';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(player.x-player.vx*.085,player.y-player.vy*.085);ctx.lineTo(player.x,player.y);ctx.stroke();}
      const aura=ctx.createRadialGradient(player.x,player.y,2,player.x,player.y,player.r*3.4);aura.addColorStop(0,'rgba(157,246,207,.27)');aura.addColorStop(1,'rgba(157,246,207,0)');ctx.fillStyle=aura;ctx.beginPath();ctx.arc(player.x,player.y,player.r*3.4,0,Math.PI*2);ctx.fill();ctx.shadowBlur=20;ctx.shadowColor='#8ff3c4';ctx.fillStyle='#a1f7d1';ctx.beginPath();ctx.arc(player.x,player.y,player.r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#f0fff8';ctx.beginPath();ctx.arc(player.x-3,player.y-3,3,0,Math.PI*2);ctx.fill();ctx.restore();}
    if(state==='running'&&dashCooldown>0){ctx.fillStyle='rgba(255,255,255,.07)';ctx.fillRect(0,height-3,width,3);ctx.fillStyle='#9df6cf';ctx.fillRect(0,height-3,width*(1-dashCooldown/3),3);}
  }
  function frame(now){const dt=Math.min(.04,(now-last)/1000||0);last=now;if(state==='running')gameStep(dt);draw();requestAnimationFrame(frame);}
  requestAnimationFrame(frame);
  playButton.addEventListener('click',()=>{if(state==='paused'){state='running';screen.classList.add('hidden');statusNode.textContent='LIGHT: HOLDING';last=performance.now();}else startGame();});
  window.addEventListener('keydown',e=>{const key=e.key.length===1?e.key.toLowerCase():e.key;if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key))e.preventDefault();keys.add(key);if(key===' '&&state==='running'&&dashCooldown<=0){dashTime=.19;dashCooldown=3;const dx=(keys.has('ArrowRight')||keys.has('d')?1:0)-(keys.has('ArrowLeft')||keys.has('a')?1:0);const dy=(keys.has('ArrowDown')||keys.has('s')?1:0)-(keys.has('ArrowUp')||keys.has('w')?1:0);if(!dx&&!dy){player.vx=player.x<width/2?280:-280;player.vy=0;}tone(330,.12,'triangle',.04);}if((key==='p'||key==='Escape')&&state==='running')showScreen('paused');else if((key==='p'||key==='Escape')&&state==='paused'){state='running';screen.classList.add('hidden');last=performance.now();}});
  window.addEventListener('keyup',e=>keys.delete(e.key.length===1?e.key.toLowerCase():e.key));
  function setPointer(e){const rect=canvas.getBoundingClientRect();pointer={x:(e.clientX-rect.left)*width/rect.width,y:(e.clientY-rect.top)*height/rect.height};}
  canvas.addEventListener('pointermove',e=>{if(e.pointerType==='mouse'&&e.buttons===0||e.pointerType!=='mouse')setPointer(e);});
  canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture?.(e.pointerId);setPointer(e);if(state==='title')startGame();});
  canvas.addEventListener('pointerleave',()=>{if(!('ontouchstart'in window))pointer=null;});
  soundButton.addEventListener('click',()=>{soundOn=!soundOn;soundButton.innerHTML=`♫ <span>SOUND ${soundOn?'ON':'OFF'}</span>`;soundButton.setAttribute('aria-label',`Turn sound ${soundOn?'off':'on'}`);if(soundOn)tone(600,.08);});
})();
