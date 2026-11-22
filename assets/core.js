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
    bfsPop: ["BFS STATPOP – ständige Wohnbevölkerung nach Gemeinde 2025 (px-x-0102010000_101)", "https://www.pxweb.bfs.admin.ch/pxweb/de/px-x-0102010000_101/"],
    bfsGeo: ["BFS GEOSTAT – generalisierte Gemeindegrenzen 2025 (Hintergrundkarte)", "https://www.bfs.admin.ch/bfs/de/home/dienstleistungen/geostat/geodaten-bundesstatistik/administrative-grenzen/generalisierte-gemeindegrenzen.html"],
    swisstopo: ["swisstopo – Landeskarte grau (Detail ab Zoom 12)", "https://www.swisstopo.admin.ch"],
  };
  EB.INFO = {
    k_projects: { t: "Baustellen-Projekte", b: "Anzahl Projekte nach Filter. Ein <b>Projekt</b> ist eine Gruppe von simap-Publikationen (Ausschreibung, Zuschlag, Lose/BKP-Gewerke, Planer- und Wettbewerbsverfahren), die zum selben Bauvorhaben gehören. Gruppierung: gleiche simap-Projekt-ID, gleicher Basistitel nach Entfernen von BKP/NPK/Los-Angaben bei gleicher Vergabestelle, gemeinsame Programmnummern (ASTRA MP-, BBL b-, Stadt Zürich BAV-Nummern) sowie unscharfer Titelabgleich innerhalb der Vergabestelle (Jaccard ≥ 0.6, ≥ 2 gemeinsame Kennwörter).", s: ["simapNew", "simapArch", "methods"] },
    k_value: { t: "Zuschlagssumme", b: "Summe der in Zuschlagspublikationen genannten Preise (CHF, wie publiziert, MWST-Status uneinheitlich) für Bau- und Planungsleistungen. Doppelte Sprachversionen und identische Firmen-/Preis-Wiederholungen sind entfernt. Zuschläge ohne Preisangabe zählen 0. Es handelt sich um <b>Vertragswerte zum Zuschlagszeitpunkt</b>, nicht um jährliche Ausgaben.", s: ["simapNew", "simapArch", "methods"] },
    k_co2: { t: "CO₂ Baumaschinen (Schätzung)", b: "Grobe Schätzung der direkten Emissionen von Baumaschinen auf der Baustelle: Zuschlagswert Bauleistungen × <b>6.85 t CO₂e pro Mio CHF</b>. Faktor = 464'067 t CO₂e Baumaschinen 2023 (BAFU, zitiert in EBP 2025 S.14) ÷ CHF 67.8 Mrd Bauausgaben 2023 (BFS). Annahme: Emissionen proportional zum Bauvolumen; Tiefbau liegt real eher darüber, Ausbaugewerke darunter. Nicht enthalten: Transportlogistik (in den Piloten 56–70 % der Restemissionen) und graue Energie der Materialien.", s: ["ebp", "bafuGhg", "bfs", "methods"] },
    k_elec: { t: "Strombedarf bei Elektrifizierung (Schätzung)", b: "Indikativer Strombedarf, falls die Baumaschinen elektrisch betrieben würden: Zuschlagswert Bauleistungen × <b>7.4 MWh pro Mio CHF</b>. Faktor = > 500 GWh/a Strombedarf Baumaschinen 2050 im ZERO-E-Szenario (EBP 2025 S.10) ÷ CHF 67.8 Mrd Bauausgaben 2023. Größenordnung für die Netzplanung, keine Lastspitze.", s: ["ebp", "bfs", "methods"] },
    k_firms: { t: "Beteiligte Firmen", b: "Anzahl unterschiedlicher Zuschlagsempfänger (normalisierter Firmenname ohne Rechtsform) in den gefilterten Projekten. Arbeitsgemeinschaften (ARGE/INGE) zählen als eigene Firma.", s: ["simapNew", "simapArch"] },
    k_emach: { t: "Hinweis auf E-Baumaschinen / CO₂", b: "Anteil Projekte, deren Publikationstexte (Titel, Beschreibung, Zuschlagsbegründung) E-Baumaschinen, emissionsfreie Baustelle o.ä. erwähnen (DE/FR/IT-Stichwortliste). Zweite Zahl: Erwähnung von CO₂/Nachhaltigkeit allgemein. Untergrenze, da Ausschreibungsunterlagen (PDF) nicht ausgewertet sind.", s: ["simapNew", "simapArch", "methods"] },
    c_year: { t: "Zuschläge nach Jahr und Bauart", b: "Zuschlagssumme je Jahr (Projektjahr = Jahr des ersten Zuschlags). <b>Strukturbruch Juli 2024:</b> Wechsel auf die neue simap-Plattform und revidiertes Beschaffungsrecht (IVöB 2019/BöB) – mehr publizierte Verfahren und freihändige Zuschläge; Jahre davor und danach sind nicht direkt vergleichbar (siehe Quellen & Methoden).", s: ["simapNew", "simapArch", "methods"] },
    c_canton: { t: "Zuschläge nach Kanton", b: "Kanton des Ausführungsorts (geokodiert aus Ort/PLZ/Adresse; Rückfall: Sitz der Vergabestelle). Projekte ohne Ort sind ausgeschlossen.", s: ["simapNew", "simapArch", "gwr", "methods"] },
    c_size: { t: "Grössenklassen", b: "Klassierung nach Zuschlagssumme des Projekts (Bau + Planung): S < 1 Mio, M 1–5, L 5–20, XL 20–100, XXL ≥ 100 Mio CHF. «ohne Wert»: nur Ausschreibung, Wettbewerb ohne Preis oder Zuschlag ohne Preisangabe.", s: ["simapNew", "simapArch", "methods"] },
    c_proc: { t: "Vergabeart (Vertragsart)", b: "Verfahrensart gemäss Publikation: offen, selektiv, Einladung, freihändig (Direktvergabe). Bei Projekten mit mehreren Verfahren: häufigste Art.", s: ["simapNew", "simapArch"] },
    c_firms: { t: "Wichtigste Firmen", b: "Firmen mit der höchsten Zuschlagssumme in den gefilterten Projekten (Rolle aus BKP/CPV/Stichworten abgeleitet). Klick öffnet die Firmenseite.", s: ["simapNew", "simapArch", "methods"] },
    c_roles: { t: "Planer und Gewerke", b: "Anzahl Projekte mit Zuschlag in der jeweiligen Rolle. Architektur: CPV 712*, BKP 291, Wettbewerbe. Elektroplanung: BKP 293, CPV 71323*/71314*, Stichworte. HLKSE-Planung: CPV 71321*. Elektroinstallation: BKP 23*, CPV 4531*. Netz/Ladeinfrastruktur: Trafostation, Kabelanlage, Ladestation u.ä.", s: ["simapNew", "simapArch", "methods"] },
    c_map: { t: "Karte der Projekte", b: "Punkt = Projekt, Fläche ∝ Zuschlagssumme, Farbe = Bauart. Lagegenauigkeit: GWR-Adresse > PLZ > Gemeinde. Projekte nur mit Vergabestellen-Ort werden nicht gezeichnet.", s: ["simapNew", "simapArch", "gwr", "bfsGeo", "swisstopo", "methods"] },
    c_util: { t: "Energieversorger (Verteilnetzbetreiber)", b: "Netzbetreiber der Gemeinde des Projektstandorts gemäss ElCom-Tarifdaten 2026 (LINDAS). In Gemeinden mit mehreren Netzbetreibern werden alle genannt. Zusätzlich: «Versorger als Bauherr» = Vergabestelle ist ein EW/Energieversorger.", s: ["elcom", "simapNew", "simapArch"] },
    c_flex: { t: "Flex-Pool je Netzbetreiber", b: "Anzahl bewilligter (GSTAT 1002) und im Bau befindlicher (1003) Gebäude mit Geschossfläche ≥ Schwelle «mittel» je Verteilnetzbetreiber; davon «gross» ≥ zweite Schwelle. Optional inkl. projektiert (1001). Zuordnung Gebäude → Gemeinde (GWR) → Netzbetreiber (ElCom-Tarifdaten 2026); in 141 Gemeinden mit mehreren Betreibern wird der erstgenannte verwendet. Geschossfläche = Energiebezugsfläche oder Grundfläche × Geschosse. Kreis auf der Karte = Schwerpunkt aller Pool-Baustellen des Betreibers. <b>Netzgebiet</b> (orange Umrandung beim Überfahren oder nach Auswahl): Vereinigung aller Gemeinden, die der Betreiber laut ElCom 2026 versorgt, auf den generalisierten Gemeindegrenzen 2025 (BFS GEOSTAT). Gemeinden mit mehreren Netzbetreibern werden voll eingerechnet; die tatsächliche Grenze verläuft dort innerhalb der Gemeinde. 5 der 2’123 ElCom-Gemeinden (Fusionen 2026) fehlen in den Grenzen 2025. Hinweis: Eine Bilanzgruppe (Energiehandel) ist nicht dasselbe wie das Netzgebiet; öffentliche Perimeter von Bilanzgruppen gibt es nicht, das Netzgebiet ist die beste verfügbare räumliche Annäherung. Der Kantonsfilter der Seite gilt.", s: ["gwr", "elcom", "bfsGeo", "bfsPop"] },
    c_gwr: { t: "GWR-Gebäudestatus", b: "Gebäude im GWR mit Status projektiert (1001), bewilligt (1002), im Bau (1003) sowie fertiggestellt seit 2016 (1004 mit Baujahr ≥ 2016). Geschossfläche = Energiebezugsfläche (GEBF), wo vorhanden, sonst Grundfläche × Geschosse (GWR hat keine BGF); 61 Gebäude mit unplausibler Grundfläche (> 8'000 m² bei ≥ 6 Geschossen bzw. > 250'000 m²) ohne Fläche. Baukosten sind im öffentlichen GWR-Bezug nicht enthalten. <b>simap-Verknüpfung</b> (Ring um den Punkt, Filter «simap»): <i>sicher</i> = gleiche Adresse (Strasse + Nr.) in Ausschreibung und GWR; <i>Parzelle</i> = Parzellen-Nr. bzw. EGRID aus der Ausschreibung in derselben Gemeinde (EGID kommt in simap-Texten nicht vor); <i>wahrscheinlich</i> = Strassenname im Titel/Ausführungsort, ohne Tief-/Leitungsbau; <i>möglich</i> = gleiche Gemeinde und passender öffentlicher Gebäudetyp (Schule, Spital, Sporthalle …), max. 2 Kandidaten. Nur «sicher» und «Parzelle» sind belastbar; die übrigen Stufen sind Hinweise zur Prüfung.", s: ["gwr", "gwrMap", "elcom", "bfsGeo"] },
    c_val: { t: "Abdeckung im Vergleich zur BFS-Baustatistik", b: "Verhältnis der simap-Zuschlagssumme für Bauleistungen zu den BFS-Bauausgaben öffentlicher Auftraggeber im selben Jahr. Achtung: Zuschläge sind mehrjährige Vertragswerte, die BFS-Werte jährliche Ausgaben; die Quote zeigt die Grössenordnung der Abdeckung, nicht eine exakte Deckung.", s: ["bfs", "simapNew", "simapArch", "methods"] },
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
  const DEF = { y0: 2016, y1: 2026, cantons: [], muns: [], dso: "", sizes: [], procs: [], types: [], roles: [], firm: "", nofw: true, onlyval: false, q: "", emach: false, co2m: false, util: false, grid: false };
  EB.DEF = DEF;
  EB.filters = Object.assign(JSON.parse(JSON.stringify(DEF)), EB.store.get("filters", {}));
  EB.saveFilters = () => EB.store.set("filters", EB.filters);
  EB.match = function (p, f) {
    f = f || EB.filters;
    if (p.year < f.y0 || p.year > f.y1) return false;
    if (f.cantons.length && !f.cantons.includes(p.canton)) return false;
    if (f.muns && f.muns.length && !f.muns.includes(p.munName + "|" + p.canton)) return false;
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
    if (f.q) { const q = f.q.toLowerCase(); if (!(p.title.toLowerCase().includes(q) || (p.authName || "").toLowerCase().includes(q))) return false; }
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
  EB.dim = (hex, on) => (on ? hex : hex.length === 7 ? hex + "66" : hex);   // deselected = 40 % opacity, still readable
  EB.hint = '<span class="hint">Klick = filtern · Shift-Klick = mehrere</span>';

  EB.filterBar = function (el, onChange, opts) {
    opts = opts || {};
    const f = EB.filters;
    const P = window.PROJ;
    const dsoList = [...new Set(P.dso.flatMap((d) => (d || "").split(" | ")).filter(Boolean))].sort();
    const firmList = EB.firms().slice(0, 4000).map((x) => x.name);
    const MUNS = [...new Set(EB.projects().filter((p) => p.munName && p.canton).map((p) => p.munName + "|" + p.canton))].sort((a, b) => a.localeCompare(b, "de"));
    const munOptions = () => MUNS.filter((m) => !f.cantons.length || f.cantons.includes(m.split("|")[1])).map((m) => { const [n, k] = m.split("|"); return `<option value="${EB.esc(n)} (${k})">`; }).join("");
    const dropMunsOutside = () => {
      if (!f.cantons.length || !f.muns.length) return;
      const out = f.muns.filter((m) => !f.cantons.includes(m.split("|")[1]));
      if (out.length) { f.muns = f.muns.filter((m) => !out.includes(m)); EB.toast(`Gemeinde-Filter ${out.map((m) => m.split("|")[0]).join(", ")} entfernt – liegt nicht im gewählten Kanton`); }
    };
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
        <div class="fgroup"><span class="flabel">Gemeinde</span>${(f.muns || []).map((m) => { const [n, k] = m.split("|"); return `<button class="chip on" data-mun="${EB.esc(m)}" title="Entfernen">${EB.armMun(n, k, 14)}${EB.esc(n)} (${k}) ✕</button>`; }).join("")}
          <input type="text" list="munL" id="fMun" placeholder="${f.muns && f.muns.length ? "+ weitere…" : "Gemeinde…"}" style="width:150px"><datalist id="munL">${munOptions()}</datalist></div>
        <div class="fgroup"><span class="flabel">Versorger</span><input type="text" list="dsoL" id="fDso" placeholder="Netzbetreiber…" value="${EB.esc(f.dso)}" style="width:190px"><datalist id="dsoL">${dsoList.map((d) => `<option value="${EB.esc(d)}">`).join("")}</datalist></div>
        <div class="fgroup"><span class="flabel">Typ</span>${chips("types", P.types)}</div>
        <div class="fgroup"><span class="flabel">Grösse</span>${chips("sizes", P.sizes.map((s) => s.split(" ")[0] === "ohne" ? "ohne Wert" : s.split(" ")[0]), null)}</div>
        <div class="fgroup"><span class="flabel">Vergabeart</span>${chips("procs", P.procs.slice(0, 4), P.procs.slice(0, 4).map((p) => EB.PROC_LABEL[p]))}</div>
        <div class="fgroup"><span class="flabel">Firma</span><input type="text" list="firmL" id="fFirm" placeholder="Bau-/Planungsfirma…" value="${EB.esc(f.firm)}" style="width:210px"><datalist id="firmL">${firmList.map((d) => `<option value="${EB.esc(d)}">`).join("")}</datalist></div>
        ${opts.search ? `<div class="fgroup"><input type="search" id="fQ" placeholder="Suche in Titel oder Vergabestelle…" value="${EB.esc(f.q)}"></div>` : ""}
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
      dd.querySelectorAll("input").forEach((i) => (i.onchange = () => { f.cantons = [...dd.querySelectorAll("input:checked")].map((x) => x.value); const nm = f.muns.length; dropMunsOutside(); el.querySelector("#munL").innerHTML = munOptions(); if (f.muns.length !== nm) { changed(); return; } changed(false); el.querySelector("#ddCb").textContent = (f.cantons.length ? f.cantons.join(", ") : "alle") + " ▾"; el.querySelector("#ddCb").classList.toggle("on", !!f.cantons.length); }));
      el.querySelector("#cAll").onclick = () => { f.cantons = []; changed(); };
      EB.autocomplete(el.querySelector("#fMun"), EB.munSource(() => f.cantons), (it) => {
        if (!f.muns.includes(it.value)) f.muns.push(it.value);
        const k = it.value.split("|")[1];
        if (f.cantons.length && !f.cantons.includes(k)) { EB.toast(`Kantons-Filter ${f.cantons.join(", ")} entfernt – ${it.label} liegt in ${k}`); f.cantons = []; }
        changed();
      });
      EB.autocomplete(el.querySelector("#fDso"), EB.dsoSource, (it) => { el.querySelector("#fDso").value = it.value; f.dso = it.value; changed(); });
      el.querySelector("#fMun").onchange = (e) => {
        const m = e.target.value.trim().match(/^(.*) \(([A-Z]{2})\)$/);
        if (!m || !MUNS.includes(m[1] + "|" + m[2])) { e.target.value = ""; return; }
        const key = m[1] + "|" + m[2];
        if (!f.muns.includes(key)) f.muns.push(key);
        if (f.cantons.length && !f.cantons.includes(m[2])) { EB.toast(`Kantons-Filter ${f.cantons.join(", ")} entfernt – ${m[1]} liegt in ${m[2]}`); f.cantons = []; }
        changed();
      };
      el.querySelectorAll("[data-mun]").forEach((b) => (b.onclick = () => { f.muns = f.muns.filter((x) => x !== b.dataset.mun); changed(); }));
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
    // forgiving hover: whole column/row of a category, one lean HTML tooltip for every chart
    C.defaults.interaction = { mode: "index", intersect: false };
    C.defaults.plugins.tooltip.enabled = false;
    C.defaults.plugins.tooltip.external = EB.chartTip;
    // empty state: a chart without data says so instead of showing blank axes
    // selected row band (horizontal bar charts): options.plugins.ebRow = { index, color }
    if (!EB._rowReg) { EB._rowReg = true; C.register({ id: "ebRow", beforeDatasetsDraw(ch, args, oo) {
      const o = ch.$ebRow;   // band state lives on the chart (not in cached plugin options)
      const g = ch.ctx, n = ch.data.labels.length; if (!n || !o) return;
      const band = (idx, col) => {
        if (idx == null || idx < 0) return;
        g.save(); g.fillStyle = col; g.beginPath();
        if (ch.options.indexAxis === "y") { const y = ch.scales.y, h = (y.bottom - y.top) / n, cy = y.getPixelForValue(idx); (g.roundRect ? g.roundRect(4, cy - h / 2, ch.width - 8, h, 5) : g.rect(4, cy - h / 2, ch.width - 8, h)); }
        else { const x = ch.scales.x, w = (x.right - x.left) / n, cx = x.getPixelForValue(idx), a = ch.chartArea; (g.roundRect ? g.roundRect(cx - w / 2, a.top - 4, w, ch.height - a.top, 5) : g.rect(cx - w / 2, a.top - 4, w, ch.height - a.top)); }
        g.fill(); g.restore();
      };
      band(o.index, o.color || "rgba(235,104,52,.16)");          // selected: stays
      if (o.hover !== o.index) band(o.hover, o.hoverColor || "rgba(235,104,52,.09)");   // hovered: lighter
    } }); }
    // canton arms on the category axis: options.plugins.ebArms = { on: true }
    if (!EB._armsReg) { EB._armsReg = true; C.register({ id: "ebArms", afterDraw(ch, args, o) {
      if (!o || !o.on || !window.EMBLEMS) return;
      const horiz = ch.options.indexAxis === "y", ax = horiz ? ch.scales.y : ch.scales.x; if (!ax) return;
      const g = ch.ctx, H = 15, items = ax.getLabelItems ? ax.getLabelItems() : [];
      ch.data.labels.forEach((code, i) => {
        const a = EMBLEMS.arms.c[code]; if (!a) return;
        EB._armImg = EB._armImg || {};
        let img = EB._armImg[code];
        if (!img) { img = EB._armImg[code] = new Image(); img.onload = () => Object.values(EB.charts).forEach((x) => x.options.plugins && x.options.plugins.ebArms && x.draw()); img.src = a[0]; }
        if (!img.complete || !img.naturalWidth) return;
        const w = H * img.naturalWidth / img.naturalHeight, p = ax.getPixelForTick(i);
        // centre the arms between the axis (bar) and the drawn label, so both gaps are equal
        const it = items[i] && items[i].options && items[i].options.translation;
        if (horiz) { const labelRight = it ? it[0] : ax.right - 24; const cx = (labelRight + ax.right) / 2; g.drawImage(img, cx - w / 2, p - H / 2, w, H); }
        else {
          const fs = (ax.options.ticks.font && ax.options.ticks.font.size) || 12;
          const labelTop = it ? (items[i].options.textBaseline === "middle" ? it[1] - fs / 2 : it[1]) : ax.top + 21;
          const cy = (ax.top + labelTop) / 2 + 1.5;   // +1.5: optical correction for the glyph top (measured: equal 6–7 px gaps)
          g.drawImage(img, p - w / 2, cy - H / 2, w, H);
        }
      });
    } }); }
    if (!EB._emptyReg) { EB._emptyReg = true; C.register({ id: "ebEmpty", afterDraw(ch) {
      const any = ch.data.datasets.some((d) => !d.hidden && (d.data || []).some((v) => (typeof v === "object" && v ? v.y || v.x : v)));
      if (any || !ch.chartArea) return;
      const { left, right, top, bottom } = ch.chartArea, x = (left + right) / 2, y = (top + bottom) / 2, g = ch.ctx;
      g.save(); g.fillStyle = EB.css("--surface"); g.globalAlpha = 0.85; g.fillRect(left, top, right - left, bottom - top); g.globalAlpha = 1;
      g.textAlign = "center"; g.fillStyle = EB.css("--text-2"); g.font = "500 13px Inter, system-ui, sans-serif"; g.fillText("Keine Daten für diese Filterauswahl", x, y - 6);
      g.fillStyle = EB.css("--muted"); g.font = "12px Inter, system-ui, sans-serif"; g.fillText("Filter oben anpassen oder zurücksetzen", x, y + 13); g.restore();
    } }); }
  };
  /* lean HTML tooltip shared by all charts */
  // short series names for the hover card (legends keep the full names)
  const TIP_SHORT = { "Planung/Wettbewerb": "Planung/Wettb.", "Gebäudetechnik-Planung (HLKSE)": "HLKSE-Planung", "Netz-/Ladeinfrastruktur-Arbeiten": "Netz/Ladeinfra",
    "Netz / Ladeinfrastruktur": "Netz/Ladeinfra", "E-Baumaschinen erwähnt": "E-Maschinen", "CO₂/Nachhaltigkeit erwähnt": "CO₂/Nachh.", "Versorger ist Bauherr": "Versorger als Bauherr",
    "Bauingenieur / Bauleitung": "Bauing./Bauleitung", "Werkleitungen / Kanalisation": "Werkleitungen" };
  EB.chartTip = function (ctx) {
    let el = document.getElementById("ctip");
    if (!el) { el = document.createElement("div"); el.id = "ctip"; el.className = "ctip"; document.body.append(el); }
    const t = ctx.tooltip;
    if (!t || t.opacity === 0) { el.style.opacity = 0; return; }
    const rows = (t.body || []).map((b, i) => {
      const line = (b.lines || []).join(" ").trim();
      const m = line.match(/^(.*?):\s(.*)$/);
      let lab = (m ? m[1] : (t.dataPoints[i] && t.dataPoints[i].dataset.label) || "").trim();
      lab = TIP_SHORT[lab] || lab;
      const val = m ? m[2] : line;
      const raw = t.dataPoints[i] ? t.dataPoints[i].raw : null;
      if ((raw === 0 || raw === null) && (t.body || []).length > 1) return "";
      const col = t.labelColors[i] ? t.labelColors[i].backgroundColor : "transparent";
      return `<div class="ct-row"><span class="ct-dot" style="background:${col}"></span><span class="ct-lab">${EB.esc(lab)}</span><span class="ct-val">${EB.esc(val)}</span></div>`;
    }).join("");
    const foot = (t.footer || []).join("\n").split("\n").filter(Boolean);
    const hint = foot.filter((f) => /^Klick/.test(f)), facts = foot.filter((f) => !/^Klick/.test(f));
    const ttl = (t.title || []).filter(Boolean).map((x) => TIP_SHORT[x] || x).join(" ");
    el.innerHTML = `${ttl ? `<div class="ct-title">${EB.titleIcon((t.title || []).join(" "))}${EB.esc(ttl)}</div>` : ""}${rows}
      ${facts.length ? `<div class="ct-facts">${facts.map(EB.esc).join("<br>")}</div>` : ""}${hint.length ? `<div class="ct-hint">${EB.esc(hint[0].split(" · ")[0])}</div>` : ""}`;
    const r = ctx.chart.canvas.getBoundingClientRect();
    const w = el.offsetWidth, h = el.offsetHeight;
    let x = r.left + t.caretX + 14, y = r.top + t.caretY - h / 2;
    if (x + w > innerWidth - 8) x = r.left + t.caretX - w - 14;
    y = Math.min(Math.max(8, y), innerHeight - h - 8);
    el.style.left = x + "px"; el.style.top = y + "px"; el.style.opacity = 1;
  };
  EB.chart = function (id, cfg) {
    const prev = EB.charts[id];
    const el = document.getElementById(id); if (!el || !window.Chart) return;
    if (cfg.options && cfg.options.plugins && cfg.options.plugins.ebArms && cfg.options.plugins.ebArms.on) {
      const axn = cfg.options.indexAxis === "y" ? "y" : "x";
      cfg.options.scales = cfg.options.scales || {}; cfg.options.scales[axn] = Object.assign({}, cfg.options.scales[axn]);
      cfg.options.scales[axn].ticks = Object.assign({}, cfg.options.scales[axn].ticks, { padding: axn === "x" ? 23 : 26 });
      cfg.options.scales[axn].grid = Object.assign({}, cfg.options.scales[axn].grid, { drawTicks: false });
    }
    // horizontal bars: resolve hover/click along the category axis (y), so highlight, tooltip and click hit the same row
    if (cfg.options && cfg.options.indexAxis === "y") {
      cfg.options.interaction = Object.assign({ mode: "index", intersect: false }, cfg.options.interaction, { axis: "y" });
      cfg.options.plugins = cfg.options.plugins || {};
      cfg.options.plugins.tooltip = Object.assign({}, cfg.options.plugins.tooltip, { axis: "y" });
    }
    if (cfg.options && cfg.options.onClick) {
      // click acts on the mark under the cursor (exact segment), falling back to the hovered category
      const orig = cfg.options.onClick;
      cfg.options.onClick = (e, els, ch) => {
        const hit = ch.getElementsAtEventForMode(e.native, "nearest", { intersect: true }, true);
        const pick = hit.length ? hit : els.slice(0, 1);
        const ev = { native: e.native, x: e.x, y: e.y, type: e.type };
        // run after Chart.js has finished handling this event: the action may rebuild this very chart
        setTimeout(() => { const t = document.getElementById("ctip"); if (t) t.style.opacity = 0; orig(ev, pick, ch); }, 0);
      };
      if (!cfg.options.onHover) cfg.options.onHover = (e, els) => { e.native.target.style.cursor = els.length ? "pointer" : "default"; };
    }
    // update an existing chart in place instead of destroying it: no blank canvas, no stale hover state
    if (prev && prev.canvas === el && prev.config.type === cfg.type) {
      prev.config.data = cfg.data;
      prev.config.options = cfg.options;
      prev.setActiveElements([]);
      prev.tooltip && prev.tooltip.setActiveElements([], { x: 0, y: 0 });
      const t = document.getElementById("ctip"); if (t) t.style.opacity = 0;
      prev.$ebRow = cfg.options && cfg.options.plugins && cfg.options.plugins.ebRow ? Object.assign({}, cfg.options.plugins.ebRow) : null;
      prev.update(cfg.options && cfg.options.animation === false ? "none" : undefined);
      return prev;
    }
    if (prev) prev.destroy();
    EB.charts[id] = new Chart(el, cfg);
    EB.charts[id].$ebRow = cfg.options && cfg.options.plugins && cfg.options.plugins.ebRow ? Object.assign({}, cfg.options.plugins.ebRow) : null;
    EB.charts[id].draw();
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
          if (p.ring) { ctx.globalAlpha = 1; ctx.lineWidth = 1.6; ctx.strokeStyle = EB.css("--text"); ctx.beginPath(); ctx.arc(pt.x, pt.y, r + 1.8, 0, 6.2832); ctx.stroke(); }
          else if (r >= 4) { ctx.globalAlpha = 1; ctx.lineWidth = 1; ctx.strokeStyle = ring; ctx.stroke(); }
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
          EB.showCard(m, [p.lat, p.lon], this.opts.card(p), () => { this._sel = null; this._draw(); });
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
  /* quiet vector background (BFS GEOSTAT boundaries): land, lakes, canton + municipality borders.
     swisstopo grey tiles fade in only from zoom 12 for street-level orientation. */
  EB.basemapStyle = () => ({
    land: { stroke: false, fillColor: EB.css("--map-land"), fillOpacity: 1 },
    lakes: { stroke: false, fillColor: EB.css("--map-water"), fillOpacity: 1 },
    munis: { color: EB.css("--map-muni"), weight: 0.5, opacity: 1, fill: false },
    cantons: { color: EB.css("--map-canton"), weight: 1, opacity: 1, fill: false },
    outline: { color: EB.css("--map-canton"), weight: 1.2, opacity: 1, fill: false },
  });
  EB._basemaps = [];
  document.addEventListener("eb-theme", () => EB._basemaps.forEach((f) => f()));
  EB.baseMap = function (id, opts) {
    opts = Object.assign({ preferCanvas: true, zoomSnap: 0.1, zoomDelta: 0.5, wheelPxPerZoomLevel: 90, scrollWheelZoom: true, minZoom: 6.5, maxZoom: 19,
      maxBounds: [[44.9, 4.6], [48.7, 11.9]], maxBoundsViscosity: 0.8 }, opts || {});
    const map = L.map(id, opts);
    // fit Switzerland tightly into the frame (fractional zoom), also when the frame is resized
    map.fitBounds(EB.CH_BOUNDS, { padding: [6, 6] });
    map._ebHome = () => { map.stop(); map.fitBounds(EB.CH_BOUNDS, { padding: [6, 6], animate: true }); };
    map.createPane("basemap"); map.getPane("basemap").style.zIndex = 150;
    const rnd = L.canvas({ pane: "basemap", padding: 0.3 });
    const B = window.BASEMAP;
    if (B) {
      const st = EB.basemapStyle();
      const lyr = {
        land: L.geoJSON(B.country, { pane: "basemap", renderer: rnd, style: st.land, interactive: false }),
        munis: L.geoJSON(B.munis, { pane: "basemap", renderer: rnd, style: st.munis, interactive: false }),
        cantons: L.geoJSON(B.cantons, { pane: "basemap", renderer: rnd, style: st.cantons, interactive: false }),
        lakes: L.geoJSON(B.lakes, { pane: "basemap", renderer: rnd, style: st.lakes, interactive: false }),
        outline: L.geoJSON(B.country, { pane: "basemap", renderer: rnd, style: st.outline, interactive: false }),
      };
      Object.values(lyr).forEach((l) => l.addTo(map));
      EB._basemaps.push(() => { const s = EB.basemapStyle(); Object.entries(lyr).forEach(([k, l]) => l.setStyle(s[k])); });
    }
    L.tileLayer("https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-grau/default/current/3857/{z}/{x}/{y}.jpeg", {
      minZoom: 12, maxZoom: 19, maxNativeZoom: 18, opacity: 0.55, className: "eb-tiles",
      attribution: '© <a href="https://www.swisstopo.admin.ch" target="_blank" rel="noopener">swisstopo</a>',
    }).addTo(map);
    map.attributionControl.addAttribution('Grenzen: <a href="https://www.bfs.admin.ch/bfs/de/home/dienstleistungen/geostat.html" target="_blank" rel="noopener">BFS GEOSTAT</a>');
    const Home = L.Control.extend({
      options: { position: "topleft" },
      onAdd() {
        const b = L.DomUtil.create("a", "leaflet-bar eb-home");
        b.href = "#"; b.title = "Ganze Schweiz anzeigen"; b.setAttribute("role", "button"); b.setAttribute("aria-label", "Ganze Schweiz anzeigen");
        b.innerHTML = EB.CH_ICON;
        L.DomEvent.on(b, "click", (e) => { L.DomEvent.stop(e); map._ebHome(); });
        L.DomEvent.disableClickPropagation(b);
        return b;
      },
    });
    new Home().addTo(map);
    L.control.scale({ imperial: false, position: "bottomleft", maxWidth: 110 }).addTo(map);
    map.getContainer().classList.add("eb-map");
    return map;
  };
  EB.gwrWms = () => L.tileLayer.wms("https://wms.geo.admin.ch/", { layers: "ch.bfs.gebaeude_wohnungs_register", format: "image/png", transparent: true, version: "1.3.0", minZoom: 15, opacity: 0.5, attribution: "GWR © BFS" });

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
      <div class="pc-sub">${EB.armMun(g.munName, g.canton, 14)}${EB.esc(g.munName || "")} ${EB.arm("c", g.canton, 13)}${EB.esc(g.canton || "")}</div>
      <dl class="pc-kv">${row("Kategorie", EB.esc(o.klass || ""))}${row("Geschossfläche", g.fa ? EB.n0(g.fa) + " m²" : "")}${row("Grundfläche", g.area ? EB.n0(g.area) + " m²" + (g.floors ? ` · ${g.floors} Geschosse` : "") : "")}
        ${row("Wohnungen", g.dw || "")}${row("Baujahr", g.year || "")}${row("Netzbetreiber", g.dso ? EB.entList("dso", g.dso, "<br>") : "")}</dl>
      ${EB.simapLinks(g.egid)}
      <div class="pc-btns">${EB.btn("Zoomen", "", "zoom")}${EB.btn("Objekt auf Karte", EB.lnk.gwrObj(g.egid))}${EB.btn("GWR-Zusatzinformation", EB.lnk.gwrInfo(g.egid))}</div>
      <div class="pc-src">Quelle: BFS, Gebäude- und Wohnungsregister</div></div>`;
  };
  EB.projCard = function (p) {
    const P = window.PROJ, col = EB.css(EB.TYPE_COLOR[p.type]);
    const firms = (p.con || []).slice(0, 3).map((i) => EB.ent("firm", EB.firmName(i))).join(", ");
    const arch = (p.arch || []).slice(0, 2).map((i) => EB.ent("firm", EB.firmName(i))).join(", ");
    return `<div class="pcard">
      <div class="pc-top"><span class="pc-status" style="--c:${col}">${EB.esc(p.typeName)}</span><span class="pc-id">${EB.esc(p.sizeName)} · ${p.y0 === p.y1 ? p.year : p.y0 + "–" + p.y1}</span></div>
      <div class="pc-title">${EB.esc(p.title)}</div>
      <div class="pc-sub">${EB.ent("auth", p.authName)}</div>
      <dl class="pc-kv">${row("Ort", p.munName ? EB.armMun(p.munName, p.canton, 14) + EB.ent("mun", p.munName, p.munName + " " + (p.canton || ""), p.canton) : "")}${row("Zuschläge", p.value ? EB.chf(p.value) : "")}${row("Vergabeart", EB.PROC_LABEL[P.procs[p.proc]] || "")}
        ${row("Bauunternehmen", firms)}${row("Architektur", arch)}${row("Netzbetreiber", p.dsoName ? EB.entList("dso", p.dsoName, "<br>") : "")}${row("CO₂ (Schätzung)", p.co2 ? EB.n0(p.co2) + " t" : "")}</dl>
      <div class="pc-btns">${EB.btn("Projektdetails", EB.lnk.proj(p.id), "primary")}${EB.btn("Zoomen", "", "zoom")}${EB.btn("GWR-Karte am Ort", EB.lnk.gwrMap(p.lat, p.lon))}</div>
      <div class="pc-src">Quelle: simap.ch · ${p.nn} Publikationen</div></div>`;
  };

  /* floating info card: lives in <body> so the map frame never clips it; opens above the point,
     flips below / sideways to stay inside the browser window, follows the point on pan/zoom */
  EB.showCard = function (map, latlng, html, onClose) {
    EB.closeCard();
    const el = document.createElement("div");
    el.className = "ebcard"; el.setAttribute("role", "dialog");
    el.innerHTML = `<button class="ebcard-x" aria-label="Schliessen">✕</button>${html}<span class="ebcard-tip"></span>`;
    document.body.append(el);
    const place = () => {
      const r = map.getContainer().getBoundingClientRect();
      const pt = map.latLngToContainerPoint(latlng);
      const x = r.left + pt.x, y = r.top + pt.y;
      const inside = pt.x >= 0 && pt.y >= 0 && pt.x <= r.width && pt.y <= r.height;
      el.style.visibility = inside ? "visible" : "hidden";
      const w = el.offsetWidth, h = el.offsetHeight, gap = 14, vw = innerWidth, vh = innerHeight;
      let below = y - h - gap < 8 && y + h + gap < vh - 8;
      let top = below ? y + gap : y - h - gap;
      let left = Math.min(Math.max(8, x - w / 2), vw - w - 8);
      el.classList.toggle("below", below);
      el.style.left = left + "px"; el.style.top = Math.max(8, top) + "px";
      el.querySelector(".ebcard-tip").style.left = Math.min(Math.max(14, x - left), w - 14) + "px";
    };
    const onKey = (e) => { if (e.key === "Escape") EB.closeCard(); };
    const onMapClick = () => EB.closeCard();
    map.on("move zoom resize", place);
    window.addEventListener("scroll", place, true); window.addEventListener("resize", place); document.addEventListener("keydown", onKey);
    setTimeout(() => map.on("click", onMapClick), 0);
    EB._card = { el, close: () => {
      map.off("move zoom resize", place); map.off("click", onMapClick);
      window.removeEventListener("scroll", place, true); window.removeEventListener("resize", place); document.removeEventListener("keydown", onKey);
      el.remove(); onClose && onClose();
    } };
    el.querySelector(".ebcard-x").onclick = () => EB.closeCard();
    const z = el.querySelector("[data-zoom]");
    if (z) z.onclick = (ev) => { ev.preventDefault(); map.flyTo(latlng, Math.max(map.getZoom(), 17), { duration: 0.7 }); };
    place();
  };
  EB.closeCard = () => { if (EB._card) { const c = EB._card; EB._card = null; c.close(); } };

  /* ---------------- entity popover: click a firm / municipality / grid operator / authority / role
     → small window with key facts and explicit actions (nothing navigates until a link is clicked) */
  EB.ent = (type, value, label, extra) =>
    `<span class="ent" role="button" tabindex="0" data-ent="${type}" data-v="${EB.esc(value)}"${extra ? ` data-x="${EB.esc(extra)}"` : ""}>${EB.esc(label == null ? value : label)}</span>`;
  EB.entList = (type, str, sep) => (str || "").split(" | ").filter(Boolean).map((v) => (type === "dso" ? EB.logo(v, 14) : "") + EB.ent(type, v)).join(sep === undefined ? " · " : sep);
  const ROLE_NAME = (r) => (window.PROJ && PROJ.role_label[r]) || ({ contractor: "Bauunternehmen", planner: "Planer (übrige)" })[r] || r;
  const goFilter = (patch, page) => {
    const f = EB.filters;
    Object.keys(EB.DEF).forEach((k) => { if (k !== "nofw") f[k] = JSON.parse(JSON.stringify(EB.DEF[k])); });
    Object.assign(f, patch); EB.saveFilters();
    const here = location.pathname.split("/").pop() || "index.html";
    if (EB._onFilter && (here === page || (!page && EB._fbRender))) { EB.apply(); EB.closePop(); }
    else location.href = page || "index.html";
  };
  EB._entActions = {};
  const act = (label, fn, kind) => { const id = "a" + Math.random().toString(36).slice(2, 8); EB._entActions[id] = fn; return `<a href="#" class="pbtn${kind === "primary" ? " primary" : ""}" data-act="${id}">${label}</a>`; };
  const stat = (k, v) => (v ? `<dt>${k}</dt><dd>${v}</dd>` : "");
  EB.entCard = function (type, v, x) {
    const P = EB._P ? EB._P : (window.PROJ ? EB.projects() : []);
    if (type === "firm") {
      EB.firms(); const f = EB._FN && EB._FN[v];
      const roles = f ? Object.entries(f.roles).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([r, n]) => `${ROLE_NAME(r)} (${n})`).join(", ") : "";
      return `<div class="pc-top"><span class="pc-status" style="--c:var(--accent)">Firma</span>${f && f.arge ? '<span class="pc-id">Arbeitsgemeinschaft</span>' : ""}</div>
        <div class="pc-title">${EB.esc(v)}</div>${f ? `<div class="pc-sub">${EB.esc(f.plz)} ${EB.esc(f.city)}</div>` : ""}
        ${f ? `<dl class="pc-kv">${stat("Zuschläge", EB.n0(f.n))}${stat("Summe", EB.chf(f.value))}${stat("Projekte", EB.n0(f.np))}${stat("Rollen", roles)}${stat("Kantone", Object.keys(f.cantons).filter(Boolean).slice(0, 6).join(", "))}</dl>` : '<div class="pc-sub" style="margin:8px 0">Keine weiteren Angaben im Datensatz.</div>'}
        <div class="pc-btns">${EB.btn("Firmendetails", EB.lnk.firm(v), "primary")}${f ? act("Als Filter setzen", () => goFilter({ firm: v })) : ""}${EB.btn("Zefix", EB.lnk.zefix(v))}${EB.btn("Referenzen", EB.lnk.web(v))}</div>`;
    }
    if (type === "mun") {
      const ps = P.filter((p) => p.munName === v && (!x || p.canton === x));
      const val = ps.reduce((s, p) => s + (p.value || 0), 0);
      const geo = ps.find((p) => p.lat && p.geo <= 2);
      return `<div class="pc-top"><span class="pc-status" style="--c:var(--s3)">Gemeinde</span><span class="pc-id">${EB.arm("c", x, 14)}${EB.esc(x || "")}</span></div><div class="pc-title">${EB.armMun(v, x, 22)}${EB.esc(v)}</div>
        <dl class="pc-kv">${stat("Projekte", EB.n0(ps.length))}${stat("Zuschläge", EB.chf(val))}${stat("Netzbetreiber", EB.esc((ps[0] || {}).dsoName || ""))}</dl>
        <div class="pc-btns">${act("Projekte anzeigen →", () => goFilter({ muns: [v + "|" + x] }, "projects.html"), "primary")}${act("Übersicht filtern", () => goFilter({ muns: [v + "|" + x] }, "index.html"))}${geo ? EB.btn("GWR-Karte", EB.lnk.gwrMap(geo.lat, geo.lon)) : ""}</div>`;
    }
    if (type === "dso") {
      const ps = P.filter((p) => (p.dsoName || "").split(" | ").includes(v));
      const bfs = x;
      if (!window.PROJ) return `<div class="pc-top"><span class="pc-status" style="--c:var(--s4)">Netzbetreiber</span></div><div class="pc-title">${EB.esc(v)}</div>
        <div class="pc-btns" style="margin-top:10px">${act("Baustellen-Übersicht filtern →", () => goFilter({ dso: v }, "index.html"), "primary")}${EB.btn("ElCom", "https://www.strompreis.elcom.admin.ch")}</div>`;
      return `<div class="pc-top"><span class="pc-status" style="--c:var(--s4)">Netzbetreiber</span></div><div class="pc-title">${EB.logo(v, 20)}${EB.esc(v)}</div>
        <dl class="pc-kv">${stat("Projekte im Netzgebiet", EB.n0(ps.length))}${stat("Zuschläge", EB.chf(ps.reduce((s, p) => s + (p.value || 0), 0)))}</dl>
        <div class="pc-btns">${act("Übersicht filtern →", () => goFilter({ dso: v }, "index.html"), "primary")}${act("Projekte anzeigen", () => goFilter({ dso: v }, "projects.html"))}${bfs ? EB.btn("ElCom-Tarife", EB.lnk.elcom(bfs)) : EB.btn("ElCom", "https://www.strompreis.elcom.admin.ch")}</div>`;
    }
    if (type === "auth") {
      const ps = P.filter((p) => p.authName === v);
      return `<div class="pc-top"><span class="pc-status" style="--c:var(--s7)">Vergabestelle</span></div><div class="pc-title">${EB.esc(v)}</div>
        <dl class="pc-kv">${stat("Projekte", EB.n0(ps.length))}${stat("Zuschläge", EB.chf(ps.reduce((s, p) => s + (p.value || 0), 0)))}</dl>
        <div class="pc-btns">${act("Projekte anzeigen →", () => goFilter({ q: v }, "projects.html"), "primary")}${act("Übersicht filtern", () => goFilter({ q: v }, "index.html"))}</div>`;
    }
    if (type === "role") {
      const i = window.PROJ.roles.indexOf(v);
      const n = P.filter((p) => p.roles.includes(i)).length;
      return `<div class="pc-top"><span class="pc-status" style="--c:var(--s1)">Rolle / Gewerk</span></div><div class="pc-title">${EB.esc(ROLE_NAME(v))}</div>
        <dl class="pc-kv">${stat("Projekte", EB.n0(n))}</dl>
        <div class="pc-btns">${act("Übersicht filtern →", () => goFilter({ roles: [i] }, "index.html"), "primary")}${act("Projekte anzeigen", () => goFilter({ roles: [i] }, "projects.html"))}${["architect", "elec_plan", "mep_plan", "civil_eng", "gc", "elec_works", "grid", "hvac", "shell"].includes(v) ? act("Firmen dieser Rolle", () => { location.href = "firms.html#role=" + v; }) : ""}</div>`;
    }
    return "";
  };
  EB.closePop = () => { const p = document.getElementById("ebpop"); if (p) p.remove(); document.querySelectorAll(".ent.on").forEach((e) => e.classList.remove("on")); };
  EB.showPop = function (anchor, inner, cls) {
    EB.closePop();
    const el = document.createElement("div");
    el.id = "ebpop"; el.className = "ebcard ebpop" + (cls ? " " + cls : ""); el.setAttribute("role", "dialog");
    el.innerHTML = `<button class="ebcard-x" aria-label="Schliessen">✕</button><div class="pcard">${inner}</div>`;
    document.body.append(el);
    const r = anchor.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
    const below = r.bottom + h + 10 < innerHeight || r.top - h - 10 < 0;
    el.style.left = Math.min(Math.max(8, r.left), innerWidth - w - 8) + "px";
    el.style.top = Math.max(8, below ? r.bottom + 6 : r.top - h - 6) + "px";
    el.querySelector(".ebcard-x").onclick = EB.closePop;
    return el;
  };
  EB.openPop = function (anchor) {
    const same = anchor.classList.contains("on");
    EB.closePop(); if (same) return;
    const html = EB.entCard(anchor.dataset.ent, anchor.dataset.v, anchor.dataset.x);
    if (!html) return;
    anchor.classList.add("on");
    const el = document.createElement("div");
    el.id = "ebpop"; el.className = "ebcard ebpop"; el.setAttribute("role", "dialog");
    el.innerHTML = `<button class="ebcard-x" aria-label="Schliessen">✕</button><div class="pcard">${html}</div>`;
    document.body.append(el);
    const r = anchor.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
    const below = r.bottom + h + 10 < innerHeight || r.top - h - 10 < 0;
    el.style.left = Math.min(Math.max(8, r.left), innerWidth - w - 8) + "px";
    el.style.top = (below ? r.bottom + 6 : r.top - h - 6) + "px";
    el.querySelector(".ebcard-x").onclick = EB.closePop;
    el.querySelectorAll("[data-act]").forEach((a) => (a.onclick = (e) => { e.preventDefault(); const fn = EB._entActions[a.dataset.act]; fn && fn(); }));
  };
  document.addEventListener("click", (e) => {
    const a = e.target.closest(".ent");
    if (a) { e.preventDefault(); e.stopPropagation(); EB.openPop(a); return; }
    if (!e.target.closest("#ebpop")) EB.closePop();
  }, true);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") EB.closePop();
    if ((e.key === "Enter" || e.key === " ") && e.target.classList && e.target.classList.contains("ent")) { e.preventDefault(); EB.openPop(e.target); }
  });
  window.addEventListener("scroll", (e) => { if (!(e.target.closest && e.target.closest("#ebpop"))) EB.closePop(); }, true);

  /* ---------------- lean card footer for every chart / map / table:
     kicker above the title, "Wie wird das gemessen?" (expandable), "Quelle: … · Stand …" */
  const SRC_META = {
    simapNew: ["simap.ch", "https://www.simap.ch", "21.11.2026"],
    simapArch: ["archiv.simap.ch", "https://archiv.simap.ch", "bis 30.6.2024"],
    gwr: ["BFS, Gebäude- und Wohnungsregister (GWR)", "https://www.housing-stat.ch/de/madd/public.html", "20.11.2026"],
    gwrMap: ["map.geo.admin.ch, GWR-Layer", "https://map.geo.admin.ch/#/map?lang=de&topic=bfs&layers=ch.bfs.gebaeude_wohnungs_register", "aktuell"],
    elcom: ["ElCom, Strompreise & Netzbetreiber", "https://www.strompreis.elcom.admin.ch", "Tarife 2026"],
    bfs: ["BFS, Bauausgaben", "https://www.pxweb.bfs.admin.ch/pxweb/de/px-x-0904010000_202/", "2024"],
    ebp: ["EBP (2025)", "https://www.ebp.ch", "2025"],
    bfsPop: ["BFS STATPOP, Wohnbevölkerung", "https://www.pxweb.bfs.admin.ch/pxweb/de/px-x-0102010000_101/", "2025"],
    bfsGeo: ["BFS GEOSTAT, Gemeindegrenzen", "https://www.bfs.admin.ch/bfs/de/home/dienstleistungen/geostat/geodaten-bundesstatistik/administrative-grenzen/generalisierte-gemeindegrenzen.html", "2025"],
    swisstopo: ["swisstopo, Landeskarte", "https://www.swisstopo.admin.ch", "aktuell"],
    bafuGhg: ["BAFU, Treibhausgasinventar", "https://www.bafu.admin.ch/bafu/de/home/themen/klima/zustand/daten/treibhausgasinventar.html", "2023"],
  };
  const KICKER = {
    c_year: "simap · Zuschläge", c_map: "simap · Standorte", c_canton: "simap · Kantone", c_size: "simap · Projektgrösse", c_proc: "simap · Vergabeverfahren",
    c_roles: "simap · Planer & Gewerke", c_util: "ElCom × simap · Netzbetreiber", c_firms: "simap · Firmen", k_value: "simap · Zuschläge",
    k_emach: "simap · Ausschreibungstexte", k_projects: "simap · Projekte", c_gwr: "GWR · Gebäudestatus", c_flex: "GWR × ElCom · Flex-Pool",
    c_val: "BFS × simap · Abdeckung", c_month: "simap · Datenqualität", c_geo: "Datenqualität · Geokodierung", k_co2: "Schätzung · CO₂", k_elec: "Schätzung · Strom",
  };
  const METHOD_ANCHOR = { c_year: "#break", c_month: "#break", c_proc: "#break", c_val: "#val", c_geo: "#quality", k_co2: "#methods", k_elec: "#methods" };
  EB.decorateCard = function (card) {
    if (card.classList.contains("kpi") || card.dataset.dec === "1" && card.querySelector(":scope > .cfoot")) return;
    const keys = [...new Set([...card.querySelectorAll("[data-info]")].map((b) => b.dataset.info))].filter((k) => EB.INFO[k]);
    if (!keys.length) return;
    card.dataset.dec = "1";
    // header info buttons are replaced by the footer; inline ones (KPI labels, table rows) stay
    card.querySelectorAll(":scope > .hd > .info, :scope > .hd .info").forEach((b) => { if (!b.closest(".kpi")) b.style.display = "none"; });
    const hd = card.querySelector(":scope > .hd");
    if (hd && !card.querySelector(":scope > .kicker") && KICKER[keys[0]]) {
      const k = document.createElement("div"); k.className = "kicker"; k.textContent = KICKER[keys[0]]; card.insertBefore(k, hd);
    }
    const src = [...new Set(keys.flatMap((k) => EB.INFO[k].s || []))].filter((s) => SRC_META[s]);
    const method = keys.map((k) => `<p>${keys.length > 1 ? `<b>${EB.INFO[k].t}.</b> ` : ""}${EB.INFO[k].b}</p>`).join("");
    const f = document.createElement("div");
    f.className = "cfoot";
    f.innerHTML = `<details><summary>Wie wird das gemessen?</summary><div class="cf-body">${method}<a href="sources.html${METHOD_ANCHOR[keys[0]] || "#methods"}">Methodik im Detail →</a></div></details>
      <div class="cf-src">Quelle: ${src.map((s) => `<a href="${SRC_META[s][1]}" target="_blank" rel="noopener">${SRC_META[s][0]}</a>`).join(" · ")}${src.length ? " · Stand " + [...new Set(src.map((s) => SRC_META[s][2]))].join(" / ") : ""}</div>`;
    card.append(f);
  };
  EB.decorateAll = () => document.querySelectorAll(".card").forEach((c) => { if (!c.querySelector(":scope > .cfoot")) EB.decorateCard(c); });
  let decoT;
  new MutationObserver(() => { clearTimeout(decoT); decoT = setTimeout(EB.decorateAll, 60); }).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener("DOMContentLoaded", () => setTimeout(EB.decorateAll, 0));

  /* small notice (e.g. when a conflicting filter was removed automatically) */
  EB.toast = function (msg) {
    let t = document.getElementById("ebtoast");
    if (!t) { t = document.createElement("div"); t.id = "ebtoast"; t.className = "ebtoast"; t.setAttribute("role", "status"); document.body.append(t); }
    t.textContent = msg; t.classList.add("on");
    clearTimeout(EB._toastT); EB._toastT = setTimeout(() => t.classList.remove("on"), 4200);
  };

  /* clickable map legend: each class can be hidden on that map; hidden entries are faded (same look as chart legends)
     items: [{key, label, color, round}] · hidden: Set of keys · onChange(): redraw the map */
  EB.mapLegend = function (el, items, hidden, onChange, note) {
    el.classList.add("maplegend-i");
    el.innerHTML = items.map((it) => `<button type="button" class="lg-item${hidden.has(it.key) ? " off" : ""}" data-k="${it.key}" aria-pressed="${!hidden.has(it.key)}" title="${hidden.has(it.key) ? "Einblenden" : "Auf der Karte ausblenden"}">
        <span class="swatch" style="background:${it.color};${it.round ? "border-radius:50%" : ""}"></span>${EB.esc(it.label)}</button>`).join("") +
      (hidden.size ? `<button type="button" class="lg-reset">alle</button>` : "") + (note ? `<span class="muted lg-note">${note}</span>` : "");
    el.querySelectorAll(".lg-item").forEach((b) => (b.onclick = () => {
      const k = isNaN(+b.dataset.k) ? b.dataset.k : +b.dataset.k;
      hidden.has(k) ? hidden.delete(k) : hidden.add(k); onChange();
    }));
    const r = el.querySelector(".lg-reset"); if (r) r.onclick = () => { hidden.clear(); onChange(); };
  };

  /* grid-operator area: union of the municipalities the operator supplies (ElCom 2026) on BFS GEOSTAT 2025 boundaries.
     Arcs used by exactly one of the operator's municipalities form the outer perimeter. */
  EB.opArea = function (op) {
    const T = window.MUNIGEO, M = window.MUN;
    if (!T || !M || !op) return null;
    if (!EB._arcs || op === "__init__") {
      const [sx, sy] = T.transform.scale, [tx, ty] = T.transform.translate;
      EB._arcs = T.arcs.map((a) => { let x = 0, y = 0; return a.map(([dx, dy]) => { x += dx; y += dy; return [y * sy + ty, x * sx + tx]; }); });
    }
    return EB.areaOfBfs(Object.keys(M).filter((b) => (M[b][2] || "").split(" | ").includes(op)));
  };
  EB.cantonArea = (k) => { if (!window.MUN) return null; EB.opArea("__init__"); return EB.areaOfBfs(Object.keys(MUN).filter((b) => MUN[b][1] === k)); };
  EB.areaOfBfs = function (bfs) {
    const T = window.MUNIGEO, M = window.MUN; if (!T || !M) return null;
    if (!EB._arcs) EB.opArea("__init__");
    const A = EB._arcs, cnt = new Map(), polys = [];
    let shared = 0, missing = 0;
    bfs.forEach((b) => {
      const rings = T.munis[b]; if (!rings) { missing++; return; }
      if ((M[b][2] || "").includes(" | ")) shared++;
      polys.push(...rings.map((r) => { const pts = []; r.forEach((i) => { const a = i >= 0 ? A[i] : A[~i].slice().reverse(); pts.push(...(pts.length ? a.slice(1) : a)); const k = i >= 0 ? i : ~i; cnt.set(k, (cnt.get(k) || 0) + 1); }); return pts; }));
    });
    const lines = [...cnt].filter(([, n]) => n === 1).map(([k]) => A[k]);
    return { n: bfs.length, polys, lines, shared, missing };
  };
  EB.drawOpArea = function (map, group, op, o) { return EB.drawArea(map, group, op ? EB.opArea(op) : null, o); };
  EB.drawArea = function (map, group, a, o) {
    group.clearLayers();
    if (!a || !a.polys.length) return null;
    if (!map.getPane("opArea")) { map.createPane("opArea"); map.getPane("opArea").style.zIndex = 390; }
    const col = (o && o.color) || EB.css("--s2");
    const rnd = L.svg({ pane: "opArea" });
    if (!(o && o.noFill)) L.polygon(a.polys, { pane: "opArea", renderer: rnd, stroke: false, fillColor: col, fillOpacity: (o && o.fill) || 0.13, interactive: false }).addTo(group);
    L.polyline(a.lines, { pane: "opArea", renderer: rnd, color: col, weight: (o && o.weight) || 2.5, opacity: 0.95, lineJoin: "round", dashArray: (o && o.dash) || null, interactive: false }).addTo(group);
    return a;
  };

  EB.munPoly = function (bfs) {
    const T = window.MUNIGEO; if (!T || !T.munis[bfs]) return null;
    if (!EB._arcs) EB.opArea("__init__");
    const A = EB._arcs;
    return T.munis[bfs].map((r) => { const pts = []; r.forEach((i) => { const a = i >= 0 ? A[i] : A[~i].slice().reverse(); pts.push(...(pts.length ? a.slice(1) : a)); }); return pts; });
  };

  /* ---------------- coats of arms (Wikimedia Commons, licence per file in the tooltip) and utility icons */
  EB.bfsOf = (name, canton) => {
    if (!window.MUN) return null;
    if (!EB._bfsIdx) { EB._bfsIdx = {}; Object.entries(MUN).forEach(([b, m]) => (EB._bfsIdx[m[0] + "|" + m[1]] = b)); }
    return EB._bfsIdx[name + "|" + canton] || null;
  };
  EB.arm = function (type, key, size) {
    const E = window.EMBLEMS; if (!E || key == null) return "";
    const a = E.arms[type === "c" ? "c" : "m"][String(key)]; if (!a) return "";
    const lic = [a[2], a[3]].filter(Boolean).join(", ");
    return `<img class="emb" src="${a[0]}" alt="" height="${size || 16}" loading="lazy" title="Wappen · Wikimedia Commons${lic ? " · " + EB.esc(lic) : ""}">`;
  };
  EB.armMun = (name, canton, size) => EB.arm("m", EB.bfsOf(name, canton), size);
  EB.logo = function (op, size) {
    const E = window.EMBLEMS; if (!E || !op) return "";
    const l = E.logos[op]; if (!l) return "";
    return `<img class="emb logo" src="${l[0]}" alt="" height="${size || 16}" width="${size || 16}" loading="lazy" title="Logo/Website-Icon: ${EB.esc(l[1])}">`;
  };
  // icon for a chart-tooltip title: canton code → canton arms, operator name → logo
  EB.titleIcon = (t) => (/^[A-Z]{2}$/.test(t) ? EB.arm("c", t, 15) : EB.logo(t, 15));

  /* ---------------- search suggestions with arms / logos (replaces the plain browser list) */
  EB.autocomplete = function (input, source, onPick) {
    const box = document.createElement("div"); box.className = "acbox"; document.body.append(box);
    let items = [], act = -1;
    const place = () => { const r = input.getBoundingClientRect(); box.style.left = r.left + "px"; box.style.top = r.bottom + 4 + "px"; box.style.minWidth = Math.max(300, r.width) + "px"; };
    const render = () => {
      const q = input.value.trim();
      items = q.length ? source(q) : [];
      if (!items.length) { box.style.display = "none"; return; }
      let html = "", grp = null;
      items.forEach((it, i) => {
        if (it.group && it.group !== grp) { grp = it.group; html += `<div class="ac-grp">${EB.esc(grp)}</div>`; }
        html += `<div class="ac-it${i === act ? " on" : ""}" data-i="${i}"><span class="ac-ic">${it.icon || ""}</span><span class="ac-l">${EB.esc(it.label)}</span><span class="ac-r">${EB.esc(it.right || "")}</span></div>`;
      });
      box.innerHTML = html; place(); box.style.display = "block";
      box.querySelectorAll(".ac-it").forEach((d) => (d.onmousedown = (e) => { e.preventDefault(); pick(+d.dataset.i); }));
    };
    const pick = (i) => { const it = items[i]; if (!it) return; box.style.display = "none"; input.value = ""; act = -1; onPick(it); };
    input.setAttribute("autocomplete", "off"); input.removeAttribute("list");
    input.addEventListener("input", () => { act = -1; render(); });
    input.addEventListener("focus", render);
    input.addEventListener("blur", () => setTimeout(() => (box.style.display = "none"), 120));
    input.addEventListener("keydown", (e) => {
      if (box.style.display !== "block") return;
      if (e.key === "ArrowDown") { act = Math.min(items.length - 1, act + 1); render(); e.preventDefault(); }
      else if (e.key === "ArrowUp") { act = Math.max(0, act - 1); render(); e.preventDefault(); }
      else if (e.key === "Enter") { pick(act < 0 ? 0 : act); e.preventDefault(); e.stopImmediatePropagation(); }
      else if (e.key === "Escape") box.style.display = "none";
    });
    window.addEventListener("scroll", () => { if (box.style.display === "block") place(); }, true);
  };
  // shared sources: municipalities (with arms, canton, population) and grid operators (with logo)
  EB.munSource = (filterCanton) => (q) => {
    if (!window.MUN) return [];
    const ql = q.toLowerCase();
    return Object.entries(MUN).filter(([b, m]) => m[0].toLowerCase().includes(ql) && (!filterCanton || !filterCanton().length || filterCanton().includes(m[1])))
      .sort((a, b) => (a[1][0].toLowerCase().startsWith(ql) ? 0 : 1) - (b[1][0].toLowerCase().startsWith(ql) ? 0 : 1) || (b[1][4] || 0) - (a[1][4] || 0)).slice(0, 12)
      .map(([b, m]) => ({ group: "Gemeinden", icon: EB.arm("m", b, 18), label: m[0], right: `${m[1]}${m[4] ? " · " + EB.n0(m[4]) + " Einw." : ""}`, value: m[0] + "|" + m[1] }));
  };
  EB.dsoSource = (q) => {
    if (!window.MUN) return [];
    if (!EB._ops) { const o = {}; Object.values(MUN).forEach((m) => (m[2] || "").split(" | ").filter(Boolean).forEach((x) => { o[x] = o[x] || { n: 0, pop: 0 }; o[x].n++; o[x].pop += m[4] || 0; })); EB._ops = o; }
    const ql = q.toLowerCase();
    return Object.entries(EB._ops).filter(([k]) => k.toLowerCase().includes(ql)).sort((a, b) => b[1].pop - a[1].pop).slice(0, 12)
      .map(([k, v]) => ({ group: "Netzbetreiber", icon: EB.logo(k, 18), label: k, right: `${v.n} Gem. · ${EB.n0(v.pop)} Einw.`, value: k }));
  };

  /* one size code for all GWR markers: circle AREA proportional to floor area (radius ∝ √m²), non-linear, capped */
  EB.FA_STEPS = [500, 2000, 10000, 40000];
  EB.faR = (fa) => (fa ? Math.min(18, 1.6 + Math.sqrt(fa) / 13) : 1.6);
  EB.sizeLegend = function () {
    const vals = EB.FA_STEPS, rMax = EB.faR(vals[vals.length - 1]), base = rMax * 2 + 2, colW = Math.max(46, rMax * 2 + 8);
    const lab = (v) => (v >= 1000 ? EB.n0(v / 1000) + "k" : v) + " m²";
    const body = vals.map((v, k) => { const r = EB.faR(v), cx = k * colW + colW / 2;
      return `<circle cx="${cx}" cy="${base - r}" r="${r}" fill="var(--text-2)" fill-opacity=".14" stroke="var(--text-2)" stroke-width="1"/>
        <text x="${cx}" y="${base + 12}" font-size="10.5" text-anchor="middle" fill="var(--text-2)">${lab(v)}</text>`; }).join("");
    const W = colW * vals.length;
    return `<span class="sizeleg" title="Kreisfläche proportional zur Geschossfläche (eine Skala für alle Bauphasen)"><span class="muted">Geschossfläche</span>
      <svg width="${W}" height="${base + 15}" viewBox="0 0 ${W} ${base + 15}" aria-label="Grössenlegende Geschossfläche">${body}</svg></span>`;
  };

  /* simap links of a GWR building (scripts/09_link_gwr_simap.py) */
  EB.LINK_LVL = { "sicher": ["gleiche Adresse", "var(--good)"], "Parzelle": ["gleiche Parzelle", "var(--good)"], "wahrscheinlich": ["Strasse im Titel", "var(--warning)"], "möglich": ["Gemeinde + Gebäudetyp", "var(--muted)"] };
  EB.simapLinks = function (egid) {
    if (!window.GWRLINKS) return "";
    const L = GWRLINKS[String(egid)];
    if (!L) return `<div class="pc-simap none">simap: kein Eintrag gefunden</div>`;
    return `<div class="pc-simap"><div class="ps-h">simap-Ausschreibungen (${L.length})</div>` + L.map(([pid, lvl, t, y, v, u]) =>
      `<div class="ps-row"><span class="ps-l" style="--c:${EB.LINK_LVL[lvl][1]}" title="Verknüpfung: ${EB.LINK_LVL[lvl][0]}">${lvl}</span>
        <span class="ps-t"><a href="${EB.lnk.proj(pid)}">${EB.esc(t)}</a><span class="muted"> · ${y}${v ? " · " + EB.chf(v) : ""}</span></span>
        <a class="ps-x" href="${u}" target="_blank" rel="noopener" title="Auf simap öffnen">simap ↗</a></div>`).join("") + `</div>`;
  };
})();
