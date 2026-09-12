// Everything is loaded before we restore a colony or accept clicks.
applyDensityMode();
populateHomeTownHallGrid();
showSamUi();
setAppPage("home");
document.body.removeAttribute("aria-busy");
