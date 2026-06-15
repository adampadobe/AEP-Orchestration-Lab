/**
 * Default RTDB demo prep stubs for AepDemoConfigRtdb.ensurePrepReady.
 * Loaded by firebase-database.html (Advanced JSON editor); not used on Global values.
 */
(function (global) {
  'use strict';

  function buildLabAjoLookupsStub() {
    if (global.AepDemoConfigRtdb && typeof global.AepDemoConfigRtdb.buildFlatLabStub === 'function') {
      return global.AepDemoConfigRtdb.buildFlatLabStub();
    }
    var dep = new Date(Date.now() + 3 * 3600 * 1000).toISOString();
    return {
      StaffPortal: {
        AgentName: 'Demo agent',
        AgentID: 'AG-001',
        AgentType: 'Customer Care',
        Colour: '#1473e6',
        TextColourCallCentre: '#ffffff',
        TextColourIpad: '#ffffff',
        LocationLabel: 'Manchester',
        CaptainName: 'Captain Lee',
        CoPilotName: 'First Officer Jordan',
      },
      CoreDemoData: {
        name: 'Etihad Airways',
      },
      Mobile: {
        StaffName: 'Demo agent',
        StaffId: 'AG-001',
        StaffRole: 'Gate lead',
        Terminal: 'T3',
        Gate: 'B12',
        paxOnBoard: '184',
        CrewManifest: [
          { role: 'Purser', name: 'S. Ahmed' },
          { role: 'Lead', name: 'J. Smith' },
        ],
      },
      TravelData: {
        flightNumber: 'EY455',
        route: 'AUH → LHR',
        origin: 'AUH',
        destination: 'LHR',
        departure: '14:05 local',
        departureIso: dep,
        flightStatus: 'Boarding',
        gate: 'B12',
      },
      CustomerLoyalty: {
        tier: 'Gold',
        miles: '128400',
        balance: '128400',
      },
    };
  }

  global.AepRtdbLabDemosSeed = {
    buildLabAjoLookupsStub: buildLabAjoLookupsStub,
  };
})(typeof window !== 'undefined' ? window : this);
