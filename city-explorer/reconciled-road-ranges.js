/** Transform source-ordered triangle ranges without changing geometry operations.
 * Updates are staged: callers apply them only together with the new GPU buffer.
 * Unknown, overlapping or stale ranges are never reassigned to guessed sources.
 */
export function transformRoadSourceRanges(positions, ranges, revision, transform) {
  const sorted=[...ranges].sort((a,b)=>a.startVertex-b.startVertex);
  let cursor=0;
  const valid=sorted.length>0 && sorted.every(range=>{
    const start=range.startVertex,count=range.vertexCount;
    if(!Number.isInteger(start)||!Number.isInteger(count)||start%3||count%3||count<0
      ||start<cursor||start+count>positions.length/3||(range.roadGeometryRevision??0)!==revision)return false;
    cursor=start+count;return true;
  });
  if(!valid)return {positions:transform(positions),updates:[]};
  const output=[],updates=[];cursor=0;
  const append=part=>{for(const value of transform(part))output.push(value);};
  for(const range of sorted){
    const start=range.startVertex*3,end=start+range.vertexCount*3;
    if(start>cursor)append(positions.slice(cursor,start));
    const startVertex=output.length/3;
    if(end>start)append(positions.slice(start,end));
    updates.push({range,startVertex,vertexCount:output.length/3-startVertex});
    cursor=end;
  }
  if(cursor<positions.length)append(positions.slice(cursor));
  return {positions:output,updates};
}
