'use strict';

const request = require('supertest');
const { io: ioClient } = require('socket.io-client');
const { startTestServer, stopTestServer } = require('./testServer');

let ctx;
beforeAll(async () => { ctx = await startTestServer(); });
afterAll(async () => { await stopTestServer(ctx); });

async function registerUser(username) {
  const res = await request(ctx.baseUrl).post('/api/auth/register').send({
    username, email: `${username}@example.com`, password: 'supersecret1',
  });
  return { token: res.body.token, userId: res.body.user.id, username };
}

function connect(token) {
  return ioClient(ctx.baseUrl, {
    auth: { token },
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
  });
}

// A wins: identity board reaches 6 lines at the 21st call; B reaches only 2.
const BOARD_A = Array.from({ length: 25 }, (_, i) => i + 1);
const BOARD_B = [22, 1, 2, 3, 4, 5, 23, 6, 7, 8, 9, 10, 24, 11, 12, 13, 14, 15, 25, 16, 17, 18, 19, 20, 21];
const CALL_SEQUENCE = Array.from({ length: 21 }, (_, i) => i + 1);

test('full match flow: matchmaking, setup, play, decisive win, ratings', async () => {
  const alice = await registerUser('winner_a');
  const bob = await registerUser('loser_b');

  const sockA = connect(alice.token);
  const sockB = connect(bob.token);

  const overA = new Promise((resolve) => sockA.on('game:over', resolve));
  const overB = new Promise((resolve) => sockB.on('game:over', resolve));

  // Wait for both to connect.
  await Promise.all([
    new Promise((r) => sockA.on('connect', r)),
    new Promise((r) => sockB.on('connect', r)),
  ]);

  // Submit boards on match:found.
  sockA.on('match:found', () => sockA.emit('board:submit', { board: BOARD_A }));
  sockB.on('match:found', () => sockB.emit('board:submit', { board: BOARD_B }));

  // Drive calls. Only the socket whose turn it is calls the next number.
  let ptr = 0;
  const drive = (turnUserId) => {
    if (turnUserId == null || ptr >= CALL_SEQUENCE.length) return;
    const n = CALL_SEQUENCE[ptr];
    if (turnUserId === alice.userId) { ptr += 1; sockA.emit('game:call', { number: n }); }
    else if (turnUserId === bob.userId) { ptr += 1; sockB.emit('game:call', { number: n }); }
  };

  sockA.on('game:start', (s) => drive(s.firstPlayer));
  sockA.on('game:update', (u) => { if (!u.over) drive(u.nextTurn); });

  // Kick off matchmaking.
  sockA.emit('queue:join');
  sockB.emit('queue:join');

  const [resA, resB] = await Promise.all([overA, overB]);

  expect(resA.result).toBe('win');
  expect(resB.result).toBe('loss');
  expect(resA.reason).toBe('BINGO');
  expect(resA.ratingChange).toBe(20);
  expect(resA.newRating).toBe(1020);
  expect(resB.ratingChange).toBe(-20);
  expect(resB.newRating).toBe(980);
  expect(resA.yourScore.lines).toBeGreaterThanOrEqual(5);
  expect(resB.yourScore.lines).toBeLessThan(5);

  sockA.close();
  sockB.close();

  // Verify persisted stats.
  const lb = await request(ctx.baseUrl).get('/api/leaderboard').send();
  const names = lb.body.leaderboard.map((r) => r.username);
  expect(names).toContain('winner_a');
  expect(names).toContain('loser_b');
});

test('rejects an invalid board submission', async () => {
  const carol = await registerUser('carol_c');
  const dan = await registerUser('dan_d');
  const sockC = connect(carol.token);
  const sockD = connect(dan.token);
  await Promise.all([
    new Promise((r) => sockC.on('connect', r)),
    new Promise((r) => sockD.on('connect', r)),
  ]);

  const errPromise = new Promise((resolve) => sockC.on('error', resolve));
  sockC.on('match:found', () => sockC.emit('board:submit', { board: [1, 2, 3] })); // invalid
  sockD.on('match:found', () => {});

  sockC.emit('queue:join');
  sockD.emit('queue:join');

  const err = await errPromise;
  expect(err.code).toBe('INVALID_BOARD');

  // Cleanly end the still-in-setup match so teardown has no lingering session.
  sockC.emit('game:leave');
  await new Promise((r) => setTimeout(r, 100));
  sockC.close();
  sockD.close();
});
