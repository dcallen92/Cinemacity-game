/* DON'T LOSE YOUR HEAD — level data
   Board is a portrait 3:4 field, 300 x 400 units. Corridor widths are a
   percentage of board width (brief §04). Edit numbers here to rebalance;
   no game code changes needed. */
window.DLYH_LEVELS = (function () {
  const W = 300, H = 400;

  // cubic bezier sampler
  function bez(p0, p1, p2, p3, n) {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t;
      out.push([
        u*u*u*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t*t*t*p3[0],
        u*u*u*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t*t*t*p3[1]
      ]);
    }
    return out;
  }
  function join(...parts) {
    const out = [];
    parts.forEach((p, i) => out.push(...(i ? p.slice(1) : p)));
    return out;
  }

  // L1 — The Bedroom Door: a long S-curve with a straight run in the middle
  // where the door swings. The door is on the straight so there is a clean gap.
  const scurve = join(
    bez([60, 36], [60, 130], [150, 90], [150, 160], 34),
    [[150, 160], [150, 240]],
    bez([150, 240], [150, 310], [240, 270], [240, 366], 34)
  );

  // L2 — The Crawl: the long seven-row switchback, walls breathe
  const crawl = [
    [30, 36], [270, 36], [270, 91], [30, 91], [30, 146], [270, 146],
    [270, 201], [30, 201], [30, 256], [270, 256], [270, 311], [30, 311],
    [30, 366], [270, 366]
  ];

  // L3 — The Lights Go Down: tight snake, a door near the end, and the
  // corridor itself blacks out every few seconds. Keep moving from memory.
  const snake = join(
    bez([36, 36], [36, 120], [264, 50], [264, 130], 36),
    bez([264, 130], [264, 210], [36, 150], [36, 230], 36),
    [[36, 230], [36, 262]],
    bez([36, 262], [36, 330], [264, 262], [264, 330], 36),
    [[264, 330], [150, 372]]
  );

  return {
    W, H,
    levels: [
      { id: 1, name: 'The Bedroom Door', widthPct: 8, pts: scurve, timer: 60,
        // period = one close→open→close cycle; dwell = share of the cycle held fully open / fully closed
        hazards: [{ type: 'door', at: 0.5, period: 4800, dwell: 0.12, lengthPct: 0.85, sprite: 'door' }] },
      { id: 2, name: 'The Crawl', widthPct: 5.5, pts: crawl, timer: 60,
        breathe: { amp: 0.15, period: 2000 }, cornerCreak: true,
        hazards: [] },
      { id: 3, name: 'The Lights Go Down', widthPct: 4, pts: snake, timer: 60,
        breathe: { amp: 0.1, period: 1600 }, whisper: true,
        // the corridor disappears for `dark` ms every `every` ms (first blackout after `every`)
        blackout: { every: 3800, dark: 700 },
        hazards: [{ type: 'door', at: 0.42, period: 4200, dwell: 0.1, lengthPct: 0.85, sprite: 'door' }] }
    ]
  };
})();
