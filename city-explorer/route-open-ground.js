import { drapePaintPolygon } from './road-paint-geometry.js?v=1.6.208';
import { pointInPolygon, pointInRing } from './feature-utils.js';

export const WALMART_PARKING_SOURCE_ID = '10/1429';

// Exact municipal surface, including every excluded-pavement ring. This is
// ownership evidence, not a declaration that every hole contains planting.
export const WALMART_PARKING_POLYGON = Object.freeze([[[-78.3327427982164,44.32526028329565],[-78.3327248440315,44.325248670634124],[-78.33270096164371,44.3252436949171],[-78.33268254126033,44.32524523968484],[-78.33265037099561,44.325254161402114],[-78.3326180530333,44.32525790487533],[-78.33257963864392,44.32525775172695],[-78.3325432475851,44.32525297071768],[-78.33250982582818,44.32524421774973],[-78.33248004972263,44.32523220364423],[-78.33245225905216,44.325216259412706],[-78.33242937148142,44.325198059333154],[-78.33241253413314,44.32517965853731],[-78.3323977156053,44.3251581953672],[-78.33237895627167,44.32511353902827],[-78.33237409249149,44.32507300569114],[-78.33238358129022,44.325004117795466],[-78.33238168591922,44.324955981681974],[-78.33236748408343,44.32490297466085],[-78.3323400387185,44.324851158889956],[-78.33220148790379,44.324703718268566],[-78.3320950145596,44.32467779288168],[-78.33205244968437,44.324646306587304],[-78.33202352540896,44.3246192254539],[-78.33195261472083,44.32454016592513],[-78.3319169436358,44.32449480451764],[-78.33190793934443,44.32447887433728],[-78.33190352700167,44.32446356554729],[-78.33190284996944,44.32444793984375],[-78.33190592599158,44.324432463084],[-78.33191266511393,44.324417597707246],[-78.33221151264331,44.3239679916606],[-78.33224074909167,44.323944189262356],[-78.33282555546248,44.32365586880099],[-78.33286583871534,44.32363215060913],[-78.33289710103035,44.3236070548665],[-78.33300899286893,44.32349628310426],[-78.3330787065675,44.323433484583404],[-78.33316046257768,44.32338524754137],[-78.33316079848665,44.32337734016498],[-78.33312452963318,44.32333832561022],[-78.33400934449338,44.322901741849215],[-78.33410720321972,44.32300358527815],[-78.33411447517226,44.323005172148164],[-78.33412152948104,44.3230039792847],[-78.33417553212529,44.32297772536504],[-78.3342729271957,44.32307973607731],[-78.3342168829609,44.32310773121137],[-78.33421380544976,44.3231113288633],[-78.33421795126708,44.323122623315044],[-78.33423647269885,44.32313734684073],[-78.33427405789782,44.323157594026284],[-78.33431846070452,44.32317135637667],[-78.33436476272635,44.32317710919433],[-78.33441166249426,44.323175039951494],[-78.33444113677888,44.323169567652464],[-78.33446913554498,44.32316098374715],[-78.33461811504148,44.32309065617637],[-78.33485924524373,44.322970940124456],[-78.33493434787307,44.322929864800976],[-78.33495191813944,44.322914874006315],[-78.33496524218391,44.32289880186968],[-78.33497521685794,44.322880564693186],[-78.33498035689573,44.322862857437165],[-78.3349809920924,44.32281736242332],[-78.33496154433892,44.32277727102447],[-78.33523879503034,44.323064978253015],[-78.33521760636542,44.32305043929831],[-78.33519176447399,44.323039097520905],[-78.3351585987434,44.32303218606717],[-78.3350822004975,44.323030993949715],[-78.33505256966102,44.32303557868896],[-78.33502343197678,44.32304430900064],[-78.33450508921698,44.323298387057704],[-78.33449308874651,44.323307855914784],[-78.3344732213362,44.32333415357525],[-78.33446977200835,44.323346621071025],[-78.33447230418528,44.323358711487195],[-78.33447978403659,44.32336811038015],[-78.33449228256993,44.323374274740196],[-78.33450727991217,44.323375885337],[-78.33452174472474,44.32337261480518],[-78.33502863320558,44.32312307942829],[-78.33505286767623,44.32311813733746],[-78.33507883694196,44.32311935941886],[-78.33510196712734,44.32312652995515],[-78.33512049914867,44.32313878232756],[-78.3352536159255,44.32327767230014],[-78.33470329927123,44.3235492948192],[-78.3346901807699,44.32355933087266],[-78.33468190193018,44.32357174412394],[-78.33467923651331,44.32358537237986],[-78.33468243660423,44.32359894223511],[-78.33468987817943,44.32360982387472],[-78.3354266034148,44.32438763535292],[-78.33551334388818,44.32446908245588],[-78.3355587761409,44.32452158290553],[-78.3355890330548,44.32455153371976],[-78.33561343763752,44.32456973256599],[-78.33564018191463,44.324584481245985],[-78.33566400922116,44.32459197403316],[-78.33567999273731,44.32459438533252],[-78.3357293016344,44.32459247891384],[-78.33579669987162,44.32457276680253],[-78.33545538223225,44.324744319343786],[-78.33548273042216,44.324716666572456],[-78.33551346878765,44.32467294828741],[-78.33552040960048,44.32464682765756],[-78.33551981640032,44.32463589166686],[-78.33551462606962,44.324614342150504],[-78.33550424905474,44.32459378250272],[-78.33520958325674,44.3242829041403],[-78.33519652205123,44.32427459307022],[-78.33518103817842,44.32426998589161],[-78.33516361673588,44.32426922626893],[-78.33514746941461,44.3242724540009],[-78.33513377759213,44.32427911509033],[-78.33512463749256,44.324288033201505],[-78.335120190192,44.32429911169851],[-78.33512147921954,44.324310604101974],[-78.33536467147825,44.32456803991222],[-78.33530124660155,44.32459856590658],[-78.33529675829561,44.32460318577569],[-78.33529796901173,44.32460965281057],[-78.33533421595288,44.324647123085526],[-78.33453784210504,44.32503889949703],[-78.33449811919665,44.324998353485434],[-78.33449018592565,44.32499566276402],[-78.334387734055,44.32504169522189],[-78.33417574575618,44.32481884006316],[-78.33413819316915,44.32476514297067],[-78.33405212311636,44.3246752731013],[-78.3340139319989,44.324647152288065],[-78.33399284803188,44.324627945824275],[-78.33305452359097,44.32364408014025],[-78.33304598974642,44.32363851511024],[-78.33303340559259,44.32363449034736],[-78.33300742906836,44.323634835010225],[-78.33298806146458,44.32364348067823],[-78.33298043629844,44.32365114932064],[-78.33297940576057,44.32365554019432],[-78.33301644884843,44.32369592959876],[-78.33261759176519,44.32389132167587],[-78.33258338735439,44.3238555673773],[-78.33257112072114,44.323851509471005],[-78.33255532389568,44.32385914827472],[-78.33254594194976,44.323873558511146],[-78.33254929055154,44.32388970578385],[-78.33265710412405,44.324002981602604],[-78.33223417402681,44.3242100922527],[-78.33231056610578,44.324291121678044],[-78.3320230691242,44.324433495139466],[-78.33206055345137,44.324472391703054],[-78.33205746140442,44.32447392732499],[-78.33214400094958,44.32456432192913],[-78.33217720780961,44.324547939689666],[-78.33232173700152,44.32469625558709],[-78.33241959350285,44.32464812258193],[-78.33293042557827,44.325183603015304],[-78.33281580984905,44.32523994788739],[-78.33296097265111,44.32539211834423],[-78.3329200461519,44.325412239336764],[-78.33302959685612,44.3255270795386],[-78.3330705259071,44.32550695856673],[-78.33308210312515,44.32551909378785],[-78.3330195255885,44.32554985707009],[-78.3327427982164,44.32526028329565]],[[-78.33415042449747,44.32317206760542],[-78.33410687528476,44.32314032861235],[-78.33407062927772,44.32312282608013],[-78.33405598841689,44.32311855353366],[-78.33404302948578,44.32311745862912],[-78.3340322048995,44.32312057194593],[-78.33402448358913,44.323127101365145],[-78.33402109040561,44.32313417750693],[-78.33402270497506,44.323141746923575],[-78.33407271466069,44.32319494276161],[-78.33407887638862,44.323198779601476],[-78.33408783338953,44.323198743918745],[-78.33413101134008,44.32317754703503],[-78.3344338602042,44.323494240634126],[-78.33439286410574,44.32351452708862],[-78.33438785766596,44.323520397009524],[-78.33439325504901,44.32353108418658],[-78.3344073058431,44.32354234795571],[-78.33442325714745,44.323549420306826],[-78.3344405043239,44.32355067202495],[-78.3344555416734,44.323546723459806],[-78.33446711975583,44.32353965838281],[-78.33447427365098,44.32353012496783],[-78.33447522103421,44.32352003879478],[-78.33447064114469,44.32350813733376],[-78.33415042449747,44.32317206760542]],[[-78.33419111811295,44.32464874989643],[-78.3342129093568,44.32465046968315],[-78.33423870137035,44.32464842251727],[-78.33425787027033,44.32464410952554],[-78.33427005760211,44.32463655724456],[-78.33427085876122,44.3246280386409],[-78.33423547287698,44.32458907297367],[-78.33417735735132,44.32461691347561],[-78.33416192938834,44.3246003355995],[-78.3341548682505,44.324597441054266],[-78.33414131467538,44.32459952555067],[-78.33413204575318,44.324606522085666],[-78.33412882888463,44.32461856106498],[-78.33413596770504,44.324629122372535],[-78.33416123707131,44.3246406274704],[-78.33419111811295,44.32464874989643]],[[-78.33500846230532,44.324075747536746],[-78.33500422898803,44.32406488500503],[-78.33499498508493,44.32405242723747],[-78.33494014676667,44.32400227813878],[-78.33493314403911,44.323999534451104],[-78.33492317303443,44.323999499711],[-78.33490338939458,44.32400708987034],[-78.33489962913345,44.32401280255204],[-78.33490242365345,44.32401999077981],[-78.33497261153327,44.324092851214594],[-78.33498182917519,44.324096311015595],[-78.33499467224784,44.32409343559363],[-78.3350052654278,44.3240852185221],[-78.33500846230532,44.324075747536746]],[[-78.33504902725514,44.32425252564404],[-78.33506358464648,44.324246274592234],[-78.33507730137596,44.324233638062786],[-78.33508890704891,44.324216332031455],[-78.33509472966587,44.32419886847915],[-78.33509501104915,44.32418083712499],[-78.33508969102738,44.32416334480365],[-78.33508087369981,44.32415403806399],[-78.3350680646329,44.324150128011496],[-78.33505002132988,44.32415373909604],[-78.33504222056641,44.324162935145395],[-78.33506880595728,44.32419510778694],[-78.33501193283159,44.324221978416624],[-78.33503748371669,44.32424930413583],[-78.33504902725514,44.32425252564404]],[[-78.33231553525914,44.324040076215184],[-78.33232030753675,44.32403484010919],[-78.33231861659523,44.32402812954827],[-78.33229186266182,44.323999984661924],[-78.33236855877284,44.32396136732033],[-78.33237044199838,44.32395742221033],[-78.33236645489471,44.323953972803125],[-78.332355617705,44.323956694945885],[-78.3322977171714,44.32398667496981],[-78.33227755090356,44.32400092497265],[-78.33226468554851,44.32401703722071],[-78.33225827994711,44.32403671878621],[-78.33226055259959,44.324043958801255],[-78.33226658293327,44.324048811779804],[-78.33228816837959,44.32405210440751],[-78.33231553525914,44.324040076215184]],[[-78.33389122983012,44.323123070773185],[-78.33388491727202,44.32311973995635],[-78.3338770708121,44.32311890308681],[-78.33385974641627,44.32312206983401],[-78.33385149407583,44.32312891543881],[-78.33385338348869,44.32313861052659],[-78.33388052494065,44.323166071789295],[-78.3339083411616,44.32315235848811],[-78.33394147076216,44.32318646319181],[-78.333946314659,44.32318714080068],[-78.33394820044124,44.32318418782761],[-78.33394509548485,44.323178844192434],[-78.33389122983012,44.323123070773185]],[[-78.33248038202358,44.3239147292197],[-78.33246634137521,44.32390888961189],[-78.33245099911841,44.323909462857316],[-78.33238109342729,44.32394419490964],[-78.33237911294432,44.32395006343657],[-78.3323840496193,44.32395262305563],[-78.33238979333322,44.3239513519563],[-78.332460954431,44.323914959419376],[-78.33249198347896,44.32394689620272],[-78.33250156477582,44.32394858305696],[-78.33250533041833,44.32394546697536],[-78.33250486211978,44.323940749390516],[-78.33248038202358,44.3239147292197]],[[-78.33372912103458,44.32418982826914],[-78.33372057265919,44.32418850955072],[-78.3337192483348,44.324194430338984],[-78.33378099663477,44.324259365502755],[-78.33378551650175,44.324262656252216],[-78.33379060092498,44.32426212411375],[-78.33379272732249,44.3242567964352],[-78.33372912103458,44.32418982826914]],[[-78.33430589334347,44.32481022003669],[-78.33431431047947,44.32481122685184],[-78.3343160495474,44.32480523021649],[-78.33425488264356,44.324740945418725],[-78.3342466984381,44.32473978018882],[-78.33424464338465,44.32474596930489],[-78.33430589334347,44.32481022003669]],[[-78.33385875715253,44.32432610607196],[-78.33385108377338,44.324323937234205],[-78.33384740497695,44.324328624569084],[-78.33391274400441,44.32439754532467],[-78.33392000521411,44.32439818306559],[-78.33392276539425,44.324394948023816],[-78.33392074458474,44.32439102873911],[-78.33385875715253,44.32432610607196]]]);

const ROW_ESTIMATES = Object.freeze({ spacing: 2.65, length: 5.3, count: 15, width: .12 });
export const ROUTE_PARKING_ROWS = Object.freeze([
  Object.freeze({ id: 'walmart-sw-south', sourceId: WALMART_PARKING_SOURCE_ID,
    lat: 44.32364440364343, lon: -78.33454041769727, bearing: 55.7, facing: -1,
    ...ROW_ESTIMATES, photos: ['R010', 'R012', 'R014'],
    inferred: 'Origin ±1–1.5 m; spacing, length, width and extent of 15 separator lines are estimates.' }),
  Object.freeze({ id: 'walmart-sw-north', sourceId: WALMART_PARKING_SOURCE_ID,
    lat: 44.32378222528404, lon: -78.33467183379143, bearing: 55.7, facing: 1,
    ...ROW_ESTIMATES, photos: ['R008', 'R010'],
    inferred: 'Origin ±1–1.5 m; spacing, length, width and extent of 15 separator lines are estimates.' }),
]);

// Cap closure joins the two neck points for a fill. It is NOT a new curb
// across the connecting stem. Never substitute the centroid of the full H1.
const capVertices = WALMART_PARKING_POLYGON[1].slice(13, 25);
export const WALMART_TREE_ISLAND = Object.freeze({
  sourceId: WALMART_PARKING_SOURCE_ID, sourceRingIndex: 1,
  photos: ['R012', 'R013', 'R014'],
  capBoundaryLonLat: capVertices,
  capRingLonLat: [...capVertices, capVertices[0]],
  tree: Object.freeze({ lat: 44.323523678239724, lon: -78.33443303595162,
    height: 7.5, crownDiameter: 5.2, crownHeight: 4.4, trunkDiameter: .32,
    inferred: 'Point within mapped cap ±1.5 m; all tree dimensions and branch shapes estimated. Leafless appearance is observed.' }),
});

const PAINT_LIFT = .018;
const PAINT_SAMPLE_SPACING = 1.4;
const MAX_HEIGHT_STEP = .3;
const finitePoint = point => Number.isFinite(point?.x) && Number.isFinite(point?.z);
const cross = (a, b, c) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
const xy = point => ({ x: point.x, y: point.z });

function segmentDistance(point, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(point.x - a.x - t * dx, point.z - a.z - t * dz);
}

function edges(ring) {
  return ring.map((point, i) => [point, ring[(i + 1) % ring.length]]);
}

function intersects(a, b, c, d) {
  if (Math.max(a.x, b.x) < Math.min(c.x, d.x) || Math.max(c.x, d.x) < Math.min(a.x, b.x)
    || Math.max(a.z, b.z) < Math.min(c.z, d.z) || Math.max(c.z, d.z) < Math.min(a.z, b.z)) return false;
  return cross(a, b, c) * cross(a, b, d) <= 0 && cross(c, d, a) * cross(c, d, b) <= 0;
}

function polygonWithinLot(polygon, plan) {
  if (!polygon.every(point => plan.containsParking(point.x, point.z))) return false;
  const outline = edges(polygon), polygonXY = polygon.map(xy);
  for (const ring of plan.rings) {
    if (edges(ring).some(([a, b]) => outline.some(([c, d]) => intersects(a, b, c, d)))) return false;
  }
  // Also reject a whole small cutout enclosed by a stroke, not just crossings.
  return !plan.rings.slice(1).some(ring => pointInRing(xy(ring[0]), polygonXY));
}

/** Project once with app project(lat, lon), whose second output component is Y/Z. */
export function createWalmartGroundPlan(project) {
  if (typeof project !== 'function') throw new TypeError('A finite local-metre projection is required');
  const at = (lat, lon) => {
    const point = project(lat, lon), result = { x: point?.x, z: point?.z ?? point?.y };
    if (!finitePoint(result)) throw new TypeError('Projection must return finite coordinates');
    return result;
  };
  const rings = WALMART_PARKING_POLYGON.map(ring => ring.map(([lon, lat]) => at(lat, lon)));
  const ringsXY = rings.map(ring => ring.map(xy));
  const boundaryEdges = rings.flatMap(edges);
  return {
    sourceId: WALMART_PARKING_SOURCE_ID, rings,
    containsParking(x, z) {
      const point = { x, z };
      return finitePoint(point) && pointInPolygon(xy(point), ringsXY)
        && !boundaryEdges.some(([a, b]) => segmentDistance(point, a, b) <= .001);
    },
    rows: ROUTE_PARKING_ROWS.map(row => ({ ...row, origin: at(row.lat, row.lon) })),
    treeIsland: {
      ...WALMART_TREE_ISLAND,
      ring: WALMART_TREE_ISLAND.capRingLonLat.map(([lon, lat]) => at(lat, lon)),
      boundary: WALMART_TREE_ISLAND.capBoundaryLonLat.map(([lon, lat]) => at(lat, lon)),
      tree: { ...WALMART_TREE_ISLAND.tree, ...at(WALMART_TREE_ISLAND.tree.lat, WALMART_TREE_ISLAND.tree.lon) },
    },
  };
}

function validRow(row) {
  return row.sourceId === WALMART_PARKING_SOURCE_ID && finitePoint(row.origin)
    && [row.bearing, row.spacing, row.length, row.width].every(Number.isFinite)
    && Number.isInteger(row.count) && row.count > 0 && row.count <= 32
    && row.spacing > 0 && row.spacing <= 5 && row.length > 0 && row.length <= 8
    && row.width > 0 && row.width <= .3 && [-1, 1].includes(row.facing);
}

function strokePolygons(row) {
  const angle = row.bearing * Math.PI / 180, ux = Math.sin(angle), uz = -Math.cos(angle);
  return Array.from({ length: row.count }, (_, i) => {
    const a = { x: row.origin.x + ux * row.spacing * i, z: row.origin.z + uz * row.spacing * i };
    const b = { x: a.x - uz * row.length * row.facing, z: a.z + ux * row.length * row.facing };
    return [a, b, { x: b.x + ux * row.width, z: b.z + uz * row.width },
      { x: a.x + ux * row.width, z: a.z + uz * row.width }];
  });
}

function paintArea(positions) {
  let area = 0;
  for (let i = 0; i < positions.length; i += 9) area += Math.abs(cross(
    { x: positions[i], z: positions[i + 2] }, { x: positions[i + 3], z: positions[i + 5] },
    { x: positions[i + 6], z: positions[i + 8] })) / 2;
  return area;
}

/**
 * Pure synchronous build; no persistent checked/seen cache. Re-run after tile
 * arrival/removal or a pavement revision and replace old geometry. An entire
 * row is withheld if any stroke lacks support, so streamed partial rows cannot
 * be mistaken for completed work. Packed parking without source ranges is
 * accepted only when its exact local footprint proves ownership.
 */
export function buildRouteParkingPaint({ plan, samplePavement } = {}) {
  if (!plan?.containsParking || !Array.isArray(plan.rows) || plan.rows.length > 2
    || typeof samplePavement !== 'function') throw new TypeError('Walmart plan and rendered pavement sampler required');
  const rows = plan.rows.map(row => {
    const diagnostics = {}, positions = [], cache = new Map();
    let pending = false, blocked = false;
    const reject = (reason, retryable = false) => {
      diagnostics[reason] = (diagnostics[reason] || 0) + 1;
      if (retryable) pending = true; else blocked = true;
      return null;
    };
    const supportAt = (x, z) => {
      const key = `${x}:${z}`;
      if (cache.has(key)) return cache.get(key);
      const value = (() => {
        // The complete convex stroke was checked against every source edge
        // before this sampler is used; all subdivision probes lie within it.
        let hit, road;
        try {
          hit = samplePavement(x, z, null);
          if (!hit || !Number.isFinite(hit.height)) return reject('pavement-not-ready', true);
          if (hit.layer !== 'parking_surfaces') return reject('not-parking');
          if (hit.heightSource !== 'rendered-pavement-triangle') return reject('unverified-height');
          const sourceId = hit.sourceId || hit.id;
          const unlabelledPacked = !hit.sourceId && /^-?\d+:-?\d+$/.test(hit.id || '') && hit.contact === 'official';
          if (sourceId !== row.sourceId && !unlabelledPacked) return reject('wrong-lot');
          road = samplePavement(x, z, hit.height, { includeParking: false });
        } catch {
          return reject('pavement-not-ready', true);
        }
        if (road) return reject('public-road-overlap');
        return hit.height;
      })();
      cache.set(key, value);
      return value;
    };
    const polygons = validRow(row) ? strokePolygons(row) : [];
    if (!polygons.length) reject('invalid-row');
    for (const polygon of polygons) {
      if (!polygonWithinLot(polygon, plan)) { reject('outside-lot'); continue; }
      // Preflight the whole narrow stroke. Do not draw isolated pieces on two
      // grades simply because each small draped triangle is locally supported.
      const steps = Math.ceil(row.length / (PAINT_SAMPLE_SPACING / 2));
      let previous = null;
      for (let i = 0; i <= steps; i++) {
        const along = i / steps, heights = [];
        for (const across of [0, .5, 1]) {
          const x = polygon[0].x + (polygon[1].x - polygon[0].x) * along + (polygon[3].x - polygon[0].x) * across;
          const z = polygon[0].z + (polygon[1].z - polygon[0].z) * along + (polygon[3].z - polygon[0].z) * across;
          heights.push(supportAt(x, z));
        }
        if (heights.every(height => height !== null)) {
          if (Math.max(...heights) - Math.min(...heights) > MAX_HEIGHT_STEP
            || (previous && heights.some((height, j) => Math.abs(height - previous[j]) > MAX_HEIGHT_STEP))) reject('discontinuous-height');
          previous = heights;
        } else previous = null;
      }
      if (pending || blocked) continue;
      const batch = drapePaintPolygon(polygon, supportAt, { sourceId: row.sourceId,
        spacing: PAINT_SAMPLE_SPACING, lift: PAINT_LIFT, maxHeightJump: MAX_HEIGHT_STEP, maxTriangles: 256 });
      if (Math.abs(paintArea(batch.positions) - row.length * row.width) > row.length * row.width * .005) {
        if (!pending) reject('discontinuous-or-incomplete-paint');
        continue;
      }
      positions.push(...batch.positions);
    }
    const status = pending ? 'pending' : blocked ? 'blocked' : 'ready';
    return { id: row.id, sourceId: row.sourceId, status, retryable: pending, diagnostics,
      emittedLines: status === 'ready' ? row.count : 0,
      positions: new Float32Array(status === 'ready' ? positions : []) };
  });
  return { sourceId: plan.sourceId, positions: new Float32Array(rows.flatMap(row => [...row.positions])), rows,
    ready: rows.length > 0 && rows.every(row => row.status === 'ready'),
    retryable: rows.some(row => row.retryable) };
}

function bareBranches(tree) {
  const branches = [];
  const segment = (a, b, radius) => branches.push({ a, b, radius });
  segment([0, 0, 0], [.06, 4.2, .03], tree.trunkDiameter / 2);
  segment([.06, 4.2, .03], [-.14, tree.height, .1], .075);
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI * 2 / 8 + .23;
    const base = [.03, 2.9 + (i % 3) * .55, .02];
    const middle = [Math.cos(angle) * 1.35, 4.7 + (i % 3) * .42, Math.sin(angle) * 1.35];
    const tip = [Math.cos(angle + .15) * tree.crownDiameter * .47, 6.0 + (i % 3) * .38,
      Math.sin(angle + .15) * tree.crownDiameter * .47];
    segment(base, middle, .055);
    segment(middle, tip, .026);
    segment(middle, [Math.cos(angle - .28) * 1.85, Math.min(tree.height - .1, middle[1] + 1.55),
      Math.sin(angle - .28) * 1.85], .019);
  }
  return branches;
}

/** One source cap surface and one small leafless branch instance batch. */
export function createWalmartTreeIsland({ THREE, plan, groundHeight, lowPower = false } = {}) {
  if (!THREE?.InstancedMesh || !plan?.treeIsland || typeof groundHeight !== 'function') throw new TypeError('THREE, Walmart plan and ground sampler required');
  const { ring, tree } = plan.treeIsland;
  let missing = false;
  const groundAt = (x, z) => {
    let height;
    try { height = groundHeight(x, z); } catch { missing = true; return null; }
    if (!Number.isFinite(height)) { missing = true; return null; }
    return height;
  };
  const baseY = groundAt(tree.x, tree.z);
  const cap = drapePaintPolygon(ring, groundAt, { sourceId: WALMART_PARKING_SOURCE_ID,
    spacing: 1, lift: .015, maxHeightJump: MAX_HEIGHT_STEP });
  if (missing || baseY === null || !cap.positions.length) return { group: null, status: 'pending', retryable: true };
  const capArea = Math.abs(ring.reduce((sum, a, i) => {
    const b = ring[(i + 1) % ring.length];
    return sum + a.x * b.z - b.x * a.z;
  }, 0)) / 2;
  if (Math.abs(paintArea(cap.positions) - capArea) > capArea * .005) {
    return { group: null, status: 'blocked', retryable: false, diagnostics: { 'discontinuous-ground': 1 } };
  }
  const group = new THREE.Group();
  group.name = 'Walmart H1 northwest tree cap';
  group.userData = { sourceId: WALMART_PARKING_SOURCE_ID, sourceRingIndex: 1, decorative: true,
    collision: false, photos: WALMART_TREE_ISLAND.photos, inferred: tree.inferred };
  const soilGeometry = new THREE.BufferGeometry();
  soilGeometry.setAttribute('position', new THREE.BufferAttribute(cap.positions, 3));
  soilGeometry.computeVertexNormals();
  const soil = new THREE.Mesh(soilGeometry, new THREE.MeshStandardMaterial({ color: 0x765744, roughness: 1 }));
  soil.name = 'Mapped northwest cap soil'; soil.receiveShadow = true;
  soil.userData = { decorative: true, collision: false };
  const segments = bareBranches(tree);
  const branches = new THREE.InstancedMesh(new THREE.CylinderGeometry(.65, 1, 1, 6),
    new THREE.MeshStandardMaterial({ color: 0x63564a, roughness: 1 }), segments.length);
  const dummy = new THREE.Object3D(), up = new THREE.Vector3(0, 1, 0);
  segments.forEach(({ a, b, radius }, i) => {
    const direction = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const length = direction.length();
    dummy.position.set(tree.x + (a[0] + b[0]) / 2, baseY + (a[1] + b[1]) / 2, tree.z + (a[2] + b[2]) / 2);
    dummy.quaternion.setFromUnitVectors(up, direction.normalize());
    dummy.scale.set(radius, length, radius); dummy.updateMatrix(); branches.setMatrixAt(i, dummy.matrix);
  });
  branches.name = 'Observed leafless tree branches';
  branches.instanceMatrix.needsUpdate = true; branches.computeBoundingSphere();
  branches.castShadow = !lowPower; branches.receiveShadow = true;
  branches.userData = { decorative: true, collision: false, inferred: tree.inferred };
  group.add(soil, branches);
  return { group, status: 'ready', retryable: false, diagnostics: { trees: 1, branchInstances: segments.length, meshBatches: 2 } };
}
