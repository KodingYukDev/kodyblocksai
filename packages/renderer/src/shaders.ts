/**
 * Sumber shader GLSL sprite. Port scratch-render 1.2.115 `src/shaders/sprite.vert` & `sprite.frag`
 * (BSD-3-Clause). Hanya mode gambar yang dipakai backend WebGL kita: default (panggung) dan
 * straightAlpha (snapshot drawable). Garis pena, silhouette, dan colorMask dikerjakan di CPU.
 */
import { EFFECTS } from "./effect-info";
import type { DrawMode } from "./effect-info";

export type { DrawMode } from "./effect-info";

export const SPRITE_VERTEX_SHADER = `precision mediump float;
uniform mat4 u_projectionMatrix;
uniform mat4 u_modelMatrix;
attribute vec2 a_texCoord;
attribute vec2 a_position;
varying vec2 v_texCoord;
void main() {
  gl_Position = u_projectionMatrix * u_modelMatrix * vec4(a_position, 0, 1);
  v_texCoord = a_texCoord;
}
`;

export const SPRITE_FRAGMENT_SHADER = `precision mediump float;
#ifdef ENABLE_color
uniform float u_color;
#endif
#ifdef ENABLE_brightness
uniform float u_brightness;
#endif
#ifdef ENABLE_fisheye
uniform float u_fisheye;
#endif
#ifdef ENABLE_whirl
uniform float u_whirl;
#endif
#ifdef ENABLE_pixelate
uniform float u_pixelate;
uniform vec2 u_skinSize;
#endif
#ifdef ENABLE_mosaic
uniform float u_mosaic;
#endif
#ifdef ENABLE_ghost
uniform float u_ghost;
#endif
uniform sampler2D u_skin;
varying vec2 v_texCoord;

const float epsilon = 1e-3;

#ifdef ENABLE_color
vec3 convertRGB2HSV(vec3 rgb)
{
  const vec4 hueOffsets = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 temp1 = rgb.b > rgb.g ? vec4(rgb.bg, hueOffsets.wz) : vec4(rgb.gb, hueOffsets.xy);
  vec4 temp2 = rgb.r > temp1.x ? vec4(rgb.r, temp1.yzx) : vec4(temp1.xyw, rgb.r);
  float m = min(temp2.y, temp2.w);
  float C = temp2.x - m;
  float V = temp2.x;
  return vec3(
    abs(temp2.z + (temp2.w - temp2.y) / (6.0 * C + epsilon)),
    C / (temp2.x + epsilon),
    V);
}

vec3 convertHue2RGB(float hue)
{
  float r = abs(hue * 6.0 - 3.0) - 1.0;
  float g = 2.0 - abs(hue * 6.0 - 2.0);
  float b = 2.0 - abs(hue * 6.0 - 4.0);
  return clamp(vec3(r, g, b), 0.0, 1.0);
}

vec3 convertHSV2RGB(vec3 hsv)
{
  vec3 rgb = convertHue2RGB(hsv.x);
  float c = hsv.z * hsv.y;
  return rgb * c + hsv.z - c;
}
#endif

const vec2 kCenter = vec2(0.5, 0.5);

void main()
{
  vec2 texcoord0 = v_texCoord;

#ifdef ENABLE_mosaic
  texcoord0 = fract(u_mosaic * texcoord0);
#endif

#ifdef ENABLE_pixelate
  {
    vec2 pixelTexelSize = u_skinSize / u_pixelate;
    texcoord0 = (floor(texcoord0 * pixelTexelSize) + kCenter) / pixelTexelSize;
  }
#endif

#ifdef ENABLE_whirl
  {
    const float kRadius = 0.5;
    vec2 offset = texcoord0 - kCenter;
    float offsetMagnitude = length(offset);
    float whirlFactor = max(1.0 - (offsetMagnitude / kRadius), 0.0);
    float whirlActual = u_whirl * whirlFactor * whirlFactor;
    float sinWhirl = sin(whirlActual);
    float cosWhirl = cos(whirlActual);
    mat2 rotationMatrix = mat2(
      cosWhirl, -sinWhirl,
      sinWhirl, cosWhirl
    );
    texcoord0 = rotationMatrix * offset + kCenter;
  }
#endif

#ifdef ENABLE_fisheye
  {
    vec2 vec = (texcoord0 - kCenter) / kCenter;
    float vecLength = length(vec);
    float r = pow(min(vecLength, 1.0), u_fisheye) * max(1.0, vecLength);
    vec2 unit = vec / vecLength;
    texcoord0 = kCenter + r * unit * kCenter;
  }
#endif

  gl_FragColor = texture2D(u_skin, texcoord0);

#if defined(ENABLE_color) || defined(ENABLE_brightness)
  gl_FragColor.rgb = clamp(gl_FragColor.rgb / (gl_FragColor.a + epsilon), 0.0, 1.0);

#ifdef ENABLE_color
  {
    vec3 hsv = convertRGB2HSV(gl_FragColor.xyz);
    const float minLightness = 0.11 / 2.0;
    const float minSaturation = 0.09;
    if (hsv.z < minLightness) hsv = vec3(0.0, 1.0, minLightness);
    else if (hsv.y < minSaturation) hsv = vec3(0.0, minSaturation, hsv.z);
    hsv.x = mod(hsv.x + u_color, 1.0);
    if (hsv.x < 0.0) hsv.x += 1.0;
    gl_FragColor.rgb = convertHSV2RGB(hsv);
  }
#endif

#ifdef ENABLE_brightness
  gl_FragColor.rgb = clamp(gl_FragColor.rgb + vec3(u_brightness), vec3(0), vec3(1));
#endif

  gl_FragColor.rgb *= gl_FragColor.a + epsilon;
#endif

#ifdef ENABLE_ghost
  gl_FragColor *= u_ghost;
#endif

#ifdef DRAW_MODE_straightAlpha
  gl_FragColor.rgb /= gl_FragColor.a + epsilon;
#endif
}
`;

/** Gabungkan #define mode & efek di depan sumber shader (ShaderManager._buildShader). */
export function buildShaderSources(drawMode: DrawMode, effectBits: number): { vertex: string; fragment: string } {
  const defines = [`#define DRAW_MODE_${drawMode}`];
  for (let i = 0; i < EFFECTS.length; i++) {
    if ((effectBits & (1 << i)) !== 0) defines.push(`#define ENABLE_${EFFECTS[i] as string}`);
  }
  const text = `${defines.join("\n")}\n`;
  return { vertex: text + SPRITE_VERTEX_SHADER, fragment: text + SPRITE_FRAGMENT_SHADER };
}

/** Quad satuan + koordinat tekstur (X dibalik), persis RenderWebGL._createGeometry. */
export const QUAD_POSITIONS = new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5]);
export const QUAD_TEXCOORDS = new Float32Array([1, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 1]);
