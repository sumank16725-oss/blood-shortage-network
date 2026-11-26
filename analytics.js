/* BloodBridge Analytics, Predictive Modeling, Matching & Allocation Engine */

window.BloodBridgeAnalytics = (function () {
  const { BLOOD_GROUPS, RBC_COMPATIBILITY, DEMO_SCENARIOS } = window.BloodBridgeData;

  function haversineKm(lat1, lon1, lat2, lon2) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function estimateEtaMinutes(distanceKm) {
    // 8 min cold-chain dispatch prep + ~1.7 min per urban km
    return Math.max(10, Math.round(8 + distanceKm * 1.7));
  }

  function getGroupTotals(batches) {
    const totals = {};
    BLOOD_GROUPS.forEach((bg) => (totals[bg] = 0));
    batches.forEach((b) => {
      if (b.units > 0) totals[b.bloodGroup] = (totals[b.bloodGroup] || 0) + b.units;
    });
    return totals;
  }

  function summarizeFacilities(state) {
    const byFac = {};
    state.facilities.forEach((fac) => {
      const stock = {};
      const expiringSoonByGroup = {};
      BLOOD_GROUPS.forEach((bg) => {
        stock[bg] = 0;
        expiringSoonByGroup[bg] = 0;
      });
      byFac[fac.id] = {
        ...fac,
        stock,
        expiringSoonByGroup,
        totalUnits: 0,
        expiringUrgentUnits: 0, // <= 3 days
        expiringSoonUnits: 0,   // <= 7 days
        coldChainAlerts: 0,
        dosByGroup: {},
        minDos: 99,
        criticalGroups: [],
        watchGroups: [],
        status: "OPTIMAL",
      };
    });

    state.batches.forEach((batch) => {
      if (batch.units <= 0) return;
      const summary = byFac[batch.facilityId];
      if (!summary) return;
      summary.stock[batch.bloodGroup] += batch.units;
      summary.totalUnits += batch.units;
      if (batch.daysRemaining <= 3) {
        summary.expiringUrgentUnits += batch.units;
      }
      if (batch.daysRemaining <= 7) {
        summary.expiringSoonUnits += batch.units;
        summary.expiringSoonByGroup[batch.bloodGroup] += batch.units;
      }
      if (batch.storageTempC > 6.0 || batch.storageTempC < 1.0) {
        summary.coldChainAlerts += 1;
      }
    });

    Object.values(byFac).forEach((fac) => {
      let minDos = 99;
      BLOOD_GROUPS.forEach((bg) => {
        const avgD = Math.max(0.5, fac.recentAvgDemand[bg] || 1);
        const dos = Number((fac.stock[bg] / avgD).toFixed(1));
        fac.dosByGroup[bg] = dos;
        if (dos < minDos) minDos = dos;
        if (dos < 2.0) fac.criticalGroups.push(bg);
        else if (dos < 4.0) fac.watchGroups.push(bg);
      });
      fac.minDos = Number(minDos.toFixed(1));
      if (fac.criticalGroups.length > 0) fac.status = "CRITICAL";
      else if (fac.watchGroups.length > 0) fac.status = "WATCH";
      else fac.status = "OPTIMAL";
    });

    return Object.values(byFac);
  }

  /**
   * Predictive Forecasting Engine:
   * - Statistical Model: OLS Linear Trend + Day-of-Week Seasonality Index + 7-day EMA
   * - Demo Scenario Overlay: Applies selected DEMO_SCENARIOS multiplier & donor drop transparently
   */
  function forecastDemand(facility, bloodGroup, currentStock, horizonDays = 14, scenarioKey = "none") {
    const series = facility.history[bloodGroup] || [];
    const n = series.length;
    const scenario = DEMO_SCENARIOS[scenarioKey] || DEMO_SCENARIOS.none;

    // 1. Fit OLS linear trend: y = a + b * x
    let sumX = 0,
      sumY = 0,
      sumXY = 0,
      sumXX = 0;
    series.forEach((pt, idx) => {
      sumX += idx;
      sumY += pt.demand;
      sumXY += idx * pt.demand;
      sumXX += idx * idx;
    });
    const denom = n * sumXX - sumX * sumX || 1;
    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / (n || 1);
    const meanY = sumY / (n || 1);

    // 2. Day-of-Week seasonality factors (0..6)
    const dowBuckets = Array.from({ length: 7 }, () => []);
    series.forEach((pt) => dowBuckets[pt.dow].push(pt.demand));
    const dowFactor = dowBuckets.map((arr) => {
      if (!arr.length || meanY <= 0) return 1.0;
      const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
      return Math.max(0.7, Math.min(1.45, avg / meanY));
    });

    // 3. In-sample backtest MAE & residual std dev for confidence intervals
    let absErrSum = 0;
    let sqErrSum = 0;
    series.forEach((pt, idx) => {
      const pred = Math.max(0.2, (intercept + slope * idx) * dowFactor[pt.dow]);
      const err = pt.demand - pred;
      absErrSum += Math.abs(err);
      sqErrSum += err * err;
    });
    const mae = Number((absErrSum / (n || 1)).toFixed(2));
    const rmse = Math.sqrt(sqErrSum / (n || 1));

    // 4. Generate 14-day future horizon
    const lastDate = n ? new Date(series[n - 1].date + "T12:00:00") : new Date();
    const last7Avg =
      n >= 7 ? series.slice(-7).reduce((s, p) => s + p.demand, 0) / 7 : meanY;

    const scenarioApplies =
      scenario.key !== "none" &&
      (scenario.targetGroups.length === 0 || scenario.targetGroups.includes(bloodGroup)) &&
      (scenario.targetRegions.length === 0 || scenario.targetRegions.includes(facility.region));

    const mult = scenarioApplies ? scenario.demandMultiplier : 1.0;
    // Assume community hospitals/trauma centers receive baseline ~75% normal replenishment unless donor drop hits
    const dailyReplenish =
      (facility.isBank ? meanY * 1.15 : meanY * 0.45) * (1 - scenario.donorInflowDrop);

    const forecast = [];
    let projectedStockModel = currentStock;
    let projectedStockActive = currentStock;
    let modelStockoutDay = null;
    let activeStockoutDay = null;

    for (let h = 1; h <= horizonDays; h++) {
      const d = new Date(lastDate.getTime());
      d.setDate(d.getDate() + h);
      const dow = d.getDay();

      // Blend OLS trend projection with 7-day recent momentum
      const trendBase = Math.max(0.4, intercept + slope * (n - 1 + h));
      const blended = 0.6 * trendBase + 0.4 * last7Avg;
      const modelDemand = Number(Math.max(0.4, blended * dowFactor[dow]).toFixed(2));
      const activeDemand = Number((modelDemand * mult).toFixed(2));

      // Confidence band widens with sqrt(horizon)
      const bandWidth = 1.64 * rmse * Math.sqrt(1 + h * 0.08);
      const lower = Number(Math.max(0, activeDemand - bandWidth).toFixed(2));
      const upper = Number((activeDemand + bandWidth).toFixed(2));

      projectedStockModel = Math.max(0, Number((projectedStockModel - modelDemand + dailyReplenish * 0.65).toFixed(1)));
      projectedStockActive = Math.max(0, Number((projectedStockActive - activeDemand + dailyReplenish * 0.65).toFixed(1)));

      if (modelStockoutDay === null && projectedStockModel <= 2) {
        modelStockoutDay = h;
      }
      if (activeStockoutDay === null && projectedStockActive <= 2) {
        activeStockoutDay = h;
      }

      forecast.push({
        dayOffset: h,
        date: d.toISOString().slice(0, 10),
        modelDemand,
        activeDemand,
        lower,
        upper,
        projectedStockModel,
        projectedStockActive,
      });
    }

    const totalPredictedDemand = Number(
      forecast.reduce((s, r) => s + r.activeDemand, 0).toFixed(1)
    );

    return {
      facilityId: facility.id,
      facilityName: facility.name,
      bloodGroup,
      currentStock,
      history: series,
      forecast,
      mae,
      slopePerDay: Number(slope.toFixed(3)),
      totalPredictedDemand,
      modelStockoutDay,
      activeStockoutDay,
      isDemoScenarioActive: scenario.key !== "none",
      scenarioApplies,
      scenarioLabel: scenario.label,
      modeBadge: scenarioApplies ? "DEMO SIMULATION" : "MODEL FORECAST",
    };
  }

  function computeAlerts(state, facilitySummaries) {
    const alerts = [];

    facilitySummaries.forEach((fac) => {
      BLOOD_GROUPS.forEach((bg) => {
        const units = fac.stock[bg];
        const dos = fac.dosByGroup[bg];
        const fcast = forecastDemand(fac, bg, units, 7, state.activeScenario);
        const stockoutDay = fcast.activeStockoutDay;

        if (dos < 2.0 || (stockoutDay !== null && stockoutDay <= 2)) {
          const id = `SHORT-${fac.id}-${bg}`;
          alerts.push({
            id,
            category: "Shortage Risk",
            severity: "CRITICAL",
            facilityId: fac.id,
            facilityName: fac.name,
            region: fac.region,
            bloodGroup: bg,
            units,
            dos,
            stockoutHours: stockoutDay ? stockoutDay * 24 : Math.max(8, Math.round(dos * 24)),
            acknowledged: state.acknowledgedAlerts.includes(id),
            message: `${units}u of ${bg} left (${dos}d supply). Projected stockout in ~${
              stockoutDay ? `${stockoutDay * 24}h` : `${Math.round(dos * 24)}h`
            }.`,
          });
        } else if (dos < 4.0 || (stockoutDay !== null && stockoutDay <= 4)) {
          const id = `WATCH-${fac.id}-${bg}`;
          alerts.push({
            id,
            category: "Early Warning",
            severity: "WATCH",
            facilityId: fac.id,
            facilityName: fac.name,
            region: fac.region,
            bloodGroup: bg,
            units,
            dos,
            stockoutHours: stockoutDay ? stockoutDay * 24 : Math.round(dos * 24),
            acknowledged: state.acknowledgedAlerts.includes(id),
            message: `${units}u of ${bg} (${dos}d supply) — approaching 4-day safety threshold.`,
          });
        }
      });

      if (fac.expiringUrgentUnits > 0) {
        const id = `EXP-${fac.id}`;
        alerts.push({
          id,
          category: "Expiry Risk",
          severity: "WATCH",
          facilityId: fac.id,
          facilityName: fac.name,
          region: fac.region,
          bloodGroup: "MIXED",
          units: fac.expiringUrgentUnits,
          dos: fac.minDos,
          stockoutHours: 72,
          acknowledged: state.acknowledgedAlerts.includes(id),
          message: `${fac.expiringUrgentUnits} RBC units expire within 3 days. Prioritize FEFO or rescue transfer.`,
        });
      }

      if (fac.coldChainAlerts > 0) {
        const id = `COLD-${fac.id}`;
        alerts.push({
          id,
          category: "Cold-Chain",
          severity: "CRITICAL",
          facilityId: fac.id,
          facilityName: fac.name,
          region: fac.region,
          bloodGroup: "ALL",
          units: fac.coldChainAlerts,
          dos: fac.minDos,
          stockoutHours: 6,
          acknowledged: state.acknowledgedAlerts.includes(id),
          message: `${fac.coldChainAlerts} storage batch exceeded 6.0°C threshold. Inspect refrigeration unit immediately.`,
        });
      }
    });

    const sevRank = { CRITICAL: 0, WATCH: 1 };
    return alerts.sort((a, b) => {
      if (a.acknowledged !== b.acknowledged) return a.acknowledged ? 1 : -1;
      if (sevRank[a.severity] !== sevRank[b.severity]) return sevRank[a.severity] - sevRank[b.severity];
      return a.stockoutHours - b.stockoutHours;
    });
  }

  function findCompatibleMatches(state, facilitySummaries, targetFacilityId, requestedGroup, unitsNeeded, allowSubstitutes) {
    const target = facilitySummaries.find((f) => f.id === targetFacilityId);
    if (!target) return [];

    const compatibleGroups = allowSubstitutes
      ? RBC_COMPATIBILITY[requestedGroup] || [requestedGroup]
      : [requestedGroup];

    const candidates = [];

    facilitySummaries.forEach((donor) => {
      if (donor.id === targetFacilityId) return;
      const distKm = Number(haversineKm(target.lat, target.lon, donor.lat, donor.lon).toFixed(1));
      const etaMins = estimateEtaMinutes(distKm);

      compatibleGroups.forEach((donorGroup, compatIdx) => {
        const stockUnits = donor.stock[donorGroup] || 0;
        const avgDemand = Math.max(0.5, donor.recentAvgDemand[donorGroup] || 1);
        // Donor must keep at least 3 days of safety stock (2.5 for regional banks)
        const safetyFloor = donor.isBank ? Math.ceil(avgDemand * 2.5) : Math.ceil(avgDemand * 3.5);
        const transferable = Math.max(0, stockUnits - safetyFloor);

        if (transferable < 1) return;

        const facBatches = state.batches
          .filter(
            (b) =>
              b.facilityId === donor.id &&
              b.bloodGroup === donorGroup &&
              b.units > 0 &&
              b.storageTempC <= 6.0
          )
          .sort((a, b) => a.daysRemaining - b.daysRemaining);

        const earliestExpiryDays = facBatches.length ? facBatches[0].daysRemaining : 30;
        const isExact = compatIdx === 0;
        const canFulfill = Math.min(unitsNeeded, transferable);

        // Score: exact match + fulfillment ratio + proximity + FEFO bonus
        const score = Math.round(
          (isExact ? 40 : Math.max(12, 30 - compatIdx * 6)) +
            (canFulfill / Math.max(1, unitsNeeded)) * 30 +
            Math.max(0, 20 - distKm * 0.7) +
            (earliestExpiryDays <= 5 ? 10 : 0)
        );

        candidates.push({
          donorId: donor.id,
          donorName: donor.name,
          donorType: donor.type,
          donorRegion: donor.region,
          requestedGroup,
          suppliedGroup: donorGroup,
          matchTier: isExact ? "Exact Match" : `Compatible (${donorGroup} → ${requestedGroup})`,
          isExact,
          totalStock: stockUnits,
          transferableUnits: transferable,
          recommendedUnits: canFulfill,
          distanceKm: distKm,
          etaMins,
          earliestExpiryDays,
          score,
        });
      });
    });

    return candidates.sort((a, b) => b.score - a.score);
  }

  function generateSmartRecommendations(state, facilitySummaries) {
    const recs = [];

    // 1. Critical & Watch Shortage Relief Transfers
    facilitySummaries.forEach((fac) => {
      BLOOD_GROUPS.forEach((bg) => {
        const dos = fac.dosByGroup[bg];
        if (dos < 2.8) {
          const avgD = Math.max(0.8, fac.recentAvgDemand[bg] || 1.2);
          const needed = Math.max(4, Math.ceil(avgD * 4 - fac.stock[bg]));
          const matches = findCompatibleMatches(state, facilitySummaries, fac.id, bg, needed, true);
          if (matches.length > 0) {
            const best = matches[0];
            const id = `REC-SHORT-${best.donorId}-${fac.id}-${bg}`;
            recs.push({
              id,
              type: "Shortage Relief",
              priority: dos < 1.8 ? "URGENT" : "HIGH",
              priorityScore: dos < 1.8 ? 96 : 82,
              fromId: best.donorId,
              fromName: best.donorName,
              toId: fac.id,
              toName: fac.name,
              requestedGroup: bg,
              suppliedGroup: best.suppliedGroup,
              units: best.recommendedUnits,
              distanceKm: best.distanceKm,
              etaMins: best.etaMins,
              impact: `Raises ${fac.shortName} ${bg} from ${dos}d to ~${(
                (fac.stock[bg] + best.recommendedUnits) /
                avgD
              ).toFixed(1)}d supply.`,
              dismissed: state.dismissedRecs.includes(id),
            });
          } else {
            const id = `REC-DRIVE-${fac.region}-${bg}`;
            if (!recs.some((r) => r.id === id)) {
              recs.push({
                id,
                type: "Donor Drive",
                priority: "HIGH",
                priorityScore: 84,
                fromId: null,
                fromName: `${fac.region} Community Drive`,
                toId: fac.id,
                toName: fac.name,
                requestedGroup: bg,
                suppliedGroup: bg,
                units: Math.max(12, needed * 2),
                distanceKm: 0,
                etaMins: 0,
                impact: `No regional surplus available for ${bg}. Launch emergency targeted donor appeal in ${fac.region}.`,
                dismissed: state.dismissedRecs.includes(id),
              });
            }
          }
        }
      });
    });

    // 2. FEFO Expiry Rescue Recommendations (batches <= 5 days at lower-burn facilities -> high-burn hospitals)
    const expiringBatches = state.batches
      .filter((b) => b.units >= 3 && b.daysRemaining <= 5 && b.storageTempC <= 6.0)
      .sort((a, b) => a.daysRemaining - b.daysRemaining);

    expiringBatches.slice(0, 8).forEach((batch) => {
      const donor = facilitySummaries.find((f) => f.id === batch.facilityId);
      if (!donor) return;
      const donorDos = donor.dosByGroup[batch.bloodGroup] || 0;
      if (donorDos < 4.5) return; // Donor needs it locally

      // Find nearest hospital with higher daily burn for that blood group
      const recipients = facilitySummaries
        .filter(
          (r) =>
            r.id !== donor.id &&
            !r.isBank &&
            (r.recentAvgDemand[batch.bloodGroup] || 0) >= 1.2 &&
            (r.dosByGroup[batch.bloodGroup] || 0) < 7.0
        )
        .map((r) => ({
          fac: r,
          dist: Number(haversineKm(donor.lat, donor.lon, r.lat, r.lon).toFixed(1)),
        }))
        .sort((a, b) => a.fac.dosByGroup[batch.bloodGroup] - b.fac.dosByGroup[batch.bloodGroup]);

      if (recipients.length > 0) {
        const target = recipients[0];
        const id = `REC-FEFO-${batch.batchId}-${target.fac.id}`;
        const rescueUnits = Math.min(batch.units, Math.max(3, Math.floor(batch.units * 0.8)));
        recs.push({
          id,
          type: "FEFO Expiry Rescue",
          priority: batch.daysRemaining <= 3 ? "URGENT" : "MEDIUM",
          priorityScore: batch.daysRemaining <= 3 ? 91 : 74,
          fromId: donor.id,
          fromName: donor.name,
          toId: target.fac.id,
          toName: target.fac.name,
          requestedGroup: batch.bloodGroup,
          suppliedGroup: batch.bloodGroup,
          units: rescueUnits,
          batchId: batch.batchId,
          daysRemaining: batch.daysRemaining,
          distanceKm: target.dist,
          etaMins: estimateEtaMinutes(target.dist),
          impact: `Saves ${rescueUnits}u (${batch.batchId}, expires in ${batch.daysRemaining}d) from wastage via FEFO routing.`,
          dismissed: state.dismissedRecs.includes(id),
        });
      }
    });

    return recs
      .filter((r) => !r.dismissed)
      .sort((a, b) => b.priorityScore - a.priorityScore)
      .slice(0, 10);
  }

  function computeRegionalStats(facilitySummaries) {
    const regions = ["Metro North", "Central Downtown", "East Harbor", "South Valley"];
    return regions.map((region) => {
      const facs = facilitySummaries.filter((f) => f.region === region);
      const totalUnits = facs.reduce((s, f) => s + f.totalUnits, 0);
      const dailyBurn = facs.reduce(
        (s, f) => s + BLOOD_GROUPS.reduce((g, bg) => g + (f.recentAvgDemand[bg] || 0), 0),
        0
      );
      const criticalSites = facs.filter((f) => f.status === "CRITICAL").length;
      const expiringUnits = facs.reduce((s, f) => s + f.expiringSoonUnits, 0);
      const groupStock = {};
      BLOOD_GROUPS.forEach((bg) => {
        groupStock[bg] = facs.reduce((s, f) => s + f.stock[bg], 0);
      });

      return {
        region,
        facilityCount: facs.length,
        totalUnits,
        dailyBurn: Number(dailyBurn.toFixed(1)),
        projected7DayDemand: Math.round(dailyBurn * 7),
        avgDos: Number((totalUnits / Math.max(1, dailyBurn)).toFixed(1)),
        criticalSites,
        expiringUnits,
        groupStock,
      };
    });
  }

  return {
    haversineKm,
    estimateEtaMinutes,
    getGroupTotals,
    summarizeFacilities,
    forecastDemand,
    computeAlerts,
    findCompatibleMatches,
    generateSmartRecommendations,
    computeRegionalStats,
  };
})();
