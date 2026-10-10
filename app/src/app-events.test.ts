import { describe, expect, it, vi } from "vitest";
import { createAppBus } from "./app-events";

describe("app event bus", () => {
  it("mengirim payload bertipe ke listener", () => {
    const bus = createAppBus();
    const fn = vi.fn();
    bus.on("editor:tab-changed", fn);
    bus.emit("editor:tab-changed", { tab: "costumes" });
    expect(fn).toHaveBeenCalledWith({ tab: "costumes" });
  });
});
