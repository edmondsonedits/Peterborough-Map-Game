/* Completed-call accounting shared by the native city Dispatch demos. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PTBO_DISPATCH_DEMO_CORE=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function createSession({cityId,callLimit}={}) {
    if (!/^[a-z0-9-]+$/.test(cityId || '') || callLimit !== 5) throw new Error('This city does not have a supported five-call Dispatch demo.');
    let completed = 0, active = null;
    const generations = new Set(), completedCalls = new Set();
    const key = ({service,baseId,callId}) => `${service}:${baseId}:${callId}`;
    const canStart = () => completed < callLimit && !active;
    function start(mission) {
      if (!canStart() || mission?.cityId !== cityId || !Number.isInteger(mission.generation) ||
          !['fire','ems'].includes(mission.service) || !mission.baseId || !mission.callId ||
          generations.has(mission.generation) || completedCalls.has(key(mission))) return false;
      active = {...mission};
      generations.add(mission.generation);
      return true;
    }
    function complete(mission) {
      if (!active || mission?.cityId !== cityId || mission.generation !== active.generation) return false;
      completedCalls.add(key(active));
      completed += 1;
      active = null;
      return true;
    }
    function candidates(training, calls, selection, {includeCompleted=false}={}) {
      const manifest = training?.dispatchDemo;
      const groups = manifest?.bases?.filter(group => group.baseId === selection?.baseId && group.service === selection?.service);
      const ids = groups?.[0]?.callIds;
      if (training?.id !== cityId || selection?.cityId !== cityId || manifest?.schemaVersion !== 1 ||
          manifest.callLimit !== callLimit || groups?.length !== 1 || !Array.isArray(ids) || ids.length !== callLimit ||
          ids.some(id => typeof id !== 'string' || !id) || new Set(ids).size !== callLimit || !Array.isArray(calls)) {
        throw new Error('The selected base does not have a verified five-call demo. Choose another base or return to cities.');
      }
      const allowed = new Set(ids), pool = calls.filter(call => allowed.has(call.id));
      if (pool.length !== callLimit || new Set(pool.map(call=>call.id)).size !== callLimit ||
          pool.some(call => call.cityId !== cityId || !call.trainingServices?.includes(selection.service))) {
        throw new Error('The selected base’s demo calls could not load. Refresh the page to try again.');
      }
      return pool.filter(call => includeCompleted || !completedCalls.has(key({...selection,callId:call.id})));
    }
    return Object.freeze({
      canStart,start,complete,candidates,
      cancel:() => {active=null;},
      reset:() => {completed=0;active=null;generations.clear();completedCalls.clear();},
      get state() {return Object.freeze({cityId,callLimit,completed,remaining:callLimit-completed,finished:completed===callLimit,activeGeneration:active?.generation ?? null});},
    });
  }
  return Object.freeze({createSession});
});
