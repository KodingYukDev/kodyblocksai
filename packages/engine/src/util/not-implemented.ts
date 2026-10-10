/** Penanda stub scaffold. Agent pemilik file mengganti pemanggilan ini dengan implementasi nyata. */
export class NotImplementedError extends Error {
  constructor(what: string) {
    super(`Belum diimplementasikan: ${what}`);
    this.name = "NotImplementedError";
  }
}

export function notImplemented(what: string): never {
  throw new NotImplementedError(what);
}
