const MAX_POINTS = 500000;
export const MOUTH_OPEN = 'ParamMouthOpenY';
const fail = message => { throw new Error(`モーションファイル: ${message}`); };
export function parseRecordedMotion(input) {
  const data = typeof input === 'string' ? JSON.parse(input.replace(/^\uFEFF/, '')) : input;
  if (data?.Version !== 3 || !Number.isFinite(data.Meta?.Duration) || data.Meta.Duration <= 0 || data.Meta.Duration > 3600) fail('Version 3・長さ1時間以内の motion3.json を選んでください。');
  if (!Array.isArray(data.Curves) || !data.Curves.length || data.Curves.length > 2000) fail('カーブ数が不正です。');
  let points = 0;
  const ids = new Set();
  const curves = data.Curves.map(curve => {
    if (!['Parameter', 'PartOpacity', 'Model'].includes(curve.Target) || typeof curve.Id !== 'string' || !curve.Id || curve.Id.length > 256) fail('パラメーターの指定が不正です。');
    if (curve.Target === 'Model' && !['Opacity', 'EyeBlink', 'LipSync'].includes(curve.Id)) fail(`未対応のモデルカーブ: ${curve.Id}`);
    const key = `${curve.Target}:${curve.Id}`;
    if (ids.has(key)) fail(`カーブが重複しています: ${curve.Id}`);
    ids.add(key);
    const values = curve.Segments;
    if (!Array.isArray(values) || values.length < 2 || values.some(value => !Number.isFinite(value))) fail(`${curve.Id} の数値が不正です。`);
    points += values.length;
    if (points > MAX_POINTS) fail('カーブのデータ量が大きすぎます。');
    let previous = [values[0], values[1]];
    if (previous[0] < 0 || previous[0] > data.Meta.Duration + 0.001) fail('開始時刻が不正です。');
    const segments = [];
    for (let i = 2; i < values.length;) {
      const type = values[i++];
      if (![0, 1, 2, 3].includes(type)) fail('未対応の補間方式です。');
      const count = type === 1 ? 6 : 2;
      if (i + count > values.length) fail('カーブが途中で切れています。');
      const coordinates = values.slice(i, i + count); i += count;
      const end = coordinates.slice(-2);
      if (end[0] <= previous[0] || end[0] > data.Meta.Duration + 0.001) fail('カーブの時刻が逆転・重複しています。');
      if (type === 1 && (coordinates[0] < previous[0] || coordinates[0] > end[0] || coordinates[2] < previous[0] || coordinates[2] > end[0])) fail('ベジェ曲線の時間制御点が範囲外です。');
      segments.push({ type, start: previous, end, coordinates });
      previous = end;
    }
    return { target: curve.Target, id: curve.Id, first: values.slice(0, 2), segments };
  });
  return { duration: data.Meta.Duration, curves };
}
const bezier = (a, b, c, d, t) => (1-t)**3*a + 3*(1-t)**2*t*b + 3*(1-t)*t*t*c + t**3*d;
export function curveValueAt(curve, time) {
  const segments = curve.segments;
  if (!segments.length || time <= curve.first[0]) return curve.first[1];
  if (time >= segments.at(-1).end[0]) return segments.at(-1).end[1];
  let low = 0, high = segments.length - 1;
  while (low < high) { const mid = (low + high) >> 1; if (time >= segments[mid].end[0]) low = mid + 1; else high = mid; }
  const { type, start, end, coordinates: c } = segments[low];
  if (type === 2) return start[1];
  if (type === 3) return end[1];
  if (type === 0) return start[1] + (end[1] - start[1]) * (time - start[0]) / (end[0] - start[0]);
  let left = 0, right = 1;
  for (let n = 0; n < 40; n++) { const t = (left + right) / 2; if (bezier(start[0], c[0], c[2], end[0], t) < time) left = t; else right = t; }
  return bezier(start[1], c[1], c[3], end[1], (left + right) / 2);
}
export function sampleRecordedMotion(motion, seconds, loop = true) {
  const time = loop ? Math.max(0, seconds) % motion.duration : Math.max(0, Math.min(seconds, motion.duration));
  return motion.curves.filter(curve => !(curve.target === 'Parameter' && curve.id === MOUTH_OPEN) && !(curve.target === 'Model' && curve.id === 'LipSync'))
    .map(curve => ({ target: curve.target, id: curve.id, value: curveValueAt(curve, time) }));
}
