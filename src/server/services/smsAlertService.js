// server/services/smsAlertService.js
import dotenv from 'dotenv';
import axios from 'axios';
import admin from 'firebase-admin';

dotenv.config();

// Semaphore API Configuration
const SEMAPHORE_API_KEY = process.env.SEMAPHORE_API_KEY;
const SEMAPHORE_API_URL = 'https://api.semaphore.co/api/v4/messages';

// Dummy Thresholds (adjust based on your plant needs)
export const THRESHOLDS = {
  conductivity: { min: 20, max: 50 },
  moisture: { min: 10, max: 25 },
  nitrogen: { min: 10, max: 25 },
  phosphorus: { min: 10, max: 25 },
  potassium: { min: 1000, max: 2000 },
  temperature: { min: 20, max: 35 },
  ph: { min: 5.5, max: 7.5 }
};

const sentAlerts = new Set();
let lastCheckedTimestamp = null;

export async function sendSMS(phoneNumber, message) {
  try {
    const response = await axios.post(SEMAPHORE_API_URL, {
      apikey: SEMAPHORE_API_KEY,
      number: phoneNumber,
      message: message,
    });
    
    console.log(`SMS sent to ${phoneNumber}:`, response.data);
    return { success: true, data: response.data };
  } catch (error) {
    console.error(`Error sending SMS to ${phoneNumber}:`, error.response?.data || error.message);
    return { success: false, error: error.response?.data || error.message };
  }
}

async function fetchAlertRecipients(db) {
  try {
    const usersRef = db.collection('users');
    const snapshot = await usersRef
      .where('role', 'in', ['Admin', 'Farmer'])
      .get();

    if (snapshot.empty) {
      console.log('No matching users found');
      return [];
    }

    const users = [];
    snapshot.forEach(doc => {
      const userData = doc.data();
      if (userData.mobile) {
        users.push({
          id: doc.id,
          name: userData.displayName || userData.name || userData.email || 'Unknown',
          role: userData.role,
          mobile: userData.mobile
        });
      }
    });

    console.log(`Found ${users.length} recipients:`, users.map(u => `${u.name} (${u.role})`).join(', '));
    return users;
  } catch (error) {
    console.error('Error fetching users from Firebase:', error);
    return [];
  }
}

export function checkThresholds(sensorData) {
  const alerts = [];

  for (const [key, value] of Object.entries(sensorData)) {
    if (key === 'timestamp' || key === 'createdAt') continue;

    const threshold = THRESHOLDS[key.toLowerCase()];
    if (!threshold) continue;

    const numValue = parseFloat(value);
    
    if (isNaN(numValue)) continue;
    
    if (numValue < threshold.min) {
      alerts.push({
        parameter: key,
        value: numValue,
        status: 'LOW',
        threshold: threshold.min,
        message: `${key}: ${numValue} (below ${threshold.min})`
      });
    } else if (numValue > threshold.max) {
      alerts.push({
        parameter: key,
        value: numValue,
        status: 'HIGH',
        threshold: threshold.max,
        message: `${key}: ${numValue} (above ${threshold.max})`
      });
    }
  }

  return alerts;
}

function generateAlertMessage(sensorData, alerts) {
  const timestamp = sensorData.timestamp || new Date().toLocaleString();
  
  let message = `SOIL SENSOR ALERT\n`;
  message += `Time: ${timestamp}\n\n`;
  
  alerts.forEach((alert, index) => {
    message += `${index + 1}. ${alert.message}\n`;
  });
  
  message += `\nPlease check your farm immediately.`;
  
  if (message.length > 160) {
    message = message.substring(0, 157) + '...';
  }
  
  return message;
}

function createAlertId(timestamp, alerts) {
  const alertKeys = alerts.map(a => `${a.parameter}-${a.status}`).sort().join('_');
  return `${timestamp}_${alertKeys}`;
}

async function isAlertAlreadySent(db, alertId) {
  try {
    // Only check for exact duplicate alerts (same alert ID)
    const alertDoc = await db.collection('sentAlerts').doc(alertId).get();
    if (alertDoc.exists) {
      return { shouldSkip: true, reason: 'Exact alert already sent' };
    }

    return { shouldSkip: false };
  } catch (error) {
    console.error('Error checking alert status:', error);
    return { shouldSkip: sentAlerts.has(alertId), reason: 'In-memory check' };
  }
}

async function markAlertAsSent(db, alertId, alertData) {
  try {
    await db.collection('sentAlerts').doc(alertId).set({
      ...alertData,
      sentAt: admin.firestore.FieldValue.serverTimestamp()
    });
    sentAlerts.add(alertId);
    console.log('Alert marked as sent:', alertId);
  } catch (error) {
    console.error('Error marking alert as sent:', error);
    sentAlerts.add(alertId);
  }
}

export async function processSoilSensorAlert(sensorData, db) {
  try {
    console.log('\nProcessing soil sensor data...');
    console.log('Data:', JSON.stringify(sensorData, null, 2));

    const alerts = checkThresholds(sensorData);
    
    if (alerts.length === 0) {
      console.log('All readings within normal range - no alerts needed');
      return { success: true, message: 'No alerts needed' };
    }

    console.log(`${alerts.length} threshold violation(s) detected:`);
    alerts.forEach(alert => console.log(`   - ${alert.message}`));

    const alertId = createAlertId(sensorData.timestamp, alerts);
    const alertCheck = await isAlertAlreadySent(db, alertId);
    
    if (alertCheck.shouldSkip) {
      console.log(`${alertCheck.reason}`);
      return { success: true, message: alertCheck.reason, skipped: true };
    }

    const message = generateAlertMessage(sensorData, alerts);
    console.log('\nAlert message:\n' + message);

    const recipients = await fetchAlertRecipients(db);
    
    if (recipients.length === 0) {
      console.log('No recipients found - cannot send alerts');
      return { success: false, message: 'No recipients found' };
    }

    console.log(`\nSending SMS to ${recipients.length} recipient(s)...`);

    const sendPromises = recipients.map(user => 
      sendSMS(user.mobile, message)
    );

    const results = await Promise.all(sendPromises);
    
    await markAlertAsSent(db, alertId, {
      timestamp: sensorData.timestamp,
      alerts,
      recipients: recipients.map(r => ({ name: r.name, mobile: r.mobile })),
      sensorData
    });

    const successCount = results.filter(r => r.success).length;
    const failCount = results.length - successCount;
    
    console.log(`\nSMS Alert Summary:`);
    console.log(`   - Successfully sent: ${successCount}/${recipients.length}`);
    if (failCount > 0) {
      console.log(`   - Failed: ${failCount}`);
    }

    return {
      success: true,
      alerts,
      sentTo: successCount,
      total: recipients.length,
      results
    };

  } catch (error) {
    console.error('Error processing soil sensor alert:', error);
    return { success: false, error: error.message };
  }
}

export function setupAlertRoute(app, realtimeDb, firestoreDb) {
  app.post('/api/soil-sensor/reading', async (req, res) => {
    try {
      const sensorData = {
        ...req.body,
        timestamp: req.body.timestamp || new Date().toISOString()
      };
      
      const timestamp = Date.now();
      await realtimeDb.ref(`SoilSensor/${timestamp}`).set(sensorData);
      console.log('Sensor reading saved with timestamp:', timestamp);
      
      const alertResult = await processSoilSensorAlert(sensorData, firestoreDb);
      
      res.json({
        success: true,
        timestamp,
        alertResult
      });
    } catch (error) {
      console.error('Error in sensor reading endpoint:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/soil-sensor/check-alerts', async (req, res) => {
    try {
      const snapshot = await realtimeDb.ref('SoilSensor')
        .orderByKey()
        .limitToLast(1)
        .once('value');

      if (!snapshot.exists()) {
        return res.json({ success: false, message: 'No sensor readings found' });
      }

      const data = snapshot.val();
      const timestamp = Object.keys(data)[0];
      const latestReading = {
        ...data[timestamp],
        timestamp
      };
      
      const alertResult = await processSoilSensorAlert(latestReading, firestoreDb);
      
      res.json(alertResult);
    } catch (error) {
      console.error('Error checking alerts:', error);
      res.status(500).json({ error: error.message });
    }
  });

  console.log('Alert routes registered');
}

export function setupRealtimeAlertListener(realtimeDb, firestoreDb) {
  console.log('Setting up Realtime Database listener (latest reading only)...');
  
  const sensorRef = realtimeDb.ref('SoilSensor');
  
  sensorRef.orderByKey().limitToLast(1).once('value', (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.val();
      lastCheckedTimestamp = Object.keys(data)[0];
      console.log(`Starting from timestamp: ${lastCheckedTimestamp}`);
      console.log(`Will only process readings AFTER this point`);
      
      sensorRef.orderByKey().startAfter(lastCheckedTimestamp).on('child_added', (snapshot) => {
        const timestamp = snapshot.key;
        const sensorData = snapshot.val();
        
        console.log('\nNew sensor reading detected!');
        console.log('Timestamp:', timestamp);
        
        const dataWithTimestamp = {
          ...sensorData,
          timestamp
        };
        
        lastCheckedTimestamp = timestamp;
        
        processSoilSensorAlert(dataWithTimestamp, firestoreDb);
      });
      
      console.log('Real-time listener active - monitoring NEW readings only');
      console.log('Alerts will be sent immediately when thresholds are violated');
    } else {
      console.log('No existing data, listening for first reading...');
      sensorRef.on('child_added', (snapshot) => {
        const timestamp = snapshot.key;
        const sensorData = snapshot.val();
        
        console.log('\nNew sensor reading detected!');
        console.log('Timestamp:', timestamp);
        
        const dataWithTimestamp = {
          ...sensorData,
          timestamp
        };
        
        lastCheckedTimestamp = timestamp;
        processSoilSensorAlert(dataWithTimestamp, firestoreDb);
      });
      
      console.log('Real-time listener active');
    }
  });
  
  return () => {
    sensorRef.off('child_added');
    console.log('Realtime Database listener stopped');
  };
}

export async function cleanupOldAlerts(db, daysToKeep = 30) {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const snapshot = await db.collection('sentAlerts')
      .where('sentAt', '<', cutoffDate)
      .get();

    if (snapshot.empty) {
      console.log('No old alerts to clean up');
      return;
    }

    const batch = db.batch();
    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();
    console.log(`Cleaned up ${snapshot.size} old alerts`);
  } catch (error) {
    console.error('Error cleaning up old alerts:', error);
  }
}

class SMSAlertService {
  constructor() {
    this.apiKey = SEMAPHORE_API_KEY;
    this.apiUrl = SEMAPHORE_API_URL;
    this.thresholds = THRESHOLDS;
  }

  async sendSMS(phoneNumber, message) {
    return sendSMS(phoneNumber, message);
  }

  checkThresholds(sensorData) {
    return checkThresholds(sensorData);
  }

  async processSoilSensorAlert(sensorData, firestoreDb) {
    return processSoilSensorAlert(sensorData, firestoreDb);
  }

  setupAlertRoute(app, realtimeDb, firestoreDb) {
    return setupAlertRoute(app, realtimeDb, firestoreDb);
  }

  setupRealtimeAlertListener(realtimeDb, firestoreDb) {
    return setupRealtimeAlertListener(realtimeDb, firestoreDb);
  }

  async cleanupOldAlerts(firestoreDb, daysToKeep = 30) {
    return cleanupOldAlerts(firestoreDb, daysToKeep);
  }
}

export const smsAlertService = new SMSAlertService();
export default smsAlertService;