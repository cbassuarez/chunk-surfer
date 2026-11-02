// The approved65-second reconstruction. Historical students are anonymous roles;
// these aliases do not rewrite the present-day donor characters.
export const STUDENT_STRIKE_FILM = {
  "id": "student-strike",
  "revision": "refusal-1",
  "title": "The Refusal",
  "durationSeconds": 65,
  "fps": 24,
  "width": 960,
  "height": 480,
  "actors": [
    {
      "id": "odette",
      "sourceActorId": "odette",
      "mesh": "academic_society_odette",
      "root": [
        66.6,
        10,
        36
      ],
      "yaw": 1.02,
      "headYaw": 1.3258176636680326
    },
    {
      "id": "agathe",
      "sourceActorId": "agathe",
      "mesh": "academic_society_agathe",
      "root": [
        66.4,
        10,
        34.3
      ],
      "yaw": 3.0244839090229267
    },
    {
      "id": "strike-student-a",
      "sourceActorId": "academic-guest-piano",
      "mesh": "academic_population_listener",
      "root": [
        53.98,
        10,
        4.4
      ],
      "yaw": -2,
      "headYaw": -2,
      "posture": "seated"
    },
    {
      "id": "strike-student-b",
      "sourceActorId": "academic-guest-threshold",
      "mesh": "academic_population_attendant",
      "root": [
        53.1,
        10,
        5.75
      ],
      "yaw": 0.5776759482655278,
      "headYaw": 0.5776759482655278
    },
    {
      "id": "strike-student-c",
      "sourceActorId": "academic-guest-quiet-index",
      "mesh": "academic_population_attendant",
      "root": [
        60.05,
        10,
        5.25
      ],
      "yaw": 1.5707963267948966
    },
    {
      "id": "strike-student-d",
      "sourceActorId": "academic-guest-fold",
      "mesh": "academic_population_attendant",
      "root": [
        61.55,
        10,
        5.5
      ],
      "yaw": -1.5707963267948966
    },
    {
      "id": "strike-student-e",
      "sourceActorId": "academic-guest-second-bell",
      "mesh": "academic_population_attendant",
      "root": [
        59.65,
        10,
        2.87
      ],
      "yaw": -1.5707963267948966
    }
  ],
  "shots": [
    {
      "id": "S00",
      "start": 0,
      "end": 4,
      "stage": "present",
      "renderGroup": "academic",
      "floorH": 10,
      "zone": 13,
      "camera": {
        "eye": [
          [
            68.55,
            11.65,
            35.4
          ],
          [
            68.5,
            11.63,
            35.37
          ],
          [
            68.44,
            11.61,
            35.34
          ],
          [
            68.38,
            11.59,
            35.3
          ]
        ],
        "target": [
          [
            66.7,
            11.42,
            35.99
          ],
          [
            66.68,
            11.35,
            35.99
          ]
        ],
        "focalLengthMm": 27,
        "fNumber": 8,
        "sensorMm": [
          24.89,
          12.445
        ],
        "focus": [
          {
            "at": 0,
            "target": [
              66.71,
              11.61,
              35.98
            ]
          }
        ],
        "interpolation": "cubic-bezier in normalized shot time; linear time, no endpoint ease/hold",
        "apertureAnimation": null,
        "zoom": null,
        "focusInterpolation": "smooth monotonic in dioptres between authored marks"
      },
      "actorIds": [
        "odette",
        "agathe"
      ],
      "performance": [],
      "blocking": [],
      "dialogue": [],
      "lightingOverride": {
        "nativeLightScales": {
          "main-stair-academic-opal": 1.7
        },
        "lights": [
          {
            "id": "study-loggia-opal-wall-return",
            "position": [
              67.55,
              11.9,
              35.55
            ],
            "color": [
              1,
              0.82,
              0.62
            ],
            "intensity": 1.35,
            "radius": 4.6,
            "penetration": 0.05,
            "castsShadow": false
          }
        ],
        "provenance": {
          "status": "proposed cinematic lighting study; no production lighting changes",
          "nativeFixture": "main-stair-academic-opal:[66.4,13.25,35.5]",
          "method": "The maintained native opal remains the motivated source; its level and a bounded camera-side reflected return are photographic proposals. Background emergency identity retained.",
          "unsupported": "The reflected-return point is a bounded approximation, not a physically simulated area bounce or a new visible fixture."
        }
      },
      "transition": "hard-cut-from-present-address-to-shared-room"
    },
    {
      "id": "S02",
      "start": 4,
      "end": 10,
      "stage": "memory",
      "renderGroup": "academic",
      "floorH": 10,
      "zone": 13,
      "camera": {
        "eye": [
          [
            58.3,
            11.65,
            7.6
          ],
          [
            57.7,
            11.55,
            7.4
          ]
        ],
        "target": [
          [
            54.3,
            11,
            4.85
          ],
          [
            54.1,
            10.98,
            4.9
          ]
        ],
        "focalLengthMm": 21,
        "fNumber": 8,
        "sensorMm": [
          24.89,
          12.445
        ],
        "focus": [
          {
            "at": 0,
            "target": [
              54.3,
              11,
              4.85
            ]
          }
        ],
        "interpolation": "Measured translation through the cut; no endpoint freeze",
        "zoom": null,
        "apertureAnimation": null
      },
      "actorIds": [
        "strike-student-a",
        "strike-student-b",
        "strike-student-e"
      ],
      "performance": [
        {
          "actorId": "strike-student-b",
          "at": 2.8,
          "durationSec": 2.2,
          "cue": "attend",
          "role": "listener"
        }
      ],
      "blocking": [],
      "dialogue": [],
      "lightingOverride": {
        "lights": [
          {
            "id": "study-W1-west-window-panel",
            "position": [
              56.9,
              12.65,
              1.18
            ],
            "color": [
              0.72,
              0.83,
              1
            ],
            "intensity": 3.4,
            "radius": 14,
            "penetration": 0.06,
            "castsShadow": false
          },
          {
            "id": "study-W1-east-window-panel",
            "position": [
              59.1,
              12.65,
              1.18
            ],
            "color": [
              0.72,
              0.83,
              1
            ],
            "intensity": 3,
            "radius": 14,
            "penetration": 0.06,
            "castsShadow": false
          },
          {
            "id": "study-south-wall-window-return",
            "position": [
              61.7,
              12.75,
              6.9
            ],
            "color": [
              1,
              0.83,
              0.64
            ],
            "intensity": 1.45,
            "radius": 9,
            "penetration": 0.07,
            "castsShadow": false
          }
        ],
        "provenance": {
          "status": "proposed cinematic lighting study; no production lighting changes",
          "windowSource": "W1-chamber-north: physicalx56–60,z0–1,sill11.05,head13.05",
          "method": "Two bounded native point lights approximate a broad high-window source; one bounded warm return approximates reflected window light from the south wall. Native materials, acquisition, exposure and black response unchanged.",
          "unsupported": "Not calibrated area-light transport or shipped fixture photometry. Warm return is artistic bounce emulation, not a new visible fitting."
        }
      },
      "transition": "hard-cut"
    },
    {
      "id": "S03",
      "start": 10,
      "end": 19,
      "stage": "memory",
      "renderGroup": "academic",
      "floorH": 10,
      "zone": 13,
      "camera": {
        "eye": [
          [
            56.2,
            11.3,
            7.4
          ],
          [
            55.9,
            11.26,
            7.2
          ]
        ],
        "target": [
          [
            53.7,
            11,
            4.9
          ],
          [
            53.6,
            11,
            4.95
          ]
        ],
        "focalLengthMm": 27,
        "fNumber": 8,
        "sensorMm": [
          24.89,
          12.445
        ],
        "focus": [
          {
            "at": 0,
            "target": [
              53.7,
              11,
              4.9
            ]
          }
        ],
        "interpolation": "Measured translation through the cut; no endpoint freeze",
        "zoom": null,
        "apertureAnimation": null
      },
      "actorIds": [
        "strike-student-a",
        "strike-student-b"
      ],
      "performance": [],
      "blocking": [],
      "dialogue": [
        {
          "start": 0.5999999999999996,
          "end": 6,
          "speaker": "Student at the piano",
          "actorId": "strike-student-a",
          "text": "Not another rehearsal. Not until they admit they found him here."
        }
      ],
      "lightingOverride": {
        "lights": [
          {
            "id": "study-W1-west-window-panel",
            "position": [
              56.9,
              12.65,
              1.18
            ],
            "color": [
              0.72,
              0.83,
              1
            ],
            "intensity": 3.4,
            "radius": 14,
            "penetration": 0.06,
            "castsShadow": false
          },
          {
            "id": "study-W1-east-window-panel",
            "position": [
              59.1,
              12.65,
              1.18
            ],
            "color": [
              0.72,
              0.83,
              1
            ],
            "intensity": 3,
            "radius": 14,
            "penetration": 0.06,
            "castsShadow": false
          },
          {
            "id": "study-south-wall-window-return",
            "position": [
              61.7,
              12.75,
              6.9
            ],
            "color": [
              1,
              0.83,
              0.64
            ],
            "intensity": 1.45,
            "radius": 9,
            "penetration": 0.07,
            "castsShadow": false
          }
        ],
        "provenance": {
          "status": "proposed cinematic lighting study; no production lighting changes",
          "windowSource": "W1-chamber-north: physicalx56–60,z0–1,sill11.05,head13.05",
          "method": "Two bounded native point lights approximate a broad high-window source; one bounded warm return approximates reflected window light from the south wall. Native materials, acquisition, exposure and black response unchanged.",
          "unsupported": "Not calibrated area-light transport or shipped fixture photometry. Warm return is artistic bounce emulation, not a new visible fitting."
        }
      },
      "transition": "hard-cut-after-the-peer-has-been-acquired"
    },
    {
      "id": "S04",
      "start": 19,
      "end": 23,
      "stage": "memory",
      "renderGroup": "academic",
      "floorH": 10,
      "zone": 13,
      "camera": {
        "eye": [
          [
            55.55,
            11.33,
            3.25
          ],
          [
            55.47,
            11.33,
            3.32
          ]
        ],
        "target": [
          [
            53.1,
            11.4,
            5.75
          ],
          [
            53.1,
            11.4,
            5.75
          ]
        ],
        "focalLengthMm": 40,
        "fNumber": 8,
        "sensorMm": [
          24.89,
          12.445
        ],
        "focus": [
          {
            "at": 0,
            "target": [
              53.1,
              11.4,
              5.75
            ]
          }
        ],
        "interpolation": "Measured translation through the cut; no endpoint freeze",
        "zoom": null,
        "apertureAnimation": null
      },
      "actorIds": [
        "strike-student-a",
        "strike-student-b"
      ],
      "performance": [
        {
          "actorId": "strike-student-b",
          "at": 0.8,
          "durationSec": 2.2,
          "cue": "assure",
          "role": "speaker"
        }
      ],
      "blocking": [],
      "dialogue": [
        {
          "start": 0.3999999999999986,
          "end": 2.8000000000000007,
          "speaker": "Answering student",
          "actorId": "strike-student-b",
          "text": "Then none of us plays."
        }
      ],
      "lightingOverride": {
        "lights": [
          {
            "id": "study-W1-west-window-panel",
            "position": [
              56.9,
              12.65,
              1.18
            ],
            "color": [
              0.72,
              0.83,
              1
            ],
            "intensity": 3.4,
            "radius": 14,
            "penetration": 0.06,
            "castsShadow": false
          },
          {
            "id": "study-W1-east-window-panel",
            "position": [
              59.1,
              12.65,
              1.18
            ],
            "color": [
              0.72,
              0.83,
              1
            ],
            "intensity": 3,
            "radius": 14,
            "penetration": 0.06,
            "castsShadow": false
          },
          {
            "id": "study-south-wall-window-return",
            "position": [
              61.7,
              12.75,
              6.9
            ],
            "color": [
              1,
              0.83,
              0.64
            ],
            "intensity": 1.45,
            "radius": 9,
            "penetration": 0.07,
            "castsShadow": false
          }
        ],
        "provenance": {
          "status": "proposed cinematic lighting study; no production lighting changes",
          "windowSource": "W1-chamber-north: physicalx56–60,z0–1,sill11.05,head13.05",
          "method": "Two bounded native point lights approximate a broad high-window source; one bounded warm return approximates reflected window light from the south wall. Native materials, acquisition, exposure and black response unchanged.",
          "unsupported": "Not calibrated area-light transport or shipped fixture photometry. Warm return is artistic bounce emulation, not a new visible fitting."
        }
      },
      "transition": "hard-cut-after-the-commitment"
    },
    {
      "id": "R00",
      "start": 23,
      "end": 27,
      "stage": "reconstruction",
      "renderGroup": "academic",
      "floorH": 10,
      "zone": 13,
      "camera": {
        "eye": [
          [
            64.4,
            11.8,
            7.6
          ],
          [
            64.25,
            11.75,
            7.48
          ]
        ],
        "target": [
          [
            62.2,
            10.25,
            5.1
          ],
          [
            62.2,
            10.25,
            5.1
          ]
        ],
        "focalLengthMm": 21,
        "fNumber": 5.6,
        "sensorMm": [
          24.89,
          12.445
        ],
        "focus": [
          {
            "at": 0,
            "target": [
              62.2,
              10.25,
              5.1
            ]
          }
        ],
        "interpolation": "linear measured camera translation throughout shot; cut without generated hold",
        "zoom": null,
        "apertureAnimation": null
      },
      "actorIds": [],
      "performance": [],
      "blocking": [],
      "dialogue": [],
      "additionalInstances": [
        {
          "id": "surfer-recovery-body",
          "mesh": "ending_body_prone",
          "position": [
            62.2,
            10,
            5.1
          ],
          "yaw": 0
        },
        {
          "id": "surfer-recovery-cloth",
          "mesh": "student_strike_recovery_cloth",
          "position": [
            62.2,
            10,
            5.1
          ],
          "yaw": 0
        }
      ],
      "lightingOverride": {
        "lights": [
          {
            "id": "study-W1-west-window-panel",
            "position": [
              56.9,
              12.65,
              1.18
            ],
            "color": [
              0.72,
              0.83,
              1
            ],
            "intensity": 3.4,
            "radius": 14,
            "penetration": 0.06,
            "castsShadow": false
          },
          {
            "id": "study-W1-east-window-panel",
            "position": [
              59.1,
              12.65,
              1.18
            ],
            "color": [
              0.72,
              0.83,
              1
            ],
            "intensity": 3,
            "radius": 14,
            "penetration": 0.06,
            "castsShadow": false
          },
          {
            "id": "study-south-wall-window-return",
            "position": [
              61.7,
              12.75,
              6.9
            ],
            "color": [
              1,
              0.83,
              0.64
            ],
            "intensity": 1.45,
            "radius": 9,
            "penetration": 0.07,
            "castsShadow": false
          }
        ],
        "provenance": {
          "status": "proposed cinematic lighting study; no production lighting changes",
          "windowSource": "W1-chamber-north: physicalx56–60,z0–1,sill11.05,head13.05",
          "method": "Two bounded native point lights approximate a broad high-window source; one bounded warm return approximates reflected window light from the south wall. Native materials, acquisition, exposure and black response unchanged.",
          "unsupported": "Not calibrated area-light transport or shipped fixture photometry. Warm return is artistic bounce emulation, not a new visible fitting."
        }
      },
      "transition": "hard-cut"
    },
    {
      "id": "D00",
      "start": 27,
      "end": 31,
      "stage": "record",
      "renderGroup": "academic",
      "floorH": 10,
      "zone": 13,
      "camera": {
        "eye": [
          [
            63,
            12.2,
            20.3
          ],
          [
            63.06,
            12.15,
            20.2
          ]
        ],
        "target": [
          [
            63,
            11.39,
            19.5
          ],
          [
            63,
            11.39,
            19.5
          ]
        ],
        "focalLengthMm": 27,
        "fNumber": 5.6,
        "sensorMm": [
          24.89,
          12.445
        ],
        "focus": [
          {
            "at": 0,
            "target": [
              63,
              11.39,
              19.5
            ]
          }
        ],
        "interpolation": "linear measured camera translation throughout shot; cut without generated hold",
        "zoom": null,
        "apertureAnimation": null
      },
      "actorIds": [],
      "performance": [],
      "blocking": [],
      "dialogue": [],
      "additionalInstances": [
        {
          "id": "D00-paper",
          "mesh": "student_strike_record_missing",
          "position": [
            63,
            11.365,
            19.5
          ],
          "yaw": 0,
          "scale": 1.1
        }
      ],
      "lightingOverride": {
        "lights": [
          {
            "id": "record-reading-return",
            "position": [
              63.2,
              12.1,
              20.1
            ],
            "color": [
              1,
              0.89,
              0.72
            ],
            "intensity": 2.5,
            "radius": 4,
            "penetration": 0.04,
            "castsShadow": false
          }
        ]
      },
      "transition": "hard-cut"
    },
    {
      "id": "S05",
      "start": 31,
      "end": 40,
      "stage": "memory",
      "renderGroup": "academic",
      "floorH": 10,
      "zone": 13,
      "camera": {
        "eye": [
          [
            60.8,
            11.65,
            7.65
          ],
          [
            60.85,
            11.62,
            7.43
          ]
        ],
        "target": [
          [
            60.8,
            11.07,
            5.4
          ],
          [
            60.8,
            11.07,
            5.4
          ]
        ],
        "focalLengthMm": 18,
        "fNumber": 8,
        "sensorMm": [
          24.89,
          12.445
        ],
        "focus": [
          {
            "at": 0,
            "target": [
              60.8,
              11.07,
              5.4
            ]
          }
        ],
        "interpolation": "Measured translation through the cut; no endpoint freeze",
        "zoom": null,
        "apertureAnimation": null
      },
      "actorIds": [
        "strike-student-c",
        "strike-student-d"
      ],
      "performance": [],
      "blocking": [],
      "dialogue": [
        {
          "start": 3,
          "end": 5.399999999999999,
          "speaker": "Student offering food",
          "actorId": "strike-student-d",
          "text": "Here, if you want it."
        },
        {
          "start": 5.799999999999997,
          "end": 7.799999999999997,
          "speaker": "Hunger-striking student",
          "actorId": "strike-student-c",
          "text": "No. Leave it, please."
        }
      ],
      "additionalInstances": [
        {
          "id": "strike-meal-desk",
          "mesh": "school_desk",
          "position": [
            60.8,
            10,
            5.6
          ],
          "yaw": 3.141592653589793,
          "topY": 10.717499971,
          "source": "Existing school_desk vertices/material; memory-only set dressing, not a new current-world obstacle",
          "placementEvidence": "Turned180degrees after native probes showed the integrated chair back masking the plate. Actual desktop/support height unchanged; plate footprint remains on the desktop."
        },
        {
          "id": "offered-bread",
          "position": [
            60.8,
            10.717499971,
            5.6
          ],
          "support": "strike-meal-desk",
          "source": "Bounded preview-only extraction of existing pub plate/bread vertices/materials; no shared pack rebuild",
          "mesh": "student_strike_bread_plate",
          "nativeTriangles": 624,
          "nativeLocalBounds": {
            "min": [
              -0.145,
              0,
              -0.145
            ],
            "max": [
              0.145,
              0.075,
              0.145
            ]
          }
        }
      ],
      "lightingOverride": {
        "lights": [
          {
            "id": "study-W1-west-window-panel",
            "position": [
              56.9,
              12.65,
              1.18
            ],
            "color": [
              0.72,
              0.83,
              1
            ],
            "intensity": 3.4,
            "radius": 14,
            "penetration": 0.06,
            "castsShadow": false
          },
          {
            "id": "study-W1-east-window-panel",
            "position": [
              59.1,
              12.65,
              1.18
            ],
            "color": [
              0.72,
              0.83,
              1
            ],
            "intensity": 3,
            "radius": 14,
            "penetration": 0.06,
            "castsShadow": false
          },
          {
            "id": "study-south-wall-window-return",
            "position": [
              61.7,
              12.75,
              6.9
            ],
            "color": [
              1,
              0.83,
              0.64
            ],
            "intensity": 1.45,
            "radius": 9,
            "penetration": 0.07,
            "castsShadow": false
          }
        ],
        "provenance": {
          "status": "proposed cinematic lighting study; no production lighting changes",
          "windowSource": "W1-chamber-north: physicalx56–60,z0–1,sill11.05,head13.05",
          "method": "Two bounded native point lights approximate a broad high-window source; one bounded warm return approximates reflected window light from the south wall. Native materials, acquisition, exposure and black response unchanged.",
          "unsupported": "Not calibrated area-light transport or shipped fixture photometry. Warm return is artistic bounce emulation, not a new visible fitting."
        }
      },
      "transition": "hard-cut-after-hand-release-and-held-response"
    },
    {
      "id": "D01",
      "start": 40,
      "end": 43,
      "stage": "record",
      "renderGroup": "academic",
      "floorH": 10,
      "zone": 13,
      "camera": {
        "eye": [
          [
            63,
            12.2,
            20.3
          ],
          [
            63.06,
            12.15,
            20.2
          ]
        ],
        "target": [
          [
            63,
            11.39,
            19.5
          ],
          [
            63,
            11.39,
            19.5
          ]
        ],
        "focalLengthMm": 27,
        "fNumber": 5.6,
        "sensorMm": [
          24.89,
          12.445
        ],
        "focus": [
          {
            "at": 0,
            "target": [
              63,
              11.39,
              19.5
            ]
          }
        ],
        "interpolation": "linear measured camera translation throughout shot; cut without generated hold",
        "zoom": null,
        "apertureAnimation": null
      },
      "actorIds": [],
      "performance": [],
      "blocking": [],
      "dialogue": [],
      "additionalInstances": [
        {
          "id": "D01-paper",
          "mesh": "student_strike_record_attendance",
          "position": [
            63,
            11.365,
            19.5
          ],
          "yaw": 0,
          "scale": 1.1
        }
      ],
      "lightingOverride": {
        "lights": [
          {
            "id": "record-reading-return",
            "position": [
              63.2,
              12.1,
              20.1
            ],
            "color": [
              1,
              0.89,
              0.72
            ],
            "intensity": 2.5,
            "radius": 4,
            "penetration": 0.04,
            "castsShadow": false
          }
        ]
      },
      "transition": "hard-cut"
    },
    {
      "id": "R01",
      "start": 43,
      "end": 47,
      "stage": "reconstruction",
      "renderGroup": "academic",
      "floorH": 10,
      "zone": 13,
      "camera": {
        "eye": [
          [
            65.15,
            12,
            7.5
          ],
          [
            65,
            11.95,
            7.35
          ]
        ],
        "target": [
          [
            63.1,
            10.2,
            4.95
          ],
          [
            63.1,
            10.2,
            4.95
          ]
        ],
        "focalLengthMm": 21,
        "fNumber": 5.6,
        "sensorMm": [
          24.89,
          12.445
        ],
        "focus": [
          {
            "at": 0,
            "target": [
              63.1,
              10.2,
              4.95
            ]
          }
        ],
        "interpolation": "linear measured camera translation throughout shot; cut without generated hold",
        "zoom": null,
        "apertureAnimation": null
      },
      "actorIds": [],
      "performance": [],
      "blocking": [],
      "dialogue": [],
      "additionalInstances": [
        {
          "id": "student-ellery-a-body",
          "mesh": "ending_body_prone",
          "position": [
            62.2,
            10,
            5.1
          ],
          "yaw": 0
        },
        {
          "id": "student-ellery-a-cloth",
          "mesh": "student_strike_recovery_cloth",
          "position": [
            62.2,
            10,
            5.1
          ],
          "yaw": 0
        },
        {
          "id": "student-ellery-b-body",
          "mesh": "ending_body_prone",
          "position": [
            64.05,
            10,
            4.85
          ],
          "yaw": 0
        },
        {
          "id": "student-ellery-b-cloth",
          "mesh": "student_strike_recovery_cloth",
          "position": [
            64.05,
            10,
            4.85
          ],
          "yaw": 0
        }
      ],
      "lightingOverride": {
        "lights": [
          {
            "id": "study-W1-west-window-panel",
            "position": [
              56.9,
              12.65,
              1.18
            ],
            "color": [
              0.72,
              0.83,
              1
            ],
            "intensity": 3.4,
            "radius": 14,
            "penetration": 0.06,
            "castsShadow": false
          },
          {
            "id": "study-W1-east-window-panel",
            "position": [
              59.1,
              12.65,
              1.18
            ],
            "color": [
              0.72,
              0.83,
              1
            ],
            "intensity": 3,
            "radius": 14,
            "penetration": 0.06,
            "castsShadow": false
          },
          {
            "id": "study-south-wall-window-return",
            "position": [
              61.7,
              12.75,
              6.9
            ],
            "color": [
              1,
              0.83,
              0.64
            ],
            "intensity": 1.45,
            "radius": 9,
            "penetration": 0.07,
            "castsShadow": false
          }
        ],
        "provenance": {
          "status": "proposed cinematic lighting study; no production lighting changes",
          "windowSource": "W1-chamber-north: physicalx56–60,z0–1,sill11.05,head13.05",
          "method": "Two bounded native point lights approximate a broad high-window source; one bounded warm return approximates reflected window light from the south wall. Native materials, acquisition, exposure and black response unchanged.",
          "unsupported": "Not calibrated area-light transport or shipped fixture photometry. Warm return is artistic bounce emulation, not a new visible fitting."
        }
      },
      "transition": "hard-cut"
    },
    {
      "id": "R02",
      "start": 47,
      "end": 51,
      "stage": "reconstruction",
      "renderGroup": "tower",
      "floorH": 8.6,
      "zone": 12,
      "towerActive": false,
      "camera": {
        "eye": [
          [
            94.2,
            11,
            61
          ],
          [
            94.05,
            10.95,
            60.85
          ]
        ],
        "target": [
          [
            89.3,
            9.1,
            58.8
          ],
          [
            89.3,
            9.1,
            58.8
          ]
        ],
        "focalLengthMm": 21,
        "fNumber": 5.6,
        "sensorMm": [
          24.89,
          12.445
        ],
        "focus": [
          {
            "at": 0,
            "target": [
              89,
              8.9,
              60.25
            ]
          }
        ],
        "interpolation": "linear measured camera translation throughout shot; cut without generated hold",
        "zoom": null,
        "apertureAnimation": null
      },
      "actorIds": [],
      "performance": [],
      "blocking": [],
      "dialogue": [],
      "additionalInstances": [
        {
          "id": "student-tower-body",
          "mesh": "ending_body_prone",
          "position": [
            89,
            8.6,
            60.25
          ],
          "yaw": 0
        },
        {
          "id": "student-tower-cloth",
          "mesh": "student_strike_recovery_cloth",
          "position": [
            89,
            8.6,
            60.25
          ],
          "yaw": 0
        }
      ],
      "lightingOverride": {
        "lights": [
          {
            "id": "study-maintained-ringing-pendant",
            "position": [
              90,
              11.55,
              54.5
            ],
            "color": [
              1,
              0.88,
              0.68
            ],
            "intensity": 2.6,
            "radius": 11,
            "penetration": 0.05,
            "castsShadow": false
          },
          {
            "id": "study-tower-recovery-return",
            "position": [
              91,
              10.8,
              60.2
            ],
            "color": [
              0.82,
              0.89,
              1
            ],
            "intensity": 1.7,
            "radius": 7,
            "penetration": 0.04,
            "castsShadow": false
          }
        ],
        "provenance": {
          "status": "Historical maintained-workroom lighting study; phase emergency red sources omitted from reconstruction, production unchanged."
        }
      },
      "transition": "hard-cut"
    },
    {
      "id": "G00",
      "start": 51,
      "end": 59,
      "stage": "present-haunting",
      "renderGroup": "ground",
      "floorH": 0.02,
      "zone": 18,
      "camera": {
        "eye": [
          [
            89.5,
            1.77,
            -30.4
          ],
          [
            89.15,
            1.77,
            -30.2
          ]
        ],
        "target": [
          [
            86,
            1.3,
            -26.2
          ],
          [
            86,
            1.3,
            -26.2
          ]
        ],
        "focalLengthMm": 40,
        "fNumber": 8,
        "sensorMm": [
          24.89,
          12.445
        ],
        "focus": [
          {
            "at": 0,
            "target": [
              86,
              1.3,
              -26.2
            ]
          }
        ],
        "interpolation": "Measured translation through the cut; no endpoint freeze",
        "zoom": null,
        "apertureAnimation": null
      },
      "actorIds": [
        "strike-student-a",
        "strike-student-b"
      ],
      "performance": [
        {
          "actorId": "strike-student-b",
          "at": 3.2,
          "durationSec": 2.2,
          "cue": "attend",
          "role": "listener"
        }
      ],
      "blocking": [
        {
          "ids": [
            "strike-student-a"
          ],
          "position": [
            84.8,
            0.12,
            -26
          ],
          "yaw": 0.37,
          "headYaw": 0.37,
          "start": 0,
          "end": 0.001
        },
        {
          "ids": [
            "strike-student-b"
          ],
          "position": [
            87.2,
            0.12,
            -26.7
          ],
          "yaw": 0.37,
          "headYaw": 0.37,
          "start": 0,
          "end": 0.001
        }
      ],
      "dialogue": [],
      "additionalInstances": [],
      "lightingOverride": {
        "lights": [
          {
            "id": "study-square-face-return",
            "position": [
              90,
              3.3,
              -30.8
            ],
            "color": [
              0.82,
              0.88,
              1
            ],
            "intensity": 2.5,
            "radius": 8,
            "penetration": 0.03,
            "castsShadow": false
          }
        ]
      },
      "transition": "hard-cut"
    },
    {
      "id": "S07",
      "start": 59,
      "end": 65,
      "stage": "return",
      "renderGroup": "academic",
      "floorH": 10,
      "zone": 13,
      "camera": {
        "eye": [
          [
            67.8,
            11.62,
            35.7
          ],
          [
            67.8,
            11.62,
            35.7
          ]
        ],
        "target": [
          [
            66.6,
            11.5,
            36
          ],
          [
            66.6,
            11.5,
            36
          ]
        ],
        "focalLengthMm": 27,
        "fNumber": 8,
        "sensorMm": [
          24.89,
          12.445
        ],
        "focus": [
          {
            "at": 0,
            "target": [
              66.6,
              11.5,
              36
            ]
          }
        ],
        "interpolation": "cubic-bezier in normalized shot time; linear time, no endpoint ease/hold",
        "apertureAnimation": null,
        "zoom": null,
        "focusInterpolation": "smooth monotonic in dioptres between authored marks"
      },
      "actorIds": [
        "odette",
        "agathe"
      ],
      "performance": [],
      "blocking": [],
      "dialogue": [],
      "lightingOverride": {
        "nativeLightScales": {
          "main-stair-academic-opal": 1.7
        },
        "lights": [
          {
            "id": "study-loggia-opal-wall-return",
            "position": [
              67.55,
              11.9,
              35.55
            ],
            "color": [
              1,
              0.82,
              0.62
            ],
            "intensity": 1.35,
            "radius": 4.6,
            "penetration": 0.05,
            "castsShadow": false
          }
        ],
        "provenance": {
          "status": "proposed cinematic lighting study; no production lighting changes",
          "nativeFixture": "main-stair-academic-opal:[66.4,13.25,35.5]",
          "method": "The maintained native opal remains the motivated source; its level and a bounded camera-side reflected return are photographic proposals. Background emergency identity retained.",
          "unsupported": "The reflected-return point is a bounded approximation, not a physically simulated area bounce or a new visible fixture."
        }
      },
      "transition": "full-black-native-restore-then-.5s-reveal"
    }
  ],
  "memoryDressing": {
    "persistent": [
      {
        "id": "strike-case-near",
        "mesh": "instrument_case",
        "position": [
          58.45,
          10.01,
          6.1
        ],
        "yaw": 3.141592653589793,
        "placementEvidence": "Moved into the clear south floor pocket, outside the existing chair6/7 footprints;180-degree native yaw faces the actual steel handle toward the south camera. Same native vertices/material and floor support."
      },
      {
        "id": "strike-case-far",
        "mesh": "instrument_case",
        "position": [
          59.7,
          10.01,
          2.45
        ],
        "yaw": -0.12
      },
      {
        "id": "strike-meal-desk",
        "mesh": "school_desk",
        "position": [
          60.8,
          10,
          5.6
        ],
        "yaw": 0,
        "topY": 11.1
      }
    ],
    "food": "Extract actual existing pub plate/bread triangles/materials into review-only native mesh. Keep them on the real desktop; no unsolved held grip.",
    "originalFurniture": "Retain original eight chamber chairs, piano and bench; no repeated new rooms or historical ruin set."
  },
  "records": [
    {
      "id": "surfer-missing",
      "mesh": "student_strike_record_missing",
      "title": "ELLERY / INCIDENT REGISTER",
      "lines": [
        "SUBJECT: CHUNK SURFER",
        "STATUS: MISSING",
        "NO RECOVERY RECORDED"
      ]
    },
    {
      "id": "students-absent",
      "mesh": "student_strike_record_attendance",
      "title": "ELLERY / ATTENDANCE",
      "lines": [
        "ENSEMBLE: ABSENT",
        "STATUS: WITHDRAWN",
        "REGISTER CLOSED"
      ]
    }
  ],
  "narration": [
    {
      "id": "N01",
      "start": 0.2,
      "end": 3.9,
      "speaker": "Odette Marchal",
      "actorId": "odette",
      "text": "They called them absent. I knew who was upstairs."
    },
    {
      "id": "ST01",
      "start": 10.6,
      "end": 16,
      "speaker": "Student at the piano",
      "actorId": "strike-student-a",
      "text": "Not another rehearsal. Not until they admit they found him here."
    },
    {
      "id": "ST02",
      "start": 19.4,
      "end": 21.8,
      "speaker": "Answering student",
      "actorId": "strike-student-b",
      "text": "Then none of us plays."
    },
    {
      "id": "N02",
      "start": 23.2,
      "end": 26.95,
      "speaker": "Odette Marchal",
      "actorId": "odette",
      "text": "They found the Surfer’s body inside Ellery."
    },
    {
      "id": "N03",
      "start": 27.2,
      "end": 30.8,
      "speaker": "Odette Marchal",
      "actorId": "odette",
      "text": "Afterwards, his file still said MISSING."
    },
    {
      "id": "N05",
      "start": 31.1,
      "end": 33.8,
      "speaker": "Odette Marchal",
      "actorId": "odette",
      "text": "Some went on hunger strike."
    },
    {
      "id": "ST03",
      "start": 34,
      "end": 36.4,
      "speaker": "Student offering food",
      "actorId": "strike-student-d",
      "text": "Here, if you want it."
    },
    {
      "id": "ST04",
      "start": 36.8,
      "end": 38.8,
      "speaker": "Hunger-striking student",
      "actorId": "strike-student-c",
      "text": "No. Leave it, please."
    },
    {
      "id": "N06",
      "start": 40,
      "end": 42.9,
      "speaker": "Odette Marchal",
      "actorId": "odette",
      "text": "ABSENT. WITHDRAWN. They were still here."
    },
    {
      "id": "N07",
      "start": 43.2,
      "end": 49.5,
      "speaker": "Odette Marchal",
      "actorId": "odette",
      "text": "Later, students’ bodies were recovered in Ellery and the Tower."
    },
    {
      "id": "N08",
      "start": 51.1,
      "end": 53.8,
      "speaker": "Odette Marchal",
      "actorId": "odette",
      "text": "Some still come to the Square."
    },
    {
      "id": "N09",
      "start": 54.3,
      "end": 57.9,
      "speaker": "Odette Marchal",
      "actorId": "odette",
      "text": "I cannot tell you what demolition would do."
    },
    {
      "id": "N11",
      "start": 60.6,
      "end": 64.6,
      "speaker": "Odette Marchal",
      "actorId": "odette",
      "text": "I can still keep the stair clear."
    }
  ],
  "captions": [
    {
      "id": "CAP001",
      "start": 0.2,
      "end": 3.9,
      "speaker": "Odette Marchal",
      "text": "They called them absent. I knew who was upstairs.",
      "displaySpeaker": false
    },
    {
      "id": "CAP002",
      "start": 10.6,
      "end": 16,
      "speaker": "Student",
      "text": "Not another rehearsal. Not until they admit they found him here.",
      "displaySpeaker": true
    },
    {
      "id": "CAP003",
      "start": 19.4,
      "end": 21.8,
      "speaker": "Student",
      "text": "Then none of us plays.",
      "displaySpeaker": true
    },
    {
      "id": "CAP004",
      "start": 23.2,
      "end": 26.95,
      "speaker": "Odette Marchal",
      "text": "They found the Surfer’s body inside Ellery.",
      "displaySpeaker": false
    },
    {
      "id": "CAP005",
      "start": 27.2,
      "end": 30.8,
      "speaker": "Odette Marchal",
      "text": "Afterwards, his file still said MISSING.",
      "displaySpeaker": false
    },
    {
      "id": "CAP006",
      "start": 31.1,
      "end": 33.8,
      "speaker": "Odette Marchal",
      "text": "Some went on hunger strike.",
      "displaySpeaker": false
    },
    {
      "id": "CAP007",
      "start": 34,
      "end": 36.4,
      "speaker": "Student",
      "text": "Here, if you want it.",
      "displaySpeaker": true
    },
    {
      "id": "CAP008",
      "start": 36.8,
      "end": 38.8,
      "speaker": "Student",
      "text": "No. Leave it, please.",
      "displaySpeaker": true
    },
    {
      "id": "CAP009",
      "start": 40,
      "end": 42.9,
      "speaker": "Odette Marchal",
      "text": "ABSENT. WITHDRAWN. They were still here.",
      "displaySpeaker": false
    },
    {
      "id": "CAP010",
      "start": 43.2,
      "end": 49.5,
      "speaker": "Odette Marchal",
      "text": "Later, students’ bodies were recovered in Ellery and the Tower.",
      "displaySpeaker": false
    },
    {
      "id": "CAP011",
      "start": 51.1,
      "end": 53.8,
      "speaker": "Odette Marchal",
      "text": "Some still come to the Square.",
      "displaySpeaker": false
    },
    {
      "id": "CAP012",
      "start": 54.3,
      "end": 57.9,
      "speaker": "Odette Marchal",
      "text": "I cannot tell you what demolition would do.",
      "displaySpeaker": false
    },
    {
      "id": "CAP013",
      "start": 60.6,
      "end": 64.6,
      "speaker": "Odette Marchal",
      "text": "I can still keep the stair clear.",
      "displaySpeaker": false
    }
  ]
};
export const STUDENT_STRIKE_DURATION = STUDENT_STRIKE_FILM.durationSeconds;
export const STUDENT_STRIKE_CUES = STUDENT_STRIKE_FILM.narration;
