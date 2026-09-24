import { View, Text, StyleSheet } from 'react-native';
import Svg, { Polyline, Circle, Text as SvgText } from 'react-native-svg';

export interface TrendPoint {
  // Short label for the x-axis, e.g. "Sep 12" - only the first and last
  // are actually shown, to keep the axis readable at any number of rounds.
  label: string;
  value: number;
}

interface StatsTrendChartProps {
  points: TrendPoint[];
  formatValue: (value: number) => string;
  emptyLabel: string;
}

const VIEWBOX_WIDTH = 300;
const CHART_HEIGHT = 140;
const PADDING_X = 14;
const PADDING_TOP = 20;
const PADDING_BOTTOM = 10;
const DOT_RADIUS = 3.5;

// A hand-built line chart rather than a charting library - the app already
// ships react-native-svg for its logo/art, and a trend of a handful of
// rounds doesn't need more than a polyline and some dots.
export default function StatsTrendChart({ points, formatValue, emptyLabel }: StatsTrendChartProps) {
  if (points.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyText}>{emptyLabel}</Text>
      </View>
    );
  }

  const values = points.map((p) => p.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  // A flat line (or a single round) still needs a non-zero range to divide
  // by, so pad it out rather than collapsing every dot onto one row.
  const range = maxValue - minValue || 1;

  const innerWidth = VIEWBOX_WIDTH - PADDING_X * 2;
  const innerHeight = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM;

  const coords = points.map((point, index) => {
    const x =
      points.length > 1 ? PADDING_X + (innerWidth * index) / (points.length - 1) : PADDING_X + innerWidth / 2;
    const normalized = (point.value - minValue) / range;
    const y = PADDING_TOP + innerHeight * (1 - normalized);
    return { x, y, value: point.value };
  });

  const polylinePoints = coords.map((c) => `${c.x},${c.y}`).join(' ');
  const last = coords[coords.length - 1];
  // Pins the latest value's label to whichever side has more room, so it
  // never gets clipped by the chart's own edge.
  const lastLabelAnchor = last.x > VIEWBOX_WIDTH - PADDING_X * 3 ? 'end' : 'start';
  const lastLabelDx = lastLabelAnchor === 'end' ? -6 : 6;

  return (
    <View style={styles.container}>
      <Svg width="100%" height={CHART_HEIGHT} viewBox={`0 0 ${VIEWBOX_WIDTH} ${CHART_HEIGHT}`}>
        {coords.length > 1 && <Polyline points={polylinePoints} fill="none" stroke="#1a7f37" strokeWidth={2} />}
        {coords.map((c, i) => (
          <Circle key={i} cx={c.x} cy={c.y} r={DOT_RADIUS} fill="#1a7f37" />
        ))}
        <SvgText
          x={last.x + lastLabelDx}
          y={Math.max(last.y - 8, 12)}
          fontSize={12}
          fontWeight="700"
          fill="#234"
          textAnchor={lastLabelAnchor}
        >
          {formatValue(last.value)}
        </SvgText>
      </Svg>
      <View style={styles.xAxisRow}>
        <Text style={styles.xAxisLabel}>{points[0].label}</Text>
        {points.length > 1 && <Text style={styles.xAxisLabel}>{points[points.length - 1].label}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
  emptyWrap: {
    height: CHART_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: '#889',
    fontSize: 13,
    textAlign: 'center',
  },
  xAxisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  xAxisLabel: {
    fontSize: 11,
    color: '#9aa0a6',
  },
});
