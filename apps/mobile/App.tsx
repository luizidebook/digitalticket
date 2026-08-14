import { CameraView, useCameraPermissions } from "expo-camera";
import { useState } from "react";
import { SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const [code, setCode] = useState("");
  const [scanned, setScanned] = useState(false);
  const [message, setMessage] = useState("Aguardando leitura");

  const handleBarcode = ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);
    setCode(data.replace("digitalticket://ticket/", ""));
    setMessage("Código capturado. Consultando o servidor…");
  };

  if (!permission) return <SafeAreaView style={styles.safe}><Text style={styles.subtitle}>Solicitando permissão da câmera…</Text></SafeAreaView>;
  if (!permission.granted) return <SafeAreaView style={styles.safe}><View style={styles.container}><Text style={styles.eyebrow}>DIGITALTICKET / PORTARIA</Text><Text style={styles.title}>A câmera é necessária.</Text><Text style={styles.subtitle}>Permita o acesso para escanear QR Codes de ingressos.</Text><TouchableOpacity style={styles.primary} onPress={requestPermission}><Text style={styles.primaryText}>Permitir câmera</Text></TouchableOpacity></View></SafeAreaView>;

  return <SafeAreaView style={styles.safe}><View style={styles.container}><Text style={styles.eyebrow}>DIGITALTICKET / PORTARIA</Text><Text style={styles.title}>Valide entradas em segundos.</Text><Text style={styles.subtitle}>Aponte a câmera para o QR Code do voucher.</Text><View style={styles.cameraFrame}><CameraView style={StyleSheet.absoluteFillObject} facing="back" onBarcodeScanned={scanned ? undefined : handleBarcode} barcodeScannerSettings={{ barcodeTypes: ["qr"] }} /><View style={styles.scanGuide} /></View><Text style={styles.statusText}>{message}</Text>{scanned && <TouchableOpacity style={styles.secondary} onPress={() => { setScanned(false); setCode(""); setMessage("Aguardando leitura"); }}><Text style={styles.secondaryText}>Ler outro ingresso</Text></TouchableOpacity>}<View style={styles.divider}><View style={styles.line} /><Text style={styles.or}>OU DIGITE</Text><View style={styles.line} /></View><TextInput value={code} onChangeText={setCode} placeholder="Ex.: DT-8F3K-29QX" placeholderTextColor="#64748b" style={styles.input} autoCapitalize="characters" /><TouchableOpacity style={styles.secondary} onPress={() => setMessage(code ? "Código capturado. Consultando o servidor…" : "Digite um código válido.")}><Text style={styles.secondaryText}>Validar código</Text></TouchableOpacity></View></SafeAreaView>;
}

const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: "#080a12" }, container: { flex: 1, padding: 28, justifyContent: "center" }, eyebrow: { color: "#c084fc", fontSize: 12, letterSpacing: 2, fontWeight: "700" }, title: { color: "#f8fafc", fontSize: 36, lineHeight: 43, fontWeight: "700", marginTop: 18 }, subtitle: { color: "#94a3b8", fontSize: 16, lineHeight: 24, marginTop: 16 }, primary: { backgroundColor: "#d946ef", borderRadius: 16, padding: 18, alignItems: "center", marginTop: 34 }, primaryText: { color: "#fff", fontSize: 16, fontWeight: "700" }, cameraFrame: { height: 230, marginTop: 28, overflow: "hidden", borderRadius: 24, borderWidth: 1, borderColor: "#d946ef", backgroundColor: "#111522" }, scanGuide: { position: "absolute", top: "20%", left: "15%", right: "15%", bottom: "20%", borderWidth: 2, borderColor: "rgba(255,255,255,.8)", borderRadius: 18 }, statusText: { color: "#cbd5e1", textAlign: "center", marginTop: 14, fontSize: 13 }, divider: { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 20 }, line: { flex: 1, height: 1, backgroundColor: "#1e293b" }, or: { color: "#64748b", fontSize: 11 }, input: { backgroundColor: "#111522", borderRadius: 14, borderWidth: 1, borderColor: "#263044", color: "#f8fafc", padding: 17, fontSize: 16 }, secondary: { borderRadius: 14, borderWidth: 1, borderColor: "#334155", padding: 17, alignItems: "center", marginTop: 12 }, secondaryText: { color: "#e2e8f0", fontSize: 16, fontWeight: "600" } });
