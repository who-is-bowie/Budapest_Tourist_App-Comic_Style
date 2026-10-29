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
};

export const has3D = (id) => id in MODELS;
export const MODEL_IDS = Object.keys(MODELS);

// How each model sits on the map. `shift` = [east, north] metres from the place's pin to the model's centre. `span` is the longest side of the structure itself, without its ground base, in metres (approximate published dimensions)
// and `facing` the compass bearing of the front.
export const PLACEMENT = {
  parliament:           { span: 268, facing: 90 },
  'buda-castle':        { span: 304, facing: 90 },
  'fishermans-bastion': { span: 120, facing: 90, hole: 60, foundation: 'round' },
  'matthias-church':    { span: 62, facing: 232, hole: 35 },
  'chain-bridge':       { span: 380, facing: 180, foundation: false },   // `foundation`: false = no terrace under it on the map, 'round' = circular
  // bridges: `span` is the deck's length; `facing` = real bearing of the Buda → Pest direction + 90°
  'elizabeth-bridge':   { span: 378, facing: 153, hole: 30, foundation: false },
  'liberty-bridge':     { span: 333, facing: 143, hole: 30, foundation: false },
  'petofi-bridge':      { span: 514, facing: 145, hole: 30, foundation: false },
  'rakoczi-bridge':     { span: 494, facing: 182, hole: 30, foundation: false },
  'margaret-bridge':    { span: 625, facing: 196, hole: 30, foundation: false, shift: [15, 67] },   // facing along the Buda end → Pest end chord; its bend sits north of the pin, which has to stay inside the visible districts
  basilica:             { span: 88, facing: 140 },
  opera:                { span: 85, facing: 150 },
  synagogue:            { span: 55, facing: 160 },
  'market-hall':        { span: 150, facing: 135 },
  'gellert-baths':      { span: 150, facing: 90 },
  citadella:            { span: 180, facing: 180, foundation: 'round' },
  'heroes-square':      { span: 360, facing: 225, hole: 190 },
  'vajdahunyad-castle': { span: 145, facing: 230, hole: 85 },   // `hole`: metres of real buildings to hide (default 0.42 × span)
};
