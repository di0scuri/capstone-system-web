import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db, realtimeDb } from '../firebase';
import { collection, getDocs, query, orderBy, limit, where } from 'firebase/firestore';
import { ref, get } from 'firebase/database';
import FarmerSidebar from './farmersidebar';
import './farmerdashboard.css';

const FarmerDashboard = ({ userType = 'farmer' }) => {
  // Authentication state
  const [authLoading, setAuthLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const navigate = useNavigate();

  // Dashboard state
  const [activeMenu, setActiveMenu] = useState('Overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [timeFilter, setTimeFilter] = useState('week'); // 'today', 'week', 'month', 'year'
  
  // Data states
  const [allSensorData, setAllSensorData] = useState([]);
  const [sensorsLoading, setSensorsLoading] = useState(true);
  const [upcomingActivities, setUpcomingActivities] = useState([]);
  const [plants, setPlants] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  // Production stats
  const [productionStats, setProductionStats] = useState({
    myActivePlants: 0,
    readyToHarvest: 0,
    totalHarvests: 0,
    avgYield: 0
  });

  // Recent harvests
  const [recentHarvests, setRecentHarvests] = useState([]);

  // Authentication check
  useEffect(() => {
    console.log('Setting up authentication listener...');
    
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      console.log('Auth state changed:', user ? 'User logged in' : 'No user');
      
      if (user) {
        console.log('User authenticated:', user.email);
        setCurrentUser(user);
        setAuthenticated(true);
        
        const userRole = localStorage.getItem('userRole');
        console.log('User role from localStorage:', userRole);
        
        if (userRole !== 'farmer') {
          console.warn('User role mismatch. Expected: farmer, Got:', userRole);
        }
      } else {
        console.log('No authenticated user, redirecting to login...');
        setAuthenticated(false);
        navigate('/user-selection', { replace: true });
      }
      
      setAuthLoading(false);
    });

    return () => {
      console.log('Cleaning up auth listener');
      unsubscribe();
    };
  }, [navigate]);

  // Update time every minute
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  // Get date range based on filter
  const getDateRange = () => {
    const now = new Date();
    let startDate = new Date();

    switch (timeFilter) {
      case 'today':
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'week':
        startDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(now.getMonth() - 1);
        break;
      case 'year':
        startDate.setFullYear(now.getFullYear() - 1);
        break;
      default:
        startDate.setDate(now.getDate() - 7);
    }

    return { startDate, endDate: now };
  };

  // Check if date is within filter range
  const isWithinFilterRange = (date) => {
    if (!date) return false;
    const { startDate, endDate } = getDateRange();
    const checkDate = new Date(date);
    return checkDate >= startDate && checkDate <= endDate;
  };

  // Fetch all soil sensors from Firebase Realtime Database
  const fetchAllSensors = async () => {
    setSensorsLoading(true);
    try {
      const rootRef = ref(realtimeDb, '/');
      const snapshot = await get(rootRef);
      
      if (snapshot.exists()) {
        const allData = snapshot.val();
        const sensorsData = [];
        
        Object.keys(allData).forEach(key => {
          if (key.startsWith('SoilSensor')) {
            const sensorData = allData[key];
            
            let latestData = null;
            let latestTimestamp = null;
            
            Object.keys(sensorData).forEach(dataKey => {
              if (dataKey.includes('_') || dataKey.includes('-')) {
                if (!latestTimestamp || dataKey > latestTimestamp) {
                  latestTimestamp = dataKey;
                  latestData = sensorData[dataKey];
                }
              }
            });
            
            if (!latestData) {
              latestData = sensorData;
            }
            
            let isOnline = false;
            let lastReadingTime = null;
            let minutesAgo = null;
            
            if (latestTimestamp) {
              const [datePart, timePart] = latestTimestamp.split('_');
              const [year, month, day] = datePart.split('-');
              const [hour, minute, second] = timePart.split(':');
              lastReadingTime = new Date(year, month - 1, day, hour, minute, second);
              
              const now = new Date();
              minutesAgo = Math.floor((now - lastReadingTime) / (1000 * 60));
              isOnline = minutesAgo <= 5;
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
            });
          }
        });
        
        setAllSensorData(sensorsData);
      }
    } catch (error) {
      console.error('Error fetching sensors:', error);
    } finally {
      setSensorsLoading(false);
    }
  };

  // Fetch plants
  const fetchPlants = async () => {
    try {
      const plantsSnapshot = await getDocs(collection(db, 'plants'));
      const plantsData = plantsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setPlants(plantsData);
      return plantsData;
    } catch (error) {
      console.error('Error fetching plants:', error);
      return [];
    }
  };

  // Fetch events
  const fetchEvents = async () => {
    try {
      const eventsSnapshot = await getDocs(collection(db, 'events'));
      const eventsData = eventsSnapshot.docs.map(doc => {
        const data = doc.data();
        let eventDate = new Date();
        
        if (data.date) {
          eventDate = new Date(data.date);
        } else if (data.timestamp) {
          eventDate = data.timestamp?.toDate ? data.timestamp.toDate() : new Date(data.timestamp);
        }
        
        return {
          id: doc.id,
          ...data,
          eventDate,
          isAlert: data.type === 'alert' || data.createdBy === 'system',
          displayTitle: data.title || data.message || 'Untitled Event'
        };
      });
      
      setEvents(eventsData);
      return eventsData;
    } catch (error) {
      console.error('Error fetching events:', error);
      return [];
    }
  };

  // Task icons and colors
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
    };
    return icons[type] || '📋';
  };

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
    };
    return colors[type] || '#64748b';
  };

  // Generate upcoming activities
  const generateUpcomingActivities = (plantsData, eventsData) => {
    const activities = [];
    const now = new Date();

    // 1. Plants ready to harvest
    plantsData.forEach(plant => {
      if (plant.status === 'Harvested' || !plant.expectedHarvestDate) return;
      
      const expectedDate = new Date(plant.expectedHarvestDate);
      const daysUntil = Math.ceil((expectedDate - now) / (1000 * 60 * 60 * 24));
      
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
        });
      }
    });

    // 2. System alerts (soil issues)
    const systemAlerts = eventsData.filter(event => 
      event.isAlert && 
      (event.status === 'warning' || event.status === 'error' || event.status === 'pending') &&
      isWithinFilterRange(event.eventDate)
    );
    
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
      });
    });

    // 3. Upcoming lifecycle stages
    const upcomingStages = eventsData.filter(event => 
      event.type === 'LIFECYCLE_STAGE' && 
      new Date(event.eventDate) > now &&
      isWithinFilterRange(event.eventDate)
    );
    
    upcomingStages.forEach(stage => {
      const daysUntil = Math.ceil((new Date(stage.eventDate) - now) / (1000 * 60 * 60 * 24));
      activities.push({
        type: 'lifecycle',
        priority: daysUntil <= 3 ? 'high' : 'normal',
        icon: '🌱',
        title: stage.displayTitle,
        subtitle: stage.plantName || '',
        date: stage.eventDate,
        status: stage.status || 'info',
        color: '#10b981'
      });
    });

    // 4. Scheduled tasks
    const scheduledTasks = eventsData.filter(event => 
      ['WATERING', 'FERTILIZING', 'WEEDING', 'PEST_CONTROL', 'MAINTENANCE', 'PRUNING', 'OBSERVATION'].includes(event.type) &&
      event.status !== 'completed' &&
      event.status !== 'cancelled' &&
      isWithinFilterRange(event.eventDate)
    );
    
    scheduledTasks.forEach(task => {
      const taskDate = new Date(task.eventDate);
      const isPast = taskDate < now;
      
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
      });
    });

    // Sort by priority and date
    const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
    activities.sort((a, b) => {
      if (a.priority !== b.priority) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      return new Date(a.date) - new Date(b.date);
    });

    return activities.slice(0, 10);
  };

  // Fetch production statistics
  const fetchProductionStats = async (plantsData) => {
    try {
      const now = new Date();
      
      const myActivePlants = plantsData.filter(p => p.status !== 'Harvested').length;
      
      const readyToHarvest = plantsData.filter(p => {
        if (p.status === 'Harvested' || !p.expectedHarvestDate) return false;
        const expectedDate = new Date(p.expectedHarvestDate);
        const daysUntil = Math.ceil((expectedDate - now) / (1000 * 60 * 60 * 24));
        return daysUntil <= 7 && daysUntil >= 0;
      }).length;
      
      // Filter harvests by time range
      const harvestsSnapshot = await getDocs(collection(db, 'harvests'));
      const allHarvests = harvestsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      const filteredHarvests = allHarvests.filter(h => 
        isWithinFilterRange(h.harvestDate || h.createdAt)
      );
      
      const totalHarvests = filteredHarvests.length;
      const avgYield = totalHarvests > 0 
        ? filteredHarvests.reduce((sum, h) => sum + (h.actualYield || 0), 0) / totalHarvests 
        : 0;
      
      setProductionStats({
        myActivePlants,
        readyToHarvest,
        totalHarvests,
        avgYield: avgYield.toFixed(1)
      });
    } catch (error) {
      console.error('Error fetching production stats:', error);
    }
  };

  // Fetch recent harvests
  const fetchRecentHarvests = async () => {
    try {
      const harvestsSnapshot = await getDocs(collection(db, 'harvests'));
      const allHarvests = harvestsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      const filtered = allHarvests
        .filter(h => isWithinFilterRange(h.harvestDate || h.createdAt))
        .sort((a, b) => new Date(b.harvestDate || b.createdAt) - new Date(a.harvestDate || a.createdAt))
        .slice(0, 3);
      
      setRecentHarvests(filtered);
    } catch (error) {
      console.error('Error fetching recent harvests:', error);
      setRecentHarvests([]);
    }
  };

  // Fetch all data
  useEffect(() => {
    if (!authenticated || authLoading) {
      console.log('Waiting for authentication before fetching data...');
      return;
    }

    console.log('Authentication confirmed, fetching dashboard data...');

    const fetchAllData = async () => {
      setLoading(true);
      try {
        const [plantsData, eventsData] = await Promise.all([
          fetchPlants(),
          fetchEvents(),
          fetchAllSensors()
        ]);
        
        await Promise.all([
          fetchProductionStats(plantsData),
          fetchRecentHarvests()
        ]);
        
        const activities = generateUpcomingActivities(plantsData, eventsData);
        setUpcomingActivities(activities);
      } catch (error) {
        console.error('Error loading dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAllData();

    // Real-time updates
    const interval = setInterval(() => {
      fetchAllSensors();
      fetchEvents().then(eventsData => {
        const activities = generateUpcomingActivities(plants, eventsData);
        setUpcomingActivities(activities);
      });
    }, 30000);
    
    return () => clearInterval(interval);
  }, [authenticated, authLoading, timeFilter]);

  // Helper functions
  const getQualityColor = (quality) => {
    switch (quality) {
      case 'A': return '#10b981';
      case 'B': return '#3b82f6';
      case 'C': return '#f59e0b';
      case 'D': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'urgent': return '#ef4444';
      case 'high': return '#f59e0b';
      case 'normal': return '#3b82f6';
      case 'low': return '#64748b';
      default: return '#64748b';
    }
  };

  const getFilterLabel = () => {
    switch (timeFilter) {
      case 'today': return 'Today';
      case 'week': return 'This Week';
      case 'month': return 'This Month';
      case 'year': return 'This Year';
      default: return 'This Week';
    }
  };

  const getNPKStatus = (nutrient, value) => {
    const optimalRanges = {
      nitrogen: { min: 30, max: 60 },
      phosphorus: { min: 30, max: 70 },
      potassium: { min: 60, max: 90 },
      ph: { min: 5.5, max: 7.0 }
    };

    const range = optimalRanges[nutrient];
    if (!range || value === null || value === undefined) return '#9E9E9E';

    if (value >= range.min && value <= range.max) return '#4CAF50';
    else if (value < range.min * 0.7 || value > range.max * 1.3) return '#F44336';
    else return '#FF9800';
  };

  // Show loading screen while checking authentication
  if (authLoading) {
    return (
      <div className="farmer-dashboard">
        <div className="farmer-main" style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          height: '100vh',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
        }}>
          <div style={{ 
            textAlign: 'center', 
            color: 'white',
            padding: '40px',
            background: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '20px',
            backdropFilter: 'blur(10px)'
          }}>
            <div style={{ 
              fontSize: '48px', 
              marginBottom: '20px',
              animation: 'spin 2s linear infinite'
            }}>
              🌱
            </div>
            <h2 style={{ margin: '10px 0', fontSize: '24px' }}>Checking Authentication...</h2>
            <p style={{ margin: '5px 0', opacity: 0.8 }}>Please wait</p>
          </div>
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return null;
  }

  if (loading) {
    return (
      <div className="farmer-dashboard">
        <FarmerSidebar 
          activeMenu={activeMenu}
          setActiveMenu={setActiveMenu}
        />
        <div className="farmer-main">
          <div className="farmer-header">
            <h1 className="farmer-title">Loading Dashboard...</h1>
          </div>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            height: '60vh' 
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '64px', marginBottom: '20px' }}>📊</div>
              <p>Fetching your farm data...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="farmer-dashboard">
      <FarmerSidebar 
        activeMenu={activeMenu}
        setActiveMenu={setActiveMenu}
      />

      <div className="farmer-main">
        {/* Header */}
        <div className="farmer-header">
          <h1 className="farmer-title">
            Hello, {currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Farmer'}!
          </h1>
          <div className="farmer-header-actions">
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

            <div className="farmer-search-box">
              <input
                type="text"
                placeholder="Search..."
                className="farmer-search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <span className="farmer-search-icon">🔍</span>
            </div>
            <div className="farmer-bell">
              🔔
              {productionStats.readyToHarvest > 0 && (
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

        {/* Production Stats Bar */}
        <div className="farmer-stats-bar">
          <div className="stat-item">
            <div className="stat-icon" style={{ backgroundColor: '#e8f5e9', color: '#10b981' }}>🌿</div>
            <div className="stat-content">
              <span className="stat-label">My Active Plants</span>
              <span className="stat-value">{productionStats.myActivePlants}</span>
            </div>
          </div>
          <div className={`stat-item ${productionStats.readyToHarvest > 0 ? 'alert' : ''}`}>
            <div className="stat-icon" style={{ backgroundColor: '#fff7ed', color: '#f59e0b' }}>🌾</div>
            <div className="stat-content">
              <span className="stat-label">Ready to Harvest</span>
              <span className="stat-value">{productionStats.readyToHarvest}</span>
            </div>
          </div>
          <div className="stat-item">
            <div className="stat-icon" style={{ backgroundColor: '#ede9fe', color: '#9333ea' }}>✅</div>
            <div className="stat-content">
              <span className="stat-label">Total Harvests</span>
              <span className="stat-value">{productionStats.totalHarvests}</span>
            </div>
          </div>
          <div className="stat-item">
            <div className="stat-icon" style={{ backgroundColor: '#dbeafe', color: '#3b82f6' }}>📊</div>
            <div className="stat-content">
              <span className="stat-label">Avg Yield</span>
              <span className="stat-value">{productionStats.avgYield} kg</span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="farmer-content">
          {/* Left Section */}
          <div className="farmer-left-section">
            {/* Upcoming Activities */}
            <div className="farmer-activities-card">
              <div className="card-header-with-badge">
                <h3>📅 My Tasks & Activities</h3>
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
            {recentHarvests.length > 0 && (
              <div className="farmer-harvests-card">
                <h3>🌾 Recent Harvests</h3>
                <div className="harvests-list">
                  {recentHarvests.map((harvest) => (
                    <div key={harvest.id} className="harvest-item-farmer">
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
                        <span>📦 Yield: {harvest.actualYield} {harvest.yieldUnit}</span>
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
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Section - All Soil Sensors */}
          <div className="farmer-right-section">
            <div className="sensors-card-farmer">
              <div className="sensors-header">
                <div className="sensors-title-section">
                  <h3>
                    🌡️ All Soil Sensors - Real-Time
                  </h3>
                  {sensorsLoading ? (
                    <span className="loading-indicator-small">Updating...</span>
                  ) : (
                    <span className="sensors-count">
                      {allSensorData.filter(s => s.isOnline).length} of {allSensorData.length} online
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
                <div className="sensors-grid-farmer">
                  {allSensorData.map((sensor) => (
                    <div 
                      key={sensor.id} 
                      className={`sensor-card-farmer ${!sensor.isOnline ? 'sensor-offline' : ''}`}
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
    </div>
  );
};

export default FarmerDashboard;