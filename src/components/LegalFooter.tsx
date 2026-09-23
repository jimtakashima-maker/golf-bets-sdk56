import { Text, StyleSheet } from 'react-native';

// The one legal footer used everywhere it's needed (Welcome and the Legal
// screen) - same copyright line, same styling, so it can't drift between
// the two. Year is computed at render time so it never needs a manual
// bump on January 1st.
export default function LegalFooter() {
  const year = new Date().getFullYear();
  return (
    <Text style={styles.text}>
      {'©'} {year} Apex Approach Advisory LLC. Then Press Me is owned and operated by Apex Approach Advisory
      LLC. All rights reserved.
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    textAlign: 'center',
    color: '#aab',
    fontSize: 10,
    lineHeight: 14,
    paddingHorizontal: 24,
    paddingTop: 8,
  },
});
