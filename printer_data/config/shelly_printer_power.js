// Voron 2.4 - Shelly 2PM Gen4 printer power script (Phase 2: with Klipper)
//
// O1 = Switch id 0 = 48 V PSU (drivers)            ON first, OFF last
// O2 = Switch id 1 = 24 V PSU (board/CM4) + bed SSR ON last,  OFF first
//
// Shelly web UI: Scripts -> open the existing script -> replace all ->
// set the two IPs below -> Save -> Restart. Keep "Run on startup" on.
// Script id must stay 1 (it is part of the URLs in moonraker_power.conf).
//
// Changes to the Phase 1 script:
//  - OFF first halts the CM4 via Moonraker, waits, then cuts (no more
//    hard cut of the eMMC)
//  - HTTP.POST gets a body (Shelly's HTTP.POST expects one)
//  - the print guard also protects the /off URL, not only the button;
//    /cut stays the unguarded emergency cut
//  - repeated OFF requests during the shutdown wait are ignored

// ===================== CONFIG =====================
let MOONRAKER = "192.168.1.50:7125"; // <-- CM4 IP:port (static IP / DHCP reservation)
let REL_48V   = 0;      // O1 -> 48 V PSU
let REL_24V   = 1;      // O2 -> 24 V PSU + bed SSR line

let STAGE_ON_MS      = 1500;   // 48 V on -> 24 V on
let SHUTDOWN_WAIT_MS = 60000;  // CM4 halt -> 24 V off (raise if the CM4 is slow)
let STAGE_OFF_MS     = 3000;   // 24 V off -> 48 V off
let BLOCK_IF_PRINTING = true;  // refuse /off and short button press while printing
// ==================================================

let shuttingDown = false;

function powerOn() {
  if (shuttingDown) { print("ON ignored: shutdown in progress"); return; }
  print("POWER ON: 48V first");
  Shelly.call("Switch.Set", { id: REL_48V, on: true });
  Timer.set(STAGE_ON_MS, false, function () {
    print("POWER ON: 24V");
    Shelly.call("Switch.Set", { id: REL_24V, on: true });
  });
}

// staged mains cut: 24 V off, then 48 V off
function cutPower() {
  print("CUT: 24V off");
  Shelly.call("Switch.Set", { id: REL_24V, on: false });
  Timer.set(STAGE_OFF_MS, false, function () {
    print("CUT: 48V off");
    Shelly.call("Switch.Set", { id: REL_48V, on: false });
    shuttingDown = false;
  });
}

// clean off: halt the CM4 via Moonraker, wait, then staged cut
function powerOff() {
  if (shuttingDown) { print("OFF ignored: already shutting down"); return; }
  shuttingDown = true;
  print("OFF: halting CM4, then staged cut");
  Shelly.call("HTTP.POST", {
    url: "http://" + MOONRAKER + "/machine/shutdown",
    body: "{}",
    timeout: 10
  });
  Timer.set(SHUTDOWN_WAIT_MS, false, cutPower);
}

// off, unless Klipper reports a running print. If Moonraker can't be
// reached (CM4 already down), it powers off.
function guardedPowerOff() {
  if (!BLOCK_IF_PRINTING) { powerOff(); return; }
  Shelly.call("HTTP.GET",
    { url: "http://" + MOONRAKER + "/printer/objects/query?print_stats", timeout: 10 },
    function (r) {
      let printing = false;
      try {
        printing = (JSON.parse(r.body).result.status.print_stats.state === "printing");
      } catch (e) {}
      if (printing) { print("Refusing power-off: printing"); return; }
      powerOff();
    });
}

function togglePower() {
  Shelly.call("Switch.GetStatus", { id: REL_24V }, function (res) {
    let isOn = (res && res.output);
    if (!isOn) { powerOn(); return; }
    guardedPowerOff();
  });
}

// physical button (Input 0), once wired and the input set to Button mode:
// short press = toggle (guarded), long press = off even while printing
Shelly.addEventHandler(function (e) {
  if (!e || !e.info || e.info.component !== "input:0") return;
  if (e.info.event === "single_push") togglePower();
  if (e.info.event === "long_push")   powerOff();
});

// http://<shelly-ip>/script/1/on | /off | /cut
HTTPServer.registerEndpoint("on",  function (req, res) { powerOn();         res.code = 200; res.body = "on";  res.send(); });
HTTPServer.registerEndpoint("off", function (req, res) { guardedPowerOff(); res.code = 200; res.body = "off"; res.send(); });
HTTPServer.registerEndpoint("cut", function (req, res) { cutPower();        res.code = 200; res.body = "cut"; res.send(); });

print("Printer power script ready (Phase 2: clean CM4 shutdown).");
