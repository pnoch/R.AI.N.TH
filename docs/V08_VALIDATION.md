# V0.8 validation log

## Desktop preview

The dashboard renders the V0.8 header, official TMD warning, location controls, ECMWF map, NASA IMERG panel, official radar quantitative card, and RainViewer visual mosaic. The official numeric card shows five-frame trends, representative national metrics, and the persistence disclaimer.

The first RainViewer implementation used standard XYZ tiles, and a second probe used the documented coordinate-image endpoint. Both displayed an `API KEY REQUIRED` watermark. The release instead embeds RainViewer’s hosted `map.html` experience, which permits framing through its response headers and provides its own animation controls and attribution. Numeric calculations continue to use only official TMD PNG frames. The managed full-page screenshot utility does not paint cross-origin iframe contents, so the hosted map was also opened directly and verified separately in the browser.

## Live API checks

The official radar refresh completed in 17 seconds, below the 25-second application budget and 30-second scheduler deadline. The national snapshot contained 77 representative province points and five official frames. The selected Chatuchak endpoint returned a valid five-frame official trend and persistence baseline.
