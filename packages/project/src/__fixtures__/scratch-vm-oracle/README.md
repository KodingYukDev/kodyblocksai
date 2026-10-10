# Oracle serialisasi scratch-vm

`<nama>.json` = `vm.toJSON()` dari scratch-vm 5.0.300 (devDependency, hanya untuk tes) setelah
`vm.loadProject()` pada `_reference/scratch-vm/test/fixtures/<nama>.sb3`, tanpa renderer/audio,
`meta` dipangkas ke `{semver}`. Ini DATA keluaran (bukan kode), dipakai `reference-fixtures.test.ts`
untuk memastikan serialisasi `@kody/project` identik dengan Scratch.

Cara membuat ulang (skrip di luar repo agar paket produksi tidak menyentuh scratch-vm):

```js
const VM = require("<repo>/node_modules/scratch-vm");
const { ScratchStorage } = require("<repo>/node_modules/scratch-storage");
const vm = new VM();
vm.attachStorage(new ScratchStorage());
await vm.loadProject(fs.readFileSync(fixture));
const json = JSON.parse(vm.toJSON());
json.meta = { semver: json.meta.semver };
```
