import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { searchRequests } from '../api';
import type { SearchResult } from '../api';
import { colors, radius } from '../theme';

export default function RequestsScreen() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Type at least two characters to search your requests.');

  const run = async () => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setMessage('Type at least two characters to search your requests.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const payload = await searchRequests(term);
      setResults(payload.results);
      if (payload.results.length === 0) setMessage('No matching requests.');
    } catch (caught) {
      setResults([]);
      setMessage(caught instanceof Error ? caught.message : 'Search failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Requests</Text>
      <Text style={styles.subtitle}>Search the requests linked to your account</Text>

      <View style={styles.searchRow}>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder="Request id, blood type, hospital…"
          placeholderTextColor={colors.muted}
          returnKeyType="search"
          onSubmitEditing={() => void run()}
        />
        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          onPress={() => void run()}
          disabled={busy}
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Search</Text>}
        </Pressable>
      </View>

      {message ? <Text style={styles.message}>{message}</Text> : null}

      {results.map((result) => (
        <View key={`${result.type}-${result.url}`} style={styles.card}>
          <Text style={styles.cardTitle}>{result.title}</Text>
          <Text style={styles.cardSubtitle}>{result.subtitle}</Text>
          {result.status ? <Text style={styles.status}>{result.status}</Text> : null}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: 18, paddingBottom: 32 },
  title: { fontSize: 24, fontWeight: '800', color: colors.text },
  subtitle: { marginTop: 2, marginBottom: 16, color: colors.muted, fontSize: 13 },
  searchRow: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
    color: colors.text,
  },
  button: {
    backgroundColor: colors.brand,
    borderRadius: radius.sm,
    paddingHorizontal: 18,
    justifyContent: 'center',
  },
  buttonPressed: { backgroundColor: colors.brandDark },
  buttonText: { color: '#fff', fontWeight: '700' },
  message: { color: colors.muted, fontSize: 13, marginTop: 14, marginBottom: 4 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 12,
    marginTop: 10,
  },
  cardTitle: { fontWeight: '700', color: colors.text },
  cardSubtitle: { color: colors.muted, fontSize: 13, marginTop: 3 },
  status: { color: colors.brand, fontSize: 12, fontWeight: '700', marginTop: 6, textTransform: 'capitalize' },
});
