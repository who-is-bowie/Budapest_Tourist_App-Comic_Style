// Lightweight index of the landmarks that have a 3D model. The heavy Three.js code
// (viewer.js, models.js) is only loaded the first time a model is opened.
export const MODELS = {
  parliament:           { title: 'Hungarian Parliament',   tagline: 'Neo-Gothic icon on the Danube',      accent: '#d6483f', facts: ['Finished 1904', '691 rooms', '96 m dome'] },
  'buda-castle':        { title: 'Buda Castle',            tagline: 'Royal palace on Castle Hill',         accent: '#e0a526', facts: ['Since 1265', 'Baroque palace', 'Museums inside'] },
  'fishermans-bastion': { title: "Fisherman's Bastion",    tagline: 'Seven fairytale towers',              accent: '#6aa6c9', facts: ['1895–1902', '7 towers', 'Best Danube views'] },
  'matthias-church':    { title: 'Matthias Church',        tagline: 'Gothic crown with a tiled roof',      accent: '#e07a1f', facts: ['13th century', 'Zsolnay roof tiles', 'Coronation church'] },
  'chain-bridge':       { title: 'Chain Bridge',           tagline: 'The first bridge across the Danube',  accent: '#2f7fd0', facts: ['Opened 1849', '202 m span', 'Stone lions'] },
  'elizabeth-bridge':   { title: 'Elizabeth Bridge',       tagline: 'One sweeping white suspension span',   accent: '#9fb4d0', facts: ['Rebuilt 1964', '290 m main span', 'Named for Empress Sisi'] },
  'liberty-bridge':     { title: 'Liberty Bridge',         tagline: 'Green steel and turul birds',          accent: '#6fa35a', facts: ['Opened 1896', '331 m long', 'Turul bird pylons'] },
  'petofi-bridge':      { title: 'Petőfi Bridge',          tagline: 'Long steel truss to Lágymányos',       accent: '#7f9a8c', facts: ['Opened 1937', 'Rebuilt 1952', '514 m long'] },
  'rakoczi-bridge':     { title: 'Rákóczi Bridge',         tagline: 'Slim modern box girder',               accent: '#6aa6c9', facts: ['Opened 1995', 'Steel box girder', 'By Tibor Sigrai'] },
  'margaret-bridge':    { title: 'Margaret Bridge',        tagline: 'Iron arches with a bend mid-river',    accent: '#8da0b0', facts: ['Opened 1876', '~607 m long', 'Spur to Margaret Island'] },
  basilica:             { title: "St. Stephen's Basilica", tagline: 'Dome as tall as Parliament',          accent: '#8a4fd1', facts: ['Finished 1905', '96 m tall', 'Panorama deck'] },
  opera:                { title: 'Hungarian State Opera',  tagline: 'Neo-Renaissance jewel box',           accent: '#c0392b', facts: ['Opened 1884', 'Miklós Ybl', '~1,260 seats'] },
  synagogue:            { title: 'Dohány Street Synagogue', tagline: 'Moorish Revival, largest in Europe', accent: '#d4a73a', facts: ['Built 1859', 'Twin onion domes', '~3,000 seats'] },
  'market-hall':        { title: 'Great Market Hall',      tagline: 'Paprika, pastries and patterned tiles', accent: '#2a9d8f', facts: ['Opened 1897', 'Zsolnay roof', '3 floors of stalls'] },
  'gellert-baths':      { title: 'Gellért Baths',          tagline: 'Art Nouveau thermal palace',          accent: '#2a9d8f', facts: ['Opened 1918', 'Thermal springs', 'Mosaic pools'] },
  citadella:            { title: 'Citadella & Liberty Statue', tagline: 'Hilltop fortress with 360° views', accent: '#4f9a73', facts: ['Fortress 1851', 'Statue 1947', '14 m figure'] },
  'heroes-square':      { title: "Heroes' Square",         tagline: 'Millennium Monument between two museums', accent: '#d6483f', facts: ['Built 1896–1900', '36 m column', '7 chieftains, 14 kings'] },
  'vajdahunyad-castle': { title: 'Vajdahunyad Castle',     tagline: 'Four architectural styles around a lake', accent: '#e07a1f', facts: ['Built 1896', 'Romanesque to Baroque', 'Agricultural Museum'] },
  'szechenyi-baths':    { title: 'Széchenyi Baths',        tagline: 'Neo-Baroque domes round steaming pools', accent: '#e0a526', facts: ['Opened 1913', '18 pools', 'Open all year'] },
};

export const has3D = (id) => id in MODELS;
export const MODEL_IDS = Object.keys(MODELS);

// How each model sits on the map. The model's centre goes on the place's pin, which is the centre of the real footprint
// (OpenStreetMap). `shift` = [east, north] metres from the pin to the model's centre. `span` is the longest side of the structure
// itself, without its ground base, in metres (the OSM footprint's oriented bounding box), and `facing` the compass bearing of
// its front (+z); the model's +x then points to facing - 90°. The real buildings under a model are hidden along its own footprint;
// `hole` (m) hides a circle round the pin instead (the bridges, whose decks should not hide the bridgeheads).
export const PLACEMENT = {
  parliament:           { span: 264, facing: 96.5 },
  'buda-castle':        { span: 320, facing: 56.5 },
  'fishermans-bastion': { span: 151, facing: 69 },
  'matthias-church':    { span: 61, facing: 248.5 },
  'chain-bridge':       { span: 380, facing: 164, hole: 30, foundation: false },   // `foundation`: false = no terrace under it on the map, 'round' = circular
  // bridges: `span` is the deck's length; `facing` = real bearing of the Buda → Pest direction + 90°
  'elizabeth-bridge':   { span: 378, facing: 153.5, hole: 30, foundation: false },
  'liberty-bridge':     { span: 333, facing: 143, hole: 30, foundation: false },
  'petofi-bridge':      { span: 514, facing: 145, hole: 30, foundation: false },
  'rakoczi-bridge':     { span: 494, facing: 181.5, hole: 30, foundation: false },
  'margaret-bridge':    { span: 625, facing: 196, hole: 30, foundation: false, shift: [15, 67] },   // facing along the Buda end → Pest end chord; its bend sits north of the pin, which has to stay inside the visible districts
  basilica:             { span: 97, facing: 262 },
  opera:                { span: 108, facing: 139 },
  synagogue:            { span: 78, facing: 216 },
  'market-hall':        { span: 183, facing: 321.5 },
  'gellert-baths':      { span: 192, facing: 186 },
  citadella:            { span: 236, facing: 184.5 },
  'heroes-square':      { span: 360, facing: 225 },
  'vajdahunyad-castle': { span: 145, facing: 230 },
  'szechenyi-baths':    { span: 182, facing: 327 },
};
