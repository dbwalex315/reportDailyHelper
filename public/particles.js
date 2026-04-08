// 3D 宇宙星球粒子系统
const canvas = document.getElementById('particles');
const ctx = canvas.getContext('2d');

let particles = [];
let planets = [];
const connectionDistance = 80;

let mouse = { x: null, y: null, active: false, pressed: false };
let dragStart = { x: 0, y: 0 };
let dragRotation = { x: 0, y: 0 };
let targetRotation = { x: 0, y: 0 };
let isDragging = false;
let dragTimeout = null;

function initCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

// 3D 旋转函数
function rotateX(point, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: point.x,
    y: point.y * cos - point.z * sin,
    z: point.y * sin + point.z * cos
  };
}

function rotateY(point, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: point.x * cos + point.z * sin,
    y: point.y,
    z: -point.x * sin + point.z * cos
  };
}

function project(point, scale) {
  const z = point.z + 300;
  const factor = 300 / z;
  return {
    x: point.x * factor * scale,
    y: point.y * factor * scale,
    scale: factor
  };
}

// 星球类 - 真正的3D粒子球
class Planet {
  constructor(x, y, radius, particleCount, color, orbitRadius = 0, orbitSpeed = 0) {
    this.x = x;
    this.y = y;
    this.baseX = x;
    this.baseY = y;
    this.radius = radius;
    this.orbitRadius = orbitRadius;
    this.orbitSpeed = orbitSpeed;
    this.orbitAngle = Math.random() * Math.PI * 2;
    this.particles = [];
    this.color = color;
    this.selfRotation = 0;
    this.selfRotationSpeed = (Math.random() - 0.5) * 0.005;

    this.generateParticles(particleCount);
  }

  generateParticles(count) {
    for (let i = 0; i < count; i++) {
      // 球状分布
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = this.radius * (0.75 + Math.random() * 0.3);

      const px = r * Math.sin(phi) * Math.cos(theta);
      const py = r * Math.sin(phi) * Math.sin(theta);
      const pz = r * Math.cos(phi);

      this.particles.push({
        x: px,
        y: py,
        z: pz,
        originalX: px,
        originalY: py,
        originalZ: pz,
        radius: 2 + Math.random() * 2,
        baseOpacity: 0.7 + Math.random() * 0.3,
        size: 1 + Math.random() * 1.5
      });
    }
  }

  update(centerX, centerY, rotX, rotY) {
    // 公转
    if (this.orbitRadius > 0) {
      this.orbitAngle += this.orbitSpeed;
      this.x = centerX + Math.cos(this.orbitAngle) * this.orbitRadius;
      this.y = centerY + Math.sin(this.orbitAngle) * this.orbitRadius * 0.5;
      this.baseX = this.x;
      this.baseY = this.y;
    } else {
      this.baseX = centerX;
      this.baseY = centerY;
      this.x = centerX;
      this.y = centerY;
    }

    // 自转
    this.selfRotation += this.selfRotationSpeed;

    // 旋转所有粒子
    this.particles.forEach(p => {
      // 先恢复到原始位置
      let point = { x: p.originalX, y: p.originalY, z: p.originalZ };

      // 应用自转
      point = rotateY(point, this.selfRotation);

      // 应用用户拖拽旋转
      point = rotateX(point, rotX);
      point = rotateY(point, rotY);

      // 存储旋转后的位置
      p.x = point.x;
      p.y = point.y;
      p.z = point.z;
    });
  }

  draw() {
    // 按z排序（深度排序）
    const sorted = [...this.particles].sort((a, b) => b.z - a.z);

    sorted.forEach(p => {
      // 3D投影
      const scale = 0.8 + (p.z + this.radius) / (this.radius * 2.5);
      const px = this.x + p.x * scale;
      const py = this.y + p.y * scale;

      // 深度影响大小和透明度
      const depthFactor = (p.z + this.radius * 1.5) / (this.radius * 3);
      const finalRadius = p.size * scale * (0.3 + depthFactor * 0.7);
      const finalOpacity = p.baseOpacity * (0.3 + depthFactor * 0.7);

      // 粒子颜色
      ctx.beginPath();
      ctx.arc(px, py, finalRadius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 220, 140, ${finalOpacity})`;
      ctx.fill();
    });

    // 引力场效果
    this.drawGravityField();
  }

  drawGravityField() {
    const rings = 3;
    for (let i = 0; i < rings; i++) {
      const dist = this.radius * (1.4 + i * 0.4);
      const pointCount = 20 + i * 10;

      ctx.beginPath();
      for (let j = 0; j <= pointCount; j++) {
        const angle = (j / pointCount) * Math.PI * 2;
        const wobble = Math.sin(angle * 3 + this.selfRotation * 5) * 3;

        // 简单的椭圆投影
        const px = this.x + Math.cos(angle) * (dist + wobble);
        const py = this.y + Math.sin(angle) * (dist + wobble) * 0.7;

        if (j === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = `rgba(255, 200, 100, ${0.08 - i * 0.02})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
}

// 漂浮粒子
class FloatingParticle {
  constructor() {
    this.reset();
  }

  reset() {
    this.x = Math.random() * canvas.width;
    this.y = Math.random() * canvas.height;
    this.z = (Math.random() - 0.5) * 200;
    this.vx = (Math.random() - 0.5) * 0.3;
    this.vy = (Math.random() - 0.5) * 0.3;
    this.radius = 0.5 + Math.random() * 1.5;
    this.opacity = 0.3 + Math.random() * 0.4;
  }

  update(planets, rotX, rotY) {
    // 星球引力
    planets.forEach(planet => {
      const dx = planet.x - this.x;
      const dy = planet.y - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < planet.radius * 3 && dist > planet.radius * 0.5) {
        const force = (planet.radius * 20) / (dist * dist);
        this.vx += (dx / dist) * force * 0.01;
        this.vy += (dy / dist) * force * 0.01;
      }
    });

    // 鼠标排斥
    if (mouse.active && mouse.x && mouse.y) {
      const dx = this.x - mouse.x;
      const dy = this.y - mouse.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 100) {
        const force = (100 - dist) / 20;
        this.vx += (dx / dist) * force * 0.2;
        this.vy += (dy / dist) * force * 0.2;
      }
    }

    // 阻力
    this.vx *= 0.98;
    this.vy *= 0.98;

    // 速度限制
    const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (speed > 2) {
      this.vx = (this.vx / speed) * 2;
      this.vy = (this.vy / speed) * 2;
    }

    // 更新位置
    this.x += this.vx;
    this.y += this.vy;
    this.z += this.vx * 0.5;

    // 边界重置
    if (this.x < -50) this.x = canvas.width + 50;
    if (this.x > canvas.width + 50) this.x = -50;
    if (this.y < -50) this.y = canvas.height + 50;
    if (this.y > canvas.height + 50) this.y = -50;
    if (this.z < -200) this.z = 200;
    if (this.z > 200) this.z = -200;
  }

  draw(rotX, rotY) {
    // 应用3D旋转
    let point = { x: this.x, y: this.y, z: this.z };
    point = rotateX(point, rotX);
    point = rotateY(point, rotY);

    const proj = project(point, 1);

    const size = this.radius * (0.5 + proj.scale * 0.5);
    const opacity = this.opacity * (0.5 + proj.scale * 0.5);

    ctx.beginPath();
    ctx.arc(this.x + proj.x - this.x, this.y + proj.y - this.y, size, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 220, 150, ${opacity})`;
    ctx.fill();
  }
}

// 轨道连线
function drawOrbitConnections(cx, cy) {
  planets.forEach(planet => {
    if (planet.orbitRadius > 0) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, planet.orbitRadius, planet.orbitRadius * 0.5, 0, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 200, 100, 0.05)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  });
}

// 背景星星
function drawStarfield() {
  const seed = 12345;
  for (let i = 0; i < 200; i++) {
    const x = ((seed * (i + 1) * 9301 + 49297) % 233280) / 233280 * canvas.width;
    const y = ((seed * (i + 1) * 7841 + 23457) % 233280) / 233280 * canvas.height;

    ctx.beginPath();
    ctx.arc(x, y, 0.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.fill();
  }
}

function createPlanets() {
  const cx = canvas.width * 0.5;
  const cy = canvas.height * 0.5;
  const size = Math.min(canvas.width, canvas.height);

  // 更大的主星球 - 占据屏幕约3/4
  const mainRadius = size * 0.42;

  planets = [
    new Planet(cx, cy, mainRadius, 600, 'rgba(255, 215, 100, 1)', 0, 0),
    new Planet(cx + mainRadius * 1.3, cy - mainRadius * 0.15, mainRadius * 0.15, 100, 'rgba(255, 180, 80, 1)', mainRadius * 1.25, 0.003),
    new Planet(cx - mainRadius * 1.25, cy + mainRadius * 0.2, mainRadius * 0.18, 110, 'rgba(200, 180, 255, 1)', mainRadius * 1.2, -0.002)
  ];

  particles = [];
  for (let i = 0; i < 50; i++) {
    particles.push(new FloatingParticle());
  }
}

function animate() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 背景
  ctx.fillStyle = '#000008';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 星空
  drawStarfield();

  const cx = canvas.width * 0.5;
  const cy = canvas.height * 0.5;

  // 轨道
  drawOrbitConnections(cx, cy);

  // 平滑拖拽
  dragRotation.x += (targetRotation.x - dragRotation.x) * 0.1;
  dragRotation.y += (targetRotation.y - dragRotation.y) * 0.1;

  // 更新和绘制行星
  planets.forEach(planet => {
    planet.update(cx, cy, dragRotation.x, dragRotation.y);
    planet.draw();
  });

  // 更新和绘制漂浮粒子
  particles.forEach(p => {
    p.update(planets, dragRotation.x, dragRotation.y);
    p.draw(dragRotation.x, dragRotation.y);
  });

  requestAnimationFrame(animate);
}

// 鼠标事件
function handleMouseDown(e) {
  dragStart.x = e.clientX;
  dragStart.y = e.clientY;
  mouse.pressed = true;
  isDragging = false;

  // 长按检测
  dragTimeout = setTimeout(() => {
    if (mouse.pressed) {
      isDragging = true;
      canvas.style.cursor = 'grabbing';
    }
  }, 150);
}

function handleMouseMove(e) {
  mouse.x = e.clientX;
  mouse.y = e.clientY;
  mouse.active = true;

  if (isDragging && mouse.pressed) {
    const deltaX = (e.clientX - dragStart.x) * 0.005;
    const deltaY = (e.clientY - dragStart.y) * 0.005;

    targetRotation.y = dragRotation.y + deltaX;
    targetRotation.x = dragRotation.x + deltaY;
  }
}

function handleMouseUp(e) {
  clearTimeout(dragTimeout);

  if (!isDragging) {
    // 点击事件 - 可以触发其他功能
  }

  mouse.pressed = false;
  isDragging = false;
  canvas.style.cursor = 'default';
}

function handleMouseLeave() {
  mouse.active = false;
  mouse.pressed = false;
  isDragging = false;
  canvas.style.cursor = 'default';
}

// 触摸支持
function handleTouchStart(e) {
  e.preventDefault();
  const touch = e.touches[0];
  dragStart.x = touch.clientX;
  dragStart.y = touch.clientY;
  mouse.pressed = true;
  isDragging = false;

  dragTimeout = setTimeout(() => {
    if (mouse.pressed) {
      isDragging = true;
    }
  }, 150);
}

function handleTouchMove(e) {
  e.preventDefault();
  const touch = e.touches[0];
  mouse.x = touch.clientX;
  mouse.y = touch.clientY;
  mouse.active = true;

  if (isDragging && mouse.pressed) {
    const deltaX = (touch.clientX - dragStart.x) * 0.005;
    const deltaY = (touch.clientY - dragStart.y) * 0.005;

    targetRotation.y = dragRotation.y + deltaX;
    targetRotation.x = dragRotation.x + deltaY;
  }
}

function handleTouchEnd(e) {
  clearTimeout(dragTimeout);
  mouse.pressed = false;
  isDragging = false;
}

function handleResize() {
  initCanvas();
  createPlanets();
}

// Initialize
initCanvas();
createPlanets();
animate();

// Event listeners
canvas.addEventListener('mousedown', handleMouseDown);
canvas.addEventListener('mousemove', handleMouseMove);
canvas.addEventListener('mouseup', handleMouseUp);
canvas.addEventListener('mouseleave', handleMouseLeave);
canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
canvas.addEventListener('touchend', handleTouchEnd);
window.addEventListener('resize', handleResize);
