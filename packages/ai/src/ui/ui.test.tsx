// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { createFakeRuntime, fakeServices } from "../testing/fakes";
import { CameraIndicator } from "./CameraIndicator";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("CameraIndicator", () => {
  it("muncul saat kamera aktif dan tombol Matikan mematikan semua perangkat", async () => {
    const fake = createFakeRuntime();
    const { services, media } = fakeServices(fake);
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const forwarded: string[] = [];
    await act(async () => root.render(<CameraIndicator runtime={fake.runtime} onDeviceActive={(d, a) => forwarded.push(`${d}:${a}`)} />));
    expect(host.querySelector("[data-testid=ai-device-indicator]")).toBeNull();

    await act(async () => {
      await services.ensureCamera("aiHand");
    });
    const pill = host.querySelector("[data-testid=ai-device-indicator]");
    expect(pill?.textContent).toContain("Kamera aktif");
    expect(forwarded).toEqual(["camera:true"]);

    await act(async () => host.querySelector("button")?.click());
    expect(services.camera.enabled).toBe(false);
    expect(media.streams[0]?.tracks[0]?.stopped).toBe(true);
    expect(host.querySelector("[data-testid=ai-device-indicator]")).toBeNull();
    act(() => root.unmount());
  });
});
