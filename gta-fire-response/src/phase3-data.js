const objective = (id, label, dependencies = [], options = {}) => ({ id, label, dependencies, essential: options.essential !== false, duration: options.duration || 0, action: options.action || null, hint: options.hint || '' });

export const OPERATION_TEMPLATES = Object.freeze({
  'structure-fire': {
    id: 'structure-fire', label: 'Structure Fire Operations', baseRisk: 38,
    objectives: [
      objective('arrival', 'Arrive and position Engine 1'),
      objective('sizeup', 'Complete a 360° size-up', ['arrival'], { action:'sizeup', hint:'Confirm conditions, access and exposures.' }),
      objective('command', 'Establish incident command', ['sizeup'], { action:'command' }),
      objective('water', 'Secure an attack water source', ['command'], { essential:false }),
      objective('attack', 'Knock down the main body of fire', ['command']),
      objective('search', 'Complete a primary search', ['attack'], { action:'search', duration:8 }),
      objective('overhaul', 'Check extension and overhaul', ['search'], { action:'overhaul', duration:7 }),
      objective('accountability', 'Confirm crew accountability', ['overhaul'], { action:'accountability' })
    ]
  },
  'vehicle-fire': {
    id: 'vehicle-fire', label: 'Vehicle Fire Operations', baseRisk: 32,
    objectives: [
      objective('arrival', 'Position uphill and upwind'),
      objective('sizeup', 'Identify fuel and exposure hazards', ['arrival'], { action:'sizeup' }),
      objective('command', 'Establish command and safe work zone', ['sizeup'], { action:'command' }),
      objective('attack', 'Extinguish the vehicle fire', ['command']),
      objective('overhaul', 'Cool hot spots and inspect the compartment', ['attack'], { action:'overhaul', duration:6 }),
      objective('accountability', 'Account for crew and equipment', ['overhaul'], { action:'accountability' })
    ]
  },
  medical: {
    id: 'medical', label: 'Medical Assist Operations', baseRisk: 24,
    objectives: [
      objective('arrival', 'Make patient contact'),
      objective('scene-safety', 'Confirm scene safety and PPE', ['arrival'], { action:'scene-safety' }),
      objective('assessment', 'Complete a primary assessment', ['scene-safety']),
      objective('treatment', 'Provide indicated treatment', ['assessment']),
      objective('handoff', 'Transfer care to paramedics', ['treatment']),
      objective('documentation', 'Give a concise verbal report', ['handoff'], { action:'documentation' })
    ]
  },
  mvc: {
    id: 'mvc', label: 'Collision Rescue Operations', baseRisk: 35,
    objectives: [
      objective('arrival', 'Block the lane and protect the scene'),
      objective('traffic', 'Deploy traffic control', ['arrival']),
      objective('stabilize', 'Stabilize involved vehicles', ['traffic'], { action:'stabilize', duration:7 }),
      objective('access', 'Create safe patient access', ['stabilize'], { action:'access', duration:8 }),
      objective('treatment', 'Assess and assist the occupant', ['access']),
      objective('handoff', 'Transfer care to paramedics', ['treatment']),
      objective('debris', 'Confirm hazards and debris are controlled', ['handoff'], { action:'debris', duration:5 })
    ]
  },
  alarm: {
    id: 'alarm', label: 'Alarm Investigation', baseRisk: 22,
    objectives: [
      objective('arrival', 'Stage without blocking access'),
      objective('sizeup', 'Read conditions from the exterior', ['arrival'], { action:'sizeup' }),
      objective('investigate', 'Investigate the reported alarm zone', ['sizeup'], { action:'investigate', duration:8 }),
      objective('meter', 'Check for heat, smoke or gas readings', ['investigate'], { action:'meter', duration:6 }),
      objective('reset', 'Reset the system and advise the occupant', ['meter'], { action:'reset', duration:4 })
    ]
  },
  rescue: {
    id: 'rescue', label: 'Public Assist Operations', baseRisk: 18,
    objectives: [
      objective('arrival', 'Make contact and identify the problem'),
      objective('sizeup', 'Confirm hazards and resources', ['arrival'], { action:'sizeup' }),
      objective('assist', 'Complete the physical assist', ['sizeup'], { action:'assist', duration:10 }),
      objective('reassess', 'Reassess the person and scene', ['assist'], { action:'reassess', duration:4 }),
      objective('documentation', 'Close the call with a clear report', ['reassess'], { action:'documentation' })
    ]
  }
});

export const RADIO_LINES = Object.freeze({
  dispatch: [
    'Engine 1, caller reports “a weird smell.” The universal unit of measurement.',
    'Engine 1, respond priority. Coffee may remain in the cup holder at your own risk.',
    'Dispatch advises the caller has already diagnosed the incident using social media.',
    'Engine 1, stand by for an address correction immediately after you pass the turn.'
  ],
  arrival: [
    'Command established. Clipboard confidence is now at maximum.',
    'Bystanders confirm they were not involved but have seventeen important details.',
    'Scene size-up complete: smoke, people, and one vehicle parked exactly where you need it.'
  ],
  escalation: [
    'Conditions are changing. The incident has declined your request to remain simple.',
    'Risk increasing. Someone has moved the problem from “probably fine” to “definitely ours.”',
    'Command update: the easy call has left the chat.'
  ],
  completion: [
    'Incident controlled. Begin the traditional search for the tool somebody put down “right here.”',
    'Call complete. Dispatch has detected that you were almost comfortable.',
    'All objectives complete. The paperwork boss battle is unlocked.'
  ]
});

export const RANKS = Object.freeze(['Recruit', 'Probationary Firefighter', 'Firefighter', 'Senior Firefighter', 'Acting Captain', 'Shift Legend']);
export const XP_THRESHOLDS = Object.freeze([0, 400, 900, 1600, 2500, 3600]);
export const UNLOCKS = Object.freeze([
  { level:1, id:'command-board', label:'Command board' },
  { level:2, id:'thermal-camera', label:'Thermal camera operations' },
  { level:3, id:'rescue-saw', label:'Rescue saw operations' },
  { level:4, id:'foam-kit', label:'Foam operations' },
  { level:5, id:'acting-officer', label:'Acting officer call variants' },
  { level:6, id:'legend-radio', label:'Legendary radio chatter' }
]);
