/* eBaustelle dashboards – shared core: navigation, theme, info popovers, filters, data decoding, charts, map layers */
(function () {
  const EB = (window.EB = {});
  const CANTONS = ["AG","AI","AR","BE","BL","BS","FR","GE","GL","GR","JU","LU","NE","NW","OW","SG","SH","SO","SZ","TG","TI","UR","VD","VS","ZG","ZH"];
  EB.CANTONS = CANTONS;
  EB.YEARS = []; for (let y = 2016; y <= 2026; y++) EB.YEARS.push(y);
  EB.PROC_LABEL = { open: "offen", selective: "selektiv", invitation: "Einladung", direct: "freihändig", "": "unbekannt" };
  EB.TYPE_COLOR = ["--s1", "--s2", "--s3", "--s4"];
  EB.css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

  /* ---------------- formatting */
  const nf0 = new Intl.NumberFormat("de-CH", { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat("de-CH", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  EB.n0 = (v) => (v == null || isNaN(v) ? "–" : nf0.format(v));
  EB.n1 = (v) => (v == null || isNaN(v) ? "–" : nf1.format(v));
  EB.chf = (v, short) => {
    if (v == null || isNaN(v) || v === 0) return "–";
    if (Math.abs(v) >= 1e9) return (short ? "" : "CHF ") + nf1.format(v / 1e9) + " Mrd";
    if (Math.abs(v) >= 1e6) return (short ? "" : "CHF ") + nf1.format(v / 1e6) + " Mio";
    return (short ? "" : "CHF ") + nf0.format(v);
  };
  EB.esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------------- storage (per-viewer convenience only) */
  EB.store = {
    get(k, d) { try { const v = localStorage.getItem("eb-" + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("eb-" + k, JSON.stringify(v)); } catch (e) {} },
  };

  /* ---------------- shell: top bar + footer + theme */
  const PAGES = [["index.html", "Übersicht"], ["projects.html", "Projekte"], ["map.html", "Karte"], ["gwr.html", "GWR-Pipeline"], ["firms.html", "Firmen"], ["sources.html", "Quellen & Methoden"]];
  EB.shell = function (active) {
    // light is the default; a viewer's own choice (toggle) is remembered per browser
    document.documentElement.setAttribute("data-theme", EB.store.get("theme", "light"));
    const bar = document.createElement("header");
    bar.className = "topbar";
    bar.innerHTML = `<div class="in"><a class="brand" href="index.html"><span class="dot"></span>eBaustelle · Baustellen-Monitor CH</a>
      <nav class="nav">${PAGES.map(([h, l]) => `<a href="${h}" class="${h === active ? "on" : ""}">${l}</a>`).join("")}</nav>
      <span class="spacer"></span><span class="small muted">Stand Daten: 22.11.2026</span>
      <button class="iconbtn" id="themeBtn" title="Hell/Dunkel">◐</button></div>`;
    document.body.prepend(bar);
    document.getElementById("themeBtn").onclick = () => {
      const cur = document.documentElement.getAttribute("data-theme") || "light";
      const nx = cur === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", nx); EB.store.set("theme", nx);
      document.dispatchEvent(new Event("eb-theme"));
    };
    const f = document.createElement("footer");
    f.innerHTML = `Quellen: <a href="https://www.simap.ch" target="_blank" rel="noopener">simap.ch</a> · <a href="https://archiv.simap.ch" target="_blank" rel="noopener">archiv.simap.ch</a> · <a href="https://www.housing-stat.ch" target="_blank" rel="noopener">BFS GWR</a> · <a href="https://www.strompreis.elcom.admin.ch" target="_blank" rel="noopener">ElCom</a> · <a href="https://www.bfs.admin.ch/bfs/de/home/statistiken/bau-wohnungswesen.html" target="_blank" rel="noopener">BFS Baustatistik</a> · EBP 2025. Methoden und Plausibilisierung: <a href="sources.html">Quellen & Methoden</a>. Schätzwerte (CO₂, Strom) sind als solche gekennzeichnet.`;
    document.body.append(f);
    const dlg = document.createElement("div");
    dlg.className = "infodlg"; dlg.id = "infodlg"; dlg.setAttribute("role", "dialog");
    document.body.append(dlg);
    const tt = document.createElement("div"); tt.className = "tooltip"; tt.id = "tt"; document.body.append(tt);
    document.addEventListener("click", (e) => {
      const b = e.target.closest("[data-info]");
      if (b) { EB.openInfo(b.dataset.info); e.stopPropagation(); return; }
      if (!e.target.closest("#infodlg")) dlg.classList.remove("open");
      document.querySelectorAll(".dd.open").forEach((d) => { if (!d.contains(e.target)) d.classList.remove("open"); });
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") dlg.classList.remove("open"); });
  };

  /* ---------------- info registry (definition, method, sources) */
  const S = {
    simapNew: ["simap.ch – öffentliche Projektsuche (API, ab 1.7.2024)", "https://www.simap.ch/api/specifications/simap.yaml"],
    simapArch: ["archiv.simap.ch – Publikationen vor 1.7.2024 (API)", "https://archiv.simap.ch/api/v3/api-docs"],
    gwr: ["BFS – Eidg. Gebäude- und Wohnungsregister (GWR), öffentlicher Datenbezug", "https://www.housing-stat.ch/de/madd/public.html"],
    gwrMap: ["map.geo.admin.ch – Layer «GWR: Gebäudestatus»", "https://map.geo.admin.ch/#/map?lang=de&topic=bfs&layers=ch.bfs.gebaeude_wohnungs_register"],
    elcom: ["ElCom – Strompreise/Netzbetreiber je Gemeinde (LINDAS)", "https://www.strompreis.elcom.admin.ch"],
    bfs: ["BFS – Bauausgaben nach Kanton, Auftraggeber, Bauwerk (px-x-0904010000_202)", "https://www.pxweb.bfs.admin.ch/pxweb/de/px-x-0904010000_202/"],
    ebp: ["EBP (2025) Wege zu Netto-Null für Baumaschinen in der Schweiz, S. 10 & 14 (Projektunterlage, nicht öffentlich verlinkt)", "https://www.ebp.ch"],
    bafuGhg: ["BAFU – Treibhausgasinventar der Schweiz (Quelle der 464 kt CO₂e Baumaschinen)", "https://www.bafu.admin.ch/bafu/de/home/themen/klima/zustand/daten/treibhausgasinventar.html"],
    methods: ["Quellen & Methoden (dieses Dashboard)", "sources.html"],
  };
  EB.INFO = {
    k_projects: { t: "Baustellen-Projekte", b: "Anzahl Projekte nach Filter. Ein <b>Projekt</b> ist eine Gruppe von simap-Publikationen (Ausschreibung, Zuschlag, Lose/BKP-Gewerke, Planer- und Wettbewerbsverfahren), die zum selben Bauvorhaben gehören. Gruppierung: gleiche simap-Projekt-ID, gleicher Basistitel nach Entfernen von BKP/NPK/Los-Angaben bei gleicher Vergabestelle, gemeinsame Programmnummern (ASTRA MP-, BBL b-, Stadt Zürich BAV-Nummern) sowie unscharfer Titelabgleich innerhalb der Vergabestelle (Jaccard ≥ 0.6, ≥ 2 gemeinsame Kennwörter).", s: ["simapNew", "simapArch", "methods"] },
    k_value: { t: "Zuschlagssumme", b: "Summe der in Zuschlagspublikationen genannten Preise (CHF, wie publiziert, MWST-Status uneinheitlich) für Bau- und Planungsleistungen. Doppelte Sprachversionen und identische Firmen-/Preis-Wiederholungen sind entfernt. Zuschläge ohne Preisangabe zählen 0. Es handelt sich um <b>Vertragswerte zum Zuschlagszeitpunkt</b>, nicht um jährliche Ausgaben.", s: ["simapNew", "simapArch", "methods"] },
    k_co2: { t: "CO₂ Baumaschinen (Schätzung)", b: "Grobe Schätzung der direkten Emissionen von Baumaschinen auf der Baustelle: Zuschlagswert Bauleistungen × <b>6.85 t CO₂e pro Mio CHF</b>. Faktor = 464'067 t CO₂e Baumaschinen 2023 (BAFU, zitiert in EBP 2025 S.14) ÷ CHF 67.8 Mrd Bauausgaben 2023 (BFS). Annahme: Emissionen proportional zum Bauvolumen; Tiefbau liegt real eher darüber, Ausbaugewerke darunter. Nicht enthalten: Transportlogistik (in den Piloten 56–70 % der Restemissionen) und graue Energie der Materialien.", s: ["ebp", "bafuGhg", "bfs", "methods"] },
    k_elec: { t: "Strombedarf bei Elektrifizierung (Schätzung)", b: "Indikativer Strombedarf, falls die Baumaschinen elektrisch betrieben würden: Zuschlagswert Bauleistungen × <b>7.4 MWh pro Mio CHF</b>. Faktor = > 500 GWh/a Strombedarf Baumaschinen 2050 im ZERO-E-Szenario (EBP 2025 S.10) ÷ CHF 67.8 Mrd Bauausgaben 2023. Größenordnung für die Netzplanung, keine Lastspitze.", s: ["ebp", "bfs", "methods"] },
    k_firms: { t: "Beteiligte Firmen", b: "Anzahl unterschiedlicher Zuschlagsempfänger (normalisierter Firmenname ohne Rechtsform) in den gefilterten Projekten. Arbeitsgemeinschaften (ARGE/INGE) zählen als eigene Firma.", s: ["simapNew", "simapArch"] },
    k_emach: { t: "Hinweis auf E-Baumaschinen / CO₂", b: "Anteil Projekte, deren Publikationstexte (Titel, Beschreibung, Zuschlagsbegründung) E-Baumaschinen, emissionsfreie Baustelle o.ä. erwähnen (DE/FR/IT-Stichwortliste). Zweite Zahl: Erwähnung von CO₂/Nachhaltigkeit allgemein. Untergrenze, da Ausschreibungsunterlagen (PDF) nicht ausgewertet sind.", s: ["methods"] },
    c_year: { t: "Zuschläge nach Jahr und Bauart", b: "Zuschlagssumme je Jahr (Projektjahr = Jahr des ersten Zuschlags). <b>Strukturbruch Juli 2024:</b> Wechsel auf die neue simap-Plattform und revidiertes Beschaffungsrecht (IVöB 2019/BöB) – mehr publizierte Verfahren und freihändige Zuschläge; Jahre davor und danach sind nicht direkt vergleichbar (siehe Quellen & Methoden).", s: ["simapNew", "simapArch", "methods"] },
    c_canton: { t: "Zuschläge nach Kanton", b: "Kanton des Ausführungsorts (geokodiert aus Ort/PLZ/Adresse; Rückfall: Sitz der Vergabestelle). Projekte ohne Ort sind ausgeschlossen.", s: ["methods"] },
    c_size: { t: "Grössenklassen", b: "Klassierung nach Zuschlagssumme des Projekts (Bau + Planung): S < 1 Mio, M 1–5, L 5–20, XL 20–100, XXL ≥ 100 Mio CHF. «ohne Wert»: nur Ausschreibung, Wettbewerb ohne Preis oder Zuschlag ohne Preisangabe.", s: ["methods"] },
    c_proc: { t: "Vergabeart (Vertragsart)", b: "Verfahrensart gemäss Publikation: offen, selektiv, Einladung, freihändig (Direktvergabe). Bei Projekten mit mehreren Verfahren: häufigste Art.", s: ["simapNew", "simapArch"] },
    c_firms: { t: "Wichtigste Firmen", b: "Firmen mit der höchsten Zuschlagssumme in den gefilterten Projekten (Rolle aus BKP/CPV/Stichworten abgeleitet). Klick öffnet die Firmenseite.", s: ["methods"] },
    c_roles: { t: "Planer und Gewerke", b: "Anzahl Projekte mit Zuschlag in der jeweiligen Rolle. Architektur: CPV 712*, BKP 291, Wettbewerbe. Elektroplanung: BKP 293, CPV 71323*/71314*, Stichworte. HLKSE-Planung: CPV 71321*. Elektroinstallation: BKP 23*, CPV 4531*. Netz/Ladeinfrastruktur: Trafostation, Kabelanlage, Ladestation u.ä.", s: ["methods"] },
    c_map: { t: "Karte der Projekte", b: "Punkt = Projekt, Fläche ∝ Zuschlagssumme, Farbe = Bauart. Lagegenauigkeit: GWR-Adresse > PLZ > Gemeinde. Projekte nur mit Vergabestellen-Ort werden nicht gezeichnet.", s: ["gwrMap", "methods"] },
    c_util: { t: "Energieversorger (Verteilnetzbetreiber)", b: "Netzbetreiber der Gemeinde des Projektstandorts gemäss ElCom-Tarifdaten 2026 (LINDAS). In Gemeinden mit mehreren Netzbetreibern werden alle genannt. Zusätzlich: «Versorger als Bauherr» = Vergabestelle ist ein EW/Energieversorger.", s: ["elcom"] },
    c_flex: { t: "Flex-Pool je Netzbetreiber", b: "Anzahl bewilligter (GSTAT 1002) und im Bau befindlicher (1003) Gebäude mit Geschossfläche ≥ Schwelle «mittel» je Verteilnetzbetreiber; davon «gross» ≥ zweite Schwelle. Optional inkl. projektiert (1001). Zuordnung Gebäude → Gemeinde (GWR) → Netzbetreiber (ElCom-Tarifdaten 2026); in 141 Gemeinden mit mehreren Betreibern wird der erstgenannte verwendet. Geschossfläche = Energiebezugsfläche oder Grundfläche × Geschosse. Kreis auf der Karte = Schwerpunkt aller Pool-Baustellen des Betreibers (kein Netzgebiet-Polygon). Der Kantonsfilter der Seite gilt.", s: ["gwr", "elcom"] },
    c_gwr: { t: "GWR-Gebäudestatus", b: "Gebäude im GWR mit Status projektiert (1001), bewilligt (1002), im Bau (1003) sowie fertiggestellt seit 2016 (1004 mit Baujahr ≥ 2016). Geschossfläche = Energiebezugsfläche (GEBF), wo vorhanden, sonst Grundfläche × Geschosse (GWR hat keine BGF); 61 Gebäude mit unplausibler Grundfläche (> 8'000 m² bei ≥ 6 Geschossen bzw. > 250'000 m²) ohne Fläche. Baukosten sind im öffentlichen GWR-Bezug nicht enthalten.", s: ["gwr", "gwrMap"] },
    c_val: { t: "Abdeckung im Vergleich zur BFS-Baustatistik", b: "Verhältnis der simap-Zuschlagssumme für Bauleistungen zu den BFS-Bauausgaben öffentlicher Auftraggeber im selben Jahr. Achtung: Zuschläge sind mehrjährige Vertragswerte, die BFS-Werte jährliche Ausgaben; die Quote zeigt die Grössenordnung der Abdeckung, nicht eine exakte Deckung.", s: ["bfs", "methods"] },
    c_month: { t: "Publikationen pro Monat und Quelle", b: "Kontrolle auf Lücken und Brüche. Archiv: alle Publikationen inkl. Ausschreibungen. Neue Plattform: neueste Publikation je Projekt (plus Lose) – deshalb weniger Ausschreibungen nach 7/2024.", s: ["simapNew", "simapArch"] },
    c_geo: { t: "Geokodierungs-Genauigkeit", b: "GWR-Adresse: Strasse+Nr. im Titel/Ort gefunden und im GWR-Eingangsregister gematcht. PLZ: Postleitzahl des Ausführungsorts. Gemeinde: Gemeinde-/Ortsname im Ort oder Titel. Vergabestelle: Rückfall auf Adresse der Vergabestelle (unsicher).", s: ["gwr", "methods"] },
  };
  EB.info = (id) => `<button class="info" data-info="${id}" aria-label="Info: ${EB.esc((EB.INFO[id] || {}).t || id)}">i</button>`;
  EB.openInfo = (id) => {
    const i = EB.INFO[id]; if (!i) return;
    const d = document.getElementById("infodlg");
    d.innerHTML = `<button class="iconbtn x" onclick="this.parentNode.classList.remove('open')">✕</button><h2>${i.t}</h2><p>${i.b}</p>
      <div class="src"><h3>Quellen</h3><ul>${(i.s || []).map((k) => `<li><a href="${S[k][1]}" target="_blank" rel="noopener">${S[k][0]}</a></li>`).join("")}</ul></div>`;
    d.classList.add("open");
  };
  EB.SRC = S;

  /* ---------------- data decoding */
  EB.projects = function () {
    if (EB._P) return EB._P;
    const P = window.PROJ, c = P.cols;
    const L = P.rows.map((r) => { const o = {}; for (let i = 0; i < c.length; i++) o[c[i]] = r[i]; return o; });
    L.forEach((p) => {
      p.authName = P.auth[p.auth]; p.munName = P.mun[p.mun]; p.dsoName = P.dso[p.dso];
      p.typeName = P.types[p.type]; p.sizeName = P.sizes[p.size]; p.procName = P.procs[p.proc];
      p.util = !!(p.flags & 1); p.grid = !!(p.flags & 2); p.emach = !!(p.flags & 4); p.co2m = !!(p.flags & 8); p.fw = !!(p.flags & 16); p.open = !!(p.flags & 32); p.hasGwr = !!(p.flags & 64);
    });
    EB._P = L; EB._PI = Object.fromEntries(L.map((p) => [p.id, p]));
    return L;
  };
  EB.firmName = (i) => window.PROJ.firm[i];
  EB.firms = function () {
    if (EB._F) return EB._F;
    const F = window.FIRMS; if (!F) return [];
    EB._F = F.rows.map((r) => { const o = {}; F.cols.forEach((k, i) => (o[k] = r[i])); return o; });
    EB._FN = {}; EB._F.forEach((f) => (EB._FN[f.name] = f));
    return EB._F;
  };

  /* ---------------- filters */
  const DEF = { y0: 2016, y1: 2026, cantons: [], dso: "", sizes: [], procs: [], types: [], roles: [], firm: "", nofw: true, onlyval: false, q: "", emach: false, co2m: false, util: false, grid: false };
  EB.DEF = DEF;
  EB.filters = Object.assign(JSON.parse(JSON.stringify(DEF)), EB.store.get("filters", {}));
  EB.saveFilters = () => EB.store.set("filters", EB.filters);
  EB.match = function (p, f) {
    f = f || EB.filters;
    if (p.year < f.y0 || p.year > f.y1) return false;
    if (f.cantons.length && !f.cantons.includes(p.canton)) return false;
    if (f.dso && !(p.dsoName || "").includes(f.dso)) return false;
    if (f.sizes.length && !f.sizes.includes(p.size)) return false;
    if (f.procs.length && !f.procs.includes(p.proc)) return false;
    if (f.types.length && !f.types.includes(p.type)) return false;
    if (f.nofw && p.fw) return false;
    if (f.onlyval && !p.value) return false;
    if (f.firm) { const set = EB._firmSet(f.firm); if (!set || !set.has(p.id)) return false; }
    if (f.roles && f.roles.length && !f.roles.some((r) => p.roles.includes(r))) return false;
    if (f.emach && !p.emach) return false;
    if (f.co2m && !p.co2m) return false;
    if (f.util && !p.util) return false;
    if (f.grid && !p.grid) return false;
    if (f.q) { const q = f.q.toLowerCase(); if (!(p.title.toLowerCase().includes(q) || (p.authName || "").toLowerCase().includes(q) || (p.munName || "").toLowerCase().includes(q))) return false; }
    return true;
  };
  EB._firmSet = function (name) {
    EB.firms();
    if (!EB._firmSets) EB._firmSets = {};
    if (EB._firmSets[name]) return EB._firmSets[name];
    const f = EB._FN[name]; if (!f) return null;
    return (EB._firmSets[name] = new Set(f.projects));
  };
  EB.filtered = () => EB.projects().filter((p) => EB.match(p));
  /* cross-filtering: each chart is computed with every filter except its own dimension, so the
     unselected categories stay visible (dimmed) and can be clicked to extend or change the selection */
  EB.filteredExcept = (...keys) => {
    const f = Object.assign({}, EB.filters);
    keys.forEach((k) => (f[k] = JSON.parse(JSON.stringify(DEF[k]))));
    return EB.projects().filter((p) => EB.match(p, f));
  };
  EB.apply = () => { EB.saveFilters(); if (EB._fbRender) EB._fbRender(); if (EB._onFilter) EB._onFilter(); };
  EB.toggleIn = (key, v, e) => {
    const a = EB.filters[key], i = a.indexOf(v);
    if (e && (e.native || e).shiftKey) { if (i >= 0) a.splice(i, 1); else a.push(v); }       // shift: multi-select
    else if (i >= 0 && a.length === 1) a.splice(0);                                         // click selected: clear
    else { a.splice(0); a.push(v); }                                                        // click: select only this
    EB.apply();
  };
  EB.toggleFlag = (k) => { EB.filters[k] = !EB.filters[k]; EB.apply(); };
  EB.setYear = (y, e) => {
    const f = EB.filters;
    if (e && (e.native || e).shiftKey) { if (y < f.y0) f.y0 = y; else f.y1 = y; }
    else if (f.y0 === y && f.y1 === y) { f.y0 = 2016; f.y1 = 2026; }
    else { f.y0 = f.y1 = y; }
    EB.apply();
  };
  EB.yearOn = (y) => y >= EB.filters.y0 && y <= EB.filters.y1;
  /* highlight helper: selected (or all when nothing selected) keep their colour, others are dimmed */
  EB.dim = (hex, on) => (on ? hex : hex.length === 7 ? hex + "38" : hex);
  EB.hint = '<span class="hint">Klick = filtern · Shift-Klick = mehrere</span>';

  EB.filterBar = function (el, onChange, opts) {
    opts = opts || {};
    const f = EB.filters;
    const P = window.PROJ;
    const dsoList = [...new Set(P.dso.flatMap((d) => (d || "").split(" | ")).filter(Boolean))].sort();
    const firmList = EB.firms().slice(0, 4000).map((x) => x.name);
    function render() {
      const yr = EB.YEARS.map((y) => {
        const cls = y === f.y0 || y === f.y1 ? "on" : y > f.y0 && y < f.y1 ? "inrange" : "";
        return `<button class="chip ${cls}" data-y="${y}">${y}</button>`;
      }).join("");
      const chips = (key, arr, labels) => arr.map((v, i) => `<button class="chip ${f[key].includes(i) ? "on" : ""}" data-k="${key}" data-v="${i}">${labels ? labels[i] : v}</button>`).join("");
      el.innerHTML = `
        <div class="fgroup years"><span class="flabel">Jahre</span>${yr}</div>
        <div class="fgroup"><span class="flabel">Kanton</span><div class="dd" id="ddC"><button class="chip ${f.cantons.length ? "on" : ""}" id="ddCb">${f.cantons.length ? f.cantons.join(", ") : "alle"} ▾</button>
          <div class="panel"><div class="cgrid">${CANTONS.map((c) => `<label><input type="checkbox" value="${c}" ${f.cantons.includes(c) ? "checked" : ""}>${c}</label>`).join("")}</div>
          <div style="margin-top:6px;display:flex;gap:6px"><button class="chip" id="cAll">keine Auswahl</button></div></div></div></div>
        <div class="fgroup"><span class="flabel">Versorger</span><input type="text" list="dsoL" id="fDso" placeholder="Netzbetreiber…" value="${EB.esc(f.dso)}" style="width:190px"><datalist id="dsoL">${dsoList.map((d) => `<option value="${EB.esc(d)}">`).join("")}</datalist></div>
        <div class="fgroup"><span class="flabel">Typ</span>${chips("types", P.types)}</div>
        <div class="fgroup"><span class="flabel">Grösse</span>${chips("sizes", P.sizes.map((s) => s.split(" ")[0] === "ohne" ? "ohne Wert" : s.split(" ")[0]), null)}</div>
        <div class="fgroup"><span class="flabel">Vergabeart</span>${chips("procs", P.procs.slice(0, 4), P.procs.slice(0, 4).map((p) => EB.PROC_LABEL[p]))}</div>
        <div class="fgroup"><span class="flabel">Firma</span><input type="text" list="firmL" id="fFirm" placeholder="Bau-/Planungsfirma…" value="${EB.esc(f.firm)}" style="width:210px"><datalist id="firmL">${firmList.map((d) => `<option value="${EB.esc(d)}">`).join("")}</datalist></div>
        ${opts.search ? `<div class="fgroup"><input type="search" id="fQ" placeholder="Suche Titel, Vergabestelle, Ort…" value="${EB.esc(f.q)}"></div>` : ""}
        <div class="fgroup"><span class="flabel">Rolle</span><div class="dd" id="ddR"><button class="chip ${f.roles.length ? "on" : ""}" id="ddRb">${f.roles.length ? f.roles.map((i) => P.role_label[P.roles[i]]).join(", ") : "alle"} ▾</button>
          <div class="panel">${P.roles.map((r, i) => `<label><input type="checkbox" value="${i}" ${f.roles.includes(i) ? "checked" : ""}>${P.role_label[r]}</label>`).join("")}</div></div></div>
        <div class="fgroup"><span class="flabel">Merkmale</span>${[["emach", "E-Maschinen"], ["co2m", "CO₂/Nachhaltigkeit"], ["util", "Versorger als Bauherr"], ["grid", "Netz/Ladeinfra"]].map(([k, l]) => `<button class="chip ${f[k] ? "on" : ""}" data-flag="${k}">${l}</button>`).join("")}</div>
        <label class="toggle"><input type="checkbox" id="fFw" ${f.nofw ? "checked" : ""}>Rahmenverträge ausschliessen</label>
        <label class="toggle"><input type="checkbox" id="fVal" ${f.onlyval ? "checked" : ""}>nur mit Zuschlagswert</label>
        <button class="chip" id="fReset">Zurücksetzen</button>
        <span class="fcount" id="fCount"></span>`;
      el.querySelectorAll("[data-y]").forEach((b) => (b.onclick = (e) => {
        const y = +b.dataset.y;
        if (e.shiftKey || (f._pick && f.y0 === f.y1)) { if (y < f.y0) f.y0 = y; else f.y1 = y; f._pick = false; }
        else if (f.y0 === y && f.y1 === y) { f.y0 = 2016; f.y1 = 2026; f._pick = false; }
        else { f.y0 = f.y1 = y; f._pick = true; }
        changed();
      }));
      el.querySelectorAll("[data-k]").forEach((b) => (b.onclick = () => {
        const k = b.dataset.k, v = +b.dataset.v, a = f[k];
        const i = a.indexOf(v); if (i >= 0) a.splice(i, 1); else a.push(v);
        changed();
      }));
      const dd = el.querySelector("#ddC");
      el.querySelector("#ddCb").onclick = (e) => { e.stopPropagation(); dd.classList.toggle("open"); };
      dd.querySelectorAll("input").forEach((i) => (i.onchange = () => { f.cantons = [...dd.querySelectorAll("input:checked")].map((x) => x.value); changed(false); el.querySelector("#ddCb").textContent = (f.cantons.length ? f.cantons.join(", ") : "alle") + " ▾"; el.querySelector("#ddCb").classList.toggle("on", !!f.cantons.length); }));
      el.querySelector("#cAll").onclick = () => { f.cantons = []; changed(); };
      el.querySelector("#fDso").onchange = (e) => { f.dso = e.target.value.trim(); changed(); };
      el.querySelector("#fFirm").onchange = (e) => { f.firm = e.target.value.trim(); changed(); };
      if (opts.search) { let t; el.querySelector("#fQ").oninput = (e) => { clearTimeout(t); t = setTimeout(() => { f.q = e.target.value.trim(); changed(false); }, 250); }; }
      el.querySelector("#fFw").onchange = (e) => { f.nofw = e.target.checked; changed(); };
      el.querySelector("#fVal").onchange = (e) => { f.onlyval = e.target.checked; changed(); };
      const ddr = el.querySelector("#ddR");
      el.querySelector("#ddRb").onclick = (e) => { e.stopPropagation(); ddr.classList.toggle("open"); };
      ddr.querySelectorAll("input").forEach((i) => (i.onchange = () => { f.roles = [...ddr.querySelectorAll("input:checked")].map((x) => +x.value); changed(false); el.querySelector("#ddRb").textContent = (f.roles.length ? f.roles.map((i) => P.role_label[P.roles[i]]).join(", ") : "alle") + " ▾"; }));
      el.querySelectorAll("[data-flag]").forEach((b) => (b.onclick = () => { f[b.dataset.flag] = !f[b.dataset.flag]; changed(); }));
      el.querySelector("#fReset").onclick = () => { Object.assign(f, JSON.parse(JSON.stringify(DEF))); changed(); };
    }
    function changed(rerender = true) { EB.saveFilters(); if (rerender) render(); onChange(); }
    render();
    EB._fbRender = render; EB._onFilter = onChange;
    EB.setCount = (n, tot) => { const c = el.querySelector("#fCount"); if (c) c.innerHTML = `<b>${EB.n0(n)}</b> von ${EB.n0(tot)} Projekten`; };
  };

  /* ---------------- charts (Chart.js) */
  EB.charts = {};
  EB.chartDefaults = function () {
    if (!window.Chart) return;
    const C = window.Chart;
    C.defaults.font.family = "Inter, system-ui, sans-serif"; C.defaults.font.size = 12;
    C.defaults.color = EB.css("--text-2");
    C.defaults.borderColor = EB.css("--grid");
    C.defaults.plugins.legend.labels.boxWidth = 10; C.defaults.plugins.legend.labels.boxHeight = 10;
    C.defaults.plugins.legend.labels.useBorderRadius = true; C.defaults.plugins.legend.labels.borderRadius = 3;
    C.defaults.plugins.tooltip.backgroundColor = EB.css("--surface"); C.defaults.plugins.tooltip.titleColor = EB.css("--text");
    C.defaults.plugins.tooltip.bodyColor = EB.css("--text-2"); C.defaults.plugins.tooltip.borderColor = EB.css("--border"); C.defaults.plugins.tooltip.borderWidth = 1;
    C.defaults.plugins.tooltip.padding = 9; C.defaults.plugins.tooltip.boxPadding = 4;
    C.defaults.maintainAspectRatio = false; C.defaults.animation = { duration: 250 };
  };
  EB.chart = function (id, cfg) {
    if (EB.charts[id]) EB.charts[id].destroy();
    const el = document.getElementById(id); if (!el || !window.Chart) return;
    if (cfg.options && cfg.options.onClick && !cfg.options.onHover)
      cfg.options.onHover = (e, els) => { e.native.target.style.cursor = els.length ? "pointer" : "default"; };
    EB.charts[id] = new Chart(el, cfg);
    return EB.charts[id];
  };
  EB.bar = (o) => Object.assign({ borderRadius: 4, borderSkipped: "start", maxBarThickness: 28, borderWidth: 0, categoryPercentage: 0.8, barPercentage: 0.9 }, o);
  EB.axisMoney = { ticks: { callback: (v) => EB.chf(v, true) }, grid: { color: () => EB.css("--grid") }, border: { display: false } };
  EB.axisPlain = { grid: { display: false }, border: { color: () => EB.css("--border") } };
  document.addEventListener("eb-theme", () => { EB.chartDefaults(); document.dispatchEvent(new Event("eb-redraw")); });

  /* ---------------- fast canvas point layer for Leaflet (100k points) */
  EB.PointLayer = function (L) {
    return L.Layer.extend({
      initialize(opts) { this.pts = []; this.opts = opts || {}; },
      setPoints(pts) { this.pts = pts; this._draw(); },
      onAdd(map) {
        this._map = map;
        const c = (this._c = L.DomUtil.create("canvas", "leaflet-zoom-animated"));
        c.style.pointerEvents = "none";
        map.getPanes().overlayPane.appendChild(c);
        map.on("moveend zoomend resize", this._draw, this);
        map.on("click", this._click, this);
        map.on("mousemove", this._hover, this);
        this._draw();
      },
      onRemove(map) { this._c.remove(); map.off("moveend zoomend resize", this._draw, this); map.off("click", this._click, this); map.off("mousemove", this._hover, this); },
      _draw() {
        if (!this._map) return;
        const sel = this._sel;
        const m = this._map, sz = m.getSize(), c = this._c, dpr = window.devicePixelRatio || 1;
        c.width = sz.x * dpr; c.height = sz.y * dpr; c.style.width = sz.x + "px"; c.style.height = sz.y + "px";
        L.DomUtil.setPosition(c, m.containerPointToLayerPoint([0, 0]));
        const ctx = c.getContext("2d"); ctx.scale(dpr, dpr);
        const b = m.getBounds().pad(0.05), ring = EB.css("--surface");
        this._scr = [];
        const z = m.getZoom(), zs = this.opts.zoomScale ? Math.max(0.6, Math.min(2.2, (z - 6) / 3)) : 1;
        for (const p of this.pts) {
          if (!b.contains([p.lat, p.lon])) continue;
          const pt = m.latLngToContainerPoint([p.lat, p.lon]);
          const r = (p.r || 3) * zs;
          ctx.beginPath(); ctx.arc(pt.x, pt.y, r, 0, 6.2832);
          ctx.fillStyle = p.color; ctx.globalAlpha = p.alpha || 0.75; ctx.fill();
          if (r >= 4) { ctx.globalAlpha = 1; ctx.lineWidth = 1; ctx.strokeStyle = ring; ctx.stroke(); }
          this._scr.push([pt.x, pt.y, Math.max(r, 5), p]);
          if (sel && p === sel) { ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(pt.x, pt.y, r + 4, 0, 6.2832); ctx.lineWidth = 2.5; ctx.strokeStyle = EB.css("--text"); ctx.stroke(); }
        }
        ctx.globalAlpha = 1;
      },
      _find(e) {
        const x = e.containerPoint.x, y = e.containerPoint.y; let best = null, bd = 1e9;
        for (const s of this._scr || []) { const d = (s[0] - x) ** 2 + (s[1] - y) ** 2; if (d < s[2] * s[2] && d < bd) { bd = d; best = s[3]; } }
        return best;
      },
      _click(e) {
        const p = this._find(e); if (!p) return;
        if (this.opts.card) {
          this._sel = p; this._draw();
          const m = this._map;
          const pop = L.popup({ className: "eb-pop", maxWidth: 390, minWidth: 340, autoPanPadding: [24, 24], offset: [0, -4] })
            .setLatLng([p.lat, p.lon]).setContent(this.opts.card(p)).openOn(m);
          const el = pop.getElement();
          const z = el && el.querySelector("[data-zoom]");
          if (z) z.onclick = (ev) => { ev.preventDefault(); m.flyTo([p.lat, p.lon], Math.max(m.getZoom(), 17), { duration: 0.7 }); };
          m.once("popupclose", () => { this._sel = null; this._draw(); });
        } else if (this.opts.onClick) this.opts.onClick(p, e);
      },
      _hover(e) {
        const p = this._find(e), tt = document.getElementById("tt");
        this._map.getContainer().style.cursor = p ? "pointer" : "";
        if (p && this.opts.tip) { tt.innerHTML = this.opts.tip(p) + (this.opts.card ? '<div class="tt-hint">Klick: Details & Links</div>' : ""); tt.style.display = "block"; tt.style.left = e.originalEvent.clientX + 14 + "px"; tt.style.top = e.originalEvent.clientY + 10 + "px"; }
        else tt.style.display = "none";
      },
    });
  };
  /* one map style for all pages: grey swisstopo base, zoom buttons, Swiss home button, metric scale, scroll-zoom */
  EB.CH_BOUNDS = [[45.82, 5.96], [47.81, 10.49]];
  EB.CH_ICON = `<svg viewBox="0 0 24 15.9" width="20" height="14" aria-hidden="true"><path d="M1.6 10.6L2.0 9.9L1.8 9.6L3.5 8.3L3.4 7.2L4.8 6.3L4.7 6.1L5.9 5.0L5.9 4.7L6.4 4.4L6.2 4.1L5.6 4.2L6.2 3.5L6.1 3.2L7.1 3.2L7.0 3.6L7.3 3.8L8.1 3.7L8.3 3.4L8.2 3.2L8.5 3.3L8.7 3.0L8.5 2.9L8.9 2.6L9.4 2.5L9.4 2.7L9.2 2.8L9.4 3.0L10.1 2.6L10.4 2.6L10.6 2.9L11.3 2.8L11.9 2.3L12.5 2.7L13.1 2.7L13.3 2.2L13.7 2.5L13.9 2.1L13.6 2.0L13.1 2.2L12.8 2.0L13.2 1.3L13.6 1.2L13.6 1.0L13.9 1.3L14.0 1.0L14.3 1.3L14.3 1.8L14.6 1.9L14.5 1.6L14.7 1.5L15.1 2.1L15.7 1.8L16.9 2.0L18.3 2.8L18.5 3.3L18.8 3.4L18.9 3.9L18.2 4.7L18.0 5.3L18.2 5.9L18.0 6.2L19.0 6.1L19.9 6.4L20.0 7.0L20.6 7.2L21.1 7.6L21.7 7.4L21.7 7.0L22.1 7.0L22.4 6.5L22.9 6.9L22.7 8.2L22.4 8.7L22.6 9.0L23.0 9.1L22.9 9.6L22.1 9.6L21.8 9.5L21.8 9.0L21.1 9.2L20.9 9.7L20.9 10.4L21.5 10.6L21.2 11.1L21.6 11.7L21.4 11.9L20.9 11.9L21.0 11.7L20.7 11.5L20.5 10.9L19.6 11.2L19.4 11.1L19.3 11.5L18.5 11.5L18.1 11.0L18.0 10.0L17.8 10.3L17.6 10.0L17.2 10.1L17.0 10.6L17.3 11.3L17.0 12.0L15.9 13.4L16.0 13.7L15.8 13.9L16.3 14.3L16.0 14.9L15.5 14.9L15.6 14.6L15.4 14.0L14.8 13.8L15.1 13.1L14.6 12.8L14.5 13.0L14.0 12.8L13.6 12.2L13.1 12.0L13.1 10.5L12.4 10.7L12.5 11.1L11.4 11.9L11.7 12.7L11.1 13.0L11.0 13.6L10.5 13.8L10.4 14.3L9.6 14.3L9.3 13.9L8.8 13.8L8.7 14.0L8.0 14.5L7.5 14.3L7.0 14.7L6.8 14.6L6.6 14.7L5.8 13.3L5.5 13.4L5.6 12.9L5.1 12.8L5.4 11.8L5.0 11.2L5.2 10.7L3.8 10.5L2.9 10.9L2.3 11.5L2.5 11.9L2.7 11.9L2.7 12.1L1.9 12.7L1.0 12.8L1.1 12.2L1.8 11.9L1.7 11.7L2.1 11.1Z" fill="currentColor" stroke="currentColor" stroke-width=".6" stroke-linejoin="round"/></svg>`;
  EB.baseMap = function (id, opts) {
    opts = Object.assign({ preferCanvas: true, zoomSnap: 0.5, zoomDelta: 0.5, wheelPxPerZoomLevel: 90, scrollWheelZoom: true, minZoom: 7, maxZoom: 19,
      maxBounds: [[44.9, 4.6], [48.7, 11.9]], maxBoundsViscosity: 0.8 }, opts || {});
    const map = L.map(id, opts);
    map.fitBounds(EB.CH_BOUNDS);
    L.tileLayer("https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-grau/default/current/3857/{z}/{x}/{y}.jpeg", {
      maxZoom: 19, maxNativeZoom: 18, attribution: '© <a href="https://www.swisstopo.admin.ch" target="_blank" rel="noopener">swisstopo</a>',
    }).addTo(map);
    const Home = L.Control.extend({
      options: { position: "topleft" },
      onAdd() {
        const b = L.DomUtil.create("a", "leaflet-bar eb-home");
        b.href = "#"; b.title = "Ganze Schweiz anzeigen"; b.setAttribute("role", "button"); b.setAttribute("aria-label", "Ganze Schweiz anzeigen");
        b.innerHTML = EB.CH_ICON;
        L.DomEvent.on(b, "click", (e) => { L.DomEvent.stop(e); map.flyToBounds(EB.CH_BOUNDS, { duration: 0.6 }); });
        L.DomEvent.disableClickPropagation(b);
        return b;
      },
    });
    new Home().addTo(map);
    L.control.scale({ imperial: false, position: "bottomleft", maxWidth: 110 }).addTo(map);
    map.getContainer().classList.add("eb-map");
    return map;
  };
  EB.gwrWms = () => L.tileLayer.wms("https://wms.geo.admin.ch/", { layers: "ch.bfs.gebaeude_wohnungs_register", format: "image/png", transparent: true, version: "1.3.0", minZoom: 13, attribution: "GWR © BFS" });

  /* ---------------- detail shards (lazy, file:// friendly) */
  EB._shards = {}; EB._shardWait = {};
  window.__detail = (k, data) => { EB._shards[k] = data; (EB._shardWait[k] || []).forEach((f) => f(data)); EB._shardWait[k] = []; };
  EB.detail = (p) => new Promise((res) => {
    const k = p.shard;
    if (EB._shards[k]) return res(EB._shards[k][p.id]);
    (EB._shardWait[k] = EB._shardWait[k] || []).push((d) => res(d[p.id]));
    if (EB._shardWait[k].length === 1) { const s = document.createElement("script"); s.src = `data/detail/d${String(k).padStart(2, "0")}.js`; document.head.append(s); }
  });

  /* ---------------- list → map drawer (lean slide-over) */
  // items: [{lat, lon, label, sub, value, href, color}]
  EB.mapBtn = (id) => `<button class="mapbtn" id="${id}" title="Liste auf der Karte zeigen"><svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M8 1.5a4.5 4.5 0 0 0-4.5 4.5c0 3.2 4.5 8.5 4.5 8.5s4.5-5.3 4.5-8.5A4.5 4.5 0 0 0 8 1.5Zm0 6.2a1.7 1.7 0 1 1 0-3.4 1.7 1.7 0 0 1 0 3.4Z" fill="currentColor"/></svg>Karte</button>`;
  EB.listMap = function (title, items, opts) {
    opts = opts || {};
    let d = document.getElementById("lmDrawer");
    if (!d) {
      d = document.createElement("aside"); d.id = "lmDrawer"; d.className = "lm"; d.setAttribute("role", "dialog"); d.setAttribute("aria-label", "Liste auf Karte");
      d.innerHTML = `<div class="lm-hd"><div><div class="lm-t"></div><div class="lm-s"></div></div><button class="iconbtn" id="lmClose" aria-label="Schliessen">✕</button></div>
        <div id="lmMap" class="lm-map"></div><ol class="lm-list"></ol>`;
      document.body.append(d);
      d.querySelector("#lmClose").onclick = () => d.classList.remove("open");
      document.addEventListener("keydown", (e) => { if (e.key === "Escape") d.classList.remove("open"); });
    }
    const pts = items.filter((i) => i.lat && i.lon);
    d.querySelector(".lm-t").textContent = title;
    d.querySelector(".lm-s").textContent = `${pts.length} von ${items.length} Einträgen verortet` + (opts.note ? " · " + opts.note : "");
    d.classList.add("open");
    if (!EB._lm) { EB._lm = EB.baseMap("lmMap", { zoomControl: true }); EB._lmLayer = L.layerGroup().addTo(EB._lm); }
    const map = EB._lm; setTimeout(() => map.invalidateSize(), 220);
    EB._lmLayer.clearLayers();
    const acc = EB.css("--accent"), ring = EB.css("--surface");
    const mk = pts.map((it, i) => {
      const n = items.indexOf(it) + 1;
      const m = L.marker([it.lat, it.lon], { icon: L.divIcon({ className: "", html: `<div class="lm-pin" style="background:${it.color || acc};border-color:${ring}">${n}</div>`, iconSize: [22, 22], iconAnchor: [11, 11] }), riseOnHover: true })
        .bindTooltip(`<b>${EB.esc(it.label)}</b>${it.sub ? "<br>" + EB.esc(it.sub) : ""}${it.value ? "<br>" + it.value : ""}`, { direction: "top", offset: [0, -10] });
      if (it.href) m.on("click", () => (it.blank ? window.open(it.href, "_blank") : (location.href = it.href)));
      m.addTo(EB._lmLayer); it._m = m; return m;
    });
    if (mk.length) map.fitBounds(L.featureGroup(mk).getBounds().pad(0.15), { maxZoom: 15 });
    const ol = d.querySelector(".lm-list");
    ol.innerHTML = items.map((it, i) => `<li data-i="${i}" class="${it.lat ? "" : "nogeo"}"><span class="lm-n">${i + 1}</span><span class="lm-l"><b>${EB.esc(it.label)}</b><span>${EB.esc(it.sub || "")}</span></span><span class="lm-v">${it.value || ""}</span></li>`).join("");
    ol.querySelectorAll("li").forEach((li) => {
      const it = items[+li.dataset.i];
      li.onmouseenter = () => { if (it._m) { it._m.openTooltip(); it._m.getElement() && it._m.getElement().firstChild.classList.add("hot"); } };
      li.onmouseleave = () => { if (it._m) { it._m.closeTooltip(); it._m.getElement() && it._m.getElement().firstChild.classList.remove("hot"); } };
      li.onclick = () => { if (it.lat) map.setView([it.lat, it.lon], Math.max(map.getZoom(), 14)); };
      li.ondblclick = () => { if (it.href) location.href = it.href; };
    });
  };

  /* ---------------- link helpers */
  EB.lnk = {
    gwrMap: (lat, lon) => `https://map.geo.admin.ch/#/map?lang=de&z=11&layers=ch.bfs.gebaeude_wohnungs_register&bgLayer=ch.swisstopo.swissimage&swisssearch=${lat.toFixed(5)},${lon.toFixed(5)}`,
    gwrRec: (egid) => `https://api3.geo.admin.ch/rest/services/ech/MapServer/ch.bfs.gebaeude_wohnungs_register/${egid}_0/extendedHtmlPopup?lang=de`,
    // the two links offered by the official GWR popup on map.geo.admin.ch
    gwrInfo: (egid) => `https://api3.geo.admin.ch/rest/services/ech/MapServer/ch.bfs.gebaeude_wohnungs_register/${egid}_0/extendedHtmlPopup?lang=de`,
    gwrObj: (egid) => `https://map.geo.admin.ch/?ch.bfs.gebaeude_wohnungs_register=${egid}_0&lang=de&topic=ech&layers=ch.bfs.gebaeude_wohnungs_register`,
    elcom: (bfs) => `https://www.strompreis.elcom.admin.ch/municipality/${bfs}`,
    zefix: (name) => `https://www.zefix.ch/de/search/entity/list?mainSearch=${encodeURIComponent(name.replace(/\b(ARGE|INGE)\b/gi, "").trim())}`,
    web: (name) => `https://duckduckgo.com/?q=${encodeURIComponent(name + " Referenzen")}`,
    proj: (id) => `projects.html#${id}`,
    firm: (name) => `firms.html#${encodeURIComponent(name)}`,
  };

  /* ---------------- info cards for map popups (one design for GWR buildings and simap projects) */
  const ICON_EXT = '<svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M4.5 2H2v8h8V7.5M7 2h3v3M10 2 5.5 6.5" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>';
  const ICON_ZOOM = '<svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><circle cx="5" cy="5" r="3.3" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M7.5 7.5 10.5 10.5M3.5 5h3M5 3.5v3" stroke="currentColor" stroke-width="1.3"/></svg>';
  EB.btn = (label, href, kind) => kind === "zoom"
    ? `<a href="#" class="pbtn" data-zoom="1">${ICON_ZOOM}${label}</a>`
    : `<a href="${href}" class="pbtn${kind === "primary" ? " primary" : ""}" ${kind === "internal" || kind === "primary" ? "" : 'target="_blank" rel="noopener"'}>${label}${kind === "internal" || kind === "primary" ? " →" : ICON_EXT}</a>`;
  const row = (k, v) => (v === null || v === undefined || v === "" || v === "–" ? "" : `<dt>${k}</dt><dd>${v}</dd>`);
  EB.gwrCard = function (g, o) {
    o = o || {};
    const stCol = ["--gwr-proj", "--gwr-bew", "--gwr-bau", "--gwr-done"].map(EB.css)[g.st];
    return `<div class="pcard">
      <div class="pc-top"><span class="pc-status" style="--c:${stCol}">${EB.esc(o.status || "")}</span><span class="pc-id">EGID ${g.egid}</span></div>
      <div class="pc-title">${EB.esc(g.addr || "Adresse nicht erfasst")}</div>
      <div class="pc-sub">${EB.esc(g.munName || "")} ${EB.esc(g.canton || "")}</div>
      <dl class="pc-kv">${row("Kategorie", EB.esc(o.klass || ""))}${row("Geschossfläche", g.fa ? EB.n0(g.fa) + " m²" : "")}${row("Grundfläche", g.area ? EB.n0(g.area) + " m²" + (g.floors ? ` · ${g.floors} Geschosse` : "") : "")}
        ${row("Wohnungen", g.dw || "")}${row("Baujahr", g.year || "")}${row("Netzbetreiber", EB.esc(g.dso || ""))}</dl>
      <div class="pc-btns">${EB.btn("Zoomen", "", "zoom")}${EB.btn("Objekt auf Karte", EB.lnk.gwrObj(g.egid))}${EB.btn("GWR-Zusatzinformation", EB.lnk.gwrInfo(g.egid))}</div>
      <div class="pc-src">Quelle: BFS, Gebäude- und Wohnungsregister</div></div>`;
  };
  EB.projCard = function (p) {
    const P = window.PROJ, col = EB.css(EB.TYPE_COLOR[p.type]);
    const firms = (p.con || []).slice(0, 3).map((i) => EB.esc(EB.firmName(i))).join(", ");
    const arch = (p.arch || []).slice(0, 2).map((i) => EB.esc(EB.firmName(i))).join(", ");
    return `<div class="pcard">
      <div class="pc-top"><span class="pc-status" style="--c:${col}">${EB.esc(p.typeName)}</span><span class="pc-id">${EB.esc(p.sizeName)} · ${p.y0 === p.y1 ? p.year : p.y0 + "–" + p.y1}</span></div>
      <div class="pc-title">${EB.esc(p.title)}</div>
      <div class="pc-sub">${EB.esc(p.authName)}</div>
      <dl class="pc-kv">${row("Ort", EB.esc((p.munName || "–") + " " + (p.canton || "")))}${row("Zuschläge", p.value ? EB.chf(p.value) : "")}${row("Vergabeart", EB.PROC_LABEL[P.procs[p.proc]] || "")}
        ${row("Bauunternehmen", firms)}${row("Architektur", arch)}${row("Netzbetreiber", EB.esc(p.dsoName || ""))}${row("CO₂ (Schätzung)", p.co2 ? EB.n0(p.co2) + " t" : "")}</dl>
      <div class="pc-btns">${EB.btn("Projektdetails", EB.lnk.proj(p.id), "primary")}${EB.btn("Zoomen", "", "zoom")}${EB.btn("GWR-Karte am Ort", EB.lnk.gwrMap(p.lat, p.lon))}</div>
      <div class="pc-src">Quelle: simap.ch · ${p.nn} Publikationen</div></div>`;
  };
})();
