// Approved A Place for You edit, ported as pure production data.
// World positions are physical metres; runtime imports no review artifact.
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export const OPENING_OVERTURE_PLAN_REVISION='a-place-for-you-r1';
export const OPENING_OVERTURE_PLAN_SHA256='fec5b419731b801add492554ce4ead6456b3f3fb9172f8bfe95d825950e53d38';
export const OPENING_OVERTURE_PLAN=freeze({
  "version": 2,
  "revision": "a-place-for-you-r1",
  "title": "A Place for You · ordinary life, waiting work",
  "durationSeconds": 36.5,
  "logline": "An evening already underway. A proud public face. Another way in for the work.",
  "approvalRecord": {
    "dramaticPriority": "User selected: An ordinary social world reveals the work waiting for us",
    "publicFaceVersusLaterServiceRoute": "User selected: Show the proud public face, then make the service route perceptible",
    "academicWallMaterialStudy": "User rejected material change/study: Keep material; solve attention through staging only",
    "newFeatures": "None approved or needed. Use existing poses, lenses, lights, world placements and native closed service-door geometry."
  },
  "shots": [
    {
      "id": "R01",
      "start": 0,
      "end": 4.5,
      "set": "pub",
      "title": "The evening carries on",
      "camera": {
        "eye": [
          [
            43.6,
            1.72,
            29.85
          ],
          [
            43,
            1.72,
            30.15
          ]
        ],
        "target": [
          [
            42.3,
            1.7,
            33.79
          ],
          [
            42.3,
            1.7,
            33.79
          ]
        ],
        "focalLengthMm": 27,
        "fNumber": 4,
        "focus": [
          {
            "at": 0,
            "target": [
              43.4,
              1.45,
              31.6
            ]
          },
          {
            "at": 0.6,
            "target": [
              43.4,
              1.45,
              31.6
            ]
          },
          {
            "at": 2.5,
            "target": [
              42.3,
              1.5,
              33.79
            ]
          }
        ]
      },
      "performanceStartSeconds": 4.3,
      "purpose": "An occupied bar, a familiar task and a foreground patron establish ordinary social life before the institutional work.",
      "axis": "Pub service axis: Iona [42.3,33.79] to Arthur; public aisle side, no reverse.",
      "motion": "Existing27mm advancing composition; retain the shoulder and bar. Lower frontal incident light restores tonal form, and existing polish phase4.3 remains active near the cut.",
      "sourceShotId": "U01",
      "lightScales": {
        "Study warm bar work key": 0.35,
        "Study reflected street fill": 0.35,
        "pub-bar-light": 0.6,
        "pub-counter-lamp": 0.6,
        "pub-window-sconce-east": 0.65
      },
      "axisGeometry": {
        "lineXZ": [
          [
            42.3,
            33.79
          ],
          [
            43.7,
            31.6
          ]
        ],
        "name": "Iona–Arthur interaction line"
      }
    },
    {
      "id": "R02",
      "start": 4.5,
      "end": 7.5,
      "set": "vigil",
      "title": "Keeping the papers dry",
      "camera": {
        "eye": [
          [
            24.7,
            1.4,
            49.3
          ],
          [
            25,
            1.4,
            49.55
          ]
        ],
        "target": [
          [
            28.05,
            1.3,
            51.9
          ],
          [
            28.05,
            1.3,
            51.9
          ]
        ],
        "focalLengthMm": 65,
        "fNumber": 4,
        "focus": []
      },
      "purpose": "A brief private paper-and-person portrait within the demonstration. It does not explain or endorse the cause.",
      "axis": "Ruth/near demonstrators line: both camera endpoints stay on its street-side southwest half-plane.",
      "motion": "Short65mm creep, cut a second earlier. Retain the quiet native ambient performance; reject an unproven page-event claim.",
      "sourceShotId": "U02",
      "axisGeometry": {
        "lineXZ": [
          [
            28,
            53.5
          ],
          [
            29.5,
            55
          ]
        ],
        "name": "Local protest pair"
      }
    },
    {
      "id": "R03",
      "start": 7.5,
      "end": 14,
      "set": "school",
      "title": "The public face",
      "camera": {
        "eye": [
          [
            70,
            1.05,
            -22
          ],
          [
            71,
            3.8,
            -20
          ]
        ],
        "target": [
          [
            84,
            4.5,
            2.8
          ],
          [
            84,
            4.5,
            2.8
          ]
        ],
        "focalLengthMm": 21,
        "fNumber": 8,
        "focus": []
      },
      "purpose": "Present the actual institution with dignity and completeness before showing the less public way into its work.",
      "axis": "Same front/south facade half-plane established by U03. Forward push, no crossed world axis.",
      "motion": "Measured three-quarter rise keeps the roof and entrance in frame. The actual closed public pair and forecourt remain part of the architecture.",
      "additionalInstances": [
        {
          "id": "opening-study:actual-ellery-forecourt",
          "mesh": "ellery_public_forecourt",
          "position": [
            86,
            0,
            1.25
          ],
          "x": 86,
          "y": 0,
          "z": 1.25,
          "yaw": 0
        },
        {
          "id": "door-frame:front-main",
          "mesh": "door_frame_pair",
          "matrix": [
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            78.75,
            0,
            3.25,
            1
          ],
          "position": [
            78.75,
            0,
            3.25
          ],
          "x": 78.75,
          "y": 0,
          "z": 3.25,
          "zone": 0,
          "structural": true,
          "sourceAsset": "public/assets/conservatory-doors.glb"
        },
        {
          "id": "door-head:front-main",
          "mesh": "door_head_transom",
          "matrix": [
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            78.75,
            0,
            3.25,
            1
          ],
          "position": [
            78.75,
            0,
            3.25
          ],
          "x": 78.75,
          "y": 0,
          "z": 3.25,
          "zone": 0,
          "structural": true,
          "sourceAsset": "public/assets/conservatory-doors.glb"
        },
        {
          "id": "door-leaf:front-main:0",
          "mesh": "door_leaf_public",
          "matrix": [
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            77.775,
            0,
            3.25,
            1
          ],
          "position": [
            77.775,
            0,
            3.25
          ],
          "x": 77.775,
          "y": 0,
          "z": 3.25,
          "zone": 0,
          "structural": true,
          "sourceAsset": "public/assets/conservatory-doors.glb"
        },
        {
          "id": "door-leaf:front-main:1",
          "mesh": "door_leaf_public",
          "matrix": [
            -1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            79.725,
            0,
            3.25,
            1
          ],
          "position": [
            79.725,
            0,
            3.25
          ],
          "x": 79.725,
          "y": 0,
          "z": 3.25,
          "zone": 0,
          "structural": true,
          "sourceAsset": "public/assets/conservatory-doors.glb"
        }
      ],
      "sourceShotId": "U06",
      "axisGeometry": {
        "lineXZ": [
          [
            79,
            -29
          ],
          [
            79,
            3
          ]
        ],
        "name": "Public approach line"
      }
    },
    {
      "id": "R04",
      "start": 14,
      "end": 19,
      "set": "yard",
      "title": "The way the work comes in",
      "camera": {
        "eye": [
          [
            43,
            2.5,
            10
          ],
          [
            47,
            2.2,
            10
          ]
        ],
        "target": [
          [
            57.25,
            1.65,
            10.25
          ],
          [
            57.25,
            1.65,
            10.25
          ]
        ],
        "focalLengthMm": 27,
        "fNumber": 8,
        "focus": []
      },
      "purpose": "After the public face, make the real grey contractor entrance, goods stairs and apron perceptible. No door opens and no player entry is performed.",
      "axis": "Public face to work approach: explicit new exterior setup. Camera stays on the yard side of the actual closed pair; no false reverse or new door destination.",
      "motion": "A closer human-scale advance between the real goods-stair rails toward the closed ribbed pair. The door gains image scale while stairs and canopy supply the approach; no entry or unlocking occurs.",
      "additionalSetInstances": {},
      "lightingOverride": {
        "ambientIntensity": 0.08,
        "bounceIntensity": 0.06,
        "replaceProposalLights": [
          {
            "name": "Existing bay canopy bulkhead position",
            "positionM": [
              55.2,
              4.1,
              7.5
            ],
            "color": [
              1,
              0.74,
              0.42
            ],
            "powerWProxy": 51.6,
            "sizeM": 0.875
          },
          {
            "name": "Service-yard open-sky camera-side bounce",
            "positionM": [
              44,
              11,
              11
            ],
            "color": [
              0.58,
              0.72,
              1
            ],
            "powerWProxy": 110,
            "sizeM": 8
          },
          {
            "name": "Existing service-practical face bounce proposal",
            "positionM": [
              52.5,
              3.0,
              10.0
            ],
            "color": [
              1,
              0.82,
              0.59
            ],
            "powerWProxy": 180,
            "sizeM": 1.5
          }
        ]
      },
      "additionalInstances": [
        {
          "id": "bay-canopy",
          "mesh": "bay_canopy",
          "fallbackMesh": null,
          "x": 53,
          "y": 0,
          "z": 7.5,
          "yaw": 0,
          "scale": 1,
          "zone": 1,
          "portraitIndex": 0,
          "structural": true,
          "waterlineBody": null,
          "waterlineOffset": 0,
          "matrix": [
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            53,
            0,
            7.5,
            1
          ],
          "position": [
            53,
            0,
            7.5
          ],
          "sourceAsset": "public/assets/conservatory-props.glb"
        },
        {
          "id": "bay-getin-sightline",
          "mesh": "getin_sightline_shell",
          "fallbackMesh": null,
          "x": 53,
          "y": 0,
          "z": 7.5,
          "yaw": 0,
          "scale": 1,
          "zone": 1,
          "portraitIndex": 0,
          "structural": true,
          "waterlineBody": null,
          "waterlineOffset": 0,
          "matrix": [
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            53,
            0,
            7.5,
            1
          ],
          "position": [
            53,
            0,
            7.5
          ],
          "sourceAsset": "public/assets/conservatory-props.glb"
        },
        {
          "id": "dock-scene-fabric",
          "mesh": "scene_dock_room_fabric",
          "fallbackMesh": null,
          "x": 53,
          "y": 0,
          "z": 7.5,
          "yaw": 0,
          "scale": 1,
          "zone": 1,
          "portraitIndex": 0,
          "structural": true,
          "waterlineBody": null,
          "waterlineOffset": 0,
          "matrix": [
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            53,
            0,
            7.5,
            1
          ],
          "position": [
            53,
            0,
            7.5
          ],
          "sourceAsset": "public/assets/conservatory-props.glb"
        },
        {
          "id": "dock-scene-roof",
          "mesh": "scene_dock_roof_structure",
          "fallbackMesh": null,
          "x": 53,
          "y": 0,
          "z": 7.5,
          "yaw": 0,
          "scale": 1,
          "zone": 1,
          "portraitIndex": 0,
          "structural": true,
          "waterlineBody": null,
          "waterlineOffset": 0,
          "matrix": [
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            53,
            0,
            7.5,
            1
          ],
          "position": [
            53,
            0,
            7.5
          ],
          "sourceAsset": "public/assets/conservatory-props.glb"
        },
        {
          "id": "bay-apron-route-board",
          "mesh": "notice_board",
          "fallbackMesh": null,
          "x": 51.5,
          "y": 1.18,
          "z": 4.03,
          "yaw": 3.141592653589793,
          "scale": 1,
          "zone": 1,
          "portraitIndex": 0,
          "structural": true,
          "waterlineBody": null,
          "waterlineOffset": 1.18,
          "matrix": [
            -1,
            0,
            1.2246467991473532e-16,
            0,
            0,
            1,
            0,
            0,
            -1.2246467991473532e-16,
            0,
            -1,
            0,
            51.5,
            1.18,
            4.03,
            1
          ],
          "position": [
            51.5,
            1.18,
            4.03
          ],
          "sourceAsset": "public/assets/conservatory-props.glb"
        },
        {
          "id": "bay-apron-conduit-north",
          "mesh": "plant_pipe_bank",
          "fallbackMesh": null,
          "x": 54.5,
          "y": 2.08,
          "z": 4.1,
          "yaw": 0,
          "scale": 1,
          "zone": 1,
          "portraitIndex": 0,
          "structural": true,
          "waterlineBody": null,
          "waterlineOffset": 2.08,
          "matrix": [
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            54.5,
            2.08,
            4.1,
            1
          ],
          "position": [
            54.5,
            2.08,
            4.1
          ],
          "sourceAsset": "public/assets/conservatory-props.glb"
        },
        {
          "id": "bay-apron-bulkhead-north",
          "mesh": "tower_bulkhead",
          "fallbackMesh": null,
          "x": 55.5,
          "y": 2.78,
          "z": 4,
          "yaw": 0,
          "scale": 1,
          "zone": 1,
          "portraitIndex": 0,
          "structural": true,
          "waterlineBody": null,
          "waterlineOffset": 2.78,
          "matrix": [
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            55.5,
            2.78,
            4,
            1
          ],
          "position": [
            55.5,
            2.78,
            4
          ],
          "sourceAsset": "public/assets/conservatory-props.glb"
        },
        {
          "id": "bay-apron-loading-notice",
          "mesh": "notice_board",
          "fallbackMesh": null,
          "x": 51.5,
          "y": 1.18,
          "z": 11.97,
          "yaw": 0,
          "scale": 1,
          "zone": 1,
          "portraitIndex": 0,
          "structural": true,
          "waterlineBody": null,
          "waterlineOffset": 1.18,
          "matrix": [
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            51.5,
            1.18,
            11.97,
            1
          ],
          "position": [
            51.5,
            1.18,
            11.97
          ],
          "sourceAsset": "public/assets/conservatory-props.glb"
        },
        {
          "id": "bay-apron-conduit-south",
          "mesh": "plant_pipe_bank",
          "fallbackMesh": null,
          "x": 54.5,
          "y": 2.08,
          "z": 11.9,
          "yaw": -3.141592653589793,
          "scale": 1,
          "zone": 1,
          "portraitIndex": 0,
          "structural": true,
          "waterlineBody": null,
          "waterlineOffset": 2.08,
          "matrix": [
            -1,
            0,
            -1.2246467991473532e-16,
            0,
            0,
            1,
            0,
            0,
            1.2246467991473532e-16,
            0,
            -1,
            0,
            54.5,
            2.08,
            11.9,
            1
          ],
          "position": [
            54.5,
            2.08,
            11.9
          ],
          "sourceAsset": "public/assets/conservatory-props.glb"
        },
        {
          "id": "bay-apron-bulkhead-south",
          "mesh": "tower_bulkhead",
          "fallbackMesh": null,
          "x": 55.5,
          "y": 2.78,
          "z": 12,
          "yaw": -3.141592653589793,
          "scale": 1,
          "zone": 1,
          "portraitIndex": 0,
          "structural": true,
          "waterlineBody": null,
          "waterlineOffset": 2.78,
          "matrix": [
            -1,
            0,
            -1.2246467991473532e-16,
            0,
            0,
            1,
            0,
            0,
            1.2246467991473532e-16,
            0,
            -1,
            0,
            55.5,
            2.78,
            12,
            1
          ],
          "position": [
            55.5,
            2.78,
            12
          ],
          "sourceAsset": "public/assets/conservatory-props.glb"
        },
        {
          "id": "bay-apron-bay-number",
          "mesh": "door_stencil",
          "fallbackMesh": null,
          "x": 57,
          "y": 1.72,
          "z": 8,
          "yaw": -1.5707963267948966,
          "scale": 1,
          "zone": 1,
          "portraitIndex": 0,
          "structural": true,
          "waterlineBody": null,
          "waterlineOffset": 1.72,
          "matrix": [
            6.123233995736766e-17,
            0,
            -1,
            0,
            0,
            1,
            0,
            0,
            1,
            0,
            6.123233995736766e-17,
            0,
            57,
            1.72,
            8,
            1
          ],
          "position": [
            57,
            1.72,
            8
          ],
          "sourceAsset": "public/assets/conservatory-props.glb"
        },
        {
          "id": "bay-apron-isolator",
          "mesh": "power_box_01",
          "fallbackMesh": null,
          "x": 57,
          "y": 1.08,
          "z": 6,
          "yaw": 1.5707963267948966,
          "scale": 1,
          "zone": 1,
          "portraitIndex": 0,
          "structural": true,
          "waterlineBody": null,
          "waterlineOffset": 1.08,
          "matrix": [
            6.123233995736766e-17,
            0,
            1,
            0,
            0,
            1,
            0,
            0,
            -1,
            0,
            6.123233995736766e-17,
            0,
            57,
            1.08,
            6,
            1
          ],
          "position": [
            57,
            1.08,
            6
          ],
          "sourceAsset": "public/assets/conservatory-acquisitions.glb"
        },
        {
          "id": "yard-dock-access",
          "mesh": "yard_dock_access",
          "fallbackMesh": null,
          "x": 47.5,
          "y": -2.384185793236071e-08,
          "z": 7.5,
          "yaw": 0,
          "scale": 1,
          "zone": 1,
          "portraitIndex": 0,
          "structural": true,
          "waterlineBody": null,
          "waterlineOffset": 0.85,
          "matrix": [
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1,
            0,
            47.5,
            -2.384185793236071e-08,
            7.5,
            1
          ],
          "position": [
            47.5,
            -2.384185793236071e-08,
            7.5
          ],
          "sourceAsset": "public/assets/conservatory-props.glb"
        },
        {
          "id": "door-frame:dock-grey-exterior",
          "mesh": "door_frame_goods",
          "matrix": [
            6.123233995736766e-17,
            0,
            1,
            0,
            0,
            1,
            0,
            0,
            -1,
            0,
            6.123233995736766e-17,
            0,
            57.25,
            0,
            10.25,
            1
          ],
          "position": [
            57.25,
            0,
            10.25
          ],
          "x": 57.25,
          "y": 0,
          "z": 10.25,
          "zone": 0,
          "structural": true,
          "sourceAsset": "public/assets/conservatory-doors.glb"
        },
        {
          "id": "door-head:dock-grey-exterior",
          "mesh": "door_head_goods",
          "matrix": [
            6.123233995736766e-17,
            0,
            1,
            0,
            0,
            1,
            0,
            0,
            -1,
            0,
            6.123233995736766e-17,
            0,
            57.25,
            0,
            10.25,
            1
          ],
          "position": [
            57.25,
            0,
            10.25
          ],
          "x": 57.25,
          "y": 0,
          "z": 10.25,
          "zone": 0,
          "structural": true,
          "sourceAsset": "public/assets/conservatory-doors.glb"
        },
        {
          "id": "door-leaf:dock-grey-exterior:0",
          "mesh": "door_leaf_bay_goods",
          "matrix": [
            6.123233995736766e-17,
            0,
            1,
            0,
            0,
            1,
            0,
            0,
            -1,
            0,
            6.123233995736766e-17,
            0,
            57.25,
            0,
            8.75,
            1
          ],
          "position": [
            57.25,
            0,
            8.75
          ],
          "x": 57.25,
          "y": 0,
          "z": 8.75,
          "zone": 0,
          "structural": true,
          "sourceAsset": "public/assets/conservatory-doors.glb"
        },
        {
          "id": "door-leaf:dock-grey-exterior:1",
          "mesh": "door_leaf_bay_goods",
          "matrix": [
            -6.123233995736766e-17,
            0,
            -1,
            0,
            0,
            1,
            0,
            0,
            -1,
            0,
            6.123233995736766e-17,
            0,
            57.25,
            0,
            11.75,
            1
          ],
          "position": [
            57.25,
            0,
            11.75
          ],
          "x": 57.25,
          "y": 0,
          "z": 11.75,
          "zone": 0,
          "structural": true,
          "sourceAsset": "public/assets/conservatory-doors.glb"
        }
      ],
      "sourceShotId": "U03",
      "axisGeometry": {
        "lineXZ": [
          [
            38,
            10.25
          ],
          [
            57.25,
            10.25
          ]
        ],
        "name": "Actual goods-approach line"
      }
    },
    {
      "id": "R05",
      "start": 19,
      "end": 23,
      "set": "chamber",
      "title": "A room prepared for sound",
      "camera": {
        "eye": [
          [
            60.4,
            11.35,
            4.97
          ],
          [
            59.6,
            11.38,
            4.97
          ]
        ],
        "target": [
          [
            53.6,
            10.85,
            4.5
          ],
          [
            53.6,
            10.85,
            4.5
          ]
        ],
        "focalLengthMm": 35,
        "fNumber": 4,
        "focus": [
          {
            "at": 0,
            "target": [
              58.5,
              10.9,
              4.5
            ]
          },
          {
            "at": 0.4,
            "target": [
              58.5,
              10.9,
              4.5
            ]
          },
          {
            "at": 2.7,
            "target": [
              53.6,
              10.85,
              4.5
            ]
          }
        ]
      },
      "purpose": "The near chair and the actual piano establish a prepared musical space. No personal student memory or compulsory-practice claim is assigned to the paid recordist.",
      "axis": "Keep the same piano–chair relationship while moving closer through the existing physical gap; no reverse coverage.",
      "motion": "Tighter35mm advance through a real gap in the chair arc. The piano gains image scale and the near chair moves aside; material and fixture recipes remain unchanged.",
      "lightingOverride": {
        "ambientIntensity": 0.13,
        "bounceIntensity": 0.1,
        "replaceProposalLights": [
          {
            "name": "Reflected chamber practical on chair backs",
            "positionM": [
              64,
              12.7,
              4.5
            ],
            "color": [
              1,
              0.85,
              0.63
            ],
            "powerWProxy": 210,
            "sizeM": 3.5
          }
        ]
      },
      "sourceShotId": "U04",
      "axisGeometry": {
        "lineXZ": [
          [
            53,
            4.5
          ],
          [
            60,
            6.5
          ]
        ],
        "name": "Piano–chair reference"
      }
    },
    {
      "id": "R06",
      "start": 23,
      "end": 27,
      "set": "b3",
      "title": "The recording work",
      "camera": {
        "eye": [
          [
            21.5,
            -2.45,
            12.1
          ],
          [
            21.45,
            -2.45,
            11.75
          ]
        ],
        "target": [
          [
            20.55,
            -3.08,
            10.9
          ],
          [
            20.55,
            -3.08,
            10.9
          ]
        ],
        "focalLengthMm": 40,
        "fNumber": 4,
        "focus": []
      },
      "purpose": "Prepared musical space cuts to the specific console, session card and idle faders. This foreshadows recording work without claiming the player has received the work order yet.",
      "axis": "Console neutral insert: camera stays outside the actual desk bridge, looking down the fader rows. It is a separate recording room, with no false reverse to the recital.",
      "motion": "Close, oblique downward advance across the existing console surface; rows separate by perspective. Fixed focus, no invented fader or pilot movement. Cut during travel.",
      "lightingOverride": {
        "ambientIntensity": 0.16,
        "bounceIntensity": 0.12,
        "replaceProposalLights": [
          {
            "name": "Control work light",
            "positionM": [
              21.6,
              -1.5,
              11
            ],
            "color": [
              1,
              0.84,
              0.62
            ],
            "powerWProxy": 240,
            "sizeM": 0.25
          },
          {
            "name": "Live room high work light",
            "positionM": [
              13,
              -1.5,
              12.5
            ],
            "color": [
              0.68,
              0.79,
              1
            ],
            "powerWProxy": 230,
            "sizeM": 2
          }
        ]
      },
      "sourceShotId": "U05",
      "axisGeometry": {
        "lineXZ": [
          [
            20.55,
            10.9
          ],
          [
            21.5,
            12.1
          ]
        ],
        "name": "Console working diagonal"
      }
    },
    {
      "id": "R07",
      "start": 27,
      "end": 34.5,
      "set": "tower",
      "title": "Above the ordinary work",
      "camera": {
        "eye": [
          [
            120,
            12.5,
            98
          ],
          [
            119,
            17,
            96
          ]
        ],
        "target": [
          [
            105,
            21,
            74.3
          ],
          [
            105,
            21.6,
            74.3
          ]
        ],
        "focalLengthMm": 27,
        "fNumber": 8,
        "focus": []
      },
      "purpose": "The actual upper Tower mass gives the same institution a scale larger than its ordinary routines, without inserting a new supernatural event.",
      "axis": "Distinct Tower architectural axis, neutral facade cut creates explicit spatial ellipsis.",
      "motion": "The roof-clearing crane continues into the fade. Upper mass and corner acquire depth above the lower roof; this does not claim to reveal the full Tower base.",
      "sourceShotId": "U07",
      "lightingOverride": {
        "ambientIntensity": 0.08,
        "bounceIntensity": 0.07,
        "replaceProposalLights": [
          {
            "name": "Tower visible-face moon separation",
            "positionM": [
              122,
              27,
              96
            ],
            "color": [
              0.65,
              0.77,
              1
            ],
            "powerWProxy": 288,
            "sizeM": 12.75
          }
        ]
      },
      "axisGeometry": {
        "lineXZ": [
          [
            105,
            74.3
          ],
          [
            105,
            98
          ]
        ],
        "name": "Tower south reference"
      }
    },
    {
      "id": "R08",
      "start": 34.5,
      "end": 36.5,
      "set": "yard",
      "stage": "return",
      "title": "Back at the van",
      "purpose": "Return the same body and bearing. Case preparation and the lodge remain voluntary actual play afterward, before the grey service door.",
      "axis": "Exact saved world position, floor, yaw and pitch restored under black; never rotate toward the lodge or grey door for the player.",
      "motion": "Projection and exact eye/yaw/pitch restored in black. Short reveal; no invented player movement.",
      "sourceShotId": "U08"
    }
  ]
});
