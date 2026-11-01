const canvas = document.querySelector("#scene");
const stage = document.querySelector("#stage");
const countEl = document.querySelector("#ball-count");
const fpsEl = document.querySelector("#fps");
const clockEl = document.querySelector("#clock");
const addButton = document.querySelector("#add");
const gravityButton = document.querySelector("#gravity");
const resetButton = document.querySelector("#reset");

const ctx = canvas.getContext("2d", { alpha: true });
const TAU = Math.PI * 2;
const MAX_BALLS = 90;
const PALETTE = [252, 196, 164, 48, 330, 286, 214];

let width = 0;
let height = 0;
let dpr = 1;
let balls = [];
let gravityOn = true;
let paused = false;
let lastTime = performance.now();
let fps = 60;
let fpsFrames = 0;
let fpsSince = performance.now();
let frames = 0;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const random = (min, max) => min + Math.random() * (max - min);

function makeBall(x, y, options = {}) {
  const radius = options.radius ?? random(11, 27);
  return {
    x: x ?? random(radius, Math.max(radius + 1, width - radius)),
    y: y ?? random(radius, Math.max(radius + 1, height * 0.8)),
    vx: options.vx ?? random(-3.4, 3.4),
    vy: options.vy ?? random(-5.2, 1.2),
    radius,
    hue: options.hue ?? PALETTE[Math.floor(Math.random() * PALETTE.length)],
    mass: radius * radius,
  };
}

function spawnBurst(amount, x, y) {
  for (let i = 0; i < amount; i += 1) {
    if (balls.length >= MAX_BALLS) balls.shift();
    balls.push(
      makeBall(
        x === undefined ? undefined : x + random(-18, 18),
        y === undefined ? undefined : y + random(-18, 18),
      ),
    );
  }
  updateCount();
}

function resetBalls() {
  balls = [];
  const target = width < 640 ? 16 : 18;
  for (let i = 0; i < target; i += 1) {
    balls.push(makeBall());
  }
  updateCount();
}

function updateCount() {
  countEl.textContent = String(balls.length);
}

function resize() {
  const rect = stage.getBoundingClientRect();
  dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  width = Math.max(1, rect.width);
  height = Math.max(1, rect.height);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  for (const ball of balls) {
    ball.x = clamp(ball.x, ball.radius, width - ball.radius);
    ball.y = clamp(ball.y, ball.radius, height - ball.radius);
  }

  if (!balls.length) resetBalls();
}

function step(dt) {
  for (const ball of balls) {
    if (gravityOn) ball.vy += 0.06 * dt;
    ball.vx *= 0.999;
    ball.vy *= 0.999;

    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    const floor = height - ball.radius;
    if (ball.y > floor) {
      ball.y = floor;
      ball.vy *= -0.86;
      ball.vx *= 0.99;
    } else if (ball.y < ball.radius) {
      ball.y = ball.radius;
      ball.vy *= -0.86;
    }

    if (ball.x < ball.radius) {
      ball.x = ball.radius;
      ball.vx *= -0.9;
    } else if (ball.x > width - ball.radius) {
      ball.x = width - ball.radius;
      ball.vx *= -0.9;
    }
  }

  for (let i = 0; i < balls.length; i += 1) {
    for (let j = i + 1; j < balls.length; j += 1) {
      const a = balls[i];
      const b = balls[j];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      const minDistance = a.radius + b.radius;
      let distanceSq = dx * dx + dy * dy;

      if (distanceSq === 0) {
        dx = 0.01;
        dy = 0.01;
        distanceSq = dx * dx + dy * dy;
      }
      if (distanceSq >= minDistance * minDistance) continue;

      const distance = Math.sqrt(distanceSq);
      const nx = dx / distance;
      const ny = dy / distance;
      const overlap = minDistance - distance;
      const totalMass = a.mass + b.mass;
      const aShare = b.mass / totalMass;
      const bShare = a.mass / totalMass;

      a.x -= nx * overlap * aShare;
      a.y -= ny * overlap * aShare;
      b.x += nx * overlap * bShare;
      b.y += ny * overlap * bShare;

      const relative = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (relative > 0) continue;

      const restitution = 0.86;
      const impulse = (-(1 + restitution) * relative) / totalMass;
      a.vx -= impulse * b.mass * nx;
      a.vy -= impulse * b.mass * ny;
      b.vx += impulse * a.mass * nx;
      b.vy += impulse * a.mass * ny;
    }
  }
}

function drawBall(ball) {
  const gradient = ctx.createRadialGradient(
    ball.x - ball.radius * 0.35,
    ball.y - ball.radius * 0.4,
    ball.radius * 0.08,
    ball.x,
    ball.y,
    ball.radius,
  );
  gradient.addColorStop(0, "rgba(255, 255, 255, 0.96)");
  gradient.addColorStop(0.22, `hsla(${ball.hue}, 96%, 76%, 0.98)`);
  gradient.addColorStop(0.72, `hsla(${ball.hue}, 86%, 58%, 0.96)`);
  gradient.addColorStop(1, `hsla(${ball.hue}, 82%, 38%, 0.9)`);

  ctx.save();
  ctx.shadowColor = `hsla(${ball.hue}, 92%, 62%, 0.55)`;
  ctx.shadowBlur = ball.radius * 0.8;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.radius, 0, TAU);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.restore();

  ctx.beginPath();
  ctx.arc(ball.x - ball.radius * 0.3, ball.y - ball.radius * 0.36, ball.radius * 0.22, 0, TAU);
  ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
  ctx.fill();
}

function draw() {
  ctx.clearRect(0, 0, width, height);
  for (const ball of balls) drawBall(ball);
}

function loop(now) {
  requestAnimationFrame(loop);

  const elapsed = now - lastTime;
  lastTime = now;
  const dt = clamp(elapsed / 16.667, 0, 2.2);

  if (!paused) step(dt);
  draw();

  fpsFrames += 1;
  frames += 1;
  if (now - fpsSince >= 500) {
    fps = Math.round((fpsFrames * 1000) / (now - fpsSince));
    fpsEl.textContent = String(fps);
    fpsFrames = 0;
    fpsSince = now;
  }

  if (frames === 3 && !window.__APP_READY__) {
    window.__APP_READY__ = true;
    document.documentElement.dataset.ready = "true";
  }
}

function spawnFromPointer(event) {
  const rect = stage.getBoundingClientRect();
  const x = clamp(event.clientX - rect.left, 24, width - 24);
  const y = clamp(event.clientY - rect.top, 24, height - 24);
  if (balls.length >= MAX_BALLS) balls.shift();
  balls.push(makeBall(x, y, { vx: random(-2.4, 2.4), vy: random(-4.4, -1.6) }));
  updateCount();
}

function updateClock() {
  const now = new Date();
  clockEl.textContent = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

addButton.addEventListener("click", () => spawnBurst(5));
resetButton.addEventListener("click", resetBalls);
gravityButton.addEventListener("click", () => {
  gravityOn = !gravityOn;
  gravityButton.setAttribute("aria-pressed", String(gravityOn));
});
stage.addEventListener("pointerdown", spawnFromPointer);

window.addEventListener("resize", resize);
document.addEventListener("visibilitychange", () => {
  lastTime = performance.now();
  fpsSince = performance.now();
  fpsFrames = 0;
});

resize();
resetBalls();
updateClock();
setInterval(updateClock, 15000);
requestAnimationFrame(loop);
