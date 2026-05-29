import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Dimensions,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Camera } from 'expo-camera';
import { SafeAreaView } from 'react-native-safe-area-context';

const DEFAULT_API_URL = 'https://flingvibe-backend.onrender.com';
const { width } = Dimensions.get('window');

export default function App() {
  const [appState, setAppState] = useState('LOGIN');
  const [bookingId, setBookingId] = useState('');
  const [apiUrl] = useState(DEFAULT_API_URL);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [sessionToken, setSessionToken] = useState('');
  const [expiresAt, setExpiresAt] = useState(null);
  const [timeLeft, setTimeLeft] = useState('');

  const timerRef = useRef(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();
  }, [appState]);

  useEffect(() => {
    if (appState === 'ACTIVE' && expiresAt) {
      if (timerRef.current) clearInterval(timerRef.current);

      const calculateTimeLeft = () => {
        const diff = new Date(expiresAt) - new Date();
        if (diff <= 0) {
          clearInterval(timerRef.current);
          setAppState('EXPIRED');
          setSessionToken('');
          setExpiresAt(null);
          return;
        }
        const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
        const m = Math.floor((diff / 1000 / 60) % 60);
        const s = Math.floor((diff / 1000) % 60);
        const pad = (n) => String(n).padStart(2, '0');
        setTimeLeft(`${pad(h)}:${pad(m)}:${pad(s)}`);
      };

      calculateTimeLeft();
      timerRef.current = setInterval(calculateTimeLeft, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [appState, expiresAt]);

  const requestPermissions = async () => {
    try {
      const cam = await Camera.requestCameraPermissionsAsync();
      const mic = await Camera.requestMicrophonePermissionsAsync();
      if (cam.status !== 'granted' || mic.status !== 'granted') {
        Alert.alert('Permissions Required', 'Camera and Microphone access are needed for video chat.');
        return false;
      }
      return true;
    } catch { return true; }
  };

  const handleVerifySession = async () => {
    const cleanId = bookingId.trim().toUpperCase();
    if (!cleanId) {
      setErrorMsg('Please enter your Booking ID');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      const response = await fetch(`${apiUrl}/api/booking-session-token/${cleanId}`, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' },
      });
      clearTimeout(timeout);
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || `Request failed (${response.status})`);
      }
      const data = await response.json();
      if (!data.token) throw new Error('Session not available yet. Ask admin to generate your session.');

      setSessionToken(data.token);
      setExpiresAt(data.expires_at);
      setAppState('ACTIVE');
    } catch (err) {
      if (err.name === 'AbortError') {
        setErrorMsg('Request timed out. Check your internet connection.');
      } else {
        setErrorMsg(err.message || 'Connection failed. Try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleExitSession = () => {
    Alert.alert('End Session', 'Are you sure you want to leave?', [
      { text: 'Stay', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: () => {
        setAppState('LOGIN');
        setSessionToken('');
        setExpiresAt(null);
        setBookingId('');
      }},
    ]);
  };

  const cookieInjectionJS = `
    (function() {
      document.cookie = "Member=${sessionToken}; path=/";
      document.cookie = "Member=${sessionToken}; domain=.flingster.com; path=/";
      try {
        if (navigator.mediaDevices && !navigator.mediaDevices.enumerateDevices) {
          navigator.mediaDevices.enumerateDevices = () => Promise.resolve([]);
        }
      } catch (e) {}
      var style = document.createElement('style');
      style.textContent = 'body { padding-bottom: env(safe-area-inset-bottom, 34px) !important; } .footer, [class*="footer"], [class*="nav-bar"], [class*="bottom-bar"] { bottom: env(safe-area-inset-bottom, 34px) !important; }';
      document.head.appendChild(style);
      var meta = document.querySelector('meta[name="viewport"]');
      if (meta) meta.content = meta.content + ', viewport-fit=cover';
      window.ReactNativeWebView.postMessage("READY");
      return true;
    })();
  `;

  // LOGIN SCREEN
  if (appState === 'LOGIN') {
    return (
      <View style={styles.root}>
        <StatusBar barStyle="light-content" backgroundColor="#0A0A0F" />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.root}
        >
          <SafeAreaView style={styles.loginContainer}>
            <Animated.View style={[styles.loginContent, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
              {/* Brand */}
              <View style={styles.brandSection}>
                <View style={styles.logoIcon}>
                  <Text style={styles.logoIconText}>F</Text>
                </View>
                <Text style={styles.brandName}>FlingVibe</Text>
                <Text style={styles.brandTagline}>Premium Video Chat Access</Text>
              </View>

              {/* Login Card */}
              <View style={styles.loginCard}>
                <Text style={styles.cardTitle}>Enter your Booking ID</Text>
                <Text style={styles.cardSubtitle}>
                  Use the code from your confirmed booking
                </Text>

                <View style={styles.inputWrapper}>
                  <TextInput
                    style={[styles.input, errorMsg && styles.inputError]}
                    placeholder="XXXXXXXX"
                    placeholderTextColor="#3D3D4A"
                    value={bookingId}
                    onChangeText={(t) => { setBookingId(t); setErrorMsg(''); }}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    maxLength={12}
                  />
                </View>

                {errorMsg ? (
                  <View style={styles.errorRow}>
                    <Text style={styles.errorText}>{errorMsg}</Text>
                  </View>
                ) : null}

                <TouchableOpacity
                  style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
                  onPress={handleVerifySession}
                  disabled={loading}
                  activeOpacity={0.7}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.primaryBtnText}>Start Session</Text>
                  )}
                </TouchableOpacity>
              </View>

              {/* Footer hint */}
              <Text style={styles.footerHint}>
                Book a slot on our website to get your access code
              </Text>
            </Animated.View>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </View>
    );
  }

  // ACTIVE SESSION
  if (appState === 'ACTIVE' && sessionToken) {
    return (
      <View style={styles.root}>
        <StatusBar barStyle="light-content" backgroundColor="#0A0A0F" />
        <SafeAreaView style={styles.root} edges={['top']}>
          {/* Session Header */}
          <View style={styles.sessionHeader}>
            <View style={styles.sessionInfo}>
              <View style={styles.liveDot} />
              <Text style={styles.sessionLabel}>LIVE</Text>
            </View>
            <Text style={styles.timerText}>{timeLeft}</Text>
            <TouchableOpacity onPress={handleExitSession} style={styles.exitBtn}>
              <Text style={styles.exitBtnText}>End</Text>
            </TouchableOpacity>
          </View>

          {/* WebView */}
          <WebView
            source={{ uri: 'https://flingster.com/', headers: { 'Cookie': `Member=${sessionToken}` } }}
            injectedJavaScriptBeforeContentLoaded={`
              document.cookie = "Member=${sessionToken}; path=/";
              document.cookie = "Member=${sessionToken}; domain=.flingster.com; path=/";
              true;
            `}
            injectedJavaScript={cookieInjectionJS}
            sharedCookiesEnabled={true}
            thirdPartyCookiesEnabled={true}
            domStorageEnabled={true}
            javaScriptEnabled={true}
            allowsInlineMediaPlayback={true}
            mediaPlaybackRequiresUserAction={false}
            mediaCapturePermissionGrantType="grant"
            allowsProtectedMedia={true}
            androidLayerType="hardware"
            webviewDebuggingEnabled={true}
            originWhitelist={['*']}
            userAgent={Platform.OS === 'ios'
              ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1'
              : 'Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.179 Mobile Safari/537.36'
            }
            onPermissionRequest={(e) => {
              if (e.resources) e.grant(e.resources);
            }}
            allowFileAccess={true}
            mixedContentMode="always"
            contentInsetAdjustmentBehavior="automatic"
            style={styles.webview}
            renderLoading={() => (
              <View style={styles.webviewLoading}>
                <ActivityIndicator color="#6C5CE7" size="large" />
                <Text style={styles.loadingText}>Connecting...</Text>
              </View>
            )}
            startInLoadingState={true}
          />
        </SafeAreaView>
      </View>
    );
  }

  // EXPIRED SCREEN
  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0A0F" />
      <SafeAreaView style={styles.expiredContainer}>
        <Animated.View style={[styles.expiredContent, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <View style={styles.expiredIconWrap}>
            <Text style={styles.expiredEmoji}>⏱</Text>
          </View>
          <Text style={styles.expiredTitle}>Session Ended</Text>
          <Text style={styles.expiredDesc}>
            Your premium access time has expired. Book a new slot to continue.
          </Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => { setAppState('LOGIN'); setBookingId(''); }}
            activeOpacity={0.7}
          >
            <Text style={styles.primaryBtnText}>Book Again</Text>
          </TouchableOpacity>
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },

  // LOGIN
  loginContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  loginContent: {
    paddingHorizontal: 28,
  },
  brandSection: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: '#6C5CE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  logoIconText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
  },
  brandName: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  brandTagline: {
    fontSize: 14,
    color: '#6B6B80',
    marginTop: 4,
  },

  loginCard: {
    backgroundColor: '#14141F',
    borderRadius: 20,
    padding: 28,
    borderWidth: 1,
    borderColor: '#1E1E2E',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 13,
    color: '#6B6B80',
    marginBottom: 24,
  },
  inputWrapper: {
    marginBottom: 16,
  },
  input: {
    backgroundColor: '#1A1A28',
    borderWidth: 1.5,
    borderColor: '#2A2A3A',
    borderRadius: 12,
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 4,
    paddingVertical: 16,
    paddingHorizontal: 20,
    textAlign: 'center',
  },
  inputError: {
    borderColor: '#E63946',
  },
  errorRow: {
    marginBottom: 16,
  },
  errorText: {
    color: '#E63946',
    fontSize: 13,
    textAlign: 'center',
  },
  primaryBtn: {
    backgroundColor: '#6C5CE7',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryBtnDisabled: {
    opacity: 0.6,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  footerHint: {
    color: '#4A4A5A',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 24,
  },

  // ACTIVE SESSION
  sessionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#14141F',
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E2E',
  },
  sessionInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#00D26A',
  },
  sessionLabel: {
    color: '#00D26A',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  timerText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  exitBtn: {
    backgroundColor: '#2A1520',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E63946',
  },
  exitBtnText: {
    color: '#E63946',
    fontSize: 12,
    fontWeight: '700',
  },
  webview: {
    flex: 1,
  },
  webviewLoading: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0A0A0F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#6B6B80',
    fontSize: 13,
    marginTop: 12,
  },

  // EXPIRED
  expiredContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  expiredContent: {
    paddingHorizontal: 36,
    alignItems: 'center',
  },
  expiredIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#1A1A28',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  expiredEmoji: {
    fontSize: 36,
  },
  expiredTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  expiredDesc: {
    fontSize: 14,
    color: '#6B6B80',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 32,
  },
});
