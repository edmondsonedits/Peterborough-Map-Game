export const CITY_STATIONS = Object.freeze([
  {
    id:'station-1', number:1, name:'Station 1', address:'210 Sherbrooke Street', district:'central',
    lat:44.300871, lng:-78.322206,
    playerSpawn:{ lat:44.300871, lng:-78.322206, heading:180 },
    truckSpawn:{ lat:44.300901, lng:-78.322106, heading:165 },
    description:'Headquarters and central-city coverage.'
  },
  {
    id:'station-2', number:2, name:'Station 2', address:'100 Marina Boulevard', district:'north',
    lat:44.33472, lng:-78.31502,
    playerSpawn:{ lat:44.33471, lng:-78.31502, heading:90 },
    truckSpawn:{ lat:44.33476, lng:-78.31491, heading:95 },
    description:'North-end deployment near Water Street and Marina Boulevard.'
  },
  {
    id:'station-3', number:3, name:'Station 3', address:'839 Clonsilla Avenue', district:'southwest',
    lat:44.28488, lng:-78.35092,
    playerSpawn:{ lat:44.28488, lng:-78.35092, heading:90 },
    truckSpawn:{ lat:44.28492, lng:-78.35079, heading:82 },
    description:'West and south-end coverage with highway access.'
  }
]);

export const APPARATUS_PROFILES = Object.freeze([
  {
    id:'engine-1', callSign:'ENGINE 1', label:'Engine 1', homeStation:'station-1', unlockLevel:1,
    role:'Balanced structural pumper', tank:750, fuelCapacity:100,
    factors:{ acceleration:1, braking:1, lowTurn:1, highTurn:1, maxSpeed:1, collisionRetention:1 },
    traits:['750 L tank','Balanced handling','Full structural inventory']
  },
  {
    id:'engine-2', callSign:'ENGINE 2', label:'Engine 2', homeStation:'station-2', unlockLevel:2,
    role:'Agile north-end pumper', tank:650, fuelCapacity:92,
    factors:{ acceleration:1.08, braking:1.04, lowTurn:1.12, highTurn:1.08, maxSpeed:.98, collisionRetention:.96 },
    traits:['650 L tank','Faster turn-in','Quicker turnout']
  },
  {
    id:'rescue-3', callSign:'RESCUE 3', label:'Rescue 3', homeStation:'station-3', unlockLevel:3,
    role:'Technical-rescue and medical unit', tank:350, fuelCapacity:86,
    factors:{ acceleration:1.12, braking:1.08, lowTurn:1.18, highTurn:1.12, maxSpeed:1.04, collisionRetention:.92 },
    traits:['350 L tank','Best handling','Rescue-tool bonus']
  },
  {
    id:'ladder-1', callSign:'LADDER 1', label:'Ladder 1', homeStation:'station-1', unlockLevel:5,
    role:'Heavy aerial apparatus', tank:500, fuelCapacity:120,
    factors:{ acceleration:.78, braking:.86, lowTurn:.72, highTurn:.76, maxSpeed:.88, collisionRetention:1.08 },
    traits:['500 L tank','Heavy footprint','Large-incident bonus']
  }
]);

export const CITY_DISTRICTS = Object.freeze([
  { id:'central', label:'Central', lat:44.3058, lng:-78.3213, color:'#f4c542' },
  { id:'north', label:'North End', lat:44.3372, lng:-78.3180, color:'#4ecdc4' },
  { id:'northwest', label:'Northwest', lat:44.3190, lng:-78.3430, color:'#86a8ff' },
  { id:'west', label:'West End', lat:44.3010, lng:-78.3550, color:'#d38cff' },
  { id:'southwest', label:'Southwest', lat:44.2860, lng:-78.3370, color:'#ff8a65' },
  { id:'east', label:'East City', lat:44.3070, lng:-78.3020, color:'#72d572' }
]);

export const SHIFT_MODIFIERS = Object.freeze([
  { id:'normal', label:'Normal Tuesday Energy', description:'Steady call volume and ordinary traffic.', callPressure:1, payout:1 },
  { id:'rush-hour', label:'Rush-Hour Shuffle', description:'More traffic, shorter patience and louder horns.', callPressure:1.12, payout:1.08 },
  { id:'hydrant-testing', label:'Hydrant Testing Day', description:'Water-supply objectives pay extra.', callPressure:.96, payout:1.06 },
  { id:'festival', label:'Festival Night', description:'Central calls and public assists are more common.', callPressure:1.15, payout:1.12 },
  { id:'short-staffed', label:'The Overtime List Won', description:'Crew commands matter more and mutual aid arrives slower.', callPressure:1.2, payout:1.18 }
]);

export const SHIFT_CHALLENGES = Object.freeze([
  { id:'clean-cab', label:'Still Has Mirrors', description:'Complete 3 calls with no traffic collisions.', target:3, metric:'cleanCalls', reward:180 },
  { id:'first-water', label:'Hydrant Hero', description:'Establish water on 2 fire calls.', target:2, metric:'waterCalls', reward:150 },
  { id:'crew-chief', label:'Delegation Station', description:'Issue 6 useful crew commands.', target:6, metric:'crewCommands', reward:140 },
  { id:'fast-turnout', label:'Boots Before Brain', description:'Make 2 turnouts in under 35 seconds.', target:2, metric:'fastTurnouts', reward:130 },
  { id:'district-tour', label:'Citywide Tour', description:'Complete calls in 3 different districts.', target:3, metric:'districts', reward:170 },
  { id:'equipment-check', label:'Nothing Left on the Lawn', description:'Finish 3 calls without leaving equipment behind.', target:3, metric:'cleanEquipmentCalls', reward:150 }
]);

export const MUTUAL_AID_UNITS = Object.freeze([
  { id:'mutual-engine', kind:'engine', label:'Second Engine', symbol:'ENG', speed:19, riskReduction:10 },
  { id:'mutual-ladder', kind:'ladder', label:'Ladder Company', symbol:'LAD', speed:15, riskReduction:14 }
]);

export const PHASE4_RADIO = Object.freeze({
  ready:[
    'Dispatch confirms the apparatus is ready. The coffee has entered a high-risk holding pattern.',
    'Station status: available. Everyone has now remembered the chore they forgot upstairs.',
    'Back in service. Dispatch has interpreted this as a personal challenge.'
  ],
  mutualAid:[
    'Second alarm transmitted. Additional crews are responding and will absolutely ask where to park.',
    'Mutual aid assigned. Someone is already requesting the exact cross street that was just repeated.',
    'Additional apparatus responding. The command post has gained three radios and lost all silence.'
  ],
  service:[
    'Apparatus restored. The mechanic has diagnosed the previous noise as “driver enthusiasm.”',
    'Service complete. Every compartment is closed, which is how we know nobody has checked it yet.',
    'Fuel, water and confidence replenished.'
  ]
});
