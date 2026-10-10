// Stub modul untuk memuat scratch-render 1.2.115 (BSD-3) sebagai oracle di tes: minilog,
// scratch-svg-renderer, dan loader webpack (!ify-loader!...) tidak dibutuhkan jalur CPU.
const noop = () => {};
const logger = { warn: noop, error: noop, info: noop, log: noop, debug: noop };
function stub() {
  return logger;
}
stub.enable = noop;
stub.loadSvgString = () => {
  throw new Error("stub");
};
stub.serializeSvgToString = () => "";
stub.nextBreak = () => 0;
module.exports = stub;
