import React, { useState, useEffect } from 'react'
import Sidebar from './sidebar'
import './admindashboard.css'
import { collection, getDocs, query, orderBy, limit, where } from 'firebase/firestore'
import { db, realtimeDb } from '../firebase'
import { ref, get } from 'firebase/database'

const AdminDashboard = ({ userType = 'admin', user = null }) => {
  const [activeMenu, setActiveMenu] = useState('Overview')
  const [currentDateTime, setCurrentDateTime] = useState(new Date())
  const [timeFilter, setTimeFilter] = useState('week') // 'today', 'week', 'month', 'year'
  
  const [financialData, setFinancialData] = useState({
    totalRevenue: 0,
    totalExpenses: 0,
    netProfit: 0,
    simpleROI: 0,
    productionCosts: 0,
    harvestRevenue: 0,
    productionProfit: 0,
    productionROI: 0
  })
  
  const [productionStats, setProductionStats] = useState({
    totalPlants: 0,
    activePlants: 0,
    plantsWithCosting: 0,
    plantsNeedingCosting: 0,
    totalHarvests: 0,
    readyToHarvest: 0
  })
  
  const [allSensorData, setAllSensorData] = useState([])
  const [upcomingActivities, setUpcomingActivities] = useState([])
  const [recentHarvests, setRecentHarvests] = useState([])
  const [plants, setPlants] = useState([])
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [sensorsLoading, setSensorsLoading] = useState(true)

  // Update date and time every minute
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDateTime(new Date())
    }, 60000)
    return () => clearInterval(timer)
  }, [])

  // Get date range based on filter
  const getDateRange = () => {
    const now = new Date()
    let startDate = new Date()

    switch (timeFilter) {
      case 'today':
        startDate.setHours(0, 0, 0, 0)
        break
      case 'week':
        startDate.setDate(now.getDate() - 7)
        break
      case 'month':
        startDate.setMonth(now.getMonth() - 1)
        break
      case 'year':
        startDate.setFullYear(now.getFullYear() - 1)
        break
      default:
        startDate.setDate(now.getDate() - 7)
    }

    return { startDate, endDate: now }
  }

  // Check if date is within filter range
  const isWithinFilterRange = (date) => {
    if (!date) return false
    const { startDate, endDate } = getDateRange()
    const checkDate = new Date(date)
    return checkDate >= startDate && checkDate <= endDate
  }

  // Fetch all soil sensors from Firebase Realtime Database
  const fetchAllSensors = async () => {
    setSensorsLoading(true)
    try {
      const rootRef = ref(realtimeDb, '/')
      const snapshot = await get(rootRef)
      
      if (snapshot.exists()) {
        const allData = snapshot.val()
        const sensorsData = []
        
        // Find all SoilSensor keys
        Object.keys(allData).forEach(key => {
          if (key.startsWith('SoilSensor')) {
            const sensorData = allData[key]
            
            // Get latest reading
            let latestData = null
            let latestTimestamp = null
            
            Object.keys(sensorData).forEach(dataKey => {
              if (dataKey.includes('_') || dataKey.includes('-')) {
                if (!latestTimestamp || dataKey > latestTimestamp) {
                  latestTimestamp = dataKey
                  latestData = sensorData[dataKey]
                }
              }
            })
            
            if (!latestData) {
              latestData = sensorData
            }
            
            // Check if sensor is online (data within last 5 minutes)
            let isOnline = false
            let lastReadingTime = null
            let minutesAgo = null
            
            if (latestTimestamp) {
              const [datePart, timePart] = latestTimestamp.split('_')
              const [year, month, day] = datePart.split('-')
              const [hour, minute, second] = timePart.split(':')
              lastReadingTime = new Date(year, month - 1, day, hour, minute, second)
              
              const now = new Date()
              minutesAgo = Math.floor((now - lastReadingTime) / (1000 * 60))
              isOnline = minutesAgo <= 5
            }
            
            sensorsData.push({
              id: key,
              name: key.replace('SoilSensor', 'Soil Sensor '),
              nitrogen: latestData?.Nitrogen || latestData?.nitrogen || 0,
              phosphorus: latestData?.Phosphorus || latestData?.phosphorus || 0,
              potassium: latestData?.Potassium || latestData?.potassium || 0,
              ph: latestData?.pH || latestData?.ph || 7,
              moisture: latestData?.Moisture || latestData?.moisture || 0,
              temperature: latestData?.Temperature || latestData?.temperature || 0,
              conductivity: latestData?.Conductivity || latestData?.conductivity || 0,
              timestamp: latestTimestamp,
              lastReadingTime,
              minutesAgo,
              isOnline
            })
          }
        })
        
        setAllSensorData(sensorsData)
      }
    } catch (error) {
      console.error('Error fetching sensors:', error)
    } finally {
      setSensorsLoading(false)
    }
  }

  // Fetch plants
  const fetchPlants = async () => {
    try {
      const plantsSnapshot = await getDocs(collection(db, 'plants'))
      const plantsData = plantsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      setPlants(plantsData)
      return plantsData
    } catch (error) {
      console.error('Error fetching plants:', error)
      return []
    }
  }

  // Fetch events
  const fetchEvents = async () => {
    try {
      const eventsSnapshot = await getDocs(collection(db, 'events'))
      const eventsData = eventsSnapshot.docs.map(doc => {
        const data = doc.data()
        let eventDate = new Date()
        
        if (data.date) {
          eventDate = new Date(data.date)
        } else if (data.timestamp) {
          eventDate = data.timestamp?.toDate ? data.timestamp.toDate() : new Date(data.timestamp)
        }
        
        return {
          id: doc.id,
          ...data,
          eventDate,
          isAlert: data.type === 'alert' || data.createdBy === 'system',
          displayTitle: data.title || data.message || 'Untitled Event'
        }
      })
      
      setEvents(eventsData)
      return eventsData
    } catch (error) {
      console.error('Error fetching events:', error)
      return []
    }
  }

  // Generate upcoming activities
  const generateUpcomingActivities = (plantsData, eventsData) => {
    const activities = []
    const now = new Date()
    const { startDate, endDate } = getDateRange()

    // 1. Plants ready to harvest
    plantsData.forEach(plant => {
      if (plant.status === 'Harvested' || !plant.expectedHarvestDate) return
      
      const expectedDate = new Date(plant.expectedHarvestDate)
      const daysUntil = Math.ceil((expectedDate - now) / (1000 * 60 * 60 * 24))
      
      if (daysUntil >= 0 && daysUntil <= 7 && isWithinFilterRange(expectedDate)) {
        activities.push({
          type: 'harvest',
          priority: daysUntil <= 2 ? 'urgent' : 'high',
          icon: '🌾',
          title: `Harvest Ready: ${plant.plantName}`,
          subtitle: `Plot ${plant.plotNumber} • ${daysUntil} days`,
          date: expectedDate,
          status: 'pending',
          color: '#059669'
        })
      }
    })

    // 2. Plants needing production costing
    const plantsNeedingCosting = plantsData.filter(p => 
      p.status !== 'Harvested' && !p.hasCosting
    )
    
    if (plantsNeedingCosting.length > 0 && timeFilter !== 'today') {
      plantsNeedingCosting.slice(0, 3).forEach(plant => {
        activities.push({
          type: 'costing',
          priority: 'normal',
          icon: '💰',
          title: `Add Production Costing: ${plant.plantName}`,
          subtitle: `Plot ${plant.plotNumber}`,
          date: now,
          status: 'pending',
          color: '#f59e0b'
        })
      })
    }

    // 3. System alerts (soil issues)
    const systemAlerts = eventsData.filter(event => 
      event.isAlert && 
      (event.status === 'warning' || event.status === 'error' || event.status === 'pending') &&
      isWithinFilterRange(event.eventDate)
    )
    
    systemAlerts.forEach(alert => {
      activities.push({
        type: 'alert',
        priority: 'urgent',
        icon: '🚨',
        title: alert.displayTitle,
        subtitle: alert.plantName ? `${alert.plantName}` : 'System Alert',
        date: alert.eventDate,
        status: alert.status,
        color: '#ef4444',
        eventId: alert.id
      })
    })

    // 4. Upcoming lifecycle stages
    const upcomingStages = eventsData.filter(event => 
      event.type === 'LIFECYCLE_STAGE' && 
      new Date(event.eventDate) > now &&
      isWithinFilterRange(event.eventDate)
    )
    
    upcomingStages.forEach(stage => {
      const daysUntil = Math.ceil((new Date(stage.eventDate) - now) / (1000 * 60 * 60 * 24))
      activities.push({
        type: 'lifecycle',
        priority: daysUntil <= 3 ? 'high' : 'normal',
        icon: '🌱',
        title: stage.displayTitle,
        subtitle: stage.plantName || '',
        date: stage.eventDate,
        status: stage.status || 'info',
        color: '#10b981'
      })
    })

    // 5. Scheduled tasks (watering, fertilizing, etc.)
    const scheduledTasks = eventsData.filter(event => 
      ['WATERING', 'FERTILIZING', 'WEEDING', 'PEST_CONTROL', 'MAINTENANCE', 'PRUNING', 'OBSERVATION'].includes(event.type) &&
      event.status !== 'completed' &&
      event.status !== 'cancelled' &&
      isWithinFilterRange(event.eventDate)
    )
    
    scheduledTasks.forEach(task => {
      const taskDate = new Date(task.eventDate)
      const isPast = taskDate < now
      
      activities.push({
        type: task.type.toLowerCase(),
        priority: isPast ? 'urgent' : task.priority || 'normal',
        icon: getTaskIcon(task.type),
        title: task.displayTitle,
        subtitle: task.plantName || 'General task',
        date: taskDate,
        status: task.status,
        color: getTaskColor(task.type),
        eventId: task.id
      })
    })

    // Sort by priority and date
    const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 }
    activities.sort((a, b) => {
      if (a.priority !== b.priority) {
        return priorityOrder[a.priority] - priorityOrder[b.priority]
      }
      return new Date(a.date) - new Date(b.date)
    })

    return activities.slice(0, 15) // Limit to 15 activities
  }

  const getTaskIcon = (type) => {
    const icons = {
      'WATERING': '💧',
      'FERTILIZING': '🌿',
      'WEEDING': '🪴',
      'PEST_CONTROL': '🐛',
      'MAINTENANCE': '🔧',
      'PRUNING': '✂️',
      'OBSERVATION': '👁️',
      'HARVESTING': '🥬'
    }
    return icons[type] || '📋'
  }

  const getTaskColor = (type) => {
    const colors = {
      'WATERING': '#3b82f6',
      'FERTILIZING': '#8b5cf6',
      'WEEDING': '#f59e0b',
      'PEST_CONTROL': '#ef4444',
      'MAINTENANCE': '#6366f1',
      'PRUNING': '#ec4899',
      'OBSERVATION': '#06b6d4',
      'HARVESTING': '#059669'
    }
    return colors[type] || '#64748b'
  }

  // Fetch production statistics
  const fetchProductionStats = async (plantsData) => {
    try {
      const now = new Date()
      const { startDate } = getDateRange()
      
      const totalPlants = plantsData.length
      const activePlants = plantsData.filter(p => p.status !== 'Harvested').length
      const plantsWithCosting = plantsData.filter(p => p.hasCosting).length
      const plantsNeedingCosting = activePlants - plantsWithCosting
      
      const readyToHarvest = plantsData.filter(p => {
        if (p.status === 'Harvested' || !p.expectedHarvestDate) return false
        const expectedDate = new Date(p.expectedHarvestDate)
        const daysUntil = Math.ceil((expectedDate - now) / (1000 * 60 * 60 * 24))
        return daysUntil <= 7 && daysUntil >= 0
      }).length
      
      // Filter harvests by time range
      const harvestsSnapshot = await getDocs(collection(db, 'harvests'))
      const allHarvests = harvestsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      
      const filteredHarvests = allHarvests.filter(h => 
        isWithinFilterRange(h.harvestDate || h.createdAt)
      )
      
      setProductionStats({
        totalPlants,
        activePlants,
        plantsWithCosting,
        plantsNeedingCosting,
        totalHarvests: filteredHarvests.length,
        readyToHarvest
      })
    } catch (error) {
      console.error('Error fetching production stats:', error)
    }
  }

  // Fetch financial data with time filter
  const fetchFinancialData = async () => {
    try {
      const { startDate } = getDateRange()

      // Inventory-based financial data
      const inventorySnapshot = await getDocs(collection(db, 'inventory_log'))
      const logs = inventorySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate ? doc.data().timestamp.toDate() : new Date()
      })).filter(log => isWithinFilterRange(log.timestamp))

      let inventoryRevenue = 0
      let inventoryExpenses = 0

      logs.forEach(log => {
        const amount = (log.quantityChange || 0) * (log.costOrValuePerUnit || 0)
        
        if (log.type === 'Sale' || log.type === 'Stock Decrease') {
          inventoryRevenue += amount
        }
        
        if (log.type === 'Purchase' || log.type === 'Stock Increase' || log.type === 'Initial Stock') {
          inventoryExpenses += amount
        }
      })

      // Production costs (filtered by time)
      const costsSnapshot = await getDocs(collection(db, 'productionCosts'))
      const productionCosts = costsSnapshot.docs
        .filter(doc => isWithinFilterRange(doc.data().createdAt))
        .reduce((sum, doc) => sum + (doc.data().totalCost || 0), 0)

      // Harvest revenue (filtered by time)
      const harvestsSnapshot = await getDocs(collection(db, 'harvests'))
      const harvestRevenue = harvestsSnapshot.docs
        .filter(doc => isWithinFilterRange(doc.data().harvestDate || doc.data().createdAt))
        .reduce((sum, doc) => sum + (doc.data().totalRevenue || 0), 0)

      const productionProfit = harvestRevenue - productionCosts
      const productionROI = productionCosts > 0 ? ((productionProfit / productionCosts) * 100) : 0

      const totalRevenue = inventoryRevenue + harvestRevenue
      const totalExpenses = inventoryExpenses + productionCosts
      const netProfit = totalRevenue - totalExpenses
      const simpleROI = totalExpenses > 0 ? ((netProfit / totalExpenses) * 100) : 0

      setFinancialData({
        totalRevenue,
        totalExpenses,
        netProfit,
        simpleROI,
        productionCosts,
        harvestRevenue,
        productionProfit,
        productionROI
      })
    } catch (error) {
      console.error('Error fetching financial data:', error)
    }
  }

  // Fetch recent harvests
  const fetchRecentHarvests = async () => {
    try {
      const harvestsSnapshot = await getDocs(collection(db, 'harvests'))
      const allHarvests = harvestsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      
      const filtered = allHarvests
        .filter(h => isWithinFilterRange(h.harvestDate || h.createdAt))
        .sort((a, b) => new Date(b.harvestDate || b.createdAt) - new Date(a.harvestDate || a.createdAt))
        .slice(0, 5)
      
      setRecentHarvests(filtered)
    } catch (error) {
      console.error('Error fetching recent harvests:', error)
    }
  }

  // Load all data
  useEffect(() => {
    const loadAllData = async () => {
      setLoading(true)
      try {
        const [plantsData, eventsData] = await Promise.all([
          fetchPlants(),
          fetchEvents(),
          fetchAllSensors()
        ])
        
        await Promise.all([
          fetchFinancialData(),
          fetchProductionStats(plantsData),
          fetchRecentHarvests()
        ])
        
        const activities = generateUpcomingActivities(plantsData, eventsData)
        setUpcomingActivities(activities)
      } catch (error) {
        console.error('Error loading dashboard data:', error)
      } finally {
        setLoading(false)
      }
    }

    loadAllData()
    
    // Real-time updates every 30 seconds
    const interval = setInterval(() => {
      fetchAllSensors()
      fetchEvents().then(eventsData => {
        const activities = generateUpcomingActivities(plants, eventsData)
        setUpcomingActivities(activities)
      })
    }, 30000)
    
    return () => clearInterval(interval)
  }, [timeFilter]) // Re-fetch when filter changes

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
    if (user && user.name) return user.name
    if (user && user.firstName && user.lastName) return `${user.firstName} ${user.lastName}`
    if (user && user.username) return user.username
    return 'Admin'
  }

  // Get NPK status color
  const getNPKStatus = (nutrient, value) => {
    const optimalRanges = {
      nitrogen: { min: 30, max: 60 },
      phosphorus: { min: 30, max: 70 },
      potassium: { min: 60, max: 90 },
      ph: { min: 5.5, max: 7.0 }
    }

    const range = optimalRanges[nutrient]
    if (!range || value === null || value === undefined) return '#9E9E9E'

    if (value >= range.min && value <= range.max) return '#4CAF50'
    else if (value < range.min * 0.7 || value > range.max * 1.3) return '#F44336'
    else return '#FF9800'
  }

  const getQualityColor = (quality) => {
    switch (quality) {
      case 'A': return '#10b981'
      case 'B': return '#3b82f6'
      case 'C': return '#f59e0b'
      case 'D': return '#ef4444'
      default: return '#6b7280'
    }
  }

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'urgent': return '#ef4444'
      case 'high': return '#f59e0b'
      case 'normal': return '#3b82f6'
      case 'low': return '#64748b'
      default: return '#64748b'
    }
  }

  const getFilterLabel = () => {
    switch (timeFilter) {
      case 'today': return 'Today'
      case 'week': return 'This Week'
      case 'month': return 'This Month'
      case 'year': return 'This Year'
      default: return 'This Week'
    }
  }

  const statsCards = [
    {
      title: 'Total Revenue',
      amount: formatCurrency(financialData.totalRevenue),
      subtitle: `Harvests: ${formatCurrency(financialData.harvestRevenue)}`,
      color: '#4CAF50',
      bgColor: '#E8F5E9',
      icon: '💰'
    },
    {
      title: 'Total Expenses',
      amount: formatCurrency(financialData.totalExpenses),
      subtitle: `Production: ${formatCurrency(financialData.productionCosts)}`,
      color: '#F44336',
      bgColor: '#FFEBEE',
      icon: '💸'
    },
    {
      title: 'Net Profit',
      amount: formatCurrency(financialData.netProfit),
      subtitle: `Production: ${formatCurrency(financialData.productionProfit)}`,
      color: financialData.netProfit >= 0 ? '#4CAF50' : '#F44336',
      bgColor: financialData.netProfit >= 0 ? '#E8F5E9' : '#FFEBEE',
      icon: '📈'
    },
    {
      title: 'Average ROI',
      amount: `${financialData.simpleROI.toFixed(1)}%`,
      subtitle: `Production: ${financialData.productionROI.toFixed(1)}%`,
      color: '#2196F3',
      bgColor: '#E3F2FD',
      icon: '📊'
    }
  ]

  const productionCards = [
    {
      title: 'Total Plants',
      value: productionStats.totalPlants,
      icon: '🌱',
      color: '#4CAF50'
    },
    {
      title: 'Active Plants',
      value: productionStats.activePlants,
      icon: '🌿',
      color: '#2196F3'
    },
    {
      title: 'Ready to Harvest',
      value: productionStats.readyToHarvest,
      icon: '🌾',
      color: '#FF9800',
      alert: productionStats.readyToHarvest > 0
    },
    {
      title: 'Need Costing',
      value: productionStats.plantsNeedingCosting,
      icon: '⚠️',
      color: '#F44336',
      alert: productionStats.plantsNeedingCosting > 0
    },
    {
      title: 'Total Harvests',
      value: productionStats.totalHarvests,
      icon: '✅',
      color: '#9C27B0'
    },
    {
      title: 'With Costing',
      value: productionStats.plantsWithCosting,
      icon: '💵',
      color: '#00BCD4'
    }
  ]

  return (
    <div className="dashboard-container">
      <Sidebar 
        activeMenu={activeMenu}
        setActiveMenu={setActiveMenu}
        userType={userType}
      />

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
            {/* Time Filter */}
            <div className="time-filter-container">
              <label className="filter-label">📅 Period:</label>
              <select 
                className="time-filter-select"
                value={timeFilter}
                onChange={(e) => setTimeFilter(e.target.value)}
              >
                <option value="today">Today</option>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
                <option value="year">This Year</option>
              </select>
            </div>
            
            <div className="search-container-ad">
              <input
                type="text"
                placeholder="Search..."
                className="search-input-ad"
              />
              <div className="search-icon-ad">🔍</div>
            </div>
            
            <div className="notification-icon">
              🔔
              {(productionStats.readyToHarvest > 0 || productionStats.plantsNeedingCosting > 0 || 
                upcomingActivities.filter(a => a.priority === 'urgent').length > 0) && (
                <span className="notification-badge"></span>
              )}
            </div>
          </div>
        </div>

        {/* Filter Info Banner */}
        <div className="filter-info-banner">
          <span className="filter-icon">📊</span>
          <span className="filter-text">
            Showing data for: <strong>{getFilterLabel()}</strong>
          </span>
          {loading && <span className="loading-indicator-small">Updating...</span>}
        </div>

        {/* Financial Stats Cards */}
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
                {card.subtitle && (
                  <p className="stat-subtitle">{card.subtitle}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Production Stats */}
        <div className="production-stats-section">
          <h2 className="section-heading">🌱 Production Overview</h2>
          <div className="production-stats-grid">
            {productionCards.map((card, index) => (
              <div 
                key={index} 
                className={`production-stat-card ${card.alert ? 'alert-card' : ''}`}
              >
                <div className="production-stat-icon" style={{ color: card.color }}>
                  {card.icon}
                </div>
                <div className="production-stat-content">
                  <p className="production-stat-value">{card.value}</p>
                  <p className="production-stat-title">{card.title}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Content Grid */}
        <div className="content-grid">
          {/* Upcoming Activities */}
          <div className="content-card activities-card">
            <div className="card-header-with-badge">
              <h3 className="card-title">📅 Upcoming Activities</h3>
              <span className="activity-count-badge">
                {upcomingActivities.length}
              </span>
            </div>
            <div className="activities-list">
              {loading ? (
                <div className="activity-item-loading">Loading activities...</div>
              ) : upcomingActivities.length === 0 ? (
                <div className="no-activities">
                  <span className="no-activities-icon">✨</span>
                  <p>No upcoming activities for {getFilterLabel().toLowerCase()}</p>
                </div>
              ) : (
                upcomingActivities.map((activity, index) => (
                  <div 
                    key={index} 
                    className={`activity-item priority-${activity.priority}`}
                    style={{ borderLeftColor: activity.color }}
                  >
                    <div className="activity-icon-badge" style={{ backgroundColor: activity.color }}>
                      {activity.icon}
                    </div>
                    <div className="activity-content">
                      <div className="activity-header">
                        <span className="activity-title">{activity.title}</span>
                        <span 
                          className="activity-priority"
                          style={{ backgroundColor: getPriorityColor(activity.priority) }}
                        >
                          {activity.priority}
                        </span>
                      </div>
                      <p className="activity-subtitle">{activity.subtitle}</p>
                      <div className="activity-footer">
                        <span className="activity-date">
                          📅 {new Date(activity.date).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: activity.type !== 'costing' ? '2-digit' : undefined,
                            minute: activity.type !== 'costing' ? '2-digit' : undefined
                          })}
                        </span>
                        <span 
                          className="activity-status"
                          style={{ 
                            backgroundColor: activity.status === 'pending' ? '#f59e0b' : 
                                           activity.status === 'warning' ? '#ef4444' : '#3b82f6'
                          }}
                        >
                          {activity.status}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Recent Harvests */}
          <div className="content-card harvests-card">
            <h3 className="card-title">🌾 Recent Harvests</h3>
            <div className="harvests-list">
              {loading ? (
                <div className="harvest-item">Loading harvests...</div>
              ) : recentHarvests.length === 0 ? (
                <div className="no-harvests">
                  <span className="no-harvests-icon">🌾</span>
                  <p>No harvests recorded for {getFilterLabel().toLowerCase()}</p>
                </div>
              ) : (
                recentHarvests.map((harvest) => (
                  <div key={harvest.id} className="harvest-item">
                    <div className="harvest-header">
                      <strong>{harvest.plantName}</strong>
                      <span 
                        className="harvest-quality"
                        style={{ backgroundColor: getQualityColor(harvest.quality) }}
                      >
                        Grade {harvest.quality}
                      </span>
                    </div>
                    <div className="harvest-details">
                      <span className="harvest-yield">
                        📦 {harvest.actualYield} {harvest.yieldUnit}
                      </span>
                      <span className={harvest.profit >= 0 ? 'profit-positive' : 'profit-negative'}>
                        {harvest.profit >= 0 ? '📈' : '📉'} {formatCurrency(harvest.profit || 0)}
                      </span>
                    </div>
                    {harvest.roi !== undefined && (
                      <div className="harvest-roi">
                        ROI: <strong style={{ color: harvest.roi >= 0 ? '#10b981' : '#ef4444' }}>
                          {harvest.roi.toFixed(1)}%
                        </strong>
                      </div>
                    )}
                    <div className="harvest-date">
                      📅 {harvest.harvestDate ? new Date(harvest.harvestDate).toLocaleDateString() : 'N/A'}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* All Soil Sensors - Real-Time Tracking */}
          <div className="content-card sensors-card full-width">
            <div className="sensors-header">
              <div className="sensors-title-section">
                <h3 className="card-title">
                  🌡️ All Soil Sensors - Real-Time Monitoring
                </h3>
                {sensorsLoading ? (
                  <span className="loading-indicator-small">Updating...</span>
                ) : (
                  <span className="sensors-count">
                    {allSensorData.filter(s => s.isOnline).length} of {allSensorData.length} sensors online
                  </span>
                )}
              </div>
              <div className="sensors-legend">
                <div className="legend-item">
                  <span className="legend-dot" style={{ backgroundColor: '#4CAF50' }}></span>
                  <span>Optimal</span>
                </div>
                <div className="legend-item">
                  <span className="legend-dot" style={{ backgroundColor: '#FF9800' }}></span>
                  <span>Warning</span>
                </div>
                <div className="legend-item">
                  <span className="legend-dot" style={{ backgroundColor: '#F44336' }}></span>
                  <span>Critical</span>
                </div>
                <div className="legend-item">
                  <span className="legend-dot" style={{ backgroundColor: '#9E9E9E' }}></span>
                  <span>Offline</span>
                </div>
              </div>
            </div>

            {sensorsLoading ? (
              <div className="sensors-loading">
                <div className="loading-spinner">🔄</div>
                <p>Loading sensor data...</p>
              </div>
            ) : allSensorData.length === 0 ? (
              <div className="no-sensors">
                <span className="no-sensors-icon">📡</span>
                <p>No soil sensors found</p>
                <small>Please check your Firebase Realtime Database connection</small>
              </div>
            ) : (
              <div className="sensors-grid">
                {allSensorData.map((sensor) => (
                  <div 
                    key={sensor.id} 
                    className={`sensor-card ${!sensor.isOnline ? 'sensor-offline' : ''}`}
                  >
                    <div className="sensor-card-header">
                      <div className="sensor-name">
                        <span className="sensor-icon">📡</span>
                        <strong>{sensor.name}</strong>
                      </div>
                      <div className={`sensor-status ${sensor.isOnline ? 'online' : 'offline'}`}>
                        <span className="status-dot"></span>
                        {sensor.isOnline ? 'Online' : 'Offline'}
                      </div>
                    </div>

                    {sensor.isOnline ? (
                      <>
                        <div className="sensor-readings">
                          {/* NPK Readings */}
                          <div className="reading-row">
                            <div className="reading-item">
                              <span className="reading-label">🍃 Nitrogen (N)</span>
                              <div className="reading-bar-container">
                                <div 
                                  className="reading-bar"
                                  style={{ 
                                    width: `${Math.min((sensor.nitrogen / 100) * 100, 100)}%`,
                                    backgroundColor: getNPKStatus('nitrogen', sensor.nitrogen)
                                  }}
                                ></div>
                              </div>
                              <span 
                                className="reading-value"
                                style={{ color: getNPKStatus('nitrogen', sensor.nitrogen) }}
                              >
                                {sensor.nitrogen} ppm
                              </span>
                            </div>
                          </div>

                          <div className="reading-row">
                            <div className="reading-item">
                              <span className="reading-label">🌿 Phosphorus (P)</span>
                              <div className="reading-bar-container">
                                <div 
                                  className="reading-bar"
                                  style={{ 
                                    width: `${Math.min((sensor.phosphorus / 100) * 100, 100)}%`,
                                    backgroundColor: getNPKStatus('phosphorus', sensor.phosphorus)
                                  }}
                                ></div>
                              </div>
                              <span 
                                className="reading-value"
                                style={{ color: getNPKStatus('phosphorus', sensor.phosphorus) }}
                              >
                                {sensor.phosphorus} ppm
                              </span>
                            </div>
                          </div>

                          <div className="reading-row">
                            <div className="reading-item">
                              <span className="reading-label">🌸 Potassium (K)</span>
                              <div className="reading-bar-container">
                                <div 
                                  className="reading-bar"
                                  style={{ 
                                    width: `${Math.min((sensor.potassium / 100) * 100, 100)}%`,
                                    backgroundColor: getNPKStatus('potassium', sensor.potassium)
                                  }}
                                ></div>
                              </div>
                              <span 
                                className="reading-value"
                                style={{ color: getNPKStatus('potassium', sensor.potassium) }}
                              >
                                {sensor.potassium} ppm
                              </span>
                            </div>
                          </div>

                          <div className="reading-row">
                            <div className="reading-item">
                              <span className="reading-label">🔬 pH Level</span>
                              <div className="reading-bar-container">
                                <div 
                                  className="reading-bar"
                                  style={{ 
                                    width: `${Math.min((sensor.ph / 14) * 100, 100)}%`,
                                    backgroundColor: getNPKStatus('ph', sensor.ph)
                                  }}
                                ></div>
                              </div>
                              <span 
                                className="reading-value"
                                style={{ color: getNPKStatus('ph', sensor.ph) }}
                              >
                                {sensor.ph.toFixed(2)}
                              </span>
                            </div>
                          </div>

                          {/* Environmental Readings */}
                          <div className="environmental-readings">
                            <div className="env-reading">
                              <span className="env-icon">💧</span>
                              <div className="env-info">
                                <span className="env-label">Moisture</span>
                                <span className="env-value">{sensor.moisture}%</span>
                              </div>
                            </div>
                            <div className="env-reading">
                              <span className="env-icon">🌡️</span>
                              <div className="env-info">
                                <span className="env-label">Temperature</span>
                                <span className="env-value">{sensor.temperature}°C</span>
                              </div>
                            </div>
                            <div className="env-reading">
                              <span className="env-icon">⚡</span>
                              <div className="env-info">
                                <span className="env-label">Conductivity</span>
                                <span className="env-value">{sensor.conductivity} µS/cm</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="sensor-footer">
                          <span className="sensor-update-time">
                            🕐 Updated {sensor.minutesAgo} min ago
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="sensor-offline-message">
                        <span className="offline-icon">📵</span>
                        <p>Sensor offline</p>
                        {sensor.lastReadingTime && (
                          <small>Last seen: {sensor.minutesAgo} minutes ago</small>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default AdminDashboard