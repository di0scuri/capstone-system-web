class OpenRouterService {
  constructor() {
    this.apiKey = process.env.REACT_APP_OPENROUTER_API_KEY
    this.baseUrl = 'https://openrouter.ai/api/v1'
    this.appName = process.env.REACT_APP_OPENROUTER_APP_NAME || 'AgriTrack'
    this.siteUrl = process.env.REACT_APP_OPENROUTER_SITE_URL || 'http://localhost:3000'
  }

  async makeRequest(endpoint, data) {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': this.siteUrl,
          'X-Title': this.appName,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      })

      if (!response.ok) {
        throw new Error(`OpenRouter API error: ${response.status}`)
      }

      return await response.json()
    } catch (error) {
      console.error('OpenRouter API request failed:', error)
      throw error
    }
  }

  // Get plant recommendations based on soil data and environmental conditions
  async getPlantRecommendations(params) {
    const {
      soilData,        // {nitrogen, phosphorus, potassium, ph, temperature, humidity}
      season,          // 'spring', 'summer', 'fall', 'winter'
      greenhouseArea,  // in square meters
      climate,         // 'tropical', 'temperate', 'arid', etc.
      previousCrops,   // array of previous crop names
      budget          // optional budget constraint
    } = params

    const prompt = `You are an agricultural expert specializing in greenhouse cultivation. Analyze the following data and provide plant recommendations:

SOIL CONDITIONS:
- Nitrogen (N): ${soilData.nitrogen} ppm
- Phosphorus (P): ${soilData.phosphorus} ppm
- Potassium (K): ${soilData.potassium} ppm
- pH Level: ${soilData.ph}
- Temperature: ${soilData.temperature}°C
- Humidity: ${soilData.humidity}%

GREENHOUSE CONDITIONS:
- Available Area: ${greenhouseArea} m²
- Season: ${season}
- Climate Zone: ${climate}
${previousCrops?.length > 0 ? `- Previous Crops: ${previousCrops.join(', ')}` : ''}
${budget ? `- Budget: $${budget}` : ''}

Please provide:
1. Top 5 recommended plants/crops with reasoning
2. Expected yield per m²
3. Growth duration (days to harvest)
4. Soil amendments needed (if any)
5. Estimated profit margin
6. Crop rotation compatibility with previous crops

Format your response as JSON:
{
  "recommendations": [
    {
      "plant": "Plant Name",
      "reasoning": "Why this plant is suitable",
      "yieldPerSqM": "number in kg",
      "growthDuration": "number in days",
      "soilAmendments": ["amendment1", "amendment2"],
      "profitMargin": "percentage",
      "rotationScore": "1-10",
      "difficulty": "easy|medium|hard",
      "marketDemand": "low|medium|high"
    }
  ],
  "soilHealthScore": "1-10",
  "criticalIssues": ["issue1", "issue2"],
  "generalAdvice": "Overall farming advice"
}`

    const response = await this.makeRequest('/chat/completions', {
      model: 'anthropic/claude-3.5-sonnet', // Or 'openai/gpt-4' depending on preference
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 2000
    })

    try {
      const content = response.choices[0].message.content
      // Try to parse JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0])
      }
      return { error: 'Failed to parse recommendations', rawResponse: content }
    } catch (error) {
      console.error('Failed to parse AI response:', error)
      return { error: 'Failed to parse recommendations', rawResponse: response.choices[0].message.content }
    }
  }

  // Get prescriptive analytics for current crops
  async getPrescriptiveAnalytics(params) {
    const {
      currentCrops,    // array of crop objects with sensor data
      sensorHistory,   // historical sensor readings
      weatherForecast, // optional weather data
      issues          // any reported issues
    } = params

    const prompt = `You are an agricultural AI assistant specializing in prescriptive analytics for greenhouse management.

CURRENT CROPS DATA:
${JSON.stringify(currentCrops, null, 2)}

RECENT SENSOR HISTORY:
${JSON.stringify(sensorHistory.slice(-10), null, 2)}

${weatherForecast ? `WEATHER FORECAST:\n${JSON.stringify(weatherForecast, null, 2)}` : ''}

${issues?.length > 0 ? `REPORTED ISSUES:\n${issues.join('\n')}` : ''}

Based on this data, provide prescriptive analytics including:
1. Immediate actions needed (next 24-48 hours)
2. Short-term actions (next week)
3. Medium-term planning (next month)
4. Predicted problems and prevention strategies
5. Resource optimization recommendations
6. Harvest timing predictions

Format as JSON:
{
  "urgentActions": [
    {
      "action": "Action description",
      "reason": "Why this is needed",
      "deadline": "timeframe",
      "priority": "high|medium|low",
      "affectedCrops": ["crop1", "crop2"]
    }
  ],
  "shortTermActions": [...],
  "mediumTermPlan": [...],
  "predictedIssues": [
    {
      "issue": "Potential problem",
      "probability": "percentage",
      "impact": "high|medium|low",
      "prevention": ["step1", "step2"]
    }
  ],
  "resourceOptimization": {
    "water": "recommendation",
    "fertilizer": "recommendation",
    "energy": "recommendation"
  },
  "harvestPredictions": [
    {
      "crop": "crop name",
      "estimatedDate": "YYYY-MM-DD",
      "estimatedYield": "amount",
      "quality": "excellent|good|fair|poor"
    }
  ],
  "overallHealthScore": "1-10"
}`

    const response = await this.makeRequest('/chat/completions', {
      model: 'anthropic/claude-3.5-sonnet',
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.5,
      max_tokens: 2500
    })

    try {
      const content = response.choices[0].message.content
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0])
      }
      return { error: 'Failed to parse analytics', rawResponse: content }
    } catch (error) {
      console.error('Failed to parse AI response:', error)
      return { error: 'Failed to parse analytics', rawResponse: response.choices[0].message.content }
    }
  }

  // Get specific crop care advice
  async getCropCareAdvice(cropName, currentConditions, stage) {
    const prompt = `Provide specific care advice for ${cropName} at ${stage} growth stage.

Current Conditions:
${JSON.stringify(currentConditions, null, 2)}

Provide detailed care instructions including:
1. Optimal conditions for this stage
2. Common problems at this stage
3. Nutrient requirements
4. Watering schedule
5. Pest and disease prevention
6. Expected timeline to next stage

Be specific and actionable.`

    const response = await this.makeRequest('/chat/completions', {
      model: 'anthropic/claude-3.5-sonnet',
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.6,
      max_tokens: 1500
    })

    return response.choices[0].message.content
  }

  // Diagnose plant health issues from description
  async diagnosePlantIssue(params) {
    const { cropName, symptoms, images, sensorData } = params

    const prompt = `You are a plant pathologist. Diagnose the following plant health issue:

Crop: ${cropName}
Symptoms: ${symptoms}

Current Sensor Data:
${JSON.stringify(sensorData, null, 2)}

Provide:
1. Most likely diagnosis (disease, pest, or environmental issue)
2. Confidence level (%)
3. Treatment recommendations (prioritized)
4. Prevention measures for future
5. Expected recovery time

Format as JSON with clear fields.`

    const response = await this.makeRequest('/chat/completions', {
      model: 'anthropic/claude-3.5-sonnet',
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.4, // Lower temperature for more consistent diagnosis
      max_tokens: 1500
    })

    try {
      const content = response.choices[0].message.content
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0])
      }
      return { rawResponse: content }
    } catch (error) {
      return { rawResponse: response.choices[0].message.content }
    }
  }
}

// Export singleton instance
export const openRouterService = new OpenRouterService()