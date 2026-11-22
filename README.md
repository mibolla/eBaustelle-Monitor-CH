# eBaustelle Monitor CH

Static dashboard on construction activity in Switzerland, 2016–2026, built for the electrification of construction sites (E-Baustelle). It combines public procurement from simap.ch (including the archive before July 2024) with the federal building register (GWR), the distribution grid operators (ElCom) and the BFS construction statistics, so that construction sites can be seen by place, size, phase, contract, firms and grid operator.

**Live:** https://mibolla.github.io/eBaustelle-Monitor-CH/

## Pages

| Page | Content |
|---|---|
| [Übersicht](https://mibolla.github.io/eBaustelle-Monitor-CH/) `index.html` | KPIs and cross-filtering charts (year, canton, municipality, grid operator, size, procedure, type, role, firm), project map, largest projects, municipalities with most medium and large sites |
| [Projekte](https://mibolla.github.io/eBaustelle-Monitor-CH/projects.html) `projects.html` | Project list and detail: all simap notices, awarded firms, linked GWR buildings, grid operator and tariff, CO₂ / electricity estimate, source links |
| [Karte](https://mibolla.github.io/eBaustelle-Monitor-CH/map.html) `map.html` | simap projects and GWR pipeline on one map, official GWR layer |
| [GWR-Pipeline](https://mibolla.github.io/eBaustelle-Monitor-CH/gwr.html) `gwr.html` | Projected, approved and under-construction buildings by canton; flex pool per grid operator with network area, municipality list and site lists; link to simap procurements per building |
| [Ausschreibungen](https://mibolla.github.io/eBaustelle-Monitor-CH/wettbewerbe.html) `wettbewerbe.html` | Open competitions, planner offers and construction tenders with deadlines; decided competitions with ranking (structure after competitions.espazium.ch, data from simap) |
| [Firmen](https://mibolla.github.io/eBaustelle-Monitor-CH/firms.html) `firms.html` | Construction firms, architects, electrical planners and installers with their projects |
| [Quellen & Methoden](https://mibolla.github.io/eBaustelle-Monitor-CH/sources.html) `sources.html` | Data sources, processing chain, methods, structural break 2024, BFS cross-check, data quality and live coverage table, limits |

## Features
- **Cross-filtering:** clicking a chart element filters all other charts, maps and tables; selections stay highlighted in orange, hover shows a lighter highlight.
- **Maps:** quiet vector background (BFS boundaries) or aerial image (SWISSIMAGE), Swiss home button, size legends (circle area ∝ √floor area or √award value), clickable class legends, info cards with links to simap, GWR and map.geo.admin (aerial view, building selected).
- **Grid operators:** network area (union of supplied municipalities), flex pool of active sites, municipality list by number of sites with coats of arms.
- **GWR ↔ simap:** pipeline buildings linked to procurements by address, parcel number (EGRID), street name or building type, with confidence level; filter on the GWR page.
- **Identification:** coats of arms for cantons and municipalities, logos for 82 % of grid operators.
- **Transparency:** every chart and map card states its source, data date and method («Wie wird das gemessen?»).
- Light and dark mode; no tracking, no server, no database.

## Data sources
- simap.ch public API and archiv.simap.ch (Verein simap.ch) – procurement notices, awards, competitions
- Eidg. Gebäude- und Wohnungsregister GWR, public download (BFS), export 20.11.2026; map.geo.admin.ch GWR layer
- ElCom electricity tariffs 2026 via LINDAS – grid operator and tariff per municipality
- BFS construction expenditure (px-x-0904010000_202) and STATPOP resident population 2025 (px-x-0102010000_101)
- BAFU greenhouse gas inventory / EBP (2025) – CO₂ and electricity factors
- Background map: generalised boundaries 2025, Bundesamt für Statistik (BFS), GEOSTAT – packaged by [swiss-maps](https://github.com/interactivethings/swiss-maps) (BSD-3-Clause, see `data/basemap-LICENSE.txt`; geodata non-commercial, source BFS GEOSTAT); map and aerial image © swisstopo
- Coats of arms: Wikidata / Wikimedia Commons (licence and author per file in the tooltip); grid-operator logos: website icons of the operators, identification only
- competitions.espazium.ch – reference for the structure of the Ausschreibungen page (no content taken)

## Caveats
- CO₂ and electricity values are top-down estimates (464 kt CO₂e and > 500 GWh/a scaled by construction value).
- Award values are contract values as published, not final costs.
- Time series before and after July 2024 are not directly comparable (new simap platform and revised procurement law).
- Network areas are approximated at municipality level; balance-group perimeters are not public.
- simap almost never names building identifiers (EGID 0 times); only the levels «sicher» and «Parzelle» of the GWR ↔ simap links are reliable.

## Technical notes
Static HTML/JS (Chart.js, Leaflet) with pre-computed data files in `data/` (about 111 MB, about 26 MB transferred compressed; project details load on demand). Script and data URLs carry content-hash version tags, so updates never mix with cached files.

The data are produced by a reproducible Python pipeline kept in the HSLU project folder (`simap_scraping/scripts/`): 01–02 scraping simap and the archive, 03 GWR/ElCom gazetteer, 04 cleaning and clustering, 05 export, 06 background map and municipality geometry, 08 coats of arms and logos, 09 GWR ↔ simap linking, 10 Ausschreibungen, 07 publishing to this repository.

Data as of 22.11.2026.
