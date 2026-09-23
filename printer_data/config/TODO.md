# Voron 2.4 (250mm) – TODO

Status: 23.09.2026. Belongs to `printerBeta.cfg` in this folder.

> **Klipper-Backup deletes files that are only in the repo.** On every run it
> empties the repo and copies the printer's files back in. Copy `TODO.md` and
> `printerBeta.cfg` into `~/printer_data/config/` on the printer (Mainsail →
> Machine → Upload) **before the next automatic backup runs**, otherwise the
> next backup commit removes them from this branch (they stay in git history).

---

## 1. Findings so far

### Done and verified on the printer (oldVoron config)
- [x] **CNC Tap V2** on the EBB36 probe port: `pin: ^!EBBCan:PB9` (the `!` was needed).
- [x] **Tap repeatability:** `PROBE_ACCURACY` range 0.0018 mm (very good).
- [x] **z_offset -0.868** calibrated with `PROBE_CALIBRATE` (in the SAVE_CONFIG block).
  It must only be in the SAVE_CONFIG block, never also in an included file
  (that caused "conflicts with included value" and "z_offset must be specified").
- [x] **Quad gantry level** works: all 4 Z motors move the right way. From a cold
  start it needs 3–4 rounds (gantry was 1–2 mm off after power loss); normal.
- [x] **Bed mesh** went from 0.65 mm to **0.16 mm** after reseating the PEI sheet
  (bump at X49 Y181 was debris under the sheet) and tightening the rear and front
  right Z belts.
- [x] **Z microsteps** 256 → 32 (the old value gave 12,800 steps/mm per motor).

### Open problems
- [ ] **Z quacking, only when the gantry moves up.** 3 of 4 corners quack, Z3
  (front right) is quiet.
  - Not the microsteps (32 made no difference). SpreadCycle made it louder →
    Z stays in StealthChop (`tuning_goal: silent`).
  - **New lead from the inventory:** the Z drivers are **3× TMC2209 V1.2 and
    1× V1.3**. Check which slot has the V1.3. If it is MOTOR7 (Z3), swap it with
    a loud corner's driver (power off!) and see whether the quiet corner moves
    with the driver. Then it is the driver revision, not the mechanics.
  - Drivers were overheating (next point); hot TMC2209s in StealthChop get noisy
    under load. printerBeta lowers Z current to 0.8 A, limits Z speed to 20 mm/s
    and finally turns on the enclosure fans.
- [ ] **OTPW (driver over-temperature warning).** Cause found: the three
  electronics enclosure fans on FAN1–FAN3 were **never configured**, so they
  never ran. printerBeta adds them (see Fans). After switching, confirm with
  `DUMP_TMC STEPPER=stepper_z` (…z1, z2, z3, extruder) that `otpw` stays 0.
- [ ] **X/Y TMC5160 fail to start.** The old logs show ~60× "TMC stepper_x/y
  failed to init: Unable to write tmc spi". Typical cause: the 48 V supply
  (UHP-200-48) is not up yet when Klipper starts. Check how the 48 V PSU is
  switched. `FIRMWARE_RESTART` fixes it once 48 V is on.

### Hardware facts found while checking
- Bed thermistor is plugged into **T0 (PB0)**, not TB (PB1). The config uses PB0.
  Fine as is, just do not "correct" the pin.
- Hotend is a **Rapido 2 Plus UHF** (old comments said HF).
- The EBB36 PT1000 input is correct **without** the PT1000 jumper (4.7k pull-up).
  With the jumper you would need `pullup_resistor: 2200`.
- Manta M8P fan ports: voltage per port by **jumper, 5/12/24 V**, max 1 A each.
- Screen is a **BTT Pi TFT43** (KlipperScreen), not a mini12864.

---

## 2. Review of `printer.cfg` (voron2.4 branch)

Checked with Klipper's own config loader (batch mode, firmware dictionaries built
for the Manta H723 and the EBB36 G0B1). **Critical = wrong machine behaviour.**

| # | Section | Problem | Severity | printerBeta |
|---|---|---|---|---|
| 1 | `[mcu]` | `serial:` placeholder next to `canbus_uuid` → Klipper refuses to start | Blocker | removed |
| 2 | `[fan]` | Defined twice: the second one (`PF7`) silently wins → part fan drives Manta **FAN0 = 5160 driver fans** | Critical | EBB `PA0` only |
| 3 | `[heater_fan hotend_fan]` | Defined twice: `PF9` wins → real hotend fan on the EBB **never turns on** → heat creep | Critical | EBB `PA1` only |
| 4 | `[probe]` | Old inductive probe on `PF1`, `y_offset: 25`. Nothing is connected there, so **Z homing never triggers → nozzle drives into the bed** | Critical | Tap `^!EBBCan:PB9`, offsets 0, Tap temperature guard |
| 5 | `[probe] z_offset: 0` | Would be used instead of the calibrated -0.868 | High | SAVE_CONFIG block, -0.868 |
| 6 | `[heater_fan controller_fan]` on `PF6`, tied to the bed | Only 1 of 3 enclosure fans, only when the bed is hot; driver fans not configured at all | High | 2× `controller_fan` (see Fans) |
| 7 | no `[include mainsail.cfg]` | No `virtual_sdcard`, `pause_resume`, PAUSE/RESUME/CANCEL → Mainsail can't print | High | included |
| 8 | `PRINT_END` | Relative move `X+20 Y+20`: out of range near the right/rear edge → macro aborts **before heaters off** | High | heaters off first, absolute park |
| 9 | `[display]` + `[neopixel btt_mini12864]` | No mini12864 installed (screen is the TFT43) | Low | removed |
| 10 | Filament sensor | Manta pins `PC1/PC2`; the Orbiter sensor is on the toolhead | Medium | EBB pins (verify) |
| 11 | `PRINT_START` | Only homes; no heating, leveling, mesh, purge | Medium | full macro |
| 12 | Z drivers | `stealthchop_threshold: 0` = SpreadCycle (tested louder) | Low | autotune `silent` |
| 13 | `[printer]` | 500 mm/s / 8000 mm/s² without input shaping; `max_z_velocity: 50` is too fast for 0.9° Z motors | Medium | 300 / 5000, Z 20 until Shake&Tune |
| 14 | Extruder | Orbiter-doc driver registers (TBL/HEND/…) | Low | autotune instead |
| 15 | `[adxl345]` | Software SPI | Low | hardware SPI2 (BTT reference) |
| 16 | missing | `[resonance_tester]`, `[exclude_object]`, temperature sensors | Low | added |

Everything else (all motor, driver, endstop and heater pins, rotation distances,
gear ratios, currents, QGL corners and points, safe_z_home) matches the BTT M8P
V2 / EBB36 V1.2 references and the tested oldVoron config.

**printerBeta.cfg test result:** loads without errors on mainline Klipper
(2026-09-18) **and** Kalico (2026-09-16), with autotune, Shake&Tune and
mainsail.cfg. Simulated run: `G28`, `G32` (coarse + fine QGL), 9×9 mesh,
`PRINT_START BED=100 EXTRUDER=240` with adaptive mesh (3×3 around the object),
purge line, print moves, `PRINT_END`, `CANCEL_PRINT`, load/unload, LEDs,
power-off logic. Cold-nozzle paths are blocked as intended. Not testable offline:
real pins, polarities, temperatures, noise. Those are the checks in section 4.

---

## 3. Your list: decisions and next steps

- [ ] **Macros**: done in printerBeta. Settings are in `_PRINT_VARS`.
  - `PRINT_START` heats the bed, sets the nozzle to 150 °C (Tap limit), heat soak
    (automatic 10 min when bed ≥ 90 °C, `SOAK=` overrides), `G32`, adaptive mesh,
    nozzle to print temp, 80 mm purge line.
  - `G32`: rough QGL pass only after power-on, then the fine pass, then `G28 Z`.
  - `PRINT_END`: heaters off first, retract if hot, park rear center.
  - `LOAD_FILAMENT` / `UNLOAD_FILAMENT` (`TEMP=`, never below 200 °C, blocked while
    printing), `M600` = `PAUSE`, `STATUS_LEDS`, `AUTO_POWER_OFF`.
  - Slicer start G-code (Orca): `PRINT_START BED=[bed_temperature_initial_layer_single] EXTRUDER=[nozzle_temperature_initial_layer]`, end G-code: `PRINT_END`.
    Enable "Label objects" so the adaptive mesh works.
  - Note: the heat soak is inside `PRINT_START`, so a cancel only takes effect
    after the soak. Emergency stop always works.
- [ ] **LEDs**
  - Toolhead (Rapid Burner = Stealthburner layout): `[neopixel toolhead]` on
    EBB `PD3`, 3 LEDs, `GRBW`. Check: `STATUS_LEDS STATE=heating` should be
    orange. Wrong colours → try `color_order: GRB`.
  - Daylight on a Stick ×2: **find out where they are wired** (HE2/HE3, a fan
    port, or straight 24 V). The `[output_pin caselight]` block stays commented
    until then, because turning on a guessed heater output is unsafe.
  - Spare: bag 14 has a 3-LED loom (3-pin JST).
- [ ] **Display**: Pi TFT43 V2.1 runs KlipperScreen (installed and working);
  nothing needed in printer.cfg. If the screen stays black after an OS update:
  the M8P DSI1 driver (see M8P manual, "DSI1 Display").
- [ ] **Shake and Tune**: in printerBeta, but **install it first**, otherwise
  Klipper stops with "Section 'shaketune' is not a valid config section":
  `wget -O - https://raw.githubusercontent.com/Frix-x/klippain-shaketune/main/install.sh | bash`
  Then:
  1. `AXES_MAP_CALIBRATION`: fix `axes_map` of the `[adxl345]` (depends on how
     the EBB36 is mounted).
  2. `COMPARE_BELTS_RESPONSES`: the A/B belt tension.
  3. `AXES_SHAPER_CALIBRATION`, then `SAVE_CONFIG` → `[input_shaper]`.
  4. Only then raise `max_velocity` / `max_accel` to what the graphs recommend.
- [ ] **Kalico**: printerBeta works on both (tested). Recommendation: **stay on
  mainline Klipper until the printer is stable**, then decide. Switching means
  pointing `~/klipper` to Kalico and reflashing both boards (Manta is the CAN
  bridge, so plan a USB/DFU fallback). Main benefit for this printer: **MPC**
  temperature control for hotend and bed (would replace PID).
- [ ] **TMC autotune**: already installed on the printer; printerBeta uses it for
  all 7 motors: X/Y `performance` at 48 V, Z `silent` at 24 V, extruder `auto`.
  The Z motor is defined in printerBeta as `ldo-42sth48-2504mac` (same values as
  `ldo-42sth48-2504macf` in the current database). Update autotune via Moonraker
  if you want: add its `[update_manager klipper_tmc_autotune]` section.
- [ ] **Orbiter gear ratio and microsteps**
  - The Orbiter's 7.5:1 gearing is already inside `rotation_distance`
    (Orbiter default 4.637), so **no `gear_ratio`**. 4.682 is the previous owner's
    calibrated value.
  - **Calibrate:** hot nozzle, mark filament 120 mm above the extruder,
    `M83`, `G1 E100 F60`, measure the remaining distance, then
    new = 4.682 × (actual mm / 100).
  - Microsteps 16 with interpolation (autotune) = ~680 steps/mm. More is not needed.
  - Check the extruder direction once: `LOAD_FILAMENT` must pull filament in.
- [ ] **Filament runout sensor** (Orbiter sensor on the toolhead)
  - **Find the pins.** printerBeta uses EBB `PB4` (runout) and `PB3` (unload
    button) on the I2C header. The other candidates are `PB5`/`PB7` on the
    endstop port (`PB6` = X endstop).
  - Test: `QUERY_FILAMENT_SENSOR SENSOR=filament_sensor` with and without
    filament; `QUERY_BUTTON BUTTON=filament_unload_button` pressed and released.
    Reversed → add or remove `!`. **Do this before the first print:** if the sensor
    says "no filament" while filament is loaded, Mainsail blocks `RESUME`.
  - Spare: the cheap directional sensor in bag 8 (unused).
- [ ] **Camera**: the Logitech 1080p is in bag 5 (not mounted). Crowsnest is
  installed (`/dev/video0`, 640×480, 15 fps). After mounting: in `crowsnest.conf`
  use the `/dev/v4l/by-id/...` path, `resolution: 1280x720`, `max_fps: 30`.
  moonraker-timelapse is installed but disabled: enable `[timelapse]` in
  `moonraker.conf` and `[include timelapse.cfg]` in printer.cfg together.
- [ ] **Shelly end of print**: Klipper side done (`_POWER_OFF_WHEN_COOL`, off by
  default). Needed:
  1. Which Shelly (Gen1/Plus), its IP, and **does it also power the CM4?** If it
     does, the CM4 loses power without shutting down (risk to the eMMC).
  2. `moonraker.conf`:
     ```ini
     [power printer]
     type: shelly
     address: 192.168.x.x
     locked_while_printing: True
     restart_klipper_when_powered: True
     ```
  3. Test once by hand: `AUTO_POWER_OFF ENABLE=1`, run a short print; the
     printer turns off when the hotend is below 50 °C (the hotend fan keeps
     running until then). Permanently: `variable_power_off_after_print: True`
     in `_PRINT_VARS`.
- [ ] **Bed watermark vs PID → PID.** A steady plate temperature keeps the bed
  shape steady for the mesh, and the Omron SSR handles PID switching. First
  start: `PID_CALIBRATE HEATER=heater_bed TARGET=100`, `SAVE_CONFIG`.
  **Check the bed heater wattage** (label on the heater): the SSR is fine for a
  typical 250 mm bed at 230 V (~400 W ≈ 1.7 A); compare with the G3NB-210B-1
  datasheet (with or without heatsink) before changing `max_power`.
  (Kalico MPC would be the next step, see Kalico.)
- [ ] **Fans**
  - Your question: **not always on.** Driver and enclosure fans only cool heat
    that the drivers and SSR produce, which only happens while motors are
    enabled or heaters are on. `controller_fan` does exactly that, plus run-on:
    - `driver_fans` (FAN0): on while the X/Y motors are enabled or the hotend
      is heating, 60 s run-on.
    - `electronics_fans` (FAN1+2+3 as one): on while any motor is enabled or the
      bed/hotend heats, 120 s run-on. After a print, Z stays enabled for the
      30 min idle timeout, so they keep cooling that long.
    - Watch `CM4` and `Manta_M8P` in the temperature list. If the CM4 idles
      above ~70 °C with the fans off, add a `temperature_fan` on the host
      temperature.
  - **Before the first start: check the fan-voltage jumpers on the Manta.**
    Noisblocker XR1 = **12 V** fans; FAN1–3 must be on 12 V, not 24 V. Also
    check the driver fans on FAN0 and the Noctua 6060 (which voltage, which port?).
  - Nevermore StealthMax S + 3 under-bed units: find out how they are powered
    (the white barrel-plug cable?). If on a Manta fan port → `[fan_generic nevermore]`
    (template in printerBeta).
  - Voron exhaust (loose, not installed): optional later.

---

## 4. First start with printerBeta: safe order

Keep the emergency stop (M112) at hand from step 4 on.

1. **Power off.** Check the fan-voltage jumpers (FAN0–3), check the Z drivers
   (which one is V1.3).
2. **SSH:** install Shake&Tune (command above). Copy `printerBeta.cfg` and
   `TODO.md` to `~/printer_data/config/`.
3. **Switch:** keep `printer.cfg` as `printer_oldVoron.cfg`, rename
   `printerBeta.cfg` → `printer.cfg`, `FIRMWARE_RESTART`. Klipper must start
   without errors. On "failed to init" for X/Y: 48 V PSU (see above).
4. **Nothing moves yet:**
   - Temperatures: extruder, bed, MCU, EBB36 and CM4 all read about room temperature.
   - `QUERY_PROBE`: open at rest, TRIGGERED when the nozzle is pushed up.
   - `QUERY_ENDSTOPS`: X and Y switch correctly when pressed by hand.
   - `SET_STEPPER_ENABLE STEPPER=stepper_x ENABLE=1`:
     driver fans and enclosure fans must spin.
   - `M106 S255`: the part fan runs; `M106 S0`.
   - Heat the hotend to 60 °C: the hotend fan must start at 50 °C.
   - Filament sensor and button (section 3).
   - `STATUS_LEDS STATE=heating`.
5. **Homing:** `G28 X Y`, then `G28 Z` with the finger test (push the nozzle up
   during the descent, Z must stop).
6. `G32`: QGL range must shrink every round.
7. **Paper test at the center:** `G0 X121 Y129 Z0.2`. Keep the z_offset or redo
   `PROBE_CALIBRATE`.
8. `PID_CALIBRATE HEATER=extruder TARGET=245`, `SAVE_CONFIG`;
   `PID_CALIBRATE HEATER=heater_bed TARGET=100`, `SAVE_CONFIG`.
9. Z noise check: `G0 Z50 F600` / `G0 Z10 F600`, then `DUMP_TMC` for the Z drivers
   after 10 minutes (`otpw` must stay 0).
10. Hot bed mesh: heat the bed to print temperature, 10–15 min, `G32`,
    `BED_MESH_CALIBRATE`, `BED_MESH_PROFILE SAVE=default`, `SAVE_CONFIG`.
11. Extruder: `LOAD_FILAMENT`, then the rotation_distance calibration.
12. Shake&Tune (section 3), then raise the speed limits.
13. First print: small, single layer, watch the purge line position and the
    first layer; babystep in Mainsail if needed.

Rollback at any time: rename `printer_oldVoron.cfg` back to `printer.cfg`.
