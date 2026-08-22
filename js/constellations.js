/**
 * Stargaze constellation library — real constellations and asterisms with
 * their brightest stars' proper names, laid out in approximate canonical
 * shapes (normalized 0..1 coordinates, y down). `stars` are listed in the
 * traditional line-drawing order the game uses as its sequence.
 *
 * Each entry carries a short fact shown when the player completes it,
 * so every session quietly teaches a bit of the night sky.
 */
window.STARGAZE_SKY = [
  // ---- 3 stars ----
  {
    name: 'Summer Triangle',
    count: 3,
    fact: 'Three brilliant stars from three constellations — Vega, Deneb, and Altair — rule the northern summer sky.',
    stars: [
      { name: 'Vega', x: 0.18, y: 0.22 },
      { name: 'Deneb', x: 0.78, y: 0.08 },
      { name: 'Altair', x: 0.55, y: 0.92 },
    ],
  },
  {
    name: 'Triangulum',
    count: 3,
    fact: 'One of the 48 ancient constellations — a slim triangle pointing the way to a spiral galaxy 2.7 million light-years away.',
    stars: [
      { name: 'Mothallah', x: 0.1, y: 0.75 },
      { name: 'Beta Trianguli', x: 0.85, y: 0.2 },
      { name: 'Gamma Trianguli', x: 0.68, y: 0.45 },
    ],
  },

  // ---- 4 stars ----
  {
    name: 'Corvus',
    count: 4,
    fact: 'The crow of Apollo. Its four-sided sail shape points toward Spica, the brightest star of Virgo.',
    stars: [
      { name: 'Gienah', x: 0.25, y: 0.15 },
      { name: 'Algorab', x: 0.72, y: 0.1 },
      { name: 'Kraz', x: 0.8, y: 0.78 },
      { name: 'Minkar', x: 0.15, y: 0.7 },
    ],
  },

  // ---- 5 stars ----
  {
    name: 'Cassiopeia',
    count: 5,
    fact: 'The Seated Queen. Her W-shape circles the North Star and never sets in northern latitudes.',
    stars: [
      { name: 'Caph', x: 0.05, y: 0.38 },
      { name: 'Schedar', x: 0.28, y: 0.62 },
      { name: 'Navi', x: 0.5, y: 0.3 },
      { name: 'Ruchbah', x: 0.72, y: 0.56 },
      { name: 'Segin', x: 0.95, y: 0.26 },
    ],
  },
  {
    name: 'Cepheus',
    count: 5,
    fact: 'The King beside Cassiopeia — his house-shaped figure holds Errai, a future pole star of Earth.',
    stars: [
      { name: 'Alderamin', x: 0.15, y: 0.82 },
      { name: 'Alfirk', x: 0.2, y: 0.3 },
      { name: 'Errai', x: 0.5, y: 0.05 },
      { name: 'Iota Cephei', x: 0.8, y: 0.3 },
      { name: 'Zeta Cephei', x: 0.75, y: 0.82 },
    ],
  },
  {
    name: 'Delphinus',
    count: 5,
    fact: 'The Dolphin who saved a poet’s life. Two of its stars, Sualocin and Rotanev, spell an astronomer’s name backwards.',
    stars: [
      { name: 'Aldulfin', x: 0.12, y: 0.88 },
      { name: 'Rotanev', x: 0.35, y: 0.42 },
      { name: 'Sualocin', x: 0.5, y: 0.15 },
      { name: 'Gamma Delphini', x: 0.75, y: 0.28 },
      { name: 'Delta Delphini', x: 0.58, y: 0.52 },
    ],
  },

  // ---- 6 stars ----
  {
    name: 'Lyra',
    count: 6,
    fact: 'The lyre of Orpheus. Vega, its jewel, was humanity’s pole star 14,000 years ago — and will be again.',
    stars: [
      { name: 'Vega', x: 0.5, y: 0.06 },
      { name: 'Epsilon Lyrae', x: 0.68, y: 0.14 },
      { name: 'Delta Lyrae', x: 0.66, y: 0.38 },
      { name: 'Sulafat', x: 0.6, y: 0.66 },
      { name: 'Sheliak', x: 0.36, y: 0.6 },
      { name: 'Zeta Lyrae', x: 0.42, y: 0.32 },
    ],
  },
  {
    name: 'Auriga',
    count: 6,
    fact: 'The Charioteer. Golden Capella, its brightest light, is actually four suns — two pairs circling each other.',
    stars: [
      { name: 'Capella', x: 0.35, y: 0.08 },
      { name: 'Menkalinan', x: 0.72, y: 0.16 },
      { name: 'Mahasim', x: 0.8, y: 0.46 },
      { name: 'Elnath', x: 0.45, y: 0.92 },
      { name: 'Hassaleh', x: 0.14, y: 0.6 },
      { name: 'Almaaz', x: 0.18, y: 0.26 },
    ],
  },

  // ---- 7 stars ----
  {
    name: 'The Big Dipper',
    count: 7,
    fact: 'Part of Ursa Major, the Great Bear. Its pointer stars, Merak and Dubhe, aim straight at Polaris — the North Star.',
    stars: [
      { name: 'Alkaid', x: 0.06, y: 0.5 },
      { name: 'Mizar', x: 0.24, y: 0.36 },
      { name: 'Alioth', x: 0.4, y: 0.31 },
      { name: 'Megrez', x: 0.55, y: 0.28 },
      { name: 'Phecda', x: 0.6, y: 0.52 },
      { name: 'Merak', x: 0.8, y: 0.47 },
      { name: 'Dubhe', x: 0.86, y: 0.2 },
    ],
  },
  {
    name: 'Orion',
    count: 7,
    fact: 'The Hunter. His three belt stars — Mintaka, Alnilam, Alnitak — are among the most famous landmarks in the sky.',
    stars: [
      { name: 'Betelgeuse', x: 0.68, y: 0.14 },
      { name: 'Bellatrix', x: 0.3, y: 0.18 },
      { name: 'Mintaka', x: 0.38, y: 0.5 },
      { name: 'Alnilam', x: 0.5, y: 0.53 },
      { name: 'Alnitak', x: 0.62, y: 0.56 },
      { name: 'Saiph', x: 0.68, y: 0.9 },
      { name: 'Rigel', x: 0.3, y: 0.86 },
    ],
  },
  {
    name: 'Corona Borealis',
    count: 7,
    fact: 'Ariadne’s crown, set among the stars by Dionysus — a graceful arc with Alphecca as its central gem.',
    stars: [
      { name: 'Theta CrB', x: 0.08, y: 0.55 },
      { name: 'Nusakan', x: 0.2, y: 0.32 },
      { name: 'Alphecca', x: 0.38, y: 0.18 },
      { name: 'Gamma CrB', x: 0.58, y: 0.16 },
      { name: 'Delta CrB', x: 0.75, y: 0.26 },
      { name: 'Epsilon CrB', x: 0.88, y: 0.45 },
      { name: 'Iota CrB', x: 0.95, y: 0.68 },
    ],
  },

  // ---- 8 stars ----
  {
    name: 'Scorpius',
    count: 8,
    fact: 'The Scorpion whose sting felled Orion — they were placed on opposite sides of the sky. Red Antares means “rival of Mars.”',
    stars: [
      { name: 'Acrab', x: 0.3, y: 0.04 },
      { name: 'Dschubba', x: 0.22, y: 0.14 },
      { name: 'Antares', x: 0.38, y: 0.32 },
      { name: 'Paikauhale', x: 0.44, y: 0.46 },
      { name: 'Larawag', x: 0.42, y: 0.6 },
      { name: 'Xamidimura', x: 0.5, y: 0.74 },
      { name: 'Shaula', x: 0.68, y: 0.88 },
      { name: 'Sargas', x: 0.86, y: 0.8 },
    ],
  },
  {
    name: 'Cygnus',
    count: 8,
    fact: 'The Swan flying down the Milky Way. Deneb, its tail, shines from ~1,500 light-years away — one of the most luminous stars known.',
    stars: [
      { name: 'Azelfafage', x: 0.06, y: 0.1 },
      { name: 'Iota Cygni', x: 0.16, y: 0.2 },
      { name: 'Fawaris', x: 0.3, y: 0.32 },
      { name: 'Deneb', x: 0.55, y: 0.12 },
      { name: 'Sadr', x: 0.5, y: 0.45 },
      { name: 'Aljanah', x: 0.74, y: 0.6 },
      { name: 'Zeta Cygni', x: 0.9, y: 0.72 },
      { name: 'Albireo', x: 0.42, y: 0.94 },
    ],
  },
];
