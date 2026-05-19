# 📱 FlingVibe Mobile Portal App

A beautiful, premium, cross-platform mobile application built with **Expo & React Native** that lets FlingVibe paid session users access the premium network directly on their mobile phones (iOS & Android) without needing any browser extensions.

## ✨ Features

- **📱 Fully Sandboxed WebView:** Automatically log users in and securely display the target platform directly inside the app.
- **🛡️ Secure Token Injection:** Session cookie is injected in memory into the WebView scope, keeping the raw token completely hidden from the user.
- **⏳ Real-time Countdown Header:** Displays the exact session time remaining (`HH:MM:SS`) in a sleek floating banner above the website.
- **🚨 Instant Session Termination:** Automatically closes the browser, wipes cookies, and displays a "Session Expired" screen when their paid booking slot ends.
- **🔧 Developer Settings Cog:** Minimalist settings modal to dynamically configure the backend API URL (critical for local network Wi-Fi debugging).

## 🚀 How to Run Locally

### 1. Prerequisite: Install Expo Go on your phone
Search for **Expo Go** on the App Store (iOS) or Google Play Store (Android) and install it on your mobile device.

### 2. Start the Expo Packager
Navigate to this directory and start the local development server:

```bash
cd mobile-app
npm start
```

### 3. Open the App
- **For Android:** Scan the QR code displayed in your terminal using the **Expo Go** app.
- **For iOS (iPhones):** Scan the QR code using your system **Camera app**, which will prompt you to open it inside **Expo Go**.

### 4. Connect to your Backend Server
To make the app connect to your running local FastAPI backend (which is running on your computer):
1. Find your computer's local network IP address (e.g., `192.168.1.15`).
2. Inside the FlingVibe mobile app, click the **Settings Cog (⚙️)** in the top right corner of the login screen.
3. Update the **API Base URL** to your computer's local IP (e.g. `http://192.168.1.15:8000`).
4. Enter any active paid **Booking ID** and click **Activate**!
# FlingVibe-mobile
