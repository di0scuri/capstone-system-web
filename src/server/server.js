const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { db, realtimeDb } = require('./config/firebase');
const alertService = require('./services/smsAlertService');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Setup real-time listener - triggers automatically on new data
console.log('🔧 Setting up real-time SMS alert listener...');
const unsubscribe = alertService.setupRealtimeAlertListener(realtimeDb, db);

console.log('✅ SMS Alert Service is active - monitoring for new sensor readings...');

// Optional: Keep the route for manual testing and triggering
alertService.setupAlertRoute(app, realtimeDb, db);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'Server is running',
    alertService: 'active',
    timestamp: new Date().toISOString()
  });
});

// Get current thresholds
app.get('/api/thresholds', (req, res) => {
  res.json(alertService.THRESHOLDS);
});

// Test endpoint to check users from Firestore
app.get('/api/test/recipients', async (req, res) => {
  try {
    const usersRef = db.collection('users');
    const snapshot = await usersRef
      .where('role', 'in', ['Admin', 'Farmer'])
      .get();

    const users = [];
    snapshot.forEach(doc => {
      const userData = doc.data();
      users.push({
        id: doc.id,
        name: userData.name,
        role: userData.role,
        mobile: userData.mobile || 'No mobile'
      });
    });

    res.json({ 
      count: users.length,
      users 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Test endpoint to get latest sensor reading from Realtime Database
app.get('/api/test/latest-reading', async (req, res) => {
  try {
    const snapshot = await realtimeDb.ref('SoilSensor')
      .orderByKey()
      .limitToLast(1)
      .once('value');

    if (!snapshot.exists()) {
      return res.json({ message: 'No sensor readings found' });
    }

    const data = snapshot.val();
    const timestamp = Object.keys(data)[0];
    const sensorData = data[timestamp];

    res.json({
      timestamp,
      data: sensorData
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down gracefully...');
  unsubscribe(); // Stop the Realtime Database listener
  console.log('✅ Listener stopped');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down gracefully...');
  unsubscribe();
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  console.log('═══════════════════════════════════════════');
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📡 Monitoring: Realtime Database (SoilSensor)`);
  console.log(`👥 User data from: Firestore (users collection)`);
  console.log(`🔔 SMS alerts will be sent automatically`);
  console.log('═══════════════════════════════════════════');
});