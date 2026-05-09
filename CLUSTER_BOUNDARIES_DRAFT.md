# Cluster Boundaries — Draft for Review

**Status:** First-pass draft inferred from photos of two printed maps. Not authoritative. Awaiting the Google My Maps KML export to finalize.

**How to use this doc:** correct any row directly. Replace `?` with the right cluster, change rows where I guessed wrong, and add counties/MDs I missed. Once it's correct, we can use it as the source of truth to (1) auto-assign nuclei by lat/lng, (2) draw boundaries on the map UI, (3) filter/report by region.

---

## Cluster list (inferred)

User-provided names: Calgary, Edmonton, Rockyview, Foothills, Black Gold, Crowsnest, Central Alberta, Northern Gates.

Additional names visible on the maps: Peace, Yellowhead, Wheatland, "Removed From Clustering".

| Cluster | Inferred general area | Confidence |
|---|---|---|
| Edmonton | City of Edmonton + immediate surrounds | High |
| Calgary | City of Calgary | High |
| Peace | NW corner: Grande Prairie, Peace River, Fairview, Manning | High |
| Central Alberta | Red Deer, Lacombe, Stettler, Sylvan Lake, Rocky Mountain House | High |
| Wheatland | E of Calgary: Strathmore, Drumheller area | Medium |
| Black Gold | S of Edmonton: Leduc, Wetaskiwin, Camrose | Medium |
| Northern Gates | N/NW of Edmonton: Athabasca, Westlock, Barrhead | Medium |
| Yellowhead | W of Edmonton: Hinton, Edson, Jasper, Whitecourt | Medium |
| Rockyview | N/NW of Calgary: Airdrie, Cochrane, Canmore | Low — guessing from name |
| Foothills | S of Calgary: Okotoks, High River, Black Diamond | Low — guessing from name |
| Crowsnest | Far south: Lethbridge area + SW corner | Low — could be just Crowsnest Pass area, or all of S Alberta |
| Removed From Clustering | Far north: Wood Buffalo, Fort McMurray, Mackenzie | High |

**Uncertain — not sure if these are separate clusters:**
- Is there a separate "Lethbridge" or "South" cluster, distinct from Crowsnest?
- Is "Black Gold / Elk Island" one cluster or two?
- Is there a "Lakeland" cluster east of Edmonton (Bonnyville, Cold Lake, St. Paul)?

---

## Alberta county / MD → cluster mapping

Alberta's cluster boundaries appear to follow county / municipal-district lines on both maps. Below is every Alberta county/MD I'm aware of with my best guess at its cluster.

### Northwest (Peace region)
| County / MD | Cluster | Notes |
|---|---|---|
| Mackenzie County | Removed From Clustering | High Level area |
| County of Northern Lights | Peace? | Manning |
| Clear Hills County | Peace | |
| MD of Peace No. 135 | Peace | |
| MD of Fairview No. 136 | Peace | |
| Birch Hills County | Peace | |
| Saddle Hills County | Peace | |
| MD of Spirit River | Peace | |
| County of Grande Prairie No. 1 | Peace | |
| MD of Greenview No. 16 | Peace? | Includes Grande Cache, Valleyview, Fox Creek — could split between Peace and Yellowhead |
| MD of Smoky River | Peace | |
| Big Lakes County | Peace? | High Prairie area |

### North / Northeast
| County / MD | Cluster | Notes |
|---|---|---|
| Regional Municipality of Wood Buffalo | Removed From Clustering | Fort McMurray |
| MD of Opportunity No. 17 | Removed From Clustering? | Wabasca-Desmarais |
| MD of Lesser Slave River | Northern Gates? | |
| Lac La Biche County | Northern Gates? | Could be separate "Lakeland" cluster |
| MD of Bonnyville | ? | Possibly Lakeland or Northern Gates |
| City of Cold Lake | ? | Possibly Lakeland or Northern Gates |
| County of St. Paul | ? | |
| Smoky Lake County | Northern Gates? | |
| Thorhild County | Northern Gates | |
| Athabasca County | Northern Gates | |
| Westlock County | Northern Gates | |
| Barrhead County | Northern Gates | |
| Woodlands County | Yellowhead? | Whitecourt — boundary unclear, could be Northern Gates |

### West-central (Yellowhead area)
| County / MD | Cluster | Notes |
|---|---|---|
| Yellowhead County | Yellowhead | Edson, Hinton |
| MD of Jasper / Jasper National Park | Yellowhead | |
| Brazeau County | Yellowhead? | Drayton Valley — could be Black Gold |
| Clearwater County | Central Alberta | Rocky Mountain House |

### Edmonton metro
| County / MD | Cluster | Notes |
|---|---|---|
| City of Edmonton | Edmonton | |
| Strathcona County | Edmonton | Sherwood Park |
| Sturgeon County | Edmonton | St. Albert |
| Parkland County | Edmonton? | Spruce Grove — could be Yellowhead at W edge |
| Leduc County | Black Gold | |
| City of Leduc | Black Gold | |
| Lac Ste. Anne County | Northern Gates? | |

### Central / east of Edmonton
| County / MD | Cluster | Notes |
|---|---|---|
| Lamont County | ? | |
| Two Hills County | ? | |
| Minburn County | ? | |
| Vermilion River County | ? | |
| Beaver County | Black Gold? | |
| Camrose County | Black Gold | |
| City of Camrose | Black Gold | |
| Wetaskiwin County | Black Gold | |
| Flagstaff County | ? | |
| Provost MD | ? | Eastern edge |
| Paintearth County | ? | Castor |

### Central Alberta (Red Deer region)
| County / MD | Cluster | Notes |
|---|---|---|
| Ponoka County | Central Alberta | |
| Lacombe County | Central Alberta | |
| Red Deer County | Central Alberta | |
| City of Red Deer | Central Alberta | |
| Stettler County | Central Alberta | |
| Mountain View County | Central Alberta? | Olds, Didsbury — could be Rockyview at S edge |
| Kneehill County | Wheatland? | Three Hills — could be Central Alberta |
| Starland County | Wheatland | Drumheller |
| Special Areas 2/3/4 | Wheatland? | East-central |

### Calgary metro
| County / MD | Cluster | Notes |
|---|---|---|
| City of Calgary | Calgary | |
| Rocky View County | Rockyview | Airdrie, Cochrane area |
| City of Airdrie | Rockyview | |
| Town of Cochrane | Rockyview | |
| MD of Bighorn | Rockyview? | Canmore — could be its own thing |
| Town of Canmore | Rockyview? | |
| Foothills County | Foothills | Okotoks, High River, Black Diamond |
| Town of Okotoks | Foothills | |
| Town of High River | Foothills | |
| Wheatland County | Wheatland | Strathmore |

### South
| County / MD | Cluster | Notes |
|---|---|---|
| Vulcan County | Foothills? | Could be Crowsnest |
| MD of Willow Creek | Crowsnest? | Claresholm |
| MD of Ranchland | Crowsnest | |
| MD of Pincher Creek | Crowsnest | |
| Crowsnest Pass (Specialized Municipality) | Crowsnest | |
| Cardston County | Crowsnest | |
| Lethbridge County | Crowsnest? | Could be its own "Lethbridge" cluster |
| City of Lethbridge | Crowsnest? | |
| MD of Taber | Crowsnest? | |
| Warner County | Crowsnest? | |
| Forty Mile County | ? | |
| Cypress County | ? | Medicine Hat area |
| City of Medicine Hat | ? | |
| Newell County | ? | Brooks — might be Wheatland |

---

## Open questions for you

1. **Are there clusters I missed?** I see Lakeland labeled on one of the photos — is that a real cluster?
2. **Is "Black Gold / Elk Island" one cluster or two?** The original map shows them slash-separated.
3. **Is Crowsnest just SW Alberta, or does it cover all of southern Alberta including Lethbridge & Medicine Hat?**
4. **What happens to "Removed From Clustering" data?** Is it just unassigned, or a real cluster bucket?
5. **The Calgary cluster on the original map is hidden by a pin** — is the City of Calgary its own cluster, separate from Rockyview/Foothills, as I've assumed?

---

## Next steps

1. You correct/annotate this table.
2. We get the KML export from Google My Maps to verify polygon-level details.
3. Then I implement: (a) seed data + DB schema for region-to-cluster mapping, (b) auto-assignment of nuclei by lat/lng, (c) boundary rendering in `ClusterMapView`, (d) region-scoped reporting.
