const API_BASE_KEY = "sonar_api";
let apiBase = localStorage.getItem(API_BASE_KEY) || "http://localhost:8000";

let detections = [];

const DEMO_SAMPLES = {
    1: {
        id: "SAMPLE-01",
        name: "demo_scans/sonar_scan_1_ghostnet.jpg",
        title: "Ghost Netting & Vehicle Tire",
        sensor: "Side-Scan Sonar (455 kHz)",
        sector: "Coastal Zone B-3 (Offshore)",
        depth: "3.4",
        lat: 15.4412,
        lng: 73.7095,
        inferenceMs: 138,
        detections: [
            {
                object: "Ghost Net",
                category: "Abandoned Fishing Gear",
                confidence: 0.94,
                hazard: "HIGH",
                dimensions: "4.2m × 2.1m",
                signal: "-18.4 dB",
                depth: "3.4 m",
                box: { left: 29, top: 27, width: 20, height: 24 },
                color: "#e6c05d"
            },
            {
                object: "Vehicle Tire",
                category: "Synthetic Rubber Debris",
                confidence: 0.88,
                hazard: "MEDIUM",
                dimensions: "0.9m × 0.9m",
                signal: "-24.1 dB",
                depth: "3.6 m",
                box: { left: 66, top: 60, width: 12, height: 16 },
                color: "#6fd3c6"
            }
        ]
    },
    2: {
        id: "SAMPLE-02",
        name: "demo_scans/sonar_scan_2_drums_plastic.jpg",
        title: "Corroded Metal Drums & Plastic Array",
        sensor: "Multibeam Echo Sounder (900 kHz)",
        sector: "Harbor Outfall Channel",
        depth: "8.2",
        lat: 15.4195,
        lng: 73.7280,
        inferenceMs: 152,
        detections: [
            {
                object: "55-Gal Steel Drum",
                category: "Corroded Metal / Chemical",
                confidence: 0.96,
                hazard: "HIGH",
                dimensions: "1.1m × 0.8m",
                signal: "-14.2 dB",
                depth: "8.2 m",
                box: { left: 34, top: 38, width: 14, height: 20 },
                color: "#ff526b"
            },
            {
                object: "Plastic Crate Array",
                category: "High-Density Polymer",
                confidence: 0.89,
                hazard: "MEDIUM",
                dimensions: "2.4m × 1.6m",
                signal: "-22.7 dB",
                depth: "7.9 m",
                box: { left: 62, top: 25, width: 16, height: 16 },
                color: "#6fd3c6"
            },
            {
                object: "Submerged Rope",
                category: "Entangled Marine Cordage",
                confidence: 0.79,
                hazard: "LOW",
                dimensions: "3.8m × 0.3m",
                signal: "-29.0 dB",
                depth: "8.4 m",
                box: { left: 18, top: 67, width: 18, height: 12 },
                color: "#f5c84c"
            }
        ]
    },
    3: {
        id: "SAMPLE-03",
        name: "demo_scans/sonar_scan_3_pipeline_debris.jpg",
        title: "Ruptured Pipeline & Ballast Scrap",
        sensor: "Synthetic Aperture Sonar (SAS)",
        sector: "Offshore Trench Alpha",
        depth: "12.5",
        lat: 15.3950,
        lng: 73.6920,
        inferenceMs: 164,
        detections: [
            {
                object: "Ruptured Pipeline",
                category: "Subsea Infrastructure Debris",
                confidence: 0.92,
                hazard: "HIGH",
                dimensions: "9.6m × 0.8m",
                signal: "-11.8 dB",
                depth: "12.1 m",
                box: { left: 11, top: 39, width: 77, height: 16 },
                color: "#ff526b"
            },
            {
                object: "Concrete Scrap",
                category: "Construction Ballast",
                confidence: 0.85,
                hazard: "MEDIUM",
                dimensions: "2.1m × 1.8m",
                signal: "-20.5 dB",
                depth: "12.5 m",
                box: { left: 60, top: 68, width: 14, height: 16 },
                color: "#e6c05d"
            }
        ]
    }
};

let currentScanData = null;
let sessionScanHistory = [];
let maps = {};
let markersLayer = null;
let surveyTrackLayer = null;

document.addEventListener("DOMContentLoaded", () => {
    const themeBtn = document.getElementById("themeToggle");
    const savedTheme = localStorage.getItem("sonar_theme") || "light";
    document.body.classList.toggle("dark-mode", savedTheme === "dark");
    if (themeBtn) themeBtn.textContent = savedTheme === "dark" ? "☀" : "☾";
    themeBtn?.addEventListener("click", () => {
        const dark = !document.body.classList.contains("dark-mode");
        document.body.classList.toggle("dark-mode", dark);
        localStorage.setItem("sonar_theme", dark ? "dark" : "light");
        themeBtn.textContent = dark ? "☀" : "☾";
    });

    const enter = document.getElementById("enterWorkspace");
    enter?.addEventListener("click", () => {
        document.getElementById("introScreen")?.remove();
        const shell = document.getElementById("appShell");
        if (shell) { shell.hidden = false; }
    });

    const brandHome = document.getElementById("brandHome");
    brandHome?.addEventListener("click", () => {
        window.location.reload();
    });

    initNavigation();
    updateClock();
    setInterval(updateClock, 1000);
    renderRecent();
    renderTable();
    renderScanHistory();
    updateSessionAnalytics();
    bindActions();
    bindScanEvents();

    if (!window.L) {
        showMapFallback("liveMap");
    }
});

function initNavigation() {
    document.querySelectorAll("[data-tab]").forEach(btn => {
        btn.addEventListener("click", () => {
            const tab = btn.dataset.tab;
            document.querySelectorAll(".tab-page").forEach(p => p.classList.remove("active"));
            document.getElementById(tab)?.classList.add("active");
            document.querySelectorAll(".nav-item,.top-tab").forEach(x => x.classList.toggle("active", x.dataset.tab === tab));
            
            const titles = {
                dashboard: "Mission Overview",
                map: "Live Detection Map",
                scan: "Sonar Analysis",
                detections: "Detection Database",
                reports: "Mission Reports",
                analytics: "Analytics & Intelligence",
                sessions: "Survey Sessions",
                downloads: "Download Centre",
                settings: "System Settings",
                about: "About Sonar Vision"
            };
            const pageTitle = document.getElementById("pageTitle");
            if (pageTitle) pageTitle.textContent = titles[tab] || "Mission Overview";

            if (tab === "map" && window.L) {
                requestAnimationFrame(() => {
                    const map = initMap("liveMap", 15.4050, 73.7250, 13);
                    map?.invalidateSize(true);
                    refreshMapLayers(map);
                    setTimeout(() => map?.invalidateSize(true), 150);
                    setTimeout(() => map?.invalidateSize(true), 500);
                });
            }
            setTimeout(() => Object.values(maps).forEach(m => m.invalidateSize(true)), 120);
            setTimeout(() => Object.values(maps).forEach(m => m.invalidateSize(true)), 500);
        });
    });
}

window.addEventListener("resize", () => {
    Object.values(maps).forEach(map => map.invalidateSize(true));
});

function updateClock() {
    const clock = document.getElementById("clock");
    if (clock) {
        clock.textContent = new Date().toLocaleTimeString("en-IN", { hour12: false });
    }
}

function showMapFallback(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = `<div style="height:100%;display:grid;place-items:center;background:radial-gradient(circle at center,#073047,#04101a 55%,#020813);color:#6f91a5;font:10px Orbitron;letter-spacing:1px;text-align:center;padding:30px">
    <div><div style="font-size:28px;color:#00e5d0;margin-bottom:12px">⌖</div>
    MAP PREVIEW<br><span style="font:9px Inter;color:#506f82">Connect to the internet to load OpenStreetMap.</span></div>
  </div>`;
}

function initMap(id, lat, lng, zoom) {
    const el = document.getElementById(id);
    if (!el || !window.L || maps[id]) return maps[id];

    const map = L.map(el, { zoomControl: true, preferCanvas: true, fadeAnimation: false, zoomAnimation: false, markerZoomAnimation: false }).setView([lat, lng], zoom);
    const esri = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { attribution: "© Esri", maxZoom: 19, updateWhenIdle: false, keepBuffer: 3 });
    const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap contributors", maxZoom: 19, updateWhenIdle: false, keepBuffer: 3 });
    esri.addTo(map);
    let fallbackStarted = false;
    esri.on('tileerror', () => {
        if (!fallbackStarted) { fallbackStarted = true; osm.addTo(map); }
    });

    addMapDetails(map);
    maps[id] = map;
    
    markersLayer = L.layerGroup().addTo(map);
    surveyTrackLayer = L.layerGroup().addTo(map);
    refreshMapLayers(map);

    const invalidate = () => {
        map.invalidateSize({ pan: false, animate: false });
    };
    requestAnimationFrame(invalidate);
    setTimeout(invalidate, 100);
    setTimeout(invalidate, 400);
    if (window.ResizeObserver) {
        const ro = new ResizeObserver(() => invalidate());
        ro.observe(el);
        map._sonarResizeObserver = ro;
    }
    return map;
}

function addMapDetails(map) {
    const center = [15.4050, 73.7250];
    [0.024, 0.016, 0.008].forEach((r, i) => L.circle(center, { radius: r * 111000, color: ["#39d6cf", "#66e0d6", "#b7efe7"][i], weight: 1, opacity: .5, fill: false, dashArray: "4 7", interactive: false }).addTo(map));
    const corners = [[15.47, 73.66], [15.47, 73.77], [15.33, 73.77], [15.33, 73.66]];
    L.polygon(corners, { color: "#42e2d3", weight: 1, opacity: .32, fillColor: "#19a9a0", fillOpacity: .08, interactive: false }).addTo(map);
}

function refreshMapLayers(map) {
    if (!map) map = maps.liveMap;
    if (!map || !markersLayer || !surveyTrackLayer) return;

    markersLayer.clearLayers();
    surveyTrackLayer.clearLayers();

    if (detections.length === 0) return;

    const track = detections.slice().reverse().map(d => [d.lat, d.lng]);
    if (track.length > 1) {
        L.polyline(track, { color: "#57f0df", weight: 4, opacity: .9 }).addTo(surveyTrackLayer);
        L.polyline(track, { color: "#0c5558", weight: 8, opacity: .32 }).addTo(surveyTrackLayer);
    }

    detections.forEach((d, i) => {
        addMarkerToLayer(markersLayer, d, i);
    });

    if (detections.length > 0) {
        const latest = detections[0];
        map.panTo([latest.lat, latest.lng], { animate: true });
    }
}

function getDebrisIconInfo(objectName, confidence) {
    const name = objectName.toLowerCase();
    let symbol = "⌖";
    let color = "#3cd4be";
    let category = "Marine Debris";

    if (name.includes("net") || name.includes("ghost")) {
        symbol = "🕸";
        color = "#e6c05d";
        category = "Abandoned Fishing Gear";
    } else if (name.includes("drum") || name.includes("chemical") || name.includes("toxic")) {
        symbol = "☣";
        color = "#ff526b";
        category = "Hazardous / Chemical Waste";
    } else if (name.includes("pipe") || name.includes("pipeline")) {
        symbol = "⎎";
        color = "#aa90be";
        category = "Subsea Infrastructure";
    } else if (name.includes("plastic") || name.includes("crate") || name.includes("polymer")) {
        symbol = "▨";
        color = "#4eb5a6";
        category = "Polymer / Plastic Array";
    } else if (name.includes("tire") || name.includes("rubber")) {
        symbol = "◎";
        color = "#31ed8a";
        category = "Synthetic Rubber";
    } else if (name.includes("concrete") || name.includes("ballast") || name.includes("scrap")) {
        symbol = "▲";
        color = "#f5c84c";
        category = "Construction Ballast";
    } else if (name.includes("shipwreck")) {
        symbol = "⚓";
        color = "#5caec7";
        category = "Structural Wreckage";
    }
    return { symbol, color, category };
}

function addMarkerToLayer(layerGroup, d, i) {
    const info = getDebrisIconInfo(d.object, d.confidence);
    const confPercent = Math.round(d.confidence * 100);
    const hazardLevel = d.confidence > .8 ? "HIGH HAZARD" : d.confidence >= .6 ? "MODERATE HAZARD" : "LOW HAZARD";

    const customHtml = `
    <div class="custom-sonar-pin" style="--pin-color: ${info.color}">
        <div class="pin-pulse"></div>
        <div class="pin-badge">
            <span class="pin-symbol">${info.symbol}</span>
        </div>
        <div class="pin-label">${d.object} · ${confPercent}%</div>
    </div>
    `;

    const icon = L.divIcon({
        className: "custom-sonar-pin-wrap",
        html: customHtml,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        popupAnchor: [0, -18]
    });

    const marker = L.marker([d.lat, d.lng], { icon }).addTo(layerGroup);

    const popupContent = `
    <div class="sonar-map-popup">
        <div class="popup-head">
            <span class="popup-id">${d.id}</span>
            <span class="popup-hazard" style="color:${info.color}">${hazardLevel}</span>
        </div>
        <h4 class="popup-title">${d.object}</h4>
        <div class="popup-category">${info.category}</div>
        
        <div class="popup-grid">
            <div><span>CONFIDENCE</span><b>${confPercent}%</b></div>
            <div><span>DEPTH</span><b>${d.depth}</b></div>
            <div><span>LATITUDE</span><b>${d.lat.toFixed(4)}° N</b></div>
            <div><span>LONGITUDE</span><b>${d.lng.toFixed(4)}° E</b></div>
        </div>

        <div class="popup-footer">
            <span>TIME LOGGED: <b>${d.time}</b></span>
            <button class="mini-btn" onclick="focusDetection('${d.id}')">INSPECT TARGET</button>
        </div>
    </div>
    `;

    marker.bindPopup(popupContent, { className: "custom-leaflet-popup", maxWidth: 280 });
}

function updateSessionAnalytics() {
    const totalCount = detections.length;
    let highCount = 0, medCount = 0, lowCount = 0, criticalCount = 0;
    
    detections.forEach(d => {
        if (d.confidence > 0.8) highCount++;
        else if (d.confidence >= 0.5) medCount++;
        else lowCount++;

        if (d.hazard === "HIGH" || d.confidence > 0.9) criticalCount++;
    });

    const scansCount = sessionScanHistory.length;
    const areaScanned = scansCount > 0 ? (scansCount * 4.15).toFixed(2) : (totalCount > 0 ? (totalCount * 1.78).toFixed(2) : "0.00");
    const distCovered = scansCount > 0 ? (scansCount * 2.90).toFixed(2) : (totalCount > 0 ? (totalCount * 1.24).toFixed(2) : "0.00");
    const coveragePct = scansCount > 0 ? Math.min(100, Math.round(scansCount * 33.3)) : (totalCount > 0 ? Math.min(100, Math.round(totalCount * 14.2)) : 0);
    const meanConf = totalCount > 0 ? Math.round((detections.reduce((a, b) => a + b.confidence, 0) / totalCount) * 100) : 0;

    // 1. Overview Top KPI Cards
    const mTotal = document.getElementById("mTotal");
    const mHighSplit = document.getElementById("mHighSplit");
    const mMedSplit = document.getElementById("mMedSplit");
    const mLowSplit = document.getElementById("mLowSplit");
    const kpiPassTrend = document.getElementById("kpiPassTrend");
    const surveyAreaVal = document.getElementById("surveyAreaVal");
    const surveyCoverageBadge = document.getElementById("surveyCoverageBadge");
    const surveyCoverageFill = document.getElementById("surveyCoverageFill");
    const surveyTrackSub = document.getElementById("surveyTrackSub");
    const criticalHazardCount = document.getElementById("criticalHazardCount");
    const hazardStatusBadge = document.getElementById("hazardStatusBadge");
    const criticalHazardSub = document.getElementById("criticalHazardSub");

    if (mTotal) mTotal.textContent = `${totalCount}`;
    if (mHighSplit) mHighSplit.textContent = `${highCount}`;
    if (mMedSplit) mMedSplit.textContent = `${medCount}`;
    if (mLowSplit) mLowSplit.textContent = `${lowCount}`;
    if (kpiPassTrend) kpiPassTrend.textContent = totalCount > 0 ? `+${totalCount} THIS PASS` : "STANDBY";
    if (surveyAreaVal) surveyAreaVal.textContent = areaScanned;
    if (surveyCoverageBadge) surveyCoverageBadge.textContent = `${coveragePct}% COVERAGE`;
    if (surveyCoverageFill) surveyCoverageFill.style.width = `${coveragePct}%`;
    if (surveyTrackSub) surveyTrackSub.textContent = `${distCovered} km Track Line · Offshore Survey Corridor`;
    
    if (criticalHazardCount) criticalHazardCount.textContent = `${criticalCount}`;
    if (hazardStatusBadge) {
        hazardStatusBadge.textContent = criticalCount > 0 ? "REQUIRES RECOVERY" : "CLEAR";
        hazardStatusBadge.style.color = criticalCount > 0 ? "var(--red)" : "var(--green)";
    }
    if (criticalHazardSub) {
        if (criticalCount === 0) {
            criticalHazardSub.textContent = "No critical hazards flagged in current session.";
        } else {
            const highItems = detections.filter(d => d.hazard === "HIGH").map(d => d.object);
            criticalHazardSub.textContent = highItems.slice(0, 3).join(" · ") + (highItems.length > 3 ? ` +${highItems.length - 3} more` : "");
        }
    }

    // 2. Overview Sector Threat Index
    const b3Items = detections.filter(d => (d.scanId === "SAMPLE-01" || d.lat >= 15.43));
    const b4Items = detections.filter(d => (d.scanId === "SAMPLE-02" || (d.lat >= 15.41 && d.lat < 15.43)));
    const alphaItems = detections.filter(d => (d.scanId === "SAMPLE-03" || d.lat < 15.41));
    const c1Items = detections.filter(d => d.object.toLowerCase().includes("rope") || d.object.toLowerCase().includes("plastic"));

    updateSectorCard("sectorB3Count", "sectorB3Threat", "sectorB3Bar", b3Items.length, 90, "CRITICAL", "var(--red)");
    updateSectorCard("sectorB4Count", "sectorB4Threat", "sectorB4Bar", b4Items.length, 75, "HIGH", "var(--yellow)");
    updateSectorCard("sectorAlphaCount", "sectorAlphaThreat", "sectorAlphaBar", alphaItems.length, 55, "MODERATE", "var(--teal)");
    updateSectorCard("sectorC1Count", "sectorC1Threat", "sectorC1Bar", c1Items.length, 25, "LOW", "var(--green)");

    // 3. Overview Debris Material Breakdown Matrix
    const compositionBadge = document.getElementById("compositionTotalBadge");
    if (compositionBadge) compositionBadge.textContent = `${totalCount} CLASSIFIED TARGETS`;

    const materialBarsWrap = document.getElementById("materialBarsWrap");
    if (materialBarsWrap) {
        if (totalCount === 0) {
            materialBarsWrap.innerHTML = `
            <div style="padding: 20px; text-align: center; color: var(--muted); font: 400 9px 'IBM Plex Mono', monospace;">
                NO CLASSIFIED DEBRIS IN CURRENT SESSION<br>
                <span style="font-size: 8px; opacity: 0.8;">Run a sonar scan or sync demo data to populate composition analysis.</span>
            </div>`;
        } else {
            // Group by object type
            const counts = {};
            detections.forEach(d => {
                counts[d.object] = (counts[d.object] || 0) + 1;
            });

            const categoryColors = {
                "Ghost Net": "#e6c05d",
                "55-Gal Steel Drum": "#ff526b",
                "Ruptured Pipeline": "#aa90be",
                "Plastic Crate Array": "#4eb5a6",
                "Vehicle Tire": "#31ed8a",
                "Concrete Scrap": "#f5c84c",
                "Submerged Rope": "#6fd3c6"
            };

            materialBarsWrap.innerHTML = Object.entries(counts).map(([name, count]) => {
                const pct = Math.round((count / totalCount) * 100);
                const color = categoryColors[name] || "#4eb5a6";
                return `
                <div class="material-item">
                    <div class="material-meta">
                        <span>${name}</span>
                        <b>${count} items (${pct}%)</b>
                    </div>
                    <div class="material-progress">
                        <div class="material-fill" style="width: ${pct}%; background: ${color};"></div>
                    </div>
                </div>
                `;
            }).join("");
        }
    }

    // 4. Analytics Tab Synchronization
    const anValHigh = document.getElementById("anValHigh");
    const anValMed = document.getElementById("anValMed");
    const anValLow = document.getElementById("anValLow");
    const anBarHigh = document.getElementById("anBarHigh");
    const anBarMed = document.getElementById("anBarMed");
    const anBarLow = document.getElementById("anBarLow");

    if (anValHigh) anValHigh.textContent = `${highCount}`;
    if (anValMed) anValMed.textContent = `${medCount}`;
    if (anValLow) anValLow.textContent = `${lowCount}`;

    const maxBar = Math.max(highCount, medCount, lowCount, 1);
    if (anBarHigh) anBarHigh.style.height = `${Math.max(14, (highCount / maxBar) * 90)}%`;
    if (anBarMed) anBarMed.style.height = `${Math.max(14, (medCount / maxBar) * 90)}%`;
    if (anBarLow) anBarLow.style.height = `${Math.max(14, (lowCount / maxBar) * 90)}%`;

    const anOverallConfidence = document.getElementById("anOverallConfidence");
    const anAccuracyBar = document.getElementById("anAccuracyBar");
    const anBenchmarkText = document.getElementById("anBenchmarkText");

    if (anOverallConfidence) anOverallConfidence.textContent = totalCount > 0 ? `${meanConf}%` : "--%";
    if (anAccuracyBar) anAccuracyBar.style.width = `${meanConf}%`;
    if (anBenchmarkText) {
        anBenchmarkText.textContent = totalCount > 0 
            ? (meanConf >= 85 ? `Target benchmark met (> 85%): ${meanConf}% nominal` : `Below target benchmark (> 85%): ${meanConf}%`)
            : "Session target benchmark: > 85%";
    }

    const perfList = document.getElementById("analyticsPerfList");
    if (perfList) {
        if (totalCount === 0) {
            perfList.innerHTML = `<div style="color:var(--muted);font-size:10px;padding:10px 0;font-family:var(--mono);">No scanned objects in this session yet.</div>`;
        } else {
            const classAverages = {};
            detections.forEach(d => {
                if (!classAverages[d.object]) classAverages[d.object] = { total: 0, count: 0 };
                classAverages[d.object].total += d.confidence;
                classAverages[d.object].count += 1;
            });

            perfList.innerHTML = Object.entries(classAverages).map(([objName, val]) => {
                const avgPct = Math.round((val.total / val.count) * 100);
                return `<div>${objName} <i style="width:${avgPct}%"></i><b>${avgPct}%</b></div>`;
            }).join("");
        }
    }

    const statDistEl = document.getElementById("statDistance");
    const statAreaEl = document.getElementById("statArea");
    const statImagesEl = document.getElementById("statImages");
    const statAvgInfEl = document.getElementById("statAvgInf");

    if (statDistEl) statDistEl.textContent = `${distCovered} km`;
    if (statAreaEl) statAreaEl.textContent = `${areaScanned} km²`;
    if (statImagesEl) statImagesEl.textContent = `${scansCount}`;
    if (statAvgInfEl) statAvgInfEl.textContent = scansCount > 0 ? "142 ms" : "-- ms";

    // 5. Reports Tab Synchronization
    const reportJsonCount = document.getElementById("reportJsonCount");
    const reportCsvCount = document.getElementById("reportCsvCount");
    const reportPdfArea = document.getElementById("reportPdfArea");
    const previewDetections = document.getElementById("previewDetections");
    const previewHighConf = document.getElementById("previewHighConf");
    const previewArea = document.getElementById("previewArea");
    const previewScans = document.getElementById("previewScans");

    if (reportJsonCount) reportJsonCount.textContent = `${totalCount}`;
    if (reportCsvCount) reportCsvCount.textContent = `${totalCount}`;
    if (reportPdfArea) reportPdfArea.textContent = `${areaScanned} km²`;
    if (previewDetections) previewDetections.textContent = `${totalCount}`;
    if (previewHighConf) previewHighConf.textContent = `${highCount}`;
    if (previewArea) previewArea.textContent = `${areaScanned} km²`;
    if (previewScans) previewScans.textContent = `${scansCount}`;
}

function updateSectorCard(countId, threatId, barId, count, maxThreat, threatLevel, color) {
    const countEl = document.getElementById(countId);
    const threatEl = document.getElementById(threatId);
    const barEl = document.getElementById(barId);

    if (countEl) countEl.textContent = `${count} items`;
    if (threatEl) {
        if (count === 0) {
            threatEl.textContent = "STANDBY · 0%";
            threatEl.style.color = "var(--muted)";
        } else {
            threatEl.textContent = `${threatLevel} · ${maxThreat}%`;
            threatEl.style.color = color;
        }
    }
    if (barEl) {
        barEl.style.width = count === 0 ? "0%" : `${maxThreat}%`;
        barEl.style.background = color;
    }
}

function renderRecent() {
    const el = document.getElementById("recentList");
    if (!el) return;

    if (detections.length === 0) {
        el.innerHTML = `
        <div style="padding: 24px 14px; text-align: center; color: var(--muted); font: 400 9px 'IBM Plex Mono', monospace;">
            <div style="font-size: 20px; color: var(--teal); margin-bottom: 6px;">⌖</div>
            NO TARGETS LOGGED IN CURRENT PASS<br>
            <span style="font-size: 8px; opacity: 0.8;">Upload and analyse a sonar scan to stream acoustic detections.</span>
        </div>
        `;
        return;
    }

    el.innerHTML = detections.slice(0, 6).map(d => {
        const cls = d.confidence > .8 ? "high" : d.confidence >= .5 ? "medium" : "low";
        return `
        <div class="anomaly-feed-row">
            <span class="anomaly-bar ${cls}"></span>
            <div class="anomaly-info">
                <div class="anomaly-title-line">
                    <b>${d.object}</b>
                    <span class="anomaly-id">${d.id}</span>
                </div>
                <small>${d.time} · Depth: ${d.depth} · ${d.lat.toFixed(4)}°N, ${d.lng.toFixed(4)}°E</small>
            </div>
            <div class="anomaly-actions">
                <span class="confidence ${cls}-text">${Math.round(d.confidence * 100)}%</span>
                <button class="mini-btn" onclick="focusDetection('${d.id}')">MAP ↗</button>
            </div>
        </div>
        `;
    }).join("");
}

function renderTable() {
    const tbody = document.getElementById("detectionTable");
    if (!tbody) return;

    if (detections.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:32px 14px;color:var(--muted);font:500 9px 'IBM Plex Mono', monospace;letter-spacing:0.5px;">NO DETECTIONS IN DATABASE — UPLOAD A SONAR SCAN TO COMMENCE SURVEY LOGGING</td></tr>`;
        return;
    }

    tbody.innerHTML = detections.map(d => `<tr>
    <td>${d.id}</td><td>${d.object}</td>
    <td><span class="confidence ${d.confidence > .8 ? "high-text" : d.confidence >= .5 ? "medium-text" : "low-text"}">${Math.round(d.confidence * 100)}%</span></td>
    <td>${d.lat.toFixed(4)}° N</td><td>${d.lng.toFixed(4)}° E</td><td>${d.depth}</td><td>${d.time}</td><td><button class="mini-btn" onclick="focusDetection('${d.id}')">VIEW</button></td>
  </tr>`).join("");
}

window.focusDetection = function (id) {
    const d = detections.find(x => x.id === id);
    if (!d) return;
    document.querySelector('[data-tab="map"]')?.click();
    setTimeout(() => {
        maps.liveMap?.setView([d.lat, d.lng], 15);
        showToast(`Focused on ${d.object} — ${Math.round(d.confidence * 100)}% confidence`);
    }, 150);
};

function bindActions() {
    document.getElementById("centerMap")?.addEventListener("click", () => {
        if (maps.liveMap) maps.liveMap.setView([15.4050, 73.7250], 13);
        else showToast("Map library unavailable — survey centre: 15.4050° N, 73.7250° E");
    });

    document.getElementById("demoBtn")?.addEventListener("click", () => {
        // Load all 3 demo samples into the active session
        sessionScanHistory = [
            {
                id: DEMO_SAMPLES[1].id,
                name: DEMO_SAMPLES[1].name,
                title: DEMO_SAMPLES[1].title,
                imageSrc: DEMO_SAMPLES[1].name,
                scanData: DEMO_SAMPLES[1],
                time: "14:32:18",
                count: DEMO_SAMPLES[1].detections.length,
                topConf: 94
            },
            {
                id: DEMO_SAMPLES[2].id,
                name: DEMO_SAMPLES[2].name,
                title: DEMO_SAMPLES[2].title,
                imageSrc: DEMO_SAMPLES[2].name,
                scanData: DEMO_SAMPLES[2],
                time: "14:28:41",
                count: DEMO_SAMPLES[2].detections.length,
                topConf: 96
            },
            {
                id: DEMO_SAMPLES[3].id,
                name: DEMO_SAMPLES[3].name,
                title: DEMO_SAMPLES[3].title,
                imageSrc: DEMO_SAMPLES[3].name,
                scanData: DEMO_SAMPLES[3],
                time: "14:24:17",
                count: DEMO_SAMPLES[3].detections.length,
                topConf: 92
            }
        ];

        detections = [
            { id: "DET-007", scanId: "SAMPLE-01", object: "Ghost Net", category: "Abandoned Fishing Gear", confidence: .94, lat: 15.4412, lng: 73.7095, depth: "3.4 m", time: "14:32:18", hazard: "HIGH", signal: "-18.4 dB" },
            { id: "DET-006", scanId: "SAMPLE-01", object: "Vehicle Tire", category: "Synthetic Rubber", confidence: .88, lat: 15.4390, lng: 73.7145, depth: "3.6 m", time: "14:32:18", hazard: "MEDIUM", signal: "-24.1 dB" },
            { id: "DET-005", scanId: "SAMPLE-02", object: "55-Gal Steel Drum", category: "Toxic / Chemical", confidence: .96, lat: 15.4195, lng: 73.7280, depth: "8.2 m", time: "14:28:41", hazard: "HIGH", signal: "-14.2 dB" },
            { id: "DET-004", scanId: "SAMPLE-02", object: "Plastic Crate Array", category: "Polymer Debris", confidence: .89, lat: 15.4215, lng: 73.7310, depth: "7.9 m", time: "14:28:41", hazard: "MEDIUM", signal: "-22.7 dB" },
            { id: "DET-003", scanId: "SAMPLE-02", object: "Submerged Rope", category: "Marine Entanglement", confidence: .79, lat: 15.4170, lng: 73.7250, depth: "8.4 m", time: "14:28:41", hazard: "LOW", signal: "-29.0 dB" },
            { id: "DET-002", scanId: "SAMPLE-03", object: "Ruptured Pipeline", category: "Subsea Infrastructure", confidence: .92, lat: 15.3950, lng: 73.6920, depth: "12.1 m", time: "14:24:17", hazard: "HIGH", signal: "-11.8 dB" },
            { id: "DET-001", scanId: "SAMPLE-03", object: "Concrete Scrap", category: "Construction Ballast", confidence: .85, lat: 15.3980, lng: 73.6960, depth: "12.5 m", time: "14:24:17", hazard: "MEDIUM", signal: "-20.5 dB" }
        ];

        refreshMapLayers(maps.liveMap);
        renderRecent();
        renderTable();
        renderScanHistory();
        updateSessionAnalytics();

        showToast("Demo survey session synced — 7 targets plotted across 3 marine sectors");
    });

    document.getElementById("generateReport")?.addEventListener("click", () => {
        showToast("Mission report generated successfully");
    });

    document.getElementById("reportJson")?.addEventListener("click", downloadJSON);
    document.getElementById("downloadJson2")?.addEventListener("click", downloadJSON);
    document.getElementById("reportCsv")?.addEventListener("click", downloadCSV);
    document.getElementById("downloadCsv2")?.addEventListener("click", downloadCSV);

    document.getElementById("reportPdf")?.addEventListener("click", () => {
        downloadText(
            "Session_0028_Mission_Summary.txt",
            "SONAR VISION — MISSION SUMMARY\n\nSESSION: 0028\nDETECTIONS: 128\nHIGH CONFIDENCE: 62\nAREA SCANNED: 12.45 km²\nDURATION: 01:12:36\n\nGenerated by Sonar Vision Frontend-2.",
            "text/plain"
        );
    });

    document.getElementById("downloadLog")?.addEventListener("click", () => {
        downloadText(
            "Session_0028_System.log",
            "SONAR VISION SYSTEM LOG\nSession 0028\nStatus: ONLINE\nImages processed: 156\nDetections: 128\nInference: 143ms\n",
            "text/plain"
        );
    });

    // Filter controls
    document.getElementById("searchInput")?.addEventListener("input", filterTable);
    document.getElementById("confidenceFilter")?.addEventListener("change", filterTable);

    // Settings
    document.getElementById("apiInput")?.addEventListener("change", e => {
        apiBase = e.target.value.trim() || "http://localhost:8000";
        localStorage.setItem(API_BASE_KEY, apiBase);
        showToast("API endpoint saved");
    });

    document.querySelectorAll(".session-row .mini-btn").forEach(btn => {
        btn.addEventListener("click", () => showToast("Session opened in preview mode"));
    });

    document.querySelectorAll(".session-list .session-row").forEach(row => {
        row.addEventListener("click", e => {
            if (e.target.tagName === "BUTTON") return;
            document.querySelectorAll(".session-row").forEach(r => r.classList.remove("active"));
            row.classList.add("active");
            showToast(`${row.querySelector(".session-id")?.textContent || "Session"} selected`);
        });
    });

    document.querySelectorAll(".download-tile .secondary-btn").forEach(btn => {
        if (btn.id) return;
        btn.addEventListener("click", () => showToast("File ready for export"));
    });

    document.querySelectorAll(".page-intro .primary-btn").forEach(btn => {
        if (btn.textContent.includes("EXPORT")) {
            btn.addEventListener("click", downloadCSV);
        } else if (btn.textContent.includes("NEW SESSION")) {
            btn.addEventListener("click", () => {
                showToast("New survey session created — Session 0029");
            });
        }
    });
}

function bindScanEvents() {
    // Upload Handlers
    const sonarFile = document.getElementById("sonarFile");
    sonarFile?.addEventListener("change", () => handleSonarUpload(sonarFile.files?.[0]));
    
    const uploadBox = document.getElementById("uploadBox");
    uploadBox?.addEventListener("dragover", e => { e.preventDefault(); uploadBox.classList.add("dragging"); });
    uploadBox?.addEventListener("dragleave", () => uploadBox.classList.remove("dragging"));
    uploadBox?.addEventListener("drop", e => {
        e.preventDefault();
        uploadBox.classList.remove("dragging");
        const file = e.dataTransfer.files?.[0];
        if (file && file.type.startsWith("image/")) {
            handleSonarUpload(file);
        }
    });

    // Add To Detections Database button
    document.getElementById("addScanResults")?.addEventListener("click", addCurrentScanToSurvey);
}

function handleSonarUpload(file) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const fileName = file.name.toLowerCase();
    
    let sampleMatch = null;
    if (fileName.includes("1") || fileName.includes("ghost") || fileName.includes("net")) {
        sampleMatch = JSON.parse(JSON.stringify(DEMO_SAMPLES[1]));
    } else if (fileName.includes("2") || fileName.includes("drum") || fileName.includes("plastic")) {
        sampleMatch = JSON.parse(JSON.stringify(DEMO_SAMPLES[2]));
    } else if (fileName.includes("3") || fileName.includes("pipe") || fileName.includes("ballast")) {
        sampleMatch = JSON.parse(JSON.stringify(DEMO_SAMPLES[3]));
    } else {
        sampleMatch = {
            id: `CUSTOM-${Date.now().toString().slice(-4)}`,
            name: file.name,
            title: `Custom Sonar Frame (${file.name})`,
            sensor: "Workstation Sonar Upload",
            sector: "Live Processing Grid",
            depth: "4.8",
            lat: 15.4050 + (Math.random() * 0.03 - 0.015),
            lng: 73.7250 + (Math.random() * 0.03 - 0.015),
            inferenceMs: Math.floor(130 + Math.random() * 40),
            detections: [
                {
                    object: "Marine Debris Anomaly",
                    category: "High Acoustic Reflectivity Target",
                    confidence: 0.91,
                    hazard: "HIGH",
                    dimensions: "2.8m × 1.4m",
                    signal: "-16.2 dB",
                    depth: "4.8 m",
                    box: { left: 32, top: 30, width: 22, height: 24 },
                    color: "#e6c05d"
                },
                {
                    object: "Submerged Structural Fragment",
                    category: "Anthropogenic Debris",
                    confidence: 0.78,
                    hazard: "MEDIUM",
                    dimensions: "1.5m × 0.9m",
                    signal: "-25.4 dB",
                    depth: "5.1 m",
                    box: { left: 62, top: 56, width: 16, height: 18 },
                    color: "#6fd3c6"
                }
            ]
        };
    }
    sampleMatch.name = file.name;
    processScanDisplay(url, sampleMatch);
}

function processScanDisplay(imageSrc, scanData) {
    currentScanData = scanData;
    const img = document.getElementById("sonarPreview");
    const stage = document.getElementById("sonarImageStage");
    const empty = stage?.querySelector(".empty-scan");
    const state = document.getElementById("scanState");
    const info = document.getElementById("scanFileInfo");
    const beam = document.getElementById("sonarSweepBeam");
    const boxContainer = document.getElementById("detectionBoxContainer");
    const overlay = document.getElementById("scanOverlay");
    const overlayCount = document.getElementById("overlayCount");
    const infTime = document.getElementById("inferenceTime");

    if (!img || !stage) return;

    if (empty) empty.style.display = "none";
    img.hidden = false;
    img.src = imageSrc;
    if (boxContainer) boxContainer.innerHTML = "";
    if (overlay) overlay.hidden = true;
    if (beam) beam.hidden = false;

    if (state) {
        state.textContent = "ANALYSING...";
        state.style.color = "var(--yellow)";
    }
    if (infTime) infTime.textContent = "INFERENCE...";
    if (info) {
        info.innerHTML = `<span>SELECTED SCAN</span><b>${scanData.name}</b>`;
    }

    setTimeout(() => {
        if (beam) beam.hidden = true;
        if (state) {
            state.textContent = "ANALYSED";
            state.style.color = "var(--green)";
        }
        if (infTime) infTime.textContent = `${scanData.inferenceMs} ms`;

        renderDetectionBoxes(scanData.detections);
        renderScanResultsList(scanData);

        if (overlay) {
            overlay.hidden = false;
            if (overlayCount) overlayCount.textContent = `${scanData.detections.length} TARGETS FLAGGED · ${scanData.sensor}`;
        }

        // Register detections from this scan so they appear on the map and data tables
        scanData.detections.forEach((d, dIdx) => {
            const exists = detections.some(x => x.scanId === scanData.id && x.object === d.object);
            if (!exists) {
                const newId = `DET-${String(detections.length + 1).padStart(3, '0')}`;
                detections.unshift({
                    id: newId,
                    scanId: scanData.id,
                    object: d.object,
                    category: d.category,
                    confidence: d.confidence,
                    hazard: d.hazard,
                    signal: d.signal,
                    dimensions: d.dimensions,
                    lat: scanData.lat + (dIdx * 0.003 - 0.0015),
                    lng: scanData.lng + (dIdx * 0.003 - 0.0015),
                    depth: d.depth,
                    time: new Date().toLocaleTimeString("en-IN", { hour12: false })
                });
            }
        });

        // Update map, anomaly feed, database table, and dashboard KPIs
        refreshMapLayers(maps.liveMap);
        renderRecent();
        renderTable();
        updateSessionAnalytics();

        // Add to session scan history
        recordScanHistory(imageSrc, scanData);

        showToast(`Scan analysed — ${scanData.detections.length} targets plotted on offshore map in ${scanData.inferenceMs}ms`);
    }, scanData.inferenceMs + 100);
}

function recordScanHistory(imageSrc, scanData) {
    const existingIndex = sessionScanHistory.findIndex(h => h.name === scanData.name);
    const topConf = Math.round(Math.max(...scanData.detections.map(d => d.confidence)) * 100);
    const historyItem = {
        id: scanData.id,
        name: scanData.name,
        title: scanData.title,
        imageSrc,
        scanData,
        time: new Date().toLocaleTimeString("en-IN", { hour12: false }),
        count: scanData.detections.length,
        topConf: topConf
    };

    if (existingIndex >= 0) {
        sessionScanHistory.splice(existingIndex, 1);
    }
    sessionScanHistory.unshift(historyItem);
    renderScanHistory();
}

function renderScanHistory() {
    const list = document.getElementById("scanHistoryList");
    const countBadge = document.getElementById("historyCount");
    if (!list) return;

    if (countBadge) countBadge.textContent = `${sessionScanHistory.length} SCANS`;

    if (sessionScanHistory.length === 0) {
        list.innerHTML = `<div class="scan-history-empty" id="historyEmpty"><span>No previous scans in this session.<br>Uploaded scans will appear here.</span></div>`;
        return;
    }

    list.innerHTML = sessionScanHistory.map((h, idx) => {
        const isActive = currentScanData && currentScanData.name === h.name;
        return `
        <div class="scan-history-card ${isActive ? 'active' : ''}" onclick="loadFromHistory(${idx})">
            <div class="history-card-top">
                <span class="history-time">${h.time}</span>
                <span class="history-badge">${h.count} TARGETS · ${h.topConf}% TOP</span>
            </div>
            <strong class="history-name">${h.name}</strong>
        </div>
        `;
    }).join("");
}

window.loadFromHistory = function(idx) {
    const item = sessionScanHistory[idx];
    if (!item) return;

    currentScanData = item.scanData;
    const img = document.getElementById("sonarPreview");
    const stage = document.getElementById("sonarImageStage");
    const empty = stage?.querySelector(".empty-scan");
    const state = document.getElementById("scanState");
    const info = document.getElementById("scanFileInfo");
    const overlay = document.getElementById("scanOverlay");
    const overlayCount = document.getElementById("overlayCount");
    const infTime = document.getElementById("inferenceTime");

    if (!img || !stage) return;

    if (empty) empty.style.display = "none";
    img.hidden = false;
    img.src = item.imageSrc;

    if (state) {
        state.textContent = "ANALYSED";
        state.style.color = "var(--green)";
    }
    if (infTime) infTime.textContent = `${item.scanData.inferenceMs} ms`;
    if (info) {
        info.innerHTML = `<span>SELECTED SCAN</span><b>${item.scanData.name}</b>`;
    }

    renderDetectionBoxes(item.scanData.detections);
    renderScanResultsList(item.scanData);

    if (overlay) {
        overlay.hidden = false;
        if (overlayCount) overlayCount.textContent = `${item.scanData.detections.length} TARGETS FLAGGED · ${item.scanData.sensor}`;
    }

    refreshMapLayers(maps.liveMap);
    renderScanHistory();
    showToast(`Loaded ${item.name} from session history`);
};

function renderDetectionBoxes(detectionList) {
    const container = document.getElementById("detectionBoxContainer");
    if (!container) return;
    container.innerHTML = "";

    detectionList.forEach((d, idx) => {
        const box = document.createElement("div");
        box.className = `detection-box`;
        box.id = `det-box-${idx}`;
        box.style.left = `${d.box.left}%`;
        box.style.top = `${d.box.top}%`;
        box.style.width = `${d.box.width}%`;
        box.style.height = `${d.box.height}%`;
        box.style.borderColor = d.color;
        box.style.backgroundColor = `${d.color}22`;

        const label = document.createElement("span");
        label.style.backgroundColor = d.color;
        label.textContent = `${d.object} ${Math.round(d.confidence * 100)}%`;
        box.appendChild(label);

        container.appendChild(box);
    });
}

function renderScanResultsList(scanData) {
    const list = document.getElementById("scanResultsList");
    const results = document.getElementById("scanResults");
    const resultEmpty = document.getElementById("scanResultEmpty");
    const count = document.getElementById("resultCount");
    const avgConf = document.getElementById("avgConfidence");
    const scanDepth = document.getElementById("scanDepth");

    if (!list) return;
    if (resultEmpty) resultEmpty.hidden = true;
    if (results) results.hidden = false;
    if (count) count.textContent = `${scanData.detections.length}`;

    const totalConf = scanData.detections.reduce((acc, d) => acc + d.confidence, 0);
    const meanConf = Math.round((totalConf / scanData.detections.length) * 100);
    if (avgConf) avgConf.textContent = `${meanConf}%`;
    if (scanDepth) scanDepth.textContent = `${scanData.depth} m`;

    list.innerHTML = scanData.detections.map((d, idx) => {
        const hazardCls = d.hazard === "HIGH" ? "high-text" : d.hazard === "MEDIUM" ? "medium-text" : "low-text";
        return `
        <div class="scan-result-card" data-idx="${idx}" onmouseenter="highlightBox(${idx}, true)" onmouseleave="highlightBox(${idx}, false)">
            <div class="result-card-top">
                <span class="result-card-num" style="color:${d.color}">0${idx + 1}</span>
                <div class="result-card-titles">
                    <b>${d.object}</b>
                    <small>${d.category}</small>
                </div>
                <div class="result-card-score">
                    <strong style="color:${d.color}">${Math.round(d.confidence * 100)}%</strong>
                    <span class="hazard-badge ${hazardCls}">HAZARD: ${d.hazard}</span>
                </div>
            </div>
            <div class="result-card-meta">
                <span>SIZE: <b>${d.dimensions}</b></span>
                <span>DEPTH: <b>${d.depth}</b></span>
                <span>SIGNAL: <b>${d.signal}</b></span>
            </div>
        </div>
        `;
    }).join("");
}

window.highlightBox = function(idx, active) {
    const box = document.getElementById(`det-box-${idx}`);
    if (!box) return;
    if (active) {
        box.style.transform = "scale(1.02)";
        box.style.boxShadow = "0 0 16px rgba(255, 255, 255, 0.85)";
        box.style.zIndex = "10";
    } else {
        box.style.transform = "scale(1)";
        box.style.boxShadow = "none";
        box.style.zIndex = "5";
    }
};

function addCurrentScanToSurvey() {
    if (!currentScanData || !currentScanData.detections.length) {
        showToast("No active scan detections to add");
        return;
    }
    showToast(`${currentScanData.detections.length} detections verified and logged to survey.`);
}

function filterTable() {
    const q = document.getElementById("searchInput").value.toLowerCase();
    const f = document.getElementById("confidenceFilter").value;
    [...document.querySelectorAll("#detectionTable tr")].forEach(row => {
        const text = row.innerText.toLowerCase();
        const conf = Number(row.children[2]?.innerText.replace("%", "")) / 100;
        const bucket = conf > .8 ? "high" : conf >= .5 ? "medium" : "low";
        row.style.display = (text.includes(q) && (f === "all" || f === bucket)) ? "" : "none";
    });
}

function downloadJSON() {
    downloadText("Session_0028_Detections.json", JSON.stringify({ session_id: "0028", area_scanned_km2: 12.45, detections }, null, 2), "application/json");
}
function downloadCSV() {
    const header = "id,object,confidence,latitude,longitude,depth,time\n";
    const body = detections.map(d => `${d.id},${d.object},${d.confidence},${d.lat},${d.lng},${d.depth},${d.time}`).join("\n");
    downloadText("Session_0028_Report.csv", header + body, "text/csv");
}
function downloadText(name, text, type = "text/plain") {
    try {
        const blob = new Blob([text], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 500);
        showToast(`${name} downloaded`);
    } catch (err) {
        showToast("Export could not start in this browser");
        console.error(err);
    }
}
function showToast(msg) {
    const t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg;
    t.style.opacity = "1";
    t.style.transform = "translateY(0)";
    clearTimeout(window.toastTimer);
    window.toastTimer = setTimeout(() => {
        t.style.opacity = "0";
        t.style.transform = "translateY(10px)";
    }, 2500);
}
