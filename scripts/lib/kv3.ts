/**
 * Valve KeyValues3 (テキスト形式) の最小パーサ。
 * GameTracking-Deadlock の .vdata を読むためのもので、書き出しには対応しない。
 *
 * - `resource_name:"..."` や `subclass: { ... }` のような型プレフィックスは捨てて中身だけ返す
 * - バイナリ `#[ .. ]` は16進文字列のまま返す
 */
export type Kv3Value = string | number | boolean | null | Kv3Value[] | { [key: string]: Kv3Value };
export type Kv3Object = { [key: string]: Kv3Value };

export function parseKv3(text: string): Kv3Object {
  const p = new Parser(text);
  p.skipHeader();
  const root = p.parseValue();
  if (!isObject(root)) throw new Error('KV3: root is not an object');
  return root;
}

export function isObject(v: unknown): v is Kv3Object {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const BARE_CHAR = /[A-Za-z0-9_.+\-]/;

class Parser {
  private i = 0;
  constructor(private readonly s: string) {}

  skipHeader(): void {
    this.skipWs();
    if (this.s.startsWith('<!--', this.i)) {
      const end = this.s.indexOf('-->', this.i);
      if (end < 0) throw this.error('unterminated header');
      this.i = end + 3;
    }
  }

  parseValue(): Kv3Value {
    this.skipWs();
    const c = this.s[this.i];
    if (c === '{') return this.parseObject();
    if (c === '[') return this.parseArray();
    if (c === '"') return this.parseString();
    if (c === '#' && this.s[this.i + 1] === '[') return this.parseBinary();

    const word = this.readBare();
    if (word === '') throw this.error(`unexpected character ${JSON.stringify(c)}`);
    if (this.s[this.i] === ':') {
      // 型プレフィックス (resource_name: / subclass: / panorama: など)
      this.i++;
      return this.parseValue();
    }
    if (word === 'true') return true;
    if (word === 'false') return false;
    if (word === 'null') return null;
    const n = Number(word);
    if (Number.isNaN(n)) throw this.error(`invalid literal ${JSON.stringify(word)}`);
    return n;
  }

  private parseObject(): Kv3Object {
    this.i++; // {
    const obj: Kv3Object = {};
    for (;;) {
      this.skipWs();
      if (this.s[this.i] === '}') {
        this.i++;
        return obj;
      }
      const key = this.s[this.i] === '"' ? this.parseString() : this.readBare();
      if (key === '') throw this.error('expected key');
      this.skipWs();
      if (this.s[this.i] !== '=') throw this.error(`expected '=' after key ${JSON.stringify(key)}`);
      this.i++;
      obj[key] = this.parseValue();
    }
  }

  private parseArray(): Kv3Value[] {
    this.i++; // [
    const arr: Kv3Value[] = [];
    for (;;) {
      this.skipWs();
      if (this.s[this.i] === ']') {
        this.i++;
        return arr;
      }
      arr.push(this.parseValue());
      this.skipWs();
      if (this.s[this.i] === ',') this.i++;
    }
  }

  private parseString(): string {
    if (this.s.startsWith('"""', this.i)) {
      const end = this.s.indexOf('"""', this.i + 3);
      if (end < 0) throw this.error('unterminated multi-line string');
      const raw = this.s.slice(this.i + 3, end);
      this.i = end + 3;
      return raw.replace(/^\r?\n/, '').replace(/\r?\n$/, '');
    }
    this.i++; // "
    let out = '';
    for (;;) {
      const c = this.s[this.i++];
      if (c === undefined) throw this.error('unterminated string');
      if (c === '"') return out;
      if (c === '\\') {
        const e = this.s[this.i++];
        out += e === 'n' ? '\n' : e === 't' ? '\t' : (e ?? '');
      } else {
        out += c;
      }
    }
  }

  private parseBinary(): string {
    const end = this.s.indexOf(']', this.i);
    if (end < 0) throw this.error('unterminated binary blob');
    const hex = this.s.slice(this.i + 2, end).replace(/\s+/g, '');
    this.i = end + 1;
    return hex;
  }

  private readBare(): string {
    const start = this.i;
    while (this.i < this.s.length && BARE_CHAR.test(this.s[this.i]!)) this.i++;
    return this.s.slice(start, this.i);
  }

  private skipWs(): void {
    for (;;) {
      const c = this.s[this.i];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
        this.i++;
      } else if (c === '/' && this.s[this.i + 1] === '/') {
        const nl = this.s.indexOf('\n', this.i);
        this.i = nl < 0 ? this.s.length : nl + 1;
      } else if (c === '/' && this.s[this.i + 1] === '*') {
        const end = this.s.indexOf('*/', this.i + 2);
        this.i = end < 0 ? this.s.length : end + 2;
      } else {
        return;
      }
    }
  }

  private error(msg: string): Error {
    const line = this.s.slice(0, this.i).split('\n').length;
    return new Error(`KV3 parse error at line ${line}: ${msg}`);
  }
}
