// server/services/smsAlertService.js
import dotenv from 'dotenv';
import axios from 'axios';
import admin from 'firebase-admin';

dotenv.config();

// Semaphore API Configuration
const SEMAPHORE_API_KEY = process.env.SEMAPHORE_API_KEY;
const SEMAPHORE_API_URL = 'https://api.semaphore.co/api/v4/messages';

const sentAlerts = new Set();
let lastCheckedTimestamp = null;

// Cache for plant requirements to reduce Firestore reads
const plantRequirementsCache = new Map();

/**
 * Send SMS using Semaphore API
 */
export async function sendSMS(phoneNumber, message) {
  try {
    // Remove any emojis and special characters that might cause issues
    const cleanMessage = message.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim();
    
    if (!cleanMessage || cleanMessage.length === 0) {
      console.error('Message is empty after cleaning');
      return { success: false, error: 'Empty message' };
    }

    console.log(`Sending SMS to ${phoneNumber}, length: ${cleanMessage.length} chars`);
    
    const response = await axios.post(SEMAPHORE_API_URL, {
      apikey: SEMAPHORE_API_KEY,
      number: phoneNumber,
      message: cleanMessage,
      sendername: "MaligatIFSy"
    });
    
    console.log(`SMS sent to ${phoneNumber}:`, response.data);
    return { success: true, data: response.data };
  } catch (error) {
    console.error(`Error sending SMS to ${phoneNumber}:`, error.response?.data || error.message);
    return { success: false, error: error.response?.data || error.message };
  }
}

/**
 * Fetch alert recipients (Admin and Farmer roles with mobile numbers)
 */
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

/**
 * Get plant by sensor ID from plants collection in Firestore
 * This explicitly searches the plants collection for matching soilSensor field
 */
async function getPlantBySensor(db, sensorId) {
  try {
    console.log(`\n🔍 Searching Firestore plants collection...`);
    console.log(`   Looking for plant with soilSensor: "${sensorId}"`);
    
    const plantsRef = db.collection('plants');
    const snapshot = await plantsRef
      .where('soilSensor', '==', sensorId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      console.log(`\n❌ No plant found with soilSensor: "${sensorId}"`);
      console.log(`\n💡 Debugging: Listing all plants in collection...`);
      
      // List all plants for debugging
      const allPlantsSnapshot = await plantsRef.get();
      if (!allPlantsSnapshot.empty) {
        console.log(`   Found ${allPlantsSnapshot.size} total plant(s):`);
        allPlantsSnapshot.forEach(doc => {
          const data = doc.data();
          console.log(`   - ${data.plantName || 'Unknown'} → soilSensor: "${data.soilSensor || 'NOT SET'}"`);
        });
      } else {
        console.log(`   No plants found in plants collection`);
      }
      
      console.log(`\n⚠️  TIP: Make sure plant's soilSensor field matches: "${sensorId}"`);
      return null;
    }

    const plantDoc = snapshot.docs[0];
    const plantData = plantDoc.data();
    
    console.log(`\n✅ PLANT FOUND in Firestore!`);
    console.log(`   Document ID: ${plantDoc.id}`);
    console.log(`   Plant Name: ${plantData.plantName || plantData.plantType}`);
    console.log(`   Plot Number: ${plantData.plotNumber}`);
    console.log(`   Sensor ID: ${plantData.soilSensor}`);
    console.log(`   Current Stage: ${plantData.status}`);
    
    return {
      id: plantDoc.id,
      ...plantData
    };
  } catch (error) {
    console.error('Error fetching plant by sensor:', error);
    return null;
  }
}

/**
 * Get current stage requirements from plantsList collection
 */
async function getCurrentStageRequirements(db, plant) {
  try {
    const plantType = plant.plantType || plant.type;
    
    if (!plantType) {
      console.log('Plant type not specified');
      return null;
    }

    // Check cache first
    const cacheKey = `${plantType}_${plant.status}`;
    if (plantRequirementsCache.has(cacheKey)) {
      console.log(`Using cached requirements for ${plantType} - ${plant.status}`);
      return plantRequirementsCache.get(cacheKey);
    }

    console.log(`\n📚 Fetching requirements from plantsList collection...`);
    console.log(`   Plant Type: ${plantType}`);
    console.log(`   Current Stage: ${plant.status}`);

    // Fetch from Firestore
    const plantListRef = db.collection('plantsList').doc(plantType.toLowerCase());
    const plantListDoc = await plantListRef.get();

    if (!plantListDoc.exists) {
      console.log(`❌ Plant type "${plantType}" not found in plantsList collection`);
      return null;
    }

    const plantListData = plantListDoc.data();
    const stages = plantListData.stages || [];
    
    // Find current stage by matching plant's status
    const currentStage = stages.find(stage => 
      stage.stage.toLowerCase() === (plant.status || '').toLowerCase()
    );

    if (!currentStage) {
      console.log(`❌ Stage "${plant.status}" not found for ${plantType}`);
      console.log(`   Available stages: ${stages.map(s => s.stage).join(', ')}`);
      return null;
    }

    console.log(`\n✅ Stage requirements loaded:`);
    console.log(`   Stage: ${currentStage.stage}`);
    console.log(`   N Range: ${currentStage.lowN}-${currentStage.highN} ppm`);
    console.log(`   P Range: ${currentStage.lowP}-${currentStage.highP} ppm`);
    console.log(`   K Range: ${currentStage.lowK}-${currentStage.highK} ppm`);

    // Structure thresholds from stage requirements
    const requirements = {
      plantName: plantListData.name || plantType,
      scientificName: plantListData.sName || '',
      currentStage: currentStage.stage,
      plotNumber: plant.plotNumber || 'Unknown',
      thresholds: {
        nitrogen: { 
          min: parseFloat(currentStage.lowN), 
          max: parseFloat(currentStage.highN),
          unit: 'ppm'
        },
        phosphorus: { 
          min: parseFloat(currentStage.lowP), 
          max: parseFloat(currentStage.highP),
          unit: 'ppm'
        },
        potassium: { 
          min: parseFloat(currentStage.lowK), 
          max: parseFloat(currentStage.highK),
          unit: 'ppm'
        },
        ph: { 
          min: parseFloat(currentStage.lowpH), 
          max: parseFloat(currentStage.highpH),
          unit: ''
        },
        temperature: { 
          min: parseFloat(currentStage.lowTemp), 
          max: parseFloat(currentStage.highTemp),
          unit: 'C'
        },
        humidity: { 
          min: parseFloat(currentStage.lowHum), 
          max: parseFloat(currentStage.highHum),
          unit: '%'
        }
      }
    };

    // Cache the requirements (cache for 5 minutes)
    plantRequirementsCache.set(cacheKey, requirements);
    setTimeout(() => plantRequirementsCache.delete(cacheKey), 5 * 60 * 1000);

    return requirements;
  } catch (error) {
    console.error('Error fetching stage requirements:', error);
    return null;
  }
}

/**
 * Check sensor data against plant-specific thresholds
 */
export async function checkThresholdsForPlant(sensorData, plantRequirements) {
  const alerts = [];

  if (!plantRequirements || !plantRequirements.thresholds) {
    console.log('No plant requirements available for threshold checking');
    return alerts;
  }

  const thresholds = plantRequirements.thresholds;

  // Map of sensor data keys to threshold keys
  const parameterMap = {
    'nitrogen': 'nitrogen',
    'phosphorus': 'phosphorus',
    'potassium': 'potassium',
    'ph': 'ph',
    'temperature': 'temperature',
    'humidity': 'humidity',
    'moisture': 'humidity' // Map moisture to humidity if needed
  };

  console.log(`\n🔬 Checking thresholds...`);

  for (const [sensorKey, thresholdKey] of Object.entries(parameterMap)) {
    const sensorValue = sensorData[sensorKey];
    const threshold = thresholds[thresholdKey];

    if (!threshold || sensorValue === undefined || sensorValue === null) {
      continue;
    }

    const numValue = parseFloat(sensorValue);
    
    if (isNaN(numValue) || isNaN(threshold.min) || isNaN(threshold.max)) {
      continue;
    }

    console.log(`   ${sensorKey}: ${numValue}${threshold.unit} (range: ${threshold.min}-${threshold.max}${threshold.unit})`);

    if (numValue < threshold.min) {
      alerts.push({
        parameter: sensorKey.charAt(0).toUpperCase() + sensorKey.slice(1),
        value: numValue,
        status: 'LOW',
        threshold: threshold.min,
        unit: threshold.unit,
        message: `${sensorKey.charAt(0).toUpperCase() + sensorKey.slice(1)}: ${numValue}${threshold.unit} (below ${threshold.min}${threshold.unit})`
      });
      console.log(`      ❌ LOW (below ${threshold.min}${threshold.unit})`);
    } else if (numValue > threshold.max) {
      alerts.push({
        parameter: sensorKey.charAt(0).toUpperCase() + sensorKey.slice(1),
        value: numValue,
        status: 'HIGH',
        threshold: threshold.max,
        unit: threshold.unit,
        message: `${sensorKey.charAt(0).toUpperCase() + sensorKey.slice(1)}: ${numValue}${threshold.unit} (above ${threshold.max}${threshold.unit})`
      });
      console.log(`      ❌ HIGH (above ${threshold.max}${threshold.unit})`);
    } else {
      console.log(`      ✅ OK`);
    }
  }

  return alerts;
}

/**
 * Generate SMS alert message (NO EMOJIS - Plain text only)
 */
function generateAlertMessage(plant, plantRequirements, alerts) {
  const timestamp = new Date().toLocaleString('en-US', { 
    month: 'short', 
    day: 'numeric', 
    hour: '2-digit', 
    minute: '2-digit' 
  });
  
  // PLAIN TEXT ONLY - NO EMOJIS
  let message = `*** SOIL ALERT ***\n`;
  message += `Plant: ${plantRequirements.plantName}\n`;
  message += `Plot: ${plantRequirements.plotNumber}\n`;
  message += `Stage: ${plantRequirements.currentStage}\n`;
  message += `Time: ${timestamp}\n\n`;
  
  alerts.forEach((alert, index) => {
    message += `${index + 1}. ${alert.message}\n`;
  });
  
  message += `\nPlease check your farm immediately.`;
  
  // SMS limit is typically 160 characters for single message
  // Semaphore allows longer messages but charges per segment (160 chars)
  if (message.length > 320) { // 2 SMS segments
    message = message.substring(0, 317) + '...';
  }
  
  return message;
}

/**
 * Create unique alert ID
 */
function createAlertId(plantId, timestamp, alerts) {
  const alertKeys = alerts.map(a => `${a.parameter}-${a.status}`).sort().join('_');
  return `${plantId}_${timestamp}_${alertKeys}`;
}

/**
 * Check if alert was already sent
 */
async function isAlertAlreadySent(db, alertId) {
  try {
    const alertDoc = await db.collection('sentAlerts').doc(alertId).get();
    if (alertDoc.exists) {
      const alertData = alertDoc.data();
      const sentAt = alertData.sentAt?.toDate();
      
      // Only suppress if sent within last hour
      if (sentAt) {
        const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
        if (sentAt > hourAgo) {
          return { shouldSkip: true, reason: 'Same alert sent within last hour' };
        }
      }
    }

    return { shouldSkip: false };
  } catch (error) {
    console.error('Error checking alert status:', error);
    return { shouldSkip: sentAlerts.has(alertId), reason: 'In-memory check' };
  }
}

/**
 * Mark alert as sent in Firestore
 */
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

/**
 * Create calendar event for soil sensor alert
 */
async function createCalendarEvent(db, plant, plantRequirements, alerts, sensorData) {
  try {
    const now = new Date();
    const eventDate = now.toISOString().split('T')[0]; // YYYY-MM-DD
    
    // Generate event title
    const alertParams = alerts.map(a => a.parameter).join(', ');
    const eventTitle = `Soil Alert: ${alertParams} - ${plantRequirements.plantName} (Plot ${plantRequirements.plotNumber})`;
    
    // Generate detailed description
    let description = `SOIL SENSOR ALERT DETECTED\n\n`;
    description += `Plant: ${plantRequirements.plantName} (${plantRequirements.scientificName})\n`;
    description += `Plot Number: ${plantRequirements.plotNumber}\n`;
    description += `Growth Stage: ${plantRequirements.currentStage}\n`;
    description += `Alert Time: ${now.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}\n\n`;
    
    description += `THRESHOLD VIOLATIONS:\n`;
    alerts.forEach((alert, index) => {
      description += `${index + 1}. ${alert.parameter}: ${alert.value}${alert.unit} `;
      description += `(${alert.status} - threshold: ${alert.status === 'LOW' ? 'min ' : 'max '}${alert.threshold}${alert.unit})\n`;
    });
    
    description += `\nCURRENT SENSOR READINGS:\n`;
    if (sensorData.nitrogen !== undefined) description += `- Nitrogen: ${sensorData.nitrogen} ppm\n`;
    if (sensorData.phosphorus !== undefined) description += `- Phosphorus: ${sensorData.phosphorus} ppm\n`;
    if (sensorData.potassium !== undefined) description += `- Potassium: ${sensorData.potassium} ppm\n`;
    if (sensorData.ph !== undefined) description += `- pH: ${sensorData.ph}\n`;
    if (sensorData.temperature !== undefined) description += `- Temperature: ${sensorData.temperature}°C\n`;
    if (sensorData.humidity !== undefined) description += `- Humidity: ${sensorData.humidity}%\n`;
    
    description += `\nACTION REQUIRED:\n`;
    description += `Please check the farm and take corrective action based on the threshold violations above.\n`;
    description += `Refer to fertilizer recommendations in the system for specific treatment guidelines.`;
    
    console.log(`\n📅 Creating calendar event in Firestore events collection...`);
    
    // Create event document
    const eventData = {
      title: eventTitle,
      description: description,
      date: eventDate,
      startTime: now.toTimeString().split(' ')[0].substring(0, 5), // HH:MM
      endTime: '', // No specific end time for alerts
      type: 'alert', // Event type
      status: 'pending', // Status: pending action
      priority: 'high', // High priority for alerts
      plantId: plant.id,
      plantName: plantRequirements.plantName,
      plotNumber: plantRequirements.plotNumber,
      growthStage: plantRequirements.currentStage,
      alertDetails: {
        sensorId: sensorData.sensorId || plant.soilSensor,
        alerts: alerts.map(a => ({
          parameter: a.parameter,
          value: a.value,
          status: a.status,
          threshold: a.threshold,
          unit: a.unit
        })),
        sensorData: {
          nitrogen: sensorData.nitrogen,
          phosphorus: sensorData.phosphorus,
          potassium: sensorData.potassium,
          ph: sensorData.ph,
          temperature: sensorData.temperature,
          humidity: sensorData.humidity
        }
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: 'system', // System-generated event
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    // Add to events collection
    const eventRef = await db.collection('events').add(eventData);
    console.log(`✅ Calendar event created: ${eventRef.id}`);
    console.log(`   Title: "${eventTitle}"`);
    
    return {
      success: true,
      eventId: eventRef.id,
      eventTitle
    };
  } catch (error) {
    console.error('❌ Error creating calendar event:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Main function to process soil sensor alerts
 * 1. Gets sensor reading from RTDB
 * 2. Finds matching plant in Firestore plants collection
 * 3. Gets stage requirements from plantsList collection
 * 4. Checks thresholds and sends alerts
 */
export async function processSoilSensorAlert(sensorId, sensorData, db) {
  try {
    console.log('\n═══════════════════════════════════════════');
    console.log('🚨 Processing Soil Sensor Alert');
    console.log('═══════════════════════════════════════════');
    console.log(`📡 Sensor ID from RTDB: ${sensorId}`);
    console.log(`📊 Sensor Data:`, JSON.stringify(sensorData, null, 2));

    // Step 1: Find plant in Firestore plants collection by matching soilSensor field
    const plant = await getPlantBySensor(db, sensorId);
    
    if (!plant) {
      console.log(`\n❌ ALERT SKIPPED: No plant found for sensor ${sensorId}`);
      console.log(`═══════════════════════════════════════════\n`);
      return { success: false, message: 'No plant associated with sensor' };
    }

    // Step 2: Get current stage requirements from plantsList collection
    const plantRequirements = await getCurrentStageRequirements(db, plant);
    
    if (!plantRequirements) {
      console.log('\n❌ ALERT SKIPPED: Could not fetch plant requirements');
      console.log(`═══════════════════════════════════════════\n`);
      return { success: false, message: 'Plant requirements not found' };
    }

    // Step 3: Check thresholds against sensor readings
    const alerts = await checkThresholdsForPlant(sensorData, plantRequirements);
    
    if (alerts.length === 0) {
      console.log('\n✅ All readings within normal range - no alerts needed');
      console.log(`═══════════════════════════════════════════\n`);
      return { success: true, message: 'No alerts needed' };
    }

    console.log(`\n⚠️  ${alerts.length} threshold violation(s) detected!`);
    alerts.forEach((alert, i) => console.log(`   ${i + 1}. ${alert.message}`));

    // Step 4: Check if we already sent this alert recently
    const alertId = createAlertId(plant.id, sensorData.timestamp || Date.now(), alerts);
    const alertCheck = await isAlertAlreadySent(db, alertId);
    
    if (alertCheck.shouldSkip) {
      console.log(`\n⏭️  Alert skipped: ${alertCheck.reason}`);
      console.log(`═══════════════════════════════════════════\n`);
      return { success: true, message: alertCheck.reason, skipped: true };
    }

    // Step 5: Generate alert message
    const message = generateAlertMessage(plant, plantRequirements, alerts);
    console.log('\n📱 SMS Alert Message:');
    console.log('─────────────────');
    console.log(message);
    console.log('─────────────────');

    // Step 6: Get recipients from Firestore users collection
    const recipients = await fetchAlertRecipients(db);
    
    if (recipients.length === 0) {
      console.log('\n❌ No recipients found - cannot send alerts');
      console.log(`═══════════════════════════════════════════\n`);
      return { success: false, message: 'No recipients found' };
    }

    console.log(`\n📤 Sending SMS to ${recipients.length} recipient(s)...`);

    // Step 7: Send SMS alerts
    const sendPromises = recipients.map(user => sendSMS(user.mobile, message));
    const results = await Promise.all(sendPromises);
    
    // Step 8: Create calendar event in Firestore
    const calendarResult = await createCalendarEvent(db, plant, plantRequirements, alerts, sensorData);
    
    // Step 9: Mark alert as sent in Firestore
    await markAlertAsSent(db, alertId, {
      plantId: plant.id,
      plantName: plantRequirements.plantName,
      plotNumber: plantRequirements.plotNumber,
      currentStage: plantRequirements.currentStage,
      sensorId,
      timestamp: sensorData.timestamp || new Date().toISOString(),
      alerts,
      recipients: recipients.map(r => ({ name: r.name, mobile: r.mobile })),
      sensorData,
      calendarEventId: calendarResult.success ? calendarResult.eventId : null
    });

    const successCount = results.filter(r => r.success).length;
    const failCount = results.length - successCount;
    
    console.log('\n📊 Alert Summary:');
    console.log(`   SMS Sent: ${successCount}/${recipients.length}`);
    if (failCount > 0) console.log(`   SMS Failed: ${failCount}`);
    console.log(`   Calendar Event: ${calendarResult.success ? '✅ Created' : '❌ Failed'}`);
    console.log(`═══════════════════════════════════════════\n`);

    return {
      success: true,
      plant: {
        name: plantRequirements.plantName,
        plot: plantRequirements.plotNumber,
        stage: plantRequirements.currentStage
      },
      alerts,
      sentTo: successCount,
      total: recipients.length,
      results,
      calendarEvent: calendarResult
    };

  } catch (error) {
    console.error('\n❌ Error processing soil sensor alert:', error);
    console.log(`═══════════════════════════════════════════\n`);
    return { success: false, error: error.message };
  }
}

/**
 * Setup API routes for sensor readings and alerts
 */
export function setupAlertRoute(app, realtimeDb, firestoreDb) {
  // POST endpoint for sensor readings
  app.post('/api/soil-sensor/reading', async (req, res) => {
    try {
      const { sensorId, ...sensorData } = req.body;
      
      console.log(`\n📥 API Request: POST /api/soil-sensor/reading`);
      console.log(`   Sensor ID: ${sensorId}`);
      
      if (!sensorId) {
        return res.status(400).json({ error: 'sensorId is required' });
      }

      const dataToSave = {
        ...sensorData,
        timestamp: sensorData.timestamp || new Date().toISOString()
      };
      
      // Save to Realtime Database under sensors/[sensorId]/[timestamp]
      const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '_');
      await realtimeDb.ref(`sensors/${sensorId}/${timestamp}`).set(dataToSave);
      console.log(`✅ Sensor reading saved to RTDB: sensors/${sensorId}/${timestamp}`);
      
      // Process alerts (will check Firestore plants collection)
      const alertResult = await processSoilSensorAlert(sensorId, dataToSave, firestoreDb);
      
      res.json({
        success: true,
        sensorId,
        timestamp,
        alertResult
      });
    } catch (error) {
      console.error('Error in sensor reading endpoint:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST endpoint to manually check alerts for a sensor
  app.post('/api/soil-sensor/check-alerts', async (req, res) => {
    try {
      const { sensorId } = req.body;

      console.log(`\n📥 API Request: POST /api/soil-sensor/check-alerts`);
      console.log(`   Sensor ID: ${sensorId}`);

      if (!sensorId) {
        return res.status(400).json({ error: 'sensorId is required' });
      }

      // Get the latest reading from RTDB by ordering by key (timestamp)
      console.log(`   Fetching latest reading from RTDB: sensors/${sensorId}`);
      const snapshot = await realtimeDb.ref(`sensors/${sensorId}`)
        .orderByKey()
        .limitToLast(1)
        .once('value');

      if (!snapshot.exists()) {
        return res.json({ 
          success: false, 
          message: `No sensor readings found in RTDB for ${sensorId}` 
        });
      }

      // Extract the latest reading
      let latestReading = null;
      snapshot.forEach(child => {
        latestReading = child.val();
      });
      
      console.log(`   ✅ Latest reading found, checking plants collection...`);
      
      // Process alert (will check Firestore plants collection)
      const alertResult = await processSoilSensorAlert(sensorId, latestReading, firestoreDb);
      
      res.json(alertResult);
    } catch (error) {
      console.error('Error checking alerts:', error);
      res.status(500).json({ error: error.message });
    }
  });

  console.log('✅ Alert routes registered');
}

/**
 * Setup real-time listener to monitor RTDB and match with Firestore plants
 */
export function setupRealtimeAlertListener(realtimeDb, firestoreDb) {
  console.log('═══════════════════════════════════════════');
  console.log('🎧 Setting up Realtime Database listener...');
  console.log('═══════════════════════════════════════════');
  
  const sensorsRef = realtimeDb.ref('sensors');
  
  // Log current sensors on startup
  sensorsRef.once('value', (snapshot) => {
    if (snapshot.exists()) {
      const sensors = Object.keys(snapshot.val());
      console.log(`\n📡 Found ${sensors.length} sensor(s) in RTDB:`);
      sensors.forEach(sensorId => {
        console.log(`   - ${sensorId}`);
      });
      console.log('\n✅ Now monitoring for changes...\n');
    } else {
      console.log('\n⚠️  No sensors found in RTDB yet');
      console.log('   Waiting for sensor data...\n');
    }
  });
  
  // Monitor for new sensors being added
  sensorsRef.on('child_added', async (sensorSnapshot) => {
    const sensorId = sensorSnapshot.key;
    console.log(`\n🆕 NEW SENSOR DETECTED in RTDB: ${sensorId}`);
    console.log('   Checking for latest reading...');
    
    const latestSnapshot = await sensorSnapshot.ref
      .orderByKey()
      .limitToLast(1)
      .once('value');
    
    let latestReading = null;
    latestSnapshot.forEach(child => {
      latestReading = child.val();
    });
    
    if (latestReading) {
      console.log(`   ✅ Latest reading found, checking Firestore plants collection...`);
      await processSoilSensorAlert(sensorId, latestReading, firestoreDb);
    } else {
      console.log(`   ⚠️  No readings yet for ${sensorId}`);
    }
  });
  
  // Monitor for changes to existing sensors
  sensorsRef.on('child_changed', async (sensorSnapshot) => {
    const sensorId = sensorSnapshot.key;
    console.log(`\n🔄 SENSOR DATA UPDATED in RTDB: ${sensorId}`);
    console.log('   Fetching latest reading from RTDB...');
    
    const latestSnapshot = await sensorSnapshot.ref
      .orderByKey()
      .limitToLast(1)
      .once('value');
    
    let latestReading = null;
    latestSnapshot.forEach(child => {
      latestReading = child.val();
    });
    
    if (latestReading) {
      console.log(`   ✅ Latest reading retrieved`);
      console.log(`   📊 Data: N=${latestReading.nitrogen || 'N/A'}, P=${latestReading.phosphorus || 'N/A'}, K=${latestReading.potassium || 'N/A'}`);
      console.log(`   🔍 Looking up plant in Firestore plants collection...`);
      await processSoilSensorAlert(sensorId, latestReading, firestoreDb);
    }
  });
  
  console.log('═══════════════════════════════════════════');
  console.log('✅ Real-time listener ACTIVE');
  console.log('   Monitoring: Realtime Database (sensors/*)');
  console.log('   Matching: Firestore (plants collection)');
  console.log('   Alerts: SMS + Calendar Events');
  console.log('═══════════════════════════════════════════\n');
  
  return () => {
    sensorsRef.off('child_changed');
    sensorsRef.off('child_added');
    console.log('\n❌ Real-time listener stopped');
  };
}

export async function cleanupOldAlerts(db, daysToKeep = 7) {
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

/**
 * SMS Alert Service Class
 */
class SMSAlertService {
  constructor() {
    this.apiKey = SEMAPHORE_API_KEY;
    this.apiUrl = SEMAPHORE_API_URL;
  }

  async sendSMS(phoneNumber, message) {
    return sendSMS(phoneNumber, message);
  }

  async processSoilSensorAlert(sensorId, sensorData, firestoreDb) {
    return processSoilSensorAlert(sensorId, sensorData, firestoreDb);
  }

  setupAlertRoute(app, realtimeDb, firestoreDb) {
    return setupAlertRoute(app, realtimeDb, firestoreDb);
  }

  setupRealtimeAlertListener(realtimeDb, firestoreDb) {
    return setupRealtimeAlertListener(realtimeDb, firestoreDb);
  }

  async cleanupOldAlerts(firestoreDb, daysToKeep = 7) {
    return cleanupOldAlerts(firestoreDb, daysToKeep);
  }
}

export const smsAlertService = new SMSAlertService();
export default smsAlertService;