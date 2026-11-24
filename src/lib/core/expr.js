// Safe arithmetic expressions for derived measures, e.g. "pledged / (pledged + no_pledge)".
// Identifiers are series ids ([A-Za-z_][A-Za-z0-9_]*) or any id in square brackets: [my-series].
// No eval: the expression is parsed into a small AST. Division by zero yields null.

export function parseExpr(src) {
  const toks = [];
  const re = /\s*(?:(\d+(?:\.\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|\[([^\]]+)\]|([-+*/()]))/y;
  let pos = 0;
  while (pos < src.length) {
    re.lastIndex = pos;
    const m = re.exec(src);
    if (!m) {
      if (/^\s*$/.test(src.slice(pos))) break;
      throw new Error(`Bad expression near "${src.slice(pos)}"`);
    }
    pos = re.lastIndex;
    if (m[1]) toks.push({ t: 'num', v: +m[1] });
    else if (m[2] || m[3]) toks.push({ t: 'id', v: m[2] || m[3] });
    else toks.push({ t: m[4] });
  }
  let i = 0;
  const peek = () => toks[i]?.t;
  const expr = () => {
    let n = term();
    while (peek() === '+' || peek() === '-') n = { op: toks[i++].t, a: n, b: term() };
    return n;
  };
  const term = () => {
    let n = unary();
    while (peek() === '*' || peek() === '/') n = { op: toks[i++].t, a: n, b: unary() };
    return n;
  };
  const unary = () => {
    if (peek() === '-') {
      i++;
      return { op: 'neg', a: unary() };
    }
    return atom();
  };
  const atom = () => {
    const t = toks[i++];
    if (!t) throw new Error('Unexpected end of expression: ' + src);
    if (t.t === 'num') return { num: t.v };
    if (t.t === 'id') return { id: t.v };
    if (t.t === '(') {
      const n = expr();
      if (toks[i++]?.t !== ')') throw new Error('Missing ) in ' + src);
      return n;
    }
    throw new Error('Unexpected token in ' + src);
  };
  const ast = expr();
  if (i < toks.length) throw new Error('Trailing tokens in ' + src);
  return ast;
}

export function exprIds(ast, out = new Set()) {
  if (ast.id) out.add(ast.id);
  if (ast.a) exprIds(ast.a, out);
  if (ast.b) exprIds(ast.b, out);
  return out;
}

export function evalExpr(ast, lookup) {
  if ('num' in ast) return ast.num;
  if (ast.id) return lookup(ast.id);
  const a = evalExpr(ast.a, lookup);
  if (ast.op === 'neg') return a == null ? null : -a;
  const b = evalExpr(ast.b, lookup);
  if (a == null || b == null) return null;
  switch (ast.op) {
    case '+':
      return a + b;
    case '-':
      return a - b;
    case '*':
      return a * b;
    case '/':
      return b === 0 ? null : a / b;
  }
  return null;
}
