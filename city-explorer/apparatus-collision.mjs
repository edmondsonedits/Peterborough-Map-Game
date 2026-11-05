export function vehicleFootprint(p,d){const c=Math.cos(p.heading||0),s=Math.sin(p.heading||0);return [[-1,-1],[-1,1],[1,1],[1,-1]].map(([x,z])=>({x:p.x+c*x*d.width/2+s*z*d.length/2,z:p.z-s*x*d.width/2+c*z*d.length/2}));}
export function polygonsOverlap(a,b){for(const polygon of [a,b])for(let i=0;i<polygon.length;i++){const n={x:polygon[(i+1)%polygon.length].z-polygon[i].z,z:polygon[i].x-polygon[(i+1)%polygon.length].x};const aa=a.map(p=>p.x*n.x+p.z*n.z),bb=b.map(p=>p.x*n.x+p.z*n.z);if(Math.max(...aa)<Math.min(...bb)||Math.max(...bb)<Math.min(...aa))return false;}return true;}
export function sweepVehicle(a,b,size,blocked){const angle=Math.atan2(Math.sin(b.heading-a.heading),Math.cos(b.heading-a.heading));const steps=Math.max(1,Math.ceil((Math.hypot(b.x-a.x,b.z-a.z)+Math.abs(angle)*size.length)/.3));for(let i=1;i<=steps;i++){const t=i/steps;if(blocked({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,heading:a.heading+angle*t}))return true;}return false;}
/** Slab intersection parameter, null if clear. Radius conservatively inflates solid. */
export function segmentBoxHit(a,b,box,radius=0){let near=0,far=1;for(const key of ['x','y','z']){const d=b[key]-a[key],lo=box.min[key]-radius,hi=box.max[key]+radius;if(Math.abs(d)<1e-9){if(a[key]<lo||a[key]>hi)return null;continue;}let p=(lo-a[key])/d,q=(hi-a[key])/d;if(p>q)[p,q]=[q,p];near=Math.max(near,p);far=Math.min(far,q);if(near>far)return null;}return near;}

export function vehicleExitCandidates(pose, dimensions, rearAccess) {
  const side = dimensions.width / 2 + .55;
  const end = dimensions.length / 2 + .65;
  const offsets = [[side,0],[-side,0],[0,end],[side,end],[-side,end],[0,-end],[side,-end],[-side,-end]];
  const c = Math.cos(pose.heading), s = Math.sin(pose.heading);
  const candidates = offsets.map(([x,z]) => ({x:pose.x+c*x+s*z,z:pose.z-s*x+c*z}));
  return rearAccess ? [rearAccess,...candidates] : candidates;
}

export function resolveVehicleContact(previous, next, blocked) {
  if (!blocked(next)) return next;
  // A straight move can clear contact when steering would swing a corner into it.
  const distance = Math.sign(next.speed) * Math.hypot(next.x-previous.x,next.z-previous.z);
  if (distance && next.heading !== previous.heading) {
    const straight = {...next, heading:previous.heading,
      x:previous.x-Math.sin(previous.heading)*distance,
      z:previous.z-Math.cos(previous.heading)*distance};
    if (!blocked(straight)) return straight;
  }
  return {...next,x:previous.x,z:previous.z,heading:previous.heading,speed:0,acceleration:0};
}
