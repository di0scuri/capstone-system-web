import React, { useState, useEffect } from 'react'
import Sidebar from './sidebar'
import './admindashboard.css'
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore'
import { db } from '../firebase'

const AdminDashboard = ({ userType = 'admin', user = null }) => {
  const [activeMenu, setActiveMenu] = useState('Overview')
  const [currentDateTime, setCurrentDateTime] = useState(new Date())
  const [financialData, setFinancialData] = useState({
    totalRevenue: 0,
    totalExpenses: 0,
    netProfit: 0,
    simpleROI: 0
  })
  const [sensorData, setSensorData] = useState([])
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)

  // Update date and time every minute
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDateTime(new Date())
    }, 60000) // Update every minute

    return () => clearInterval(timer)
  }, [])

  // Fetch financial data from inventory_log
  const fetchFinancialData = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'inventory_log'))
      const logs = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate ? doc.data().timestamp.toDate() : new Date()
      }))

      let totalRevenue = 0
      let totalExpenses = 0

      logs.forEach(log => {
        const amount = (log.quantityChange || 0) * (log.costOrValuePerUnit || 0)
        
        // Revenue: Sales, Stock Decrease (assuming sales)
        if (log.type === 'Sale' || log.type === 'Stock Decrease') {
          totalRevenue += amount
        }
        
        // Expenses: Purchases, Stock Increase, Initial Stock
        if (log.type === 'Purchase' || log.type === 'Stock Increase' || log.type === 'Initial Stock') {
          totalExpenses += amount
        }
      })

      const netProfit = totalRevenue - totalExpenses
      const simpleROI = totalExpenses > 0 ? ((netProfit / totalExpenses) * 100) : 0

      setFinancialData({
        totalRevenue,
        totalExpenses,
        netProfit,
        simpleROI
      })
    } catch (error) {
      console.error('Error fetching financial data:', error)
    }
  }

  // Fetch events data
  const fetchEvents = async () => {
    try {
      const eventsQuery = query(
        collection(db, 'events'),
        orderBy('timestamp', 'desc'),
        limit(5)
      )
      const querySnapshot = await getDocs(eventsQuery)
      const eventsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate ? doc.data().timestamp.toDate() : new Date(),
        createdAt: doc.data().createdAt?.toDate ? doc.data().createdAt.toDate() : new Date()
      }))

      setEvents(eventsData)
    } catch (error) {
      console.error('Error fetching events:', error)
    }
  }

  // Fetch sensor readings data
  const fetchSensorData = async () => {
    try {
      const sensorQuery = query(
        collection(db, 'sensorReadings'),
        orderBy('timestamp', 'desc'),
        limit(10)
      )
      const querySnapshot = await getDocs(sensorQuery)
      const readings = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate ? doc.data().timestamp.toDate() : new Date()
      }))

      // Group by plantId to get latest reading for each plant
      const latestReadings = {}
      readings.forEach(reading => {
        if (reading.plantId && (!latestReadings[reading.plantId] || 
            reading.timestamp > latestReadings[reading.plantId].timestamp)) {
          latestReadings[reading.plantId] = reading
        }
      })

      setSensorData(Object.values(latestReadings))
    } catch (error) {
      console.error('Error fetching sensor data:', error)
    }
  }

  // Load all data
  useEffect(() => {
    const loadAllData = async () => {
      setLoading(true)
      try {
        await Promise.all([
          fetchFinancialData(),
          fetchEvents(),
          fetchSensorData()
        ])
      } catch (error) {
        console.error('Error loading dashboard data:', error)
      } finally {
        setLoading(false)
      }
    }

    loadAllData()
    
    // Set up real-time updates every 30 seconds
    const interval = setInterval(() => {
      fetchSensorData()
      fetchEvents()
    }, 30000)
    
    return () => clearInterval(interval)
  }, [])

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2
    }).format(amount)
  }

  // Format date and time
  const formatDateTime = (date) => {
    const options = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }
    return date.toLocaleDateString('en-US', options)
  }

  // Get user greeting name
  const getUserName = () => {
    if (user && user.name) {
      return user.name
    }
    if (user && user.firstName && user.lastName) {
      return `${user.firstName} ${user.lastName}`
    }
    if (user && user.username) {
      return user.username
    }
    return 'Admin' // Fallback
  }

  const statsCards = [
    {
      title: 'Total Revenue',
      amount: formatCurrency(financialData.totalRevenue),
      color: '#4CAF50',
      bgColor: '#E8F5E9',
      icon: '💰'
    },
    {
      title: 'Total Expenses',
      amount: formatCurrency(financialData.totalExpenses),
      color: '#F44336',
      bgColor: '#FFEBEE',
      icon: '💸'
    },
    {
      title: 'Net Profit',
      amount: formatCurrency(financialData.netProfit),
      color: financialData.netProfit >= 0 ? '#4CAF50' : '#F44336',
      bgColor: financialData.netProfit >= 0 ? '#E8F5E9' : '#FFEBEE',
      icon: '📈'
    },
    {
      title: 'Simple ROI',
      amount: `${financialData.simpleROI.toFixed(1)}%`,
      color: '#2196F3',
      bgColor: '#E3F2FD',
      icon: '📊'
    }
  ]

  // Generate tasks from events
  const generateTasks = () => {
    const tasks = events.slice(0, 5).map(event => {
      if (event.type === 'LIFECYCLE_STAGE' && event.message) {
        return event.message
      }
      return `Check ${event.plantId || 'plant'} - ${event.status || event.type || 'update'}`
    })

    // Add some default tasks if no events
    if (tasks.length === 0) {
      return [
        'Water the plants in greenhouse',
        'Check NPK levels in all sensors',
        'Monitor temperature and humidity',
        'Review inventory levels',
        'Update plant growth stages'
      ]
    }

    return tasks
  }

  // Get NPK status color based on optimal ranges
  const getNPKStatus = (nutrient, value) => {
    const optimalRanges = {
      nitrogen: { min: 30, max: 60 },
      phosphorus: { min: 30, max: 70 },
      potassium: { min: 60, max: 90 },
      ph: { min: 5.5, max: 7.0 }
    }

    const range = optimalRanges[nutrient]
    if (!range || value === null || value === undefined) {
      return '#9E9E9E' // Gray for unknown
    }

    if (value >= range.min && value <= range.max) {
      return '#4CAF50' // Green - optimal
    } else if (value < range.min * 0.7 || value > range.max * 1.3) {
      return '#F44336' // Red - critical
    } else {
      return '#FF9800' // Orange - warning
    }
  }

  // Get plant name from plantId (you might want to fetch this from plants collection)
  const getPlantDisplayName = (plantId) => {
    // This is a simplified version - you could enhance this by fetching plant names
    return plantId ? `Plant ${plantId.substring(0, 8)}` : 'Unknown Plant'
  }

  const tasks = generateTasks()

  return (
    <div className="dashboard-container">
      {/* Sidebar Component */}
      <Sidebar 
        activeMenu={activeMenu}
        setActiveMenu={setActiveMenu}
        userType={userType}
      />

      {/* Main Content */}
      <div className="main-content">
        {/* Header */}
        <div className="dashboard-header">
          <div className="header-left">
            <h1>Hello, {getUserName()}!</h1>
            <p className="date-text">{formatDateTime(currentDateTime)}</p>
            <p className="time-text">{currentDateTime.toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit'
            })}</p>
          </div>
          <div className="header-right">
            <div className="search-container-ad">
              <input
                type="text"
                placeholder="Search..."
                className="search-input-ad"
              />
              <div className="search-icon-ad">🔍</div>
            </div>
            <div className="notification-icon">🔔</div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="stats-grid">
          {statsCards.map((card, index) => (
            <div key={index} className="stat-card">
              <div 
                className="stat-icon" 
                style={{ 
                  backgroundColor: card.bgColor,
                  color: card.color 
                }}
              >
                {card.icon}
              </div>
              <div className="stat-content">
                <h3 className="stat-title">{card.title}</h3>
                <p className="stat-amount">{card.amount}</p>
                {loading && index < 3 && (
                  <div className="loading-indicator">Loading...</div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Content Grid */}
        <div className="content-grid">
          {/* Upcoming Events/Tasks */}
          <div className="content-card tasks-card">
            <h3 className="card-title">Recent Events & Tasks</h3>
            <div className="tasks-list">
              {loading ? (
                <div className="task-item">Loading events...</div>
              ) : tasks.length === 0 ? (
                <div className="task-item">No recent events</div>
              ) : (
                tasks.map((task, index) => (
                  <div key={index} className="task-item">
                    <div className="task-checkbox"></div>
                    <span className="task-text">{task}</span>
                  </div>
                ))
              )}
            </div>
            {events.length > 0 && (
              <div className="events-summary">
                <small>
                  Latest event: {events[0]?.timestamp?.toLocaleString() || 'Unknown'}
                </small>
              </div>
            )}
          </div>

          {/* NPK Chart */}
          <div className="content-card chart-card">
            <div className="chart-header">
              <h3 className="card-title">
                NPK & pH Level For Each Plant
                {loading && <span className="loading-indicator"> (Loading...)</span>}
              </h3>
              <div className="chart-legend">
                <div className="legend-item">
                  <span className="legend-color nitrogen"></span>
                  <span>Nitrogen (ppm)</span>
                </div>
                <div className="legend-item">
                  <span className="legend-color phosphorus"></span>
                  <span>Phosphorus (ppm)</span>
                </div>
                <div className="legend-item">
                  <span className="legend-color potassium"></span>
                  <span>Potassium (ppm)</span>
                </div>
                <div className="legend-item">
                  <span className="legend-color ph"></span>
                  <span>pH Level</span>
                </div>
              </div>
              <div className="last-update">
                Last updated: {sensorData.length > 0 ? 
                  sensorData[0].timestamp.toLocaleTimeString() : 
                  'No data'
                }
              </div>
            </div>
            <div className="chart-container">
              {loading ? (
                <div className="chart-loading">Loading sensor data...</div>
              ) : sensorData.length === 0 ? (
                <div className="chart-loading">No sensor data available</div>
              ) : (
                <div className="chart-bars">
                  {sensorData.map((data, index) => (
                    <div key={data.id} className="bar-group">
                      <div className="bars">
                        <div 
                          className="bar nitrogen-bar" 
                          style={{ 
                            height: `${Math.min((data.nitrogen / 100) * 100, 100)}%`,
                            backgroundColor: getNPKStatus('nitrogen', data.nitrogen)
                          }}
                          title={`Nitrogen: ${data.nitrogen || 0} ppm`}
                        ></div>
                        <div 
                          className="bar phosphorus-bar" 
                          style={{ 
                            height: `${Math.min((data.phosphorus / 100) * 100, 100)}%`,
                            backgroundColor: getNPKStatus('phosphorus', data.phosphorus)
                          }}
                          title={`Phosphorus: ${data.phosphorus || 0} ppm`}
                        ></div>
                        <div 
                          className="bar potassium-bar" 
                          style={{ 
                            height: `${Math.min((data.potassium / 100) * 100, 100)}%`,
                            backgroundColor: getNPKStatus('potassium', data.potassium)
                          }}
                          title={`Potassium: ${data.potassium || 0} ppm`}
                        ></div>
                        <div 
                          className="bar ph-bar" 
                          style={{ 
                            height: `${Math.min(((data.ph || 0) / 10) * 100, 100)}%`,
                            backgroundColor: getNPKStatus('ph', data.ph)
                          }}
                          title={`pH: ${data.ph || 0}`}
                        ></div>
                      </div>
                      <span className="bar-label">
                        {getPlantDisplayName(data.plantId)}
                        <br />
                        <small>
                          {data.timestamp.toLocaleDateString()}
                          <br />
                          T: {data.temperature || 0}°C | H: {data.humidity || 0}%
                        </small>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AdminDashboard