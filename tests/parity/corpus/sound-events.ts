/** Korpus Sound (tanpa audio engine, seperti oracle) dan Events (hat, broadcast, klik, tombol). */
import { b, bc, changeVar, flag, forever, menu, repeat, setVar, wait } from "../block-builder";
import type { ParityCase } from "../case-types";
import { mkCase, probeCase } from "./helpers";

const soundMenu = (v: string) => menu("sound_sounds_menu", "SOUND_MENU", v);

export function soundCases(): ParityCase[] {
  return [
    probeCase("sound", "volume", ["sound_changevolumeby", "sound_setvolumeto", "sound_volume"], [b("sound_volume")], {
      sprites: [
        {
          scripts: [[
            flag(),
            wait(0),
            ...[50, -20, 300, "abc", -500, 33.3].flatMap((v, i) => [
              i % 2 ? b("sound_changevolumeby", { VOLUME: v }) : b("sound_setvolumeto", { VOLUME: v }),
              setVar(`v${i}`, b("sound_volume")),
            ]),
          ]],
        },
      ],
      frames: 3,
    }),
    mkCase({
      id: "sound/play-without-audio",
      category: "sound",
      title: "play/stop/efek tanpa sound & tanpa audio engine tidak macet",
      sprites: [
        {
          name: "Kody",
          scripts: [[
            flag(),
            b("sound_play", { SOUND_MENU: soundMenu("tidak-ada") }),
            b("sound_playuntildone", { SOUND_MENU: soundMenu("1") }),
            b("sound_stopallsounds"),
            b("sound_seteffectto", { VALUE: 50 }, { EFFECT: "PITCH" }),
            b("sound_changeeffectby", { VALUE: -300 }, { EFFECT: "PAN" }),
            b("sound_cleareffects"),
            setVar("ketukan", menu("sound_beats_menu", "BEATS", "0.25")),
            setVar("efek", menu("sound_effects_menu", "EFFECT", "PITCH")),
            setVar("suara", soundMenu("pop")),
            setVar("selesai", "ya"),
          ]],
        },
      ],
      frames: 4,
      focus: ["sound_play", "sound_playuntildone", "sound_stopallsounds", "sound_seteffectto", "sound_changeeffectby", "sound_cleareffects", "sound_sounds_menu", "sound_beats_menu", "sound_effects_menu"],
    }),
  ];
}

export function eventCases(): ParityCase[] {
  return [
    mkCase({
      id: "events/flag-order",
      category: "events",
      title: "urutan thread green flag: sprite depan dulu, lalu urutan skrip",
      sprites: ["A", "B", "C"].map((name) => ({
        name,
        scripts: [
          [flag(), b("data_addtolist", { ITEM: `${name}1` }, { LIST: ["log", "list_log"] })],
          [flag(), b("data_addtolist", { ITEM: `${name}2` }, { LIST: ["log", "list_log"] })],
        ],
      })),
      stage: { scripts: [[flag(), b("data_addtolist", { ITEM: "stage" }, { LIST: ["log", "list_log"] })]] },
      frames: 2,
      focus: ["event_whenflagclicked"],
    }),
    mkCase({
      id: "events/broadcast",
      category: "events",
      title: "broadcast ke banyak penerima + restart thread yang masih jalan",
      sprites: ["A", "B"].map((name) => ({
        name,
        scripts: [
          [flag(), b("event_broadcast", { BROADCAST_INPUT: bc("pesan") }), wait(0.1), b("event_broadcast", { BROADCAST_INPUT: bc("pesan") })],
          [b("event_whenbroadcastreceived", {}, { BROADCAST_OPTION: ["pesan", "bc_pesan"] }), repeat(10, [b("motion_changexby", { DX: 3 })]), changeVar(`selesai${name}`, 1)],
        ],
      })),
      frames: 20,
      focus: ["event_broadcast", "event_whenbroadcastreceived", "event_broadcast_menu"],
    }),
    mkCase({
      id: "events/broadcast-by-name",
      category: "events",
      title: "broadcast dari reporter (nama tidak peka huruf besar)",
      sprites: [{
        name: "A",
        scripts: [
          [flag(), b("event_broadcast", { BROADCAST_INPUT: b("operator_join", { STRING1: "PES", STRING2: "an" }) }), b("event_broadcast", { BROADCAST_INPUT: b("operator_join", { STRING1: "tidak", STRING2: "ada" }) })],
          [b("event_whenbroadcastreceived", {}, { BROADCAST_OPTION: ["pesan", "bc_pesan"] }), changeVar("diterima", 1)],
        ],
      }],
      frames: 3,
      focus: ["event_broadcast"],
    }),
    mkCase({
      id: "events/broadcastandwait",
      category: "events",
      title: "broadcast and wait menunggu semua penerima selesai",
      sprites: ["A", "B"].map((name, i) => ({
        name,
        scripts: [
          ...(i === 0 ? [[flag(), b("event_broadcastandwait", { BROADCAST_INPUT: bc("kerja") }), setVar("sesudah", b("motion_xposition"))]] : []),
          [b("event_whenbroadcastreceived", {}, { BROADCAST_OPTION: ["kerja", "bc_kerja"] }), repeat(i * 5 + 3, [b("motion_changexby", { DX: 2 })])],
        ],
      })),
      frames: 14,
      focus: ["event_broadcastandwait"],
    }),
    mkCase({
      id: "events/keypressed",
      category: "events",
      title: "when key pressed (spasi, huruf, panah, any)",
      sprites: [{
        name: "A",
        scripts: [
          [b("event_whenkeypressed", {}, { KEY_OPTION: "space" }), changeVar("spasi", 1)],
          [b("event_whenkeypressed", {}, { KEY_OPTION: "a" }), changeVar("a", 1)],
          [b("event_whenkeypressed", {}, { KEY_OPTION: "left arrow" }), changeVar("kiri", 1)],
          [b("event_whenkeypressed", {}, { KEY_OPTION: "any" }), changeVar("apapun", 1)],
          [b("event_whenkeypressed", {}, { KEY_OPTION: "1" }), changeVar("satu", 1)],
        ],
      }],
      frames: 8,
      greenFlag: false,
      actions: [
        { frame: 2, kind: "key", key: " ", isDown: true },
        { frame: 3, kind: "key", key: " ", isDown: false },
        { frame: 4, kind: "key", key: "A", isDown: true },
        { frame: 4, kind: "key", key: "ArrowLeft", isDown: true },
        { frame: 5, kind: "key", key: "1", isDown: true },
        { frame: 6, kind: "key", key: "Shift", isDown: true },
      ],
      focus: ["event_whenkeypressed"],
    }),
    mkCase({
      id: "events/clicks",
      category: "events",
      title: "klik sprite, klik panggung, sprite draggable",
      sprites: [
        { name: "A", x: 0, y: 0, scripts: [[b("event_whenthisspriteclicked"), changeVar("klikA", 1), repeat(3, [b("motion_turnright", { DEGREES: 15 })])]] },
        { name: "B", x: -150, y: 100, draggable: true, scripts: [[b("event_whenthisspriteclicked"), changeVar("klikB", 1)]] },
      ],
      stage: { scripts: [[b("event_whenstageclicked"), changeVar("klikPanggung", 1)]] },
      frames: 10,
      greenFlag: false,
      actions: [
        { frame: 2, kind: "mouse", x: 240, y: 180, isDown: true },
        { frame: 3, kind: "mouse", x: 240, y: 180, isDown: false },
        { frame: 4, kind: "mouse", x: 470, y: 350, isDown: true },
        { frame: 5, kind: "mouse", x: 470, y: 350, isDown: false },
        { frame: 6, kind: "mouse", x: 90, y: 80, isDown: true },
        { frame: 7, kind: "mouse", x: 90, y: 80, isDown: false },
      ],
      focus: ["event_whenthisspriteclicked", "event_whenstageclicked"],
    }),
    mkCase({
      id: "events/whengreaterthan",
      category: "events",
      title: "hat edge-activated timer > x dan loudness > x",
      sprites: [{
        name: "A",
        scripts: [
          [b("event_whengreaterthan", { VALUE: 0.2 }, { WHENGREATERTHANMENU: "TIMER" }), changeVar("timerHat", 1)],
          [b("event_whengreaterthan", { VALUE: -5 }, { WHENGREATERTHANMENU: "LOUDNESS" }), changeVar("loudHat", 1)],
          [flag(), wait(0.4), b("sensing_resettimer")],
        ],
      }],
      frames: 30,
      focus: ["event_whengreaterthan"],
    }),
    mkCase({
      id: "events/whentouchingobject",
      category: "events",
      title: "hat when touching (sprite & edge)",
      sprites: [
        { name: "A", x: -100, scripts: [
          [flag(), forever([b("motion_changexby", { DX: 10 })])],
          [b("event_whentouchingobject", { TOUCHINGOBJECTMENU: menu("event_touchingobjectmenu", "TOUCHINGOBJECTMENU", "B") }), changeVar("sentuhB", 1)],
          [b("event_whentouchingobject", { TOUCHINGOBJECTMENU: menu("event_touchingobjectmenu", "TOUCHINGOBJECTMENU", "_edge_") }), changeVar("sentuhTepi", 1)],
        ] },
        { name: "B", x: 60, scripts: [] },
      ],
      frames: 40,
      focus: ["event_whentouchingobject", "event_touchingobjectmenu"],
    }),
  ];
}
