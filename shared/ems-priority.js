/* Shared EMS care-home selection policy for practice and response modes. */
(() => {
  'use strict';

  const CARE_HOME_TYPE = 'long-term-care';
  const CARE_WEIGHT = 0.7;

  function eligibleCandidates(candidates, service) {
    return (Array.isArray(candidates) ? candidates : []).filter(item =>
      !Array.isArray(item?.trainingServices) || item.trainingServices.includes(service));
  }

  function chooseGroup(candidates, options = {}) {
    const service = options.service === 'ems' ? 'ems' : 'fire';
    const random = typeof options.random === 'function' ? options.random : Math.random;
    let available = eligibleCandidates(candidates, service);
    const lastId = options.lastId;
    if (lastId != null && available.length > 1) {
      const alternatives = available.filter(item => item?.id !== lastId);
      if (alternatives.length) available = alternatives;
    }
    if (service !== 'ems' || available.length < 2) return available;

    const careHomes = available.filter(item => item?.facilityType === CARE_HOME_TYPE);
    const ordinary = available.filter(item => item?.facilityType !== CARE_HOME_TYPE);
    if (!careHomes.length || !ordinary.length) return available;

    const weight = Number.isFinite(Number(options.careWeight))
      ? Math.max(0, Math.min(1, Number(options.careWeight))) : CARE_WEIGHT;
    return Number(random()) < weight ? careHomes : ordinary;
  }

  function pick(candidates, options = {}) {
    const random = typeof options.random === 'function' ? options.random : Math.random;
    const group = chooseGroup(candidates, {...options, random});
    if (!group.length) return null;
    const index = Math.min(group.length - 1, Math.floor(Math.max(0, Number(random()) || 0) * group.length));
    return group[index];
  }

  window.PTBO_EMS_PRIORITY = Object.freeze({
    CARE_HOME_TYPE,
    CARE_WEIGHT,
    eligibleCandidates,
    chooseGroup,
    pick,
  });
})();
