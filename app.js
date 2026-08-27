const API_BASE_KEY = "sonar_api";
let apiBase = localStorage.getItem(API_BASE_KEY) || "http://localhost:8000";

const detections = [
    { id: "DET-128", object: "Ghost Net", confidence: .92, lat: 15.2991, lng: 74.1245, depth: "1.2 m", time: "14:32:18" },
    { id: "DET-127", object: "Shipwreck", confidence: .85, lat: 15.2978, lng: 74.1210, depth: "4.8 m", time: "14:28:41" },
    { id: "DET-126", object: "Pipe", confidence: .68, lat: 15.2942, lng: 74.1193, depth: "2.1 m", time: "14:24:17" },
    { id: "DET-125", object: "Debris", confidence: .42, lat: 15.2910, lng: 74.1178, depth: "0.9 m", time: "14:20:03" },
    { id: "DET-124", object: "Cylinder", confidence: .79, lat: 15.2865, lng: 74.1132, depth: "1.6 m", time: "14:15:50" },
    { id: "DET-123", object: "Ghost Net", confidence: .88, lat: 15.2811, lng: 74.1098, depth: "2.4 m", time: "14:11:22" },
    { id: "DET-122", object: "Debris", confidence: .47, lat: 15.2763, lng: 74.1055, depth: "1.0 m", time: "14:06:13" }
];

let maps = {};

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
        if (window.L) {
            // The shell is now visible, so Leaflet can measure the real panel size.
            requestAnimationFrame(() => {
                initMap("dashboardMap", 15.292, 74.118, 12);
                setTimeout(() => Object.values(maps).forEach(m => m.invalidateSize(true)), 120);
                setTimeout(() => Object.values(maps).forEach(m => m.invalidateSize(true)), 500);
            });
        }
    });
    // UI must initialize independently of the map library.
    // This means every tab/button still works if Leaflet or the internet is unavailable.
    const brandHome = document.getElementById("brandHome");
    brandHome?.addEventListener("click", () => {
        // Return to the opening Sonar Vision page. Reloading restores the intro
        // screen cleanly and resets the workspace to its initial state.
        window.location.reload();
    });

    initNavigation();
    updateClock();
    setInterval(updateClock, 1000);
    renderRecent();
    renderTable();
    bindActions();

    // IMPORTANT: do not create the dashboard map while #appShell is hidden.
    // Leaflet measures its container at construction time; if the parent is
    // display:none/hidden it can permanently start with a tiny viewport.
    if (!window.L) {
        showMapFallback("dashboardMap");
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
            const titles = { dashboard: "Mission Dashboard", map: "Live Detection Map", scan: "Sonar Analysis", detections: "Detection Database", reports: "Mission Reports", analytics: "Analytics & Intelligence", sessions: "Survey Sessions", downloads: "Download Centre", settings: "System Settings", about: "About Sonar Vision" };
            const pageTitle = document.getElementById("pageTitle"); if (pageTitle) pageTitle.textContent = titles[tab] || "Mission Dashboard";
            if (tab === "map" && window.L) {
                // The map tab is visible before Leaflet measures it.
                requestAnimationFrame(() => {
                    const map = initMap("liveMap", 15.292, 74.118, 12);
                    map?.invalidateSize(true);
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
    document.getElementById("clock").textContent = new Date().toLocaleTimeString("en-IN", { hour12: false });
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
    addSurveyTrack(map);
    detections.forEach((d, i) => addMarker(map, d, i));

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
    const center = [15.292, 74.118];
    [0.018, 0.012, 0.006].forEach((r, i) => L.circle(center, { radius: r * 111000, color: ["#39d6cf", "#66e0d6", "#b7efe7"][i], weight: 1, opacity: .5, fill: false, dashArray: "4 7", interactive: false }).addTo(map));
    const corners = [[15.34, 74.06], [15.34, 74.18], [15.25, 74.18], [15.25, 74.06]];
    L.polygon(corners, { color: "#42e2d3", weight: 1, opacity: .28, fillColor: "#19a9a0", fillOpacity: .06, interactive: false }).addTo(map);
}

function addSurveyTrack(map) {
    const track = detections.slice().reverse().map(d => [d.lat, d.lng]);
    L.polyline(track, { color: "#57f0df", weight: 4, opacity: .9 }).addTo(map);
    L.polyline(track, { color: "#0c5558", weight: 8, opacity: .32 }).addTo(map);
}

function addMarker(map, d, i) {
    const color = d.confidence > .8 ? "#31ed8a" : d.confidence >= .5 ? "#f5c84c" : "#ff526b";
    const icon = L.divIcon({ className: "sonar-marker", html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 0 13px ${color}"></div>`, iconSize: [14, 14], iconAnchor: [7, 7] });
    const marker = L.marker([d.lat, d.lng], { icon }).addTo(map);
    marker.bindPopup(`<b style="color:#00e5d0">${d.object}</b><br>Confidence: ${Math.round(d.confidence * 100)}%<br>Depth: ${d.depth}<br>${d.lat.toFixed(4)}° N, ${d.lng.toFixed(4)}° E`);
}

function renderRecent() {
    document.getElementById("recentList").innerHTML = detections.slice(0, 5).map(d => {
        const cls = d.confidence > .8 ? "high" : d.confidence >= .5 ? "medium" : "low";
        return `<div class="recent-row"><span class="bar ${cls}"></span><div><b>${d.object}</b><small>${d.time} · ${d.depth}</small></div><span class="confidence ${cls}-text">${Math.round(d.confidence * 100)}%</span></div>`;
    }).join("");
}

function renderTable() {
    const tbody = document.getElementById("detectionTable");
    tbody.innerHTML = detections.map(d => `<tr>
    <td>${d.id}</td><td>${d.object}</td>
    <td><span class="confidence ${d.confidence > .8 ? "high-text" : d.confidence >= .5 ? "medium-text" : "low-text"}">${Math.round(d.confidence * 100)}%</span></td>
    <td>${d.lat.toFixed(4)}° N</td><td>${d.lng.toFixed(4)}° E</td><td>${d.depth}</td><td>${d.time}</td><td><button class="mini-btn" onclick="focusDetection('${d.id}')">VIEW</button></td>
  </tr>`).join("");
}

window.focusDetection = function (id) {
    const d = detections.find(x => x.id === id);
    if (!d) return;
    document.querySelector('[data-tab="map"]').click();
    setTimeout(() => { maps.liveMap?.setView([d.lat, d.lng], 15); showToast(`Focused on ${d.object} — ${Math.round(d.confidence * 100)}% confidence`) }, 150);
};

function bindActions() {
    // Navigation / UI buttons
    document.getElementById("centerMap")?.addEventListener("click", () => {
        if (maps.liveMap) maps.liveMap.setView([15.292, 74.118], 12);
        else showToast("Map library unavailable — survey centre: 15.292° N, 74.118° E");
    });

    document.getElementById("demoBtn")?.addEventListener("click", () => {
        showToast("Demo session loaded — 128 detections");
        document.getElementById("mTotal").textContent = "128";
        document.getElementById("mHigh").textContent = "62";
        document.getElementById("mMedium").textContent = "43";
        document.getElementById("mLow").textContent = "23";
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
            "SONAR VISION — MISSION SUMMARY\\n\\nSESSION: 0028\\nDETECTIONS: 128\\nHIGH CONFIDENCE: 62\\nAREA SCANNED: 12.45 km²\\nDURATION: 01:12:36\\n\\nGenerated by Sonar Vision Frontend-2.",
            "text/plain"
        );
    });

    document.getElementById("downloadLog")?.addEventListener("click", () => {
        downloadText(
            "Session_0028_System.log",
            "SONAR VISION SYSTEM LOG\\nSession 0028\\nStatus: ONLINE\\nImages processed: 156\\nDetections: 128\\nInference: 143ms\\n",
            "text/plain"
        );
    });

    // Sonar scan upload / analysis prototype
    const sonarFile = document.getElementById("sonarFile");
    sonarFile?.addEventListener("change", () => handleSonarUpload(sonarFile.files?.[0]));
    const uploadBox = document.getElementById("uploadBox");
    uploadBox?.addEventListener("dragover", e => { e.preventDefault(); uploadBox.classList.add("dragging") });
    uploadBox?.addEventListener("dragleave", () => uploadBox.classList.remove("dragging"));
    uploadBox?.addEventListener("drop", e => {
        e.preventDefault(); uploadBox.classList.remove("dragging");
        const file = e.dataTransfer.files?.[0];
        if (file && file.type.startsWith("image/")) { handleSonarUpload(file); }
    });
    document.getElementById("addScanResults")?.addEventListener("click", () => {
        showToast("2 scan detections added to the detection database");
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

    // Buttons that are intentionally demo interactions for the prototype.
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

    // Catch the export button in the detections page.
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

function handleSonarUpload(file) {
    if (!file) return;
    const img = document.getElementById("sonarPreview");
    const stage = document.getElementById("sonarImageStage");
    const empty = stage?.querySelector(".empty-scan");
    const state = document.getElementById("scanState");
    const info = document.getElementById("scanFileInfo");
    const results = document.getElementById("scanResults");
    const resultEmpty = document.getElementById("scanResultEmpty");
    const count = document.getElementById("resultCount");
    if (!img || !stage) return;
    const url = URL.createObjectURL(file);
    img.onload = () => {
        if (empty) empty.style.display = "none";
        img.hidden = false;
        stage.querySelectorAll(".detection-box,.scan-overlay").forEach(x => x.hidden = false);
        if (results) results.hidden = false;
        if (resultEmpty) resultEmpty.hidden = true;
        if (count) count.textContent = "2";
        if (state) { state.textContent = "ANALYSED"; state.style.color = "var(--green)"; }
        if (info) { info.innerHTML = `<span>SCAN LOADED</span><b>${file.name}</b>`; }
        showToast("Sonar scan loaded — 2 detections found");
    };
    img.src = url;
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
    const t = document.getElementById("toast"); t.textContent = msg; t.style.opacity = "1"; t.style.transform = "translateY(0)";
    clearTimeout(window.toastTimer); window.toastTimer = setTimeout(() => { t.style.opacity = "0"; t.style.transform = "translateY(10px)" }, 2500);
}
