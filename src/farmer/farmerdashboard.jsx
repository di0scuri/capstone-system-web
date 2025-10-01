import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../firebase';
import { collection, getDocs, query, orderBy, limit, where } from 'firebase/firestore';
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
  const [selectedDate, setSelectedDate] = useState(new Date().getDate());
  const [sensorData, setSensorData] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  // Authentication check - MUST happen first
  useEffect(() => {
    console.log('Setting up authentication listener...');
    
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      console.log('Auth state changed:', user ? 'User logged in' : 'No user');
      
      if (user) {
        console.log('User authenticated:', user.email);
        setCurrentUser(user);
        setAuthenticated(true);
        
        // Verify user role
        const userRole = localStorage.getItem('userRole');
        console.log('User role from localStorage:', userRole);
        
        if (userRole !== 'farmer') {
          console.warn('User role mismatch. Expected: farmer, Got:', userRole);
          // Optionally redirect to correct dashboard based on role
        }
      } else {
        console.log('No authenticated user, redirecting to login...');
        setAuthenticated(false);
        navigate('/user-selection', { replace: true });
      }
      
      setAuthLoading(false);
    });

    // Cleanup subscription
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

  // Fetch latest sensor readings
  const fetchSensorData = async () => {
    try {
      const sensorQuery = query(
        collection(db, 'sensorReadings'),
        orderBy('timestamp', 'desc'),
        limit(1)
      );
      
      const sensorSnapshot = await getDocs(sensorQuery);
      
      if (!sensorSnapshot.empty) {
        const latestReading = sensorSnapshot.docs[0].data();
        const sensors = [
          { 
            type: 'Temp', 
            value: `${latestReading.temperature || 0}°C`, 
            icon: '🌡️', 
            color: '#FF9500' 
          },
          { 
            type: 'Humidity', 
            value: `${latestReading.humidity || 0}%`, 
            icon: '💧', 
            color: '#007AFF' 
          },
          { 
            type: 'pH', 
            value: (latestReading.ph || 0).toFixed(1), 
            icon: '⚗️', 
            color: '#AF52DE' 
          },
          { 
            type: 'EC', 
            value: `${latestReading.ec || 0} mS/cm`, 
            icon: '⚡', 
            color: '#34C759' 
          }
        ];
        setSensorData(sensors);
      } else {
        // Fallback data if no sensor readings
        setSensorData([
          { type: 'Temp', value: '--°C', icon: '🌡️', color: '#FF9500' },
          { type: 'Humidity', value: '--%', icon: '💧', color: '#007AFF' },
          { type: 'pH', value: '--', icon: '⚗️', color: '#AF52DE' },
          { type: 'EC', value: '-- mS/cm', icon: '⚡', color: '#34C759' }
        ]);
      }
    } catch (error) {
      console.error('Error fetching sensor data:', error);
      // Set fallback data on error
      setSensorData([
        { type: 'Temp', value: '--°C', icon: '🌡️', color: '#FF9500' },
        { type: 'Humidity', value: '--%', icon: '💧', color: '#007AFF' },
        { type: 'pH', value: '--', icon: '⚗️', color: '#AF52DE' },
        { type: 'EC', value: '-- mS/cm', icon: '⚡', color: '#34C759' }
      ]);
    }
  };

  // Fetch NPK data for chart from plants and their latest sensor readings
  const fetchChartData = async () => {
    try {
      const plantsSnapshot = await getDocs(collection(db, 'plants'));
      const chartPromises = plantsSnapshot.docs.map(async (plantDoc) => {
        const plantData = plantDoc.data();
        
        // Get latest sensor reading for this plant
        const sensorQuery = query(
          collection(db, 'sensorReadings'),
          where('plantId', '==', plantDoc.id),
          orderBy('timestamp', 'desc'),
          limit(1)
        );
        
        const sensorSnapshot = await getDocs(sensorQuery);
        let sensorReading = {};
        
        if (!sensorSnapshot.empty) {
          sensorReading = sensorSnapshot.docs[0].data();
        }
        
        return {
          plant: plantData.name?.split(' - ')[0] || plantData.type || 'Unknown',
          nitrogen: sensorReading.nitrogen || 0,
          phosphorus: sensorReading.phosphorus || 0,
          potassium: sensorReading.potassium || 0,
          ph: (sensorReading.ph || 0) * 50 // Scale pH for visualization
        };
      });
      
      const resolvedChartData = await Promise.all(chartPromises);
      setChartData(resolvedChartData.slice(0, 4)); // Limit to 4 plants for display
    } catch (error) {
      console.error('Error fetching chart data:', error);
      // Fallback chart data
      setChartData([
        { plant: 'Lettuce', nitrogen: 320, phosphorus: 180, potassium: 280, ph: 150 },
        { plant: 'Kale', nitrogen: 300, phosphorus: 170, potassium: 260, ph: 140 },
        { plant: 'Spinach', nitrogen: 280, phosphorus: 160, potassium: 240, ph: 130 },
        { plant: 'Cabbage', nitrogen: 350, phosphorus: 200, potassium: 300, ph: 160 }
      ]);
    }
  };

  // Fetch events from Firebase
  const fetchEvents = async () => {
    try {
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

      const eventsQuery = query(
        collection(db, 'events'),
        where('date', '>=', startOfDay),
        where('date', '<', endOfDay),
        orderBy('date', 'asc')
      );
      
      const eventsSnapshot = await getDocs(eventsQuery);
      
      const todayEvents = eventsSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          time: data.time || '00:00',
          title: data.title || 'Untitled Event',
          description: data.description || '',
          participants: data.participants || ['👤'],
          color: data.color || '#8BC34A',
          type: data.type || 'task'
        };
      });

      setEvents(todayEvents);
    } catch (error) {
      console.error('Error fetching events:', error);
      // Fallback events
      setEvents([
        {
          id: 1,
          time: '08:00',
          title: 'Water Plants - Zone A',
          participants: ['🌱'],
          color: '#8BC34A',
          type: 'task'
        },
        {
          id: 2,
          time: '10:00',
          title: 'Check Sensor Readings',
          participants: ['📊'],
          color: '#007AFF',
          type: 'task'
        }
      ]);
    }
  };

  // Fetch all data on component mount - ONLY after authentication is confirmed
  useEffect(() => {
    if (!authenticated || authLoading) {
      console.log('Waiting for authentication before fetching data...');
      return;
    }

    console.log('Authentication confirmed, fetching dashboard data...');

    const fetchAllData = async () => {
      setLoading(true);
      await Promise.all([
        fetchSensorData(),
        fetchChartData(),
        fetchEvents()
      ]);
      setLoading(false);
    };

    fetchAllData();

    // Refresh sensor data every 5 minutes
    const sensorTimer = setInterval(fetchSensorData, 5 * 60 * 1000);
    
    return () => {
      clearInterval(sensorTimer);
    };
  }, [authenticated, authLoading]);

  // Calendar dates generation
  const generateCalendarDates = () => {
    const today = new Date();
    const dates = [];
    
    for (let i = -3; i <= 3; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      
      const dayNames = ['Su', 'Mo', 'Tu', 'Wed', 'Th', 'Fr', 'Sa'];
      
      dates.push({
        date: date.getDate(),
        day: dayNames[date.getDay()],
        isToday: i === 0,
        fullDate: date
      });
    }
    
    return dates;
  };

  const calendarDates = generateCalendarDates();

  // Filter events and tasks
  const scheduleToday = events.filter(event => event.type !== 'reminder');
  const reminderTasks = events.filter(event => event.type === 'reminder');

  const currentMonth = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();

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

  // Don't render anything if not authenticated (will redirect)
  if (!authenticated) {
    return null;
  }

  // Show loading screen while fetching dashboard data
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
      {/* Farmer Sidebar */}
      <FarmerSidebar 
        activeMenu={activeMenu}
        setActiveMenu={setActiveMenu}
      />

      {/* Main Content */}
      <div className="farmer-main">
        {/* Header */}
        <div className="farmer-header">
          <h1 className="farmer-title">
            Hello, {currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Farmer'}!
          </h1>
          <div className="farmer-header-actions">
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
            <div className="farmer-bell">🔔</div>
          </div>
        </div>

        {/* Content */}
        <div className="farmer-content">
          {/* Left Section */}
          <div className="farmer-left-section">
            {/* NPK Chart */}
            <div className="farmer-chart-card">
              <div className="chart-header">
                <h3>NPK & pH Level For Each Plant</h3>
                <div className="chart-legend">
                  <div className="legend-item">
                    <span className="legend-dot nitrogen"></span>
                    <span>Nitrogen</span>
                  </div>
                  <div className="legend-item">
                    <span className="legend-dot phosphorus"></span>
                    <span>Phosphorus</span>
                  </div>
                  <div className="legend-item">
                    <span className="legend-dot potassium"></span>
                    <span>Potassium</span>
                  </div>
                  <div className="legend-item">
                    <span className="legend-dot ph"></span>
                    <span>pH</span>
                  </div>
                </div>
              </div>
              
              <div className="chart-container">
                <div className="chart-y-axis">
                  <span>400</span>
                  <span>300</span>
                  <span>200</span>
                  <span>100</span>
                  <span>0</span>
                </div>
                <div className="chart-bars">
                  {chartData.map((data, index) => (
                    <div key={index} className="bar-group">
                      <div className="bars">
                        <div 
                          className="bar nitrogen-bar" 
                          style={{ height: `${Math.max((data.nitrogen / 400) * 100, 2)}%` }}
                        ></div>
                        <div 
                          className="bar phosphorus-bar" 
                          style={{ height: `${Math.max((data.phosphorus / 400) * 100, 2)}%` }}
                        ></div>
                        <div 
                          className="bar potassium-bar" 
                          style={{ height: `${Math.max((data.potassium / 400) * 100, 2)}%` }}
                        ></div>
                        <div 
                          className="bar ph-bar" 
                          style={{ height: `${Math.max((data.ph / 400) * 100, 2)}%` }}
                        ></div>
                      </div>
                      <span className="bar-label">{data.plant}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Sensor Data */}
            <div className="farmer-sensor-card">
              <h3>Real-time Sensor Data</h3>
              <div className="sensor-grid">
                {sensorData.map((sensor, index) => (
                  <div key={index} className="sensor-item" style={{ backgroundColor: sensor.color + '20' }}>
                    <div className="sensor-icon" style={{ color: sensor.color }}>
                      {sensor.icon}
                    </div>
                    <div className="sensor-info">
                      <span className="sensor-type">{sensor.type}</span>
                      <span className="sensor-value">{sensor.value}</span>
                    </div>
                  </div>
                ))}
              </div>
              <p className="sensor-timestamp">
                Last updated: {currentTime.toLocaleTimeString()}
              </p>
            </div>
          </div>

          {/* Right Section */}
          <div className="farmer-right-section">
            {/* Calendar */}
            <div className="farmer-calendar-card">
              <div className="calendar-header">
                <h3>{currentMonth}</h3>
              </div>
              <div className="calendar-dates">
                {calendarDates.map((date, index) => (
                  <div 
                    key={index} 
                    className={`calendar-date ${date.isToday ? 'today' : ''} ${selectedDate === date.date ? 'selected' : ''}`}
                    onClick={() => setSelectedDate(date.date)}
                  >
                    <span className="date-number">{date.date}</span>
                    <span className="date-day">{date.day}</span>
                  </div>
                ))}
              </div>

              {/* Schedule Today */}
              <div className="schedule-section">
                <h4>Schedule Today</h4>
                {scheduleToday.length === 0 ? (
                  <p className="no-events">No scheduled tasks for today</p>
                ) : (
                  <div className="schedule-timeline">
                    <div className="timeline-hours">
                      <span>08:00</span>
                      <span>10:00</span>
                      <span>12:00</span>
                      <span>14:00</span>
                      <span>16:00</span>
                    </div>
                    <div className="schedule-items">
                      {scheduleToday.map((item) => (
                        <div 
                          key={item.id} 
                          className="schedule-item"
                          style={{ backgroundColor: item.color }}
                        >
                          <span className="schedule-time">{item.time}</span>
                          <span className="schedule-title">{item.title}</span>
                          <div className="schedule-participants">
                            {item.participants.map((participant, i) => (
                              <span key={i} className="participant">{participant}</span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Reminder */}
              <div className="reminder-section">
                <h4>Farm Reminders</h4>
                <p className="reminder-subtitle">Important tasks and notifications</p>
                {reminderTasks.length === 0 ? (
                  <p className="no-reminders">No reminders for today</p>
                ) : (
                  <div className="reminder-items">
                    {reminderTasks.map((task) => (
                      <div 
                        key={task.id} 
                        className="reminder-item"
                        style={{ backgroundColor: task.color }}
                      >
                        <div className="reminder-icon">📋</div>
                        <div className="reminder-info">
                          <span className="reminder-title">{task.title}</span>
                          <span className="reminder-time">⏰ {task.time}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FarmerDashboard;