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
    [-35, -30, 14, 9, 12], [45, -25, 16, 10, 14], [-25, 50, 12, 8, 12],
, [0, -75, 18, 9, 12], [-75, 15, 14, 10, 14], [80, -60, 12, 12, 12]
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
let localPlayer = {
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

let remoteMeshes = {};
let lootMeshes = {};
let glooMeshes = [];
let bulletTracers = [];
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
    for (let t of e.changedTouches) {
      if (t.identifier === joyTouchId) {
        const rect = joyZone.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = Math.max(-40, Math.min(40, t.clientX - cx));
        const dy = Math.max(-40, Math.min(40, t.clientY - cy));
        joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
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
