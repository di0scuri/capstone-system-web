import React, { useState, useEffect } from 'react';
import FarmerSidebar from './farmersidebar';
import './farmercalendar.css';
import { collection, getDocs, query, orderBy, where } from 'firebase/firestore';
import { db } from '../firebase';

const FarmerCalendar = () => {
  const [activeMenu, setActiveMenu] = useState('Calendar');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState('Week'); // Day, Week, Month, Year
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [events, setEvents] = useState([]);
  const [plants, setPlants] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch plants data to generate activities
  const fetchPlants = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'plants'));
      const plantsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        datePlanted: doc.data().datePlanted?.toDate ? doc.data().datePlanted.toDate() : new Date()
      }));
      setPlants(plantsData);
    } catch (error) {
      console.error('Error fetching plants:', error);
    }
  };

  // Fetch events from Firebase
  const fetchEvents = async () => {
    try {
      const eventsQuery = query(
        collection(db, 'events'),
        orderBy('timestamp', 'desc')
      );
      const querySnapshot = await getDocs(eventsQuery);
      const eventsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate ? doc.data().timestamp.toDate() : new Date(),
        createdAt: doc.data().createdAt?.toDate ? doc.data().createdAt.toDate() : new Date()
      }));
      
      // Convert Firebase events to calendar format
      const calendarEvents = eventsData.map(event => {
        const eventDate = event.timestamp || event.createdAt;
        return {
          id: `event-${event.id}`,
          title: event.message || `${event.type} - ${event.status}`,
          time: eventDate.toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
          }),
          date: eventDate.toISOString().split('T')[0],
          type: 'event',
          color: getEventColor(event.type),
          originalEvent: event
        };
      });

      setEvents(calendarEvents);
    } catch (error) {
      console.error('Error fetching events:', error);
    }
  };

  // Generate farming activities based on plant data
  const generatePlantActivities = () => {
    const activities = [];
    const today = new Date();

    plants.forEach(plant => {
      if (!plant.datePlanted) return;

      const plantedDate = plant.datePlanted;
      const daysSincePlanted = Math.floor((today - plantedDate) / (1000 * 60 * 60 * 24));

      // Generate activities based on plant lifecycle
      const plantActivities = [
        {
          day: 0,
          title: `Plant ${plant.name || plant.type}`,
          type: 'planting',
          color: '#51cf66'
        },
        {
          day: 7,
          title: `Check seedlings - ${plant.name || plant.type}`,
          type: 'inspection',
          color: '#4dabf7'
        },
        {
          day: 14,
          title: `First fertilization - ${plant.name || plant.type}`,
          type: 'fertilizing',
          color: '#ff8787'
        },
        {
          day: 21,
          title: `Watering schedule check - ${plant.name || plant.type}`,
          type: 'watering',
          color: '#4dabf7'
        },
        {
          day: 30,
          title: `Growth assessment - ${plant.name || plant.type}`,
          type: 'assessment',
          color: '#9775fa'
        },
        {
          day: 45,
          title: `Mid-season care - ${plant.name || plant.type}`,
          type: 'care',
          color: '#51cf66'
        },
        {
          day: 60,
          title: `Pre-harvest preparation - ${plant.name || plant.type}`,
          type: 'preparation',
          color: '#ff6b35'
        },
        {
          day: 75,
          title: `Harvest time - ${plant.name || plant.type}`,
          type: 'harvest',
          color: '#ffd43b'
        }
      ];

      plantActivities.forEach(activity => {
        const activityDate = new Date(plantedDate);
        activityDate.setDate(plantedDate.getDate() + activity.day);
        
        // Only include activities within a reasonable time range
        const diffFromToday = Math.abs(activityDate - today) / (1000 * 60 * 60 * 24);
        if (diffFromToday <= 180) { // Within 6 months
          activities.push({
            id: `plant-${plant.id}-${activity.day}`,
            title: activity.title,
            time: '9:00 AM', // Default time for plant activities
            date: activityDate.toISOString().split('T')[0],
            type: activity.type,
            color: activity.color,
            plantId: plant.id,
            plantData: plant
          });
        }
      });
    });

    return activities;
  };

  // Get color for event types
  const getEventColor = (eventType) => {
    const colors = {
      'LIFECYCLE_STAGE': '#51cf66',
      'PLANTING': '#51cf66',
      'WATERING': '#4dabf7',
      'FERTILIZING': '#ff8787',
      'HARVESTING': '#ffd43b',
      'INSPECTION': '#9775fa',
      'MAINTENANCE': '#ff6b35',
      'default': '#4dabf7'
    };
    return colors[eventType] || colors.default;
  };

  // Load all data
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        await fetchPlants();
        await fetchEvents();
      } catch (error) {
        console.error('Error loading calendar data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
    
    // Refresh every 5 minutes
    const interval = setInterval(() => {
      fetchEvents();
    }, 300000);

    return () => clearInterval(interval);
  }, []);

  // Combine Firebase events with generated plant activities
  useEffect(() => {
    if (plants.length > 0) {
      const plantActivities = generatePlantActivities();
      setEvents(prevEvents => {
        // Filter out old plant activities and add new ones
        const firebaseEvents = prevEvents.filter(event => !event.id.startsWith('plant-'));
        return [...firebaseEvents, ...plantActivities];
      });
    }
  }, [plants]);

  // Get current week dates
  const getWeekDates = (date) => {
    const startOfWeek = new Date(date);
    const day = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - day;
    startOfWeek.setDate(diff);

    const weekDates = [];
    for (let i = 0; i < 7; i++) {
      const weekDay = new Date(startOfWeek);
      weekDay.setDate(startOfWeek.getDate() + i);
      weekDates.push(weekDay);
    }
    return weekDates;
  };

  // Get dates based on view mode
  const getViewDates = () => {
    switch (viewMode) {
      case 'Day':
        return [currentDate];
      case 'Week':
        return getWeekDates(currentDate);
      case 'Month':
        const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        const lastDay = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
        const monthDates = [];
        for (let i = 1; i <= lastDay.getDate(); i++) {
          monthDates.push(new Date(currentDate.getFullYear(), currentDate.getMonth(), i));
        }
        return monthDates;
      case 'Year':
        const yearDates = [];
        for (let month = 0; month < 12; month++) {
          const monthDate = new Date(currentDate.getFullYear(), month, 1);
          yearDates.push(monthDate);
        }
        return yearDates;
      default:
        return getWeekDates(currentDate);
    }
  };

  const viewDates = getViewDates();
  const timeSlots = [
    '7 AM', '8 AM', '9 AM', '10 AM', '11 AM', '12 PM',
    '1 PM', '2 PM', '3 PM', '4 PM', '5 PM', '6 PM'
  ];

  const formatDate = (date) => date.toISOString().split('T')[0];

  const getEventsForDate = (date) => {
    const dateStr = formatDate(date);
    let filteredEvents = events.filter(event => event.date === dateStr);
    
    // Apply search filter
    if (searchTerm) {
      filteredEvents = filteredEvents.filter(event => 
        event.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        event.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (event.plantData && event.plantData.name && event.plantData.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (event.plantData && event.plantData.type && event.plantData.type.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (event.originalEvent && event.originalEvent.message && event.originalEvent.message.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }
    
    return filteredEvents;
  };

  // Get all events for the current view (filtered by search)
  const getAllEventsForView = () => {
    let allEvents = events;
    
    // Filter by date range based on view mode
    const today = new Date();
    switch (viewMode) {
      case 'Day':
        allEvents = events.filter(event => event.date === formatDate(currentDate));
        break;
      case 'Week':
        const weekStart = new Date(currentDate);
        weekStart.setDate(currentDate.getDate() - currentDate.getDay());
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        allEvents = events.filter(event => {
          const eventDate = new Date(event.date);
          return eventDate >= weekStart && eventDate <= weekEnd;
        });
        break;
      case 'Month':
        allEvents = events.filter(event => {
          const eventDate = new Date(event.date);
          return eventDate.getMonth() === currentDate.getMonth() && 
                 eventDate.getFullYear() === currentDate.getFullYear();
        });
        break;
      case 'Year':
        allEvents = events.filter(event => {
          const eventDate = new Date(event.date);
          return eventDate.getFullYear() === currentDate.getFullYear();
        });
        break;
    }
    
    // Apply search filter
    if (searchTerm) {
      allEvents = allEvents.filter(event => 
        event.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        event.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (event.plantData && event.plantData.name && event.plantData.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (event.plantData && event.plantData.type && event.plantData.type.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (event.originalEvent && event.originalEvent.message && event.originalEvent.message.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }
    
    return allEvents;
  };

  const getTimeSlotIndex = (timeStr) => {
    const time = timeStr.toLowerCase();
    if (time.includes('7') && time.includes('am')) return 0;
    if (time.includes('8') && time.includes('am')) return 1;
    if (time.includes('9') && time.includes('am')) return 2;
    if (time.includes('10') && time.includes('am')) return 3;
    if (time.includes('11') && time.includes('am')) return 4;
    if (time.includes('12') && time.includes('pm')) return 5;
    if (time.includes('1') && time.includes('pm')) return 6;
    if (time.includes('2') && time.includes('pm')) return 7;
    if (time.includes('3') && time.includes('pm')) return 8;
    if (time.includes('4') && time.includes('pm')) return 9;
    if (time.includes('5') && time.includes('pm')) return 10;
    if (time.includes('6') && time.includes('pm')) return 11;
    return 0;
  };

  const navigateView = (direction) => {
    const newDate = new Date(currentDate);
    
    switch (viewMode) {
      case 'Day':
        newDate.setDate(currentDate.getDate() + direction);
        break;
      case 'Week':
        newDate.setDate(currentDate.getDate() + (direction * 7));
        break;
      case 'Month':
        newDate.setMonth(currentDate.getMonth() + direction);
        break;
      case 'Year':
        newDate.setFullYear(currentDate.getFullYear() + direction);
        break;
    }
    
    setCurrentDate(newDate);
  };

  // Get current period string for display
  const getCurrentPeriodString = () => {
    switch (viewMode) {
      case 'Day':
        return currentDate.toLocaleDateString('en-US', { 
          weekday: 'long',
          month: 'long', 
          day: 'numeric', 
          year: 'numeric' 
        });
      case 'Week':
        const weekStart = new Date(currentDate);
        weekStart.setDate(currentDate.getDate() - currentDate.getDay());
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        return `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
      case 'Month':
        return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      case 'Year':
        return currentDate.getFullYear().toString();
      default:
        return currentDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    }
  };

  const getUpcomingEvents = () => {
    const upcoming = {};
    const today = new Date();

    events.forEach(event => {
      const eventDate = new Date(event.date);
      if (eventDate >= today) {
        const dateKey = eventDate.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'numeric',
          day: 'numeric',
          year: 'numeric'
        });

        if (!upcoming[dateKey]) {
          upcoming[dateKey] = [];
        }
        upcoming[dateKey].push(event);
      }
    });

    return upcoming;
  };

  const upcomingEvents = getUpcomingEvents();

  // Get current month and year for mini calendar
  const getCurrentMonthYear = () => {
    return {
      month: currentDate.toLocaleDateString('en-US', { month: 'long' }),
      year: currentDate.getFullYear()
    };
  };

  const { month, year } = getCurrentMonthYear();

  return (
    <div className="fc-main-layout">
      <FarmerSidebar activeMenu={activeMenu} setActiveMenu={setActiveMenu} />

      <div className="fc-container">
        {/* Header */}
        <div className="fc-header">
          <h1 className="fc-greeting">Hello, Farmer!</h1>

          <div className="fc-header-actions">
            <div className="fc-search-container">
              <input
                type="text"
                placeholder="Search activities..."
                className="fc-search-input"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <span className="fc-search-icon">🔍</span>
            </div>

            <div className="fc-notification">
              <span className="fc-notification-icon">🔔</span>
            </div>
          </div>
        </div>

        {/* Calendar */}
        <div className="fc-calendar-wrapper">
          {/* Calendar Controls */}
          <div className="fc-calendar-controls">
            <div className="fc-nav-controls">
              <button className="fc-nav-btn" onClick={() => navigateWeek(-1)}>&lt;</button>
              <span className="fc-current-period">
                {currentDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </span>
              <button className="fc-nav-btn" onClick={() => navigateWeek(1)}>&gt;</button>
            </div>

            <div className="fc-view-controls">
              {['Day', 'Week', 'Month', 'Year'].map(mode => (
                <button
                  key={mode}
                  className={`fc-view-btn ${viewMode === mode ? 'active' : ''}`}
                  onClick={() => setViewMode(mode)}
                >
                  {mode}
                </button>
              ))}
            </div>

            {loading && (
              <div className="fc-loading-indicator">
                Loading activities...
              </div>
            )}
          </div>

          <div className="fc-main-content">
            {/* Calendar Grid - Dynamic based on view mode */}
            <div className="fc-calendar-section">
              {viewMode === 'Day' && (
                <>
                  {/* Day View */}
                  <div className="fc-day-view">
                    <div className="fc-day-header-single">
                      <h2>{currentDate.toLocaleDateString('en-US', { 
                        weekday: 'long', 
                        month: 'long', 
                        day: 'numeric', 
                        year: 'numeric' 
                      })}</h2>
                    </div>
                    <div className="fc-day-events">
                      {getEventsForDate(currentDate).map(event => (
                        <div
                          key={event.id}
                          className="fc-day-event"
                          style={{ borderLeft: `4px solid ${event.color}` }}
                          onClick={() => setSelectedEvent(event)}
                        >
                          <div className="fc-event-time">{event.time}</div>
                          <div className="fc-event-title">{event.title}</div>
                          <div className="fc-event-type">{event.type}</div>
                        </div>
                      ))}
                      {getEventsForDate(currentDate).length === 0 && (
                        <div className="fc-no-events-day">No activities scheduled for this day</div>
                      )}
                    </div>
                  </div>
                </>
              )}

              {viewMode === 'Week' && (
                <>
                  {/* Week Header */}
                  <div className="fc-week-header">
                    {viewDates.map((date, index) => (
                      <div key={index} className="fc-day-header">
                        <div className="fc-day-name">
                          {date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}
                        </div>
                        <div className="fc-day-number">{date.getDate()}</div>
                      </div>
                    ))}
                  </div>

                  {/* Calendar Grid */}
                  <div className="fc-calendar-grid">
                    {/* Time Column */}
                    <div className="fc-time-column">
                      {timeSlots.map((time, index) => (
                        <div key={index} className="fc-time-slot">{time}</div>
                      ))}
                    </div>

                    {/* Days Columns */}
                    {viewDates.map((date, dayIndex) => (
                      <div key={dayIndex} className="fc-day-column">
                        {timeSlots.map((time, timeIndex) => {
                          const dayEvents = getEventsForDate(date);
                          const slotEvents = dayEvents.filter(event => getTimeSlotIndex(event.time) === timeIndex);

                          return (
                            <div key={timeIndex} className="fc-time-cell">
                              {slotEvents.map(event => (
                                <div
                                  key={event.id}
                                  className="fc-event"
                                  style={{ backgroundColor: event.color }}
                                  onClick={() => setSelectedEvent(event)}
                                  title={`${event.title} - ${event.type}`}
                                >
                                  <div className="fc-event-time">{event.time}</div>
                                  <div className="fc-event-title">{event.title}</div>
                                  {event.plantData && (
                                    <div className="fc-event-plant">📍 {event.plantData.locationZone || 'Plot'}</div>
                                  )}
                                </div>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </>
              )}

              {viewMode === 'Month' && (
                <div className="fc-month-view">
                  <div className="fc-month-header">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                      <div key={day} className="fc-month-day-header">{day}</div>
                    ))}
                  </div>
                  <div className="fc-month-grid">
                    {Array.from({ length: 42 }, (_, i) => {
                      const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
                      const startDate = new Date(firstDay);
                      startDate.setDate(startDate.getDate() - firstDay.getDay());
                      
                      const cellDate = new Date(startDate);
                      cellDate.setDate(startDate.getDate() + i);
                      
                      const isCurrentMonth = cellDate.getMonth() === currentDate.getMonth();
                      const isToday = cellDate.toDateString() === new Date().toDateString();
                      const dayEvents = getEventsForDate(cellDate);

                      return (
                        <div
                          key={i}
                          className={`fc-month-cell ${!isCurrentMonth ? 'other-month' : ''} ${isToday ? 'today' : ''}`}
                          onClick={() => setCurrentDate(cellDate)}
                        >
                          <div className="fc-month-date">{cellDate.getDate()}</div>
                          <div className="fc-month-events">
                            {dayEvents.slice(0, 3).map(event => (
                              <div
                                key={event.id}
                                className="fc-month-event"
                                style={{ backgroundColor: event.color }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedEvent(event);
                                }}
                              >
                                {event.title.length > 15 ? event.title.substring(0, 15) + '...' : event.title}
                              </div>
                            ))}
                            {dayEvents.length > 3 && (
                              <div className="fc-more-events">+{dayEvents.length - 3} more</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {viewMode === 'Year' && (
                <div className="fc-year-view">
                  <div className="fc-year-grid">
                    {Array.from({ length: 12 }, (_, monthIndex) => {
                      const monthDate = new Date(currentDate.getFullYear(), monthIndex, 1);
                      const monthEvents = events.filter(event => {
                        const eventDate = new Date(event.date);
                        return eventDate.getMonth() === monthIndex && 
                               eventDate.getFullYear() === currentDate.getFullYear();
                      });

                      // Apply search filter to month events
                      const filteredMonthEvents = searchTerm ? 
                        monthEvents.filter(event => 
                          event.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          event.type.toLowerCase().includes(searchTerm.toLowerCase())
                        ) : monthEvents;

                      return (
                        <div
                          key={monthIndex}
                          className="fc-year-month"
                          onClick={() => {
                            setCurrentDate(monthDate);
                            setViewMode('Month');
                          }}
                        >
                          <div className="fc-year-month-header">
                            {monthDate.toLocaleDateString('en-US', { month: 'long' })}
                          </div>
                          <div className="fc-year-month-events">
                            <div className="fc-year-event-count">
                              {filteredMonthEvents.length} activities
                            </div>
                            {filteredMonthEvents.slice(0, 3).map(event => (
                              <div
                                key={event.id}
                                className="fc-year-event"
                                style={{ backgroundColor: event.color }}
                              >
                                {event.title.length > 20 ? event.title.substring(0, 20) + '...' : event.title}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Right Sidebar */}
            <div className="fc-right-sidebar">
              {/* Mini Calendar */}
              <div className="fc-mini-calendar">
                <div className="fc-mini-header">
                  <button className="fc-mini-nav" onClick={() => navigateView(-1)}>&lt;</button>
                  <span className="fc-mini-title">{month} <span className="fc-year">{year}</span></span>
                  <button className="fc-mini-nav" onClick={() => navigateView(1)}>&gt;</button>
                </div>

                <div className="fc-mini-grid">
                  <div className="fc-mini-days">
                    {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(day => (
                      <div key={day} className="fc-mini-day-header">{day}</div>
                    ))}
                  </div>
                  <div className="fc-mini-dates">
                    {Array.from({ length: 35 }, (_, i) => {
                      const firstDay = new Date(year, currentDate.getMonth(), 1);
                      const startDate = new Date(firstDay);
                      startDate.setDate(startDate.getDate() - firstDay.getDay());
                      
                      const cellDate = new Date(startDate);
                      cellDate.setDate(startDate.getDate() + i);
                      
                      const isCurrentMonth = cellDate.getMonth() === currentDate.getMonth();
                      const isToday = cellDate.toDateString() === new Date().toDateString();
                      const hasEvents = events.some(event => event.date === formatDate(cellDate));

                      return (
                        <div
                          key={i}
                          className={`fc-mini-date ${!isCurrentMonth ? 'other-month' : ''} ${isToday ? 'today' : ''} ${hasEvents ? 'has-events' : ''}`}
                          onClick={() => setCurrentDate(cellDate)}
                        >
                          {cellDate.getDate()}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="fc-today-info">
                  <div className="fc-today-label">TODAY {new Date().toLocaleDateString()}</div>
                  <div className="fc-stats">{events.length} Activities Scheduled</div>
                </div>
              </div>

              {/* Upcoming Events */}
              <div className="fc-upcoming-events">
                <h3>Upcoming Activities</h3>
                {Object.entries(upcomingEvents).slice(0, 4).map(([date, dayEvents]) => (
                  <div key={date} className="fc-event-group">
                    <div className="fc-event-date">
                      {new Date(dayEvents[0].date).toLocaleDateString('en-US', { 
                        weekday: 'short', 
                        month: 'numeric', 
                        day: 'numeric' 
                      })}
                    </div>

                    {dayEvents.slice(0, 3).map(event => (
                      <div key={event.id} className="fc-upcoming-event">
                        <div className="fc-event-indicator" style={{ backgroundColor: event.color }}></div>
                        <div className="fc-event-details">
                          <div className="fc-event-time-range">{event.time}</div>
                          <div className="fc-event-description">{event.title}</div>
                          <div className="fc-event-type">{event.type}</div>
                        </div>
                      </div>
                    ))}
                    
                    {dayEvents.length > 3 && (
                      <div className="fc-more-events">
                        +{dayEvents.length - 3} more activities
                      </div>
                    )}
                  </div>
                ))}
                
                {Object.keys(upcomingEvents).length === 0 && (
                  <div className="fc-no-events">
                    No upcoming activities scheduled
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Event Details Modal */}
        {selectedEvent && (
          <div className="fc-modal-overlay" onClick={() => setSelectedEvent(null)}>
            <div className="fc-modal" onClick={(e) => e.stopPropagation()}>
              <div className="fc-modal-header">
                <h3>{selectedEvent.title}</h3>
                <button className="fc-modal-close" onClick={() => setSelectedEvent(null)}>×</button>
              </div>
              <div className="fc-modal-body">
                <p><strong>Time:</strong> {selectedEvent.time}</p>
                <p><strong>Type:</strong> {selectedEvent.type}</p>
                <p><strong>Date:</strong> {new Date(selectedEvent.date).toLocaleDateString()}</p>
                {selectedEvent.plantData && (
                  <>
                    <p><strong>Plant:</strong> {selectedEvent.plantData.name || selectedEvent.plantData.type}</p>
                    <p><strong>Location:</strong> {selectedEvent.plantData.locationZone || 'Not specified'}</p>
                    <p><strong>Status:</strong> {selectedEvent.plantData.status || 'Unknown'}</p>
                  </>
                )}
                {selectedEvent.originalEvent && (
                  <p><strong>Details:</strong> {selectedEvent.originalEvent.message}</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FarmerCalendar;