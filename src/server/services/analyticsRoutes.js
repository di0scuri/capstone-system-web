// server/routes/analyticsRoutes.js
const express = require('express');
const router = express.Router();
const analyticsService = require('../services/analyticsService');

/**
 * Generate complete plant lifecycle plan with events and optimal NPK values
 * POST /api/analytics/generate-plant-lifecycle
 */
router.post('/generate-plant-lifecycle', async (req, res) => {
  try {
    const { plantType, plantName, datePlanted, initialQuantity, areaOccupied, locationZone } = req.body

    if (!plantType || !datePlanted) {
      return res.status(400).json({ error: 'Plant type and date planted are required' })
    }

    // Call AI to generate comprehensive lifecycle plan
    const systemPrompt = `You are an expert agricultural AI specializing in organic farming and greenhouse management. 
Your task is to generate a complete, detailed lifecycle plan for plants including:
1. Stage transitions (Germination → Seedling → Growing → Flowering → Fruiting → Harvest)
2. Fertilization schedule (organic fertilizers only)
3. Pest management schedule (organic pesticides only)
4. Watering schedule based on moisture needs
5. Optimal soil conditions for each stage (NPK, Conductivity, Moisture, Temperature, pH)

Provide your response in JSON format with this exact structure:
{
  "events": [
    {
      "daysFromPlanting": 0,
      "message": "Stage start: Germination for Tomato",
      "type": "LIFECYCLE_STAGE",
      "status": "info"
    },
    {
      "daysFromPlanting": 14,
      "message": "Apply organic nitrogen-rich fertilizer (compost tea or fish emulsion)",
      "type": "FERTILIZER",
      "status": "warning"
    }
  ],
  "optimalConditions": {
    "Seeding": {
      "N": 12,
      "P": 15,
      "K": 1200,
      "Conductivity": 30,
      "Moisture": 18,
      "Temperature": 24,
      "pH": 6.5
    },
    "Seedling": {
      "N": 15,
      "P": 18,
      "K": 1400,
      "Conductivity": 35,
      "Moisture": 20,
      "Temperature": 25,
      "pH": 6.5
    },
    "Growing": {
      "N": 18,
      "P": 20,
      "K": 1600,
      "Conductivity": 40,
      "Moisture": 22,
      "Temperature": 26,
      "pH": 6.8
    },
    "Flowering": {
      "N": 15,
      "P": 25,
      "K": 1800,
      "Conductivity": 38,
      "Moisture": 20,
      "Temperature": 25,
      "pH": 6.5
    },
    "Fruiting": {
      "N": 12,
      "P": 22,
      "K": 2000,
      "Conductivity": 42,
      "Moisture": 18,
      "Temperature": 26,
      "pH": 6.3
    },
    "Harvesting": {
      "N": 10,
      "P": 15,
      "K": 1500,
      "Conductivity": 35,
      "Moisture": 15,
      "Temperature": 24,
      "pH": 6.5
    }
  },
  "estimatedHarvestDays": 75,
  "careNotes": "General care instructions and tips"
}

ALL values must be scientifically accurate for the specific plant type. Include:
- N (Nitrogen): ppm or mg/kg
- P (Phosphorus): ppm or mg/kg  
- K (Potassium): ppm or mg/kg
- Conductivity: EC (mS/cm) typically 20-50 range
- Moisture: percentage (10-30%)
- Temperature: Celsius (15-35°C typical range)
- pH: 5.5-7.5 typical range

Be specific with organic fertilizer and pesticide names. Use realistic timelines based on the plant type.`

    const userPrompt = `Generate a complete lifecycle plan for:
- Plant: ${plantType}
- Name: ${plantName}
- Planting Date: ${datePlanted}
- Initial Quantity: ${initialQuantity} plants
- Area: ${areaOccupied} sqm
- Location: ${locationZone}

Include all stage transitions, fertilization schedule (organic only), pest management (organic only), watering schedule, and optimal NPK values for each growth stage.

Return ONLY valid JSON, no additional text.`

    console.log(`🤖 Generating AI lifecycle plan for ${plantType}...`)
    
    const aiResponse = await analyticsService.callOpenRouterAPI(userPrompt, systemPrompt)

    if (!aiResponse.success) {
      return res.status(500).json({ error: aiResponse.error })
    }

    // Parse AI response - try to extract JSON
    let lifecyclePlan
    try {
      // Try to find JSON in the response
      const jsonMatch = aiResponse.content.match(/\{[\s\S]*\}/)
      
      if (jsonMatch) {
        lifecyclePlan = JSON.parse(jsonMatch[0])
      } else {
        // If AI didn't return JSON, create a basic structure
        console.log('AI did not return valid JSON, creating fallback structure')
        return res.status(500).json({ 
          success: false,
          error: 'AI response was not in expected JSON format' 
        })
      }
    } catch (parseError) {
      console.error('Error parsing AI response:', parseError)
      return res.status(500).json({ 
        success: false,
        error: 'Failed to parse AI lifecycle plan' 
      })
    }

    // Convert daysFromPlanting to actual timestamps
    const plantDate = new Date(datePlanted)
    const eventsWithTimestamps = lifecyclePlan.events.map(event => ({
      ...event,
      timestamp: new Date(plantDate.getTime() + event.daysFromPlanting * 24 * 60 * 60 * 1000).toISOString()
    }))

    const response = {
      success: true,
      events: eventsWithTimestamps,
      optimalNPK: lifecyclePlan.optimalConditions, // Changed from optimalNPK to optimalConditions
      estimatedHarvestDays: lifecyclePlan.estimatedHarvestDays,
      recommendations: lifecyclePlan.careNotes || aiResponse.content,
      model: aiResponse.model
    }

    // Store in Firestore
    const { db } = require('../config/firebase')
    await analyticsService.storeAnalyticsResult(
      db,
      'plant-lifecycle',
      { plantType, plantName, datePlanted },
      { content: JSON.stringify(response), model: aiResponse.model }
    )

    console.log(`✅ Generated ${eventsWithTimestamps.length} lifecycle events for ${plantType}`)
    
    res.json(response)
  } catch (error) {
    console.error('Error in generate-plant-lifecycle route:', error)
    res.status(500).json({ error: error.message })
  }
})

/**
 * Analyze current soil sensor data
 * POST /api/analytics/analyze-soil
 */
router.post('/analyze-soil', async (req, res) => {
  try {
    const { sensorData } = req.body;

    if (!sensorData) {
      return res.status(400).json({ error: 'Sensor data is required' });
    }

    const analysis = await analyticsService.analyzeSoilData(sensorData);

    if (!analysis.success) {
      return res.status(500).json({ error: analysis.error });
    }

    // Store result in Firestore
    const { db } = require('../config/firebase');
    const resultId = await analyticsService.storeAnalyticsResult(
      db,
      'soil-analysis',
      sensorData,
      analysis
    );

    res.json({
      success: true,
      analysis: analysis.content,
      model: analysis.model,
      resultId
    });
  } catch (error) {
    console.error('Error in analyze-soil route:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Analyze latest sensor reading from Realtime Database
 * GET /api/analytics/analyze-latest
 */
router.get('/analyze-latest', async (req, res) => {
  try {
    const { realtimeDb, db } = require('../config/firebase');

    // Get latest sensor reading
    const snapshot = await realtimeDb.ref('SoilSensor')
      .orderByKey()
      .limitToLast(1)
      .once('value');

    if (!snapshot.exists()) {
      return res.status(404).json({ error: 'No sensor data found' });
    }

    const data = snapshot.val();
    const timestamp = Object.keys(data)[0];
    const sensorData = { timestamp, ...data[timestamp] };

    // Analyze with AI
    const analysis = await analyticsService.analyzeSoilData(sensorData);

    if (!analysis.success) {
      return res.status(500).json({ error: analysis.error });
    }

    // Store result
    const resultId = await analyticsService.storeAnalyticsResult(
      db,
      'soil-analysis',
      sensorData,
      analysis
    );

    res.json({
      success: true,
      sensorData,
      analysis: analysis.content,
      model: analysis.model,
      resultId
    });
  } catch (error) {
    console.error('Error in analyze-latest route:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Analyze historical trends
 * POST /api/analytics/analyze-trends
 */
router.post('/analyze-trends', async (req, res) => {
  try {
    const { limit = 10 } = req.body;
    const { realtimeDb, db } = require('../config/firebase');

    // Get historical data
    const snapshot = await realtimeDb.ref('SoilSensor')
      .orderByKey()
      .limitToLast(limit)
      .once('value');

    if (!snapshot.exists()) {
      return res.status(404).json({ error: 'No historical data found' });
    }

    const historicalData = [];
    snapshot.forEach(child => {
      historicalData.push({
        timestamp: child.key,
        ...child.val()
      });
    });

    // Analyze trends
    const analysis = await analyticsService.analyzeTrends(historicalData);

    if (!analysis.success) {
      return res.status(500).json({ error: analysis.error });
    }

    // Store result
    const resultId = await analyticsService.storeAnalyticsResult(
      db,
      'trend-analysis',
      { dataPoints: historicalData.length, period: `Last ${limit} readings` },
      analysis
    );

    res.json({
      success: true,
      dataPoints: historicalData.length,
      analysis: analysis.content,
      model: analysis.model,
      resultId
    });
  } catch (error) {
    console.error('Error in analyze-trends route:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get crop-specific recommendations
 * POST /api/analytics/crop-recommendations
 */
router.post('/crop-recommendations', async (req, res) => {
  try {
    const { sensorData, cropType } = req.body;

    if (!sensorData || !cropType) {
      return res.status(400).json({ error: 'Sensor data and crop type are required' });
    }

    const recommendations = await analyticsService.getCropRecommendations(
      sensorData,
      cropType
    );

    if (!recommendations.success) {
      return res.status(500).json({ error: recommendations.error });
    }

    // Store result
    const { db } = require('../config/firebase');
    const resultId = await analyticsService.storeAnalyticsResult(
      db,
      'crop-recommendations',
      { ...sensorData, cropType },
      recommendations
    );

    res.json({
      success: true,
      cropType,
      recommendations: recommendations.content,
      model: recommendations.model,
      resultId
    });
  } catch (error) {
    console.error('Error in crop-recommendations route:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Diagnose problems
 * POST /api/analytics/diagnose
 */
router.post('/diagnose', async (req, res) => {
  try {
    const { sensorData, symptoms } = req.body;

    if (!sensorData || !symptoms) {
      return res.status(400).json({ error: 'Sensor data and symptoms are required' });
    }

    const diagnosis = await analyticsService.diagnoseProblem(sensorData, symptoms);

    if (!diagnosis.success) {
      return res.status(500).json({ error: diagnosis.error });
    }

    // Store result
    const { db } = require('../config/firebase');
    const resultId = await analyticsService.storeAnalyticsResult(
      db,
      'problem-diagnosis',
      { ...sensorData, symptoms },
      diagnosis
    );

    res.json({
      success: true,
      diagnosis: diagnosis.content,
      model: diagnosis.model,
      resultId
    });
  } catch (error) {
    console.error('Error in diagnose route:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Generate comprehensive farm report
 * GET /api/analytics/farm-report
 */
router.get('/farm-report', async (req, res) => {
  try {
    const { cropInfo } = req.query;
    const { realtimeDb, db } = require('../config/firebase');

    // Get latest reading
    const latestSnapshot = await realtimeDb.ref('SoilSensor')
      .orderByKey()
      .limitToLast(1)
      .once('value');

    if (!latestSnapshot.exists()) {
      return res.status(404).json({ error: 'No sensor data found' });
    }

    const latestData = latestSnapshot.val();
    const latestTimestamp = Object.keys(latestData)[0];
    const currentData = { timestamp: latestTimestamp, ...latestData[latestTimestamp] };

    // Get historical data (last 30 readings)
    const historicalSnapshot = await realtimeDb.ref('SoilSensor')
      .orderByKey()
      .limitToLast(30)
      .once('value');

    const historicalData = [];
    historicalSnapshot.forEach(child => {
      historicalData.push({
        timestamp: child.key,
        ...child.val()
      });
    });

    // Generate report
    const report = await analyticsService.generateFarmReport(
      currentData,
      historicalData,
      cropInfo || 'Mixed vegetables'
    );

    if (!report.success) {
      return res.status(500).json({ error: report.error });
    }

    // Store result
    const resultId = await analyticsService.storeAnalyticsResult(
      db,
      'farm-report',
      { currentData, historicalDataPoints: historicalData.length },
      report
    );

    res.json({
      success: true,
      report: report.content,
      model: report.model,
      resultId
    });
  } catch (error) {
    console.error('Error in farm-report route:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get previous analytics results
 * GET /api/analytics/history
 */
router.get('/history', async (req, res) => {
  try {
    const { type, limit = 10 } = req.query;
    const { db } = require('../config/firebase');

    let query = db.collection('analyticsResults')
      .orderBy('createdAt', 'desc')
      .limit(parseInt(limit));

    if (type) {
      query = query.where('type', '==', type);
    }

    const snapshot = await query.get();

    const results = [];
    snapshot.forEach(doc => {
      results.push({
        id: doc.id,
        ...doc.data()
      });
    });

    res.json({
      success: true,
      count: results.length,
      results
    });
  } catch (error) {
    console.error('Error in history route:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;