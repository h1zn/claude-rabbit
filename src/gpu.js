// GPU post-processing (WebGL2). The game draws as ever onto its 2D canvas;
// each frame that picture goes through shaders on its way to the screen, at
// the display's own resolution:
//
//   upscale  'sharp'  crisp pixels with no uneven rows at any size (sharp
//                     bilinear: nearest inside a pixel, a 1-screen-pixel
//                     blend at its edges)
//            'smooth' plain bilinear
//            'hd'     pixel-art smoothing: EPX (Scale2x) twice, 4x, so
//                     diagonals and curves come out round, then sharp
//            'crt'    an arcade monitor: scanlines, a shadow mask and a
//                     gently curved glass
//   bloom    0-1: bright things (lava, lights, gems, explosions, shots) glow
//   grade    a touch more contrast and colour
//
// PostFX.create() returns null where WebGL2 isn't available; the 2D canvas
// is shown as it is then.

const VS = `#version 300 es
in vec2 pos;
out vec2 uv;
void main() { uv = pos * 0.5 + 0.5; gl_Position = vec4(pos, 0.0, 1.0); }`;

// EPX / Scale2x: each pixel becomes four, a corner taking a neighbour's
// colour where two neighbours agree across it (colours this close count).
const EPX = `#version 300 es
precision mediump float;
uniform sampler2D src;
uniform vec2 isz;
in vec2 uv;
out vec4 o;
bool eq(vec4 a, vec4 b) { return distance(a.rgb, b.rgb) < 0.1; }
void main() {
  vec2 p = uv * isz;
  ivec2 ip = ivec2(floor(p));
  vec2 f = fract(p);
  ivec2 m = ivec2(isz) - 1;
  vec4 P = texelFetch(src, ip, 0);
  vec4 A = texelFetch(src, clamp(ip + ivec2(0, 1), ivec2(0), m), 0);
  vec4 B = texelFetch(src, clamp(ip + ivec2(1, 0), ivec2(0), m), 0);
  vec4 C = texelFetch(src, clamp(ip + ivec2(-1, 0), ivec2(0), m), 0);
  vec4 D = texelFetch(src, clamp(ip + ivec2(0, -1), ivec2(0), m), 0);
  vec4 r = P;
  bool top = f.y >= 0.5; bool right = f.x >= 0.5;
  if (top && !right) { if (eq(C, A) && !eq(C, D) && !eq(A, B)) r = A; }
  else if (top && right) { if (eq(A, B) && !eq(A, C) && !eq(B, D)) r = B; }
  else if (!right) { if (eq(D, C) && !eq(D, B) && !eq(C, A)) r = C; }
  else { if (eq(B, D) && !eq(B, A) && !eq(D, C)) r = D; }
  o = r;
}`;

// Bloom, step 1: a quarter-sized picture of what is brighter than `thr`.
const BRIGHT = `#version 300 es
precision mediump float;
uniform sampler2D src;
uniform vec2 texel;
uniform float thr;
in vec2 uv;
out vec4 o;
void main() {
  vec3 c = (texture(src, uv + texel * vec2(-1.0, -1.0)).rgb + texture(src, uv + texel * vec2(1.0, -1.0)).rgb
    + texture(src, uv + texel * vec2(-1.0, 1.0)).rgb + texture(src, uv + texel * vec2(1.0, 1.0)).rgb) * 0.25;
  // By brightness, not colour: lights, flashes, shots and sparkles glow, the
  // vivid but ordinary scenery (green grass, a purple mushroom) doesn't.
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  o = vec4(c * smoothstep(thr, thr + 0.2, l), 1.0);
}`;

// Bloom, step 2: a 9-tap Gaussian, one direction at a time.
const BLUR = `#version 300 es
precision mediump float;
uniform sampler2D src;
uniform vec2 dir;
in vec2 uv;
out vec4 o;
void main() {
  vec3 c = texture(src, uv).rgb * 0.2270270270;
  c += (texture(src, uv + dir * 1.3846153846).rgb + texture(src, uv - dir * 1.3846153846).rgb) * 0.3162162162;
  c += (texture(src, uv + dir * 3.2307692308).rgb + texture(src, uv - dir * 3.2307692308).rgb) * 0.0702702703;
  o = vec4(c, 1.0);
}`;

// The picture to the screen: upscaled, the glow added, graded, and for the
// CRT look curved, scanlined and masked.
const FINAL = `#version 300 es
precision mediump float;
uniform sampler2D img;
uniform sampler2D glow;
uniform vec2 isz;
uniform vec2 osz;
uniform float bloom;
uniform float lines;
uniform int mode;
in vec2 uv;
out vec4 o;
vec2 curve(vec2 u) {
  u = u * 2.0 - 1.0;
  vec2 off = abs(u.yx) / vec2(6.0, 4.5);
  u = u + u * off * off;
  return u * 0.5 + 0.5;
}
void main() {
  vec2 u = uv;
  if (mode == 2) {
    u = curve(uv);
    if (u.x < 0.0 || u.y < 0.0 || u.x > 1.0 || u.y > 1.0) { o = vec4(0.0, 0.0, 0.0, 1.0); return; }
  }
  vec3 col;
  if (mode == 1) col = texture(img, u).rgb;
  else {
    vec2 t = u * isz;
    vec2 k = max(osz / isz, vec2(1.0));
    vec2 a = clamp((fract(t) - 0.5) * k + 0.5, 0.0, 1.0);
    col = texture(img, (floor(t) + a) / isz).rgb;
  }
  col += texture(glow, u).rgb * bloom;
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, 1.05);
  col = (col - 0.5) * 1.03 + 0.5;
  if (mode == 2) {
    float s = sin(u.y * lines * 6.2831853) * 0.5 + 0.5;
    col *= mix(0.68, 1.0, s);
    float m = mod(gl_FragCoord.x, 3.0);
    col *= (m < 1.0 ? vec3(1.0, 0.8, 0.8) : m < 2.0 ? vec3(0.8, 1.0, 0.8) : vec3(0.8, 0.8, 1.0)) * 1.18;
    vec2 v = u * (1.0 - u.yx);
    col *= pow(clamp(v.x * v.y * 18.0, 0.0, 1.0), 0.22);
  }
  o = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

const MODES = { sharp: 0, smooth: 1, crt: 2, hd: 0 };

export class PostFX {
  static create(canvas) {
    let gl = null;
    try { gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false }); } catch (e) { gl = null; }
    if (!gl) return null;
    try { return new PostFX(canvas, gl); } catch (e) { console.warn('GPU effects unavailable:', e.message); return null; }
  }

  constructor(canvas, gl) {
    this.canvas = canvas;
    this.gl = gl;
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.programs = {};
    for (const [name, fs] of Object.entries({ epx: EPX, bright: BRIGHT, blur: BLUR, final: FINAL })) this.programs[name] = this.program(fs);
    this.src = this.texture();
    this.targets = new Map();      // name -> { tex, fbo, w, h }
  }

  program(fs) {
    const gl = this.gl;
    const shader = (type, text) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, text);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, shader(gl.VERTEX_SHADER, VS));
    gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'pos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const uniforms = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const u = gl.getActiveUniform(p, i); uniforms[u.name] = gl.getUniformLocation(p, u.name); }
    return { p, u: uniforms };
  }

  texture() {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  // A render target of this size (made or remade as needed).
  target(name, w, h) {
    const gl = this.gl;
    let t = this.targets.get(name);
    if (t && t.w === w && t.h === h) return t;
    if (t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); }
    const tex = this.texture();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    t = { tex, fbo, w, h };
    this.targets.set(name, t);
    return t;
  }

  // One full-screen pass of `prog` into `out` (null: the screen).
  pass(prog, out, set) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, out ? out.fbo : null);
    gl.viewport(0, 0, out ? out.w : this.canvas.width, out ? out.h : this.canvas.height);
    gl.useProgram(prog.p);
    let unit = 0;
    for (const [name, v] of Object.entries(set)) {
      const loc = prog.u[name];
      if (loc === undefined) continue;
      if (v instanceof WebGLTexture) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, v); gl.uniform1i(loc, unit++); }
      else if (Array.isArray(v)) gl.uniform2f(loc, v[0], v[1]);
      else if (Number.isInteger(v) && name === 'mode') gl.uniform1i(loc, v);
      else gl.uniform1f(loc, v);
    }
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // The 2D canvas `scene` to the screen. `lines`: the picture's own rows
  // (360, for the scanlines).
  draw(scene, { upscale = 'sharp', bloom = 0.5, lines = 360 } = {}) {
    const gl = this.gl;
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.bindTexture(gl.TEXTURE_2D, this.src);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, scene);
    let img = this.src; let w = scene.width; let h = scene.height;
    if (upscale === 'hd') {
      for (const name of ['x2', 'x4']) {
        const t = this.target(name, w * 2, h * 2);
        this.pass(this.programs.epx, t, { src: img, isz: [w, h] });
        img = t.tex; w = t.w; h = t.h;
      }
    }
    // The glow: bright parts at 320 wide, blurred twice each way.
    const bw = 320; const bh = Math.max(1, Math.round(bw * h / w));
    const ga = this.target('glowA', bw, bh); const gb = this.target('glowB', bw, bh);
    let glow = null;
    if (bloom > 0) {
      this.pass(this.programs.bright, ga, { src: img, texel: [0.5 / bw, 0.5 / bh], thr: 0.7 });
      for (let k = 0; k < 2; k++) {
        this.pass(this.programs.blur, gb, { src: ga.tex, dir: [(1 + k) / bw, 0] });
        this.pass(this.programs.blur, ga, { src: gb.tex, dir: [0, (1 + k) / bh] });
      }
      glow = ga.tex;
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, ga.fbo);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      glow = ga.tex;
    }
    this.pass(this.programs.final, null, {
      img, glow, isz: [w, h], osz: [this.canvas.width, this.canvas.height],
      bloom, lines, mode: MODES[upscale] ?? 0,
    });
  }
}
