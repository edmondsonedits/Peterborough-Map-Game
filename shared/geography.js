(function () {
  "use strict";
  const rawStations = [
    { id: "station-1", name: "Station 1", latitude: 44.30089212686223, longitude: -78.32216352224351, address: "210 Sherbrooke St" },
    { id: "station-2", name: "Station 2", latitude: 44.3312, longitude: -78.3060, address: "100 Marina Blvd" },
    { id: "station-3", name: "Station 3", latitude: 44.2935, longitude: -78.3410, address: "839 Clonsilla Ave" }
  ];
  const rawLocations = [
        { main:"Fire", sub:"Water & Ice Rescue", name:"Beavermead Park Beach", addr:"2015 Ashburnham Dr", lat:44.295749, lng:-78.303611, radius:90 },
        { main:"Fire", sub:"Water & Ice Rescue", name:"Peterborough Lift Lock Canal", addr:"353 Hunter St E", lat:44.307885, lng:-78.300558, radius:40 },
        { main:"Fire", sub:"Water & Ice Rescue", name:"Trent University Faryon Bridge", addr:"1600 West Bank Dr", lat:44.358247, lng:-78.289862, radius:30 },
        { main:"Fire", sub:"Water & Ice Rescue", name:"Del Crary Park Marina", addr:"100 George St N", lat:44.296500, lng:-78.317500, radius:50 },
        { main:"Fire", sub:"Water & Ice Rescue", name:"Little Lake Cemetery", addr:"915 Haggart St", lat:44.293982, lng:-78.308551, radius:250 },
        { main:"Fire", sub:"Water & Ice Rescue", name:"Millennium Park Dock ", addr:"130 King St & Silver Bean Cafe", lat:44.301535, lng:-78.317649, radius:30 },
        { main:"Fire", sub:"Structure Fire", name:"Lansdowne Place Mall", addr:"645 Lansdowne St W", lat:44.283077, lng:-78.331511, radius:170 },
        { main:"Fire", sub:"Structure Fire", name:"Quaker Oats South Entrance", addr:"34 Hunter St W", lat:44.306250, lng:-78.315847, radius:50 },
        { main:"Fire", sub:"Structure Fire", name:"Holiday Inn Waterfront", addr:"150 George St N", lat:44.298049, lng:-78.319023, radius:70 },
        { main:"Fire", sub:"Structure Fire", name:"Parkway Park Apartments", addr:"1195 Talbot St", lat:44.288900, lng:-78.341200, radius:50 },
        { main:"Fire", sub:"Structure Fire", name:"Charlotte Towers High-Rise", addr:"245 Charlotte St", lat:44.302541, lng:-78.323781, radius:70 },
        { main:"Fire", sub:"Structure Fire", name:"General Electric Building", addr:"107 Park St N", lat:44.296970, lng:-78.327413, radius:50 },
        { main:"Fire", sub:"Structure Fire", name:"Peterborough Public Library", addr:"345 Aylmer St N", lat:44.303946, lng:-78.323749, radius:40 },
        { main:"Fire", sub:"Structure Fire", name:"Market Plaza Strip Mall", addr:"91 George St N", lat:44.296314, lng:-78.320879, radius:50 },
        { main:"Fire", sub:"Structure Fire", name:"East City Circle K", addr:"33 Hunter St E", lat:44.305777, lng:-78.311376, radius:30 },
        { main:"Fire", sub:"Structure Fire", name:"Trent DNA Building", addr:"2151 East Bank Dr", lat:44.358417, lng:-78.284926, radius:50 },
        { main:"Fire", sub:"Structure Fire", name:"Brock Mission Emergency Shelter", addr:"217 Murray St", lat:44.308004, lng:-78.322700, radius:30 },
        { main:"Fire", sub:"Structure Fire", name:"Residential Triplex conversions", addr:"465 Wellington St & Stormont St", lat:44.314737, lng:-78.336425, radius:50 },
        { main:"Fire", sub:"Motor Vehicle Collision", name:"Intersection", addr:"Lansdowne St W & Monaghan Rd", lat:44.285857, lng:-78.329709, radius:40 },
        { main:"Fire", sub:"Motor Vehicle Collision", name:"Intersection", addr:"Chemong Rd & Towerhill Rd", lat:44.327044, lng:-78.339236, radius:30 },
        { main:"Fire", sub:"Motor Vehicle Collision", name:"Intersection", addr:"The Parkway & Clonsilla Ave", lat:44.291000, lng:-78.349000, radius:50 },
        { main:"Fire", sub:"Motor Vehicle Collision", name:"Intersection", addr:"George St N & Rink St", lat:44.295884, lng:-78.319339, radius:50 },
        { main:"Fire", sub:"Motor Vehicle Collision", name:"Hwy 115 Off-Ramp", addr:"Hwy 115 & Bensfort Rd", lat:44.261000, lng:-78.318500, radius:50 },
        { main:"Fire", sub:"Motor Vehicle Collision", name:"Intersection", addr:"Parkhill Rd E & Television Rd", lat:44.322298, lng:-78.293198, radius:30 },
        { main:"Fire", sub:"Motor Vehicle Collision", name:"Intersection", addr:"Water St & Nassau Mills Rd", lat:44.353034, lng:-78.298096, radius:20 },
        { main:"Fire", sub:"Motor Vehicle Collision", name:"Intersection", addr:"Ashburnham Dr & Maria St", lat:44.300948, lng:-78.302286, radius:50 },
        { main:"Fire", sub:"Motor Vehicle Collision", name:"Intersection", addr:"Sherbrooke St & Medical Dr", lat:44.296348, lng:-78.342690, radius:40 },
        { main:"Fire", sub:"Motor Vehicle Collision", name:"Intersection", addr:"Borden Ave & High St", lat:44.282801, lng:-78.333727, radius:50 },
        { main:"Fire", sub:"Auto Alarm / Vehicle Fire", name:"Costco Wholesale Parking Lot", addr:"485 The Parkway", lat:44.271901, lng:-78.340555, radius:130 },
        { main:"Fire", sub:"Auto Alarm / Vehicle Fire", name:"Peterborough Memorial Centre", addr:"151 Lansdowne St W", lat:44.288392, lng:-78.316276, radius:50 },
        { main:"Fire", sub:"Auto Alarm / Vehicle Fire", name:"Real Canadian Superstore Lot", addr:"769 Borden Ave", lat:44.281357, lng:-78.333035, radius:80 },
        { main:"Fire", sub:"Auto Alarm / Vehicle Fire", name:"King Street Parking Garage", addr:"202 King St", lat:44.302234, lng:-78.321201, radius:70 },
        { main:"Fire", sub:"Auto Alarm / Vehicle Fire", name:"Trent Athletics Centre", addr:"1650 W Bank Dr", lat:44.355366, lng:-78.292587, radius:50 },
        { main:"Fire", sub:"Auto Alarm / Vehicle Fire", name:"Peterborough Curling Club", addr:"2195 Lansdowne St W", lat:44.269335, lng:-78.387966, radius:60 },
        { main:"Fire", sub:"Burning Complaint", name:"Residential Backyard Subdivision", addr:"796 George St N & Barnardo Ave", lat:44.318497, lng:-78.318958, radius:50 },
        { main:"Fire", sub:"Burning Complaint", name:"West End Suburban Property", addr:"1422 Woodglade Blvd", lat:44.298500, lng:-78.364200, radius:50 },
        { main:"Fire", sub:"Burning Complaint", name:"Westclox Apartment Building", addr:"380 Armour Rd", lat:44.307098, lng:-78.304319, radius:70 },
        { main:"Fire", sub:"Burning Complaint", name:"Residential Home", addr:"377 Mcdonnel St & Donegal", lat:44.309136, lng:-78.330258, radius:40 },
        { main:"Fire", sub:"Burning Complaint", name:"Clonsilla Residential Corridor", addr:"1205 Clonsilla Ave", lat:44.292200, lng:-78.345800, radius:50 },
        { main:"Fire", sub:"Alarms No Apparent Problem", name:"Empress Gardens Senior Living", addr:"131 Charlotte St", lat:44.303113, lng:-78.319280, radius:40 },
        { main:"Fire", sub:"Alarms No Apparent Problem", name:"Applewood Retirement Residence", addr:"1500 Lansdowne St W", lat:44.278576, lng:-78.362464, radius:70 },
        { main:"Fire", sub:"Alarms No Apparent Problem", name:"Brock Towers High-Rise Housing", addr:"221 Brock St", lat:44.307209, lng:-78.322429, radius:30 },
        { main:"Fire", sub:"Alarms No Apparent Problem", name:"Fairhaven Home", addr:"881 Dutton Rd", lat:44.327447, lng:-78.318443, radius:50 },
        { main:"Fire", sub:"Alarms No Apparent Problem", name:"St Paul School", addr:"1101 Hilliard St", lat:44.332846, lng:-78.325519, radius:60 },
        { main:"Fire", sub:"Alarms No Apparent Problem", name:"Peterborough Police Station", addr:"500 Water St", lat:44.309353, lng:-78.318846, radius:40 },
        { main:"Fire", sub:"Alarms No Apparent Problem", name:"Hillmar Apartments", addr:"184 Marina Blvd", lat:44.333242, lng:-78.323464, radius:80 },
        { main:"Fire", sub:"Alarms No Apparent Problem", name:"Monaghan Multi-Unit Complex", addr:"610 Monaghan Rd & Ardon Ave", lat:44.278292, lng:-78.325900, radius:50 },
        { main:"Fire", sub:"Alarms No Apparent Problem", name:"Commercial Office Infrastructure", addr:"360 George St N", lat:44.293599, lng:-78.318980, radius:50 },
        { main:"Fire", sub:"Alarms No Apparent Problem", name:"Towerhill Townhouse Complex", addr:"1000 Towerhill Rd & Hilliard St", lat:44.334462, lng:-78.329617, radius:50 },
        { main:"Medical", sub:"Chest Pain / Cardiac Emergency", name:"YMCA Community Gym Facility", addr:"123 Aylmer St S", lat:44.289709, lng:-78.322166, radius:50 },
        { main:"Medical", sub:"Chest Pain / Cardiac Emergency", name:"Peterborough Sport & Wellness Centre", addr:"775 Brealey Dr", lat:44.290500, lng:-78.366500, radius:50 },
        { main:"Medical", sub:"Chest Pain / Cardiac Emergency", name:"Peterborough Golf & Country Club", addr:"1030 Water St", lat:44.332162, lng:-78.307165, radius:40 },
        { main:"Medical", sub:"Chest Pain / Cardiac Emergency", name:"Gas Station", addr:"971 Lansdowne St W & The Parkway", lat:44.281927, lng:-78.343171, radius:50 },
        { main:"Medical", sub:"Chest Pain / Cardiac Emergency", name:"Galaxy Cinemas Theater Complex", addr:"320 Water St", lat:44.303958, lng:-78.318304, radius:60 },
        { main:"Medical", sub:"Chest Pain / Cardiac Emergency", name:"Kawartha Heights Residential Bungalow", addr:"1400 Kawartha Heights Blvd", lat:44.285800, lng:-78.368500, radius:50 },
        { main:"Medical", sub:"Chest Pain / Cardiac Emergency", name:"Scotiabank Downtown Branch", addr:"374 George St N", lat:44.305033, lng:-78.319892, radius:50 },
        { main:"Medical", sub:"Difficulty Breathing", name:"St. Joseph's at Fleming Long-Term Care", addr:"359 Brealey Dr", lat:44.296800, lng:-78.367000, radius:50 },
        { main:"Medical", sub:"Difficulty Breathing", name:"Riverview Manor Nursing Home", addr:"1155 Water St", lat:44.336108, lng:-78.315085, radius:50 },
        { main:"Medical", sub:"Difficulty Breathing", name:"The Peterborough Clinic Medical Hub", addr:"26 Hospital Dr", lat:44.301159, lng:-78.345550, radius:40 },
        { main:"Medical", sub:"Difficulty Breathing", name:"Trinity United Church", addr:"360 Reid St", lat:44.304158, lng:-78.327278, radius:50 },
        { main:"Medical", sub:"Difficulty Breathing", name:"Peterborough Housing", addr:"521 Mcdonnel St", lat:44.308215, lng:-78.336774, radius:50 },
        { main:"Medical", sub:"Difficulty Breathing", name:"Residence Home", addr:"1757 Ravenwood Dr & Parkhill Rd W", lat:44.305023, lng:-78.365328, radius:50 },
        { main:"Medical", sub:"Unconscious Patient / Substance Overdose", name:"Peterborough Downtown Transit Terminal", addr:"190 Simcoe St", lat:44.304818, lng:-78.321887, radius:50 },
        { main:"Medical", sub:"Unconscious Patient / Substance Overdose", name:"Quality Inn", addr:"1074 Lansdowne St W", lat:44.282332, lng:-78.346767, radius:80 },
        { main:"Medical", sub:"Unconscious Patient / Substance Overdose", name:"Victoria Park & No Frills", addr:"212 Water St", lat:44.300435, lng:-78.318368, radius:50 },
        { main:"Medical", sub:"Unconscious Patient / Substance Overdose", name:"George Street Alleyway", addr:"383 George St N & Hunter St W", lat:44.305585, lng:-78.320160, radius:50 },
        { main:"Medical", sub:"Unconscious Patient / Substance Overdose", name:"Hunter Street Cafe Restroom", addr:"130 Hunter St W", lat:44.306027, lng:-78.319173, radius:50 },
        { main:"Medical", sub:"Unconscious Patient / Substance Overdose", name:"Bethune Housing Unit", addr:"597 Bethune St & Dublin St", lat:44.311765, lng:-78.325114, radius:30 },
        { main:"Medical", sub:"Unconscious Patient / Substance Overdose", name:"Industrial Rail Corridor Interface", addr:"640 Rink St", lat:44.295626, lng:-78.324548, radius:50 },
        { main:"Medical", sub:"Unconscious Patient / Substance Overdose", name:"Del Crary Park Public Pavilion", addr:"2 Romaine St", lat:44.295354, lng:-78.318669, radius:50 },
        { main:"Medical", sub:"Rectal Bleed / Gastrointestinal Emergency", name:"Boston Pizza Dining Facility", addr:"1164 Chemong Rd", lat:44.330101, lng:-78.340137, radius:30 },
        { main:"Medical", sub:"Rectal Bleed / Gastrointestinal Emergency", name:"Tim Hortons ", addr:"1140 Lansdowne St W", lat:44.281142, lng:-78.350308, radius:40 },
        { main:"Medical", sub:"Rectal Bleed / Gastrointestinal Emergency", name:"High Street Residential Bungalow", addr:"1235 High St", lat:44.288131, lng:-78.335052, radius:50 },
        { main:"Medical", sub:"Rectal Bleed / Gastrointestinal Emergency", name:"Shoppers Drug Mart", addr:"250 Charlotte St", lat:44.303441, lng:-78.323843, radius:40 },
        { main:"Medical", sub:"Rectal Bleed / Gastrointestinal Emergency", name:"McThirsty's Pint", addr:"172 Charlotte St", lat:44.303526, lng:-78.320538, radius:40 },
        { main:"Medical", sub:"Rectal Bleed / Gastrointestinal Emergency", name:"TASS", addr:"1009 Armour Rd", lat:44.330785, lng:-78.309925, radius:100 },
        { main:"Medical", sub:"Lift Assist / Public Service", name:"Westmount Public School", addr:"1520 Sherwood Crescent", lat:44.304664, lng:-78.352523, radius:90 },
        { main:"Medical", sub:"Lift Assist / Public Service", name:"Cherryhill Suburban Residence", addr:"1847 Cherryhill Rd & Dainard Dr", lat:44.277886, lng:-78.375553, radius:50 },
        { main:"Medical", sub:"Lift Assist / Public Service", name:"Cumberland Avenue Residential Home", addr:"Cumberland Ave & Franklin Drive", lat:44.341070, lng:-78.327284, radius:50 },
        { main:"Medical", sub:"Lift Assist / Public Service", name:"Chandler Suburban Home", addr:"Chandler Crescent & Emery Way", lat:44.306919, lng:-78.375639, radius:30 },
        { main:"Medical", sub:"Lift Assist / Public Service", name:"Otonabee Valley Public School", addr:"580 River Rd S", lat:44.282322, lng:-78.308637, radius:100 },
        { main:"Medical", sub:"Lift Assist / Public Service", name:"Ravenwood Development Detached Home", addr:"1540 Ravenwood Dr", lat:44.291500, lng:-78.371800, radius:50 },
        { main:"Medical", sub:"Lift Assist / Public Service", name:"Weller Street Residential Area", addr:"910 Weller St & Sherwood Crescent", lat:44.300955, lng:-78.351445, radius:50 },
        { main:"Medical", sub:"Request for Access / Wellness Check", name:"George Street Housing", addr:"548 George St N & London St", lat:44.310604, lng:-78.320224, radius:40 },
        { main:"Medical", sub:"Request for Access / Wellness Check", name:"Residential Home", addr:"449 Stewart St & Brock St", lat:44.307117, lng:-78.325894, radius:40 },
        { main:"Medical", sub:"Request for Access / Wellness Check", name:"Glenforest Boulevard Split-Level Home", addr:"1385 Glenforest Blvd", lat:44.293200, lng:-78.361500, radius:50 },
        { main:"Medical", sub:"Request for Access / Wellness Check", name:"Talbot Street Multi-Unit Residence", addr:"1180 Talbot St", lat:44.288200, lng:-78.341500, radius:50 },
        { main:"Medical", sub:"Request for Access / Wellness Check", name:"Brooklawn Apartment", addr:"486 Donegal St", lat:44.308233, lng:-78.330100, radius:30 },
        { main:"Medical", sub:"Request for Access / Wellness Check", name:"Hedonics Appartments", addr:"315 Hedonics Rd", lat:44.308964, lng:-78.343490, radius:110 },
        { main:"Medical", sub:"Request for Access / Wellness Check", name:"Adam Scott Highschool", addr:"175 Langton St", lat:44.327501, lng:-78.321061, radius:100 },
        { main:"Medical", sub:"Request for Access / Wellness Check", name:"FreshCo", addr:"181 Brock St", lat:44.306795, lng:-78.321399, radius:50 },
        { main:"Medical", sub:"Request for Access / Wellness Check", name:"Reid Street Residential Unit", addr:"650 Reid St & Parkhill Road W", lat:44.313376, lng:-78.328440, radius:50 },
        { main:"Medical", sub:"Request for Access / Wellness Check", name:"Bonaccord Appartment", addr:"555 Bonaccord St", lat:44.309317, lng:-78.337439, radius:50 }
      ];
  const cityTenNames = new Set(["Lansdowne Place Mall", "Costco Wholesale Parking Lot", "Peterborough Memorial Centre", "Peterborough Public Library", "Peterborough Police Station", "The Peterborough Clinic Medical Hub", "Peterborough Downtown Transit Terminal", "Galaxy Cinemas Theater Complex", "Real Canadian Superstore Lot", "FreshCo"]);
  function slug(value) { return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""); }
  function distanceSquared(latitudeA, longitudeA, latitudeB, longitudeB) { return (latitudeA - latitudeB) ** 2 + (longitudeA - longitudeB) ** 2; }
  function stationDistrictFor(location) { return rawStations.reduce((bestIndex, station, index) => distanceSquared(location.lat, location.lng, station.latitude, station.longitude) < distanceSquared(location.lat, location.lng, rawStations[bestIndex].latitude, rawStations[bestIndex].longitude) ? index : bestIndex, 0) + 1; }
  const locations = rawLocations.map((location, index) => Object.freeze({
    id: `location-${String(index + 1).padStart(3, "0")}-${slug(location.name)}`,
    mainCategory: location.main,
    subCategory: location.sub,
    name: location.name.trim(),
    address: location.addr.trim(),
    latitude: location.lat,
    longitude: location.lng,
    targetRadiusMeters: location.radius,
    stationDistrict: Number(location.district) || stationDistrictFor(location),
    cityTen: cityTenNames.has(location.name.trim()),
    main: location.main,
    sub: location.sub,
    addr: location.addr.trim(),
    lat: location.lat,
    lng: location.lng,
    radius: location.radius,
    district: Number(location.district) || stationDistrictFor(location)
  }));
  const stations = rawStations.map((station) => Object.freeze({ ...station, lat: station.latitude, lng: station.longitude }));
  function validateGeography() {
    const ids = new Set();
    const cityTen = locations.filter((location) => location.cityTen);
    for (const location of locations) {
      if (ids.has(location.id)) throw new Error(`Duplicate location ID: ${location.id}`);
      ids.add(location.id);
      if (!["Fire", "Medical"].includes(location.mainCategory) || !location.subCategory || !location.name || !location.address) throw new Error(`Missing required location data: ${location.id}`);
      if (!Number.isFinite(location.latitude) || Math.abs(location.latitude) > 90 || !Number.isFinite(location.longitude) || Math.abs(location.longitude) > 180) throw new Error(`Invalid coordinates: ${location.id}`);
      if (!Number.isFinite(location.targetRadiusMeters) || location.targetRadiusMeters <= 0) throw new Error(`Invalid target radius: ${location.id}`);
      if (![1, 2, 3].includes(location.stationDistrict)) throw new Error(`Invalid station district: ${location.id}`);
    }
    if (cityTen.length !== 10 || new Set(cityTen.map((location) => location.id)).size !== 10) throw new Error("City Ten must contain exactly ten unique locations.");
  }
  validateGeography();
  const host = typeof window === "undefined" ? globalThis : window;
  host.PeterboroughGeography = Object.freeze({ stations: Object.freeze(stations), locations: Object.freeze(locations), validateGeography });
}());
