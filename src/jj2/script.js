// JJ2+ level scripts (.j2as, AngelScript). The game can't run AngelScript as
// such; this is a small interpreter for the part of it that level scripts use
// to set a level up and react to the player: statements, if / else, the
// script's own functions and globals, simple expressions, and these JJ2+
// names (anything else is skipped quietly, and an `if` whose condition can't
// be worked out runs neither branch):
//   jjTriggers[n]  jjDifficulty  jjWaterLevel  jjMaxHealth  jjLevelName
//   jjMusicLoad(f)  jjMusicStop()  jjSetWaterLevel(y, ..)  jjTileSet(4, x, y, 0)
//   jjAlert(text)  play.health  play.noFire  play.showText(..)
//   play.activateBoss()  play.offsetPosition(dx, dy)  play.warpToID(id)  play.hurt(n)
// onLevelLoad() and onLevelBegin() run when the level starts, and
// onFunction<n>(player, offset) when the player steps into a JJ2+ text area
// marked AngelScript (as in JJ2+). Scripted objects, weapons, palettes and
// drawing hooks are out of reach.

const UNKNOWN = Symbol('unknown');

function tokenize(src) {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ').replace(/^\s*#[^\n]*/gm, ' ');
  const re = /\s+|("(?:[^"\\]|\\.)*")|(\d+\.\d*f?|\d+(?:\.\d+)?f?|0x[0-9a-fA-F]+)|([A-Za-z_][\w]*(?:::[A-Za-z_]\w*)*)|(&&|\|\||==|!=|<=|>=|\+=|-=|\*=|\/=|\+\+|--|[{}()[\];,.=<>!+\-*/%?:@&|^~])/y;
  const out = [];
  let m;
  re.lastIndex = 0;
  while (re.lastIndex < code.length) {
    const at = re.lastIndex;
    m = re.exec(code);
    if (!m) { re.lastIndex = at + 1; continue; }
    if (m[1]) out.push({ t: 'str', v: m[1].slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\') });
    else if (m[2]) out.push({ t: 'num', v: Number(m[2].replace(/f$/, '')) });
    else if (m[3]) out.push({ t: 'id', v: m[3] });
    else if (m[4]) out.push({ t: 'op', v: m[4] });
  }
  return out;
}

class Parser {
  constructor(tokens) { this.k = tokens; this.i = 0; }
  peek(o = 0) { return this.k[this.i + o]; }
  is(v, o = 0) { const t = this.peek(o); return t && t.t !== 'str' && t.v === v; }
  next() { return this.k[this.i++]; }
  expect(v) { if (!this.is(v)) throw new Error(`expected ${v}`); return this.next(); }

  // Skip a balanced (), [] or {} group starting at the current token.
  skipGroup() {
    const open = this.next().v; const close = { '(': ')', '[': ']', '{': '}' }[open];
    let depth = 1;
    while (this.i < this.k.length && depth) {
      const t = this.next();
      if (t.t === 'op' && t.v === open) depth++;
      else if (t.t === 'op' && t.v === close) depth--;
    }
  }

  // Skip to the end of the statement (a ';' or a closed block).
  skipStatement() {
    while (this.i < this.k.length) {
      if (this.is('{')) { this.skipGroup(); return; }
      if (this.is('(') || this.is('[')) { this.skipGroup(); continue; }
      if (this.is('}')) return;
      if (this.next().v === ';') return;
    }
  }

  block() {
    this.expect('{');
    const list = [];
    while (this.i < this.k.length && !this.is('}')) list.push(this.statement());
    this.expect('}');
    return { s: 'block', list };
  }

  statement() {
    if (this.is('{')) return this.block();
    if (this.is(';')) { this.next(); return { s: 'nop' }; }
    if (this.is('if')) {
      this.next(); this.expect('(');
      const cond = this.expr(); this.expect(')');
      const then = this.statement();
      let other = null;
      if (this.is('else')) { this.next(); other = this.statement(); }
      return { s: 'if', cond, then, other };
    }
    if (this.is('for') || this.is('while') || this.is('switch')) { this.next(); if (this.is('(')) this.skipGroup(); this.statement(); return { s: 'nop' }; }
    if (this.is('do')) { this.next(); this.statement(); this.skipStatement(); return { s: 'nop' }; }
    if (this.is('return')) {
      this.next();
      if (this.is(';')) { this.next(); return { s: 'return', e: null }; }
      const start = this.i;
      try { const e = this.expr(); this.expect(';'); return { s: 'return', e }; } catch (err) { this.i = start; this.skipStatement(); return { s: 'return', e: null }; }
    }
    const start = this.i;
    try {
      const e = this.expr();
      this.expect(';');
      return { s: 'expr', e };
    } catch (err) {
      this.i = start;
      this.skipStatement();
      return { s: 'nop' };
    }
  }

  expr() { return this.assign(); }

  assign() {
    const left = this.ternary();
    if (this.is('=') || this.is('+=') || this.is('-=')) {
      const op = this.next().v;
      return { e: 'assign', op, left, right: this.assign() };
    }
    return left;
  }

  ternary() {
    const c = this.binary(0);
    if (this.is('?')) { this.next(); const a = this.assign(); this.expect(':'); const b = this.assign(); return { e: 'cond', c, a, b }; }
    return c;
  }

  binary(level) {
    const LEVELS = [['||'], ['&&'], ['==', '!='], ['<', '>', '<=', '>='], ['+', '-'], ['*', '/', '%']];
    if (level >= LEVELS.length) return this.unary();
    let left = this.binary(level + 1);
    while (this.peek() && this.peek().t === 'op' && LEVELS[level].includes(this.peek().v)) {
      const op = this.next().v;
      left = { e: 'bin', op, left, right: this.binary(level + 1) };
    }
    return left;
  }

  unary() {
    if (this.is('!') || this.is('-')) { const op = this.next().v; return { e: 'un', op, x: this.unary() }; }
    if (this.is('@')) { this.next(); return this.unary(); }
    return this.postfix(this.primary());
  }

  postfix(x) {
    for (;;) {
      if (this.is('.')) { this.next(); x = { e: 'member', x, name: this.next().v }; }
      else if (this.is('[')) { this.next(); const i = this.expr(); this.expect(']'); x = { e: 'index', x, i }; }
      else if (this.is('(')) {
        this.next();
        const args = [];
        while (!this.is(')')) { args.push(this.expr()); if (this.is(',')) this.next(); else break; }
        this.expect(')');
        x = { e: 'call', f: x, args };
      } else if (this.is('++') || this.is('--')) { const op = this.next().v; x = { e: 'assign', op: op === '++' ? '+=' : '-=', left: x, right: { e: 'lit', v: 1 } }; }
      else return x;
    }
  }

  primary() {
    const t = this.next();
    if (!t) throw new Error('end');
    if (t.t === 'num' || t.t === 'str') return { e: 'lit', v: t.v };
    if (t.t === 'id') {
      if (t.v === 'true' || t.v === 'false') return { e: 'lit', v: t.v === 'true' };
      if (t.v === 'null') return { e: 'lit', v: null };
      // A declaration (`uint x = ...`) isn't an expression.
      if (this.peek() && this.peek().t === 'id') throw new Error('declaration');
      return { e: 'name', v: t.v };
    }
    if (t.v === '(') { const x = this.expr(); this.expect(')'); return x; }
    throw new Error(`unexpected ${t.v}`);
  }
}

// The script's functions: name -> { params: [names], body }.
function functions(tokens) {
  const out = {};
  const p = new Parser(tokens);
  while (p.i < tokens.length) {
    // `type name ( params ) {` at the top level is a function.
    const t = p.peek();
    if (t.t === 'id' && p.peek(1) && p.peek(1).t === 'id' && p.is('(', 2)) {
      const name = p.peek(1).v;
      p.i += 2;
      const start = p.i; p.skipGroup();
      // Parameters: the last identifier of each comma-separated part is its
      // name, the rest its type (an unnamed `jjPLAYER@` gets a made-up name).
      const params = []; const types = [];
      let part = [];
      const flush = () => {
        if (!part.length) return;
        const ids = part.filter((tk) => tk.t === 'id').map((tk) => tk.v);
        const named = ids.length > 1 || (ids.length === 1 && !/^(jj[A-Z]\w*|bool|int\d*|uint\d*|float|double|string)$/.test(ids[0]));
        params.push(named ? ids[ids.length - 1] : `_p${params.length}`);
        types.push((named ? ids.slice(0, -1) : ids).join(' '));
        part = [];
      };
      for (let j = start + 1; j < p.i - 1; j++) {
        if (tokens[j].v === ',') flush(); else part.push(tokens[j]);
      }
      flush();
      if (p.is('{')) {
        try { out[name] = { params, types, body: p.block() }; } catch (err) { /* malformed: skip */ }
        continue;
      }
      continue;
    }
    if (p.is('{') || p.is('(') || p.is('[')) { p.skipGroup(); continue; }
    p.next();
  }
  return out;
}

class Return { constructor(v) { this.v = v; } }

export class LevelScript {
  // `host`: the game side (see Game.scriptHost).
  constructor(src, host) {
    this.fns = functions(tokenize(src));
    this.host = host;
    this.globals = {};
    this.depth = 0;
  }

  has(name) { return !!this.fns[name]; }

  // A JJ2+ text-area hook: each parameter gets the player or the area's
  // offset by its type, as in JJ2+.
  hook(n, offset) {
    const fn = this.fns[`onFunction${n}`];
    if (!fn) return;
    this.call(`onFunction${n}`, fn.types.map((t) => (/jjPLAYER/.test(t) ? { player: true } : /bool/.test(t) ? offset !== 0 : offset)));
  }

  call(name, args = []) {
    const fn = this.fns[name];
    if (!fn || this.depth > 6) return UNKNOWN;
    const locals = {};
    fn.params.forEach((p, i) => { locals[p] = args[i]; });
    this.depth++;
    try { this.exec(fn.body, locals); } catch (r) { if (r instanceof Return) return r.v; if (!(r instanceof Error)) throw r; } finally { this.depth--; }
    return undefined;
  }

  exec(st, L) {
    switch (st.s) {
      case 'block': for (const s of st.list) this.exec(s, L); break;
      case 'if': {
        const c = this.eval(st.cond, L);
        if (c === UNKNOWN || c === undefined) break;
        if (c) this.exec(st.then, L); else if (st.other) this.exec(st.other, L);
        break;
      }
      case 'expr': this.eval(st.e, L); break;
      case 'return': throw new Return(st.e ? this.eval(st.e, L) : undefined);
      default: break;
    }
  }

  eval(x, L) {
    const H = this.host;
    switch (x.e) {
      case 'lit': return x.v;
      case 'name': {
        if (x.v in L) return L[x.v];
        if (x.v in this.globals) return this.globals[x.v];
        switch (x.v) {
          case 'jjDifficulty': return H.difficulty;
          case 'jjWaterLevel': return H.water();
          case 'jjMaxHealth': return H.maxHealth;
          case 'jjTriggers': return { triggers: true };
          case 'jjLocalPlayers': case 'jjP': return H.player ? { player: true } : UNKNOWN;
          default: return UNKNOWN;
        }
      }
      case 'index': {
        const o = this.eval(x.x, L); const i = this.eval(x.i, L);
        if (o && o.triggers && typeof i === 'number') return H.trigger(i);
        if (o && o.player) return { player: true };
        return UNKNOWN;
      }
      case 'member': {
        const o = this.eval(x.x, L);
        if (o && o.player) {
          if (x.name === 'health') return H.player().health;
          if (x.name === 'antiGrav' || x.name === 'noclipMode') return false;
          return UNKNOWN;
        }
        return UNKNOWN;
      }
      case 'un': {
        const v = this.eval(x.x, L);
        if (v === UNKNOWN || v === undefined) return UNKNOWN;
        return x.op === '!' ? !v : -v;
      }
      case 'bin': {
        const a = this.eval(x.left, L);
        if (x.op === '&&' && a === false) return false;
        if (x.op === '||' && a === true) return true;
        const b = this.eval(x.right, L);
        if (a === UNKNOWN || b === UNKNOWN || a === undefined || b === undefined) return UNKNOWN;
        switch (x.op) {
          case '||': return a || b; case '&&': return a && b;
          case '==': return a === b; case '!=': return a !== b;
          case '<': return a < b; case '>': return a > b; case '<=': return a <= b; case '>=': return a >= b;
          case '+': return a + b; case '-': return a - b; case '*': return a * b;
          case '/': return b ? (Number.isInteger(a) && Number.isInteger(b) ? Math.trunc(a / b) : a / b) : UNKNOWN;
          case '%': return b ? a % b : UNKNOWN;
          default: return UNKNOWN;
        }
      }
      case 'cond': {
        const c = this.eval(x.c, L);
        if (c === UNKNOWN || c === undefined) return UNKNOWN;
        return this.eval(c ? x.a : x.b, L);
      }
      case 'assign': return this.assign(x, L);
      case 'call': return this.callExpr(x, L);
      default: return UNKNOWN;
    }
  }

  assign(x, L) {
    const H = this.host;
    let v = this.eval(x.right, L);
    if (v === UNKNOWN) return UNKNOWN;
    const t = x.left;
    if (x.op !== '=') {
      const cur = this.eval(t, L);
      if (typeof cur !== 'number' || typeof v !== 'number') return UNKNOWN;
      v = x.op === '+=' ? cur + v : cur - v;
    }
    if (t.e === 'name') {
      if (t.v in L) { L[t.v] = v; return v; }
      if (t.v === 'jjWaterLevel') { if (typeof v === 'number') H.setWater(v); return v; }
      if (t.v === 'jjLevelName') { if (typeof v === 'string') H.levelName(v); return v; }
      if (!t.v.startsWith('jj')) this.globals[t.v] = v;
      return v;
    }
    if (t.e === 'index') {
      const o = this.eval(t.x, L); const i = this.eval(t.i, L);
      if (o && o.triggers && typeof i === 'number' && typeof v === 'boolean') H.setTrigger(i, v);
      if (t.x.e === 'name' && t.x.v === 'jjHelpStrings' && typeof i === 'number' && typeof v === 'string') H.helpString(i, v);
      return v;
    }
    if (t.e === 'member') {
      const o = this.eval(t.x, L);
      if (o && o.player) {
        if (t.name === 'health' && typeof v === 'number') H.player().health = Math.max(0, Math.min(H.maxHealth, v));
        if (t.name === 'noFire' && typeof v === 'boolean') H.player().noFire = v;
      }
      return v;
    }
    return UNKNOWN;
  }

  callExpr(x, L) {
    const H = this.host;
    const args = () => x.args.map((a) => this.eval(a, L));
    if (x.f.e === 'name') {
      const name = x.f.v;
      if (this.fns[name]) return this.call(name, args());
      const a = args();
      switch (name) {
        case 'jjMusicLoad': return typeof a[0] === 'string' ? H.music(a[0]) : UNKNOWN;
        case 'jjMusicStop': H.stopMusic(); return undefined;
        case 'jjSetWaterLevel': if (typeof a[0] === 'number') H.setWater(a[0]); return undefined;
        case 'jjTileSet': if (a[0] === 4 && a[3] === 0 && typeof a[1] === 'number' && typeof a[2] === 'number') H.clearTile(a[1], a[2]); return undefined;
        case 'jjAlert': if (typeof a[0] === 'string' && a[0].trim()) H.alert(a[0]); return undefined;
        default: return UNKNOWN;
      }
    }
    if (x.f.e === 'member') {
      const o = this.eval(x.f.x, L);
      if (o && o.player) {
        const a = args();
        switch (x.f.name) {
          case 'showText': if (typeof a[0] === 'string' || typeof a[0] === 'number') H.showText(a[0], a[1]); return undefined;
          case 'activateBoss': H.activateBoss(); return undefined;
          case 'offsetPosition': if (typeof a[0] === 'number' && typeof a[1] === 'number') H.offsetPlayer(a[0], a[1]); return undefined;
          case 'warpToID': if (typeof a[0] === 'number') H.warpToID(a[0]); return undefined;
          case 'hurt': H.hurt(); return undefined;
          default: return UNKNOWN;
        }
      }
    }
    return UNKNOWN;
  }
}

export { UNKNOWN };
