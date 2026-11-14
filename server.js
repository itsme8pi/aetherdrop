const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

const TARGET_PLAYERS = 16;
const MAP_RADIUS = 180;
const BOT_NAMES = [
  'Viper_X', 'ShadowReaper', 'BlazeKing', 'NovaSniper', 'GhostRider',
  'TITAN_99', 'AlphaWolf', 'RaptorZero', 'VenomStrike', 'ApexValkyrie',
  'CyberNinja', 'StormBreaker', 'Phoenix_IND', 'CobraKai', 'Wraith_07'
];
const BOT_WEAPONS = ['AK47', 'M4A1', 'SCAR', 'MP40', 'M1887', 'AWM'];

const rooms = {};

function getOrCreateRoom() {
  for (const id in rooms) {
    if (rooms[id].state === 'waiting' && Object.keys(rooms[id].players).length < TARGET_PLAYERS) {
      return rooms[id];
    }
  }
  const roomId = 'room_' + Date.now();
  rooms[roomId] = {
    id: roomId,
    state: 'waiting',
    players: {},
    bots: {},
    glooWalls: [],
    loot: generateLoot(),
    zone: { x: 0, z: 0, radius: MAP_RADIUS, nextRadius: 120, shrinkTimer: 25 },
    matchTimer: 0
  };
  return rooms[roomId];
}

function generateLoot() {
  const items = [];
  const types = ['AK47', 'M4A1', 'SCAR', 'MP40', 'M1887', 'AWM', 'MEDKIT', 'GLOO', 'AMMO'];
  for (let i = 0; i < 65; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * (MAP_RADIUS - 20);
    items.push({
      id: 'loot_' + i,
      type: types[Math.floor(Math.random() * types.length)],
      x: Math.cos(angle) * dist,
      z: Math.sin(angle) * dist,
      active: true
    });
  }
  return items;
}

function spawnBots(room) {
  const currentCount = Object.keys(room.players).length;
  const needed = Math.max(0, TARGET_PLAYERS - currentCount);
  for (let i = 0; i < needed; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 30 + Math.random() * (MAP_RADIUS - 45);
    const botId = 'bot_' + i + '_' + Date.now();
    room.bots[botId] = {
      id: botId,
      name: BOT_NAMES[i % BOT_NAMES.length],
      isBot: true,
      x: Math.cos(angle) * dist,
      y: 0,
      z: Math.sin(angle) * dist,
      rotY: Math.random() * Math.PI * 2,
      hp: 200,
      maxHp: 200,
      armor: 100,
      weapon: BOT_WEAPONS[Math.floor(Math.random() * BOT_WEAPONS.length)],
      glooCount: 2,
      alive: true,
      kills: 0,
      targetX: (Math.random() - 0.5) * 140,
      targetZ: (Math.random() - 0.5) * 140,
      fireCooldown: 0,
      glooCooldown: 0
    };
  }
}

function startMatch(room) {
  if (room.state !== 'waiting') return;
  room.state = 'playing';
  spawnBots(room);

  Object.values(room.players).forEach((p) => {
    const angle = Math.random() * Math.PI * 2;
    const dist = 20 + Math.random() * (MAP_RADIUS - 40);
    p.x = Math.cos(angle) * dist;
    p.z = Math.sin(angle) * dist;
    p.hp = 200;
    p.armor = 100;
    p.alive = true;
    p.kills = 0;
  });

  io.to(room.id).emit('matchStarted', {
    roomId: room.id,
    players: room.players,
    bots: room.bots,
    loot: room.loot,
    zone: room.zone
  });

  room.interval = setInterval(() => updateRoom(room), 50);
}

function updateRoom(room) {
  if (room.state !== 'playing') return;
  const dt = 0.05;
  room.matchTimer += dt;

  if (room.zone.shrinkTimer > 0) {
    room.zone.shrinkTimer -= dt;
  } else if (room.zone.radius > 14) {
    room.zone.radius -= 1.8 * dt;
  }

  const allFighters = [
    ...Object.values(room.players).filter((p) => p.alive),
    ...Object.values(room.bots).filter((b) => b.alive)
  ];

  if (allFighters.length <= 1) {
    const winner = allFighters[0] || null;
    io.to(room.id).emit('matchEnded', { winner });
    clearInterval(room.interval);
    delete rooms[room.id];
    return;
  }

  allFighters.forEach((f) => {
    const distFromCenter = Math.hypot(f.x - room.zone.x, f.z - room.zone.z);
    if (distFromCenter > room.zone.radius) {
      f.hp -= 6 * dt;
      if (f.hp <= 0) {
        f.hp = 0;
        f.alive = false;
        io.to(room.id).emit('playerEliminated', {
          victimId: f.id,
          victimName: f.name,
          killerId: 'ZONE',
          killerName: 'Aether Storm'
        });
      }
    }
  });

  Object.values(room.bots).forEach((bot) => {
    if (!bot.alive) return;
    bot.fireCooldown = Math.max(0, bot.fireCooldown - dt);
    bot.glooCooldown = Math.max(0, bot.glooCooldown - dt);

    const distToCenter = Math.hypot(bot.x, bot.z);
    if (distToCenter > room.zone.radius - 12) {
      bot.targetX = (Math.random() - 0.5) * (room.zone.radius * 0.6);
      bot.targetZ = (Math.random() - 0.5) * (room.zone.radius * 0.6);
    }

    let nearestEnemy = null;
    let nearestDist = 65;
    allFighters.forEach((other) => {
      if (other.id === bot.id) return;
      const d = Math.hypot(other.x - bot.x, other.z - bot.z);
      if (d < nearestDist) {
        nearestDist = d;
        nearestEnemy = other;
      }
    });

    if (nearestEnemy) {
      const dx = nearestEnemy.x - bot.x;
      const dz = nearestEnemy.z - bot.z;
      bot.rotY = Math.atan2(dx, dz);

      if (nearestDist > 18) {
        bot.x += Math.sin(bot.rotY) * 6.5 * dt;
        bot.z += Math.cos(bot.rotY) * 6.5 * dt;
      } else {
        bot.x += Math.cos(bot.rotY) * 4.5 * dt;
        bot.z -= Math.sin(bot.rotY) * 4.5 * dt;
      }

      if (bot.fireCooldown <= 0) {
        bot.fireCooldown = 0.45 + Math.random() * 0.45;
        io.to(room.id).emit('bulletFired', {
          shooterId: bot.id,
          x: bot.x,
          y: 1.4,
          z: bot.z,
          rotY: bot.rotY,
          weapon: bot.weapon
        });

        if (Math.random() < 0.32) {
          applyDamage(room, bot, nearestEnemy, 18);
        }
      }
    } else {
      const dx = bot.targetX - bot.x;
      const dz = bot.targetZ - bot.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 4) {
        const angle = Math.random() * Math.PI * 2;
        const r = Math.random() * (room.zone.radius - 15);
        bot.targetX = Math.cos(angle) * r;
        bot.targetZ = Math.sin(angle) * r;
      } else {
        bot.rotY = Math.atan2(dx, dz);
        bot.x += Math.sin(bot.rotY) * 6.2 * dt;
        bot.z += Math.cos(bot.rotY) * 6.2 * dt;
      }
    }
  });

  io.to(room.id).emit('worldTick', {
    players: room.players,
    bots: room.bots,
    zone: room.zone,
    aliveCount: allFighters.length
  });
}

function applyDamage(room, attacker, victim, rawDmg) {
  if (!victim || !victim.alive) return;

  if (victim.isBot && victim.hp < 120 && victim.glooCount > 0 && victim.glooCooldown <= 0) {
    victim.glooCount--;
    victim.glooCooldown = 6;
    const gx = victim.x + Math.sin(victim.rotY) * 2.5;
    const gz = victim.z + Math.cos(victim.rotY) * 2.5;
    const wall = { id: 'gloo_' + Date.now() + Math.random(), x: gx, z: gz, rotY: victim.rotY };
    room.glooWalls.push(wall);
    io.to(room.id).emit('glooDeployed', wall);
  }

  let dmg = rawDmg;
  if (victim.armor > 0) {
    const absorbed = Math.min(victim.armor, dmg * 0.45);
    victim.armor -= absorbed;
    dmg -= absorbed;
  }
  victim.hp -= dmg;

  if (victim.hp <= 0) {
    victim.hp = 0;
    victim.alive = false;
    if (attacker) attacker.kills = (attacker.kills || 0) + 1;
    io.to(room.id).emit('playerEliminated', {
      victimId: victim.id,
      victimName: victim.name,
      killerId: attacker ? attacker.id : 'UNKNOWN',
      killerName: attacker ? attacker.name : 'Unknown'
    });
  }
}

io.on('connection', (socket) => {
  let currentRoom = null;

  socket.on('findMatch', ({ username }) => {
    const room = getOrCreateRoom();
    currentRoom = room;
    socket.join(room.id);

    room.players[socket.id] = {
      id: socket.id,
      name: username || 'Survivor_' + socket.id.slice(0, 4),
      isBot: false,
      x: 0,
      y: 0,
      z: 0,
      rotY: 0,
      hp: 200,
      maxHp: 200,
      armor: 100,
      weapon: 'Pistol',
      alive: true,
      kills: 0,
      crouching: false
    };

    setTimeout(() => {
      if (rooms[room.id] && rooms[room.id].state === 'waiting') {
        startMatch(room);
      }
    }, 2500);
  });

  socket.on('playerMove', (data) => {
    if (!currentRoom || !currentRoom.players[socket.id]) return;
    const p = currentRoom.players[socket.id];
    if (!p.alive) return;
    p.x = data.x;
    p.y = data.y;
    p.z = data.z;
    p.rotY = data.rotY;
    p.weapon = data.weapon;
    p.crouching = data.crouching;
  });

  socket.on('playerShoot', (data) => {
    if (!currentRoom || !currentRoom.players[socket.id]) return;
    const shooter = currentRoom.players[socket.id];
    if (!shooter.alive) return;

    socket.to(currentRoom.id).emit('bulletFired', {
      shooterId: socket.id,
      x: data.x,
      y: data.y,
      z: data.z,
      rotY: data.rotY,
      weapon: data.weapon
    });

    if (data.hitId) {
      const target = currentRoom.players[data.hitId] || currentRoom.bots[data.hitId];
      if (target && target.alive) {
        applyDamage(currentRoom, shooter, target, data.damage || 25);
        socket.emit('hitConfirmed', { targetId: data.hitId, targetHp: target.hp });
      }
    }
  });

  socket.on('deployGloo', (data) => {
    if (!currentRoom) return;
    const wall = { id: 'gloo_' + Date.now(), x: data.x, z: data.z, rotY: data.rotY };
    currentRoom.glooWalls.push(wall);
    io.to(currentRoom.id).emit('glooDeployed', wall);
  });

  socket.on('pickupLoot', ({ lootId }) => {
    if (!currentRoom) return;
    const item = currentRoom.loot.find((l) => l.id === lootId && l.active);
    if (item) {
      item.active = false;
      const p = currentRoom.players[socket.id];
      if (p && item.type === 'MEDKIT') p.hp = Math.min(200, p.hp + 75);
      io.to(currentRoom.id).emit('lootTaken', { lootId, playerId: socket.id, type: item.type });
    }
  });

  socket.on('disconnect', () => {
    if (currentRoom && currentRoom.players[socket.id]) {
delete currentRoom.players[socket.id];
}
});
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
console.log(AETHERDROP 3D Server running on port ${PORT});
});
// END OF SERVER.JS
