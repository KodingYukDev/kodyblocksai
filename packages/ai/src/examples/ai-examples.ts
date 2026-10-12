/**
 * Contoh project AI bawaan + kartu tutorial (Bahasa Indonesia). App menampilkan AI_EXAMPLES sebagai
 * kartu, lalu memanggil buildAiExampleSb3(id, { kodySvg }) dan membuka hasilnya lewat jalur
 * "buka .sb3" yang sudah ada (ekstensi yang dipakai ikut dimuat otomatis).
 * Modul ini dimuat lazy: loadAiExamples() di index.ts.
 */
import type { ProjectModel, TargetState } from "@kody/engine";
import { TextClassifier } from "../classifier/text-nb";
import { TRAINED_STATE_KEYS } from "../classifier/storage";
import type { LabKind } from "../lab/lab-session";
import { ScriptBuilder, menu, num, reporter, text } from "./script-builder";
import type { BlockSpec } from "./script-builder";

export interface AiExample {
  id: string;
  title: string;
  /** Satu kalimat untuk kartu. */
  summary: string;
  /** Konsep AI yang dipelajari. */
  concept: string;
  level: "Pemula" | "Menengah";
  minutes: number;
  /** Ekstensi yang dipakai project (dimuat otomatis saat project dibuka). */
  extensions: string[];
  /** Tab AI Lab yang perlu dibuka untuk melatih model (null = langsung jalan). */
  labTab: LabKind | null;
  /** Kelas yang harus dilatih anak (nama persis seperti di blok). */
  trainClasses: string[];
  steps: string[];
}

export const AI_EXAMPLES: readonly AiExample[] = [
  {
    id: "batu-gunting-kertas",
    title: "Batu Gunting Kertas",
    summary: "Latih AI mengenali tanganmu: batu, gunting, atau kertas. Kody akan melawanmu!",
    concept: "Klasifikasi gambar: AI belajar dari contoh foto yang kamu kumpulkan sendiri.",
    level: "Pemula",
    minutes: 20,
    extensions: ["aiImage"],
    labTab: "image",
    trainClasses: ["batu", "gunting", "kertas"],
    steps: [
      "Buka AI Lab, pilih tab Gambar.",
      "Ganti nama kelas menjadi batu, gunting, dan kertas (tambah kelas ketiga).",
      "Nyalakan kamera. Untuk tiap kelas, tahan tombol rekam sambil menunjukkan tanganmu dari beberapa sudut (minimal 20 contoh).",
      "Tekan Latih model, lalu uji: apakah bar kepercayaan menunjuk kelas yang benar?",
      "Tutup AI Lab dan klik bendera hijau. Tunjukkan tanganmu ke kamera!",
      "Tantangan: ubah skrip supaya Kody memilih secara acak dan menghitung skor.",
    ],
  },
  {
    id: "wajah-pengikut",
    title: "Kody Mengikuti Wajahmu",
    summary: "Kody menempel di hidungmu dan menirukan ekspresimu.",
    concept: "Deteksi wajah: AI menemukan titik-titik wajah (hidung, mata) tanpa perlu dilatih.",
    level: "Pemula",
    minutes: 10,
    extensions: ["aiFace"],
    labTab: null,
    trainClasses: [],
    steps: [
      "Klik bendera hijau dan izinkan kamera.",
      "Gerakkan kepalamu. Kody mengikuti ujung hidungmu.",
      "Coba tersenyum atau buka mulut. Lihat apa yang dikatakan Kody.",
      "Tantangan: ganti titik wajah menjadi mata kiri, atau buat Kody membesar saat kamu tersenyum.",
    ],
  },
  {
    id: "pengendali-gestur",
    title: "Pengendali Gestur Tangan",
    summary: "Gerakkan Kody dengan jari telunjuk, putar dengan kepalan tangan.",
    concept: "Deteksi tangan: AI melacak 21 titik jari dan mengenali gestur seperti jempol dan telapak.",
    level: "Pemula",
    minutes: 15,
    extensions: ["aiHand"],
    labTab: null,
    trainClasses: [],
    steps: [
      "Klik bendera hijau dan izinkan kamera.",
      "Tunjukkan jari telunjuk ke atas: Kody mengikuti ujung jarimu.",
      "Kepalkan tangan untuk memutar Kody, buka telapak tangan untuk menyapa.",
      "Tantangan: buka AI Lab tab Gestur Tangan dan latih gestur buatanmu sendiri (mis. angka 1, 2, 3).",
    ],
  },
  {
    id: "perintah-suara",
    title: "Perintah Suara",
    summary: "Tepuk tangan supaya Kody maju, bersiul supaya Kody berputar.",
    concept: "Klasifikasi suara: AI belajar membedakan suara dari ringkasan frekuensinya.",
    level: "Menengah",
    minutes: 20,
    extensions: ["aiAudio"],
    labTab: "audio",
    trainClasses: ["tepuk", "siul"],
    steps: [
      "Buka AI Lab, pilih tab Suara.",
      "Rekam Suara latar (ruangan tenang) beberapa kali.",
      "Ganti nama kelas menjadi tepuk dan siul. Rekam masing-masing minimal 4 contoh.",
      "Latih model, lalu tekan Dengarkan langsung untuk mengujinya.",
      "Tutup AI Lab, klik bendera hijau, lalu tepuk tangan!",
      "Tantangan: tambah kelas ketiga, misalnya jentik jari, untuk melompat.",
    ],
  },
  {
    id: "chatbot-perasaan",
    title: "Chatbot Perasaan",
    summary: "Kody bertanya kabarmu dan menebak apakah kamu senang atau sedih.",
    concept: "Klasifikasi teks: AI belajar dari contoh kalimat. Modelnya sudah dilatih, kamu bisa menambah contoh.",
    level: "Pemula",
    minutes: 15,
    extensions: ["aiText"],
    labTab: "text",
    trainClasses: ["senang", "sedih"],
    steps: [
      "Klik bendera hijau dan jawab pertanyaan Kody.",
      "Coba kalimat yang aneh. Apakah tebakan AI selalu benar?",
      "Buka AI Lab tab Teks, tambahkan kalimatmu sendiri, lalu Latih ulang.",
      "Tantangan: tambah kelas marah dan buat jawaban Kody untuk kelas itu.",
    ],
  },
  {
    id: "pose-pahlawan",
    title: "Pose Pahlawan",
    summary: "Angkat kedua tangan supaya Kody terbang, turunkan supaya mendarat.",
    concept: "Klasifikasi pose: AI belajar dari posisi bahu, siku, dan tanganmu.",
    level: "Menengah",
    minutes: 20,
    extensions: ["aiPose"],
    labTab: "pose",
    trainClasses: ["tangan ke atas", "berdiri biasa"],
    steps: [
      "Buka AI Lab, pilih tab Pose Tubuh.",
      "Ganti nama kelas menjadi tangan ke atas dan berdiri biasa.",
      "Berdiri agak jauh dari kamera. Rekam tiap pose minimal 10 contoh.",
      "Latih model dan uji di panel Uji model.",
      "Tutup AI Lab, klik bendera hijau, dan beraksilah!",
    ],
  },
];

// ---------------------------------------------------------------------------
// skrip tiap contoh
// ---------------------------------------------------------------------------

const flag: BlockSpec = { opcode: "event_whenflagclicked" };
const say = (msg: string): BlockSpec => ({ opcode: "looks_say", inputs: { MESSAGE: text(msg) } });
const sayFor = (msg: string, secs = 2): BlockSpec => ({ opcode: "looks_sayforsecs", inputs: { MESSAGE: text(msg), SECS: num(secs) } });
const videoOn = (ext: string): BlockSpec => ({ opcode: `${ext}_videoToggle`, inputs: { VIDEO_STATE: menu(`${ext}_menu_VIDEO_STATE`, "VIDEO_STATE", "on") } });
const transparency = (ext: string, v: number): BlockSpec => ({ opcode: `${ext}_setVideoTransparency`, inputs: { TRANSPARENCY: num(v) } });
const startAuto = (ext: string): BlockSpec => ({ opcode: `${ext}_startAuto` });
const classHat = (opcode: string, ext: string, value: string): BlockSpec => ({ opcode, inputs: { CLASS: menu(`${ext}_menu_CLASS`, "CLASS", value) } });

function scripts(id: string): ScriptBuilder {
  const b = new ScriptBuilder(`ex-${id}-`);
  switch (id) {
    case "batu-gunting-kertas":
      b.script(40, 40, flag, [videoOn("aiImage"), transparency("aiImage", 30), startAuto("aiImage"), say("Tunjukkan batu, gunting, atau kertas!")]);
      b.script(40, 260, classHat("aiImage_whenClass", "aiImage", "batu"), [sayFor("Batu! Aku pilih kertas. Aku menang!")]);
      b.script(40, 380, classHat("aiImage_whenClass", "aiImage", "gunting"), [sayFor("Gunting! Aku pilih batu. Aku menang!")]);
      b.script(40, 500, classHat("aiImage_whenClass", "aiImage", "kertas"), [sayFor("Kertas! Aku pilih gunting. Aku menang!")]);
      break;
    case "wajah-pengikut": {
      const nose = (axis: string): BlockSpec => ({
        opcode: "aiFace_landmarkPosition",
        fields: { AXIS: axis },
        inputs: { LANDMARK: menu("aiFace_menu_LANDMARK", "LANDMARK", "1"), FACE: num(1) },
      });
      b.script(40, 40, flag, [
        videoOn("aiFace"),
        transparency("aiFace", 20),
        startAuto("aiFace"),
        {
          opcode: "control_forever",
          substack: [
            {
              opcode: "control_if_else",
              inputs: { CONDITION: reporter({ opcode: "aiFace_isFaceDetected" }) },
              substack: [
                { opcode: "motion_gotoxy", inputs: { X: reporter(nose("x")), Y: reporter(nose("y")) } },
                { opcode: "looks_say", inputs: { MESSAGE: reporter({ opcode: "aiFace_expression", inputs: { FACE: num(1) } }) } },
              ],
              substack2: [say("Mana wajahmu?")],
            },
          ],
        },
      ]);
      break;
    }
    case "pengendali-gestur": {
      const finger = (axis: string): BlockSpec => ({
        opcode: "aiHand_landmarkPosition",
        fields: { AXIS: axis },
        inputs: { LANDMARK: menu("aiHand_menu_LANDMARK", "LANDMARK", "8"), HAND: num(1) },
      });
      const gesture = (g: string): BlockSpec => ({ opcode: "aiHand_isGesture", inputs: { GESTURE: menu("aiHand_menu_GESTURE", "GESTURE", g) } });
      b.script(40, 40, flag, [
        videoOn("aiHand"),
        transparency("aiHand", 30),
        startAuto("aiHand"),
        {
          opcode: "control_forever",
          substack: [
            {
              opcode: "control_if",
              inputs: { CONDITION: reporter(gesture("Pointing_Up")) },
              substack: [{ opcode: "motion_gotoxy", inputs: { X: reporter(finger("x")), Y: reporter(finger("y")) } }],
            },
            {
              opcode: "control_if",
              inputs: { CONDITION: reporter(gesture("Closed_Fist")) },
              substack: [{ opcode: "motion_turnright", inputs: { DEGREES: num(10) } }],
            },
          ],
        },
      ]);
      // Kolom sama dengan skrip utama (ditumpuk otomatis): blok "pergi ke x: (posisi jari) y: (...)" lebih lebar dari 380 px.
      b.script(40, 680, { opcode: "aiHand_whenGesture", inputs: { GESTURE: menu("aiHand_menu_GESTURE", "GESTURE", "Open_Palm") } }, [sayFor("Halo juga!")]);
      break;
    }
    case "perintah-suara":
      b.script(40, 40, flag, [{ opcode: "aiAudio_startListening" }, sayFor("Tepuk tangan untuk maju, siul untuk berputar!", 3)]);
      b.script(40, 220, classHat("aiAudio_whenSoundClass", "aiAudio", "tepuk"), [
        { opcode: "motion_movesteps", inputs: { STEPS: num(40) } },
        { opcode: "motion_ifonedgebounce" },
      ]);
      b.script(40, 380, classHat("aiAudio_whenSoundClass", "aiAudio", "siul"), [{ opcode: "motion_turnright", inputs: { DEGREES: num(90) } }]);
      break;
    case "chatbot-perasaan": {
      const isClass = (c: string): BlockSpec => ({
        opcode: "aiText_isTextClass",
        inputs: { TEXT: reporter({ opcode: "sensing_answer" }), CLASS: menu("aiText_menu_CLASS", "CLASS", c) },
      });
      const reply = (msg: string): BlockSpec[] => [sayFor(msg, 1), { opcode: "aiText_speak", inputs: { TEXT: text(msg) } }];
      b.script(40, 40, flag, [
        { opcode: "aiText_setSpeechLanguage", inputs: { LANGUAGE: menu("aiText_menu_LANGUAGE", "LANGUAGE", "id-ID") } },
        {
          opcode: "control_forever",
          substack: [
            { opcode: "sensing_askandwait", inputs: { QUESTION: text("Bagaimana perasaanmu hari ini?") } },
            {
              opcode: "control_if_else",
              inputs: { CONDITION: reporter(isClass("senang")) },
              substack: reply("Asyik! Aku ikut senang mendengarnya."),
              substack2: reply("Peluk dari Kody. Semoga cepat membaik ya."),
            },
          ],
        },
      ]);
      break;
    }
    case "pose-pahlawan":
      b.script(40, 40, flag, [videoOn("aiPose"), transparency("aiPose", 30), startAuto("aiPose"), { opcode: "motion_gotoxy", inputs: { X: num(0), Y: num(-100) } }]);
      b.script(40, 240, classHat("aiPose_whenPoseClass", "aiPose", "tangan ke atas"), [
        sayFor("Hore! Kody terbang!", 1),
        { opcode: "motion_glidesecstoxy", inputs: { SECS: num(1), X: num(0), Y: num(120) } },
      ]);
      b.script(40, 420, classHat("aiPose_whenPoseClass", "aiPose", "berdiri biasa"), [
        { opcode: "motion_glidesecstoxy", inputs: { SECS: num(1), X: num(0), Y: num(-100) } },
      ]);
      break;
    default:
      throw new Error(`Contoh tidak dikenal: ${id}`);
  }
  return b;
}

/** Model teks awal untuk "chatbot-perasaan" (dilatih dari kalimat di bawah, hanya hitungan kata yang disimpan). */
function feelingsModel(): ReturnType<TextClassifier["toTrained"]> {
  const clf = new TextClassifier();
  const data: Record<string, string[]> = {
    senang: [
      "aku senang sekali",
      "hari ini menyenangkan",
      "aku bahagia",
      "seru banget main sama teman",
      "aku dapat nilai bagus",
      "asyik liburan",
      "aku gembira",
      "baik baik saja dan semangat",
      "luar biasa keren",
      "aku suka hari ini",
    ],
    sedih: [
      "aku sedih",
      "hari ini buruk",
      "aku kecewa",
      "aku capek dan lelah",
      "temanku pindah sekolah",
      "aku kesepian",
      "nilaiku jelek",
      "aku menangis",
      "tidak enak badan",
      "aku tidak suka hari ini",
    ],
  };
  for (const [label, sentences] of Object.entries(data)) {
    clf.addLabel(label);
    for (const s of sentences) clf.addExample(label, s);
  }
  return clf.toTrained(0);
}

export interface BuildExampleOptions {
  /** Isi SVG maskot Kody (sama dengan project default app). */
  kodySvg: string;
}

export function findAiExample(id: string): AiExample | undefined {
  return AI_EXAMPLES.find((e) => e.id === id);
}

/** Project (model + aset) untuk contoh `id`. */
export async function buildAiExample(id: string, opts: BuildExampleOptions): Promise<{ model: ProjectModel; assets: ReadonlyMap<string, Uint8Array> }> {
  const example = findAiExample(id);
  if (!example) throw new Error(`Contoh tidak dikenal: ${id}`);
  const { createDefaultProject } = await import("@kody/project");
  const project = createDefaultProject(opts.kodySvg, { locale: "id" });
  const model = project.model;
  const stage = model.targets.find((t) => t.isStage) as TargetState;
  const sprite = model.targets.find((t) => !t.isStage) as TargetState;
  sprite.blocks = scripts(id).blocks;
  model.extensions = [...example.extensions];
  stage.videoState = "off";
  if (id === "chatbot-perasaan") stage.extensionState = { [TRAINED_STATE_KEYS.text]: feelingsModel() };
  return { model, assets: project.assets };
}

/** File .sb3 untuk contoh `id`, siap dibuka lewat alur "buka file" app. */
export async function buildAiExampleSb3(id: string, opts: BuildExampleOptions): Promise<Uint8Array> {
  const { model, assets } = await buildAiExample(id, opts);
  const { saveSb3 } = await import("@kody/project");
  return saveSb3(model, assets);
}
