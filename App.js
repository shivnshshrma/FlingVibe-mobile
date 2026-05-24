import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  PermissionsAndroid,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Camera } from 'expo-camera';
import { SafeAreaView } from 'react-native-safe-area-context';


// Default API URL (can be customized via settings modal in the app)
const DEFAULT_API_URL = 'https://flingvibe-backend.onrender.com'; 

export default function App() {
  // App States
  const [appState, setAppState] = useState('LOGIN'); // 'LOGIN' | 'ACTIVE' | 'EXPIRED'
  const [bookingId, setBookingId] = useState('');
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL);
  
  // Loading and Error states
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  // Active session details
  const [sessionToken, setSessionToken] = useState('');
  const [expiresAt, setExpiresAt] = useState(null);
  const [timeLeft, setTimeLeft] = useState('');
  
  // Modals
  const [showSettings, setShowSettings] = useState(false);
  const [tempApiUrl, setTempApiUrl] = useState(DEFAULT_API_URL);

  const timerRef = useRef(null);

  // Load custom API URL if previously set (could use AsyncStorage, but keep it simple first)
  useEffect(() => {
    setTempApiUrl(apiUrl);
  }, [apiUrl]);

  // Countdown timer logic
  useEffect(() => {
    if (appState === 'ACTIVE' && expiresAt) {
      // Clear any existing timers
      if (timerRef.current) clearInterval(timerRef.current);

      const calculateTimeLeft = () => {
        const difference = new Date(expiresAt) - new Date();
        
        if (difference <= 0) {
          clearInterval(timerRef.current);
          handleSessionExpiry();
          return;
        }

        const hours = Math.floor((difference / (1000 * 60 * 60)) % 24);
        const minutes = Math.floor((difference / 1000 / 60) % 60);
        const seconds = Math.floor((difference / 1000) % 60);

        const pad = (num) => String(num).padStart(2, '0');
        setTimeLeft(`${pad(hours)}h : ${pad(minutes)}m : ${pad(seconds)}s`);
      };

      // Run immediately
      calculateTimeLeft();
      
      // Run every second
      timerRef.current = setInterval(calculateTimeLeft, 1000);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [appState, expiresAt]);

  // Universal Runtime Permission Request (Android & iOS)
  const requestPermissions = async () => {
    try {
      // 1. Request Camera Permission
      const cameraStatus = await Camera.requestCameraPermissionsAsync();
      
      // 2. Request Audio/Microphone Permission
      const audioStatus = await Camera.requestMicrophonePermissionsAsync();
      
      if (cameraStatus.status !== 'granted' || audioStatus.status !== 'granted') {
        Alert.alert(
          'Permissions Required',
          'FlingVibe requires Camera and Microphone access to let you video chat. Please enable them in your device settings.',
          [{ text: 'OK' }]
        );
        return false;
      }
      return true;
    } catch (err) {
      console.warn('Error requesting permissions:', err);
      // Fallback to legacy permissions request if expo modules fail
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.CAMERA,
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        ]);
        return (
          granted['android.permission.CAMERA'] === PermissionsAndroid.RESULTS.GRANTED &&
          granted['android.permission.RECORD_AUDIO'] === PermissionsAndroid.RESULTS.GRANTED
        );
      }
      return true;
    }
  };

  // Authenticate Booking ID and fetch Session Token
  const handleVerifySession = async () => {
    const cleanId = bookingId.trim().toUpperCase();
    if (!cleanId) {
      Alert.alert('Error', 'Please enter your Booking ID.');
      return;
    }

    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    setLoading(true);
    setErrorMsg('');

    try {
      // API call to the FlingVibe backend endpoint
      const response = await fetch(`${apiUrl}/api/booking-session-token/${cleanId}`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Server responded with ${response.status}`);
      }

      const data = await response.json();
      console.log('FlingVibe API Response:', data);
      
      if (!data.token) {
        throw new Error(`Token not found in response: ${JSON.stringify(data)}`);
      }

      setSessionToken(data.token);
      setExpiresAt(data.expires_at);
      setAppState('ACTIVE');
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'Failed to connect to server. Check your connection or API URL.');
    } finally {
      setLoading(false);
    }
  };

  const handleSessionExpiry = () => {
    setAppState('EXPIRED');
    setSessionToken('');
    setExpiresAt(null);
  };

  const handleExitSession = () => {
    Alert.alert(
      'Exit Session',
      'Are you sure you want to exit your active premium session?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Exit', 
          style: 'destructive',
          onPress: () => {
            setAppState('LOGIN');
            setSessionToken('');
            setExpiresAt(null);
            setBookingId('');
          }
        }
      ]
    );
  };

  const handleSaveSettings = () => {
    // Basic validation
    if (!tempApiUrl.startsWith('http://') && !tempApiUrl.startsWith('https://')) {
      Alert.alert('Invalid URL', 'API URL must start with http:// or https://');
      return;
    }
    
    // Clean trailing slash
    const cleanedUrl = tempApiUrl.replace(/\/$/, '');
    setApiUrl(cleanedUrl);
    setShowSettings(false);
    Alert.alert('Saved', 'API Base URL successfully updated.');
  };

  // JS to inject Flingster Session Cookie on WebView Load & patch WebRTC behaviors
  const cookieInjectionJS = `
    (function() {
      // 1. Set the session cookie
      document.cookie = "Member=${sessionToken}; domain=.flingster.com; path=/; secure; SameSite=Lax";
      
      // 2. Patch navigator.mediaDevices for hybrid compatibility
      try {
        if (navigator.mediaDevices && !navigator.mediaDevices.enumerateDevices) {
          navigator.mediaDevices.enumerateDevices = function() {
            return Promise.resolve([]);
          };
        }
        
        // Polyfill fallback just in case the wrapper context hides it
        if (window.webkit && window.webkit.messageHandlers && !window.navigator.mediaDevices) {
          window.navigator.mediaDevices = {};
        }
      } catch (e) {
        console.log("WebRTC Shim Error:", e);
      }

      // Let the browser know it succeeded
      window.ReactNativeWebView.postMessage("COOKIE_INJECTED");
      
      // Force page reload if not logged in (fallback)
      if (!document.cookie.includes("Member=")) {
        console.log("Cookie write failed, retrying...");
      }
      return true;
    })();
  `;

  return (
    <View style={styles.appContainer}>
      <StatusBar barStyle="light-content" backgroundColor="#050505" translucent={false} />

      {/* 1. LOGIN SCREEN */}
      {appState === 'LOGIN' && (
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.container}
        >
          <View style={styles.innerContainer}>
            {/* Header / Logo */}
            <View style={styles.logoContainer}>
              <Text style={styles.logoText}>
                Fling<Text style={styles.logoHighlight}>Vibe</Text>
              </Text>
              <Text style={styles.logoSubtitle}>PREMIUM ACCESS PORTAL</Text>
            </View>

            {/* Input and Actions */}
            <View style={styles.card}>
              <Text style={styles.label}>Enter Session Password / Booking ID</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 7D8B1F3C"
                placeholderTextColor="#555"
                value={bookingId}
                onChangeText={setBookingId}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={12}
              />

              {errorMsg ? <Text style={styles.errorText}>⚠️ {errorMsg}</Text> : null}

              <TouchableOpacity
                style={styles.button}
                onPress={handleVerifySession}
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.buttonText}>🚀 Activate Premium Session</Text>
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.hintContainer}>
              <Text style={styles.hintText}>
                💡 Active bookings automatically unlock time-limited platform slots. Enter your paid Booking ID to access the Flingster premium network instantly.
              </Text>
            </View>
          </View>
        </KeyboardAvoidingView>
      )}

      {/* 2. ACTIVE WEBVIEW SESSION */}
      {appState === 'ACTIVE' && sessionToken && (
        <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
          <View style={{ flex: 1 }}>
            <WebView
              source={{ uri: 'https://flingster.com/' }}
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
              originWhitelist={['*']}
              userAgent={Platform.OS === 'ios'
                ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1'
                : 'Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.179 Mobile Safari/537.36'
              }
              onPermissionRequest={(event) => {
                console.log('WebView permission request:', event.resources);
                event.grant(event.resources);
              }}
              allowFileAccess={true}
              mixedContentMode="always"
              geolocationEnabled={true}
              style={styles.webview}
              renderLoading={() => (
                <View style={styles.webviewLoading}>
                  <ActivityIndicator color="#E63946" size="large" />
                  <Text style={styles.loadingText}>Connecting Secure Premium Link...</Text>
                </View>
              )}
              startInLoadingState={true}
            />
          </View>
        </SafeAreaView>
      )}

      {/* 3. EXPIRED SESSION SCREEN */}
      {appState === 'EXPIRED' && (
        <View style={styles.container}>
          <View style={styles.innerContainer}>
            <View style={styles.expiredCard}>
              <Text style={styles.expiredIcon}>⏳</Text>
              <Text style={styles.expiredTitle}>Session Expired</Text>
              <Text style={styles.expiredSubtitle}>
                Your paid booking slot has run out of time. 
              </Text>
              
              <View style={styles.divider} />
              
              <Text style={styles.expiredDetails}>
                To continue enjoying premium and ad-free platform access, please book a new slot on our portal.
              </Text>

              <TouchableOpacity
                style={[styles.button, { marginTop: 24 }]}
                onPress={() => {
                  setAppState('LOGIN');
                  setBookingId('');
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.buttonText}>Return to Portal</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

        {/* ⚙️ SETTINGS MODAL */}
        <Modal
          visible={showSettings}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShowSettings(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>🔧 Developer Settings</Text>
              
              <View style={styles.divider} />
              
              <Text style={styles.modalLabel}>API Base URL</Text>
              <Text style={styles.modalDescription}>
                Point the app to your backend IP (e.g. http://192.168.1.15:8000) for testing on your phone.
              </Text>
              
              <TextInput
                style={styles.modalInput}
                value={tempApiUrl}
                onChangeText={setTempApiUrl}
                placeholder="e.g. http://192.168.1.15:8000"
                placeholderTextColor="#555"
                autoCapitalize="none"
                autoCorrect={false}
              />

              <View style={styles.modalButtonsContainer}>
                <TouchableOpacity 
                  style={styles.modalCancelButton}
                  onPress={() => {
                    setShowSettings(false);
                    setTempApiUrl(apiUrl);
                  }}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.modalSaveButton}
                  onPress={handleSaveSettings}
                >
                  <Text style={styles.modalSaveText}>Save Settings</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  appContainer: {
    flex: 1,
    backgroundColor: '#050505',
  },
  container: {
    flex: 1,
    backgroundColor: '#050505',
  },
  innerContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  settingsButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : (StatusBar.currentHeight || 0) + 12,
    right: 20,
    zIndex: 10,
    padding: 10,
    borderRadius: 20,
    backgroundColor: '#121212',
    borderWidth: 1,
    borderColor: '#3A1010',
  },
  settingsIcon: {
    fontSize: 18,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoText: {
    fontSize: 42,
    fontWeight: 'bold',
    color: '#ffffff',
    letterSpacing: -1.5,
  },
  logoHighlight: {
    color: '#E63946',
  },
  logoSubtitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#A09595',
    letterSpacing: 2.5,
    marginTop: 6,
  },
  card: {
    width: '100%',
    backgroundColor: '#121212',
    borderWidth: 1,
    borderColor: '#3A1010',
    borderRadius: 14,
    padding: 24,
    shadowColor: '#E63946',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 8,
  },
  label: {
    color: '#A09595',
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#260B0B',
    borderRadius: 8,
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 3,
    paddingVertical: 14,
    paddingHorizontal: 16,
    textAlign: 'center',
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#E63946',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#E63946',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 14,
    letterSpacing: 0.5,
  },
  errorText: {
    color: '#FF4D5A',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  hintContainer: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  hintText: {
    color: '#555555',
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
  },
  // Active Session styles
  sessionFooter: {
    backgroundColor: '#121212',
    borderTopWidth: 1,
    borderColor: '#3A1010',
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 34 : 28, // Elevates WebView above system navigation buttons/gestures
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomExitButton: {
    backgroundColor: '#2A1010',
    borderWidth: 1,
    borderColor: '#E63946',
    borderRadius: 8,
    paddingVertical: 12,
    width: '100%',
    alignItems: 'center',
  },
  bottomExitButtonText: {
    color: '#E63946',
    fontSize: 13,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  webview: {
    flex: 1,
    backgroundColor: '#050505',
  },
  webviewLoading: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#050505',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#A09595',
    fontSize: 12,
    marginTop: 16,
    fontWeight: '600',
  },
  // Expired state styles
  expiredCard: {
    width: '100%',
    backgroundColor: '#121212',
    borderWidth: 1,
    borderColor: '#3A1010',
    borderRadius: 14,
    padding: 32,
    alignItems: 'center',
  },
  expiredIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  expiredTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 8,
  },
  expiredSubtitle: {
    color: '#FF4D5A',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 16,
  },
  expiredDetails: {
    color: '#A09595',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: '#3A1010',
    width: '100%',
    marginVertical: 16,
  },
  // Modal Settings styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#121212',
    borderWidth: 1,
    borderColor: '#3A1010',
    borderRadius: 14,
    padding: 24,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  modalLabel: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  modalDescription: {
    color: '#555555',
    fontSize: 10,
    lineHeight: 14,
    marginBottom: 12,
  },
  modalInput: {
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#260B0B',
    borderRadius: 8,
    color: '#ffffff',
    fontSize: 14,
    padding: 12,
    marginBottom: 20,
  },
  modalButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  modalCancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#222',
  },
  modalCancelText: {
    color: '#A09595',
    fontSize: 12,
    fontWeight: 'bold',
  },
  modalSaveButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#E63946',
  },
  modalSaveText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
});
