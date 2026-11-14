# School colour tuning (2026-11-14)

The 24 schools without a published colour value had shades guessed from the colour's name. This pass replaced those guesses, where possible, with the shade each university's own website uses for that colour. Method: for each homepage, tally the colours in its stylesheets, or (for ten sites that could not be read that way) the area-weighted computed colours of the rendered page, then take the dominant shade that matches the named colour. Framework defaults (WordPress, Bootstrap) were ignored.

These are website shades, not official brand values. `source` is `website` in `client/src/data/universities.ts`.

| University | Old guess | Website shade |
|---|---|---|
| King Mongkut's Institute of Technology Ladkrabang | #F16322 | #F16322 |
| Suan Dusit University | #34B3D1 | #339BB9 |
| Mahamakut Buddhist University | #FF7F00 | #F3690E |
| Chulabhorn Royal Academy | #FF6B00 | #FF6B00 |
| Chulabhorn Royal Academy | #003087 | #002F87 |
| Ramkhamhaeng University | #DAA520 | #FFB700 |
| Sukhothai Thammathirat Open University | #228B22 | #00653F |
| Nakhon Pathom Rajabhat University | #FFC0CB | #F6B2C0 |
| Nakhon Pathom Rajabhat University | #FF0000 | #982220 |
| Valaya Alongkorn Rajabhat University under the Royal Patronage | #008000 | #168504 |
| Suan Sunandha Rajabhat University | #0000FF | #535697 |
| Suan Sunandha Rajabhat University | #FFC0CB | #F06EAA |
| Christian University of Thailand | #0000CD | #1C3A56 |
| Christian University of Thailand | #FFD700 | #FFCB0C |
| Pathumthani University | #FFC0CB | #D82882 |
| Eastern Asia University | #0000FF | #001F54 |
| Southeast Asia University | #00008B | #011A43 |
| Thonburi University | #FFC000 | #EBA009 |
| Dhurakij Pundit University | #691BFF | #691BFF |
| North Bangkok University | #0000FF | #145996 |
| Rangsit University | #FF1493 | #EF3C63 |
| Rangsit University | #00BFFF | #2DB7F5 |
| Bangkok Suvarnabhumi University | #FF0000 | #C52D2F |
| Bangkok Suvarnabhumi University | #FFD700 | #FFBD20 |
| Thai-Nichi Institute of Technology | #2D368F | #2D3691 |
| Thai-Nichi Institute of Technology | #ED2224 | #D81638 |
| Payap University | #87CEEB | #007EFF |

## Still estimated

The site did not show the named colour clearly, so these keep the earlier guess (`source: approximate`):

- Chitralada Technology Institute: #FFD700, #87CEEB
- Ramkhamhaeng University: #191970
- Sukhothai Thammathirat Open University: #BDB76B
- Rajamangala University of Technology Krungthep: #008000
- Pathumthani University: #0000FF
- Southeast Asia University: #FFD700
- Dhurakij Pundit University: #94C8FD
- Srisavarindhira Thai Red Cross Institute of Nursing: #E32636
- Dusit Thani College: #800000

Notes:
- Ramkhamhaeng: the site's gold is #FFB700. Its navy is nearly black (#04091E), too dark to work as an accent, so navy stays an estimate (#191970).
- Dusit Thani College: the site is purple and orange, not the stated maroon.
- Chitralada: the site is navy-led; its stated yellow and light blue barely appear.
- Srisavarindhira (Thai Red Cross) and RMUT Krungthep: no usable colour data.
