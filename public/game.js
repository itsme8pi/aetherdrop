```javascript
const socket = io();

const WEAPONS = {
  AK47: { name: 'AK47', type: 'AR', damage: 34, fireRate: 140, mag: 30, recoil: 0.035, range: 130, zoom: 55 },
  M4A1: { name: 'M4A1', type: 'AR', damage: 28, fireRate: 120, mag: 30, recoil: 0.018, range: 135, zoom: 55 },
  SCAR: { name: 'SCAR', type: 'AR', damage: 29, fireRate: 130, mag: 30, recoil: 0.016, range: 130, zoom: 55 },
  MP40: { name: 'MP40', type: 'SMG', damage: 22, fireRate: 75, mag: 24, recoil: 0.022, range: 65, zoom: 65 },
  M1887: { name: 'M1887', type: 'Shotgun', damage: 95, fireRate: 650, mag: 2, recoil: 0.06, range: 28, zoom: 70 },
  AWM: { name: 'AWM', type: 'Sniper', damage: 145, fireRate: 1100, mag: 5, recoil: 0.05, range: 220, zoom: 18 },
  DesertEagle: { name: 'Desert Eagle', type: 'Pistol', damage: 55, fireRate: 300, mag: 7, recoil: 0.03, range: 85, zoom: 65 },
  Pan: { name: 'Pan', type: 'Melee', damage: 80, fireRate: 400, mag: 999, recoil: 0, range: 4.5, zoom: 75 }
};

const BADGES = [
  { id: 'first_blood', title: 'First Blood', desc: 'Get your 1st elimination', check: (s) => s.kills >= 1 },
  { id: 'booyah_master', title: 'Booyah Champion', desc: 'Win your 1st Battle Royale', check: (s) => s.wins >= 1 },
  { id: 'sharpshooter', title: 'Sharpshooter', desc: 'Reach 25 Total Kills', check: (s) => s.kills >= 25 },
  { id: 'veteran', title: 'Island Veteran', desc: 'Play 10 Matches', check: (s) => s.matches >= 10 }
];

const isMobile = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

const canvas = document.getElementById('gameCanvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x6ec6ff);
scene.fog = new THREE.FogExp2(0x87ceeb, 0.0045);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 450);

const hemiLight = new THREE.HemisphereLight(0xffffff, 0x3b7a57, 0.85);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xfff5e0, 1.1);
dirLight.position.set(80, 140, 60);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 1024;
dirLight.shadow.mapSize.height = 1024;
scene.add(dirLight);

const colliders = [];
let safeZoneMesh = null;

function buildIslandMap() {
  const groundGeo = new THREE.CircleGeometry(210, 48);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x3da34d, roughness: 0.9 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const waterGeo = new THREE.PlaneGeometry(1200, 1200);
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.2 });
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.4;
  scene.add(water);

  const buildingMat = new THREE.MeshStandardMaterial({ color: 0xd6cbb8, roughness: 0.8 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.7 });

  const buildingSpots = [
    [-35, -30, 14, 9, 12],
    [45, -25, 16, 10, 14],
    [-25, 50, 12, 8, 12],
,
    [0, -75, 18, 9, 12],
    [-75, 15, 14, 10, 14],
    [80, -60, 12, 12, 12]
  ];

  buildingSpots.forEach(([x, z, w, h, d]) => {
    const bMesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), buildingMat);
    bMesh.position.set(x, h / 2, z);
    bMesh.castShadow = true;
    bMesh.receiveShadow = true;
    scene.add(bMesh);

    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.75, 3.5, 4), roofMat);
    roof.position.set(x, h + 1.75, z);
    roof.rotation.y = Math.PI / 4;
    scene.add(roof);

    colliders.push({ x, z, hw: w / 2 + 0.6, hd: d / 2 + 0.6 });
  });

  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4423 });
  const leavesMat = new THREE.MeshStandardMaterial({ color: 0x1e6b34 });
  for (let i = 0; i < 65; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 18 + Math.random() * 155;
    const tx = Math.cos(angle) * dist;
    const tz = Math.sin(angle) * dist;

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 4, 6), trunkMat);
    trunk.position.set(tx, 2, tz);
    trunk.castShadow = true;
    scene.add(trunk);

    const foliage = new THREE.Mesh(new THREE.ConeGeometry(2.6, 5.5, 7), leavesMat);
    foliage.position.set(tx, 5.5, tz);
    foliage.castShadow = true;
    scene.add(foliage);

    colliders.push({ x: tx, z: tz, hw: 0.8, hd: 0.8 });
  }

  const zoneGeo = new THREE.CylinderGeometry(180, 180, 45, 48, 1, true);
  const zoneMat = new THREE.MeshBasicMaterial({
    color: 0x00aaff, transparent: true, opacity: 0.28, side: THREE.DoubleSide
  });
  safeZoneMesh = new THREE.Mesh(zoneGeo, zoneMat);
  safeZoneMesh.position.y = 22;
  scene.add(safeZoneMesh);
}
buildIslandMap();

function createCharacterMesh(color = 0xff9d00) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 1.3, 0.5),
    new THREE.MeshStandardMaterial({ color })
  );
  body.position.y = 1.15;
  body.castShadow = true;
  group.add(body);

  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.55, 0.55),
    new THREE.MeshStandardMaterial({ color: 0xfcd34d })
  );
  head.position.y = 2.15;
  group.add(head);

  const legs = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.6, 0.45),
    new THREE.MeshStandardMaterial({ color: 0x1e293b })
  );
  legs.position.y = 0.3;
  group.add(legs);

  return group;
}

const lobbyAvatar = createCharacterMesh(0xff8800);
lobbyAvatar.position.set(0, 0, 0);
scene.add(lobbyAvatar);

let gameState = 'LOBBY';
const localPlayer = {
  x: 0, y: 0, z: 0, vy: 0, rotY: 0, pitch: 0,
  hp: 200, armor: 100, kills: 0,
  crouching: false, scoped: false,
  slots: [
    { key: 'AK47', ammo: 30 },
    { key: 'MP40', ammo: 24 },
    { key: 'Pan', ammo: 999 }
  ],
  activeSlot: 0,
  glooCount: 3,
  medCount: 2,
  lastShot: 0
};

const remoteMeshes = {};
const lootMeshes = {};
const glooMeshes = [];
const bulletTracers = [];
let currentZone = { x: 0, z: 0, radius: 180 };
let nearbyLoot = null;

const keys = {};
let joyVec = { x: 0, y: 0 };
let isFiringTouch = false;

window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (gameState !== 'PLAYING') return;
  if (e.code === 'Digit1') selectWeaponSlot(0);
  if (e.code === 'Digit2') selectWeaponSlot(1);
  if (e.code === 'Digit3') selectWeaponSlot(2);
  if (e.code === 'KeyR') reloadWeapon();
  if (e.code === 'KeyG') useGlooWall();
  if (e.code === 'KeyH') useMedkit();
  if (e.code === 'KeyF') pickupNearbyLoot();
  if (e.code === 'KeyC') localPlayer.crouching = !localPlayer.crouching;
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

document.addEventListener('mousemove', (e) => {
  if (gameState === 'PLAYING' && document.pointerLockElement === canvas) {
    localPlayer.rotY -= e.movementX * 0.0025;
    localPlayer.pitch = Math.max(-0.6, Math.min(0.6, localPlayer.pitch - e.movementY * 0.002));
  }
});

canvas.addEventListener('mousedown', (e) => {
  if (gameState !== 'PLAYING') return;
  if (!isMobile && document.pointerLockElement !== canvas) {
    canvas.requestPointerLock();
    return;
  }
  if (e.button === 0) fireWeapon();
  if (e.button === 2) toggleScope();
});
window.addEventListener('contextmenu', (e) => e.preventDefault());

function initMobileControls() {
  if (!isMobile) {
    document.getElementById('pcControlsHint').classList.remove('hidden');
    return;
  }
  document.getElementById('mobileControls').classList.remove('hidden');

  const joyZone = document.getElementById('joystickZone');
  const joyKnob = document.getElementById('joystickKnob');
  let joyTouchId = null;

  joyZone.addEventListener('touchstart', (e) => {
    e.preventDefault();
    joyTouchId = e.changedTouches[0].identifier;
  });

  joyZone.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === joyTouchId) {
        const rect = joyZone.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = Math.max(-40, Math.min(40, t.clientX - cx));
        const dy = Math.max(-40, Math.min(40, t.clientY - cy));
        joyKnob.style.transform = 'translate(' + dx + 'px, ' + dy + 'px)';
        joyVec.x = dx / 40;
        joyVec.y = dy / 40;
      }
    }
  });

  joyZone.addEventListener('touchend', () => {
    joyTouchId = null;
    joyKnob.style.transform = 'translate(0px, 0px)';
    joyVec = { x: 0, y: 0 };
  });

  let lastTouchX = null;
  canvas.addEventListener('touchstart', (e) => {
    if (e.touches[0].clientX > window.innerWidth * 0.35) lastTouchX = e.touches[0].clientX;
  });
  canvas.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    if (t.clientX > window.innerWidth * 0.35 && lastTouchX !== null) {
      localPlayer.rotY -= (t.clientX - lastTouchX) * 0.008;
      lastTouchX = t.clientX;
    }
  });

  document.getElementById('btnFire').addEventListener('touchstart', (e) => { e.preventDefault(); isFiringTouch = true; fireWeapon(); });
  document.getElementById('btnFire').addEventListener('touchend', () => { isFiringTouch = false; });
  document.getElementById('btnScope').addEventListener('touchstart', (e) => { e.preventDefault(); toggleScope(); });
  document.getElementById('btnGloo').addEventListener('touchstart', (e) => { e.preventDefault(); useGlooWall(); });
  document.getElementById('btnJump').addEventListener('touchstart', (e) => { e.preventDefault(); if (localPlayer.y <= 0.05) localPlayer.vy = 8.5; });
document.getElementById('btnCrouch').addEventListener('touchstart', (e) => { e.preventDefault(); localPlayer.crouching = !localPlayer.crouching; });
document.getElementById('btnReload').addEventListener('touchstart', (e) => { e.preventDefault(); reloadWeapon(); });
document.getElementById('btnLoot').addEventListener('touchstart', (e) => { e.preventDefault(); pickupNearbyLoot(); });
}
window.selectWeaponSlot = function (idx) {
localPlayer.activeSlot = idx;
localPlayer.scoped = false;
camera.fov = 75;
camera.updateProjectionMatrix();
document.getElementById('sniperScope').classList.add('hidden');
document.querySelectorAll('.w-slot').forEach((el, i) => el.classList.toggle('active', i === idx));
};
function toggleScope() {
const wSpec = WEAPONS[localPlayer.slots[localPlayer.activeSlot].key];
localPlayer.scoped = !localPlayer.scoped;
camera.fov = localPlayer.scoped ? wSpec.zoom : 75;
camera.updateProjectionMatrix();
if (wSpec.name === 'AWM' && localPlayer.scoped) {
document.getElementById('sniperScope').classList.remove('hidden');
} else {
document.getElementById('sniperScope').classList.add('hidden');
}
}
function reloadWeapon() {
const slot = localPlayer.slots[localPlayer.activeSlot];
const spec = WEAPONS[slot.key];
slot.ammo = spec.mag;
updateHudBars();
}
window.useGlooWall = function () {
if (localPlayer.glooCount <= 0) return;
localPlayer.glooCount--;
const gx = localPlayer.x - Math.sin(localPlayer.rotY) * 3.2;
const gz = localPlayer.z - Math.cos(localPlayer.rotY) * 3.2;
socket.emit('deployGloo', { x: gx, z: gz, rotY: localPlayer.rotY });
updateHudBars();
};
window.useMedkit = function () {
if (localPlayer.medCount <= 0 || localPlayer.hp >= 200) return;
localPlayer.medCount--;
localPlayer.hp = Math.min(200, localPlayer.hp + 75);
updateHudBars();
};
function fireWeapon() {
const now = performance.now();
const slot = localPlayer.slots[localPlayer.activeSlot];
const spec = WEAPONS[slot.key];
if (now - localPlayer.lastShot < spec.fireRate) return;
if (slot.ammo <= 0) { reloadWeapon(); return; }
localPlayer.lastShot = now;
if (spec.mag < 999) slot.ammo--;
localPlayer.pitch += spec.recoil;
updateHudBars();
const raycaster = new THREE.Raycaster();
raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
raycaster.far = spec.range;
let hitId = null;
const enemyTargets = Object.values(remoteMeshes);
const intersects = raycaster.intersectObjects(enemyTargets, true);
if (intersects.length > 0) {
let obj = intersects[0].object;
while (obj.parent && !obj.userData.fighterId) obj = obj.parent;
if (obj.userData.fighterId) hitId = obj.userData.fighterId;
}
spawnBulletTracer(localPlayer.x, localPlayer.y + 1.5, localPlayer.z, localPlayer.rotY + Math.PI);
socket.emit('playerShoot', {
x: localPlayer.x,
y: localPlayer.y + 1.5,
z: localPlayer.z,
rotY: localPlayer.rotY + Math.PI,
weapon: spec.name,
damage: spec.damage,
hitId
});
}
function spawnBulletTracer(x, y, z, rotY) {
const geo = new THREE.BoxGeometry(0.08, 0.08, 2.2);
const mat = new THREE.MeshBasicMaterial({ color: 0xffea00 });
const tracer = new THREE.Mesh(geo, mat);
tracer.position.set(x, y, z);
tracer.rotation.y = rotY;
scene.add(tracer);
bulletTracers.push({ mesh: tracer, vx: Math.sin(rotY) * 90, vz: Math.cos(rotY) * 90, life: 0.45 });
}
function spawnGlooMesh(wall) {
const geo = new THREE.BoxGeometry(4.2, 2.8, 0.5);
const mat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.3, metalness: 0.2 });
const mesh = new THREE.Mesh(geo, mat);
mesh.position.set(wall.x, 1.4, wall.z);
mesh.rotation.y = wall.rotY;
scene.add(mesh);
glooMeshes.push(mesh);
colliders.push({ x: wall.x, z: wall.z, hw: 2.1, hd: 0.6 });
}
function pickupNearbyLoot() {
if (!nearbyLoot) return;
socket.emit('pickupLoot', { lootId: nearbyLoot.id });
const t = nearbyLoot.type;
if (WEAPONS[t]) {
localPlayer.slots[0] = { key: t, ammo: WEAPONS[t].mag };
selectWeaponSlot(0);
} else if (t === 'MEDKIT') {
localPlayer.medCount++;
} else if (t === 'GLOO') {
localPlayer.glooCount++;
} else if (t === 'AMMO') {
reloadWeapon();
}
updateHudBars();
}
function updateHudBars() {
document.getElementById('hpBar').style.width = Math.max(0, (localPlayer.hp / 200) * 100) + '%';
document.getElementById('hpText').innerText = 'HP ' + Math.ceil(localPlayer.hp) + '/200';
document.getElementById('armorBar').style.width = Math.max(0, localPlayer.armor) + '%';
document.getElementById('wName0').innerText = localPlayer.slots[0].key;
document.getElementById('wAmmo0').innerText = localPlayer.slots[0].ammo;
document.getElementById('wName1').innerText = localPlayer.slots[1].key;
document.getElementById('wAmmo1').innerText = localPlayer.slots[1].ammo;
document.getElementById('glooCount').innerText = localPlayer.glooCount;
document.getElementById('medCount').innerText = localPlayer.medCount;
}
function renderMinimap() {
const mm = document.getElementById('minimapCanvas');
const ctx = mm.getContext('2d');
ctx.clearRect(0, 0, 140, 140);
ctx.fillStyle = '#1e3a2f';
ctx.beginPath();
ctx.arc(70, 70, 65, 0, Math.PI * 2);
ctx.fill();
const scale = 65 / 180;
ctx.strokeStyle = '#00aaff';
ctx.lineWidth = 2;
ctx.beginPath();
ctx.arc(70 + currentZone.x * scale, 70 + currentZone.z * scale, currentZone.radius * scale, 0, Math.PI * 2);
ctx.stroke();
ctx.fillStyle = '#ff9d00';
ctx.beginPath();
ctx.arc(70 + localPlayer.x * scale, 70 + localPlayer.z * scale, 3.5, 0, Math.PI * 2);
ctx.fill();
}
socket.on('matchStarted', (data) => {
gameState = 'PLAYING';
lobbyAvatar.visible = false;
document.getElementById('lobbyScreen').classList.add('hidden');
document.getElementById('gameHud').classList.remove('hidden');
initMobileControls();
const me = data.players[socket.id];
if (me) {
localPlayer.x = me.x;
localPlayer.z = me.z;
localPlayer.hp = 200;
localPlayer.armor = 100;
localPlayer.kills = 0;
}
const lootGeo = new THREE.BoxGeometry(0.9, 0.6, 0.9);
const lootMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0x713f12 });
data.loot.forEach((item) => {
const mesh = new THREE.Mesh(lootGeo, lootMat);
mesh.position.set(item.x, 0.35, item.z);
scene.add(mesh);
lootMeshes[item.id] = { mesh, data: item };
});
updateHudBars();
});
socket.on('worldTick', (data) => {
if (gameState !== 'PLAYING') return;
document.getElementById('aliveCount').innerText = data.aliveCount;
currentZone = data.zone;
if (safeZoneMesh) {
safeZoneMesh.scale.set(currentZone.radius / 180, 1, currentZone.radius / 180);
}
const me = data.players[socket.id];
if (me) {
localPlayer.hp = me.hp;
localPlayer.armor = me.armor;
localPlayer.kills = me.kills;
document.getElementById('matchKills').innerText = localPlayer.kills;
updateHudBars();
const outside = Math.hypot(localPlayer.x, localPlayer.z) > currentZone.radius;
document.getElementById('zoneWarning').classList.toggle('hidden', !outside);
if (!me.alive) {
endMatch(false);
}
}
const activeIds = new Set();
const allEntities = { ...data.players, ...data.bots };
Object.values(allEntities).forEach((entity) => {
if (entity.id === socket.id || !entity.alive) return;
activeIds.add(entity.id);
if (!remoteMeshes[entity.id]) {
const m = createCharacterMesh(entity.isBot ? 0xef4444 : 0x3b82f6);
m.userData.fighterId = entity.id;
scene.add(m);
remoteMeshes[entity.id] = m;
}
remoteMeshes[entity.id].position.set(entity.x, entity.y || 0, entity.z);
remoteMeshes[entity.id].rotation.y = entity.rotY;
});
for (const id in remoteMeshes) {
if (!activeIds.has(id)) {
scene.remove(remoteMeshes[id]);
delete remoteMeshes[id];
}
}
});
socket.on('bulletFired', (data) => {
spawnBulletTracer(data.x, data.y, data.z, data.rotY);
});
socket.on('glooDeployed', (wall) => {
spawnGlooMesh(wall);
});
socket.on('lootTaken', ({ lootId }) => {
if (lootMeshes[lootId]) {
scene.remove(lootMeshes[lootId].mesh);
delete lootMeshes[lootId];
}
});
socket.on('hitConfirmed', () => {
const hm = document.getElementById('hitmarker');
hm.classList.remove('hidden');
setTimeout(() => hm.classList.add('hidden'), 140);
});
socket.on('playerEliminated', (ev) => {
const feed = document.getElementById('killFeed');
const div = document.createElement('div');
div.className = 'kill-msg';
div.innerText = ev.killerName + ' eliminated ' + ev.victimName;
feed.prepend(div);
setTimeout(() => div.remove(), 4000);
});
socket.on('matchEnded', ({ winner }) => {
if (gameState !== 'PLAYING') return;
const isWin = winner && winner.id === socket.id;
endMatch(isWin);
});
async function endMatch(isWin) {
gameState = 'ENDED';
if (document.pointerLockElement) document.exitPointerLock();
document.getElementById('gameHud').classList.add('hidden');
document.getElementById('resultScreen').classList.remove('hidden');
document.getElementById('resultTitle').innerText = isWin ? 'BOOYAH!' : 'ELIMINATED';
document.getElementById('resultTitle').style.color = isWin ? '#ffc400' : '#ef4444';
document.getElementById('resultSubtitle').innerText = isWin ? 'LAST SURVIVOR STANDING' : 'BETTER LUCK NEXT DROP';
document.getElementById('resKills').innerText = localPlayer.kills;
const xp = await PlayerDB.recordMatchResult({ kills: localPlayer.kills, isWin });
document.getElementById('resXp').innerText = '+' + (xp || 50) + ' XP';
refreshLobbyUI();
}
const clock = new THREE.Clock();
function animate() {
requestAnimationFrame(animate);
const dt = Math.min(clock.getDelta(), 0.1);
if (gameState === 'LOBBY') {
lobbyAvatar.rotation.y += 0.8 * dt;
camera.position.set(0, 1.8, 4.2);
camera.lookAt(0, 1.2, 0);
} else if (gameState === 'PLAYING') {
const forward = (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0) - joyVec.y;
const strafe = (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0) + joyVec.x;
const speed = (keys['ShiftLeft'] ? 11 : 7.5) * (localPlayer.crouching ? 0.55 : 1);
const sin = Math.sin(localPlayer.rotY);
const cos = Math.cos(localPlayer.rotY);
const nextX = localPlayer.x + (-sin * forward + cos * strafe) * speed * dt;
const nextZ = localPlayer.z + (-cos * forward - sin * strafe) * speed * dt;
let blocked = false;
for (const c of colliders) {
if (Math.abs(nextX - c.x) < c.hw && Math.abs(nextZ - c.z) < c.hd) {
blocked = true;
break;
}
}
if (!blocked) {
localPlayer.x = Math.max(-185, Math.min(185, nextX));
localPlayer.z = Math.max(-185, Math.min(185, nextZ));
}
if (keys['Space'] && localPlayer.y <= 0.05) localPlayer.vy = 8.5;
localPlayer.vy -= 22 * dt;
localPlayer.y = Math.max(0, localPlayer.y + localPlayer.vy * dt);
const eyeHeight = localPlayer.crouching ? 1.1 : 1.75;
camera.position.set(localPlayer.x, localPlayer.y + eyeHeight, localPlayer.z);
camera.rotation.order = 'YXZ';
camera.rotation.y = localPlayer.rotY;
camera.rotation.x = localPlayer.pitch;
if (isFiringTouch) fireWeapon();
nearbyLoot = null;
for (const id in lootMeshes) {
const item = lootMeshes[id].data;
if (item.active && Math.hypot(item.x - localPlayer.x, item.z - localPlayer.z) < 2.6) {
nearbyLoot = item;
break;
}
}
document.getElementById('lootPrompt').classList.toggle('hidden', !nearbyLoot);
if (isMobile) document.getElementById('btnLoot').classList.toggle('hidden', !nearbyLoot);
if (nearbyLoot) document.getElementById('lootName').innerText = nearbyLoot.type;
socket.emit('playerMove', {
x: localPlayer.x,
y: localPlayer.y,
z: localPlayer.z,
rotY: localPlayer.rotY + Math.PI,
weapon: localPlayer.slots[localPlayer.activeSlot].key,
crouching: localPlayer.crouching
});
renderMinimap();
}
for (let i = bulletTracers.length - 1; i >= 0; i--) {
const b = bulletTracers[i];
b.mesh.position.x += b.vx * dt;
b.mesh.position.z += b.vz * dt;
b.life -= dt;
if (b.life <= 0) {
scene.remove(b.mesh);
bulletTracers.splice(i, 1);
}
}
renderer.render(scene, camera);
}
animate();
function refreshLobbyUI() {
const s = PlayerDB.stats;
document.getElementById('displayUsername').innerText = (PlayerDB.currentUser ? PlayerDB.currentUser.username : 'SURVIVOR').toUpperCase();
document.getElementById('statLevel').innerText = s.level;
document.getElementById('xpFill').style.width = ((s.xp % 500) / 5) + '%';
document.getElementById('quickWins').innerText = s.wins;
document.getElementById('quickKills').innerText = s.kills;
document.getElementById('quickMatches').innerText = s.matches;
document.getElementById('profLevel').innerText = s.level;
document.getElementById('profWins').innerText = s.wins;
document.getElementById('profKills').innerText = s.kills;
document.getElementById('profMatches').innerText = s.matches;
const armoryGrid = document.getElementById('armoryGrid');
armoryGrid.innerHTML = Object.values(WEAPONS).map((w) =>
'' + w.name + ' (' + w.type + ')' +
'Damage: ' + w.damage + ' | Mag: ' + w.mag + '' +
'Range: ' + w.range + 'm'
).join('');
const badgesGrid = document.getElementById('badgesGrid');
badgesGrid.innerHTML = BADGES.map((b) => {
const unlocked = b.check(s);
return '' +
'' + (unlocked ? '🏆' : '🔒') + ' ' + b.title + '' +
'' + b.desc + '';
}).join('');
}
document.getElementById('signupBtn').onclick = async () => {
try {
await PlayerDB.signup(
document.getElementById('usernameInput').value,
document.getElementById('passwordInput').value
);
document.getElementById('authScreen').classList.add('hidden');
document.getElementById('lobbyScreen').classList.remove('hidden');
refreshLobbyUI();
} catch (err) {
document.getElementById('authError').innerText = err.message;
}
};
document.getElementById('loginBtn').onclick = async () => {
try {
await PlayerDB.login(
document.getElementById('usernameInput').value,
document.getElementById('passwordInput').value
);
document.getElementById('authScreen').classList.add('hidden');
document.getElementById('lobbyScreen').classList.remove('hidden');
refreshLobbyUI();
} catch (err) {
document.getElementById('authError').innerText = err.message;
}
};
document.getElementById('logoutBtn').onclick = () => location.reload();
document.querySelectorAll('.nav-tab').forEach((btn) => {
btn.onclick = () => {
document.querySelectorAll('.nav-tab').forEach((b) => b.classList.remove('active'));
btn.classList.add('active');
const target = btn.dataset.tab;
document.querySelectorAll('.tab-content').forEach((tc) => tc.classList.add('hidden'));
document.getElementById('tab-' + target).classList.remove('hidden');
};
});
document.getElementById('playBtn').onclick = () => {
document.getElementById('playBtn').classList.add('hidden');
document.getElementById('matchmakingStatus').classList.remove('hidden');
socket.emit('findMatch', { username: PlayerDB.currentUser ? PlayerDB.currentUser.username : 'Survivor' });
};
document.getElementById('backToLobbyBtn').onclick = () => location.reload();
window.addEventListener('resize', () => {
camera.aspect = window.innerWidth / window.innerHeight;
camera.updateProjectionMatrix();
renderer.setSize(window.innerWidth, window.innerHeight);
});
