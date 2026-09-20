import Svg, { Circle, Ellipse, Path, Rect, Line, G } from 'react-native-svg';

interface AngryGolferArtProps {
  size?: number;
}

// A purely decorative flat-illustration golfer - arms crossed, scowling at
// a putt that pulled up short of the cup. Original artwork (no real
// person, no licensed character), meant to sit at low opacity behind the
// pre-round screens rather than compete with them.
export default function AngryGolferArt({ size = 240 }: AngryGolferArtProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 240 260">
      {/* Ground line */}
      <Line x1="6" y1="232" x2="234" y2="232" stroke="#3a3a3a" strokeWidth="3" strokeLinecap="round" />

      {/* Dashed line showing the putt's short path */}
      <Path
        d="M120 176 C 150 176, 172 190, 186 214"
        stroke="#3a3a3a"
        strokeWidth="2"
        strokeDasharray="4,6"
        fill="none"
      />

      {/* Hole + flag, out ahead of the ball */}
      <Ellipse cx="216" cy="227" rx="10" ry="3.5" fill="#1a1a1a" />
      <Line x1="216" y1="227" x2="216" y2="188" stroke="#6b6b6b" strokeWidth="2" />
      <Path d="M216 188 L216 202 L233 195 Z" fill="#c0392b" />

      {/* Ball, short of the hole */}
      <Circle cx="188" cy="221" r="6" fill="#ffffff" stroke="#3a3a3a" strokeWidth="1.5" />

      {/* Back leg + shoe */}
      <Rect x="96" y="188" width="14" height="42" rx="6" fill="#2c3e50" />
      <Ellipse cx="103" cy="231" rx="11" ry="5" fill="#1a1a1a" />

      {/* Front leg + shoe */}
      <Rect x="76" y="188" width="14" height="42" rx="6" fill="#34495e" />
      <Ellipse cx="83" cy="231" rx="11" ry="5" fill="#1a1a1a" />

      {/* Putter arm, planted */}
      <Line x1="72" y1="152" x2="58" y2="222" stroke="#8a8a8a" strokeWidth="5" strokeLinecap="round" />
      <Rect x="48" y="220" width="20" height="7" rx="2" fill="#2c3e50" />

      {/* Torso (polo shirt) */}
      <Rect x="66" y="140" width="48" height="54" rx="16" fill="#1a7f37" />

      {/* Pointing arm, aimed angrily at the ball */}
      <Line x1="106" y1="152" x2="168" y2="178" stroke="#1a7f37" strokeWidth="10" strokeLinecap="round" />
      <Line x1="160" y1="176" x2="184" y2="184" stroke="#e8b88a" strokeWidth="6" strokeLinecap="round" />
      <Circle cx="184" cy="184" r="5" fill="#e8b88a" />

      {/* Neck */}
      <Rect x="82" y="128" width="16" height="16" fill="#e8b88a" />

      {/* Head */}
      <Circle cx="90" cy="112" r="21" fill="#e8b88a" />

      {/* Cap */}
      <Path d="M67 108 A23 23 0 0 1 113 108 L113 100 A23 15 0 0 0 67 100 Z" fill="#16513a" />
      <Path d="M90 97 L124 100 L122 107 L90 104 Z" fill="#16513a" />

      {/* Angry eyebrows */}
      <Line x1="78" y1="105" x2="88" y2="110" stroke="#3a2a1a" strokeWidth="3" strokeLinecap="round" />
      <Line x1="104" y1="105" x2="94" y2="110" stroke="#3a2a1a" strokeWidth="3" strokeLinecap="round" />

      {/* Eyes */}
      <Circle cx="84" cy="115" r="2.2" fill="#1a1a1a" />
      <Circle cx="98" cy="115" r="2.2" fill="#1a1a1a" />

      {/* Frown */}
      <Path d="M82 126 Q90 120, 98 126" stroke="#3a2a1a" strokeWidth="2.5" fill="none" strokeLinecap="round" />

      {/* Flushed cheeks - he's steaming */}
      <Circle cx="76" cy="121" r="3" fill="#c0392b" opacity="0.5" />
      <Circle cx="106" cy="121" r="3" fill="#c0392b" opacity="0.5" />

      {/* Little steam/anger marks above the cap */}
      <G stroke="#c0392b" strokeWidth="2" strokeLinecap="round" opacity="0.7">
        <Line x1="118" y1="78" x2="126" y2="70" />
        <Line x1="126" y1="82" x2="136" y2="76" />
        <Line x1="112" y1="88" x2="118" y2="80" />
      </G>
    </Svg>
  );
}
