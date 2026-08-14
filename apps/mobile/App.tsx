import { useState } from "react";
import { SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

export default function App() {
  const [code, setCode] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.eyebrow}>DIGITALTICKET / PORTARIA</Text>
        <Text style={styles.title}>Valide entradas em segundos.</Text>
        <Text style={styles.subtitle}>Escaneie o QR Code do ingresso ou digite o código alternativo do voucher.</Text>
        <TouchableOpacity style={styles.primary} onPress={() => setScannerOpen(true)}>
          <Text style={styles.primaryText}>{scannerOpen ? "Câmera pronta" : "Abrir leitor QR Code"}</Text>
        </TouchableOpacity>
        <View style={styles.divider}><View style={styles.line} /><Text style={styles.or}>OU</Text><View style={styles.line} /></View>
        <TextInput value={code} onChangeText={setCode} placeholder="Ex.: DT-8F3K-29QX" placeholderTextColor="#64748b" style={styles.input} autoCapitalize="characters" />
        <TouchableOpacity style={styles.secondary} onPress={() => setScannerOpen(false)}><Text style={styles.secondaryText}>Validar código</Text></TouchableOpacity>
        <View style={styles.status}><View style={styles.dot} /><Text style={styles.statusText}>Conectado ao workspace</Text></View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#080a12" },
  container: { flex: 1, padding: 28, justifyContent: "center" },
  eyebrow: { color: "#c084fc", fontSize: 12, letterSpacing: 2, fontWeight: "700" },
  title: { color: "#f8fafc", fontSize: 38, lineHeight: 44, fontWeight: "700", marginTop: 18 },
  subtitle: { color: "#94a3b8", fontSize: 16, lineHeight: 24, marginTop: 16 },
  primary: { backgroundColor: "#d946ef", borderRadius: 16, padding: 18, alignItems: "center", marginTop: 34 },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  divider: { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 28 },
  line: { flex: 1, height: 1, backgroundColor: "#1e293b" },
  or: { color: "#64748b", fontSize: 11 },
  input: { backgroundColor: "#111522", borderRadius: 14, borderWidth: 1, borderColor: "#263044", color: "#f8fafc", padding: 17, fontSize: 16 },
  secondary: { borderRadius: 14, borderWidth: 1, borderColor: "#334155", padding: 17, alignItems: "center", marginTop: 12 },
  secondaryText: { color: "#e2e8f0", fontSize: 16, fontWeight: "600" },
  status: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 34 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#34d399" },
  statusText: { color: "#64748b", fontSize: 13 },
});
