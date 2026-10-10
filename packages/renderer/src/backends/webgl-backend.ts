/**
 * Backend WebGL: menggambar draw list dengan shader sprite (efek identik scratch-render),
 * blend premultiplied ONE / ONE_MINUS_SRC_ALPHA, proyeksi ortho panggung, filter nearest/linear
 * per drawable (skin.useNearest). Tekstur di-cache per SkinTexture + revision; yang tidak terpakai
 * beberapa detik dibuang dari GPU.
 */
import { m4 } from "twgl.js";
import type { Drawable } from "../drawable";
import { isPixelData, toImageData } from "../pixel-source";
import { QUAD_POSITIONS, QUAD_TEXCOORDS, buildShaderSources } from "../shaders";
import type { DrawMode } from "../shaders";
import { PenSkin } from "../skins/pen-skin";
import type { SkinTexture } from "../skins/skin";
import { framebufferScale } from "./backend";
import type { FrameInfo, RenderBackend } from "./backend";

type GL = WebGLRenderingContext;

interface Program {
  program: WebGLProgram;
  aPosition: number;
  aTexCoord: number;
  uniforms: Map<string, WebGLUniformLocation | null>;
}

interface TextureEntry {
  texture: WebGLTexture;
  revision: number;
  width: number;
  height: number;
  lastUsedFrame: number;
}

/** Tekstur yang tidak dipakai selama ini (frame) dihapus dari GPU. */
const TEXTURE_IDLE_FRAMES = 300;

export function getWebGLContext(canvas: HTMLCanvasElement | OffscreenCanvas): GL | null {
  const attrs: WebGLContextAttributes = { alpha: false, stencil: true, antialias: false };
  try {
    return (canvas.getContext("webgl", attrs) ?? canvas.getContext("experimental-webgl" as "webgl", attrs)) as GL | null;
  } catch {
    return null;
  }
}

export class WebGLBackend implements RenderBackend {
  readonly kind = "webgl" as const;
  private gl: GL;
  private programs = new Map<string, Program>();
  private textures = new Map<SkinTexture, TextureEntry>();
  private positionBuffer: WebGLBuffer | null = null;
  private texCoordBuffer: WebGLBuffer | null = null;
  private frameNumber = 0;
  private contextLost = false;
  private readonly onLost = (e: Event): void => {
    e.preventDefault();
    this.contextLost = true;
  };
  private readonly onRestored = (): void => {
    this.contextLost = false;
    this.programs.clear();
    this.textures.clear();
    this.setupGeometry();
  };

  constructor(private readonly canvas: HTMLCanvasElement, gl: GL) {
    this.gl = gl;
    canvas.addEventListener("webglcontextlost", this.onLost);
    canvas.addEventListener("webglcontextrestored", this.onRestored);
    this.setupGeometry();
  }

  private setupGeometry(): void {
    const gl = this.gl;
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    this.positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, QUAD_POSITIONS, gl.STATIC_DRAW);
    this.texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, QUAD_TEXCOORDS, gl.STATIC_DRAW);
  }

  setBufferSize(width: number, height: number): void {
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  getBufferSize(): [number, number] {
    return [this.canvas.width, this.canvas.height];
  }

  private compile(type: number, source: string): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type) as WebGLShader;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) {
      const log = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`Shader compile error: ${log ?? ""}`);
    }
    return shader;
  }

  private getProgram(drawMode: DrawMode, effectBits: number): Program {
    const key = `${drawMode}:${effectBits}`;
    const cached = this.programs.get(key);
    if (cached) return cached;
    const gl = this.gl;
    const src = buildShaderSources(drawMode, effectBits);
    const program = gl.createProgram() as WebGLProgram;
    gl.attachShader(program, this.compile(gl.VERTEX_SHADER, src.vertex));
    gl.attachShader(program, this.compile(gl.FRAGMENT_SHADER, src.fragment));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) {
      throw new Error(`Program link error: ${gl.getProgramInfoLog(program) ?? ""}`);
    }
    const entry: Program = {
      program,
      aPosition: gl.getAttribLocation(program, "a_position"),
      aTexCoord: gl.getAttribLocation(program, "a_texCoord"),
      uniforms: new Map(),
    };
    this.programs.set(key, entry);
    return entry;
  }

  private loc(p: Program, name: string): WebGLUniformLocation | null {
    if (!p.uniforms.has(name)) p.uniforms.set(name, this.gl.getUniformLocation(p.program, name));
    return p.uniforms.get(name) ?? null;
  }

  /** Unggah (atau perbarui) tekstur skin. */
  private bindTexture(tex: SkinTexture, pen: PenSkin | null): WebGLTexture {
    const gl = this.gl;
    let entry = this.textures.get(tex);
    const fresh = !entry;
    if (!entry) {
      const texture = gl.createTexture() as WebGLTexture;
      entry = { texture, revision: -1, width: 0, height: 0, lastUsedFrame: 0 };
      this.textures.set(tex, entry);
    }
    entry.lastUsedFrame = this.frameNumber;
    gl.bindTexture(gl.TEXTURE_2D, entry.texture);
    if (fresh || entry.revision !== tex.revision) {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, !tex.premultiplied);
      // Pena: unggah hanya baris yang berubah bila ukuran tekstur sama (tanpa area kotor -> unggah penuh).
      const dirty = pen && !fresh && entry.width === tex.width && entry.height === tex.height ? pen.takeDirty() : null;
      if (isPixelData(tex.source)) {
        const data = new Uint8Array(tex.source.data.buffer, tex.source.data.byteOffset, tex.source.data.length);
        if (dirty) {
          const rowBytes = tex.width * 4;
          const sub = data.subarray(dirty.y0 * rowBytes, dirty.y1 * rowBytes);
          gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, dirty.y0, tex.width, dirty.y1 - dirty.y0, gl.RGBA, gl.UNSIGNED_BYTE, sub);
        } else {
          const img = tex.premultiplied ? null : toImageData(tex.source);
          if (img) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
          else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, tex.width, tex.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
          pen?.takeDirty();
        }
      } else {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, tex.source);
      }
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      entry.revision = tex.revision;
      entry.width = tex.width;
      entry.height = tex.height;
    }
    return entry.texture;
  }

  drawFrame(frame: FrameInfo): void {
    if (this.contextLost || this.gl.isContextLost()) return;
    this.frameNumber++;
    const gl = this.gl;
    const [fbW, fbH] = this.getBufferSize();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, fbW, fbH);
    const bg = frame.backgroundColor4f;
    gl.clearColor(bg[0], bg[1], bg[2], bg[3]);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const projection = m4.ortho(frame.xLeft, frame.xRight, frame.yBottom, frame.yTop, -1, 1);
    this.drawThese(frame.drawables, "default", projection, frame.nativeSize, fbW, fbH, ~0);
    if (this.frameNumber % 60 === 0) this.sweepTextures();
  }

  private drawThese(
    drawables: readonly Drawable[],
    drawMode: DrawMode,
    projection: Float32Array | number[],
    nativeSize: readonly [number, number],
    fbW: number,
    fbH: number,
    effectMask: number,
  ): void {
    const gl = this.gl;
    let current: Program | null = null;
    for (const drawable of drawables) {
      if (!drawable.getVisible()) continue;
      const skin = drawable.skin;
      if (!skin) continue;
      const scale = framebufferScale(drawable, nativeSize, fbW, fbH);
      const tex = skin.getTexture(scale);
      if (!tex) continue;

      const effectBits = drawable.enabledEffects & effectMask;
      const program = this.getProgram(drawMode, effectBits);
      if (program !== current) {
        current = program;
        gl.useProgram(program.program);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.enableVertexAttribArray(program.aPosition);
        gl.vertexAttribPointer(program.aPosition, 2, gl.FLOAT, false, 0, 0);
        if (program.aTexCoord >= 0) {
          gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
          gl.enableVertexAttribArray(program.aTexCoord);
          gl.vertexAttribPointer(program.aTexCoord, 2, gl.FLOAT, false, 0, 0);
        }
        gl.uniformMatrix4fv(this.loc(program, "u_projectionMatrix"), false, projection);
        gl.uniform1i(this.loc(program, "u_skin"), 0);
      }

      const u = drawable.getUniforms();
      gl.uniformMatrix4fv(this.loc(program, "u_modelMatrix"), false, u.u_modelMatrix);
      if (effectBits !== 0) {
        gl.uniform1f(this.loc(program, "u_color"), u.u_color);
        gl.uniform1f(this.loc(program, "u_fisheye"), u.u_fisheye);
        gl.uniform1f(this.loc(program, "u_whirl"), u.u_whirl);
        gl.uniform1f(this.loc(program, "u_pixelate"), u.u_pixelate);
        gl.uniform1f(this.loc(program, "u_mosaic"), u.u_mosaic);
        gl.uniform1f(this.loc(program, "u_brightness"), u.u_brightness);
        gl.uniform1f(this.loc(program, "u_ghost"), u.u_ghost);
        const size = skin.size;
        gl.uniform2f(this.loc(program, "u_skinSize"), size[0], size[1]);
      }

      gl.activeTexture(gl.TEXTURE0);
      this.bindTexture(tex, skin instanceof PenSkin ? skin : null);
      const filter = skin.useNearest(scale, drawable) ? gl.NEAREST : gl.LINEAR;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
  }

  private sweepTextures(): void {
    for (const [tex, entry] of this.textures) {
      if (this.frameNumber - entry.lastUsedFrame > TEXTURE_IDLE_FRAMES) {
        this.gl.deleteTexture(entry.texture);
        this.textures.delete(tex);
      }
    }
  }

  /** Jumlah tekstur GPU aktif (statistik). */
  get textureCount(): number {
    return this.textures.size;
  }

  toDataURL(): string | null {
    try {
      return this.canvas.toDataURL("image/png");
    } catch {
      return null;
    }
  }

  dispose(): void {
    this.canvas.removeEventListener("webglcontextlost", this.onLost);
    this.canvas.removeEventListener("webglcontextrestored", this.onRestored);
    for (const entry of this.textures.values()) this.gl.deleteTexture(entry.texture);
    this.textures.clear();
    for (const p of this.programs.values()) this.gl.deleteProgram(p.program);
    this.programs.clear();
  }
}
