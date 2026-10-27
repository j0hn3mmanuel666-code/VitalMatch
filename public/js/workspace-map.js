(function () {

  if (typeof L === 'undefined') { document.getElementById('mapFeedback').textContent = 'The map library is unavailable. Use the request register or reload this page.'; return; }
  var map = L.map("bloodMap").setView([12.95, 121.30], 9);
  L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "Esri, HERE, Garmin, OpenStreetMap contributors" }).addTo(map);

  function dot(bg, text, extra) {
    return L.divIcon({ className: "", html: "<span style='display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:9999px;background:" + bg + ";color:#fff;font-weight:700;font-size:12px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.35);" + (extra || "") + "'>" + text + "</span>", iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -14] });
  }

  var layers = {
    "Hospitals": L.layerGroup().addTo(map),
    "Urgent requests": L.layerGroup().addTo(map),
    "Donation centers": L.layerGroup().addTo(map),
    "Donors": L.layerGroup().addTo(map),
    "Your location": L.layerGroup().addTo(map)
  };
  L.control.layers(null, layers, { collapsed: false }).addTo(map);

  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  function loadPins() {
  document.getElementById("mapFeedback").textContent = "Loading map records...";
  fetch("/api/map-pins")
    .then(function (r) { if (!r.ok) throw new Error("Map records unavailable"); return r.json(); })
    .then(function (data) {
      if (!data.success || !data.pins) throw new Error('Map records unavailable');
      Object.values(layers).forEach(function (layer) { layer.clearLayers(); });
      var pins = data.pins;
      var limits = data.limits || {};
      var requestLimit = limits.requests || {}, donorLimit = limits.donors || {};
      var donorCoverage = pins.donorCounts.length ? (donorLimit.total || 0) + " donor profiles grouped into " + pins.donorCounts.length + " approximate municipality counts" : (donorLimit.shown || 0) + " of " + (donorLimit.total || 0) + " donor locations";
      document.getElementById("mapFeedback").textContent = "Showing " + (requestLimit.shown || 0) + " of " + (requestLimit.total || 0) + " requests (urgency then newest), and " + donorCoverage + ". Open the registers for full records.";

      pins.hospitals.forEach(function (h) {
        L.marker([h.lat, h.lng], { icon: dot("#2563eb", "H") })
          .bindPopup("<strong>" + esc(h.name) + "</strong>" + (h.verified ? " ✓" : "") + "<br>" + esc(h.city || "") + ", " + esc(h.province || "") + "<br>" + (data.hospitalCountsAreLimited ? "Displayed open requests: " : "Open requests: ") + h.openRequests + (h.verified ? "<br><em>Verified facility</em>" : "") + (h.approximate ? "<br><em>Approximate location</em>" : ""))
          .addTo(layers["Hospitals"]);
      });

      pins.requests.forEach(function (q) {
        var reqIcon = q.emergencyActive
          ? dot("#dc2626", esc(q.bloodType || "!"), "width:38px !important;height:38px !important;")
          : dot("#dc2626", esc(q.bloodType || "!"));
        L.marker([q.lat, q.lng], { icon: reqIcon })
          .bindPopup((q.emergencyActive ? "<strong style='color:#dc2626;'>EMERGENCY</strong><br>" : "") + "<strong>" + esc(q.bloodType) + " needed (" + q.units + " unit" + (q.units > 1 ? "s" : "") + ")</strong><br>" + esc(q.hospital) + ", " + esc(q.city) + "<br>Urgency: " + esc(q.urgency) + (q.approximate ? "<br><em>Approximate location</em>" : "") + (q.canViewDetails ? "<br><a href='/view-blood-request/" + q.id + "' class='vm-text-link'>View request</a>" : "<br><em>Contact the coordination team for this request.</em>"))
          .addTo(layers["Urgent requests"]);
      });

      pins.redcross.forEach(function (c) {
        L.marker([c.lat, c.lng], { icon: dot("#ffffff", "+", "color:#dc2626 !important;border-color:#dc2626 !important;") })
          .bindPopup("<strong>" + esc(c.name) + "</strong><br>" + esc(c.address) + "<br>" + esc(c.phone || ""))
          .addTo(layers["Donation centers"]);
      });

      pins.donors.forEach(function (d) {
        L.marker([d.lat, d.lng], { icon: dot("#16a34a", esc(d.bloodType || "")) })
          .bindPopup("<strong>" + esc(d.bloodType) + " donor</strong><br>" + esc(d.city || "") + "<br><em>Approximate location</em>")
          .addTo(layers["Donors"]);
      });

      pins.donorCounts.forEach(function (c) {
        var breakdown = Object.keys(c.types).map(function (k) { return k + ": " + c.types[k]; }).join(", ");
        L.marker([c.lat, c.lng], { icon: dot("#f97316", String(c.count)) })
          .bindPopup("<strong>" + esc(c.city) + "</strong><br>" + c.count + " profile" + (c.count > 1 ? "s" : "") + " marked available" + "<br>" + esc(breakdown))
          .addTo(layers["Donors"]);
      });

      if (pins.self) {
        L.marker([pins.self.lat, pins.self.lng], { icon: dot("#2563eb", "You", "width:auto !important;padding:0 10px;") })
          .bindPopup("<strong>Your location</strong><br>" + esc(pins.self.city || "") + "<br>Status: " + (pins.self.isAvailable ? "Available" : "Paused") + (pins.self.approximate ? "<br><em>Approximate location</em>" : ""))
          .addTo(layers["Your location"]);
      }

      var all = [];
      ["hospitals", "requests", "redcross", "donors", "donorCounts"].forEach(function (k) { (pins[k] || []).forEach(function (p) { all.push([p.lat, p.lng]); }); });
      if (pins.self) all.push([pins.self.lat, pins.self.lng]);
      if (all.length > 0) map.fitBounds(all, { padding: [40, 40], maxZoom: 12 });
    })
    .catch(function () { document.getElementById("mapFeedback").textContent = "Map records are unavailable. Retry or use the request register."; });
  }
  document.getElementById("mapRetry").addEventListener("click", loadPins);
  loadPins();

})();
