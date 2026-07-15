# Chunk Surfer sound-effects production list

Status: production brief and checklist

Audit basis: current repository, 14 July 2026

This is the sound-effects bank the game should be built around after the large 2D catalogue is pruned. It is ordered by player value, not by recording convenience. The first sections make actions readable and the horror fair; the later sections add world depth and finish.

Music and ordinary dialogue recording are outside this list. Radio device layers, breaths, vocal fragments used as sound design, and diegetic performance are included because they function as effects.

## The pruning assumption

The present authored audio project contains 300 catalogue files across `amplifications`, `main_b3`, `lux_nova`, `soundnoisemusic`, and `the_tub`. Do not treat those files as retained production coverage.

The large bank currently performs several jobs indirectly:

- room and world texture;
- playable-prop sounds;
- far-off battle sounds;
- random fear stabs;
- recorded-take content and the playback guest;
- HUSH instrument mimicry;
- the non-story 2D sample field.

The production bank below replaces those jobs deliberately. Do not try to recreate 300 interchangeable music slices. A smaller bank of purpose-recorded room beds, isolated instruments, designed stabs, and playback intrusions will be clearer, cheaper to mix, and much easier to license.

The 27 files under `public/audio/game` are reference or placeholder coverage until their matching items below are delivered. The current 16-file bell bank is a synchronized, licensed prototype, but its stationary clock-hammer source is not the final moving-bell recording.

## Priority and delivery notation

- **P0 — gameplay-critical:** repeated constantly, communicates a rule, or prevents an action from feeling broken.
- **P1 — signature:** defines a major encounter, room, story turn, or recurring horror system.
- **P2 — tactile polish:** makes equipment, menus, and the building feel finished.
- **P3 — deep polish:** low-frequency detail and alternate perspectives that reward headphones.
- **Minimum** is the smallest shippable set. **Ideal** is the target where repetition will otherwise become obvious.
- **World mono** means a dry mono source intended for spatial placement. **Player stereo** means a close, non-spatial first-person layer. **Bed stereo** means a seamless environmental loop.

## Highest wins first

| Rank | Production family | Why it wins | Ship target |
|---:|---|---|---|
| 1 | Surface-aware footsteps and body Foley | Walking is the most frequent action and noise is the central game rule. The same random footstep slice everywhere undermines both. | Nine surfaces, three conditions, six variations per cell |
| 2 | Recorder and headphones | Recording is the core verb. Monitor, roll, stop, stall, resume, and playback must be distinguishable without looking at the HUD. | 28–36 transport and handling assets |
| 3 | Door archetypes, locks, and closers | Doors are navigation, safety, acoustic boundaries, and story objects. One close sound cannot sell eight constructions. | Eight archetype kits plus lock, key, wedge, and false-door assets |
| 4 | HUSH proximity, movement, and contact | The enemy hunts by sound; the player needs a legible but non-literal sense of its state and distance. | 24–36 designed layers and stingers |
| 5 | Purpose-built room tones | Empty rooms are the objective. Each assigned room needs a truthful, stable identity that survives monitoring and playback. | Five target-room beds plus circulation, plant, tower, exterior, and source beds |
| 6 | Radio carrier and failure sequence | The radio is a recurring hazard and major story channel. It needs a complete device vocabulary rather than a slowed recorder click. | 24–32 carrier, control, handling, and failure assets |
| 7 | Redaction battle actions | This is the second major verb set. Blackout, scrape, counter, submit, injury, win, and loss need unique reads. | 28–40 short tactile and designed assets |
| 8 | Real isolated instrument interactions | The current props borrow broad catalogue slices. The player is visibly touching a piano, marimba, drum, string instrument, speaker, or organ. | 40–56 dry one-shots across six families |
| 9 | Source-space and transition language | The literal source chapter currently leans on reused cues. Paper, code, tuning, redaction, transformation, and datamosh need their own grammar. | 30–44 assets plus two beds |
| 10 | Final moving-bell session and tower mechanisms | The prototype strikes synchronize correctly, but the tower becomes premium only with real hand/back strokes and separate machinery. | 32–64 bell strikes plus 30–45 mechanism assets |

If only one recording sprint is possible, finish ranks 1–3. If one design sprint follows it, finish ranks 4, 6, and 7.

## Deliberate silence policy

Best polish does not mean attaching a cue to every state change.

- Ordinary visual inspections remain silent unless a hand physically moves or touches something.
- HUSH locomotion has no literal creature footsteps; its distance language comes from room absorption, mimicry, and the sounds it disturbs.
- The playback guest gets no reveal sting. The player must notice it rising on the take.
- Autosave does not click on every position write; only meaningful checkpoint/file commits may use a very quiet trusted signal.
- Successful conversation choices do not get moral approval tones.
- A clean take is professional completion, not a victory fanfare.
- Menu, objective, achievement, and accessibility sounds remain trusted and are never reused for horror mischief.
- Sudden full silence is a limited effect with a short maximum duration, not a sustained substitute for HUSH design.

---

# Master production checklist

## 1. Player movement and body

### 1.1 Footstep matrix — P0

Record the same worn work boot, coat, and carried kit for the entire player set. Each file is one clean foot plant with a short natural tail. Alternate left/right in implementation; do not bake a walking cadence into a long file.

For every surface below, make:

- [ ] `step_<surface>_slow_01-06` — careful/Shift movement, six variations, world mono.
- [ ] `step_<surface>_walk_01-06` — ordinary movement, six variations, world mono.
- [ ] `step_<surface>_injured_01-06` — heavier uneven plant, six variations, world mono.
- [ ] `step_<surface>_scuff_01-03` — incidental toe or heel drag, three variations, world mono.
- [ ] `step_<surface>_stop_01-03` — weight settling after movement, three variations, world mono.

Required surfaces:

- [ ] `service_concrete` — dock, foyer, corridors, basement circulation.
- [ ] `acoustic_rubber` — Studio B3/dead room floor.
- [ ] `pool_tile` — dry natatorium deck and basin tile.
- [ ] `wet_tile` — flooded-run water edge; damp sole, no full wading system.
- [ ] `wood_velvet` — concert-hall stage, terraces, and carpeted wood.
- [ ] `practice_carpet` — practice-wing acoustic carpet/foam.
- [ ] `chapel_stone` — chapel, narthex, ringing room, and organ loft.
- [ ] `metal_plant` — plant-room plate, service stairs, and bell-frame catwalk.
- [ ] `source_paper` — source path/pages; dry paper compression with an impossible low body.

Minimum: four slow, four walk, and four injured plants for each of the nine surfaces.

Ideal: the full six-plus-scuff matrix above.

### 1.2 Movement sweeteners — P1

- [ ] `body_turn_coat_01-06` — quarter-turn coat and shoulder movement; player stereo, very quiet.
- [ ] `body_step_gear_jostle_01-06` — recorder, keys, radio, and bag movement; player stereo; trigger sparsely, not every step.
- [ ] `body_slow_gear_restrained_01-04` — deliberately controlled kit movement.
- [ ] `body_injured_gear_heavy_01-06` — loose, asymmetric kit movement after injury.
- [ ] `body_stop_settle_01-04` — coat and bag settle when the player stops.
- [ ] `body_wall_block_soft_01-04` — light clothing/boot contact when walking into a solid surface; never a comic thud.
- [ ] `body_stair_up_01-04` and `body_stair_down_01-04` — exertion and stair cadence sweeteners, layered over the surface step.
- [ ] `body_crouch_page_01-04` — knee, coat, and hand reaching to a page.
- [ ] `body_stand_from_page_01-04` — recovery from the crouch.

### 1.3 Breathing, injury, and capture — P0/P1

- [ ] `breath_calm_nose_loop` — nearly inaudible player stereo loop; optional and heavily gated.
- [ ] `breath_fear_in_01-06` and `breath_fear_out_01-06` — restrained breaths that can become gameplay noise.
- [ ] `breath_fear_hold_01-04` — breath caught/held at high pressure.
- [ ] `breath_injured_01-06` — pained but non-verbal exertion.
- [ ] `body_hush_contact_impact_01-04` — subjective non-literal contact, not a creature hit.
- [ ] `body_hush_shove_step_01-06` — stumble and forced retreat after contact.
- [ ] `body_injury_cloth_01-04` — clothing grab/compression.
- [ ] `body_injury_tinnitus_in`, `body_injury_tinnitus_loop`, `body_injury_tinnitus_out` — optional subjective layer; accessible mix must be safe.
- [ ] `body_taken_blackout` — short pressure collapse into silence.
- [ ] `body_taken_recovery_floor_01-03` — waking on a different floor/room.
- [ ] `body_search_bag_panicked_01-04` — item-taken recovery search.

Do not make pain barks unless the voice direction explicitly requests them. The protagonist already speaks; body Foley should not create a second performance.

## 2. Recorder, headphones, tape, and playback

The same physical recorder must be recognizable in every state. Record isolated buttons, relays, switches, lid, battery door, strap, cable, headphone cups, and transport motor. Keep device mechanics dry so monitor and world routing can differ.

### 2.1 Handling and monitor — P0

- [ ] `recorder_draw_from_bag_01-03` — player stereo.
- [ ] `recorder_return_to_bag_01-03` — player stereo.
- [ ] `recorder_handling_light_01-06` — normal hand repositioning.
- [ ] `recorder_set_down_01-04` — hard floor variants with surface tail supplied separately.
- [ ] `recorder_pick_up_01-04`.
- [ ] `headphones_uncoil_01-03`.
- [ ] `headphones_on_01-04` — cups, headband, coat collar; player stereo.
- [ ] `headphones_off_01-04`.
- [ ] `monitor_switch_on_01-04` — switch plus relay; clearly different from REC.
- [ ] `monitor_switch_off_01-04`.
- [ ] `monitor_room_open` — 150–300 ms perspective transition, not a musical whoosh.
- [ ] `monitor_room_close` — inverse perspective transition.
- [ ] `monitor_preamp_hiss_loop` — seamless, neutral, player stereo.
- [ ] `monitor_headphone_cable_touch_01-04` — rare close handling detail.

### 2.2 Transport states — P0

- [ ] `recorder_rec_press_01-04` — decisive button/relay.
- [ ] `recorder_record_engage_01-03` — motor or electronic transport engages.
- [ ] `recorder_stop_press_01-04`.
- [ ] `recorder_stop_disengage_01-03`.
- [ ] `recorder_hold_engage_01-03` — HUSH instrument stalls the take.
- [ ] `recorder_hold_release_01-03` — return to the recorder and resume.
- [ ] `recorder_invalid_press_01-03` — flat battery, wrong area, missing recorder, or unavailable source; subtle physical rejection, not a UI error beep.
- [ ] `recorder_take_complete` — transport settles and a small file/write confirmation; no triumphant sting.
- [ ] `recorder_take_spoiled` — transport fault/dropout, unmistakable but grounded.
- [ ] `recorder_take_abort` — manual early stop, neutral.
- [ ] `recorder_card_write_01-04` — very short storage activity; use only at state commits.
- [ ] `recorder_lid_open_01-03` and `recorder_lid_close_01-03` — bent-rig object and recovered recorder.

### 2.3 Tape and playback — P0/P1

- [ ] `tape_transport_run_loop` — seamless mechanical run.
- [ ] `tape_hiss_clean_loop` — stable take floor.
- [ ] `tape_hiss_pressure_loop` — slightly unstable high-fear layer, designed to crossfade with the clean loop.
- [ ] `tape_play_press_01-03`.
- [ ] `tape_play_engage_01-03`.
- [ ] `tape_play_stop_01-03`.
- [ ] `tape_rewind_start_01-03`, `tape_rewind_loop`, `tape_rewind_stop_01-03`.
- [ ] `tape_flip_01-03` — cold-open archive tape.
- [ ] `tape_spool_hand_01-03`.
- [ ] `playback_headphone_fade_in` and `playback_headphone_fade_out` — perspective, not score.
- [ ] `playback_guest_breath_01-04` — deniable nonverbal material.
- [ ] `playback_guest_mouth_noise_01-04` — below-speech detail.
- [ ] `playback_guest_word_fragment_01-06` — separately directed and licensed vocal fragments; indistinct until the mix chooses otherwise.
- [ ] `playback_guest_room_smear_01-06` — room-like tonal bodies that can rise under the captured bed.
- [ ] `playback_end_transport` — the moment the 22-second playback ends.

## 3. Torch, bag, map, documents, keys, and carried gear

### 3.1 Torch — P0/P2

- [ ] `torch_switch_on_01-04` and `torch_switch_off_01-04` — same switch with distinct pressure/release.
- [ ] `torch_switch_flat_01-03` — failed switch movement without light.
- [ ] `torch_hand_regrip_01-04`.
- [ ] `torch_body_tap_01-03` — anxious check or impact.
- [ ] `torch_battery_rattle_low_01-03` — optional low-cell warning detail.
- [ ] `torch_brownout_tick_01-04` — small filament/electrical irregularities near 22%.
- [ ] `torch_filament_fail` — final death; dry tick, tiny glass/coil decay, then absence.
- [ ] `torch_cells_remove_01-03`, `torch_cells_insert_01-03`, `torch_cap_open_01-03`, `torch_cap_close_01-03` — bent-rig cell choice.

### 3.2 Field case/bag — P0/P2

- [ ] `bag_set_down_01-04`.
- [ ] `bag_zip_open_01-04` and `bag_zip_close_01-04`.
- [ ] `bag_flap_open_01-04` and `bag_flap_close_01-04`.
- [ ] `bag_rummage_calm_01-06`.
- [ ] `bag_rummage_fast_01-06`.
- [ ] `bag_item_draw_small_01-04`, `bag_item_draw_metal_01-04`, `bag_item_draw_paper_01-04`.
- [ ] `bag_item_return_small_01-04`, `bag_item_return_metal_01-04`, `bag_item_return_paper_01-04`.
- [ ] `bag_close_ui` — close gesture matched to opening; do not reuse the open clip backwards.

### 3.3 Map and waypoint — P2

- [ ] `map_unfold_01-03` and `map_fold_01-03`.
- [ ] `map_floor_change_up_01-03` and `map_floor_change_down_01-03` — paper/index movement, not synthetic pitch steps.
- [ ] `map_cursor_move_01-04` — quiet locator detent.
- [ ] `map_waypoint_mark_01-03` — grease-pencil or mechanical index mark.
- [ ] `map_waypoint_clear_01-03`.
- [ ] `map_center_player_01-03`.
- [ ] `map_contact_lock_01-03` — HUSH acoustic contact appears on the facility map; unsettling but not a false objective notification.
- [ ] `map_contact_lost_01-03`.

### 3.4 Paper and documents — P0/P2

- [ ] `page_floor_pickup_01-06` — lift from concrete/tile/carpet without a generic UI pickup sound.
- [ ] `page_turn_forward_01-08` and `page_turn_back_01-08` — short, clean, no room baked in.
- [ ] `page_reader_open_01-03` and `page_reader_close_01-03`.
- [ ] `paper_stack_handle_01-04`.
- [ ] `work_order_unfold_01-03` and `work_order_refold_01-03`.
- [ ] `ledger_page_search_01-04`.
- [ ] `pen_fail_scratch_01-04`.
- [ ] `pen_write_signature_01-04`.
- [ ] `pen_write_returned_01-03` — ending ledger action.
- [ ] `paper_slide_under_glass_01-03`.
- [ ] `form_turn_on_glass_01-03`.
- [ ] `finger_tap_form_01-03`.

### 3.5 Keys and small metal — P0/P2

- [ ] `keyring_handle_01-08` — quiet normal use.
- [ ] `key_search_01-06` — individual keys separated by hand.
- [ ] `key_insert_01-04`, `key_turn_unlock_01-04`, `key_turn_lock_01-04`, `key_remove_01-04`.
- [ ] `wrong_key_try_01-06` — different failed insert/turn motions.
- [ ] `keyring_cabinet_lift_01-04`.
- [ ] `keyring_cabinet_drop_01-06` — the loud mistake that attracts the HUSH.
- [ ] `key_cabinet_door_open_01-03` and `key_cabinet_door_close_01-03`.
- [ ] `key_hook_remove_01-04`.
- [ ] `chapel_key_c17_add_to_ring_01-03`.

## 4. Doors, thresholds, locks, and architecture

### 4.1 Core door-archetype kits — P0

For each of the eight authored archetypes, make the following dry world-mono set:

- [ ] `door_<archetype>_handle_down_01-03`.
- [ ] `door_<archetype>_latch_release_01-03`.
- [ ] `door_<archetype>_open_motion_01-03`.
- [ ] `door_<archetype>_open_stop_01-03`.
- [ ] `door_<archetype>_close_motion_01-03`.
- [ ] `door_<archetype>_close_impact_01-03`.
- [ ] `door_<archetype>_latch_catch_01-03`.
- [ ] `door_<archetype>_locked_rattle_01-04`.

Archetypes:

- [ ] `public_glazed_pair` — mahogany and glass, two active leaves, no closer.
- [ ] `hall_acoustic_pair` — very heavy dark oak, one active leaf, heavy closer.
- [ ] `chapel_oak_pair` — panelled dark oak, one active leaf, long room tail supplied by acoustics.
- [ ] `practice_acoustic_single` — sealed oak acoustic leaf, standard closer.
- [ ] `service_fire_single` — grey-green steel fire door, standard closer.
- [ ] `staff_half_glazed` — oak with wired glass, no closer.
- [ ] `pool_fire_single` — galvanised wired-glass fire leaf, standard closer.
- [ ] `tower_service_single` — short painted plank timber under stone lintel.

### 4.2 Door-specific mechanics — P0/P1

- [ ] `door_closer_standard_release_01-03`, `door_closer_standard_run_01-03`, `door_closer_standard_settle_01-03`.
- [ ] `door_closer_heavy_release_01-03`, `door_closer_heavy_run_01-03`, `door_closer_heavy_settle_01-03`.
- [ ] `door_double_leaf_sympathy_01-03` — inactive leaf and glass responding to the active leaf.
- [ ] `door_glass_rattle_01-04` — public/staff/pool variants as separate recordings if materials differ.
- [ ] `door_rubber_wedge_pull_01-04`.
- [ ] `door_wedge_drop_01-03`.
- [ ] `door_closer_takes_weight_01-03`.
- [ ] `door_master_key_unlock_01-03`.
- [ ] `door_chapel_replacement_core_unlock_01-03`.
- [ ] `door_tower_hasp_release_01-03`.
- [ ] `door_organ_loft_service_release_01-03`.
- [ ] `door_inner_screen_mechanism_release_01-03`.
- [ ] `door_bricked_knock_01-04` — dead masonry response where a door used to be.
- [ ] `door_pushbar_missing_touch_01-03` — hand finding painted block instead of hardware.

### 4.3 Signature threshold moments — P1

- [ ] `service_door_exterior_key_turn` — authored cold-open close perspective.
- [ ] `service_door_exterior_open_heavy`.
- [ ] `service_door_slam_story` — the loud post-title closure, with separate steel impact and interior decay.
- [ ] `service_door_roomtone_cut` — rain/exterior perspective shutting out.
- [ ] `false_door_handle_refuse_01-03` — finale door visibly present but not opening.
- [ ] `false_door_position_slip_01-03` — architectural scrape/phase shift as it moves left into a wall.
- [ ] `rescue_door_open_hold` — ending door held open under collapse.
- [ ] `chapel_door_opens_to_service_road` — surfaced ending threshold.

## 5. Radio system

Use one period-appropriate handheld radio and record it cleanly. Separate the voice-processing chain from the physical controls and carrier so dialogue can change without replacing Foley.

### 5.1 Controls and handling — P0

- [ ] `radio_draw_01-03`, `radio_clip_to_belt_01-03`, `radio_unclip_01-03`.
- [ ] `radio_power_on_01-03`, `radio_power_off_01-03`.
- [ ] `radio_volume_detent_01-04`.
- [ ] `radio_ptt_down_01-04`, `radio_ptt_up_01-04`.
- [ ] `radio_shake_01-04`.
- [ ] `radio_belt_jostle_01-04`.
- [ ] `radio_set_down_concrete_01-04`, `radio_set_down_tile_01-04`, `radio_set_down_carpet_01-04`, `radio_set_down_stone_01-04`.
- [ ] `radio_pickup_01-04`.
- [ ] `radio_drop_hard_01-04` — only for forced/loud events, not the deliberate set-down action.

### 5.2 Carrier vocabulary — P0/P1

- [ ] `radio_squelch_open_clean_01-06`.
- [ ] `radio_squelch_close_clean_01-06`.
- [ ] `radio_carrier_clean_loop`.
- [ ] `radio_carrier_weak_loop`.
- [ ] `radio_carrier_open_empty_loop`.
- [ ] `radio_carrier_wet_return_loop` — final breakdown, subtly wrong.
- [ ] `radio_interference_tick_01-08`.
- [ ] `radio_dry_internal_click_01-04`.
- [ ] `radio_speaker_pop_01-04`.
- [ ] `radio_clipped_syllable_gate_01-04` — processing gesture, source vocal delivered separately.
- [ ] `radio_last_word_echo_01-03` — three decreasing, increasingly wet returns rendered as layers.
- [ ] `radio_breath_at_grille_01-04` — close nonverbal source.
- [ ] `radio_dead_carrier_drop_01-03`.
- [ ] `radio_dead_click_01-04`.
- [ ] `radio_haunted_squelch_belt_01-06` and `radio_haunted_squelch_distant_01-06` — same event at direct and world perspectives.
- [ ] `radio_door_inside_close` — the final channel closure described as a door closing inside the radio.

### 5.3 Cold-open booth detail — P2

- [ ] `booth_chair_move_01-03`.
- [ ] `booth_distant_laugh_muffle_01-03` — performance/design, not intelligible dialogue.
- [ ] `booth_key_hooks_01-04`.
- [ ] `booth_window_slide_01-03`.
- [ ] `booth_items_slide_under_glass_01-03`.
- [ ] `booth_television_muted_touch_01-03`.
- [ ] `booth_coffee_cup_set_01-03`, `booth_coffee_lid_01-03`, `booth_coffee_sip_01-03`.

## 6. HUSH, fear, and horror feedback

The HUSH should not sound like a monster walking around. Its grammar is subtraction, acoustic perspective, almost-familiar imitation, and physical contact only at the moment it reaches the player.

### 6.1 Proximity field — P0

- [ ] `hush_field_orient_01-04` — barely perceptible room-image tilt when it reacts to a noise.
- [ ] `hush_field_investigate_01-04` — distant absorption movement; world perspective.
- [ ] `hush_field_stalk_01-04` — closer, more directional, still non-literal.
- [ ] `hush_field_engulf_in_01-03` — rapid loss of room return.
- [ ] `hush_field_engulf_hold_01-03` — short safe-duration texture; never sustain a painful vacuum.
- [ ] `hush_field_engulf_out_01-03` — room return releasing.
- [ ] `hush_room_negative_pulse_01-04` — the room briefly loses its return.
- [ ] `hush_monitor_absorb_01-04` — headphones lose dry signal.
- [ ] `hush_monitor_hiss_rise_loop` — crossfadeable loop.
- [ ] `hush_monitor_residue_01-06` — rare 120–280 ms fragments.
- [ ] `hush_spawn_behind` — first arrival after a take; no location-revealing footstep.
- [ ] `hush_recoil_after_contact` — pressure withdraws after a catch.

### 6.2 Mimicry/mischief — P1

- [ ] `hush_mimic_recorder_click_01-06` — recognizable transport mechanics with wrong pitch/envelope.
- [ ] `hush_mimic_footstep_<surface>_01-03` — a limited learned subset; use the same real step source rendered incorrectly.
- [ ] `hush_mimic_bag_01-04`.
- [ ] `hush_mimic_keys_01-04`.
- [ ] `hush_mimic_radio_01-04`.
- [ ] `hush_mimic_instrument_note_01-06` — source-specific when the player has auditioned that family.
- [ ] `hush_monitor_voice_fragment_01-08` — non-spatial, delivered only inside the monitor.
- [ ] `hush_single_note_piano_01-04`, `hush_single_note_marimba_01-04`, `hush_single_note_string_01-04`, `hush_single_note_organ_01-04`.
- [ ] `hush_false_stab_01-08` — quiet, far, ambiguous.
- [ ] `hush_true_stab_01-08` — clear physical/transient event in the building.

### 6.3 Fear and contact — P0/P1

- [ ] `heartbeat_calm_loop`, `heartbeat_fear_loop`, `heartbeat_panic_loop` — phase-compatible or designed for smooth state crossfade; avoid extreme sub energy.
- [ ] `fear_stinger_soft_01-06`.
- [ ] `fear_stinger_close_01-06`.
- [ ] `fear_stinger_reverse_tail_01-06` — designed source, not merely the forward file reversed at runtime.
- [ ] `hush_contact_subjective_01-04`.
- [ ] `hush_contact_world_suck_01-04`.
- [ ] `hush_capture_item_taken`.
- [ ] `hush_capture_time_skip`.
- [ ] `hush_jumpscare_edge_01-04` — reserved for the two-per-run visual budget.

## 7. Empty-room and building ambience

These are not music beds. Each target room must hold up for at least 45 seconds without an obvious loop and must survive exposure in the monitor and playback. Deliver a neutral loop plus independently placeable details.

### 7.1 Five target rooms — P0

For each room, deliver one 90–120 second stereo bed, one alternate bed, and dry mono sweeteners.

- [ ] `room_b3_bed_a/b` — dead studio: very low HVAC/body, foam-muted exterior, equipment thermal ticks.
- [ ] `room_b3_tick_pipe_01-06`, `room_b3_rack_settle_01-06`, `room_b3_building_thud_01-04`.
- [ ] `room_natatorium_dry_bed_a/b` — large tiled air, distant drip, high reflections, no water.
- [ ] `room_natatorium_drip_01-08`, `room_natatorium_tile_tick_01-06`, `room_natatorium_drain_air_01-04`.
- [ ] `room_hall_bed_a/b` — nine-metre volume, seats, stage, long natural decay without performance.
- [ ] `room_hall_seat_creak_01-06`, `room_hall_fly_system_tick_01-06`, `room_hall_wood_check_01-06`.
- [ ] `room_practice_bed_a/b` — many small rooms connected by open doors; close/distant air changes.
- [ ] `room_practice_piano_string_sympathy_01-08`, `room_practice_stand_tick_01-06`, `room_practice_door_settle_01-06`.
- [ ] `room_chapel_bed_a/b` — stone nave, isolated organ wind, exterior weather through damaged clerestory.
- [ ] `room_chapel_stone_tick_01-06`, `room_chapel_snow_window_01-04`, `room_chapel_pew_settle_01-06`.

### 7.2 Supporting spaces — P1/P2

- [ ] `room_dock_bed_a/b` — loading dock and service entrance.
- [ ] `room_foyer_bed_a/b` — public atrium, glass, distant exterior.
- [ ] `room_box_office_bed` — small front-of-house office and paper/cardboard air.
- [ ] `room_plant_bed_a/b` — all plant off, metal cooling, pipe ticks; no live machinery hum that contradicts the script.
- [ ] `room_stair_bed_a/b` — vertical concrete/stone shaft.
- [ ] `room_chapel_outer_bed` — narthex and screen, separate from nave.
- [ ] `room_ringing_room_bed` — ropes, timber, tower wind, bell mass above.
- [ ] `room_bell_chamber_bed` — frame, bearings at rest, exterior through shutters.
- [ ] `room_organ_loft_bed` — high nave perspective.
- [ ] `room_exterior_yard_rain_light`, `room_exterior_yard_rain_heavy`, `room_exterior_yard_rain_transition`.
- [ ] `room_gate_booth_interior_bed` and `room_gate_booth_window_open_bed`.
- [ ] `room_service_road_dawn_bed` — ending exterior.

### 7.3 Flooded natatorium run — P1

- [ ] `water_natatorium_bed_a/b` — black-green still water in a tiled volume.
- [ ] `water_surface_small_ripple_01-08`.
- [ ] `water_surface_beckon_01-06` — ripple with no visible cause.
- [ ] `water_coping_lap_01-06`.
- [ ] `water_deep_body_shift_01-04` — low movement below surface, extremely restrained.
- [ ] `water_choice_approach`, `water_choice_record`, `water_choice_refuse` — small consequence accents, not moral-choice stings.

### 7.4 Building one-shots — P2/P3

- [ ] `building_concrete_settle_near_01-08` and `building_concrete_settle_far_01-08`.
- [ ] `building_metal_duct_tick_01-08`.
- [ ] `building_pipe_cool_tick_01-08`.
- [ ] `building_glass_stress_01-06`.
- [ ] `building_wood_creak_01-08`.
- [ ] `building_distant_door_01-06`.
- [ ] `building_unknown_impact_soft_01-06` and `building_unknown_impact_loud_01-04`.
- [ ] `building_weather_clerestory_01-06`.
- [ ] `building_dead_lift_cable_settle_01-04`.
- [ ] `building_brick_dust_fall_01-04`.

## 8. Playable props and physical objects

The visible object must make the sound. Do not assign a broad musical excerpt to a single touched key, bar, drumhead, string, speaker cone, or organ control.

### 8.1 Instrument one-shots — P0/P1

- [ ] `piano_upright_key_soft_01-08`, `piano_upright_key_medium_01-08`, `piano_upright_bad_key_01-04`.
- [ ] `piano_grand_key_soft_01-06`, `piano_grand_key_medium_01-06`, `piano_grand_string_sympathy_01-04`.
- [ ] `marimba_bar_soft_01-08`, `marimba_bar_medium_01-08`, `marimba_dented_resonator_01-04`.
- [ ] `timpani_finger_tap_01-06`, `timpani_mallet_soft_01-06`, `timpani_pedal_tension_01-04`.
- [ ] `cello_string_pluck_01-06`, `cello_body_knock_01-04`, `cello_string_scrape_01-04`.
- [ ] `violin_string_pluck_01-06`, `violin_body_touch_01-04`, `violin_string_scrape_01-04`.
- [ ] `speaker_cone_press_01-04`, `speaker_cone_release_01-04`, `speaker_playback_click_01-04`.
- [ ] `organ_key_no_wind_01-04`, `organ_stop_pull_01-04`, `organ_key_impossible_tone_01-06`, `organ_pipe_impossible_breath_01-04`.

Pitch does not need a full chromatic library. It does need enough neighboring notes that repeat interactions and multiple props do not all sound identical.

### 8.2 Furniture and inspection Foley — P2/P3

Inspections do not all need a sound. Trigger these only when the text describes touch or motion.

- [ ] `chair_move_wood_01-06`, `chair_caster_move_01-06`, `chair_settle_01-06`.
- [ ] `music_stand_fold_01-04`, `music_stand_height_clutch_01-04`, `music_stand_tap_01-04`.
- [ ] `instrument_case_latch_01-04`, `instrument_case_empty_shift_01-04`.
- [ ] `equipment_cart_wheel_bad_01-04`, `equipment_cart_frame_rattle_01-04`.
- [ ] `desk_hand_contact_01-04`, `desk_tape_peel_01-03`.
- [ ] `pew_hand_slide_01-04`, `pew_kneeler_missing_bracket_01-03`.
- [ ] `portrait_glass_touch_01-03`, `frame_creak_01-03`.
- [ ] `ticket_grille_rattle_01-03`, `cash_drawer_dead_01-03`, `receipt_paper_pull_01-03`.
- [ ] `queue_rope_clip_01-03`, `queue_rope_tension_01-03`.
- [ ] `pool_lane_reel_half_turn_01-04`, `pool_float_crack_01-03`.
- [ ] `plant_valve_wired_stop_01-03`, `plant_pipe_hand_tap_01-04`.
- [ ] `tuning_fork_pickup_01-03`, `bent_recorder_pickup_01-03`.

## 9. Tuning fork and bent recorder

### 9.1 Tuning fork — P1

- [ ] `fork_strike_knee_01-04` — impact separated from tone.
- [ ] `fork_a440_close_01-04` — real fork fundamental and upper body, dry mono.
- [ ] `fork_a440_room_held_loop` — seamless continuation after the physical fork is damped.
- [ ] `fork_damp_hand_01-04` — steel stopped by fingers/palm.
- [ ] `fork_tone_detaches` — tone remains when the steel stops.
- [ ] `fork_tone_room_release` — held A stops all at once.
- [ ] `fork_false_text_reveal_01-04` — battle/source use; resonant text vibration, not magic sparkle.
- [ ] `fork_finale_once` — the room loses the line it was using to stand upright.

### 9.2 Circuit-bent recorder/feedback rig — P1

- [ ] `rig_case_open_01-03`, `rig_wire_handle_01-04`, `rig_patch_insert_01-04`, `rig_patch_remove_01-04`.
- [ ] `rig_cable_unwind_01-04`.
- [ ] `rig_feedback_start_01-03`.
- [ ] `rig_feedback_loop_a/b` — controlled, mixable, non-painful feedback states.
- [ ] `rig_feedback_instability_01-04`.
- [ ] `rig_output_to_input_latch`.
- [ ] `rig_signal_inversion`.
- [ ] `rig_feedback_choke_off`.
- [ ] `rig_graft_word_restore_01-04` — redaction battle tool.
- [ ] `rig_finale_room_playback` — room plays back into itself.

## 10. Redaction battles

These effects must remain fast, dry, and readable under dialogue and typing. Avoid arcade UI tones; use paper, ink, grease pencil, razor/scrape, tape transport, and impossible counter-actions.

### 10.1 Navigation and player actions — P0

- [ ] `battle_cursor_word_01-04` — mechanical indexing; lighter than menu navigation.
- [ ] `battle_blackout_start_01-03`, `battle_blackout_drag_01-06`, `battle_blackout_end_01-03`.
- [ ] `battle_blackout_single_01-06` — keyboard/controller toggle.
- [ ] `battle_undo_blackout_01-04`.
- [ ] `battle_read_submit_01-03` — recorder/transport action, not a generic confirm.
- [ ] `battle_read_valid_01-04` — claim loses coherence; restrained.
- [ ] `battle_read_invalid_01-04` — paper/text refuses the reading.
- [ ] `battle_no_tool_01-03` — fork/rig action attempted without the item.
- [ ] `battle_tool_no_target_01-03`.

### 10.2 Opponent counter-actions — P0/P1

- [ ] `battle_opponent_blackout_01-06` — other hand, different texture from player ink.
- [ ] `battle_opponent_scrape_start_01-03`, `battle_opponent_scrape_drag_01-06`, `battle_opponent_scrape_end_01-03`.
- [ ] `battle_opponent_insert_word_01-06` — text grafted into the page.
- [ ] `battle_opponent_wait_01-04` — subtle pressure when no visible move occurs.
- [ ] `battle_hidden_text_reveal_01-04` — tuning fork.
- [ ] `battle_signal_word_graft_01-04` — bent rig.
- [ ] `battle_round_start_01-04` — far room opens/returns.
- [ ] `battle_player_composure_loss_01-04`.
- [ ] `battle_enemy_claim_break_01-04`.
- [ ] `battle_win_take_settle`.
- [ ] `battle_lose_take_die`.
- [ ] `battle_final_claim_break`.

### 10.3 Encounter-specific sound — P1

- [ ] `battle_natatorium_step_far_01-04` — one step returned four times by tile.
- [ ] `battle_natatorium_return_taps_01-04` — thinning reflection layers.
- [ ] `battle_practice_music_far_a/b/c` — distant phrase beds made for the scene, not pulled randomly from the retired catalogue.
- [ ] `battle_hall_house_return_a/b` — long architectural answer.
- [ ] `battle_hall_voice_uses_return_01-04` — treated nonverbal/word-edge layers.
- [ ] `battle_chapel_organ_impossible_a/b` — blower off, organ sounding.
- [ ] `battle_chapel_pew_return_01-04` — four increasingly certain reflections.
- [ ] `battle_chapel_face_on` and `battle_chapel_face_off` — identity/presence layers, not literal masks.

## 11. Source-space chapter

### 11.1 Hall and paper field — P1

- [ ] `source_hall_bed_a/b` — corridor made of clauses; stable enough for traversal.
- [ ] `source_page_wall_rustle_near_01-08` and `source_page_wall_rustle_far_01-08`.
- [ ] `source_page_collect_01-06` — pages accumulating along walls as distance advances.
- [ ] `source_turn_back_scare_01-04` — current scare callback replacement.
- [ ] `source_haystack_bed` — dense paper field.
- [ ] `source_page_found_lift_01-04` — printed source rises before paper.
- [ ] `source_page_hand_contact_01-04`.
- [ ] `source_paper_landscape_transform_in`.
- [ ] `source_paper_landscape_transform_loop`.
- [ ] `source_paper_landscape_transform_out`.

### 11.2 Landmarks and actions — P1

- [ ] `source_landmark_focus_01-04` — extremely quiet bearing aid.
- [ ] `source_landmark_inspect_01-04`.
- [ ] `source_landmark_unavailable_01-03` — call site not reached.
- [ ] `source_fork_acquire`.
- [ ] `source_fork_tune_01-06`.
- [ ] `source_false_line_shiver_01-06`.
- [ ] `source_recorder_capture_01-04` — transport plus source response.
- [ ] `source_recordist_loop_01-04`, `source_surfer_loop_01-04`, `source_work_order_loop_01-04`, `source_body_return_01-04` — short signature responses, not full music cues.
- [ ] `source_checkpoint_set_01-03` — subtle source stabilization.
- [ ] `source_hush_hunt_begin`.
- [ ] `source_hush_hunt_near_01-04`.
- [ ] `source_hush_checkpoint_catch_01-04`.

### 11.3 Final page/redaction — P1

- [ ] `source_final_page_arrive`.
- [ ] `source_clause_lift_01-04` — first interaction arms a redaction.
- [ ] `source_redaction_cancel_01-03` — look away/cancel.
- [ ] `source_redaction_confirm_01-03` — second deliberate interaction.
- [ ] `source_word_black_body_borrowed`, `source_word_black_return_inside`, `source_word_black_surfer` — three consequence colors sharing a common physical base.
- [ ] `source_body_release` — saved-recordist route.
- [ ] `source_wound_close` — best-eligible route.
- [ ] `source_fold_back` — standard completion.

### 11.4 Datamosh crossing — P1

- [ ] `transition_datamosh_bed` — reversible, scrub-friendly source.
- [ ] `transition_forward_layers_01-04` — exposed progressively with forward hold.
- [ ] `transition_reverse_layers_01-04` — coherent when scrubbing backward; do not simply reverse speech.
- [ ] `transition_hold_freeze` — tiny transport lock when input stops.
- [ ] `transition_commit_tower` — image/audio resolves into ringing room.
- [ ] `transition_source_tail` and `transition_tower_pre_echo` — crossfade endpoints.

## 12. Bell tower and change ringing

### 12.1 Final bell strike bank — P1

- [ ] `bell-01-hand-01.wav` through `bell-08-back-01.wav` — minimum 16 genuine moving-bell handstroke/backstroke one-shots.
- [ ] Variations `02-04` for every bell and stroke — ideal 64-file bank.
- [ ] At least 12-second clean tails; 18–20 seconds for the tenor.
- [ ] Mono 48 kHz, 24-bit PCM or 32-bit float; identical mic position, polarity, gain structure, and contact alignment.
- [ ] Exact clapper/casting contact at sample zero or exact `contactOffsetSamples` in the manifest.
- [ ] Common physical gain reference; no per-bell loudness normalization.

Keep the current clock-hammer prototype only until these validate and decode.

### 12.2 Clock hammer — P1

- [ ] `bell_tenor_clock_hammer_lift_01-04`.
- [ ] `bell_tenor_clock_hammer_contact_01-04` — stationary hammer-specific attack.
- [ ] `bell_tenor_clock_toll_01-04` — down-bell tonal tails, separate from moving tenor strokes.
- [ ] `bell_tenor_clock_linkage_return_01-04`.
- [ ] `bell_hammer_isolator_lever_01-04`.
- [ ] `bell_hammer_linkage_tension_fall_01-04`.
- [ ] `bell_hammer_isolator_refuse_01-03` — already isolated/under wrong state.

### 12.3 Full-circle mechanisms — P1/P2

For treble/light, middle, and tenor/heavy weight classes, record:

- [ ] `bell_rope_hand_pull_<class>_01-06`.
- [ ] `bell_rope_back_pull_<class>_01-06`.
- [ ] `bell_sally_hand_pass_<class>_01-06`.
- [ ] `bell_rope_tail_whip_<class>_01-06`.
- [ ] `bell_wheel_run_<class>_01-06`.
- [ ] `bell_bearing_load_<class>_01-06`.
- [ ] `bell_headstock_frame_impulse_<class>_01-06`.
- [ ] `bell_stay_slider_contact_<class>_01-06`.
- [ ] `bell_clapper_precontact_<class>_01-04`.
- [ ] `bell_frame_sympathy_01-08` — shared structure reacting to the touch.

### 12.4 Shutters, winch, and standing — P1

- [ ] `tower_winch_handle_take_01-04`.
- [ ] `tower_winch_pawl_lift_01-04`.
- [ ] `tower_winch_pawl_refuse_01-04` — stop requested off boundary/under load.
- [ ] `tower_winch_strain_loop`.
- [ ] `tower_shutter_release_01-04`.
- [ ] `tower_shutter_open_run_loop`.
- [ ] `tower_shutter_chain_01-06`.
- [ ] `tower_shutter_open_stop_01-04`.
- [ ] `tower_exterior_air_open` — exterior perspective appears as shutters open.
- [ ] `bell_rounds_resolve` — optional mix transition, not a musical cadence pasted over the actual ring.
- [ ] `bell_stand_treble_01-03`, `bell_stand_middle_01-03`, `bell_stand_tenor_01-03`.
- [ ] `bell_last_frame_settle_01-04`.
- [ ] `tower_service_leaf_release_01-03`.

### 12.5 Bell chamber acoustics — P2/P3

- [ ] Impulse responses or swept responses for ringing room, bell chamber closed, bell chamber shutters open, chapel nave, organ loft, and exterior.
- [ ] `tower_room_rope_idle_01-04`.
- [ ] `tower_frame_idle_creak_01-06`.
- [ ] `tower_wind_shutters_closed_a/b` and `tower_wind_shutters_open_a/b`.
- [ ] `tower_collision_bell_01-04`, `tower_collision_wheel_01-04`, `tower_collision_frame_01-04` — player failure, followed by cut/restart.

## 13. Scripted story and ending effects

### 13.1 Opening/cold open — P1/P2

- [ ] `typing_mechanical_source` — enough clean key, space, shift, and carriage fragments to drive the existing granular typing system without obvious repetition.
- [ ] `guard_pen_search_01-04` and `guard_pen_fail_01-04`.
- [ ] `guard_book_turn_01-04`, `guard_book_finger_run_01-03`.
- [ ] `guard_chair_stand_01-03`.
- [ ] `archive_chair_move_01-03` and `archive_man_stand_01-03` — material on the old take.
- [ ] `archive_tape_cryptic_room_bed`.
- [ ] `kit_inventory_sequence` — torch, recorder, headphones, radio, keys, order as separable layers, not one fixed montage.
- [ ] `title_world_drop` — optional transition into title, preserving the song as music.

### 13.2 Take milestones — P1

- [ ] `take_clean_room_seal_01-03`.
- [ ] `take_spoil_quiet_01-04` and `take_spoil_loud_01-04`.
- [ ] `take_environmental_tenor_far` — real clock-hammer tenor at building distance.
- [ ] `take_hush_instrument_wake` — source begins somewhere in the building.
- [ ] `take_hush_instrument_silence_01-04`.
- [ ] `take_return_to_recorder` — resume marker.
- [ ] `take_guest_crosses_threshold_01-04` — no explicit sting; an optional imperceptible mix inflection only.

### 13.3 Finale/inversion/collapse — P1

- [ ] `chapel_organ_choke_off`.
- [ ] `building_first_wall_release` — first structural failure below.
- [ ] `demolition_clock_start`.
- [ ] `demolition_clock_loop` — diegetic urgency, not a score clock.
- [ ] `building_collapse_distant_01-06`, `building_collapse_mid_01-06`, `building_collapse_near_01-06`.
- [ ] `building_beam_failure_01-04`, `masonry_run_01-04`, `glass_fall_01-04`, `dust_debris_01-06`.
- [ ] `escape_route_door_fail_01-04`.
- [ ] `escape_waypoint_blink_out` and `escape_waypoint_redraw` — trusted device language, distinct from HUSH false notifications.
- [ ] `escape_rescue_door_open`.
- [ ] `escape_threshold_pass`.
- [ ] `yard_absent_reveal` — exterior expectation drops into impossible space.
- [ ] `clock_restart_blank`.
- [ ] `recordist_laugh_detach` — performance/design split: laugh stops at source, continuation remains in the space.

### 13.4 Sacrifice, surfaced, drugged, and guard returns — P2

- [ ] `sacrifice_recorder_click_off`.
- [ ] `sacrifice_seal_close` — slow architectural pressure, no explosion.
- [ ] `surfaced_chapel_service_door_open`.
- [ ] `surfaced_body_release`.
- [ ] `drugged_headphones_on`, `drugged_night_playback_start`, `drugged_bad_take_steps`, `drugged_bad_take_breath`.
- [ ] `guard_ledger_returned_write_01-03`.
- [ ] `guard_second_man_sit_01-03`.
- [ ] `client_account_close_signature_01-03`.
- [ ] `demolition_machines_far_start` — only if the ending actually presents the machines audibly.

## 14. UI, menus, progression, and application feedback

UI sounds should share the recorder/tape-machine material language. The current oscillator clicks can remain as prototypes, but the shipped interface should use recorded relays, transport buttons, detents, head movement, and low tape noise.

### 14.1 Core menu vocabulary — P1/P2

- [ ] `ui_menu_open_01-03` and `ui_menu_close_01-03`.
- [ ] `ui_move_01-06` — selection.
- [ ] `ui_tab_prev_01-04` and `ui_tab_next_01-04`.
- [ ] `ui_confirm_01-04`.
- [ ] `ui_back_01-04`.
- [ ] `ui_disabled_01-04`.
- [ ] `ui_destructive_arm_01-03`, `ui_destructive_confirm_01-03`, `ui_destructive_cancel_01-03`.
- [ ] `ui_toggle_on_01-04`, `ui_toggle_off_01-04`.
- [ ] `ui_value_up_01-04`, `ui_value_down_01-04`, `ui_value_limit_01-03`.
- [ ] `ui_slider_tick_01-06`.
- [ ] `ui_menu_hiss_loop` — low stable service-machine bed.

### 14.2 Screen-specific feedback — P2

- [ ] `ui_title_wake` — audio gate/title machine powers up.
- [ ] `ui_new_run_arm`, `ui_new_run_confirm`.
- [ ] `ui_pause_enter`, `ui_pause_resume` — currently silent in the pause scene.
- [ ] `ui_settings_enter`, `ui_settings_apply`, `ui_settings_test`.
- [ ] `ui_controller_remap_begin`, `ui_controller_remap_input`, `ui_controller_remap_saved`, `ui_controller_remap_conflict`.
- [ ] `ui_mic_permission_request`, `ui_mic_test_start`, `ui_mic_test_pass`, `ui_mic_unavailable`.
- [ ] `ui_bag_section_kit`, `ui_bag_section_map`, `ui_bag_section_files`.
- [ ] `ui_document_open`, `ui_document_close` — may layer the physical paper assets.
- [ ] `ui_archive_open`, `ui_archive_close`, `ui_archive_category`.
- [ ] `ui_difficulty_locked`, `ui_difficulty_select`, `ui_difficulty_confirm`.
- [ ] `ui_return_report_page`, `ui_return_report_action`.
- [ ] `ui_credits_begin`, `ui_credits_skip`, `ui_credits_end` — only if not covered by score transitions.

### 14.3 Trusted progression signals — P1/P2

These must never be imitated by HUSH mischief.

- [ ] `ui_autosave_write_01-03` — very quiet; do not fire on every position commit.
- [ ] `ui_checkpoint_01-03`.
- [ ] `ui_objective_filed_01-03`.
- [ ] `ui_waypoint_set_01-03`, `ui_waypoint_clear_01-03`.
- [ ] `ui_item_obtained_01-03`.
- [ ] `ui_equipment_missing` and `ui_equipment_recovered`.
- [ ] `ui_take_added_01-03`.
- [ ] `ui_room_complete_01-03`.
- [ ] `ui_achievement_unlock_01-04` — current menu-confirm reuse should be replaced.
- [ ] `ui_feature_unlock_01-03`.
- [ ] `ui_run_certified` and `ui_run_not_certified`.

### 14.4 System/error states — P2

- [ ] `ui_audio_recovered` and `ui_audio_failed`.
- [ ] `ui_save_exported`, `ui_save_imported`, `ui_save_import_error`.
- [ ] `ui_profile_cleared_arm`, `ui_profile_cleared_confirm`.
- [ ] `ui_fullscreen_enter`, `ui_fullscreen_exit` — optional and subtle.
- [ ] `ui_quit_arm`, `ui_quit_cancel`.
- [ ] `ui_lens_calibration_start`, `ui_lens_calibration_step`, `ui_lens_calibration_ready`, `ui_lens_calibration_error`.

## 15. Compact replacement for the pruned 2D catalogue

This is the bank needed to preserve story-mode systems after most of the 300-file catalogue leaves. It is intentionally finite. It is a delivery cut line assembled from the relevant items above, not an additional duplicate set.

### 15.1 Dedicated transient bank — P0/P1

- [ ] 12 `stab_true` files — real building/material events with clear attacks.
- [ ] 12 `stab_false` files — ambiguous, low-detail, distant events.
- [ ] 8 `playback_guest` beds/fragments — room-like material able to rise under a take.
- [ ] 6 `battle_far_music` phrases — two each for practice, hall, and chapel contexts.
- [ ] 6 `hush_instrument_mimic` designed phrases — made from the isolated prop bank.

### 15.2 Target-room content bank — P0

- [ ] Two long beds for each of the five recording rooms: 10 files.
- [ ] Six dry sweetener families per room with four variations: 120 one-shots.
- [ ] One monitor-perspective EQ/IR profile per room.
- [ ] One playback-perspective profile per room.

### 15.3 Prop bank — P0/P1

- [ ] 12 upright/grand piano notes and faults.
- [ ] 10 marimba notes and resonator faults.
- [ ] 8 timpani taps/hits/tension sounds.
- [ ] 12 cello/violin plucks, scrapes, and body touches.
- [ ] 8 organ no-wind/impossible sounds.
- [ ] 6 speaker/cone/device sounds.

These compact banks replace the gameplay jobs of the retired catalogue. They do not need to preserve the old world IDs or 64-file-per-world symmetry unless the non-story sample-surfing mode is explicitly retained as a separate product requirement.

---

# Production standards

## File format

- World one-shots: mono WAV/BWF, 48 kHz, 24-bit PCM or 32-bit float.
- First-person close layers: mono or restrained stereo WAV/BWF, 48 kHz, 24-bit.
- Ambience beds: stereo WAV/BWF, 48 kHz, 24-bit, seamless and at least 90 seconds where practical.
- Impulse responses: mono-to-stereo or true stereo WAV, 48 kHz, clearly documented routing.
- Keep at least 6 dBFS of peak headroom on raw effects; high-energy bells and collapse elements should have more.
- Do not loudness-normalize variations independently.
- Do not bake master limiting, denoising, broad compression, or unrelated room reverb into dry world effects.
- Preserve pre-roll where it is physically meaningful, but provide exact sync/contact markers for bells, UI, impacts, and transport actions.

## Variation and editing

- Repetitive actions need at least four variations; footsteps, page turns, keys, radio squelches, and battle marks need six to eight.
- Never create variation only by pitching one master file. Record physical variations first; runtime pitch can add a narrow secondary range.
- Keep attack timing consistent within a round-robin family.
- Provide clean tails. Do not hard-cut doors, impacts, bells, or large-room reflections.
- Loops must be click-free and supplied with loop points in the filename metadata or manifest.
- Split compound montages into layers whenever the runtime may need to change order, timing, distance, or perspective.

## Naming

Use:

```text
<system>_<object-or-space>_<action>_<condition>_<variation>.wav
```

Examples:

```text
step_chapel_stone_slow_03.wav
recorder_transport_rec_press_02.wav
door_service_fire_single_close_impact_01.wav
radio_squelch_open_haunted_04.wav
battle_opponent_scrape_drag_05.wav
```

Bell tonal files retain the manifest contract:

```text
bell-<01-08>-<hand|back>-<01-04>.wav
```

## Mix and implementation boundaries

- A semantic gameplay noise event and its audible file are separate contracts. Missing or muted output must not make a footstep, radio, door, or bell inaudible to the HUSH simulation.
- World sounds need source positions, distance falloff, occlusion, floor/room transmission, and correct room sends.
- Player-body and headphone sounds stay centered or narrowly stereo; do not spatialize them into the room.
- HUSH mischief may imitate ordinary world sounds, but never autosave, objective, achievement, menu, or accessibility feedback.
- Monitoring and playback need their own routing/perspective, not duplicated dry output at lower gain.
- The optional real-room microphone is analysis-only. Never route, record, save, or play the user's microphone audio.
- Accessibility mixes must cap sudden cuts, vacuum effects, tinnitus, high-frequency radio noise, and high-energy stingers.

# Acceptance passes

- [ ] Walk every material in slow, ordinary, and injured states; no surface should sound like another after two steps.
- [ ] Operate monitor, roll, stop, stall, resume, complete, spoil, abort, and playback with the HUD hidden; every state must remain identifiable.
- [ ] Open and close one of every door archetype; construction, weight, closer, latch, and acoustic transition must agree with the animation.
- [ ] Hear a belt radio squelch and a dropped distant squelch; location and gameplay consequence must be obvious.
- [ ] Complete a clean take and a spoiled take using headphones; transport, room bed, hiss, and HUSH pressure must not mask one another.
- [ ] Play every interactive instrument; the visible contact must match the audible object.
- [ ] Run every redaction action rapidly; no sound may smear the next input or cover dialogue.
- [ ] Complete the source-space chapter forward and backward through the datamosh crossing; audio must scrub or crossfade coherently.
- [ ] Verify moving-bell contact and audio align at handstroke and backstroke for all eight bells.
- [ ] Verify the tower remains intelligible with shutters closed, opening, and open, and that mechanisms do not disappear beneath bell tails.
- [ ] Play all major endings; collapse, false door, sacrifice, surfaced, and return-to-booth routes must each have a complete audio arc.
- [ ] Remove the pruned 2D bank in a test build; no story interaction, HUSH cue, battle, prop, take, or playback should silently depend on it.

# Repository touchpoints covered by this audit

- One-shot and story cue routing: `src/audio/cues.js`, `src/audio/story-audio.js`, `content/audio/audio-project.audio.json`.
- Semantic gameplay noise: `src/audio/acoustic-catalogue.js`, `src/audio/acoustic-events.js`, `src/game/recordist.js`.
- Movement and fear: `src/main.js`, `src/audio/roomtone.js`, `src/audio/fear.js`, `src/game/presence.js`.
- HUSH presentation and mischief: `src/audio/hush-mix.js`, `src/game/hush-audio-runtime.js`, `src/data/hush-cues.js`.
- Doors and materials: `src/data/conservatory-doors.js`, `src/data/floorplan/legend.js`, `src/data/floorplan/conservatory.js`.
- Props and instruments: `src/data/conservatory-props.js`, `src/game/props.js`.
- Recorder/playback/radio: `src/game/playback.js`, `src/game/radio.js`, `src/data/radio-script.js`.
- Redaction encounters and story moments: `src/game/battle.js`, `src/data/battles.js`, `src/data/conservatory-script.js`.
- Source-space and tower: `src/game/source-space-runtime.js`, `src/game/source-tower-transition-scene.js`, `src/game/bell-tower-runtime.js`, `src/audio/bell-tower-audio.js`.
- Menus and progression: `src/game/title.js`, `src/game/pause.js`, `src/game/settings.js`, `src/game/bag.js`, `src/game/archive.js`, `src/game/return-report.js`.

---

# Dialogue-timed sound-design extension

Status: additive cue sheet; the production brief above remains unchanged

Audit basis: all current canonical narrative documents plus runtime-authored source-space, natatorium-water, tower, take, HUSH-instrument, collapse, and ending speech

This extension covers non-dialogue sounds that occur during dialogue, thoughts, stage directions, playback presentation, battle talk, source-space inspection text, tower narration, and endings. It does not add spoken dialogue, replace performances, or propose a sound merely because a noun appears in a sentence. It identifies physical actions, acoustic evidence, state changes, perspective changes, and authored absences that should happen at the exact point the sentence describes them.

The existing `cue`/`cues` fields fire when a line begins. That is not precise enough for lines such as “He finds a pen... it doesn't work. He puts it back in the pot”, “The organ chokes off. Somewhere below, the first wall lets go”, or “The last bell reaches the balance and comes down”. Those lines contain ordered events. Their sounds should follow the prose rather than arrive as a montage before the first word.

## Dialogue-sound priority

| Rank | Family | Why it wins |
|---:|---|---|
| 1 | Physical actions named by stage directions | A visible or narrated touch, click, step, drop, switch, door, transport action, or impact feels broken if it is silent or early. |
| 2 | Acoustic evidence the protagonist reasons from | Wet footsteps, four returns, a flat meter, impossible piano notes, radio carrier behaviour, and the held A are plot facts, not decoration. |
| 3 | Perspective and state transitions | Headphones on/off, monitor open/closed, playback rising under the floor, signal becoming room, and silence returning must be audible exactly where the text turns. |
| 4 | Consequence sequences | Take death, organ choke, first wall release, clock start, false-door slip, shutters opening, bells standing, and body release need ordered multi-event cues. |
| 5 | Quiet continuity Foley | Paper, coat, cup, chair, recorder and bag details make long dialogue scenes inhabit a physical place without becoming a Foley demonstration. |
| 6 | Psychological design accents | Face changes, source clauses, agreement pressure and impossible continuity can be designed, but they must remain subordinate to prose and evidence. |

## Cue-authoring contract required for best polish

Keep the current line-level `cue` field as a compatibility shorthand for a sound at character zero. Add an ordered `soundEvents` array to a line for internal timing. A production-ready event needs a stable ID and a text anchor, not only a guessed delay from line start.

Recommended authoring shape:

```json
{
  "id": "start.line.7",
  "who": "direction",
  "text": "He finds a pen... it doesn't work. He puts it back in the pot with the others.",
  "soundEvents": [
    {
      "id": "pen-search",
      "cue": "guard_pen_search",
      "anchor": "finds a pen",
      "edge": "start",
      "importance": "essential"
    },
    {
      "id": "pen-fails",
      "cue": "guard_pen_fail",
      "anchor": "doesn't work",
      "edge": "start",
      "importance": "essential"
    },
    {
      "id": "pen-return",
      "cue": "booth_pen_pot_return",
      "anchor": "back in the pot",
      "edge": "start",
      "importance": "detail"
    }
  ]
}
```

Authoring and playback rules:

- [ ] Resolve `anchor` against the final interpolated line and store its start/end character positions when the line begins. Validation must fail on a missing or ambiguous anchor.
- [ ] Fire on the reveal/voice cursor crossing the chosen anchor edge. `edge: start` suits an action; `edge: end` suits a result becoming audible.
- [ ] Allow `offsetMs` only for final micro-adjustment after the semantic anchor; do not make milliseconds the primary authoring contract.
- [ ] Support `mode: one-shot`, `start-loop`, `stop-loop`, `crossfade`, `duck`, and `snapshot`. A line may start a bed at one phrase and stop it at another.
- [ ] Support `importance: essential`, `support`, and `detail`. Essential events change story or physical state; support events explain acoustic evidence; detail events may be dropped under acceleration.
- [ ] Give each event a stable ID within its stable narrative line ID. Save/replay state deduplicates by `document + line + event`, never by filename.
- [ ] If unseen text is instantly revealed, fire all unfired essential events in authored order with at least 80–120 ms between physical transients. Fire the final required state of loops and snapshots. Detail events may be omitted.
- [ ] If seen-text assistance accelerates a line, preserve essential events, shorten long transitions, and omit only details that would machine-gun.
- [ ] If the player advances after the line has completed, do not replay events. If a line is revisited in a new conversation visit, follow its explicit `replay: always|once-per-visit|once-per-run` policy.
- [ ] Stop or release line-owned loops when the line, node, scene, or application focus ends unless a later event explicitly takes ownership.
- [ ] A cue scheduled inside voiced dialogue must follow the same speech-progress cursor used for visible text. Do not estimate from text length independently of the voice.
- [ ] World sounds carry authored source position and room send. Player handling is narrow stereo. Playback/tape evidence stays inside the headphone path unless the prose explicitly says it leaves the transport.
- [ ] Add caption metadata for important non-speech events, including direction, distance, material, and repetition count where narratively useful: `[wet footstep, deep end]`, `[radio carrier remains open]`, `[four thinning returns]`.
- [ ] Do not caption deliberate absence as a sound. Use state captions such as `[the carrier cuts out]` only where the loss itself is essential and accessibility settings request it.
- [ ] Dialogue ducking must expose evidence rather than crush it. Essential effects may briefly carve 2–4 dB from speech-adjacent beds, but no effect should mask a required spoken word.
- [ ] `conversation.js`, `speech.js`, and `battle.js` need the same event scheduler and skip semantics. Source-space runtime speech and finale presentation must feed that scheduler rather than creating a fourth timing model.

## Cue-sheet notation

- **Existing** means the source asset or family is already requested above; this extension adds an authored dialogue placement.
- **New** means an additional source recording or designed element is required.
- **Mix** means a transition, perspective render, automation, or combination made from existing sources; it should still receive a stable cue ID.
- Text in quotation marks is the in-line anchor. IDs before the colon are current canonical line IDs unless the beat is runtime-authored.
- Where named and unnamed documents share a line ID and action, one cue design covers both.

---

## 16. Cold open and service booth dialogue cues

### 16.1 Booth establishment and first exchange — P0/P1

- [ ] `start.line.1`, at “lit booth” → **Mix** open `room_gate_booth_window_open_bed`; at “television with the sound off” → preserve muted screen electrical presence only, with no programme audio.
- [ ] `start.line.2`, at “stand on it” → **Existing** one careful `step_service_concrete_stop`; keep `room_exterior_yard_rain_light` outside the booth glass.
- [ ] `start.line.7`, at “finds a pen” → **Existing** `guard_pen_search_01-04`; at “doesn't work” → `guard_pen_fail_01-04`; at “back in the pot” → **New** `booth_pen_pot_return_01-04`, a small plastic/metal clatter.
- [ ] `start.line.9`, at “Rain bounces off the roof” → **Mix** bring the booth-roof rain close; at “skips out in the yard” → add a wider galvanised-metal rain return; at “keep closer to the window” → **Existing** restrained coat/boot shift.
- [ ] `start.line.14`, at “coffee” → no automatic cup sound: the guard only offers it here. The physical pour belongs to the coffee branch.
- [ ] `coldopen.condensed.01`, at “already on the glass” → **Existing** `paper_slide_under_glass_01-03`, extremely restrained; the repeated booth/rain bed does the continuity work.

### 16.2 Torch branch — P0

- [ ] `torch.line.1`, at “thumb it on” → **Existing** `torch_switch_on_01-04`; hold a tiny palm-muted handling layer; at “and off again” → `torch_switch_off_01-04`.
- [ ] `torch.line.2`, at “Cells are good” → **New** `torch_cells_full_hand_weight_01-03`, an almost inaudible cell/hand settle, only if it reads at close perspective without implying loose batteries.
- [ ] `torch.dark.line.3`, after “A torch makes no noise” and exactly on the interrupted “it–” → **Existing** a single dry `torch_switch_on` or `torch_body_tap`, demonstrating the tiny noise under discussion without becoming comic.
- [ ] `torch.dark.line.4`, at “It clicks” → **Existing** close switch click; at “You sweep it” → coat/shoulder movement crosses narrow stereo once; at “on your breath” → one calm breath, not a fear breath.
- [ ] `torch.him.line.3`, at “did my rounds” → do not add literal retrospective footsteps or van sound. Keep the rain and booth present.
- [ ] `torch.him.line.4`, at “briefly heavier” → **Existing/Mix** crossfade to `room_exterior_yard_rain_heavy`; at “then lifts” → return to light rain over roughly 700 ms.

### 16.3 Coffee, order, guard and ledger — P1/P2

- [ ] `coffee.line.1`, at “fills a second cup” → **New** `booth_coffee_pour_01-03` plus `booth_coffee_cup_fill_01-03`; at “slides it across the form” → **Existing** `booth_coffee_cup_set` layered with short paper drag.
- [ ] `order.line.1`, at “letterhead” → **Existing** `work_order_unfold`; at “signature block” → quiet fingertip/paper flatten; do not add a magical reveal sound to the photocopied smudge.
- [ ] `order.words.line.1`, sound only the real paper under the hand. The quoted clauses are read, not re-enacted.
- [ ] `order.client.line.2`, `order.deadline.line.1`, and `order.money.line.2` stay physically in the booth. No post-box, demolition, phone-notification, website, traffic, or job-board flashback effects.
- [ ] `order.last.paid.line.3`, at “sent it to you” → paper lift; at “First-class post” → no post-box sound; at “waiting to be posted” → **Existing** `work_order_refold`.
- [ ] `guard.line.3`, at “turns the television down” → **Existing** `booth_television_muted_touch_01-03`; the important result is that no audio level changes.
- [ ] `guard.last.line.4`, at “turns the form around” → **Existing** `form_turn_on_glass`; at “taps a box” → `finger_tap_form`.
- [ ] `guard.name.line.3`, at “turns the book around” → `guard_book_turn`; at “runs a finger up the column” → `guard_book_finger_run`.
- [ ] `guard.know.line.5`, at “He laughs” → **New** `guard_private_laugh_01-03`, a short local performance separate from the distant laugh on the radio/archive.

### 16.4 Previous recordist archive — P0/P1

- [ ] `tape.line.1`, at “Four files on the card” → **New** `archive_card_mount_01-03`; at “Three are slated” → three tiny file-index detents, not three play starts; at “Take three is already running” → start `tape_transport_run_loop` and `archive_tape_cryptic_room_bed`.
- [ ] `tape.line.2`, the slate is dialogue; underpin it only with the established take hiss and room.
- [ ] `tape.line.3`, at “Sixty clean seconds” → let the dry room bed occupy the line without a sting.
- [ ] `tape.line.5`, at “A chair” → `archive_chair_move_01-03`; at “He stands up” → `archive_man_stand_01-03` plus slight clothing rise.
- [ ] `tape.slate.line.3`, at “flip the tape” → `tape_flip_01-03`; at “Take four” → transport re-engage into the unslated take.
- [ ] `tape.run.line.2`, at “does not end” → **Mix** extend the transport and room bed past the expected stop, with a very small expected-end relay that fails to arrive; do not add a horror sting.
- [ ] `tape.run.line.11`, at “Thirty seconds of the room” → restore the exact earlier room-bed level; the unchanged level is evidence.
- [ ] `tape.run.line.12`, on “Come closer” → no non-dialogue sting; allow only a subtle headphone-image narrowing after the word.
- [ ] `tape.run.line.13`, at “Vague nothings” → **Existing** `playback_guest_mouth_noise` and `playback_guest_room_smear`, unintelligible and below the next line.
- [ ] `tape.run.line.15-17` → three progressively longer pockets of the same room, not three tonal risers. The text's dots are duration, not impacts.
- [ ] `tape.run.again.line.1`, at “Back forty seconds” → `tape_rewind_start`, loop and stop; after “The room” → bed resumes; at “chair” and “man standing up” → replay the exact same source events, sample-identical and level-identical.
- [ ] `tape.end.line.1`, at “Nine minutes” → stable room bed; at “does not speak again” → remove guest layers, not the room.
- [ ] `tape.end.line.3`, at “The file ends” → `playback_end_transport`; after “does not end on anything” → preserve a short neutral post-transport headphone floor.

### 16.5 Signing out of the booth and crossing the yard — P0

- [ ] `threshold.line.1`, at “turns the book around” → `guard_book_turn`.
- [ ] `threshold.line.3`, at “sign” → `pen_write_signature`; at “returned” → a small page/finger move; the empty column gets no ominous tone.
- [ ] `threshold.line.5`, at “slides the keys” → `booth_items_slide_under_glass` with `keyring_handle`; at “radio” → radio body slides separately; at “takes form back” → paper drag in the opposite direction.
- [ ] `threshold.line.10`, at “looking at the television” → preserve the muted television and booth bed; no farewell cue.
- [ ] On the scene-to-yard hand-off → **Mix** close booth-window perspective, widen yard rain, add the first exposed service-concrete step, and leave the booth behind spatially.

---

## 17. Entry, equipment thoughts, room setup and listening cues

### 17.1 Service door and missing exit — P0

- [ ] On the authored service-door closure before the thought begins → **Existing** `service_door_slam_story` and `service_door_roomtone_cut`, with rain severed only when the leaf seals.
- [ ] `self/guard/tape.line.1`, at “reach back” → coat/shoulder turn plus hand extension.
- [ ] `self/guard/tape.line.2`, at “Painted breeze block” → `door_pushbar_missing_touch`; at “seam of mortar” → **New** `hand_mortar_seam_find_01-04`.
- [ ] `self/guard/tape.line.4`, at “flat of your hand” → **New** `hand_wall_search_breeze_block_01-06`; place the leftward and rightward passes in narrow stereo; stop exactly with the sentence.
- [ ] `self/guard/tape.line.7`, at “take a breath” → one controlled `breath_fear_in` and longer `breath_fear_out`.
- [ ] `self/guard/tape.line.10`, at “trudge along” → two slow service-concrete steps only; the live world resumes afterwards.
- [ ] `self/guard/tape.line.11`, at “find that torch” → bag cloth, zip/flap and calm rummage; at “just had it” → handling stops unresolved.
- [ ] Keep `line.5` panic and `line.6` “Don't panic” free of stingers. The performance and breath are the event.

### 17.2 Level check and first setup — P0

- [ ] `conservatory.level_check start.line.2`, at “recorder wakes up” → `recorder_draw_from_bag` followed by **New** `recorder_power_wake_01-03`; at “meter” → low display electronics, no UI confirmation tone.
- [ ] `levels.line.1`, at “meter finds the dock” → **Mix** monitor perspective opens onto the dock bed; at “As you move” → coat ruffle enters the monitor path, not the world twice.
- [ ] `spoils.line.1`, at “A step” → one demonstration step through monitor routing; at “hand on the torch” → close regrip; at “The radio” → one dry radio handling tick, not speech.
- [ ] `roll.line.3`, at “headphones are on” → `headphones_on`; at “monitor is open” → `monitor_switch_on` and `monitor_room_open`; the REC press remains player-controlled after the line.
- [ ] `conservatory.first_take start.line.2`, at “put the rig down” → `recorder_set_down` on acoustic rubber/carpet; at “unwinding the cable” → **New** `recorder_cable_unwind_01-04`.
- [ ] `floor.risers.line.1`, at “lift it” → `recorder_pick_up`; at “set it on the case” → **New** `recorder_case_riser_set_01-04`; at “risers take it” → `recorder_risers_compress_01-04`.
- [ ] `room.line.1`, at “torch goes round” → quiet torch regrip and coat turn only; at “Cable snakes” → a single cable touch.
- [ ] `room.line.2`, at “patchbay” → **New** `patchbay_loose_lead_touch_01-03`; at “chair” → no move, because the chair is only seen.
- [ ] `stand.line.3`, at “sheet still clipped” → light paper edge and stand clip; no musical playback of the two written bars.
- [ ] `stand.take.line.1`, at “put it in the bag” → `bag_item_draw_paper`/paper insertion plus bag flap.
- [ ] `slate.line.2`, after the protagonist's slate ends → **Mix** return the last syllable through the foam-muted B3 response; do not duplicate the whole slate.
- [ ] `dark.line.1`, at “Off it goes” → `torch_switch_off`; at `dark.line.2` remove the last close handling reflection and hold honest room darkness.
- [ ] `roll.line.1`, at “monitor opens” → `monitor_switch_on` then `monitor_room_open`; at “comes up in the cans” → crossfade from world bed to B3 monitor profile.
- [ ] `roll.line.2`, at “Headphones on” → `headphones_on`; at “the room drops out” → `monitor_room_close`; bring `tape_hiss_clean_loop` up only when the player actually rolls.

### 17.3 Common five-room listen template — P0

Apply the same timing to `room-listen.main_b3`, `the_tub`, `amplifications`, `soundnoisemusic`, and `lux_nova`:

- [ ] `start.line.1`, on “Headphones on” → `headphones_on`; on “comes up in the cans” → `monitor_switch_on`, `monitor_room_open`, then the correct room monitor profile.
- [ ] `start.line.2`, on “That is the level” → no approval sound. Let the stable meter/bed prove it.
- [ ] `roll.line.1`, on “kill the light” → `torch_switch_off`; on “room drops out of the cans” → `monitor_room_close`; on “tape hiss comes up” → crossfade to `tape_hiss_clean_loop`.
- [ ] `roll.line.2`, do not add a countdown tick. The absence of movement is the test.
- [ ] B3 `ex0.line.1`, on “going to powder” → one tiny foam granule/fabric touch only if the image shows contact; otherwise silent.
- [ ] Natatorium `start.line.1`, on “handed back four times” → one close incidental body sound with four natural tiled returns, mixed below thought.
- [ ] Natatorium `ex0.line.1`, on “A cough in here is a chord” → do not insert a cough the protagonist did not make.
- [ ] Hall `start.line.1`, on “hall holding its breath” → widen into `room_hall_bed`; no literal inhale.
- [ ] Hall `ex0.line.1`, on “Horsehair and dust” → optional single seat-fibre/wood settle far behind, never a spectral audience.
- [ ] Practice `start.line.1`, at “seven uprights” → quiet string sympathy from the connected rooms, not played notes.
- [ ] Practice `ex0.line.1`, at “waiting for something to happen” → maintain silence; do not fulfil the sentence with a piano sting.
- [ ] Chapel `start.line.1`, at “broken pane letting the weather in” → `building_weather_clerestory`; keep the chapel's long natural tail.
- [ ] Chapel `ex0.line.1`, on “Eleven seconds of reverb” → let one pre-existing small stone tick decay naturally; do not make the protagonist clap or speak.
- [ ] Chapel `ex1.line.1`, at “snow... drifting down onto stone” → sparse `room_chapel_snow_window`, quiet enough to remain plausible.

### 17.4 Take-state speech — P0

- [ ] Runtime `recStart`, on the first clause describing the roll → `recorder_rec_press` then `recorder_record_engage`; close monitor bed and establish take hiss in the same order every time.
- [ ] Runtime clean completion, on “clear/clean minute” → `recorder_stop_press`, `recorder_stop_disengage`, then `recorder_card_write`; no victory sting.
- [ ] Runtime spoiled take, on the named spoil reason → play the actual contaminating event first if not already heard, then `recorder_take_spoiled`; never substitute a generic error beep.
- [ ] Runtime abort, at “stop” → `recorder_take_abort`, neutral and physically identical across rooms.
- [ ] Runtime environmental tenor event → the real distant clock-hammer tenor must occur during the take, then be referenced by later speech; never delay the strike until a line explains it.
- [ ] Runtime HUSH instrument line, on the instrument name in “has started to play” → the spatial source must already have begun 150–400 ms earlier; the sentence confirms a sound the player has just heard.
- [ ] Runtime “Off. Back to the recorder” → stop the instrument on “Off”; retain its room tail; on “recorder” make no remote transport sound.
- [ ] Runtime resume line, on the recorder at the saved origin → `recorder_hold_release` and the normal recording bed resume sample-continuously.

### 17.5 First HUSH thought — P0/P1

- [ ] `conservatory.hush start.line.1`, on “Something in the corridor behind you” → do not add a creature source; on “change in what the silence is shaped like” → `hush_field_orient` plus a narrow directional loss of room return behind the player.
- [ ] `settle.line.1`, do not fire brick, timber and collapse sounds in sequence merely because the protagonist lists explanations. One truthful pre-existing building settle may continue underneath; the HUSH-shaped absence must remain distinct from it.
- [ ] `settle.line.2`, on “none of it is what you heard” → remove the ordinary-settle emphasis and expose the unresolved absorption field without a sting.
- [ ] `steps.line.1`, “Twenty metres. Slow.” is an estimate, not permission to give the HUSH footsteps. Preserve the no-literal-locomotion rule.
- [ ] `steps.line.2`, on “where I made a noise” → a very low, short room-memory return may indicate the earlier player sound's location; do not replay the sound loudly.
- [ ] `still.line.1`, on “do not turn around” → tiny coat arrest; on “perfectly, professionally still” → controlled breath hold and stable room floor. No heartbeat hit is required.

---

## 18. Radio dialogue cue sheet — P0/P1

All radio events reuse the carrier vocabulary in section 5 unless marked New. Voice remains dialogue; this sheet covers controls, carrier, room and nonverbal evidence.

### 18.1 Initial check-in

- [ ] Every `start.line.1` “4417-C, go ahead” → open with `radio_squelch_open_clean`; hold `radio_carrier_clean_loop` beneath the transmitted line.
- [ ] `identify.line.3`, on “chair moves” → `booth_chair_move`; on “Someone laughs” → `booth_distant_laugh_muffle`, positioned behind the transmitted voice inside the radio bandwidth.
- [ ] `work.line.3`, on “carrier closes” → `radio_squelch_close_clean`; make its clean timing slightly too exact, but not supernatural.
- [ ] `channel.line.3` stays silent except for the carrier closing. Do not add a failed-joke sting.

### 18.2 Post-second warning

- [ ] `report.line.2`, on the broken “Tw—” → **Mix** carrier micro-drop; on “two on—” reopen it without a fresh PTT click.
- [ ] `report.line.3`, on “stays open” → continue `radio_carrier_open_empty_loop` past the expected close; do not close until the next transmitted line begins or the node exits.
- [ ] `interference.line.3`, on “dry click” → `radio_dry_internal_click`; enforce “before the person does” by placing it 120–220 ms before the next voice onset.
- [ ] `other.line.3`, after “Behind the negative” → `radio_breath_at_grille`; the breath must be closer and less bandwidth-limited than the preceding voice without becoming full-range.

### 18.3 Pre-third breakdown and dead set

- [ ] `start.line.2`, on the interpolated room label → crossfade clean carrier towards that room's acoustic return; the radio is being taken by the nearby room.
- [ ] `normal.line.3`, on “returns three times” → `radio_last_word_echo` with three discrete returns; automate each “smaller” in level and bandwidth and each “wetter” in room send.
- [ ] `normal.line.5`, on “speaker pops once” → `radio_speaker_pop`; on “carrier drops” → stop carrier loop; on “dead click” → `radio_dead_click`. Replace the present line-start scream cue.
- [ ] `room.line.2`, each repeated room label gets a progressively more player-like mouth/formant treatment in dialogue processing; no extra speech asset.
- [ ] `room.line.3`, on “with your mouth” → **Mix** one 120–200 ms player-mouth nonverbal texture may leak outside radio bandwidth.
- [ ] `room.line.5`, on “one clipped syllable” → dialogue gate plus `radio_clipped_syllable_gate`; on “shuts itself” → power/contact collapse and `radio_dead_click`. Replace the line-start scream cue.
- [ ] `listen.line.1`, on “keeps working anyway” → open-empty carrier continues with no voice.
- [ ] `listen.line.4`, on “door closing inside the radio” → `radio_door_inside_close`; terminate the carrier exactly when its latch-like end lands. Replace the line-start scream cue.
- [ ] `conservatory.radio_dead start.line.1`, on “carrier is gone” → present true radio zero: no hiss loop; allow only external room tone around the handset.
- [ ] `again.line.2`, after “Nothing” → do not add vacuum or sub drop. The absence belongs only to the radio channel.
- [ ] `shake.line.1`, on “shake it” → `radio_shake`; do not fire squelch yet.
- [ ] `shake.line.2`, on “A squelch” → `radio_haunted_squelch_belt`, one syllable long and genuinely loud; stop it before “in a building”. Replace the current start-of-previous-line squelch.
- [ ] `clip.line.1`, on “back on your belt” → `radio_clip_to_belt`; the set remains dead.

---

## 19. Evidence objects, keys, water and carried-kit dialogue cues

### 19.1 Bent recorder — P1

- [ ] `conservatory.bent_rig start.line.3`, on “torch finds” → no discovery sting; on “lid off” → let one loose hinge/case tick identify the object.
- [ ] `look.line.1`, on “lid is off” → `rig_case_open` only if the player physically touches it; otherwise quiet case handling.
- [ ] `look.line.2`, on “Wires” → `rig_wire_handle`; on “back into its own input” → `rig_patch_insert`/connector touch.
- [ ] `why.line.3`, on “grey and cracked” → **New** `solder_joint_dry_touch_01-03`, minute and close.
- [ ] `why.line.5`, on “iron in your bag” → bag shift and metal-tool contact; on “two good cells” → cell tray touch.
- [ ] `solder.line.1`, on “kneel” → body/coat floor Foley; on “reflow a joint” → **New** `solder_iron_joint_reflow_01-04`, including flux sizzle but no mains hum if the tool is battery powered.
- [ ] `solder.line.2`, on “There” → `rig_output_to_input_latch`, physical/electrical confirmation without a success jingle.
- [ ] `solder.line.3`, on “goes in the bag” → `bent_recorder_pickup`, bag weight and strap strain; at “cells stay in it” → tray settle.
- [ ] `gut.line.1`, on “take the cells” → `torch_cells_remove` adapted to the old recorder tray; at “leave the rig” → case set-down.
- [ ] `gut.line.3`, on “wires... go slack” → `rig_wire_handle` with connector tension releasing; at “heart out” → no heartbeat or death sting.

### 19.2 Tuning fork — P0/P1

- [ ] `conservatory.talisman start.line.1`, on “tuning fork” → no tone yet; dust/steel pickup only when touched.
- [ ] `read.line.1`, on “engraved” → nail/fingertip on cut steel; no text-reveal sparkle.
- [ ] `whose.line.2`, on “name scratched” → a quieter steel scrape, close and dry.
- [ ] `strike.line.1`, on “strike it on your knee” → `fork_strike_knee`; immediately after contact start `fork_a440_close`.
- [ ] `strike.line.3`, on “dies in about ninety seconds” → keep the exact held A unchanged rather than starting a new cue.
- [ ] `strike.line.5`, on “does not decay” → crossfade imperceptibly from finite strike tail into `fork_a440_room_held_loop`; preserve pitch and level.
- [ ] `strike.line.7`, do not decorate the Surfer's interruption; the impossible held A is enough.
- [ ] `strike.line.9`, on “building has been holding this note” → widen the A from close fork position into the room field without raising its level.
- [ ] `damp.line.1`, on “close your hand” → `fork_damp_hand`; remove the close steel source while room-held A continues.
- [ ] `damp.line.3`, on “goes on, in the room” → hold room A; on “Then it stops, all at once” → `fork_tone_room_release`, leaving truthful room tail rather than digital zero.
- [ ] `pocket.line.1`, on “top pocket” → `tuning_fork_pickup` plus coat pocket insertion; no item-obtained sound until after the physical sound, if used at all.

### 19.3 Chapel key cabinet — P0

- [ ] `conservatory.chapel_key_check start.line.1`, on “Three hooks” → light key-cabinet interior movement only if touched.
- [ ] `wrong.line.1`, on “wrong ring drops” → `keyring_cabinet_drop`; let the steel cabinet tail leave the office spatially; do not add a second fear sting.
- [ ] `right.line.1`, on “C-17 comes off its hook” → `key_hook_remove`; on “Brass” → close keyring handling; on “newer” → no design accent.
- [ ] Runtime “rubber wedge comes free” → `door_rubber_wedge_pull`; at “closer takes the weight” → `door_closer_takes_weight`, followed by the correct closer motion only when the leaf moves.

### 19.4 Natatorium water thought — P1

- [ ] Water `start`, on “keeps a shape” → `water_deep_body_shift`, low and restrained; do not add a creature vocal.
- [ ] `approach`, on “surface dimples” → sequential `water_surface_small_ripple` from deep end towards the player's shoes; stop at “Not a wave”.
- [ ] `approach`, on “finger drawing a route” → **Mix** one narrow ripple trace, not a literal wet finger.
- [ ] `record`, on “meter rises before you arm it” → recorder electronics/meter movement without REC press; on “one wet click” → **New** `water_click_inside_recorder_01-04`, routed simultaneously as close case contact and pool return.
- [ ] `refuse`, on “one step back” → one `step_pool_tile_slow`; on “water follows” → matched ripple one step closer; at “no legs” → stop without a footstep joke.

---

## 20. Playback scene cue sheet — P0/P1

### 20.1 Playback entry and common routing

- [ ] Every playback `start.line.1`, on “take rolls” → `tape_play_press`, `tape_play_engage`, `playback_headphone_fade_in`; start the room-specific captured bed and hiss.
- [ ] Keep all described playback events inside the headphone bus. The physical recorder buttons remain player-close; the recorded room and anomalies do not leak into the live room.
- [ ] Every playback `off.line.1`, on “take/headphones off” → `tape_play_stop`, `playback_headphone_fade_out`, then `headphones_off`; reveal the unchanged live room bed only after the cups lift.

### 20.2 Natatorium playback

- [ ] `start.line.1`, on “six metres of tile” → captured natatorium bed; on “noise floor” → expose the take hiss and tiled tail.
- [ ] `start.line.2`, after “Under it” → lower the bed 1–2 dB; exactly on “one wet footstep” → `battle_natatorium_step_far` or a dedicated **New** `playback_natatorium_wet_step_deep_01-04`, sourced from the basin bottom with four returns.
- [ ] Named `start.line.4` is dialogue only. Unnamed `start.line.4`, on “happens again” → replay the exact same wet-step source without a transport restart.
- [ ] `again.line.1`, on “One step” → replay sample-identically; on “small sound of somebody deciding not to take another” → **New** `playback_weight_abort_wet_01-03`, a minute sole/cloth weight arrest, not a second foot plant.
- [ ] `off.line.1`, stop transport at “stop the tape”; the live basin remains acoustically empty.

### 20.3 Practice-wing playback

- [ ] `start.line.1`, at “rising, a kitchen” → crossfade from practice-room capture to **New** `playback_domestic_kitchen_bed`; at “A tap” → `playback_kitchen_tap_run_01-03`; at “humming” → this is performance-adjacent nonverbal source and must be separately directed/licensed, not built from the retired catalogue.
- [ ] `start.line.2`, at “washing up” → **New** `playback_washing_up_crockery_01-04`, sparse and under the thought.
- [ ] `listen.line.3`, at “He was recording” → let a previously masked recorder handling/room-mic detail become audible; no revelation sting.
- [ ] `off.line.1`, at “headphones off” → common playback exit; the statement that one room remains receives no objective chime.

### 20.4 Concert-hall playback

- [ ] `start.line.1`, on “hall holding its breath” → captured hall bed; at “minus fifty-four” → steady machine/noise floor; at “coming up, her” → very gradual voice-band emergence handled by dialogue routing, with no reveal sting.
- [ ] `start.line.3`, at “recorder on my knee” → a tiny archived recorder/coat contact may surface in the playback.
- [ ] `recording.line.1`, at “watching a meter” → no meter beep. Preserve the room and performance.
- [ ] `off.line.1`, remove playback voice and room through the headphone fade; live hall remains exactly as empty, with no closing horror accent.

---

## 21. Battle dialogue and acoustic-evidence cues — P0/P1

The action sounds in section 10 remain the interactive battle vocabulary. This section times the room, evidence and consequence sounds that run during battle talk. Do not place ink/scrape actions under prose unless the other hand is actually acting.

### 21.1 Natatorium battle

- [ ] `start.line.1`, on “Forty seconds into the take” → continue the active take bed; at “meter dead flat” → no beep or tone.
- [ ] `start.line.2`, on “And then” → introduce distance before content; on “far off, a piano” → two **New** authored `battle_natatorium_wrong_piano_notes_a/b`, dry source transformed by the natatorium path; exactly two notes.
- [ ] `round-1.line.1`, on “comes again” → replay the same two-note identity; automate either apparent distance, level, or listener lean ambiguously, never all three blatantly.
- [ ] `round-1.line.4`, on “gives it back” → four `battle_natatorium_return_taps`; each return thinner, with natural tile timing.
- [ ] `round-2.line.4`, on “meter is moving” → **Mix** raise monitor/take activity from zero using the existing impossible source; no electronic alert.
- [ ] `round-3.line.6`, on “bottom of the scale” → remove the false activity while preserving room bed.
- [ ] `win.line.2`, on “tile stops answering” → cut only the impossible returns; on “meter holds” → stable clean take; at “clean minute” → transport settles only when the take actually completes.
- [ ] `lose.line.1`, on “You move” → involuntary pool-tile step, coat and kit movement; angle the piano image ahead without adding new notes.
- [ ] `lose.line.2`, on “take dies” → `battle_lose_take_die`; on “room stops playing” → stop the two-note source and leave its natural last return.

### 21.2 Practice-wing battle

- [ ] `start.line.2`, on “far off, music” → `battle_practice_music_far_a`; on “Not a note struck” → make the source clearly reproduced/recorded rather than a live piano action; on “another room in a house” → introduce domestic-room coloration.
- [ ] `round-1.line.1`, on “resolves” → move from abstract far music to one recognisable stored-file phrase; at “phone left running on a table” → add low phone-mic/table resonance, not a notification.
- [ ] `round-2.line.5`, on “pianos do not move” → keep all keys mechanically silent; allow only existing string sympathy under the far file; at “strings popped” → no fresh string break.
- [ ] `round-3.line.1`, “Play one back” remains dialogue only; do not reward the demand with a playback button sound.
- [ ] `win.line.2`, on “far room stops playing” → end at a musically awkward mid-tail, then reveal ordinary connected-room bed; at “pianos are pianos” → remove only the false file colour.
- [ ] `lose.line.1`, on “hand is already moving” → close sleeve/hand towards recorder; on first “towards the recorder” → recorder body touch; on “Almost” → transport button pre-travel without engagement.
- [ ] `lose.line.2`, on “take dies” → `battle_lose_take_die`; on “phrase you know finishes” → let a dedicated phrase resolve once; at “not played again” → do not loop.

### 21.3 Concert-hall battle

- [ ] `start.line.1`, on “takes your silence” → expose the hall noise floor; return a tiny existing body/recorder noise separately from stage, balconies, then seats as the sentence names them.
- [ ] Unnamed `start.line.3`, on “A voice uses the return” → introduce only a voice-edge reflection in the hall return; the source never appears dry in the room.
- [ ] Named `start.line.3` remains dialogue, but its voice must use the same architectural return rather than a separate ghost reverb.
- [ ] `win.line.2`, on “last reflection decays” → let it fall naturally below `tape_transport_run_loop`/machine noise; no hard gate.
- [ ] `lose.line.1`, on “You answer” → one involuntary player mouth/breath onset may enter the hall; on “hall keeps the answer” → hold its return beyond natural expectation without forming new words.
- [ ] `lose.line.2`, on “take dies” → transport death; “full house listening” must remain an absence. No applause, crowd inhale, seat chorus or audience murmur.

### 21.4 Chapel confrontation

- [ ] `start.line.2` recordist “Take five” and `start.line.3` Surfer “Take five” → use the same slate timing with two incompatible source perspectives; overlap their room tails so “two of them” is audible without an extra sting.
- [ ] `start.line.5`, on “put on a face” → `battle_chapel_face_on`, a signal/room reconfiguration rather than a mask whoosh. Use one common design for every identity branch.
- [ ] `round-1.line.6`, on “pews return it four times” → four `battle_chapel_pew_return` layers; each return becomes slightly more present while remaining physically located at the pew banks.
- [ ] `round-2.line.2`, on “four and one” → four clean-take room identities and chapel tone overlap briefly; on “It overlapped” → lock them into one impossible noise floor.
- [ ] `round-2.line.3`, on “date is wrong by eleven years” → no clock or calendar sting; the stable file/machine bed is the evidence.
- [ ] `round-3.line.2`, on “became the music” → transition the false signal from voice-edge to instrument/room process; on “wanted a body back” → narrow into close body resonance without a heartbeat hit.
- [ ] `round-3.line.3`, on “blower is off” → establish absent wind/mechanics; exactly on “organ is sounding anyway” → start `battle_chapel_organ_impossible_a/b` from pipe positions with no key or blower transient.
- [ ] `round-3.line.6`, on “meter... sits flat” → keep organ audible in world/claim while the trusted recorder meter path remains flat; no meter sound.
- [ ] `round-4.line.7`, on “run out of faces” → sequence `battle_chapel_face_off` for borrowed identities; at “the one it started with” → leave only the previous-recordist signal texture.
- [ ] `win.line.2`, on “organ stops” → `chapel_organ_choke_off`; on “face... stop being worn” → `battle_chapel_face_off`; leave two ordinary human body/cloth presences if the scene depicts them.
- [ ] `lose.line.1`, on “nodding” → close neck/coat movement only; no impact.
- [ ] `lose.line.3`, on “take dies” → `battle_lose_take_die`; on “body back” → `hush_contact_subjective` at restrained level, not possession/body-horror audio.

### 21.5 Redaction talk-to-action transitions

- [ ] On each battle intro's final line → let room-specific evidence continue under the first page without a generic round-start hit.
- [ ] On each accepted reading → `battle_read_valid` first, then the impossible room layer loses only the claim that was disproved.
- [ ] On each failed reading → `battle_read_invalid`, then physically time opponent ink/scrape/insert actions to their visual marks.
- [ ] Tuning-fork reveal and bent-rig graft effects must interrupt neither dialogue nor selectable-word feedback; side-chain their resonant tails below input transients.
- [ ] On win/lose talk, stop interactive cursor and ink sounds. Only consequence actions described by the lines remain active.

---

## 22. Source-space dialogue and inspection cue sheet — P1

### 22.1 Entry, paper field and still page

- [ ] On source entry, at the first visible/narrated “corridor does not end” → start `source_hall_bed_a`; at “Pages collect along the walls” → introduce `source_page_collect` progressively by distance.
- [ ] On “Most of them are the same page” → repeat one sample identity from different positions rather than randomising every sheet.
- [ ] On “One page waits face-up and clean” → remove nearby rustle around that sheet; do not add a collectible chime.
- [ ] Runtime `page-found`, on “One sheet does not move” → stop its local paper rustle; on “source printed on it lifts” → `source_page_found_lift`; on “before the paper does” → delay the physical page lift until after the source-text motion.
- [ ] On hand contact → `source_page_hand_contact`; begin `source_paper_landscape_transform_in` only after contact, not when the line starts.

### 22.2 Landmark inspect, tune and record events

- [ ] Approach inspect, on “walls are made of clauses” → paper wall/body creaks with code-like repetition; no computer beeps.
- [ ] Approach tune, on “paper edges tremble” → `source_fork_tune` plus page-edge tremor; on “One page refuses” → all but one page answer.
- [ ] Approach record, on “recorder takes the hall” → `source_recorder_capture`; on “plays back shoe leather” → one source-paper footstep; on “wet paper” → damp paper compression tail.
- [ ] Fork-room inspect, on “It is sounding anyway” → establish source A without strike transient.
- [ ] Fork-room tune, on “fork answers your hand” → `source_fork_tune`; on “false text shivers” → `source_false_line_shiver`; on “true line moves” → lower, steadier text movement.
- [ ] Fork-room record, on “clean A” → recorder capture of exact A; on “then a man trying not to breathe” → one held nonverbal breath under it, not dialogue.
- [ ] Previous-contractor inspect, on “four accepted room tones” → four short stable floor-tile noise identities; on “fifth tile is a mouth” → transform the fifth into dry mouth/noise-floor texture without spoken words.
- [ ] Previous-contractor tune, on “variable name lengthens” → granular text stretch; on “job title” → mechanical indexing; on “then a man” → resolve into clothing/breath presence.
- [ ] Previous-contractor record, play the quoted sentence as dialogue/performance; on “sentence corrects itself” → **New** `source_sentence_machine_correction_01-04`, a transport/edit gesture around the words rather than additional speech.
- [ ] Student-file inspect, on “rehearsal room made of staff lines” → `source_surfer_loop`; at “rule about endurance” → repeated barline/stand pressure, no score.
- [ ] Student-file record, on “scales” → one purpose-built fragment; on “then knuckles” → `source_student_knuckle_impact_01-04`; on “then a sermon” → nonverbal speech-band cadence only unless separately performed as dialogue.
- [ ] Work-order inspect, on “drawer contains no paper” → `cash_drawer_dead` or **New** `source_desk_drawer_empty_01-03`; on “paper contains the desk” → source-paper enclosure/scale inversion.
- [ ] Work-order tune, on “clause underneath” → `source_clause_lift` with a lower paper layer becoming present.
- [ ] Work-order record, on “pen failing” → reuse `guard_pen_fail` exactly; on “twelve in a pack” → several pot contacts may repeat, but stop before they become rhythm.
- [ ] Body-room inspect, on “full of outlines” → multiple nearly silent coat/body presences; on “None... empty” → no reveal impact.
- [ ] Body-room tune, on “Every outline turns” → sequenced cloth pivots around the player; the resisting outline stays silent and stationary.
- [ ] Body-room record, on “saying nothing with perfect diction” → close controlled mouth position, breath and swallowed onset with no phoneme.
- [ ] Final-page inspect, on “floor is printed on it” → invert source-paper footstep from world floor into page perspective.
- [ ] Final-page tune, on “Two lines go bright” → two different fork/text resonances; do not make brightness a UI sparkle.
- [ ] Final-page record, on “takes a scream” → recorder capture/pressure without adding a spoken scream if none is performed; on “prints it as a silence marker” → hard transform into `source_word_black_*` material and then room floor.

### 22.3 Redaction, contact, completion and transition

- [ ] Runtime “clause lifts out of the file” → `source_clause_lift`; on “Touch it again” → hold an armed paper tension loop until confirm/cancel.
- [ ] On confirm → `source_redaction_confirm`; time each consequence at its phrase: wrong-body mercy, borrowed-body reference failure, or SURFER word blackout.
- [ ] Comfort result, on “gives it to the wrong body” → transfer the source loop from page to the incorrect outline.
- [ ] Body result, on “borrowed body becomes a bad reference” → destabilise outline/body correlation; on “Surfer loses its edge” → remove high-edge text components, not all sound.
- [ ] Source result, on “word SURFER goes black” → `source_word_black_surfer`; on “thing wearing it remains” → retain the non-name source process.
- [ ] Runtime source HUSH contact, on “Contact” → `source_hush_checkpoint_catch`; on “keeps what you resolved” → preserve completed landmark layers; on “returns both bodies” → short address-fold transition back to checkpoint.
- [ ] Saved-recordist completion, on “page gives up the body” → `source_body_release`; leave a real body/cloth fall or catch; no resurrection swell.
- [ ] Best-eligible completion, on “closes over the wound” → `source_wound_close`; on “does not seal it” → retain one narrow unresolved source leak towards chapel.
- [ ] Standard completion, on “source folds back” → `source_fold_back`; on “chapel is ahead” → reintroduce the actual chapel-outer bed.
- [ ] Datamosh crossing uses the transition assets already listed. The commit cue lands only when the physical tower resolves; speech after commit must not cover the first tenor attack.

---

## 23. Bell-tower narration and mechanism cue sheet — P1

- [ ] Runtime arrival, “Eight ropes” → establish `room_ringing_room_bed` and rope movement; on “tenor begins alone” → first genuine tenor moving-bell strike with its matching wheel/rope/frame layers; on “Then the frame takes the building” → admit the other bells and shared frame impulse according to the score, not as a single boom.
- [ ] Runtime chapel-screen line, on “screen holds” → heavy locked timber/iron stress; on “tower is already moving” → correctly occluded moving-bell/frame transmission from above.
- [ ] Runtime clock-hammer line, on “CLOCK HAMMER” → `bell_hammer_isolator_lever`; on “ISOLATED” → mechanical disengage; on “linkage falls out of tension” → `bell_hammer_linkage_tension_fall`. The current instrument source stops at actual isolation, not at line start.
- [ ] Runtime “Under load” → `tower_winch_strain_loop`; on “pawl will not lift” → `tower_winch_pawl_refuse`; keep bells moving uninterrupted.
- [ ] Runtime shutter line, on “shutters begin to open” → `tower_shutter_release`, chain and run loop; on “finds rounds” → make the actual strike sequence resolve to rounds; on “starts to stand” → begin ordered bell-standing mechanisms, not a generic cadence.
- [ ] Runtime completion, on “last bell reaches the balance” → final stay/slider/bearing load; on “comes down” → last authored strike and wheel settle; on “silence is larger” → let all physical tails decay—do not hard-mute the ring; on “service leaf releases” → `tower_service_leaf_release` after the ringing has audibly yielded space.
- [ ] Runtime “pawl is released” after clearance → pawl mechanical release; at “service stairs are open” → no navigation chime.
- [ ] Collision narration, if added later, must not precede the collision. Play contact with bell/wheel/frame first, immediate machinery cut second, subjective recovery third, then any text.

---

## 24. Ending and epilogue dialogue cue sheet — P1/P2

### 24.1 Ending choice and inversion

- [ ] `ending.choice.* start.line.1`, on “recorder still running” → preserve active transport/take bed on the chapel floor; do not restart it at the line.
- [ ] `ending.choice.all start.line.2`, on “marker” → light redaction-marker/paper residue only.
- [ ] `ending.choice.all start.line.3`, on “fork” → a brief exact A; on “rig” → low feedback-path answer; on “same line” → phase/align them to reveal shared source identity.
- [ ] `invert.line.2`, on “bent recorder plays” → `rig_finale_room_playback`; on “agreement loses its addressee” → remove the body-centred channel while room feedback remains.
- [ ] `surface.line.3`, on “tuning fork sounds once” → `fork_finale_once`; on “room loses the line” → `source_body_release`/architectural loss of support, restrained.
- [ ] `ending.inversion-start start.line.1`, on “feed the output back” → `rig_output_to_input_latch`; on “machine sing” → controlled `rig_feedback_start`; on “backwards” → `rig_signal_inversion`; on “make one stop” → `rig_feedback_choke_off`.
- [ ] `start.line.5`, exactly on “organ chokes off” → `chapel_organ_choke_off`; on “first wall lets go” → `building_first_wall_release` below; on “clock... starts to run” → `demolition_clock_start` then loop. Preserve the three-event order.

### 24.2 False door, collapse and rescue

- [ ] `ending.false-door start.line.3`, on “Relief arrives” → no relief sting; allow only expected wet-yard/rain pre-echo behind the apparent door.
- [ ] `start.line.4`, on “does not open” → `false_door_handle_refuse`; on “not right there” → `false_door_position_slip`; on “a wall” → `door_bricked_knock`/dead masonry response.
- [ ] `start.line.6`, on “waypoint blinks out” → `escape_waypoint_blink_out`; on “re-draws” → `escape_waypoint_redraw`, clearly trusted-device language under an untrusted destination.
- [ ] Runtime collapse line, on “floor is going” → structural floor/beam failure begins before or at the phrase; on “door you came in through” → do not add a waypoint success tone.
- [ ] `ending.rescue.* start.line.1`, on “door... is open” → `escape_rescue_door_open`; on “shape holds it open” → door strain/closer resistance; no identity sting.
- [ ] `start.line.3`, on “building is coming down” → escalate distant/mid collapse layers; on “go through it” → `escape_threshold_pass` with exterior/other-side perspective.

### 24.3 Sacrifice and sealed endings

- [ ] `ending.sacrifice.* start.line.1`, on “sentence you finish” → no impact; use a slow room-pressure agreement layer that reaches its state only after the sentence completes.
- [ ] `start.line.4`, on “recorder clicks off” → `sacrifice_recorder_click_off`; on “building coming down” → distant structural seal/collapse body; on “now the building has one” → `sacrifice_seal_close` reaches closure.
- [ ] `start.line.6`, on “clock reads 05:5?” → established demolition clock becomes exposed; on “nearly closed” → architectural pressure, not countdown music.
- [ ] `ending.helped.unnamed start.line.4`, on “seal closes at 06:00” → use the same seal/clock identity as sacrifice so the rule remains consistent.

### 24.4 Surfaced, drugged and inversion-final routes

- [ ] Surfaced line “chapel door opens on the service road” → `surfaced_chapel_service_door_open`; crossfade chapel tail into `room_service_road_dawn_bed` through the physical opening.
- [ ] Surfaced “source page follows... as an afterimage” → a very low source-paper/text residue may follow in player perspective; stop on “does not get to revise itself again”.
- [ ] Surfaced “building fails to find the file... as a mouth” → source-process search/correction fails behind the player, without intelligible speech.
- [ ] `ending.drugged.* start.line.3`, on “headphones on” → `drugged_headphones_on`; on “play the night back” → `drugged_night_playback_start`.
- [ ] `start.line.5`, on “Breathing” → `drugged_bad_take_breath`; on “Take two is footsteps” → `drugged_bad_take_steps`; a spoken name remains dialogue/performance and is not an effect asset.
- [ ] `ending.inversion-final start.line.1`, on first “yard” → begin expected exterior perspective; on “not there” → `yard_absent_reveal`, removing rain/yard bed without creating painful vacuum.
- [ ] `start.line.2`, on “clock restarts” → `clock_restart_blank`; on “another grey door” → a distant version of the false-door room tone, not a door impact.
- [ ] `start.line.4`, on “begins to laugh” → start real recordist laugh performance; on “does not stop when he stops” → crossfade into `recordist_laugh_detach`; the spatial continuation outlasts the visible mouth.

### 24.5 Booth epilogues — P2

- [ ] Every booth epilogue opens on the correct dawn/night booth and exterior bed without a route-summary sting.
- [ ] `ending.epilogue.client start.line.4`, on “client signs” → `client_account_close_signature`; on “closed one” → paper/ledger settle, no success tone.
- [ ] `start.line.5`, on “Book the machines” → no machine start yet unless the scene subsequently presents it; if heard, use `demolition_machines_far_start` after the order.
- [ ] `ending.epilogue.drugged start.line.4`, on “paper cup in the bin” → tiny cup/bin contact only if it physically moves; on “still in your hand” → close paper-cup crush/hand tension.
- [ ] `ending.epilogue.nobody start.line.2`, on “writes the date and time” → pen/ledger writing; on “leaves the right column empty” → stop pen naturally, no ominous accent.
- [ ] `ending.epilogue.out start.line.5`, on “turns the book around” → ledger turn; on “He writes in it” → `guard_ledger_returned_write`; at “Yours is the first” → pen lift and room bed only.
- [ ] `ending.epilogue.out start.line.6`, each “here” → two distinct signature strokes when the player signs; do not merge them into one cue at line start.

---

## 25. Runtime speech outside canonical dialogue documents — P1/P2

These lines are currently authored directly in `src/main.js` or data/runtime modules and need the same in-line event contract.

- [ ] “The rubber wedge comes free. The closer takes the weight.” → wedge pull at “comes free”, closer load at “takes the weight”.
- [ ] “Back on the belt. Still dead.” → radio belt clip on “belt”; preserve dead channel.
- [ ] “The beam has gone yellow. That is the cells going” → `torch_brownout_tick`/filament instability before the explanation, not a warning beep.
- [ ] “Minutes... Off it goes.” → torch switch at “Off”; do not play battery death yet.
- [ ] “The torch dies in your hand” → `torch_filament_fail` on “dies”; remove light-linked handling space on “room... stop pretending”.
- [ ] “Cold, bitter, gone in three swallows” → three small cup/sip/swallow Foley beats at their words; no drug effect sting.
- [ ] “Contact. The source keeps...” → source-contact, preservation and return events as three ordered anchors.
- [ ] “Somewhere in the building, a [prop] has started to play” → the instrument begins spatially before the line; use the line only as confirmation.
- [ ] “The water moves like it is still listening” → one restrained water-follow ripple after “moves”; no creature cue.
- [ ] “The floor is going” → actual structural failure on/before “going”, followed by continuing debris under the escape instruction.
- [ ] Page/HIM reflections and equipment-missing lines generally stay dry. Physical pickup, bag, page or recorder sounds fire from the actual action that caused the speech, not from the explanatory sentence after it.

## 26. Conditional legacy-prologue dialogue cues — P3

Only produce these if `legacy.prologue` remains in the shipping narrative after the 2D-bank prune. They must not keep the retired sample field alive.

- [ ] `usher.intro.line.1`, on “fog” → one purpose-built exterior/corridor fog-air bed, not a music slice.
- [ ] `usher.who.line.2`, “pause of exactly the length” → let the actual authored pause remain silent; no joke sting.
- [ ] `usher.who.line.3`, on “walked {steps} steps” → one remote looped-footstep memory assembled from the production step bank, then stop before “circles”.
- [ ] `usher.silence.line.1` → silence/room bed only; do not illustrate the word silence with a vacuum effect.
- [ ] `usher.after.line.1-2`, on the second “not only a corridor” → one restrained architecture shift from existing building material, not a legacy world sample.
- [ ] `usher.again.line.4`, on “again” → replay the same bed identity; on “less of it each time” → remove one layer per revisit rather than pitch-degrading the whole mix.

---

## 27. Additional source assets introduced by this extension

Most cue placements above reuse sources already requested in sections 1–15. Record or design these additional sources because the earlier action catalogue does not specify them cleanly enough:

- [ ] `booth_pen_pot_return_01-04`.
- [ ] `booth_coffee_pour_01-03` and `booth_coffee_cup_fill_01-03`.
- [ ] `guard_private_laugh_01-03`.
- [ ] `archive_card_mount_01-03` and `archive_file_index_01-04`.
- [ ] `hand_mortar_seam_find_01-04` and `hand_wall_search_breeze_block_01-06`.
- [ ] `recorder_power_wake_01-03`.
- [ ] `recorder_cable_unwind_01-04`, `recorder_case_riser_set_01-04`, and `recorder_risers_compress_01-04`.
- [ ] `patchbay_loose_lead_touch_01-03`.
- [ ] `torch_cells_full_hand_weight_01-03`.
- [ ] `solder_joint_dry_touch_01-03` and `solder_iron_joint_reflow_01-04`.
- [ ] `water_click_inside_recorder_01-04`.
- [ ] `playback_natatorium_wet_step_deep_01-04` and `playback_weight_abort_wet_01-03`.
- [ ] `playback_domestic_kitchen_bed`, `playback_kitchen_tap_run_01-03`, and `playback_washing_up_crockery_01-04`.
- [ ] `battle_natatorium_wrong_piano_notes_a/b` — two-note identities, with dry master and natatorium perspective render.
- [ ] `source_sentence_machine_correction_01-04`.
- [ ] `source_student_knuckle_impact_01-04`.
- [ ] `source_desk_drawer_empty_01-03`.
- [ ] `source_body_turn_cloth_01-06`; the resisting outline receives no matching sound, an authored absence rather than another asset.
- [ ] `source_address_fold_return_01-03` — checkpoint return transition, short and non-musical.

Nonverbal performance capture required in addition to effects:

- [ ] Previous-recordist held breath under a tuning-fork A: four restrained variations.
- [ ] Previous-recordist close mouth/failed onset for “saying nothing with perfect diction”: four variations.
- [ ] Sarah domestic humming for the practice playback: one continuous clean performance plus two alternate phrase tails, explicitly licensed as character performance.
- [ ] Recordist laugh and detached continuation source: one matched performance session, supplied dry enough to split mouth/source and spatial continuation.
- [ ] Indistinct sermon cadence for the student-file source, only if it remains non-lexical; intelligible words belong in dialogue recording instead.

## 28. Dialogue-sound silence list

These are deliberate non-cues. Preserve them during implementation review:

- [ ] No sound for a remembered action that is not happening in the present scene unless the line explicitly enters playback.
- [ ] No UI sting for pay, dates, room counts, names, identity recognition, routes, choices, composure, clean takes or moral consequences.
- [ ] No ghost sting when the previous recordist, Sarah, the Surfer or the HUSH is named.
- [ ] No literal cough, inhale, applause, crowd, piano, organ key, demolition machine, van, phone or post-box sound merely because the prose mentions one.
- [ ] No sound for an object being seen unless it moves, is touched, is acoustically active, or changes the mix perspective.
- [ ] No creature Foley for HUSH movement and no monster vocal for the natatorium water.
- [ ] No magical text sparkle for source code, engraving, redaction, a meter reading or a document clue.
- [ ] No hard digital mute where the prose describes silence; preserve the truthful noise floor of the current room, tape, radio exterior or body.
- [ ] No repeated line-start fear cue on a sentence whose actual event occurs later. The current radio-breakdown `scream` placements must be replaced by their ordered internal events.

## 29. Dialogue-cue acceptance passes

- [ ] Validate every `soundEvents[].anchor` against final interpolated British-English text; fail the content build on missing, duplicated or stale anchors.
- [ ] Play every line at normal text speed, maximum text speed, unseen instant reveal, seen-text fast mode, and screen-reader/caption settings.
- [ ] Confirm essential events fire once and in order under reveal/skip; detail events may be dropped but never burst together.
- [ ] Confirm line-owned loops stop on advance, branch, scene exit, pause, focus loss and replay abort.
- [ ] Confirm world events remain spatial and obey door/room transmission while player and headphone Foley retain their intended perspective.
- [ ] Confirm the same non-dialogue source event is sample-identical where the script relies on identity: archive chair/stand rewind, repeated wet step, held tuning-fork A and remembered pen failure.
- [ ] Confirm named/unnamed variants share non-dialogue cue maps and differ only where their actual stage directions differ.
- [ ] Confirm radio carrier, pop, syllable, dead click and internal-door closure happen at their clauses, not at line start.
- [ ] Confirm every battle's acoustic premise is audible before the protagonist explains it, then remains low enough for dialogue and redaction input.
- [ ] Confirm source landmark inspect/tune/record actions have distinct sound states and never fall back to pruned 2D catalogue files.
- [ ] Confirm the tower's first tenor, frame entry, rounds, standing sequence and service-leaf release follow the physical score and narration in order.
- [ ] Confirm ending compound lines preserve order: organ choke → first wall → clock; handle refusal → door slip → wall; last bell → decay → service leaf.
- [ ] Run dialogue with effects muted and with dialogue muted. The former must remain readable; the latter must reveal physical sequencing without accidentally creating substitute speech.
- [ ] Audit captions against the sound: direction, material, repetition and distance must be truthful, concise and free of spoilers.
- [ ] Remove the pruned 2D bank and run every canonical story document, runtime speech beat, battle, playback, source landmark, tower completion and ending. No dialogue-timed cue may resolve to a retired catalogue asset.
