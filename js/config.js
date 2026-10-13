/* DON'T LOSE YOUR HEAD — campaign configuration
   Everything a producer may need to change without touching game code. */
window.DLYH_CONFIG = {
  // Backend. Leave empty to run fully client-side (counter + entries in localStorage).
  // When set, the game calls:
  //   POST {apiBase}/scare            -> { count: 1204 }
  //   GET  {apiBase}/scare            -> { count: 1204 }
  //   POST {apiBase}/entries  (JSON)  -> 200 | 409 (duplicate email)
  apiBase: '',

  // Seed for the local counter when no backend is set (so the first player isn't #1).
  counterSeed: 1203,

  // Draw closes Wed 28 Oct 2026, 23:59 GST (UTC+4). After this the form is hidden.
  closesAt: '2026-10-28T23:59:59+04:00',

  // Optional Cloudflare Turnstile site key. Leave empty to skip bot protection locally.
  turnstileSiteKey: '',

  privacyUrl: 'privacy.html',
  termsUrl: 'terms.html',
  bookingUrl: 'https://cinemacity.ae',
  shareUrl: '', // defaults to the current page URL

  cinemas: ['Al Qana', 'Fountain Views'],
  nights: ['30 Oct', '31 Oct', '1 Nov'],

  // Mobile: render the cursor this many millimetres above the fingertip (toggle in settings).
  fingerOffsetMm: 16,

  // Scare rotation. intensity 1 = mildest, 5 = worst. A level can only draw
  // scares whose intensity <= level + 2, and never the same one twice in a row.
  // `src` is the portrait (phones), `wide` the 16:9 version used when the viewport is landscape.
  scares: [
    { src: 'assets/scares/scare-1.jpg', wide: 'assets/desktop/scare-1-wide.jpg', intensity: 1 },
    { src: 'assets/scares/scare-2.jpg', wide: 'assets/desktop/scare-2-wide.jpg', intensity: 2 },
    { src: 'assets/scares/scare-3.jpg', wide: 'assets/desktop/scare-3-wide.jpg', intensity: 3 },
    { src: 'assets/scares/scare-4.jpg', wide: 'assets/desktop/scare-4-wide.jpg', intensity: 4 },
    { src: 'assets/scares/scare-5.jpg', wide: 'assets/desktop/scare-5-wide.jpg', intensity: 5 }
  ],
  screams: ['assets/audio/scream-01-shriek.mp3', 'assets/audio/scream-02-roar.mp3', 'assets/audio/scream-03-stab.mp3', 'assets/audio/scream-04-loud.mp3'],
  sfx: { creak: 'assets/audio/creak.mp3', whisper: 'assets/audio/whisper.mp3', door: 'assets/audio/door-squeak.mp3', ambience: 'assets/audio/ambience.mp3', clear: 'assets/audio/level-clear.mp3' },
  // Peak level (0–1) each sound is normalised to at decode. 0.89 ≈ -1 dBFS.
  levels: { scream: 0.89, creak: 0.6, door: 0.45, whisper: 0.8, ambience: 0.5, clear: 0.8 },
  ambienceGain: 0.2, // overall ambience level (0–1); the engine also shelves the sub-bass down by 5 dB under 140 Hz
  sprites: { door: 'assets/hazards/door.png' },
  shareBg: 'assets/share-bg.jpg',
  landingBg: 'assets/landing-bg.jpg',
  landingBgWide: 'assets/desktop/landing-bg-wide.jpg',
  // subtle plates behind each level's board (index = level - 1); `wide` for landscape
  levelPlates: [
    { src: 'assets/levels/level-1.jpg', wide: 'assets/desktop/level-1-wide.jpg' },
    { src: 'assets/levels/level-2.jpg', wide: 'assets/desktop/level-2-wide.jpg' },
    { src: 'assets/levels/level-3.jpg', wide: 'assets/desktop/level-3-wide.jpg' }
  ],
  winKv: 'assets/win-kv.jpg',
  winKvWide: 'assets/desktop/win-kv-wide.jpg'
};
