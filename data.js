/* BloodBridge Core Domain Data & Realistic 30-Day Sample Telemetry
 * NOTE: All facility metrics and historical series are synthetic sample data
 * created for hackathon demonstration and predictive modeling evaluation.
 */

window.BloodBridgeData = (function () {
  const BLOOD_GROUPS = ["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"];

  // RBC transfusion compatibility: recipient -> ordered compatible donor groups
  const RBC_COMPATIBILITY = {
    "O-": ["O-"],
    "O+": ["O+", "O-"],
    "A-": ["A-", "O-"],
    "A+": ["A+", "A-", "O+", "O-"],
    "B-": ["B-", "O-"],
    "B+": ["B+", "B-", "O+", "O-"],
    "AB-": ["AB-", "A-", "B-", "O-"],
    "AB+": ["AB+", "AB-", "A+", "A-", "B+", "B-", "O+", "O-"],
  };

  const GROUP_DEMAND_WEIGHT = {
    "O-": 0.10,
    "O+": 0.35,
    "A-": 0.06,
    "A+": 0.29,
    "B-": 0.03,
    "B+": 0.11,
    "AB-": 0.02,
    "AB+": 0.04,
  };

  const GROUP_TARGET_UNITS = {
    "O-": 240,
    "O+": 480,
    "A-": 150,
    "A+": 380,
    "B-": 95,
    "B+": 200,
    "AB-": 75,
    "AB+": 120,
  };

  // Clearly separated Demo Crisis Presets vs Statistical Trend Model
  const DEMO_SCENARIOS = {
    none: {
      key: "none",
      label: "None (Statistical Trend Model Only)",
      modeBadge: "MODEL FORECAST",
      demandMultiplier: 1.0,
      donorInflowDrop: 0.0,
      targetGroups: [],
      targetRegions: [],
      description:
        "Uses OLS linear trend + Day-of-Week seasonality fitted directly on the 30-day sample history.",
    },
    trauma_surge: {
      key: "trauma_surge",
      label: "Demo: Highway Mass-Trauma Surge (+65% O-/O+)",
      modeBadge: "DEMO SIMULATION",
      demandMultiplier: 1.65,
      donorInflowDrop: 0.0,
      targetGroups: ["O-", "O+"],
      targetRegions: ["Central Downtown", "Metro North"],
      description:
        "Simulated multi-vehicle trauma surge spiking universal O- and O+ demand across Central & North hospitals.",
    },
    holiday_drop: {
      key: "holiday_drop",
      label: "Demo: Holiday Weekend Donor Drop (-35% supply, +25% demand)",
      modeBadge: "DEMO SIMULATION",
      demandMultiplier: 1.25,
      donorInflowDrop: 0.35,
      targetGroups: BLOOD_GROUPS,
      targetRegions: ["Metro North", "Central Downtown", "East Harbor", "South Valley"],
      description:
        "Simulated holiday slowdown reducing blood drive replenishment while emergency demand rises.",
    },
    seasonal_spike: {
      key: "seasonal_spike",
      label: "Demo: Hematology & Surgical Spike (+45% A+/B+)",
      modeBadge: "DEMO SIMULATION",
      demandMultiplier: 1.45,
      donorInflowDrop: 0.10,
      targetGroups: ["A+", "B+", "O+"],
      targetRegions: ["East Harbor", "South Valley"],
      description:
        "Simulated regional surgical and oncology transfusion surge across East Harbor and South Valley.",
    },
  };

  const FACILITY_TEMPLATES = [
    {
      id: "FAC-01",
      name: "Northshore Trauma Medical Center",
      shortName: "Northshore Trauma",
      type: "Trauma Center (Level I)",
      region: "Metro North",
      city: "Evanston",
      lat: 42.0451,
      lon: -87.6877,
      baseDailyDemand: 28,
      capacity: 520,
      phone: "(312) 555-0141",
    },
    {
      id: "FAC-02",
      name: "Lakeview Regional Blood Hub",
      shortName: "Lakeview Blood Hub",
      type: "Regional Blood Bank",
      region: "Metro North",
      city: "Skokie",
      lat: 42.0324,
      lon: -87.7416,
      baseDailyDemand: 14,
      capacity: 900,
      phone: "(312) 555-0188",
    },
    {
      id: "FAC-03",
      name: "St. Jude Metro Community Hospital",
      shortName: "St. Jude Metro",
      type: "Community Hospital",
      region: "Metro North",
      city: "Park Ridge",
      lat: 42.0111,
      lon: -87.8406,
      baseDailyDemand: 16,
      capacity: 310,
      phone: "(312) 555-0124",
    },
    {
      id: "FAC-04",
      name: "Central Mercy Level-I Trauma",
      shortName: "Central Mercy",
      type: "Trauma Center (Level I)",
      region: "Central Downtown",
      city: "Chicago Loop",
      lat: 41.8858,
      lon: -87.6229,
      baseDailyDemand: 36,
      capacity: 650,
      phone: "(312) 555-0101",
    },
    {
      id: "FAC-05",
      name: "BloodBridge Central Reserve Bank",
      shortName: "Central Reserve Bank",
      type: "Regional Blood Bank",
      region: "Central Downtown",
      city: "West Loop",
      lat: 41.8825,
      lon: -87.6550,
      baseDailyDemand: 16,
      capacity: 1200,
      phone: "(312) 555-0199",
    },
    {
      id: "FAC-06",
      name: "Hope Children's & Specialty Institute",
      shortName: "Hope Specialty",
      type: "Pediatric & Specialty",
      region: "Central Downtown",
      city: "Lincoln Park",
      lat: 41.9214,
      lon: -87.6513,
      baseDailyDemand: 18,
      capacity: 380,
      phone: "(312) 555-0156",
    },
    {
      id: "FAC-07",
      name: "East Harbor Memorial Hospital",
      shortName: "East Harbor Memorial",
      type: "Trauma Center (Level I)",
      region: "East Harbor",
      city: "Hyde Park",
      lat: 41.7943,
      lon: -87.5907,
      baseDailyDemand: 25,
      capacity: 480,
      phone: "(312) 555-0172",
    },
    {
      id: "FAC-08",
      name: "Harborfront Blood & Apheresis Bank",
      shortName: "Harborfront Bank",
      type: "Regional Blood Bank",
      region: "East Harbor",
      city: "South Shore",
      lat: 41.7606,
      lon: -87.5742,
      baseDailyDemand: 11,
      capacity: 750,
      phone: "(312) 555-0163",
    },
    {
      id: "FAC-09",
      name: "Calumet General Hospital",
      shortName: "Calumet General",
      type: "Community Hospital",
      region: "East Harbor",
      city: "Calumet",
      lat: 41.6895,
      lon: -87.5673,
      baseDailyDemand: 13,
      capacity: 290,
      phone: "(312) 555-0117",
    },
    {
      id: "FAC-10",
      name: "South Valley Regional Medical",
      shortName: "South Valley Medical",
      type: "Trauma Center (Level I)",
      region: "South Valley",
      city: "Oak Lawn",
      lat: 41.7109,
      lon: -87.7581,
      baseDailyDemand: 23,
      capacity: 460,
      phone: "(312) 555-0133",
    },
    {
      id: "FAC-11",
      name: "Prairie Blood Alliance Depot",
      shortName: "Prairie Alliance",
      type: "Regional Blood Bank",
      region: "South Valley",
      city: "Orland Park",
      lat: 41.6303,
      lon: -87.8539,
      baseDailyDemand: 10,
      capacity: 820,
      phone: "(312) 555-0148",
    },
    {
      id: "FAC-12",
      name: "Westfield Community Care",
      shortName: "Westfield Care",
      type: "Community Hospital",
      region: "South Valley",
      city: "Tinley Park",
      lat: 41.5731,
      lon: -87.7845,
      baseDailyDemand: 12,
      capacity: 270,
      phone: "(312) 555-0180",
    },
  ];

  // Seeded initial stock Days-of-Supply multipliers so shortages, surpluses, and FEFO opportunities appear immediately
  const DOS_OVERRIDES = {
    "FAC-04|O-": 1.1,
    "FAC-04|B-": 1.3,
    "FAC-01|O-": 1.4,
    "FAC-01|AB-": 1.3,
    "FAC-07|O+": 1.6,
    "FAC-07|A-": 1.4,
    "FAC-10|O-": 1.7,
    "FAC-10|B+": 1.9,
    "FAC-06|AB-": 1.5,
    "FAC-09|O-": 1.8,
    "FAC-12|B-": 1.6,
    // Blood bank surpluses
    "FAC-05|O-": 14.0,
    "FAC-05|O+": 12.5,
    "FAC-05|A+": 13.0,
    "FAC-05|B-": 11.5,
    "FAC-05|AB-": 12.0,
    "FAC-02|O-": 11.8,
    "FAC-02|A-": 12.4,
    "FAC-02|AB-": 11.0,
    "FAC-08|O+": 13.0,
    "FAC-08|A+": 11.5,
    "FAC-11|O-": 11.5,
    "FAC-11|B+": 13.5,
    "FAC-11|B-": 11.5,
  };

  // Deterministic pseudo-random generator for reproducible sample data
  function createRng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (1664525 * s + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function addDaysIso(baseDate, daysOffset) {
    const d = new Date(baseDate.getTime());
    d.setDate(d.getDate() + daysOffset);
    return d.toISOString().slice(0, 10);
  }

  function createInitialState() {
    const rng = createRng(20261126);
    const today = new Date();
    today.setHours(12, 0, 0, 0);

    const facilities = FACILITY_TEMPLATES.map((tpl) => {
      const history = {};
      const recentAvgDemand = {};
      const isTrauma = tpl.type.includes("Trauma");
      const isBank = tpl.type.includes("Bank");

      BLOOD_GROUPS.forEach((bg) => {
        const traumaBoost = isTrauma && (bg === "O-" || bg === "O+") ? 1.35 : 1.0;
        const mean = Math.max(0.7, tpl.baseDailyDemand * GROUP_DEMAND_WEIGHT[bg] * traumaBoost);
        const slope = (rng() - 0.3) * 0.012; // slight upward bias on average
        const series = [];

        for (let i = 29; i >= 0; i--) {
          const dayDate = new Date(today.getTime());
          dayDate.setDate(dayDate.getDate() - i);
          const dow = dayDate.getDay(); // 0=Sun..6=Sat

          let dowFactor = 1.0;
          if ((bg === "O-" || bg === "O+") && (dow === 5 || dow === 6)) dowFactor = 1.26;
          else if ((bg === "A+" || bg === "B+") && dow >= 2 && dow <= 4) dowFactor = 1.14;
          else if (dow === 0) dowFactor = 0.86;

          const idx = 29 - i;
          const trendFactor = 1 + slope * idx;
          const noise = 0.8 + rng() * 0.42;
          const spike = rng() < 0.05 ? 1.45 : 1.0;
          const val = Math.max(0, Math.round(mean * dowFactor * trendFactor * noise * spike));

          series.push({
            date: addDaysIso(today, -i),
            dow,
            demand: val,
          });
        }

        history[bg] = series;
        const last7 = series.slice(-7).reduce((s, r) => s + r.demand, 0) / 7;
        recentAvgDemand[bg] = Math.max(0.7, Number(last7.toFixed(2)));
      });

      return {
        ...tpl,
        isBank,
        history,
        recentAvgDemand,
      };
    });

    const batches = [];
    let batchNum = 1001;

    facilities.forEach((fac) => {
      BLOOD_GROUPS.forEach((bg) => {
        const avgD = fac.recentAvgDemand[bg];
        const key = `${fac.id}|${bg}`;
        const dosTarget =
          DOS_OVERRIDES[key] !== undefined
            ? DOS_OVERRIDES[key]
            : fac.isBank
            ? 6.8 + rng() * 4.5
            : 4.5 + rng() * 3.4;

        const totalUnits = Math.max(2, Math.round(avgD * dosTarget));
        const numBatches = totalUnits >= 14 ? 3 : totalUnits >= 6 ? 2 : 1;

        let remaining = totalUnits;
        for (let b = 0; b < numBatches; b++) {
          const units =
            b === numBatches - 1
              ? Math.max(1, remaining)
              : Math.max(1, Math.round((totalUnits / numBatches) * (0.75 + rng() * 0.5)));
          remaining = Math.max(1, remaining - units);

          let daysRemaining;
          if (fac.isBank && b === 0 && rng() < 0.62) {
            daysRemaining = 2 + Math.floor(rng() * 4); // 2-5 days left at blood banks (ideal for FEFO rescue!)
          } else if (b === 0 && rng() < 0.34) {
            daysRemaining = 1 + Math.floor(rng() * 6); // 1-6 days left
          } else {
            daysRemaining = 8 + Math.floor(rng() * 27); // 8-34 days left
          }

          let tempC = Number((3.1 + rng() * 1.9).toFixed(1));
          // Seed one cold-chain excursion batch for demonstration
          if (fac.id === "FAC-09" && bg === "A+" && b === 0) {
            tempC = 6.4;
          }

          batches.push({
            batchId: `BB-${batchNum++}`,
            facilityId: fac.id,
            bloodGroup: bg,
            units,
            daysRemaining,
            expiryDate: addDaysIso(today, daysRemaining),
            collectedDate: addDaysIso(today, daysRemaining - 42),
            storageTempC: tempC,
          });
        }
      });
    });

    const initialTransfers = [
      {
        id: "TR-904",
        timestamp: "Today, 11:15",
        fromId: "FAC-05",
        fromName: "BloodBridge Central Reserve Bank",
        toId: "FAC-04",
        toName: "Central Mercy Level-I Trauma",
        requestedGroup: "O-",
        suppliedGroup: "O-",
        units: 8,
        distanceKm: 2.7,
        etaMins: 13,
        type: "Shortage Relief",
        status: "Delivered",
      },
      {
        id: "TR-903",
        timestamp: "Today, 09:40",
        fromId: "FAC-02",
        fromName: "Lakeview Regional Blood Hub",
        toId: "FAC-01",
        toName: "Northshore Trauma Medical Center",
        requestedGroup: "A+",
        suppliedGroup: "A+",
        units: 10,
        distanceKm: 4.7,
        etaMins: 16,
        type: "FEFO Expiry Rescue",
        status: "Delivered",
      },
    ];

    return {
      simHourOffset: 0,
      nextBatchNum: batchNum,
      nextTransferNum: 905,
      facilities,
      batches,
      transfers: initialTransfers,
      acknowledgedAlerts: [],
      dismissedRecs: [],
      donorDrivesTriggered: [],
      activeScenario: "none",
      autoLive: false,
    };
  }

  return {
    BLOOD_GROUPS,
    RBC_COMPATIBILITY,
    GROUP_TARGET_UNITS,
    DEMO_SCENARIOS,
    createInitialState,
  };
})();
