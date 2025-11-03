import React, { useState, useEffect } from 'react'
import Sidebar from './sidebar'
import './admincalendar.css'
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, query, where, orderBy } from 'firebase/firestore'
import { db } from '../firebase'

const AdminCalendar = ({ userType = 'admin', userId = 'default-user' }) => {
  const [activeMenu, setActiveMenu] = useState('Calendar')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [events, setEvents] = useState([])
  const [plants, setPlants] = useState([])
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [showEventModal, setShowEventModal] = useState(false)
  const [showDetailsModal, setShowDetailsModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState('month') // 'month' or 'list'
  const [filterType, setFilterType] = useState('all') // 'all', 'alerts', 'manual'
  const [filterStatus, setFilterStatus] = useState('all') // 'all', 'pending', 'in-progress', 'completed', etc.
  
  // Check if user has edit permissions (admin or farmer)
  const canEdit = userType === 'admin' || userType === 'farmer'
  const canDelete = userType === 'admin' // Only admin can delete
  
  // Event form state
  const [eventForm, setEventForm] = useState({
    plantId: '',
    plantName: '',
    plotNumber: '',
    type: 'LIFECYCLE_STAGE',
    status: 'pending',
    priority: 'normal',
    title: '',
    description: '',
    date: '',
    startTime: '',
    endTime: '',
    notes: '',
    assignedTo: userType // Track who created/is assigned
  })

  // Event types (including alert)
  const eventTypes = [
    { value: 'alert', icon: '🚨', color: '#ef4444', label: 'Soil Alert' },
    { value: 'LIFECYCLE_STAGE', icon: '🌱', color: '#10b981', label: 'Lifecycle Stage' },
    { value: 'PLANTING', icon: '🪴', color: '#14b8a6', label: 'Planting' },
    { value: 'WATERING', icon: '💧', color: '#3b82f6', label: 'Watering' },
    { value: 'FERTILIZING', icon: '🌿', color: '#8b5cf6', label: 'Fertilizing' },
    { value: 'WEEDING', icon: '🪴', color: '#f59e0b', label: 'Weeding' },
    { value: 'PEST_CONTROL', icon: '🐛', color: '#ef4444', label: 'Pest Control' },
    { value: 'PRUNING', icon: '✂️', color: '#ec4899', label: 'Pruning' },
    { value: 'HARVESTING', icon: '🥬', color: '#059669', label: 'Harvesting' },
    { value: 'MAINTENANCE', icon: '🔧', color: '#6366f1', label: 'Maintenance' },
    { value: 'OBSERVATION', icon: '👁️', color: '#06b6d4', label: 'Observation' },
    { value: 'OTHER', icon: '📋', color: '#64748b', label: 'Other' }
  ]

  // Comprehensive status options
  const statusOptions = [
    { value: 'pending', label: 'Pending', icon: '⏳', color: '#f59e0b' },
    { value: 'in-progress', label: 'In Progress', icon: '🔄', color: '#3b82f6' },
    { value: 'completed', label: 'Completed', icon: '✅', color: '#10b981' },
    { value: 'resolved', label: 'Resolved', icon: '✓', color: '#10b981' },
    { value: 'cancelled', label: 'Cancelled', icon: '✕', color: '#64748b' },
    { value: 'on-hold', label: 'On Hold', icon: '⏸️', color: '#a855f7' },
    { value: 'info', label: 'Info', icon: 'ℹ️', color: '#3b82f6' },
    { value: 'warning', label: 'Warning', icon: '⚠️', color: '#f59e0b' },
    { value: 'error', label: 'Error', icon: '❌', color: '#ef4444' }
  ]

  // Status colors
  const statusColors = {
    'pending': '#f59e0b',
    'in-progress': '#3b82f6',
    'completed': '#10b981',
    'resolved': '#10b981',
    'cancelled': '#64748b',
    'info': '#3b82f6',
    'success': '#10b981',
    'warning': '#f59e0b',
    'error': '#ef4444',
    'on-hold': '#a855f7'
  }

  // Priority colors
  const priorityColors = {
    'low': '#64748b',
    'normal': '#3b82f6',
    'high': '#f59e0b',
    'urgent': '#ef4444'
  }

  // Fetch plants
  const fetchPlants = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'plants'))
      const plantsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      setPlants(plantsData)
    } catch (error) {
      console.error('Error fetching plants:', error)
    }
  }

  // Fetch events from events collection
  const fetchEvents = async () => {
    setLoading(true)
    try {
      const querySnapshot = await getDocs(collection(db, 'events'))
      const eventsData = querySnapshot.docs.map(doc => {
        const data = doc.data()
        
        // Handle different date formats
        let eventDate = new Date()
        if (data.date) {
          // New format: separate date field
          eventDate = new Date(data.date)
        } else if (data.timestamp) {
          // Old format: timestamp field
          eventDate = data.timestamp?.toDate ? data.timestamp.toDate() : new Date(data.timestamp)
        }
        
        return {
          id: doc.id,
          ...data,
          eventDate: eventDate,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt || Date.now()),
          // Determine if it's a system-generated alert
          isAlert: data.type === 'alert' || data.createdBy === 'system',
          // Support both old message field and new title field
          displayTitle: data.title || data.message || 'Untitled Event'
        }
      })
      
      // Sort by date
      eventsData.sort((a, b) => new Date(b.eventDate) - new Date(a.eventDate))
      
      setEvents(eventsData)
    } catch (error) {
      console.error('Error fetching events:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPlants()
    fetchEvents()
  }, [])

  // Filter events based on selected filters
  const getFilteredEvents = () => {
    let filtered = events

    // Filter by type (alerts vs manual)
    if (filterType === 'alerts') {
      filtered = filtered.filter(e => e.isAlert)
    } else if (filterType === 'manual') {
      filtered = filtered.filter(e => !e.isAlert)
    }

    // Filter by status
    if (filterStatus !== 'all') {
      filtered = filtered.filter(e => e.status === filterStatus)
    }

    return filtered
  }

  // Calendar helpers
  const getDaysInMonth = (date) => {
    const year = date.getFullYear()
    const month = date.getMonth()
    return new Date(year, month + 1, 0).getDate()
  }

  const getFirstDayOfMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay()
  }

  const getMonthName = (date) => {
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }

  const getDayEvents = (day) => {
    const targetDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day)
    targetDate.setHours(0, 0, 0, 0)
    
    const filteredEvents = getFilteredEvents()
    
    return filteredEvents.filter(event => {
      const eventDate = new Date(event.eventDate)
      eventDate.setHours(0, 0, 0, 0)
      return eventDate.getTime() === targetDate.getTime()
    })
  }

  const isToday = (day) => {
    const today = new Date()
    return (
      day === today.getDate() &&
      currentDate.getMonth() === today.getMonth() &&
      currentDate.getFullYear() === today.getFullYear()
    )
  }

  // Navigation
  const goToPreviousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1))
  }

  const goToNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1))
  }

  const goToToday = () => {
    setCurrentDate(new Date())
  }

  // Handle event click - show details
  const handleEventClick = (event) => {
    setSelectedEvent(event)
    setShowDetailsModal(true)
  }

  // Handle add event (only for manual events)
  const handleAddEvent = () => {
    if (!canEdit) {
      alert('⚠️ You do not have permission to add events.')
      return
    }

    setEventForm({
      plantId: '',
      plantName: '',
      plotNumber: '',
      type: 'LIFECYCLE_STAGE',
      status: 'pending',
      priority: 'normal',
      title: '',
      description: '',
      date: new Date().toISOString().split('T')[0],
      startTime: '',
      endTime: '',
      notes: '',
      assignedTo: userType
    })
    setSelectedEvent(null)
    setShowEventModal(true)
  }

  // Handle edit event (only for manual events, not system alerts)
  const handleEditEvent = (event) => {
    if (!canEdit) {
      alert('⚠️ You do not have permission to edit events.')
      return
    }

    if (event.isAlert && event.createdBy === 'system') {
      alert('⚠️ System-generated alerts cannot be edited. You can only update their status.')
      return
    }

    setSelectedEvent(event)
    setEventForm({
      plantId: event.plantId || '',
      plantName: event.plantName || '',
      plotNumber: event.plotNumber || '',
      type: event.type || 'LIFECYCLE_STAGE',
      status: event.status || 'pending',
      priority: event.priority || 'normal',
      title: event.title || event.message || '',
      description: event.description || '',
      date: event.date || new Date(event.eventDate).toISOString().split('T')[0],
      startTime: event.startTime || '',
      endTime: event.endTime || '',
      notes: event.notes || '',
      assignedTo: event.assignedTo || userType
    })
    setShowDetailsModal(false)
    setShowEventModal(true)
  }

  // Handle plant selection
  const handlePlantSelect = (e) => {
    const plantId = e.target.value
    const plant = plants.find(p => p.id === plantId)
    
    if (plant) {
      setEventForm(prev => ({
        ...prev,
        plantId: plantId,
        plantName: plant.plantName || plant.plantType || plant.name || plant.type,
        plotNumber: plant.plotNumber || ''
      }))
    } else {
      setEventForm(prev => ({
        ...prev,
        plantId: '',
        plantName: '',
        plotNumber: ''
      }))
    }
  }

  // Handle save event
  const handleSaveEvent = async () => {
    if (!canEdit) {
      alert('⚠️ You do not have permission to save events.')
      return
    }

    try {
      if (!eventForm.title || !eventForm.date) {
        alert('Please fill in required fields (title and date)')
        return
      }

      const eventData = {
        plantId: eventForm.plantId || null,
        plantName: eventForm.plantName || null,
        plotNumber: eventForm.plotNumber || null,
        type: eventForm.type,
        status: eventForm.status,
        priority: eventForm.priority || 'normal',
        title: eventForm.title,
        description: eventForm.description || '',
        date: eventForm.date,
        startTime: eventForm.startTime || '',
        endTime: eventForm.endTime || '',
        notes: eventForm.notes || '',
        assignedTo: eventForm.assignedTo || userType,
        userId: userId,
        createdBy: selectedEvent ? selectedEvent.createdBy : userId, // Preserve original creator
        updatedBy: userId, // Track who updated
        updatedAt: serverTimestamp()
      }

      if (selectedEvent) {
        // Update existing
        await updateDoc(doc(db, 'events', selectedEvent.id), eventData)
        alert('✅ Event updated successfully!')
      } else {
        // Create new
        await addDoc(collection(db, 'events'), {
          ...eventData,
          createdAt: serverTimestamp()
        })
        alert('✅ Event added successfully!')
      }

      setShowEventModal(false)
      fetchEvents()
    } catch (error) {
      console.error('Error saving event:', error)
      alert('❌ Failed to save event')
    }
  }

  // Handle update status (for both admins and farmers)
  const handleUpdateStatus = async (eventId, newStatus) => {
    if (!canEdit) {
      alert('⚠️ You do not have permission to update status.')
      return
    }

    try {
      const updateData = {
        status: newStatus,
        updatedBy: userId,
        updatedAt: serverTimestamp()
      }

      // Add specific timestamp for certain statuses
      if (newStatus === 'completed') {
        updateData.completedAt = serverTimestamp()
        updateData.completedBy = userId
      } else if (newStatus === 'resolved') {
        updateData.resolvedAt = serverTimestamp()
        updateData.resolvedBy = userId
      } else if (newStatus === 'in-progress') {
        updateData.startedAt = serverTimestamp()
        updateData.startedBy = userId
      }

      await updateDoc(doc(db, 'events', eventId), updateData)
      
      const statusLabel = statusOptions.find(s => s.value === newStatus)?.label || newStatus
      alert(`✅ Status updated to: ${statusLabel}`)
      
      setShowDetailsModal(false)
      fetchEvents()
    } catch (error) {
      console.error('Error updating status:', error)
      alert('❌ Failed to update status')
    }
  }

  // Handle delete event
  const handleDeleteEvent = async (eventId, isSystemAlert) => {
    if (!canDelete) {
      alert('⚠️ Only administrators can delete events.')
      return
    }

    if (isSystemAlert) {
      if (!window.confirm('⚠️ This is a system-generated alert. Are you sure you want to delete it? Consider marking it as resolved instead.')) {
        return
      }
    } else {
      if (!window.confirm('Are you sure you want to delete this event?')) {
        return
      }
    }

    try {
      await deleteDoc(doc(db, 'events', eventId))
      alert('✅ Event deleted successfully!')
      setShowDetailsModal(false)
      fetchEvents()
    } catch (error) {
      console.error('Error deleting event:', error)
      alert('❌ Failed to delete event')
    }
  }

  // Get event type config
  const getEventTypeConfig = (type) => {
    return eventTypes.find(t => t.value === type) || eventTypes[eventTypes.length - 1]
  }

  // Get status config
  const getStatusConfig = (status) => {
    return statusOptions.find(s => s.value === status) || statusOptions[0]
  }

  // Render calendar grid
  const renderCalendarGrid = () => {
    const daysInMonth = getDaysInMonth(currentDate)
    const firstDayOfMonth = getFirstDayOfMonth(currentDate)
    const days = []

    // Empty cells for days before first day of month
    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push(<div key={`empty-${i}`} className="calendar-day empty" />)
    }

    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const dayEvents = getDayEvents(day)
      const isTodayDate = isToday(day)

      days.push(
        <div
          key={day}
          className={`calendar-day ${isTodayDate ? 'today' : ''} ${dayEvents.length > 0 ? 'has-events' : ''}`}
        >
          <div className="day-number">{day}</div>
          <div className="day-events">
            {dayEvents.slice(0, 3).map((event, index) => {
              const typeConfig = getEventTypeConfig(event.type)
              const statusColor = event.priority ? priorityColors[event.priority] : statusColors[event.status]
              
              return (
                <div
                  key={event.id}
                  className={`event-item ${event.isAlert ? 'alert-event' : ''}`}
                  style={{ 
                    background: statusColor || statusColors.info,
                    borderLeft: `4px solid ${typeConfig.color}`
                  }}
                  onClick={(e) => {
                    e.stopPropagation()
                    handleEventClick(event)
                  }}
                  title={event.displayTitle}
                >
                  <span className="event-icon">{typeConfig.icon}</span>
                  <span className="event-text">
                    {event.isAlert && '🚨 '}
                    {event.displayTitle.substring(0, 20)}{event.displayTitle.length > 20 ? '...' : ''}
                  </span>
                </div>
              )
            })}
            {dayEvents.length > 3 && (
              <div className="more-events">+{dayEvents.length - 3} more</div>
            )}
          </div>
        </div>
      )
    }

    return days
  }

  // Render list view
  const renderListView = () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const filteredEvents = getFilteredEvents()

    const upcomingEvents = filteredEvents.filter(event => {
      const eventDate = new Date(event.eventDate)
      eventDate.setHours(0, 0, 0, 0)
      return eventDate >= today
    })

    const pastEvents = filteredEvents.filter(event => {
      const eventDate = new Date(event.eventDate)
      eventDate.setHours(0, 0, 0, 0)
      return eventDate < today
    })

    return (
      <div className="list-view">
        <div className="list-section">
          <h3 className="list-section-title">📅 Upcoming & Today ({upcomingEvents.length})</h3>
          {upcomingEvents.length === 0 ? (
            <div className="no-events">No upcoming events</div>
          ) : (
            <div className="events-list">
              {upcomingEvents.map(event => {
                const typeConfig = getEventTypeConfig(event.type)
                const statusConfig = getStatusConfig(event.status)
                return (
                  <div
                    key={event.id}
                    className={`event-list-item ${event.isAlert ? 'alert-item' : ''}`}
                    onClick={() => handleEventClick(event)}
                  >
                    <div className="event-list-icon" style={{ background: typeConfig.color }}>
                      {typeConfig.icon}
                    </div>
                    <div className="event-list-content">
                      <div className="event-list-header">
                        <span className="event-list-message">
                          {event.isAlert && <span className="alert-badge">🚨 ALERT</span>}
                          {event.displayTitle}
                        </span>
                        <span 
                          className="event-list-status"
                          style={{ 
                            background: statusColors[event.status] || statusColors.info
                          }}
                        >
                          {statusConfig.icon} {statusConfig.label}
                        </span>
                      </div>
                      <div className="event-list-details">
                        {event.plantName && <span className="event-detail">🌱 {event.plantName}</span>}
                        {event.plotNumber && <span className="event-detail">📍 Plot {event.plotNumber}</span>}
                        {event.growthStage && <span className="event-detail">🌿 {event.growthStage}</span>}
                        {event.assignedTo && <span className="event-detail">👤 {event.assignedTo}</span>}
                        <span className="event-detail">
                          📅 {new Date(event.eventDate).toLocaleDateString('en-US', { 
                            month: 'short', 
                            day: 'numeric', 
                            year: 'numeric' 
                          })}
                        </span>
                        <span className="event-detail">
                          {typeConfig.label}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="list-section">
          <h3 className="list-section-title">🕐 Past Events ({pastEvents.length})</h3>
          {pastEvents.length === 0 ? (
            <div className="no-events">No past events</div>
          ) : (
            <div className="events-list">
              {pastEvents.map(event => {
                const typeConfig = getEventTypeConfig(event.type)
                const statusConfig = getStatusConfig(event.status)
                return (
                  <div
                    key={event.id}
                    className={`event-list-item past ${event.isAlert ? 'alert-item' : ''}`}
                    onClick={() => handleEventClick(event)}
                  >
                    <div className="event-list-icon" style={{ background: typeConfig.color }}>
                      {typeConfig.icon}
                    </div>
                    <div className="event-list-content">
                      <div className="event-list-header">
                        <span className="event-list-message">
                          {event.isAlert && <span className="alert-badge">🚨 ALERT</span>}
                          {event.displayTitle}
                        </span>
                        <span 
                          className="event-list-status"
                          style={{ 
                            background: statusColors[event.status] || statusColors.info
                          }}
                        >
                          {statusConfig.icon} {statusConfig.label}
                        </span>
                      </div>
                      <div className="event-list-details">
                        {event.plantName && <span className="event-detail">🌱 {event.plantName}</span>}
                        {event.plotNumber && <span className="event-detail">📍 Plot {event.plotNumber}</span>}
                        {event.growthStage && <span className="event-detail">🌿 {event.growthStage}</span>}
                        {event.assignedTo && <span className="event-detail">👤 {event.assignedTo}</span>}
                        <span className="event-detail">
                          📅 {new Date(event.eventDate).toLocaleDateString('en-US', { 
                            month: 'short', 
                            day: 'numeric', 
                            year: 'numeric' 
                          })}
                        </span>
                        <span className="event-detail">
                          {typeConfig.label}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    )
  }

  // Render alert-specific details
  const renderAlertDetails = (event) => {
    if (!event.alertDetails) return null

    return (
      <div className="alert-details-section">
        <h4 className="alert-section-title">🚨 Alert Details</h4>
        
        {event.alertDetails.alerts && event.alertDetails.alerts.length > 0 && (
          <div className="alert-violations">
            <div className="detail-label">Threshold Violations:</div>
            {event.alertDetails.alerts.map((alert, index) => (
              <div key={index} className="violation-item">
                <span className={`violation-badge ${alert.status.toLowerCase()}`}>
                  {alert.status}
                </span>
                <span className="violation-text">
                  {alert.parameter}: {alert.value}{alert.unit} 
                  (threshold: {alert.threshold}{alert.unit})
                </span>
              </div>
            ))}
          </div>
        )}

        {event.alertDetails.sensorData && (
          <div className="sensor-readings">
            <div className="detail-label">Current Sensor Readings:</div>
            <div className="readings-grid">
              {Object.entries(event.alertDetails.sensorData).map(([key, value]) => (
                value !== undefined && value !== null && (
                  <div key={key} className="reading-item">
                    <span className="reading-label">{key}:</span>
                    <span className="reading-value">{value}</span>
                  </div>
                )
              ))}
            </div>
          </div>
        )}

        {event.alertDetails.sensorId && (
          <div className="detail-row">
            <span className="detail-label">Sensor ID:</span>
            <span className="detail-value">{event.alertDetails.sensorId}</span>
          </div>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="calendar-container">
        <Sidebar activeMenu={activeMenu} setActiveMenu={setActiveMenu} userType={userType} />
        <div className="calendar-content">
          <div className="loading">Loading calendar...</div>
        </div>
      </div>
    )
  }

  const filteredEventsCount = getFilteredEvents().length

  return (
    <div className="calendar-container">
      <Sidebar activeMenu={activeMenu} setActiveMenu={setActiveMenu} userType={userType} />
      
      <div className="calendar-content">
        <div className="calendar-header">
          <div className="calendar-title-section">
            <h1 className="calendar-title">📅 Event Calendar</h1>
            <p className="calendar-subtitle">
              Track planting events, activities, and soil alerts • {userType === 'admin' ? 'Administrator' : 'Farmer'} View
            </p>
          </div>

          <div className="calendar-actions">
            <div className="filters-section">
              <select 
                className="filter-select"
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
              >
                <option value="all">All Events ({events.length})</option>
                <option value="alerts">Alerts Only ({events.filter(e => e.isAlert).length})</option>
                <option value="manual">Manual Events ({events.filter(e => !e.isAlert).length})</option>
              </select>

              <select 
                className="filter-select"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="all">All Status</option>
                {statusOptions.map(status => (
                  <option key={status.value} value={status.value}>
                    {status.icon} {status.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="view-toggle">
              <button
                className={`view-toggle-btn ${viewMode === 'month' ? 'active' : ''}`}
                onClick={() => setViewMode('month')}
              >
                📅 Month
              </button>
              <button
                className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
                onClick={() => setViewMode('list')}
              >
                📋 List
              </button>
            </div>

            {canEdit && (
              <button className="calendar-add-btn" onClick={handleAddEvent}>
                + Add Event
              </button>
            )}
          </div>
        </div>

        <div className="filter-summary">
          Showing {filteredEventsCount} event{filteredEventsCount !== 1 ? 's' : ''}
        </div>

        {viewMode === 'month' ? (
          <>
            <div className="calendar-navigation">
              <button className="nav-btn" onClick={goToPreviousMonth}>
                ◀ Previous
              </button>
              <button className="today-btn" onClick={goToToday}>
                Today
              </button>
              <h2 className="month-title">{getMonthName(currentDate)}</h2>
              <button className="nav-btn" onClick={goToNextMonth}>
                Next ▶
              </button>
            </div>

            <div className="calendar-grid-container">
              <div className="calendar-weekdays">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                  <div key={day} className="weekday">
                    {day}
                  </div>
                ))}
              </div>
              <div className="calendar-grid">
                {renderCalendarGrid()}
              </div>
            </div>
          </>
        ) : (
          renderListView()
        )}

        <div className="calendar-legend">
          <div className="legend-section">
            <div className="legend-title">Event Priority:</div>
            {Object.entries(priorityColors).map(([priority, color]) => (
              <div key={priority} className="legend-item">
                <div className="legend-color" style={{ background: color }} />
                <span className="legend-label">{priority}</span>
              </div>
            ))}
          </div>
          
          <div className="legend-section">
            <div className="legend-title">Event Status:</div>
            {statusOptions.slice(0, 6).map(status => (
              <div key={status.value} className="legend-item">
                <div className="legend-color" style={{ background: status.color }} />
                <span className="legend-label">{status.icon} {status.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Add/Edit Event Modal (for manual events only) */}
        {showEventModal && (
          <div className="calendar-modal-overlay" onClick={() => setShowEventModal(false)}>
            <div className="calendar-modal" onClick={(e) => e.stopPropagation()}>
              <div className="calendar-modal-header">
                <h2 className="calendar-modal-title">
                  {selectedEvent ? '🖊️ Edit Event' : '➕ Add New Event'}
                </h2>
                <button 
                  className="calendar-modal-close"
                  onClick={() => setShowEventModal(false)}
                >
                  ✕
                </button>
              </div>

              <div className="calendar-modal-body">
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Plant (Optional)</label>
                    <select
                      className="form-input"
                      value={eventForm.plantId}
                      onChange={handlePlantSelect}
                    >
                      <option value="">No plant (General event)</option>
                      {plants.map(plant => (
                        <option key={plant.id} value={plant.id}>
                          {plant.plantName || plant.plantType} - Plot {plant.plotNumber}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Event Type</label>
                    <select
                      className="form-input"
                      value={eventForm.type}
                      onChange={(e) => setEventForm({ ...eventForm, type: e.target.value })}
                    >
                      {eventTypes.filter(t => t.value !== 'alert').map(type => (
                        <option key={type.value} value={type.value}>
                          {type.icon} {type.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group full-width">
                    <label className="form-label">Event Title *</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g., Stage start: Germination for Lettuce"
                      value={eventForm.title}
                      onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Event Date *</label>
                    <input
                      type="date"
                      className="form-input"
                      value={eventForm.date}
                      onChange={(e) => setEventForm({ ...eventForm, date: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Start Time (Optional)</label>
                    <input
                      type="time"
                      className="form-input"
                      value={eventForm.startTime}
                      onChange={(e) => setEventForm({ ...eventForm, startTime: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">End Time (Optional)</label>
                    <input
                      type="time"
                      className="form-input"
                      value={eventForm.endTime}
                      onChange={(e) => setEventForm({ ...eventForm, endTime: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Priority</label>
                    <select
                      className="form-input"
                      value={eventForm.priority}
                      onChange={(e) => setEventForm({ ...eventForm, priority: e.target.value })}
                    >
                      <option value="low">Low</option>
                      <option value="normal">Normal</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Status</label>
                    <select
                      className="form-input"
                      value={eventForm.status}
                      onChange={(e) => setEventForm({ ...eventForm, status: e.target.value })}
                    >
                      {statusOptions.map(status => (
                        <option key={status.value} value={status.value}>
                          {status.icon} {status.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group full-width">
                    <label className="form-label">Description (Optional)</label>
                    <textarea
                      className="form-textarea"
                      rows="3"
                      placeholder="Event description..."
                      value={eventForm.description}
                      onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })}
                    />
                  </div>

                  <div className="form-group full-width">
                    <label className="form-label">Notes (Optional)</label>
                    <textarea
                      className="form-textarea"
                      rows="2"
                      placeholder="Additional notes..."
                      value={eventForm.notes}
                      onChange={(e) => setEventForm({ ...eventForm, notes: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="calendar-modal-footer">
                <button
                  className="calendar-modal-btn cancel-btn"
                  onClick={() => setShowEventModal(false)}
                >
                  Cancel
                </button>
                <button
                  className="calendar-modal-btn save-btn"
                  onClick={handleSaveEvent}
                >
                  {selectedEvent ? 'Update' : 'Add'} Event
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Event Details Modal */}
        {showDetailsModal && selectedEvent && (
          <div className="calendar-modal-overlay" onClick={() => setShowDetailsModal(false)}>
            <div className="calendar-modal details-modal" onClick={(e) => e.stopPropagation()}>
              <div className="calendar-modal-header">
                <h2 className="calendar-modal-title">
                  {selectedEvent.isAlert ? '🚨 Alert Details' : '📋 Event Details'}
                </h2>
                <button 
                  className="calendar-modal-close"
                  onClick={() => setShowDetailsModal(false)}
                >
                  ✕
                </button>
              </div>

              <div className="calendar-modal-body">
                <div className="details-content">
                  <div className="detail-header">
                    <div className="detail-icon-large" style={{ background: getEventTypeConfig(selectedEvent.type).color }}>
                      {getEventTypeConfig(selectedEvent.type).icon}
                    </div>
                    <div className="detail-header-text">
                      <h3 className="detail-message">{selectedEvent.displayTitle}</h3>
                      <div className="detail-badges">
                        <span 
                          className="detail-status-badge"
                          style={{ 
                            background: statusColors[selectedEvent.status] || statusColors.info
                          }}
                        >
                          {getStatusConfig(selectedEvent.status).icon} {getStatusConfig(selectedEvent.status).label}
                        </span>
                        {selectedEvent.priority && (
                          <span 
                            className="detail-status-badge"
                            style={{ 
                              background: priorityColors[selectedEvent.priority]
                            }}
                          >
                            Priority: {selectedEvent.priority}
                          </span>
                        )}
                        {selectedEvent.isAlert && (
                          <span className="detail-status-badge alert-badge-modal">
                            System Alert
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="detail-divider" />

                  <div className="detail-row">
                    <span className="detail-label">Event Type:</span>
                    <span className="detail-value">
                      {getEventTypeConfig(selectedEvent.type).icon} {getEventTypeConfig(selectedEvent.type).label}
                    </span>
                  </div>

                  {selectedEvent.plantName && (
                    <div className="detail-row">
                      <span className="detail-label">Plant:</span>
                      <span className="detail-value">🌱 {selectedEvent.plantName}</span>
                    </div>
                  )}

                  {selectedEvent.plotNumber && (
                    <div className="detail-row">
                      <span className="detail-label">Plot Number:</span>
                      <span className="detail-value">📍 Plot {selectedEvent.plotNumber}</span>
                    </div>
                  )}

                  {selectedEvent.growthStage && (
                    <div className="detail-row">
                      <span className="detail-label">Growth Stage:</span>
                      <span className="detail-value">🌿 {selectedEvent.growthStage}</span>
                    </div>
                  )}

                  {selectedEvent.assignedTo && (
                    <div className="detail-row">
                      <span className="detail-label">Assigned To:</span>
                      <span className="detail-value">👤 {selectedEvent.assignedTo}</span>
                    </div>
                  )}

                  <div className="detail-row">
                    <span className="detail-label">Event Date:</span>
                    <span className="detail-value">
                      📅 {new Date(selectedEvent.eventDate).toLocaleDateString('en-US', { 
                        weekday: 'long', 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric' 
                      })}
                    </span>
                  </div>

                  {selectedEvent.startTime && (
                    <div className="detail-row">
                      <span className="detail-label">Time:</span>
                      <span className="detail-value">
                        🕐 {selectedEvent.startTime}
                        {selectedEvent.endTime && ` - ${selectedEvent.endTime}`}
                      </span>
                    </div>
                  )}

                  <div className="detail-row">
                    <span className="detail-label">Created:</span>
                    <span className="detail-value">
                      🕐 {new Date(selectedEvent.createdAt).toLocaleString('en-US', { 
                        year: 'numeric', 
                        month: 'short', 
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                      {selectedEvent.createdBy && ` by ${selectedEvent.createdBy}`}
                    </span>
                  </div>

                  {selectedEvent.updatedBy && (
                    <div className="detail-row">
                      <span className="detail-label">Last Updated:</span>
                      <span className="detail-value">
                        By {selectedEvent.updatedBy}
                      </span>
                    </div>
                  )}

                  {selectedEvent.description && (
                    <div className="detail-row full-width">
                      <span className="detail-label">Description:</span>
                      <p className="detail-notes">{selectedEvent.description}</p>
                    </div>
                  )}

                  {selectedEvent.notes && (
                    <div className="detail-row full-width">
                      <span className="detail-label">Notes:</span>
                      <p className="detail-notes">{selectedEvent.notes}</p>
                    </div>
                  )}

                  {/* Render alert-specific details */}
                  {selectedEvent.isAlert && renderAlertDetails(selectedEvent)}
                </div>
              </div>

              <div className="calendar-modal-footer">
                {canDelete && (
                  <button
                    className="calendar-modal-btn delete-btn"
                    onClick={() => handleDeleteEvent(selectedEvent.id, selectedEvent.isAlert)}
                  >
                    🗑️ Delete
                  </button>
                )}
                
                {/* Status Update Buttons */}
                {canEdit && (
                  <div className="status-update-section">
                    {selectedEvent.status !== 'completed' && selectedEvent.status !== 'resolved' && (
                      <>
                        {selectedEvent.status === 'pending' && (
                          <button
                            className="calendar-modal-btn status-btn in-progress-btn"
                            onClick={() => handleUpdateStatus(selectedEvent.id, 'in-progress')}
                          >
                            🔄 Start
                          </button>
                        )}
                        {(selectedEvent.status === 'in-progress' || selectedEvent.status === 'pending') && (
                          <button
                            className="calendar-modal-btn status-btn completed-btn"
                            onClick={() => handleUpdateStatus(selectedEvent.id, selectedEvent.isAlert ? 'resolved' : 'completed')}
                          >
                            ✅ {selectedEvent.isAlert ? 'Resolve' : 'Complete'}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
                
                {!selectedEvent.isAlert && canEdit && (
                  <button
                    className="calendar-modal-btn"
                    onClick={() => handleEditEvent(selectedEvent)}
                  >
                    🖊️ Edit
                  </button>
                )}
                
                <button
                  className="calendar-modal-btn cancel-btn"
                  onClick={() => setShowDetailsModal(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default AdminCalendar