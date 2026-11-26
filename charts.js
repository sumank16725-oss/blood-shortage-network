/* BloodBridge Interactive Canvas Charts & Regional SVG Network Map
 * Zero external library dependencies — works offline, over file://, and at HiDPI.
 */

window.BloodBridgeCharts = (function () {
  function setupCanvas(canvas, heightPx = 280) {
    const parent = canvas.parentElement;
    const width = Math.max(300, (parent ? parent.clientWidth : 640) - 4);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = heightPx * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${heightPx}px`;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, width, height: heightPx };
  }

  function drawGridAndAxes(ctx, pad, plotW, plotH, maxVal, steps = 4, unitLabel = "u") {
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1;
    ctx.fillStyle = "#64748b";
    ctx.font = "11px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";

    for (let i = 0; i <= steps; i++) {
      const val = Math.round((maxVal * (steps - i)) / steps);
      const y = pad.top + (plotH * i) / steps;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + plotW, y);
      ctx.stroke();
      ctx.fillText(`${val}${unitLabel}`, pad.left - 8, y);
    }
  }

  /**
   * 1. Blood Group Supply vs Safety Target Bar Chart
   */
  function renderGroupBarChart(canvas, groupTotals, groupTargets, tooltipEl) {
    if (!canvas) return;
    const { ctx, width, height } = setupCanvas(canvas, 270);
    const groups = Object.keys(groupTotals);
    const pad = { top: 24, right: 18, bottom: 38, left: 46 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;

    const maxVal = Math.max(
      100,
      ...groups.map((g) => Math.max(groupTotals[g] || 0, groupTargets[g] || 0))
    ) * 1.12;

    ctx.clearRect(0, 0, width, height);
    drawGridAndAxes(ctx, pad, plotW, plotH, maxVal, 4, "");

    const slotW = plotW / groups.length;
    const barW = Math.min(28, slotW * 0.42);
    const hitBoxes = [];

    groups.forEach((bg, idx) => {
      const cx = pad.left + slotW * idx + slotW / 2;
      const stock = groupTotals[bg] || 0;
      const target = groupTargets[bg] || 100;
      const pct = Math.round((stock / target) * 100);

      const targetH = (target / maxVal) * plotH;
      const stockH = (stock / maxVal) * plotH;
      const targetY = pad.top + plotH - targetH;
      const stockY = pad.top + plotH - stockH;

      // Target ghost bar
      ctx.fillStyle = "#e2e8f0";
      ctx.fillRect(cx - barW * 0.72, targetY, barW * 1.44, targetH);

      // Actual stock bar colored by health
      let color = "#059669";
      if (pct < 65) color = "#dc2626";
      else if (pct < 85) color = "#d97706";

      ctx.fillStyle = color;
      ctx.beginPath();
      const r = 4;
      const bx = cx - barW / 2;
      ctx.roundRect ? ctx.roundRect(bx, stockY, barW, stockH, [r, r, 0, 0]) : ctx.rect(bx, stockY, barW, stockH);
      ctx.fill();

      // Label
      ctx.fillStyle = "#0f172a";
      ctx.font = "bold 12px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(bg, cx, pad.top + plotH + 10);

      hitBoxes.push({
        x: cx - slotW / 2,
        w: slotW,
        bg,
        stock,
        target,
        pct,
      });
    });

    // Attach hover tooltip
    if (tooltipEl) {
      canvas.onmousemove = (e) => {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const hit = hitBoxes.find((b) => mx >= b.x && mx <= b.x + b.w);
        if (hit) {
          tooltipEl.style.display = "block";
          tooltipEl.style.left = `${Math.min(width - 170, Math.max(8, mx - 70))}px`;
          tooltipEl.style.top = "8px";
          tooltipEl.innerHTML = `<strong>${hit.bg}</strong>: ${hit.stock} units<br/>Target: ${hit.target}u (${hit.pct}%)`;
        } else {
          tooltipEl.style.display = "none";
        }
      };
      canvas.onmouseleave = () => {
        tooltipEl.style.display = "none";
      };
    }
  }

  /**
   * 2. Predictive Demand & Stock Depletion Chart (30d History + 14d Forecast + Confidence Band)
   */
  function renderForecastChart(canvas, forecastResult, tooltipEl) {
    if (!canvas || !forecastResult) return;
    const { ctx, width, height } = setupCanvas(canvas, 320);
    const pad = { top: 28, right: 24, bottom: 40, left: 48 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;

    const hist = forecastResult.history;
    const fcast = forecastResult.forecast;
    const totalPts = hist.length + fcast.length;

    const allVals = [
      ...hist.map((h) => h.demand),
      ...fcast.map((f) => f.upper),
      ...fcast.map((f) => f.activeDemand),
    ];
    const maxVal = Math.max(4, Math.ceil(Math.max(...allVals) * 1.18));

    ctx.clearRect(0, 0, width, height);

    // Shade forecast region background
    const splitX = pad.left + (plotW * (hist.length - 0.5)) / (totalPts - 1);
    ctx.fillStyle = forecastResult.scenarioApplies
      ? "rgba(220, 38, 38, 0.05)"
      : "rgba(15, 23, 42, 0.035)";
    ctx.fillRect(splitX, pad.top, pad.left + plotW - splitX, plotH);

    drawGridAndAxes(ctx, pad, plotW, plotH, maxVal, 4, "u");

    const xForIdx = (i) => pad.left + (plotW * i) / (totalPts - 1);
    const yForVal = (v) => pad.top + plotH - (Math.max(0, v) / maxVal) * plotH;

    // Vertical divider: Today
    ctx.strokeStyle = "#94a3b8";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(splitX, pad.top);
    ctx.lineTo(splitX, pad.top + plotH);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "#334155";
    ctx.font = "bold 11px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(
      forecastResult.scenarioApplies ? "DEMO SURGE HORIZON →" : "ML TREND FORECAST →",
      splitX + 6,
      pad.top + 10
    );

    // Confidence Band polygon for forecast
    ctx.fillStyle = forecastResult.scenarioApplies
      ? "rgba(220, 38, 38, 0.16)"
      : "rgba(37, 99, 235, 0.14)";
    ctx.beginPath();
    fcast.forEach((pt, idx) => {
      const x = xForIdx(hist.length + idx);
      const y = yForVal(pt.upper);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    for (let idx = fcast.length - 1; idx >= 0; idx--) {
      const x = xForIdx(hist.length + idx);
      const y = yForVal(fcast[idx].lower);
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();

    // Historical demand line (Dark Navy)
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    hist.forEach((pt, idx) => {
      const x = xForIdx(idx);
      const y = yForVal(pt.demand);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Baseline statistical model forecast dashed if demo scenario overrides
    if (forecastResult.scenarioApplies) {
      ctx.strokeStyle = "#2563eb";
      ctx.lineWidth = 1.8;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(xForIdx(hist.length - 1), yForVal(hist[hist.length - 1].demand));
      fcast.forEach((pt, idx) => {
        ctx.lineTo(xForIdx(hist.length + idx), yForVal(pt.modelDemand));
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Active forecast line (Red for Demo Surge, Blue for Baseline Model)
    ctx.strokeStyle = forecastResult.scenarioApplies ? "#dc2626" : "#2563eb";
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(xForIdx(hist.length - 1), yForVal(hist[hist.length - 1].demand));
    fcast.forEach((pt, idx) => {
      ctx.lineTo(xForIdx(hist.length + idx), yForVal(pt.activeDemand));
    });
    ctx.stroke();

    // X-axis date ticks
    ctx.fillStyle = "#64748b";
    ctx.font = "11px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    [0, 14, hist.length - 1, hist.length + 6, totalPts - 1].forEach((i) => {
      if (i < 0 || i >= totalPts) return;
      const label = i < hist.length ? hist[i].date.slice(5) : fcast[i - hist.length].date.slice(5);
      ctx.fillText(label, xForIdx(i), pad.top + plotH + 10);
    });

    // Interactive hover points
    const combinedPoints = [
      ...hist.map((h, i) => ({
        x: xForIdx(i),
        y: yForVal(h.demand),
        label: `Historical (${h.date})`,
        detail: `Observed demand: <strong>${h.demand} units</strong>`,
      })),
      ...fcast.map((f, i) => ({
        x: xForIdx(hist.length + i),
        y: yForVal(f.activeDemand),
        label: `${forecastResult.scenarioApplies ? "Demo Forecast" : "Model Forecast"} (${f.date})`,
        detail: `Predicted: <strong>${f.activeDemand}u</strong> (Range: ${f.lower}–${f.upper}u)<br/>Est. EOD Stock: <strong>${f.projectedStockActive}u</strong>`,
      })),
    ];

    if (tooltipEl) {
      canvas.onmousemove = (e) => {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        let nearest = null;
        let bestDist = 9999;
        combinedPoints.forEach((p) => {
          const d = Math.abs(p.x - mx);
          if (d < bestDist) {
            bestDist = d;
            nearest = p;
          }
        });
        if (nearest && bestDist < 22) {
          tooltipEl.style.display = "block";
          tooltipEl.style.left = `${Math.min(width - 210, Math.max(8, nearest.x - 95))}px`;
          tooltipEl.style.top = "8px";
          tooltipEl.innerHTML = `<div style="font-weight:700;margin-bottom:2px;">${nearest.label}</div>${nearest.detail}`;
        } else {
          tooltipEl.style.display = "none";
        }
      };
      canvas.onmouseleave = () => {
        tooltipEl.style.display = "none";
      };
    }
  }

  /**
   * 3. Regional Supply vs 7-Day Projected Demand Chart
   */
  function renderRegionalChart(canvas, regionalStats, tooltipEl) {
    if (!canvas) return;
    const { ctx, width, height } = setupCanvas(canvas, 270);
    const pad = { top: 26, right: 18, bottom: 42, left: 50 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;

    const maxVal =
      Math.max(
        100,
        ...regionalStats.map((r) => Math.max(r.totalUnits, r.projected7DayDemand))
      ) * 1.15;

    ctx.clearRect(0, 0, width, height);
    drawGridAndAxes(ctx, pad, plotW, plotH, maxVal, 4, "");

    const slotW = plotW / regionalStats.length;
    const barW = Math.min(30, slotW * 0.28);
    const hitBoxes = [];

    regionalStats.forEach((reg, idx) => {
      const cx = pad.left + slotW * idx + slotW / 2;
      const supplyH = (reg.totalUnits / maxVal) * plotH;
      const demandH = (reg.projected7DayDemand / maxVal) * plotH;

      // Current Stock Bar (Navy)
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(cx - barW - 3, pad.top + plotH - supplyH, barW, supplyH);

      // 7-Day Demand Bar (Red)
      ctx.fillStyle = "#dc2626";
      ctx.fillRect(cx + 3, pad.top + plotH - demandH, barW, demandH);

      ctx.fillStyle = "#0f172a";
      ctx.font = "bold 11px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(reg.region, cx, pad.top + plotH + 10);

      hitBoxes.push({
        x: cx - slotW / 2,
        w: slotW,
        reg,
      });
    });

    if (tooltipEl) {
      canvas.onmousemove = (e) => {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const hit = hitBoxes.find((b) => mx >= b.x && mx <= b.x + b.w);
        if (hit) {
          tooltipEl.style.display = "block";
          tooltipEl.style.left = `${Math.min(width - 190, Math.max(8, mx - 85))}px`;
          tooltipEl.style.top = "8px";
          tooltipEl.innerHTML = `<strong>${hit.reg.region}</strong><br/>Stock: ${hit.reg.totalUnits}u (${hit.reg.avgDos}d avg)<br/>7d Demand: ${hit.reg.projected7DayDemand}u`;
        } else {
          tooltipEl.style.display = "none";
        }
      };
      canvas.onmouseleave = () => {
        tooltipEl.style.display = "none";
      };
    }
  }

  /**
   * 4. Interactive Regional Network SVG Topology Map
   */
  function renderNetworkMap(containerEl, facilitySummaries, transfers, selectedFacilityId, onSelectFacility) {
    if (!containerEl) return;
    const minLat = 41.54,
      maxLat = 42.08;
    const minLon = -87.9,
      maxLon = -87.52;
    const W = 760,
      H = 440;

    const project = (lat, lon) => {
      const x = 60 + ((lon - minLon) / (maxLon - minLon)) * (W - 120);
      const y = H - 50 - ((lat - minLat) / (maxLat - minLat)) * (H - 100);
      return { x: Math.round(x), y: Math.round(y) };
    };

    const statusFill = {
      CRITICAL: "#dc2626",
      WATCH: "#d97706",
      OPTIMAL: "#059669",
    };

    // Region zone backdrop labels
    const zoneMarkers = [
      { label: "METRO NORTH", x: 180, y: 44 },
      { label: "CENTRAL DOWNTOWN", x: 470, y: 170 },
      { label: "EAST HARBOR", x: 635, y: 275 },
      { label: "SOUTH VALLEY", x: 225, y: 375 },
    ];

    const transferLines = transfers
      .slice(0, 6)
      .map((tr) => {
        const from = facilitySummaries.find((f) => f.id === tr.fromId);
        const to = facilitySummaries.find((f) => f.id === tr.toId);
        if (!from || !to) return "";
        const p1 = project(from.lat, from.lon);
        const p2 = project(to.lat, to.lon);
        return `
          <line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}"
            stroke="#dc2626" stroke-width="2.2" stroke-dasharray="6 4" opacity="0.78" />
        `;
      })
      .join("");

    const nodes = facilitySummaries
      .map((fac) => {
        const { x, y } = project(fac.lat, fac.lon);
        const r = fac.isBank ? 15 : 11;
        const fill = statusFill[fac.status] || "#059669";
        const isSel = fac.id === selectedFacilityId;
        return `
          <g class="map-node" data-fac-id="${fac.id}" style="cursor:pointer;">
            ${
              fac.status === "CRITICAL"
                ? `<circle cx="${x}" cy="${y}" r="${r + 8}" fill="rgba(220,38,38,0.18)" />`
                : ""
            }
            ${
              isSel
                ? `<circle cx="${x}" cy="${y}" r="${r + 5}" fill="none" stroke="#0f172a" stroke-width="2.5" />`
                : ""
            }
            <circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="#ffffff" stroke-width="2.5" />
            <text x="${x}" y="${y + 4}" text-anchor="middle" fill="#ffffff" font-size="10" font-weight="700">
              ${fac.isBank ? "B" : "H"}
            </text>
            <text x="${x}" y="${y + r + 14}" text-anchor="middle" fill="#0f172a" font-size="11" font-weight="600">
              ${fac.shortName} (${fac.totalUnits}u)
            </text>
          </g>
        `;
      })
      .join("");

    containerEl.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" class="network-map-svg" role="img" aria-label="Regional BloodBridge Network Map">
        <defs>
          <pattern id="gridPattern" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e2e8f0" stroke-width="1"/>
          </pattern>
        </defs>
        <rect width="${W}" height="${H}" rx="12" fill="#f8fafc" />
        <rect width="${W}" height="${H}" rx="12" fill="url(#gridPattern)" />
        <!-- Lake Michigan coastline decorative band on East -->
        <path d="M 650 0 C 660 110, 695 210, 740 440 L ${W} 440 L ${W} 0 Z" fill="#dbeafe" opacity="0.55" />
        ${zoneMarkers
          .map(
            (z) =>
              `<text x="${z.x}" y="${z.y}" fill="#94a3b8" font-size="11" font-weight="700" letter-spacing="1.2">${z.label}</text>`
          )
          .join("")}
        ${transferLines}
        ${nodes}
      </svg>
    `;

    containerEl.querySelectorAll(".map-node").forEach((el) => {
      el.addEventListener("click", () => {
        onSelectFacility(el.getAttribute("data-fac-id"));
      });
    });
  }

  return {
    renderGroupBarChart,
    renderForecastChart,
    renderRegionalChart,
    renderNetworkMap,
  };
})();
