/**
 * Shared atmosphere GLSL. `skyRadiance()` is evaluated by the sky dome, by the environment
 * capture (image-based lighting) and — through the fog patch — by every world material, so distant
 * terrain takes on the actual colour of the sky behind it (aerial perspective) at every time of day.
 *
 * Model: Preetham single scattering (Rayleigh + Mie, as in three.js' Sky addon) plus a twilight glow
 * and a night-sky floor, because Preetham alone goes black the moment the sun touches the horizon.
 */
export const SKY_UNIFORMS_GLSL = /* glsl */ `
uniform vec3  uSunDir;
uniform float uSunE;
uniform vec3  uBetaR;
uniform vec3  uBetaM;
uniform float uMieG;
uniform float uTwilight;
uniform float uNight;
uniform vec3  uOvercast;
uniform float uOvercastAmt;
uniform float uSkyScale;
`;

export const SKY_RADIANCE_GLSL = /* glsl */ `
${SKY_UNIFORMS_GLSL}
const float SKY_PI = 3.141592653589793;

/** Linear HDR sky colour looking along direction d (y is clamped above the horizon). */
vec3 skyRadiance(vec3 d) {
  d = normalize(vec3(d.x, max(d.y, 0.0), d.z) + vec3(0.0, 1e-4, 0.0));
  float zen = acos(d.y);
  float inv = 1.0 / (cos(zen) + 0.15 * pow(93.885 - degrees(zen), -1.253));
  float sR = 8.4e3 * inv;
  float sM = 1.25e3 * inv;
  vec3 Fex = exp(-(uBetaR * sR + uBetaM * sM));

  float cosT = dot(d, uSunDir);
  float rPhase = 0.05968310365946075 * (1.0 + pow(cosT * 0.5 + 0.5, 2.0));
  float g2 = uMieG * uMieG;
  float mPhase = 0.07957747154594767 * ((1.0 - g2) / pow(1.0 - 2.0 * uMieG * cosT + g2, 1.5));
  vec3 betaRT = uBetaR * rPhase;
  vec3 betaMT = uBetaM * mPhase;
  vec3 ratio = (betaRT + betaMT) / (uBetaR + uBetaM);

  vec3 Lin = pow(uSunE * ratio * (1.0 - Fex), vec3(1.5));
  Lin *= mix(vec3(1.0), pow(uSunE * ratio * Fex, vec3(0.5)), clamp(pow(1.0 - uSunDir.y, 5.0), 0.0, 1.0));
  vec3 col = Lin * uSkyScale;

  // Twilight: a warm band hugging the horizon on the sun's side, blue-hour gradient above it.
  vec3 dh = normalize(vec3(d.x, 0.0, d.z) + vec3(1e-4, 0.0, 0.0));
  vec3 sh = normalize(vec3(uSunDir.x, 0.0, uSunDir.z) + vec3(1e-4, 0.0, 0.0));
  float side = pow(max(dot(dh, sh) * 0.5 + 0.5, 0.0), 3.0);
  float hor = exp(-d.y * 4.5);
  vec3 glow = mix(vec3(0.05, 0.09, 0.24), vec3(1.0, 0.40, 0.16), side * hor);
  glow = mix(glow, vec3(0.85, 0.22, 0.38), pow(side, 5.0) * hor * 0.45);
  col += glow * uTwilight * (0.02 + 0.55 * side * hor + 0.10 * (1.0 - d.y));

  // Night floor (moonless baseline; moon, stars and clouds are added by the dome only).
  col += mix(vec3(0.0035, 0.0065, 0.017), vec3(0.012, 0.016, 0.030), hor) * uNight;

  // Overcast / storm / fog weather desaturates and dims the whole sky toward a grey.
  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(col, uOvercast * (luma * 1.1 + 0.02 * (1.0 - uNight)), uOvercastAmt);
  return col;
}
`;

/** World-material fog: exponential-squared with height falloff, coloured by the sky itself. */
export const FOG_PARS_FRAGMENT = /* glsl */ `
#ifdef USE_FOG
  uniform float fogDensity;
  uniform float uFogFalloff;
  varying float vFogDepth;
  varying vec3 vFogViewPos;
#endif
`;

export const FOG_FRAGMENT = /* glsl */ `
#ifdef USE_FOG
  {
    vec3 fogOff = transpose(mat3(viewMatrix)) * vFogViewPos;       // camera → fragment, world space
    float fragY = max(cameraPosition.y + fogOff.y, 0.0);
    float avgY = 0.5 * (max(cameraPosition.y, 0.0) + fragY);
    float optical = fogDensity * vFogDepth * exp(-avgY * uFogFalloff);
    float fogFactor = 1.0 - exp(-optical * optical);
    vec3 fogCol = skyRadiance(fogOff);
    if (uUnder > 0.0) {
      // under the sea: thick blue-green murk that swallows everything past ~25 m
      float u = 1.0 - exp(-vFogDepth * 0.09);
      fogFactor = mix(fogFactor, u, uUnder);
      fogCol = mix(fogCol, vec3(0.010, 0.055, 0.07) * (1.0 - 0.85 * uNight), uUnder);
    }
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogCol, fogFactor);
  }
#endif
`;

/** Uniforms every world material may read (not declared by the sky dome, which has its own uTime). */
export const WORLD_UNIFORMS_GLSL = /* glsl */ `
uniform float uWet;
uniform float uTime;
uniform float uUnder;
`;

/** Small value-noise toolkit for procedural materials (prefixed n_ to avoid clashes). */
export const NOISE_GLSL = /* glsl */ `
float n_hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float n_noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(n_hash21(i), n_hash21(i + vec2(1, 0)), f.x), mix(n_hash21(i + vec2(0, 1)), n_hash21(i + vec2(1, 1)), f.x), f.y);
}
float n_fbm(vec2 p) {
  float a = 0.5, f = 0.0;
  for (int i = 0; i < 4; i++) { f += a * n_noise(p); p = p * 2.03 + vec2(5.2, 1.3); a *= 0.5; }
  return f;
}
`;
