# eBaustelle Monitor CH

Static dashboard on public construction sites in Switzerland, 2016–2026: building and planning awards from simap.ch (including the archive before July 2024), grouped into projects, located, and linked with the federal building register (GWR), distribution grid operators (ElCom) and the BFS construction statistics. Context: electrification of construction sites (E-Baustelle).

**Live:** https://mibolla.github.io/eBaustelle-Monitor-CH/

| Page | Content |
|---|---|
| `index.html` | Overview: KPIs, cross-filtering charts (year, canton, utility, size, procedure, type, firm, role), map |
| `projects.html` | Project list and detail: simap notices, awarded firms, GWR buildings, grid operator, CO₂/electricity estimate, source links |
| `map.html` | Map of simap projects, GWR pipeline and the official GWR layer |
| `gwr.html` | GWR pipeline (projected / approved / under construction), flex pool per grid operator |
| `firms.html` | Construction firms, architects, electrical planners and installers |
| `sources.html` | Data sources, methods, structural break 2024, BFS cross-check, data quality |

No server or database: the pages load pre-computed data files from `data/` (about 24 MB transferred in total; project details are loaded on demand).

## Data sources
- simap.ch public API and archiv.simap.ch (Verein simap.ch) – procurement notices and awards
- Eidg. Gebäude- und Wohnungsregister GWR, public download (BFS), export 20.11.2026
- ElCom electricity tariffs 2026 via LINDAS – grid operator per municipality
- BFS construction expenditure (px-x-0904010000_202)
- BAFU greenhouse gas inventory / EBP (2025) – CO₂ and electricity factors
- Background map: generalised boundaries 2025, Bundesamt für Statistik (BFS), GEOSTAT – packaged by [swiss-maps](https://github.com/interactivethings/swiss-maps) (BSD-3-Clause, see `data/basemap-LICENSE.txt`); street detail from zoom 12 © swisstopo

CO₂ and electricity values are top-down estimates (see `sources.html`). Award values are contract values as published, not final costs. Time series before and after July 2024 are not directly comparable (new simap platform and revised procurement law).

Data as of 22.11.2026. Built with a reproducible Python pipeline (scraping, cleaning, clustering, export) maintained in the HSLU project folder.
