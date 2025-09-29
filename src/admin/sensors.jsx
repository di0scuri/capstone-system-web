import React, { useState, useEffect } from 'react'
import Sidebar from './sidebar'
import './sensors.css'
import { getDatabase, ref, get, onValue, off } from 'firebase/database'

const Sensors = ({ userType = 'admin' }) => {
  const [activeMenu, setActiveMenu] = useState('Sensors')
  const [searchTerm, setSearchTerm] = useState('')
  const [sensors, setSensors] = useState([])
  const [selectedSensor, setSelectedSensor] = useState(null)
  const [sensorHistory, setSensorHistory] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [timeRange, setTimeRange] = useState('24h') // 24h, 7d, 30d, all

  // Fetch all sensors from Firebase Realtime Database
  const fetchSensors = async () => {
    setLoading(true)
    try {
      const rtdb = getDatabase()
      const sensorsRef = ref(rtdb)
      const snapshot = await get(sensorsRef)
      
      if (snapshot.exists()) {
        const data = snapshot.val()
        const sensorsArray = []
        
        // Look for SoilSensor, SoilSensor2, SoilSensor3, etc.
        Object.keys(data).forEach(key => {
          if (key.startsWith('SoilSensor')) {
            const sensorData = data[key]
            
            // Get the latest reading (most recent timestamp)
            let latestReading = null
            let latestTimestamp = 0
            let readingCount = 0
            const history = []
            
            // Process all readings to find the latest and build history
            Object.keys(sensorData).forEach(readingKey => {
              if (readingKey !== 'metadata') { // Skip metadata if it exists
                const reading = sensorData[readingKey]
                readingCount++
                
                // Convert timestamp to Date object
                let timestamp
                if (reading.timestamp) {
                  timestamp = new Date(reading.timestamp)
                } else {
                  // Use reading key as timestamp if no timestamp field
                  timestamp = new Date(readingKey)
                }
                
                history.push({
                  id: readingKey,
                  timestamp,
                  nitrogen: reading.nitrogen || reading.N || 0,
                  phosphorus: reading.phosphorus || reading.P || 0,
                  potassium: reading.potassium || reading.K || 0,
                  ph: reading.ph || reading.pH || 0,
                  temperature: reading.temperature || reading.temp || 0,
                  humidity: reading.humidity || 0,
                  ...reading
                })
                
                if (timestamp > latestTimestamp) {
                  latestTimestamp = timestamp
                  latestReading = {
                    timestamp,
                    nitrogen: reading.nitrogen || reading.N || 0,
                    phosphorus: reading.phosphorus || reading.P || 0,
                    potassium: reading.potassium || reading.K || 0,
                    ph: reading.ph || reading.pH || 0,
                    temperature: reading.temperature || reading.temp || 0,
                    humidity: reading.humidity || 0
                  }
                }
              }
            })
            
            if (latestReading) {
              sensorsArray.push({
                id: key,
                name: `NPK Sensor - ${key}`,
                location: sensorData.location || `Greenhouse ${key.replace('SoilSensor', '') || '1'}`,
                status: 'active',
                lastReading: latestReading.timestamp,
                latestValues: {
                  nitrogen: latestReading.nitrogen,
                  phosphorus: latestReading.phosphorus,
                  potassium: latestReading.potassium,
                  ph: latestReading.ph,
                  temperature: latestReading.temperature,
                  humidity: latestReading.humidity
                },
                readingCount,
                history: history.sort((a, b) => b.timestamp - a.timestamp) // Sort by newest first
              })
            }
          }
        })
        
        setSensors(sensorsArray)
      } else {
        setSensors([])
      }
    } catch (error) {
      console.error('Error fetching sensors from RTDB:', error)
      setSensors([])
    } finally {
      setLoading(false)
    }
  }

  // Fetch sensor history for selected sensor (from cached data)
  const fetchSensorHistory = async (sensorId) => {
    setHistoryLoading(true)
    try {
      const sensor = sensors.find(s => s.id === sensorId)
      if (sensor && sensor.history) {
        let filteredHistory = sensor.history
        
        // Filter by time range
        const now = new Date()
        if (timeRange === '24h') {
          const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
          filteredHistory = filteredHistory.filter(reading => reading.timestamp >= yesterday)
        } else if (timeRange === '7d') {
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
          filteredHistory = filteredHistory.filter(reading => reading.timestamp >= weekAgo)
        } else if (timeRange === '30d') {
          const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
          filteredHistory = filteredHistory.filter(reading => reading.timestamp >= monthAgo)
        }
        
        setSensorHistory(filteredHistory)
      } else {
        setSensorHistory([])
      }
    } catch (error) {
      console.error('Error processing sensor history:', error)
      setSensorHistory([])
    } finally {
      setHistoryLoading(false)
    }
  }

  useEffect(() => {
    fetchSensors()
    
    // Set up real-time listener for sensor data
    const rtdb = getDatabase()
    const sensorsRef = ref(rtdb)
    
    const unsubscribe = onValue(sensorsRef, (snapshot) => {
      if (snapshot.exists()) {
        console.log('Real-time sensor data updated')
        // Refresh sensors when data changes
        setTimeout(fetchSensors, 1000) // Small delay to ensure data is processed
      }
    })
    
    return () => {
      off(sensorsRef, 'value', unsubscribe)
    }
  }, [])

  // Update history when time range changes
  useEffect(() => {
    if (selectedSensor) {
      fetchSensorHistory(selectedSensor.id)
    }
  }, [timeRange, selectedSensor])

  const handleSensorClick = async (sensor) => {
    setSelectedSensor(sensor)
    setShowModal(true)
    await fetchSensorHistory(sensor.id)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setSelectedSensor(null)
    setSensorHistory([])
  }

  // Filter sensors based on search term
  const filteredSensors = sensors.filter(sensor =>
    sensor.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    sensor.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
    sensor.id.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Get sensor status color
  const getSensorStatusColor = (sensor) => {
    const timeDiff = new Date() - sensor.lastReading
    const minutesDiff = timeDiff / (1000 * 60)
    
    if (minutesDiff > 60) return '#f44336' // Red - offline
    if (minutesDiff > 30) return '#ff9800' // Orange - warning
    return '#4caf50' // Green - online
  }

  // Get sensor status text
  const getSensorStatusText = (sensor) => {
    const timeDiff = new Date() - sensor.lastReading
    const minutesDiff = timeDiff / (1000 * 60)
    
    if (minutesDiff > 60) return 'Offline'
    if (minutesDiff > 30) return 'Warning'
    return 'Online'
  }

  // Generate chart data for history
  const getChartData = (parameter) => {
    return sensorHistory.map(reading => ({
      time: reading.timestamp.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit' 
      }),
      value: reading[parameter] || 0,
      timestamp: reading.timestamp
    })).reverse() // Reverse to show chronological order
  }

  const formatValue = (value, unit = '') => {
    return `${(value || 0).toFixed(1)}${unit}`
  }

  return (
    <div className="dashboard-container">
      <Sidebar 
        activeMenu={activeMenu}
        setActiveMenu={setActiveMenu}
        userType={userType}
      />

      <div className="sensors-main">
        {/* Header */}
        <div className="sensors-header">
          <h1 className="sensors-title">Sensor Monitoring</h1>
          <div className="sensors-header-actions">
            <div className="sensors-search-box">
              <input
                type="text"
                placeholder="Search sensors..."
                className="sensors-search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <span className="sensors-search-icon">🔍</span>
            </div>
            <div className="sensors-bell">🔔</div>
          </div>
        </div>

        {/* Content */}
        <div className="sensors-content">
          {/* Stats Summary */}
          <div className="sensors-stats">
            <div className="stat-card">
              <div className="stat-icon online">📶</div>
              <div className="stat-content">
                <h3>Online Sensors</h3>
                <p>{sensors.filter(s => getSensorStatusText(s) === 'Online').length}</p>
              </div>
            </div>
            
            <div className="stat-card">
              <div className="stat-icon warning">⚠️</div>
              <div className="stat-content">
                <h3>Warning Sensors</h3>
                <p>{sensors.filter(s => getSensorStatusText(s) === 'Warning').length}</p>
              </div>
            </div>
            
            <div className="stat-card">
              <div className="stat-icon offline">❌</div>
              <div className="stat-content">
                <h3>Offline Sensors</h3>
                <p>{sensors.filter(s => getSensorStatusText(s) === 'Offline').length}</p>
              </div>
            </div>
            
            <div className="stat-card">
              <div className="stat-icon total">📊</div>
              <div className="stat-content">
                <h3>Total Sensors</h3>
                <p>{sensors.length}</p>
              </div>
            </div>
          </div>

          {/* Sensors Grid */}
          <div className="sensors-grid">
            {loading ? (
              <div className="loading-state">
                <p>Loading sensors...</p>
              </div>
            ) : filteredSensors.length === 0 ? (
              <div className="no-sensors">
                <p>{searchTerm ? `No sensors found matching "${searchTerm}"` : 'No sensors available'}</p>
              </div>
            ) : (
              filteredSensors.map(sensor => (
                <div
                  key={sensor.id}
                  className="sensor-card"
                  onClick={() => handleSensorClick(sensor)}
                >
                  <div className="sensor-header">
                    <div className="sensor-info">
                      <h3 className="sensor-name">{sensor.name}</h3>
                      <p className="sensor-location">{sensor.location}</p>
                    </div>
                    <div 
                      className="sensor-status"
                      style={{ backgroundColor: getSensorStatusColor(sensor) }}
                    >
                      {getSensorStatusText(sensor)}
                    </div>
                  </div>

                  <div className="sensor-readings">
                    <div className="reading-item">
                      <span className="reading-label">Nitrogen</span>
                      <span className="reading-value">{formatValue(sensor.latestValues.nitrogen, ' ppm')}</span>
                    </div>
                    <div className="reading-item">
                      <span className="reading-label">Phosphorus</span>
                      <span className="reading-value">{formatValue(sensor.latestValues.phosphorus, ' ppm')}</span>
                    </div>
                    <div className="reading-item">
                      <span className="reading-label">Potassium</span>
                      <span className="reading-value">{formatValue(sensor.latestValues.potassium, ' ppm')}</span>
                    </div>
                    <div className="reading-item">
                      <span className="reading-label">pH Level</span>
                      <span className="reading-value">{formatValue(sensor.latestValues.ph)}</span>
                    </div>
                    <div className="reading-item">
                      <span className="reading-label">Temperature</span>
                      <span className="reading-value">{formatValue(sensor.latestValues.temperature, '°C')}</span>
                    </div>
                    <div className="reading-item">
                      <span className="reading-label">Humidity</span>
                      <span className="reading-value">{formatValue(sensor.latestValues.humidity, '%')}</span>
                    </div>
                  </div>

                  <div className="sensor-footer">
                    <span className="last-reading">
                      Last reading: {sensor.lastReading.toLocaleString()}
                    </span>
                    <span className="reading-count">
                      {sensor.readingCount} readings
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Sensor History Modal */}
      {showModal && selectedSensor && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="sensor-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ color: '#4CAF50' }}>{selectedSensor.name}</h2>
              <button className="modal-close" onClick={handleCloseModal}>×</button>
            </div>

            <div className="modal-content">
              <div className="sensor-details">
                <div className="detail-item">
                  <strong>Sensor ID:</strong> {selectedSensor.id}
                </div>
                <div className="detail-item">
                  <strong>Location:</strong> {selectedSensor.location}
                </div>
                <div className="detail-item">
                  <strong>Status:</strong> 
                  <span 
                    className="status-indicator"
                    style={{ 
                      backgroundColor: getSensorStatusColor(selectedSensor),
                      color: 'white',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      marginLeft: '8px'
                    }}
                  >
                    {getSensorStatusText(selectedSensor)}
                  </span>
                </div>
                <div className="detail-item">
                  <strong>Total Readings:</strong> {selectedSensor.readingCount}
                </div>
                <div className="detail-item">
                  <strong>Last Reading:</strong> {selectedSensor.lastReading.toLocaleString()}
                </div>
              </div>

              <div className="time-range-selector">
                <label>Time Range:</label>
                <select value={timeRange} onChange={(e) => setTimeRange(e.target.value)}>
                  <option value="24h">Last 24 Hours</option>
                  <option value="7d">Last 7 Days</option>
                  <option value="30d">Last 30 Days</option>
                  <option value="all">All Time</option>
                </select>
              </div>

              <div className="history-content">
                {historyLoading ? (
                  <div className="loading-history">Loading sensor history...</div>
                ) : sensorHistory.length === 0 ? (
                  <div className="no-history">No sensor data available for the selected time range</div>
                ) : (
                  <>
                    {/* Current Values */}
                    <div className="current-values">
                      <h3>Latest Readings</h3>
                      <div className="values-grid">
                        <div className="value-card nitrogen">
                          <span className="value-label">Nitrogen</span>
                          <span className="value-number">{formatValue(selectedSensor.latestValues.nitrogen)}</span>
                          <span className="value-unit">ppm</span>
                        </div>
                        <div className="value-card phosphorus">
                          <span className="value-label">Phosphorus</span>
                          <span className="value-number">{formatValue(selectedSensor.latestValues.phosphorus)}</span>
                          <span className="value-unit">ppm</span>
                        </div>
                        <div className="value-card potassium">
                          <span className="value-label">Potassium</span>
                          <span className="value-number">{formatValue(selectedSensor.latestValues.potassium)}</span>
                          <span className="value-unit">ppm</span>
                        </div>
                        <div className="value-card ph">
                          <span className="value-label">pH Level</span>
                          <span className="value-number">{formatValue(selectedSensor.latestValues.ph)}</span>
                          <span className="value-unit"></span>
                        </div>
                        <div className="value-card temperature">
                          <span className="value-label">Temperature</span>
                          <span className="value-number">{formatValue(selectedSensor.latestValues.temperature)}</span>
                          <span className="value-unit">°C</span>
                        </div>
                        <div className="value-card humidity">
                          <span className="value-label">Humidity</span>
                          <span className="value-number">{formatValue(selectedSensor.latestValues.humidity)}</span>
                          <span className="value-unit">%</span>
                        </div>
                      </div>
                    </div>

                    {/* History Table */}
                    <div className="history-table-container">
                      <h3>Reading History ({sensorHistory.length} records)</h3>
                      <div className="history-table">
                        <div className="table-header">
                          <div>Timestamp</div>
                          <div>Nitrogen</div>
                          <div>Phosphorus</div>
                          <div>Potassium</div>
                          <div>pH</div>
                          <div>Temperature</div>
                          <div>Humidity</div>
                        </div>
                        <div className="table-body">
                          {sensorHistory.slice(0, 50).map((reading, index) => (
                            <div key={reading.id} className="table-row">
                              <div className="timestamp-cell">
                                {reading.timestamp.toLocaleString()}
                              </div>
                              <div className="value-cell">{formatValue(reading.nitrogen)} ppm</div>
                              <div className="value-cell">{formatValue(reading.phosphorus)} ppm</div>
                              <div className="value-cell">{formatValue(reading.potassium)} ppm</div>
                              <div className="value-cell">{formatValue(reading.ph)}</div>
                              <div className="value-cell">{formatValue(reading.temperature)}°C</div>
                              <div className="value-cell">{formatValue(reading.humidity)}%</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Sensors