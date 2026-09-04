/* Generic base-training city package factory for cities without dispatch calls yet. */
(() => {
  'use strict';
  const VERSION = '1.6.12';
  if (window.PTBO_PREVIEW_CITY_FACTORY?.version === VERSION) return;

  const normalizeText = value => String(value ?? '').trim().replace(/\s+/g,' ');
  const key = value => normalizeText(value).toLowerCase()
    .replace(/\b(street|st\.?|road|rd\.?|avenue|ave\.?|drive|dr\.?|boulevard|blvd\.?|highway|hwy\.?|north|south|east|west|n\.?|s\.?|e\.?|w\.?)\b/g,' ')
    .replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
  const slug = value => key(value).replace(/\s+/g,'-').replace(/^-|-$/g,'') || 'base';
  const firstNumber = value => Number((String(value ?? '').match(/\d+/) || [])[0]);
  const pointInBounds = (lat,lng,bounds) => Array.isArray(bounds) && bounds.length === 2 && lat >= bounds[0][0] && lat <= bounds[1][0] && lng >= bounds[0][1] && lng <= bounds[1][1];

  function sameAddress(a,b) {
    const aa=key(a),bb=key(b);
    if(!aa||!bb)return false;
    if(aa===bb||aa.includes(bb)||bb.includes(aa))return true;
    const an=firstNumber(a),bn=firstNumber(b);
    if(an&&bn&&an!==bn)return false;
    const aw=aa.split(' ').filter(word=>!/^\d+$/.test(word));
    const bw=bb.split(' ').filter(word=>!/^\d+$/.test(word));
    return Boolean(aw[0]&&bw[0]&&aw[0]===bw[0]);
  }

  async function fetchJson(url, timeoutMs=14000) {
    let lastError;
    for (let attempt=1; attempt<=2; attempt+=1) {
      const controller = new AbortController();
      const timer=setTimeout(()=>controller.abort(),timeoutMs);
      try {
        const response=await fetch(url,{signal:controller.signal,cache:'no-store',mode:'cors'});
        if(!response.ok)throw new Error(`Request failed (${response.status}) for ${url}`);
        const json=await response.json();
        if(json?.error)throw new Error(json.error.message||'ArcGIS request failed.');
        return json;
      } catch(error) {
        lastError=error;
        if(attempt<2) await new Promise(resolve=>setTimeout(resolve,350));
      } finally { clearTimeout(timer); }
    }
    throw lastError || new Error(`Unable to load ${url}`);
  }

  async function queryArcGis(layerUrl, where='1=1', outFields='*') {
    const url=new URL(`${String(layerUrl).replace(/\/$/,'')}/query`);
    url.searchParams.set('where',where);
    url.searchParams.set('outFields',outFields);
    url.searchParams.set('returnGeometry','true');
    url.searchParams.set('outSR','4326');
    url.searchParams.set('f','json');
    const json=await fetchJson(url.href);
    return Array.isArray(json.features)?json.features:[];
  }

  async function geocode(address, cityName) {
    const url=new URL('https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates');
    url.searchParams.set('SingleLine',`${address}, ${cityName}, Ontario, Canada`);
    url.searchParams.set('countryCode','CAN');
    url.searchParams.set('maxLocations','1');
    url.searchParams.set('outFields','Match_addr,Addr_type');
    url.searchParams.set('f','json');
    const json=await fetchJson(url.href,12000);
    const candidate=json.candidates?.[0];
    const lat=Number(candidate?.location?.y),lng=Number(candidate?.location?.x);
    if(!Number.isFinite(lat)||!Number.isFinite(lng))throw new Error(`Could not geocode ${address}.`);
    return {lat,lng};
  }

  function baseRecord({service,number,name,shortName,address,lat,lng,id}) {
    return Object.freeze({
      id:id||`${service}-${slug(name||address)}-${number}`,
      number:Number(number),name:normalizeText(name),shortName:normalizeText(shortName||name),address:normalizeText(address),
      lat:Number(lat),lng:Number(lng),yardSize:120,yardRotation:0,
    });
  }

  function finalizeRecords(records, config, service) {
    const seenPlaces=new Set();
    const cleaned=(records||[]).filter(base=>base?.name&&base?.address&&Number.isFinite(Number(base.lat))&&Number.isFinite(Number(base.lng))).filter(base=>{
      const fingerprint=`${key(base.address)}|${Number(base.lat).toFixed(5)}|${Number(base.lng).toFixed(5)}`;
      if(seenPlaces.has(fingerprint))return false;
      seenPlaces.add(fingerprint);
      return true;
    });
    if(!cleaned.length)throw new Error(`No ${service} bases were returned for ${config.name}.`);
    cleaned.sort((a,b)=>Number(a.number)-Number(b.number)||String(a.name).localeCompare(String(b.name)));

    const usedNumbers=new Set();
    const usedIds=new Set();
    return cleaned.map((base,index)=>{
      let number=Number(base.number);
      if(!Number.isInteger(number)||number<1||usedNumbers.has(number))number=index+1;
      while(usedNumbers.has(number))number+=1;
      usedNumbers.add(number);

      const rawId=String(base.id||'').toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-+|-+$/g,'');
      const serviceRoot=rawId.startsWith(`${service}-`) ? rawId : `${service}-${rawId||slug(base.name||base.address)}`;
      let id=serviceRoot;
      if(usedIds.has(id))id=`${serviceRoot}-${number}`;
      let suffix=2;
      while(usedIds.has(id))id=`${serviceRoot}-${number}-${suffix++}`;
      usedIds.add(id);
      return Object.freeze({...base,id,number});
    });
  }

  async function staticBases(entries, cityName, service) {
    return Promise.all((entries||[]).map(async (entry,index) => {
      let lat=Number(entry.lat),lng=Number(entry.lng);
      if(!Number.isFinite(lat)||!Number.isFinite(lng)) {
        const point=await geocode(entry.address,cityName);
        lat=point.lat;lng=point.lng;
      }
      return baseRecord({service,number:entry.number||index+1,name:entry.name||`${service==='fire'?'Station':'Base'} ${entry.number||index+1}`,shortName:entry.shortName,address:entry.address,lat,lng,id:entry.id});
    }));
  }

  function point(feature) {
    const a=feature?.attributes||{};
    const lat=Number(a.LATITUDE ?? a.Latitude ?? a.latitude ?? feature?.geometry?.y);
    const lng=Number(a.LONGITUDE ?? a.Longitude ?? a.longitude ?? feature?.geometry?.x);
    return {lat,lng};
  }

  async function loadSource(source, config, service) {
    const fallback=async error => {
      if(!source.fallback?.length)throw error;
      console.warn(`${config.name} ${service} live facility source failed; using verified-address geocoding.`,error);
      return finalizeRecords(await staticBases(source.fallback,config.name,service),config,service);
    };
    try {
      // Production startup must not depend on a municipal server or geocoder.
      // Verified packaged coordinates open immediately; live feeds remain useful
      // for future data-refresh tooling outside the critical game boot path.
      if(source.preferFallback&&source.fallback?.length)return finalizeRecords(await staticBases(source.fallback,config.name,service),config,service);
      if(source.type==='static')return finalizeRecords(await staticBases(source.entries||[],config.name,service),config,service);

      const features=await queryArcGis(source.url,source.where||'1=1',source.outFields||'*');
      let records=[];

      if(source.type==='durham-paramedic') {
        const municipality=String(source.municipality||'').toUpperCase();
        records=features.filter(feature=>String(feature.attributes?.MUNICIPALITY||feature.attributes?.TOWN||'').toUpperCase()===municipality).map((feature,index)=>{
          const a=feature.attributes||{},p=point(feature);
          return baseRecord({service,number:index+1,name:a.NAME||`Paramedic Base ${index+1}`,shortName:a.NAME||`Base ${index+1}`,address:a.ADDRESS||'',lat:p.lat,lng:p.lng,id:`ems-${slug(a.NAME||a.ADDRESS||index+1)}`});
        });
      } else if(source.type==='toronto-fire') {
        records=features.filter(feature=>{
          const a=feature.attributes||{},p=point(feature),station=Number(a.STATION);
          if(!source.scarborough)return true;
          return String(a.MUNICIPALITY_NAME||'').toLowerCase()==='scarborough'||(station>=200&&station<300)||pointInBounds(p.lat,p.lng,config.map.bounds);
        }).map(feature=>{
          const a=feature.attributes||{},p=point(feature),station=Number(a.STATION)||Number(a.ID);
          const address=a.ADDRESS||[a.ADDRESS_NUMBER,a.LINEAR_NAME_FULL].filter(Boolean).join(' ');
          return baseRecord({service,number:station,name:`Station ${station}`,shortName:`Stn ${station}`,address,lat:p.lat,lng:p.lng,id:`fire-station-${station}`});
        });
      } else if(source.type==='toronto-paramedic') {
        records=features.filter(feature=>{
          if(!source.scarborough)return true;
          const a=feature.attributes||{},p=point(feature);
          const municipality=String(a.MUNICIPALITY||a.MUNICIPALITY_NAME||a.PLACE_NAME||'').toLowerCase();
          return municipality.includes('scarborough')||pointInBounds(p.lat,p.lng,config.map.bounds);
        }).map((feature,index)=>{
          const a=feature.attributes||{},p=point(feature);
          const label=normalizeText(a.NAME||a.FACILITY_NAME||a.PLACE_NAME||`Paramedic Base ${index+1}`);
          const number=firstNumber(label)||index+1;
          const address=a.ADDRESS_FULL||a.ADDRESS||[a.ADDRESS_NUMBER,a.LINEAR_NAME_FULL].filter(Boolean).join(' ');
          return baseRecord({service,number,name:label,shortName:firstNumber(label)?`Base ${firstNumber(label)}`:`EMS ${index+1}`,address,lat:p.lat,lng:p.lng,id:`ems-${slug(label||address)}-${number}`});
        });
      } else if(source.type==='york') {
        const wanted=source.fallback||[];
        records=features.filter(feature=>{
          const a=feature.attributes||{};
          const address=a.ADDRESS||a.ADDRESS_FULL||'';
          const name=String(a.NAME||a.LABEL||'');
          return wanted.some(item=>sameAddress(address,item.address)||(item.number&&firstNumber(name)===Number(item.number)));
        }).map((feature,index)=>{
          const a=feature.attributes||{},p=point(feature),address=a.ADDRESS||a.ADDRESS_FULL||'';
          const match=wanted.find(item=>sameAddress(address,item.address)||(item.number&&firstNumber(a.NAME||a.LABEL)===Number(item.number)))||wanted[index]||{};
          const number=Number(match.number)||firstNumber(a.NAME||a.LABEL)||index+1;
          const label=match.name||a.NAME||a.LABEL||`${service==='fire'?'Station':'Paramedic Base'} ${number}`;
          return baseRecord({service,number,name:label,shortName:match.shortName||`${service==='fire'?'Stn':'Base'} ${number}`,address:match.address||address,lat:p.lat,lng:p.lng,id:match.id});
        });
        if(records.length!==wanted.length)throw new Error(`Expected ${wanted.length} ${service} bases from York Region, received ${records.length}.`);
      } else if(source.type==='belleville-fire') {
        const wanted=source.fallback||[];
        records=features.filter(feature=>wanted.some(item=>sameAddress(feature.attributes?.ADDRESS,item.address))).map((feature,index)=>{
          const a=feature.attributes||{},p=point(feature),match=wanted.find(item=>sameAddress(a.ADDRESS,item.address))||wanted[index]||{};
          const number=Number(match.number)||firstNumber(a.STATION_NO)||index+1;
          return baseRecord({service,number,name:match.name||`Station ${number}`,shortName:match.shortName||`Stn ${number}`,address:match.address||a.ADDRESS,lat:p.lat,lng:p.lng,id:match.id});
        });
        if(records.length!==wanted.length)throw new Error(`Expected ${wanted.length} Belleville fire stations, received ${records.length}.`);
      } else throw new Error(`Unknown city facility source: ${source.type}`);

      return finalizeRecords(records,config,service);
    } catch(error) { return fallback(error); }
  }

  function installPreviewSubsystemShims(cityId) {
    const roadState={status:'ready',enabled:false,originalLoop:true,segments:[],grid:new Map(),stationExit:null};
    const roadApi={
      state:roadState,config:Object.freeze({cityId,available:false,freeDrive:true}),
      isPointDrivable:()=>true,resolveMovement:(aLat,aLng,bLat,bLng)=>({lat:bLat,lng:bLng,blocked:false,snapped:false}),
      snapVehicleToRoad:()=>false,beginStationExit:()=>false,nearestRoad:()=>null,
    };
    roadApi.ready=Promise.resolve(roadApi);
    window.PTBO_ROAD_COLLISION=Object.freeze(roadApi);
    window.PTBO_ROAD_COLLISION_BOOTSTRAP_READY=Promise.resolve(window.PTBO_ROAD_COLLISION);
    const hardState={installed:true,disabled:true};
    const hard={version:VERSION,state:hardState};
    hard.ready=Promise.resolve(hard);
    window.PTBO_HARD_ROAD_BOUNDARY=Object.freeze(hard);
    window.PTBO_ROUTE_REVEAL=Object.freeze({available:false,ready:Promise.resolve(null),state:Object.freeze({status:'disabled'}),hide:()=>{},hideRoute:()=>{},calculateRoute:()=>null});
    window.PTBO_ROUTE_COMPARE_BOOT_VERSION='preview';
    window.PTBO_ROUTE_COMPARE=Object.freeze({available:false,state:{reviewOpen:false},sync:()=>{},reset:()=>{},stop:()=>{}});
    const marker=document.createElement('script');
    marker.type='application/json';marker.dataset.ptboRouteCompareCore='preview';marker.dataset.ptboLoaded='true';document.head.appendChild(marker);
  }

  function create(config) {
    if(!config?.id||!config?.name||!config?.map||!config?.sources)throw new Error('Preview city configuration is incomplete.');
    if(window.PTBO_CITY_PACKAGE?.id===config.id&&window.PTBO_CITY_PACKAGE?.version===VERSION)return window.PTBO_CITY_PACKAGE_READY||Promise.resolve(window.PTBO_CITY_PACKAGE);

    const fireBases=[],emsBases=[];
    const alarmCategories=Object.freeze(['Auto Alarm / Vehicle Fire','Alarms No Apparent Problem']);
    const unavailableHospital=Object.freeze({id:`${config.id}-hospital-unavailable`,main:'Medical',sub:'Hospital Transport',name:'Hospital transport unavailable',addr:'Dispatch calls are not available for this city yet.',lat:config.map.defaultCenter[0],lng:config.map.defaultCenter[1],radius:30,disabled:true});
    const profiles=Object.freeze({fire:Object.freeze({id:'fire',label:'Fire',vehicle:'Fire truck',bases:fireBases}),ems:Object.freeze({id:'ems',label:'EMS',vehicle:'Ambulance',bases:emsBases})});
    const serviceConfig=Object.freeze({profiles,hospital:unavailableHospital,alarmCategories});
    const features=Object.freeze({baseTraining:true,dispatch:false,roadBoundaries:false,routeGuidance:false,hospitalTransport:false});
    const roads=Object.freeze({available:false,center:Object.freeze([...config.map.defaultCenter]),sourceAsset:null});
    const dispatch=Object.freeze({available:false,controlName:`${config.name} Control`,dataVersion:'preview-1',descriptorUrl:new URL('./dispatch-data.js',config.sourceUrl).href});
    const map=Object.freeze({...config.map,defaultCenter:Object.freeze([...config.map.defaultCenter]),bounds:Object.freeze(config.map.bounds.map(pair=>Object.freeze([...pair])))});
    const cityPackage=Object.freeze({schemaVersion:3,version:VERSION,id:config.id,name:config.name,province:'Ontario',country:'Canada',playable:true,status:'base-training',features,map,roads,dispatch,serviceConfig,sources:Object.freeze({...config.sources})});

    window.PTBO_CITY_PACKAGE=cityPackage;window.PTBO_ACTIVE_CITY=cityPackage;window.PTBO_SERVICE_CONFIG=serviceConfig;window.PTBO_STATIONS=fireBases;
    window.getPtboStation=number=>fireBases.find(station=>station.number===Number(number));
    document.documentElement.dataset.city=config.id;document.documentElement.dataset.cityPackageVersion=VERSION;document.documentElement.dataset.dispatchAvailable='false';
    installPreviewSubsystemShims(config.id);

    const ready=(async()=>{
      const [fire,ems]=await Promise.all([loadSource(config.sources.fire,config,'fire'),loadSource(config.sources.ems,config,'ems')]);
      if(!fire.length||!ems.length)throw new Error(`${config.name} needs at least one Fire and one EMS base.`);
      fireBases.splice(0,fireBases.length,...fire);emsBases.splice(0,emsBases.length,...ems);window.PTBO_STATIONS=fireBases;
      document.documentElement.dataset.fireBaseCount=String(fireBases.length);document.documentElement.dataset.emsBaseCount=String(emsBases.length);
      window.dispatchEvent(new CustomEvent('ptbo-city-package-data-ready',{detail:{id:config.id,version:VERSION,fireBases:fireBases.length,emsBases:emsBases.length,dispatch:false}}));
      return cityPackage;
    })();
    window.PTBO_CITY_PACKAGE_READY=ready;
    ready.then(()=>window.dispatchEvent(new CustomEvent('ptbo-city-package-ready',{detail:{id:config.id,version:VERSION}}))).catch(error=>{
      window.PTBO_CITY_PACKAGE_LOAD_ERROR=error;console.error(`${config.name} base data could not load.`,error);window.dispatchEvent(new CustomEvent('ptbo-city-package-error',{detail:{id:config.id,version:VERSION,error}}));
    });
    return ready;
  }

  window.PTBO_PREVIEW_CITY_FACTORY=Object.freeze({version:VERSION,create});
})();
