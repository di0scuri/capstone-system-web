// server/services/analyticsService.js
const axios = require('axios');

// OpenRouter API Configuration
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || 'YOUR_OPENROUTER_API_KEY';
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Model selection - you can change this
const AI_MODEL = 'anthropic/claude-3.5-sonnet'; // or 'openai/gpt-4', 'meta-llama/llama-3.1-70b-instruct', etc.

/**
 * Call OpenRouter API for AI analysis
 */
async function callOpenRouterAPI(prompt, systemPrompt) {
  try {
    const response = await axios.post(
      OPENROUTER_API_URL,
      {
        model: AI_MODEL,
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: prompt
          }
        ]
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://your-greenhouse-app.com',
          'X-Title': 'Greenhouse Management System'
        }
      }
    );

    return {
      success: true,
      content: response.data.choices[0].message.content,
      model: response.data.model,
      usage: response.data.usage
    };
  } catch (error) {
    console.error('❌ OpenRouter API Error:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.error || error.message
    };
  }
}

/**
 * Analyze current soil sensor data and provide recommendations
 */
async function analyzeSoilData(sensorData) {
  const systemPrompt = `You are an expert agricultural AI assistant specializing in greenhouse management and soil health. 
Your role is to analyze soil sensor data and provide actionable, practical recommendations to farmers.

Focus on:
- Identifying specific problems or risks
- Providing clear, step-by-step actions
- Explaining the "why" behind recommendations
- Prioritizing urgent issues first
- Being specific about quantities, timing, and methods

Keep responses concise but informative. Use bullet points for clarity.`;

  const userPrompt = `Analyze this soil sensor data and provide prescriptive recommendations:

**Current Readings:**
- Conductivity: ${sensorData.Conductivity || 'N/A'}
- Moisture: ${sensorData.Moisture || 'N/A'}%
- Nitrogen (N): ${sensorData.Nitrogen || 'N/A'}
- Phosphorus (P): ${sensorData.Phosphorus || 'N/A'}
- Potassium (K): ${sensorData.Potassium || 'N/A'}
- Temperature: ${sensorData.Temperature || 'N/A'}°C
- pH: ${sensorData.pH || 'N/A'}
- Timestamp: ${sensorData.timestamp || new Date().toISOString()}

**Optimal Ranges (for reference):**
- Conductivity: 20-50
- Moisture: 10-25%
- Nitrogen: 10-25
- Phosphorus: 10-25
- Potassium: 1000-2000
- Temperature: 20-35°C
- pH: 5.5-7.5

Please provide:
1. **Critical Issues** - What needs immediate attention?
2. **Recommendations** - Specific actions to take
3. **Impact** - What will happen if not addressed?
4. **Timeline** - When should these actions be taken?`;

  console.log('🤖 Requesting AI analysis from OpenRouter...');
  const result = await callOpenRouterAPI(userPrompt, systemPrompt);

  if (result.success) {
    console.log('✅ AI analysis completed');
    console.log(`📊 Model used: ${result.model}`);
    console.log(`💰 Tokens used: ${result.usage?.total_tokens || 'N/A'}`);
  }

  return result;
}

/**
 * Analyze historical trends and predict future issues
 */
async function analyzeTrends(historicalData) {
  const systemPrompt = `You are an expert agricultural data scientist specializing in predictive analytics for greenhouse management.
Analyze historical sensor data patterns to identify trends, predict potential issues, and recommend preventive actions.`;

  const dataPoints = historicalData.map(d => 
    `[${d.timestamp}] Conductivity: ${d.Conductivity}, Moisture: ${d.Moisture}%, N: ${d.Nitrogen}, P: ${d.Phosphorus}, K: ${d.Potassium}, Temp: ${d.Temperature}°C, pH: ${d.pH}`
  ).join('\n');

  const userPrompt = `Analyze these historical soil sensor readings and identify patterns:

${dataPoints}

Please provide:
1. **Trends Identified** - What patterns do you see?
2. **Predicted Issues** - What problems might occur soon?
3. **Preventive Actions** - What should be done now to prevent issues?
4. **Seasonal Recommendations** - Any seasonal adjustments needed?`;

  console.log('🤖 Analyzing historical trends with AI...');
  const result = await callOpenRouterAPI(userPrompt, systemPrompt);

  if (result.success) {
    console.log('✅ Trend analysis completed');
  }

  return result;
}

/**
 * Get crop-specific recommendations
 */
async function getCropRecommendations(sensorData, cropType) {
  const systemPrompt = `You are an expert agronomist specializing in ${cropType} cultivation.
Provide specific, actionable recommendations for growing ${cropType} based on current soil conditions.`;

  const userPrompt = `I'm growing ${cropType} in a greenhouse. Here are my current soil conditions:

- Conductivity: ${sensorData.Conductivity}
- Moisture: ${sensorData.Moisture}%
- Nitrogen: ${sensorData.Nitrogen}
- Phosphorus: ${sensorData.Phosphorus}
- Potassium: ${sensorData.Potassium}
- Temperature: ${sensorData.Temperature}°C
- pH: ${sensorData.pH}

What specific actions should I take to optimize conditions for ${cropType}?

Include:
1. **Fertilization plan** - What nutrients to add and when
2. **Watering schedule** - How much and how often
3. **pH adjustments** - If needed, how to adjust
4. **Growth stage considerations** - Any specific recommendations for current growth stage
5. **Expected timeline** - When should I see improvements?`;

  console.log(`🤖 Getting crop-specific recommendations for ${cropType}...`);
  const result = await callOpenRouterAPI(userPrompt, systemPrompt);

  return result;
}

/**
 * Diagnose problems based on symptoms and sensor data
 */
async function diagnoseProblem(sensorData, symptoms) {
  const systemPrompt = `You are an expert plant pathologist and soil scientist.
Diagnose plant health issues by correlating visual symptoms with soil sensor data.
Provide accurate diagnoses and treatment plans.`;

  const userPrompt = `Help diagnose this greenhouse problem:

**Observed Symptoms:**
${symptoms}

**Current Soil Conditions:**
- Conductivity: ${sensorData.Conductivity}
- Moisture: ${sensorData.Moisture}%
- Nitrogen: ${sensorData.Nitrogen}
- Phosphorus: ${sensorData.Phosphorus}
- Potassium: ${sensorData.Potassium}
- Temperature: ${sensorData.Temperature}°C
- pH: ${sensorData.pH}

Please provide:
1. **Likely Diagnosis** - What's causing this?
2. **Confidence Level** - How certain are you?
3. **Root Cause** - Explain the connection between symptoms and sensor data
4. **Treatment Plan** - Step-by-step solution
5. **Prevention** - How to avoid this in the future`;

  console.log('🤖 Diagnosing problem with AI...');
  const result = await callOpenRouterAPI(userPrompt, systemPrompt);

  return result;
}

/**
 * Generate comprehensive farm report
 */
async function generateFarmReport(currentData, historicalData, cropInfo) {
  const systemPrompt = `You are an agricultural consultant creating comprehensive farm reports.
Analyze all available data and create a detailed, professional report with actionable insights.`;

  const userPrompt = `Create a comprehensive greenhouse management report:

**Current Status:**
- Conductivity: ${currentData.Conductivity}
- Moisture: ${currentData.Moisture}%
- NPK: ${currentData.Nitrogen}/${currentData.Phosphorus}/${currentData.Potassium}
- Temperature: ${currentData.Temperature}°C
- pH: ${currentData.pH}

**Crops:** ${cropInfo || 'Various vegetables'}
**Historical Data Points:** ${historicalData.length}

Generate a report with:
1. **Executive Summary** - Overall farm health status
2. **Key Findings** - Most important insights
3. **Performance Metrics** - How well are conditions maintained?
4. **Recommendations** - Top 5 actions to take this week
5. **Long-term Strategy** - 30-day improvement plan
6. **Cost-Benefit Analysis** - Expected ROI of recommendations`;

  console.log('🤖 Generating comprehensive farm report...');
  const result = await callOpenRouterAPI(userPrompt, systemPrompt);

  return result;
}

/**
 * Store analytics result in Firestore
 */
async function storeAnalyticsResult(db, analysisType, sensorData, aiResponse) {
  try {
    const docRef = await db.collection('analyticsResults').add({
      type: analysisType,
      sensorData: sensorData,
      aiAnalysis: aiResponse.content,
      model: aiResponse.model,
      timestamp: new Date().toISOString(),
      createdAt: require('firebase-admin').firestore.FieldValue.serverTimestamp()
    });

    console.log('✅ Analytics result stored with ID:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('❌ Error storing analytics result:', error);
    return null;
  }
}

module.exports = {
  analyzeSoilData,
  analyzeTrends,
  getCropRecommendations,
  diagnoseProblem,
  generateFarmReport,
  storeAnalyticsResult,
  callOpenRouterAPI
};