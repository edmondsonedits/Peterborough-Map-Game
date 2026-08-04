export const FINAL_CALLS = Object.freeze([
  {
    id:'apartment-fire-bethune', type:'structure-fire', label:'HIGH-RISE FIRE', title:'Apartment Balcony Fire',
    address:'Bethune Street', lat:44.30682, lng:-78.32614, district:'central', icon:'🔥',
    notes:'Multiple callers report smoke from an upper balcony. Occupancy status is uncertain.',
    task:'Establish command, secure water, complete a primary search and control extension.', recommendedSupport:['police','ambulance'], hydrantId:'hydrant-station'
  },
  {
    id:'garage-fire-armour', type:'structure-fire', label:'GARAGE FIRE', title:'Detached Garage Fire',
    address:'Armour Road', lat:44.31664, lng:-78.30292, district:'east', icon:'🔥',
    notes:'Flames are visible from a detached garage with nearby exposures.',
    task:'Protect exposures, establish water and complete overhaul.', recommendedSupport:['police'], hydrantId:'hydrant-george'
  },
  {
    id:'commercial-fire-lansdowne', type:'structure-fire', label:'COMMERCIAL FIRE', title:'Storefront Smoke Investigation',
    address:'Lansdowne Street West', lat:44.28392, lng:-78.34168, district:'southwest', icon:'🔥',
    notes:'Staff report smoke behind a refrigeration unit. The building has been evacuated.',
    task:'Complete a 360, investigate, control the fire and check extension.', recommendedSupport:['police'], hydrantId:'hydrant-lansdowne'
  },
  {
    id:'vehicle-fire-water', type:'vehicle-fire', label:'VEHICLE FIRE', title:'Delivery Van Fire',
    address:'Water Street North', lat:44.32965, lng:-78.31822, district:'north', icon:'🔥',
    notes:'A delivery van is burning near a loading area. Propane cylinders are reported nearby.',
    task:'Position safely, identify hazards and cool the vehicle and exposures.', recommendedSupport:['police'], hydrantId:'hydrant-george'
  },
  {
    id:'medical-arena', type:'medical', label:'MEDICAL AID', title:'Chest Pain at Arena',
    address:'Lansdowne Street West', lat:44.28264, lng:-78.33151, district:'southwest', icon:'✚',
    notes:'An adult is conscious with chest discomfort. Arena staff have an AED available.',
    task:'Bring the medical bag and AED, assess the patient and transfer care.', recommendedSupport:['ambulance']
  },
  {
    id:'medical-park', type:'medical', label:'MEDICAL AID', title:'Heat Illness in Park',
    address:'Nicholls Oval Park', lat:44.31937, lng:-78.30612, district:'east', icon:'✚',
    notes:'A runner is dizzy and weak near the trail entrance.',
    task:'Locate the patient, assess, begin cooling and transfer care.', recommendedSupport:['ambulance']
  },
  {
    id:'medical-seniors', type:'medical', label:'MEDICAL AID', title:'Unresponsive Person',
    address:'Clonsilla Avenue', lat:44.29024, lng:-78.35177, district:'west', icon:'✚',
    notes:'Staff report an older adult is breathing but difficult to wake.',
    task:'Bring medical equipment, complete a rapid assessment and assist paramedics.', recommendedSupport:['ambulance']
  },
  {
    id:'mvc-marina', type:'mvc', label:'RESCUE RESPONSE', title:'Intersection Collision',
    address:'Water Street & Marina Boulevard', lat:44.33401, lng:-78.31618, district:'north', icon:'⚠',
    notes:'Two vehicles are partially blocking the intersection. Airbags have deployed.',
    task:'Block traffic, stabilize vehicles and provide patient access.', recommendedSupport:['police','ambulance']
  },
  {
    id:'mvc-parkhill', type:'mvc', label:'RESCUE RESPONSE', title:'Single Vehicle into Pole',
    address:'Parkhill Road West', lat:44.31913, lng:-78.34286, district:'northwest', icon:'⚠',
    notes:'A vehicle has struck a utility pole. Wires are reported intact.',
    task:'Establish a safe zone, stabilize the vehicle and assess the driver.', recommendedSupport:['police','ambulance']
  },
  {
    id:'alarm-hotel', type:'alarm', label:'AUTOMATIC ALARM', title:'Hotel Fire Alarm',
    address:'George Street North', lat:44.30983, lng:-78.31968, district:'central', icon:'◉',
    notes:'A detector has activated on an occupied floor. Staff are checking the panel.',
    task:'Investigate the alarm zone, meter conditions and advise staff.', recommendedSupport:[]
  },
  {
    id:'alarm-school', type:'alarm', label:'AUTOMATIC ALARM', title:'School Alarm Activation',
    address:'Monaghan Road', lat:44.29463, lng:-78.33492, district:'southwest', icon:'◉',
    notes:'The building is unoccupied. A custodian reports a water-flow alarm.',
    task:'Complete an exterior size-up, investigate and reset or escalate.', recommendedSupport:[]
  },
  {
    id:'co-east-city', type:'alarm', label:'CO ALARM', title:'Carbon Monoxide Investigation',
    address:'Hunter Street East', lat:44.30921, lng:-78.30551, district:'east', icon:'◉',
    notes:'A family is outside after two detectors activated. One person reports a headache.',
    task:'Meter the home, identify the source and coordinate patient assessment.', recommendedSupport:['ambulance']
  },
  {
    id:'elevator-rescue', type:'rescue', label:'ELEVATOR RESCUE', title:'Stalled Elevator',
    address:'Charlotte Street', lat:44.30437, lng:-78.32282, district:'central', icon:'◆',
    notes:'Three occupants are communicating through the elevator phone. No injuries reported.',
    task:'Confirm power isolation, establish contact and complete a controlled release.', recommendedSupport:[]
  },
  {
    id:'water-rescue-otonabee', type:'rescue', label:'WATER RESCUE', title:'Person in River',
    address:'Otonabee River Trail', lat:44.31144, lng:-78.30723, district:'east', icon:'◆',
    notes:'A caller reports a person holding the riverbank below the trail.',
    task:'Establish command, identify access and assist the rescue operation.', recommendedSupport:['police','ambulance']
  },
  {
    id:'public-assist-north', type:'rescue', label:'PUBLIC ASSIST', title:'Locked Bathroom Assist',
    address:'Chemong Road', lat:44.33226, lng:-78.33795, district:'north', icon:'◆',
    notes:'A resident is unable to open an interior door. The person inside is answering normally.',
    task:'Assess urgency, gain safe access and confirm the occupant is well.', recommendedSupport:[]
  }
]);

export const INCIDENT_VARIANTS = Object.freeze({
  'structure-fire': [
    { id:'routine', label:'Working Fire', brief:'Visible smoke with normal access.', risk:0, payout:1 },
    { id:'exposure', label:'Exposure Problem', brief:'A nearby building is threatened. Water supply matters more.', risk:9, payout:1.12 },
    { id:'reported-trapped', label:'Possible Occupant', brief:'A caller cannot confirm everyone is out. Search priority is elevated.', risk:13, payout:1.18 },
    { id:'attic-extension', label:'Hidden Extension', brief:'Heat is moving through concealed space. Overhaul will take longer.', risk:8, payout:1.1 }
  ],
  'vehicle-fire': [
    { id:'routine', label:'Passenger Vehicle', brief:'Standard vehicle-fire hazards.', risk:0, payout:1 },
    { id:'fuel-leak', label:'Fuel Leak', brief:'Runoff and ignition control are priorities.', risk:8, payout:1.1 },
    { id:'exposure', label:'Exposure Vehicle', brief:'A second vehicle is threatened.', risk:7, payout:1.08 }
  ],
  medical: [
    { id:'stable', label:'Stable Patient', brief:'Patient is conscious and communicating.', risk:0, payout:1 },
    { id:'deteriorating', label:'Deteriorating Patient', brief:'Rapid assessment and early treatment are important.', risk:10, payout:1.12 },
    { id:'crowded-scene', label:'Crowded Scene', brief:'Bystanders are limiting access and adding scene-management pressure.', risk:5, payout:1.06 }
  ],
  mvc: [
    { id:'standard', label:'Standard MVC', brief:'One lane blocked with accessible occupants.', risk:0, payout:1 },
    { id:'unstable', label:'Unstable Vehicle', brief:'Vehicle stabilization must be completed before access.', risk:10, payout:1.13 },
    { id:'traffic-heavy', label:'Heavy Traffic', brief:'Traffic control is urgent and police response is delayed.', risk:8, payout:1.1 }
  ],
  alarm: [
    { id:'false-alarm', label:'Likely False Alarm', brief:'No exterior signs, but the alarm zone still requires investigation.', risk:-4, payout:.96 },
    { id:'odor', label:'Odour Reported', brief:'Occupants report an unusual odour near the alarm zone.', risk:5, payout:1.05 },
    { id:'confirmed-reading', label:'Confirmed Reading', brief:'The panel or meter indicates a real hazard.', risk:11, payout:1.14 }
  ],
  rescue: [
    { id:'routine', label:'Routine Assist', brief:'Conditions are stable and access is straightforward.', risk:0, payout:1 },
    { id:'limited-access', label:'Limited Access', brief:'Confined access increases task time and crew fatigue.', risk:8, payout:1.1 },
    { id:'public-pressure', label:'Public Pressure', brief:'A crowd is gathering and scene control matters.', risk:5, payout:1.06 }
  ]
});

export const DIFFICULTY_PRESETS = Object.freeze([
  { id:'story', label:'Story Shift', description:'Guided objectives, slower escalation and forgiving stamina.', risk:.62, fatigue:.7, traffic:.72, payout:.82, hints:true },
  { id:'standard', label:'Standard Shift', description:'Balanced city, tactical and career play.', risk:1, fatigue:1, traffic:1, payout:1, hints:true },
  { id:'veteran', label:'Veteran Shift', description:'Faster escalation, denser traffic and fewer automatic hints.', risk:1.28, fatigue:1.18, traffic:1.18, payout:1.22, hints:false },
  { id:'chaos', label:'Friday Night', description:'Maximum pressure, heavy traffic and the radio never stops.', risk:1.55, fatigue:1.32, traffic:1.32, payout:1.45, hints:false }
]);

export const MEDALS = Object.freeze([
  { id:'first-call', label:'First Due', description:'Complete your first incident.', metric:'calls', target:1 },
  { id:'ten-calls', label:'Tour of Duty', description:'Complete 10 incidents.', metric:'calls', target:10 },
  { id:'fifty-calls', label:'Street Shift Regular', description:'Complete 50 incidents.', metric:'calls', target:50 },
  { id:'all-types', label:'All Hazards', description:'Complete every incident type.', metric:'types', target:6 },
  { id:'all-districts', label:'City Coverage', description:'Complete incidents in every district.', metric:'districts', target:6 },
  { id:'all-stations', label:'Three-Hall Tour', description:'Complete incidents from all three stations.', metric:'stations', target:3 },
  { id:'all-apparatus', label:'Fleet Qualified', description:'Complete incidents in all four apparatus.', metric:'apparatus', target:4 },
  { id:'five-s', label:'Gold Helmet', description:'Earn five S tactical ranks.', metric:'sRanks', target:5 },
  { id:'clean-ten', label:'Mirror Finish', description:'Complete 10 collision-free incidents.', metric:'cleanCalls', target:10 },
  { id:'second-alarm', label:'Big Job', description:'Complete an incident after requesting a second alarm.', metric:'secondAlarms', target:1 },
  { id:'perfect-shift', label:'Nothing to Explain', description:'Finish a shift with three completed challenges.', metric:'perfectShifts', target:1 },
  { id:'legend', label:'Shift Legend', description:'Reach career level 6.', metric:'level', target:6 }
]);

export const TUTORIAL_STEPS = Object.freeze([
  { id:'hq', title:'Choose your assignment', text:'Open HQ to select a station, apparatus and shift condition. Engine 1 at Station 1 is the balanced default.', anchor:'#phase4-open' },
  { id:'start', title:'Start the shift', text:'Press Start Shift. Dispatch will assign a call after the unit is marked available.', anchor:'#start-button' },
  { id:'move', title:'Move and enter the apparatus', text:'Use WASD, arrow keys or the mobile joystick. Walk to the driver door and use Interact.', anchor:'#joystick' },
  { id:'respond', title:'Drive like the mirrors matter', text:'Use lights and siren when appropriate. Traffic yields, but collisions still damage the apparatus and score.', anchor:'#lights-button' },
  { id:'command', title:'Run the incident', text:'On scene, open Command to complete ordered tactical objectives, assign crew and manage equipment.', anchor:'#phase3-open' },
  { id:'quarters', title:'Return, service and continue', text:'After the debrief, return to quarters, service the unit if needed and mark it ready for the next call.', anchor:'#phase4-open' }
]);

export const FINAL_RADIO = Object.freeze({
  briefing:[
    'Dispatch update: the caller has supplied three landmarks, none of which are visible from the road.',
    'Additional information: the situation is exactly the same, but now stated with greater urgency.',
    'Dispatch advises the neighbour has a key, an opinion, and no intention of keeping either private.'
  ],
  medal:[
    'Commendation recorded. The certificate will arrive immediately after everyone forgets why it was earned.',
    'New medal unlocked. It is worth exactly one proud nod near the coffee machine.',
    'Career milestone achieved. Dispatch remains professionally unimpressed.'
  ],
  lowPerformance:[
    'City detail reduced to keep the shift smooth. The pedestrians have been reassigned to paperwork.',
    'Performance protection active. Several unnecessary bystanders have remembered appointments elsewhere.'
  ]
});
