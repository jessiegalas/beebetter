import { View, Text, StyleSheet } from 'react-native';

export default function SkillTreeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Skill Tree Screen</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  text: { fontSize: 18, fontWeight: '600' },
});