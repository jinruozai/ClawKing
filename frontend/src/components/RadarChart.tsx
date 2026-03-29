// ══════════════════════════════════════════
// Radar Chart — SVG-based stat visualization
// ══════════════════════════════════════════

export function RadarChart({ values, labels, color = '#f97316', size = 180 }: {
  values: number[]; // 0..1 normalized
  labels: string[]; // "Label Value" format
  color?: string;
  size?: number;
}) {
  const pad = 30; // padding for labels
  const full = size + pad * 2;
  const cx = full / 2;
  const cy = full / 2;
  const r = size * 0.36;
  const n = values.length;

  const getPoint = (i: number, ratio: number) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [cx + r * ratio * Math.cos(angle), cy + r * ratio * Math.sin(angle)];
  };

  // Grid rings
  const rings = [0.25, 0.5, 0.75, 1];
  const gridLines = rings.map((ring) =>
    Array.from({ length: n }, (_, i) => getPoint(i, ring)).map(([x, y]) => `${x},${y}`).join(' ')
  );

  // Data polygon
  const dataPoints = values.map((v, i) => getPoint(i, v));
  const dataPath = dataPoints.map(([x, y]) => `${x},${y}`).join(' ');

  return (
    <svg width={full} height={full} viewBox={`0 0 ${full} ${full}`} className="drop-shadow-lg">
      {/* Grid */}
      {gridLines.map((pts, i) => (
        <polygon key={i} points={pts} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
      ))}
      {/* Axis lines */}
      {Array.from({ length: n }, (_, i) => {
        const [x, y] = getPoint(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(255,255,255,0.1)" strokeWidth="1" />;
      })}
      {/* Data fill */}
      <polygon points={dataPath} fill={color} fillOpacity="0.25" stroke={color} strokeWidth="2" />
      {/* Data dots */}
      {dataPoints.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3" fill={color} />
      ))}
      {/* Labels with values */}
      {Array.from({ length: n }, (_, i) => {
        const [x, y] = getPoint(i, 1.3);
        return (
          <text key={i} x={x} y={y} textAnchor="middle" dominantBaseline="central"
            fill="rgba(255,255,255,0.7)" fontSize="11" fontWeight="600" fontFamily="Rajdhani, sans-serif">
            {labels[i]}
          </text>
        );
      })}
    </svg>
  );
}

export default RadarChart;
