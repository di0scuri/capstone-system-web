import React, { useState, useEffect, useRef } from 'react'
import Sidebar from './sidebar'
import './greenhouse.css'
import { 
  collection, 
  getDocs, 
  doc, 
  setDoc, 
  updateDoc, 
  serverTimestamp, 
  getDoc, 
  addDoc,
  onSnapshot,
  query,
  orderBy
} from 'firebase/firestore'
import { db } from '../firebase'

const Greenhouse = ({ userType = 'admin' }) => {
  const [activeMenu, setActiveMenu] = useState('Greenhouse')
  const [activeTab, setActiveTab] = useState('layout')
  const canvasRef = useRef(null)
  
  // Greenhouse configuration state
  const [greenhouse, setGreenhouse] = useState({
    dimensions: { length: 20, width: 15, height: 3, unit: 'meters' },
    orientation: 'north',
    plots: [],
    sensors: [],
    lastUpdated: new Date()
  })
  
  // Plants data from Firebase
  const [plantsData, setPlantsData] = useState([])
  const [availablePlantTypes, setAvailablePlantTypes] = useState([])
  
  // Sensor data from Firebase - NEW
  const [sensorReadings, setSensorReadings] = useState({})
  const [realTimeSensorData, setRealTimeSensorData] = useState({})
  const [sensorListeners, setSensorListeners] = useState([])
  
  // UI state
  const [selectedTool, setSelectedTool] = useState('select')
  const [selectedItem, setSelectedItem] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [modalType, setModalType] = useState('')
  const [scale, setScale] = useState(20)
  const [loading, setLoading] = useState(true)

  // Form states
  const [dimensionForm, setDimensionForm] = useState(greenhouse.dimensions)
  const [plotForm, setPlotForm] = useState({
    name: '',
    cropType: '',
    plantId: '',
    plantingDate: '',
    status: 'available',
    position: { x: 0, y: 0, width: 2, height: 3 }
  })
  const [sensorForm, setSensorForm] = useState({
    type: 'soil_npk',
    firebaseName: '',
    position: { x: 0, y: 0 },
    assignedPlots: []
  })

  const sensorTypes = [
    { id: 'soil_npk', name: 'Soil NPK Sensor', color: '#4CAF50', range: 2, firebasePrefix: 'SoilSensor' },
    { id: 'temperature', name: 'Temperature Sensor', color: '#FF9800', range: 5, firebasePrefix: 'TempSensor' },
    { id: 'humidity', name: 'Humidity Sensor', color: '#2196F3', range: 4, firebasePrefix: 'HumiditySensor' },
    { id: 'light', name: 'Light Sensor', color: '#FFEB3B', range: 3, firebasePrefix: 'LightSensor' },
    { id: 'ph', name: 'pH Sensor', color: '#E91E63', range: 1.5, firebasePrefix: 'pHSensor' }
  ]

  const plotStatuses = [
    { value: 'available', label: 'Available', color: '#4CAF50' },
    { value: 'occupied', label: 'Occupied/Growing', color: '#2196F3' },
    { value: 'maintenance', label: 'Under Maintenance', color: '#FF9800' },
    { value: 'harvesting', label: 'Ready for Harvest', color: '#9C27B0' },
    { value: 'fallow', label: 'Fallow/Resting', color: '#795548' }
  ]

  // Generate Firebase sensor name based on type and existing sensors
  const generateSensorFirebaseName = (sensorType) => {
    const prefix = sensorTypes.find(t => t.id === sensorType)?.firebasePrefix || 'Sensor'
    const existingSensors = greenhouse.sensors.filter(s => 
      s.firebaseName?.startsWith(prefix)
    )
    
    if (existingSensors.length === 0) {
      return prefix
    } else {
      return `${prefix}${existingSensors.length + 1}`
    }
  }

  // Load sensor readings from Firebase real-time database
  const loadSensorReadings = async () => {
    try {
      const sensorNames = greenhouse.sensors.map(sensor => sensor.firebaseName).filter(Boolean)
      
      for (const sensorName of sensorNames) {
        const unsubscribe = onSnapshot(doc(db, sensorName, 'current'), (doc) => {
          if (doc.exists()) {
            const data = doc.data()
            setRealTimeSensorData(prev => ({
              ...prev,
              [sensorName]: {
                ...data,
                timestamp: new Date(),
                sensorName
              }
            }))
            console.log(`Real-time data for ${sensorName}:`, data)
          } else {
            console.log(`No data found for sensor: ${sensorName}`)
          }
        }, (error) => {
          console.error(`Error listening to ${sensorName}:`, error)
        })
        
        setSensorListeners(prev => [...prev, { sensorName, unsubscribe }])
      }
    } catch (error) {
      console.error('Error setting up sensor listeners:', error)
    }
  }

  // Save sensor reading to Firebase
  const saveSensorReading = async (sensorName, readings) => {
    try {
      await setDoc(doc(db, sensorName, 'current'), {
        ...readings,
        timestamp: serverTimestamp(),
        lastUpdated: new Date().toISOString()
      })
      
      await addDoc(collection(db, `${sensorName}_history`), {
        ...readings,
        timestamp: serverTimestamp()
      })
      
      console.log(`Saved reading for ${sensorName}:`, readings)
    } catch (error) {
      console.error(`Error saving reading for ${sensorName}:`, error)
    }
  }

  // Simulate sensor data (replace with actual sensor integration)
  const simulateSensorData = async (sensorName) => {
    const mockData = {
      Conductivity: Math.random() * 5,
      Moisture: Math.random() * 10,
      Nitrogen: Math.floor(Math.random() * 5000),
      Phosphorus: Math.random() * 200,
      Potassium: Math.random() * 300,
      Temperature: 15 + Math.random() * 25,
      pH: 6 + Math.random() * 2
    }
    
    await saveSensorReading(sensorName, mockData)
  }

  // Load plants data from Firebase
  const loadPlantsData = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'plants'))
      const plants = []
      const plantTypes = new Set()
      
      querySnapshot.forEach((doc) => {
        const plantData = {
          id: doc.id,
          ...doc.data(),
          datePlanted: doc.data().datePlanted?.toDate() || null
        }
        plants.push(plantData)
        if (plantData.type) {
          plantTypes.add(plantData.type)
        }
      })
      
      setPlantsData(plants)
      setAvailablePlantTypes(Array.from(plantTypes))
    } catch (error) {
      console.error('Error loading plants data:', error)
    }
  }

  // Load greenhouse data from Firestore
  const loadGreenhouseData = async () => {
    setLoading(true)
    try {
      const docRef = doc(db, 'greenhouse', 'main-greenhouse')
      const docSnap = await getDoc(docRef)
      
      if (docSnap.exists()) {
        const data = docSnap.data()
        
        setGreenhouse({
          dimensions: data.dimensions || { length: 20, width: 15, height: 3, unit: 'meters' },
          orientation: data.orientation || 'north',
          plots: data.plots || [],
          sensors: data.sensors || [],
          lastUpdated: data.lastUpdated?.toDate() || new Date()
        })
        
        setDimensionForm(data.dimensions || { length: 20, width: 15, height: 3, unit: 'meters' })
      } else {
        await createDefaultGreenhouse()
      }
    } catch (error) {
      console.error('Error loading greenhouse data:', error)
    } finally {
      setLoading(false)
    }
  }

  // Create default greenhouse document
  const createDefaultGreenhouse = async () => {
    try {
      const defaultData = {
        dimensions: { length: 20, width: 15, height: 3, unit: 'meters' },
        orientation: 'north',
        plots: [],
        sensors: [],
        lastUpdated: serverTimestamp()
      }
      
      await setDoc(doc(db, 'greenhouse', 'main-greenhouse'), defaultData)
    } catch (error) {
      console.error('Error creating default greenhouse:', error)
    }
  }

  // Save greenhouse data to Firestore
  const saveGreenhouseData = async () => {
    try {
      const docRef = doc(db, 'greenhouse', 'main-greenhouse')
      await setDoc(docRef, {
        dimensions: greenhouse.dimensions,
        orientation: greenhouse.orientation,
        plots: greenhouse.plots,
        sensors: greenhouse.sensors,
        lastUpdated: serverTimestamp()
      })
      alert('Greenhouse configuration saved successfully!')
    } catch (error) {
      console.error('Error saving greenhouse data:', error)
      alert('Error saving greenhouse data. Please try again.')
    }
  }

  // Create a new plant entry in Firebase when adding a plot with a plant
  const createPlantEntry = async (plotData) => {
    try {
      const plantRef = await addDoc(collection(db, 'plants'), {
        name: `${plotData.cropType} - ${plotData.name}`,
        type: plotData.cropType,
        status: 'Seeding',
        datePlanted: new Date(plotData.plantingDate),
        areaOccupiedSqM: plotData.position.width * plotData.position.height,
        locationZone: 'Default Zone',
        initialSeedQuantity: 10,
        imageUrl: `plantimages/${plotData.cropType}`,
        ownerUid: 'system',
        seedId: `seed-${Date.now()}`
      })
      
      return plantRef.id
    } catch (error) {
      console.error('Error creating plant entry:', error)
      return null
    }
  }

  // Cleanup sensor listeners on unmount
  useEffect(() => {
    return () => {
      sensorListeners.forEach(({ unsubscribe }) => {
        if (unsubscribe) unsubscribe()
      })
    }
  }, [sensorListeners])

  useEffect(() => {
    loadGreenhouseData()
    loadPlantsData()
  }, [])

  // Load sensor readings when greenhouse sensors change
  useEffect(() => {
    if (greenhouse.sensors.length > 0) {
      sensorListeners.forEach(({ unsubscribe }) => {
        if (unsubscribe) unsubscribe()
      })
      setSensorListeners([])
      
      loadSensorReadings()
    }
  }, [greenhouse.sensors])

  useEffect(() => {
    if (!loading) {
      drawCanvas()
    }
  }, [greenhouse, selectedItem, scale, loading, realTimeSensorData])

  // Canvas drawing functions
  const drawCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    const { length, width } = greenhouse.dimensions
    
    canvas.width = length * scale + 100
    canvas.height = width * scale + 100
    
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    
    // Draw greenhouse outline
    ctx.strokeStyle = '#333'
    ctx.lineWidth = 3
    ctx.strokeRect(50, 50, length * scale, width * scale)
    
    // Draw grid
    ctx.strokeStyle = '#e0e0e0'
    ctx.lineWidth = 1
    for (let i = 0; i <= length; i++) {
      ctx.beginPath()
      ctx.moveTo(50 + i * scale, 50)
      ctx.lineTo(50 + i * scale, 50 + width * scale)
      ctx.stroke()
    }
    for (let i = 0; i <= width; i++) {
      ctx.beginPath()
      ctx.moveTo(50, 50 + i * scale)
      ctx.lineTo(50 + length * scale, 50 + i * scale)
      ctx.stroke()
    }
    
    // Draw plots
    greenhouse.plots.forEach(plot => {
      const isSelected = selectedItem?.type === 'plot' && selectedItem?.id === plot.id
      const plotStatus = plotStatuses.find(s => s.value === plot.status) || plotStatuses[0]
      const plantData = plot.plantId ? plantsData.find(p => p.id === plot.plantId) : null
      
      ctx.fillStyle = isSelected ? 
        `${plotStatus.color}50` : 
        `${plotStatus.color}30`
      ctx.strokeStyle = isSelected ? plotStatus.color : `${plotStatus.color}CC`
      ctx.lineWidth = isSelected ? 3 : 2
      
      const x = 50 + plot.position.x * scale
      const y = 50 + plot.position.y * scale
      const w = plot.position.width * scale
      const h = plot.position.height * scale
      
      ctx.fillRect(x, y, w, h)
      ctx.strokeRect(x, y, w, h)
      
      // Draw plot label
      ctx.fillStyle = '#333'
      ctx.font = '12px Arial'
      ctx.fillText(plot.name, x + 5, y + 15)
      
      if (plantData) {
        ctx.fillText(plantData.name || plot.cropType, x + 5, y + 30)
        ctx.fillText(`Status: ${plantData.status}`, x + 5, y + 45)
      } else {
        ctx.fillText(plot.cropType || 'No plant', x + 5, y + 30)
      }
      
      ctx.fillStyle = plotStatus.color
      ctx.font = 'bold 10px Arial'
      ctx.fillText(plotStatus.label.toUpperCase(), x + 5, y + h - 5)
    })
    
    // Draw sensors with real-time data
    greenhouse.sensors.forEach(sensor => {
      const sensorType = sensorTypes.find(t => t.id === sensor.type) || sensorTypes[0]
      const isSelected = selectedItem?.type === 'sensor' && selectedItem?.id === sensor.id
      const sensorData = realTimeSensorData[sensor.firebaseName]
      
      const x = 50 + sensor.position.x * scale
      const y = 50 + sensor.position.y * scale
      
      // Draw sensor range
      if (isSelected || selectedTool === 'sensor') {
        ctx.fillStyle = `${sensorType.color}20`
        ctx.strokeStyle = `${sensorType.color}40`
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(x, y, sensorType.range * scale, 0, 2 * Math.PI)
        ctx.fill()
        ctx.stroke()
      }
      
      // Draw sensor icon - different color if data is available
      const hasData = sensorData && Object.keys(sensorData).length > 2
      ctx.fillStyle = hasData ? 
        (isSelected ? sensorType.color : `${sensorType.color}CC`) :
        (isSelected ? '#999' : '#666666')
      
      ctx.beginPath()
      ctx.arc(x, y, 8, 0, 2 * Math.PI)
      ctx.fill()
      
      ctx.strokeStyle = isSelected ? '#333' : '#666'
      ctx.lineWidth = 2
      ctx.stroke()
      
      // Draw sensor label with data indicator
      ctx.fillStyle = '#333'
      ctx.font = '11px Arial'
      ctx.fillText(sensor.firebaseName || sensorType.name.split(' ')[0], x + 12, y + 4)
      
      // Show data status
      if (hasData) {
        ctx.fillStyle = '#4CAF50'
        ctx.font = 'bold 9px Arial'
        ctx.fillText('LIVE', x + 12, y + 16)
      } else {
        ctx.fillStyle = '#f44336'
        ctx.font = '9px Arial'
        ctx.fillText('OFFLINE', x + 12, y + 16)
      }
    })
    
    // Draw measurements
    ctx.fillStyle = '#666'
    ctx.font = '12px Arial'
    ctx.fillText(`${length}m`, 50 + length * scale / 2 - 10, 40)
    ctx.save()
    ctx.translate(35, 50 + width * scale / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.fillText(`${width}m`, -10, 0)
    ctx.restore()
  }

  // Canvas event handlers
  const handleCanvasClick = (e) => {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left - 50) / scale
    const y = (e.clientY - rect.top - 50) / scale
    
    if (x < 0 || y < 0 || x > greenhouse.dimensions.length || y > greenhouse.dimensions.width) {
      return
    }
    
    if (selectedTool === 'plot') {
      setPlotForm({
        ...plotForm,
        position: { ...plotForm.position, x: Math.floor(x), y: Math.floor(y) }
      })
      setModalType('plot')
      setShowModal(true)
    } else if (selectedTool === 'sensor') {
      const firebaseName = generateSensorFirebaseName(sensorForm.type)
      setSensorForm({
        ...sensorForm,
        firebaseName,
        position: { x: Math.round(x * 2) / 2, y: Math.round(y * 2) / 2 }
      })
      setModalType('sensor')
      setShowModal(true)
    } else if (selectedTool === 'select') {
      let clickedItem = null
      
      // Check plots
      greenhouse.plots.forEach(plot => {
        const px = plot.position.x
        const py = plot.position.y
        const pw = plot.position.width
        const ph = plot.position.height
        
        if (x >= px && x <= px + pw && y >= py && y <= py + ph) {
          clickedItem = { type: 'plot', id: plot.id, data: plot }
        }
      })
      
      // Check sensors
      greenhouse.sensors.forEach(sensor => {
        const sx = sensor.position.x
        const sy = sensor.position.y
        const distance = Math.sqrt((x - sx) ** 2 + (y - sy) ** 2)
        
        if (distance <= 0.5) {
          clickedItem = { type: 'sensor', id: sensor.id, data: sensor }
        }
      })
      
      setSelectedItem(clickedItem)
    }
  }

  // Add plot
  const handleAddPlot = async () => {
    const { length, width } = greenhouse.dimensions
    
    if (!plotForm.name.trim()) {
      alert('Please enter a plot name')
      return
    }
    
    if (!plotForm.cropType) {
      alert('Please select a crop type')
      return
    }
    
    if (plotForm.position.x + plotForm.position.width > length) {
      alert('Plot exceeds greenhouse length')
      return
    }
    if (plotForm.position.y + plotForm.position.height > width) {
      alert('Plot exceeds greenhouse width')
      return
    }
    
    const hasOverlap = greenhouse.plots.some(plot => {
      const p1 = plotForm.position
      const p2 = plot.position
      return !(p1.x >= p2.x + p2.width || p2.x >= p1.x + p1.width || 
               p1.y >= p2.y + p2.height || p2.y >= p1.y + p1.height)
    })
    
    if (hasOverlap) {
      alert('Plot overlaps with existing plot')
      return
    }
    
    let plantId = null
    if (plotForm.cropType && plotForm.status === 'occupied') {
      plantId = await createPlantEntry(plotForm)
    }
    
    const newPlot = {
      id: `plot${Date.now()}`,
      name: plotForm.name,
      cropType: plotForm.cropType,
      plantId: plantId,
      plantingDate: plotForm.plantingDate || new Date().toISOString().split('T')[0],
      status: plotForm.status,
      position: plotForm.position
    }
    
    setGreenhouse({
      ...greenhouse,
      plots: [...greenhouse.plots, newPlot]
    })
    
    await loadPlantsData()
    
    setShowModal(false)
    setPlotForm({
      name: '',
      cropType: '',
      plantId: '',
      plantingDate: '',
      status: 'available',
      position: { x: 0, y: 0, width: 2, height: 3 }
    })
  }

  // Add sensor
  const handleAddSensor = () => {
    const existingSensor = greenhouse.sensors.find(sensor => 
      sensor.position.x === sensorForm.position.x && sensor.position.y === sensorForm.position.y
    )
    
    if (existingSensor) {
      alert('A sensor already exists at this position')
      return
    }
    
    const newSensor = {
      id: `sensor${Date.now()}`,
      type: sensorForm.type,
      firebaseName: sensorForm.firebaseName,
      position: sensorForm.position,
      assignedPlots: sensorForm.assignedPlots
    }
    
    setGreenhouse({
      ...greenhouse,
      sensors: [...greenhouse.sensors, newSensor]
    })
    
    setShowModal(false)
    setSensorForm({
      type: 'soil_npk',
      firebaseName: '',
      position: { x: 0, y: 0 },
      assignedPlots: []
    })
  }

  // Test sensor data function
  const handleTestSensorData = (sensorName) => {
    simulateSensorData(sensorName)
  }

  const handleUpdateDimensions = () => {
    if (dimensionForm.length <= 0 || dimensionForm.width <= 0 || dimensionForm.height <= 0) {
      alert('All dimensions must be greater than 0')
      return
    }
    
    const exceedingPlots = greenhouse.plots.filter(plot => 
      plot.position.x + plot.position.width > dimensionForm.length ||
      plot.position.y + plot.position.height > dimensionForm.width
    )
    
    if (exceedingPlots.length > 0) {
      const confirm = window.confirm(
        `${exceedingPlots.length} plot(s) will exceed the new dimensions. Continue anyway?`
      )
      if (!confirm) return
    }
    
    setGreenhouse({
      ...greenhouse,
      dimensions: dimensionForm
    })
  }

  const handleDeleteSelected = () => {
    if (!selectedItem) return
    
    const confirm = window.confirm(`Delete this ${selectedItem.type}?`)
    if (!confirm) return
    
    if (selectedItem.type === 'plot') {
      const updatedSensors = greenhouse.sensors.map(sensor => ({
        ...sensor,
        assignedPlots: sensor.assignedPlots?.filter(plotId => plotId !== selectedItem.id) || []
      }))
      
      setGreenhouse({
        ...greenhouse,
        plots: greenhouse.plots.filter(plot => plot.id !== selectedItem.id),
        sensors: updatedSensors
      })
    } else if (selectedItem.type === 'sensor') {
      setGreenhouse({
        ...greenhouse,
        sensors: greenhouse.sensors.filter(sensor => sensor.id !== selectedItem.id)
      })
    }
    
    setSelectedItem(null)
  }

  const totalPlotArea = greenhouse.plots.reduce((sum, plot) => 
    sum + (plot.position.width * plot.position.height), 0
  )
  const totalGreenhouseArea = greenhouse.dimensions.length * greenhouse.dimensions.width
  const utilizationPercentage = (totalPlotArea / totalGreenhouseArea * 100).toFixed(1)

  if (loading) {
    return (
      <div className="dashboard-container">
        <Sidebar activeMenu={activeMenu} setActiveMenu={setActiveMenu} userType={userType} />
        <div className="greenhouse-main">
          <div className="loading-center">Loading greenhouse data...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard-container">
      <Sidebar 
        activeMenu={activeMenu}
        setActiveMenu={setActiveMenu}
        userType={userType}
      />

      <div className="greenhouse-main">
        <div className="greenhouse-header">
          <div className="header-left">
            <h1>Greenhouse Management</h1>
            <p>Design and configure your greenhouse layout - {plantsData.length} plants, {Object.keys(realTimeSensorData).length} active sensors</p>
          </div>
          <div className="header-actions">
            <button className="save-btn" onClick={saveGreenhouseData}>
              Save Configuration
            </button>
            <div className="notification-btn">🔔</div>
          </div>
        </div>

        <div className="greenhouse-tabs">
          <button 
            className={`tab-btn ${activeTab === 'layout' ? 'active' : ''}`}
            onClick={() => setActiveTab('layout')}
          >
            Layout Designer
          </button>
          <button 
            className={`tab-btn ${activeTab === 'config' ? 'active' : ''}`}
            onClick={() => setActiveTab('config')}
          >
            Configuration
          </button>
          <button 
            className={`tab-btn ${activeTab === 'sensors' ? 'active' : ''}`}
            onClick={() => setActiveTab('sensors')}
          >
            Sensor Data
          </button>
          <button 
            className={`tab-btn ${activeTab === 'summary' ? 'active' : ''}`}
            onClick={() => setActiveTab('summary')}
          >
            Summary
          </button>
        </div>

        <div className="greenhouse-content">
          {activeTab === 'layout' && (
            <div className="layout-designer">
              <div className="designer-toolbar">
                <div className="tool-group">
                  <button 
                    className={`tool-btn ${selectedTool === 'select' ? 'active' : ''}`}
                    onClick={() => setSelectedTool('select')}
                    title="Select Tool"
                  >
                    🔍 Select
                  </button>
                  <button 
                    className={`tool-btn ${selectedTool === 'plot' ? 'active' : ''}`}
                    onClick={() => setSelectedTool('plot')}
                    title="Add Plot"
                  >
                    🌱 Add Plot
                  </button>
                  <button 
                    className={`tool-btn ${selectedTool === 'sensor' ? 'active' : ''}`}
                    onClick={() => setSelectedTool('sensor')}
                    title="Add Sensor"
                  >
                    📡 Add Sensor
                  </button>
                </div>
                
                <div className="tool-group">
                  <label>Scale: </label>
                  <input 
                    type="range" 
                    min="10" 
                    max="40" 
                    value={scale}
                    onChange={(e) => setScale(Number(e.target.value))}
                  />
                  <span>{scale}px/m</span>
                </div>
                
                {selectedItem && (
                  <div className="tool-group">
                    <span>Selected: {selectedItem.data.name || selectedItem.data.firebaseName || `${selectedItem.type}`}</span>
                    <button className="delete-btn" onClick={handleDeleteSelected}>
                      🗑️ Delete
                    </button>
                  </div>
                )}
              </div>

              <div className="canvas-container">
                <canvas 
                  ref={canvasRef}
                  onClick={handleCanvasClick}
                  className="greenhouse-canvas"
                />
              </div>

              <div className="stats-panel">
                <div className="stat-item">
                  <span>Total Area:</span>
                  <span>{totalGreenhouseArea}m²</span>
                </div>
                <div className="stat-item">
                  <span>Plot Area:</span>
                  <span>{totalPlotArea}m²</span>
                </div>
                <div className="stat-item">
                  <span>Utilization:</span>
                  <span>{utilizationPercentage}%</span>
                </div>
                <div className="stat-item">
                  <span>Plots:</span>
                  <span>{greenhouse.plots.length}</span>
                </div>
                <div className="stat-item">
                  <span>Sensors:</span>
                  <span>{greenhouse.sensors.length}</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'config' && (
            <div className="config-panel">
              <div className="config-section">
                <h3>Greenhouse Dimensions</h3>
                <div className="dimension-inputs">
                  <div className="input-group">
                    <label>Length (m)</label>
                    <input 
                      type="number" 
                      value={dimensionForm.length}
                      onChange={(e) => setDimensionForm({
                        ...dimensionForm, 
                        length: Number(e.target.value)
                      })}
                    />
                  </div>
                  <div className="input-group">
                    <label>Width (m)</label>
                    <input 
                      type="number" 
                      value={dimensionForm.width}
                      onChange={(e) => setDimensionForm({
                        ...dimensionForm, 
                        width: Number(e.target.value)
                      })}
                    />
                  </div>
                  <div className="input-group">
                    <label>Height (m)</label>
                    <input 
                      type="number" 
                      value={dimensionForm.height}
                      onChange={(e) => setDimensionForm({
                        ...dimensionForm, 
                        height: Number(e.target.value)
                      })}
                    />
                  </div>
                  <button className="update-btn" onClick={handleUpdateDimensions}>
                    Update Dimensions
                  </button>
                </div>
              </div>

              <div className="config-section">
                <h3>Existing Plots ({greenhouse.plots.length})</h3>
                
                <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
                  {plotStatuses.map(status => {
                    const count = greenhouse.plots.filter(plot => plot.status === status.value).length
                    return (
                      <div key={status.value} style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '6px',
                        padding: '4px 8px',
                        background: '#f8fafb',
                        borderRadius: '6px',
                        fontSize: '12px'
                      }}>
                        <div style={{ 
                          width: '12px', 
                          height: '12px', 
                          backgroundColor: status.color, 
                          borderRadius: '2px' 
                        }} />
                        <span>{status.label}: {count}</span>
                      </div>
                    )
                  })}
                </div>
                
                <div className="items-list">
                  {greenhouse.plots.length === 0 ? (
                    <p style={{color: '#7f8c8d', fontStyle: 'italic'}}>No plots configured yet</p>
                  ) : (
                    greenhouse.plots.map(plot => {
                      const plotStatus = plotStatuses.find(s => s.value === plot.status) || plotStatuses[0]
                      const plantData = plot.plantId ? plantsData.find(p => p.id === plot.plantId) : null
                      
                      return (
                        <div key={plot.id} className="item-card" style={{
                          borderLeft: `4px solid ${plotStatus.color}`
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                            <h4>{plot.name}</h4>
                            <span style={{
                              background: plotStatus.color,
                              color: 'white',
                              fontSize: '11px',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontWeight: '600'
                            }}>
                              {plotStatus.label}
                            </span>
                          </div>
                          <p>Crop: {plot.cropType || 'None'}</p>
                          <p>Size: {plot.position.width}m × {plot.position.height}m</p>
                          <p>Area: {(plot.position.width * plot.position.height).toFixed(1)}m²</p>
                          {plantData && (
                            <>
                              <p>Plant Status: {plantData.status}</p>
                              <p>Seed Quantity: {plantData.initialSeedQuantity}</p>
                              {plantData.datePlanted && (
                                <p>Planted: {plantData.datePlanted.toLocaleDateString()}</p>
                              )}
                            </>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              </div>

              <div className="config-section">
                <h3>Existing Sensors ({greenhouse.sensors.length})</h3>
                <div className="items-list">
                  {greenhouse.sensors.length === 0 ? (
                    <p style={{color: '#7f8c8d', fontStyle: 'italic'}}>No sensors configured yet</p>
                  ) : (
                    greenhouse.sensors.map(sensor => {
                      const sensorType = sensorTypes.find(t => t.id === sensor.type) || sensorTypes[0]
                      const sensorData = realTimeSensorData[sensor.firebaseName]
                      const isActive = sensorData && Object.keys(sensorData).length > 2
                      
                      return (
                        <div key={sensor.id} className="item-card" style={{
                          borderLeft: `4px solid ${isActive ? '#4CAF50' : '#f44336'}`
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                            <h4>{sensor.firebaseName}</h4>
                            <span style={{
                              background: isActive ? '#4CAF50' : '#f44336',
                              color: 'white',
                              fontSize: '11px',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontWeight: '600'
                            }}>
                              {isActive ? 'LIVE' : 'OFFLINE'}
                            </span>
                          </div>
                          <p>Type: {sensorType.name}</p>
                          <p>Position: ({sensor.position.x}, {sensor.position.y})</p>
                          <p>Assigned Plots: {sensor.assignedPlots?.length || 0}</p>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'sensors' && (
            <div className="config-panel">
              <div className="config-section">
                <h3>Real-time Sensor Data</h3>
                <p style={{color: '#7f8c8d', marginBottom: '20px'}}>
                  Monitoring {greenhouse.sensors.length} sensors - {Object.keys(realTimeSensorData).length} active
                </p>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
                  {greenhouse.sensors.map(sensor => {
                    const sensorData = realTimeSensorData[sensor.firebaseName]
                    const sensorType = sensorTypes.find(t => t.id === sensor.type) || sensorTypes[0]
                    const hasData = sensorData && Object.keys(sensorData).length > 2
                    
                    return (
                      <div key={sensor.id} style={{
                        background: 'white',
                        padding: '20px',
                        borderRadius: '12px',
                        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
                        borderLeft: `4px solid ${hasData ? sensorType.color : '#999'}`
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                          <h4 style={{ margin: 0 }}>{sensor.firebaseName}</h4>
                          <span style={{
                            background: hasData ? '#4CAF50' : '#f44336',
                            color: 'white',
                            fontSize: '11px',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontWeight: '600'
                          }}>
                            {hasData ? '● LIVE' : '● OFFLINE'}
                          </span>
                        </div>
                        
                        <p style={{ fontSize: '12px', color: '#7f8c8d', marginBottom: '12px' }}>
                          {sensorType.name}
                        </p>
                        
                        {hasData ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {Object.entries(sensorData).map(([key, value]) => {
                              if (key === 'timestamp' || key === 'sensorName' || key === 'lastUpdated') return null
                              return (
                                <div key={key} style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  padding: '8px',
                                  background: '#f8fafb',
                                  borderRadius: '6px'
                                }}>
                                  <span style={{ fontSize: '14px', fontWeight: '500', color: '#2c3e50' }}>{key}</span>
                                  <span style={{ fontSize: '14px', fontWeight: '600', color: sensorType.color }}>
                                    {typeof value === 'number' ? value.toFixed(2) : value}
                                  </span>
                                </div>
                              )
                            })}
                            <p style={{ fontSize: '11px', color: '#7f8c8d', marginTop: '8px', marginBottom: 0 }}>
                              Last update: {sensorData.timestamp?.toLocaleTimeString() || 'Unknown'}
                            </p>
                          </div>
                        ) : (
                          <div style={{ textAlign: 'center', padding: '20px 0' }}>
                            <p style={{ color: '#7f8c8d', marginBottom: '12px' }}>No data available</p>
                            <button 
                              onClick={() => handleTestSensorData(sensor.firebaseName)}
                              style={{
                                background: sensorType.color,
                                color: 'white',
                                border: 'none',
                                padding: '8px 16px',
                                borderRadius: '6px',
                                fontSize: '12px',
                                cursor: 'pointer'
                              }}
                            >
                              Test Sensor
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                  
                  {greenhouse.sensors.length === 0 && (
                    <div style={{
                      gridColumn: '1 / -1',
                      textAlign: 'center',
                      padding: '40px',
                      color: '#7f8c8d'
                    }}>
                      <p>No sensors configured. Add sensors in the Layout Designer tab.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'summary' && (
            <div className="summary-panel">
              <div className="summary-stats">
                <div className="summary-card">
                  <h3>Greenhouse Overview</h3>
                  <div className="overview-grid">
                    <div>Dimensions: {greenhouse.dimensions.length}m × {greenhouse.dimensions.width}m × {greenhouse.dimensions.height}m</div>
                    <div>Total Area: {totalGreenhouseArea}m²</div>
                    <div>Total Volume: {(totalGreenhouseArea * greenhouse.dimensions.height).toFixed(1)}m³</div>
                    <div>Orientation: {greenhouse.orientation}</div>
                    <div>Total Plants: {plantsData.length}</div>
                    <div>Active Sensors: {Object.keys(realTimeSensorData).length} / {greenhouse.sensors.length}</div>
                  </div>
                </div>

                <div className="summary-card">
                  <h3>Utilization</h3>
                  <div className="utilization-bar">
                    <div 
                      className="utilization-fill" 
                      style={{ width: `${utilizationPercentage}%` }}
                    />
                  </div>
                  <p>{utilizationPercentage}% of greenhouse space utilized</p>
                </div>

                <div className="summary-card">
                  <h3>Plot Status Overview</h3>
                  <div className="crop-list">
                    {plotStatuses.map(status => {
                      const plots = greenhouse.plots.filter(p => p.status === status.value)
                      const totalArea = plots.reduce((sum, p) => sum + (p.position.width * p.position.height), 0)
                      
                      return (
                        <div key={status.value} className="crop-item">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ 
                              width: '12px', 
                              height: '12px', 
                              backgroundColor: status.color, 
                              borderRadius: '2px' 
                            }} />
                            <span>{status.label}</span>
                          </div>
                          <span>{plots.length} plots ({totalArea.toFixed(1)}m²)</span>
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="summary-card">
                  <h3>Plant Distribution</h3>
                  <div className="crop-list">
                    {availablePlantTypes.length === 0 ? (
                      <p style={{color: '#7f8c8d', fontStyle: 'italic'}}>No plants tracked yet</p>
                    ) : (
                      availablePlantTypes.map(plantType => {
                        const plantsOfType = plantsData.filter(p => p.type === plantType)
                        const totalArea = plantsOfType.reduce((sum, p) => sum + (p.areaOccupiedSqM || 0), 0)
                        
                        return (
                          <div key={plantType} className="crop-item">
                            <span>{plantType}</span>
                            <span>
                              {plantsOfType.length} plants ({totalArea.toFixed(1)}m²)
                            </span>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>

                <div className="summary-card">
                  <h3>Sensor Status</h3>
                  <div className="crop-list">
                    <div className="crop-item">
                      <span>Total Sensors</span>
                      <span>{greenhouse.sensors.length}</span>
                    </div>
                    <div className="crop-item">
                      <span>Active Sensors</span>
                      <span style={{color: '#4CAF50', fontWeight: '600'}}>
                        {Object.keys(realTimeSensorData).length}
                      </span>
                    </div>
                    <div className="crop-item">
                      <span>Offline Sensors</span>
                      <span style={{color: '#f44336', fontWeight: '600'}}>
                        {greenhouse.sensors.length - Object.keys(realTimeSensorData).length}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modals */}
        {showModal && modalType === 'plot' && (
          <div className="modal-overlay" onClick={() => setShowModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3 style={{ color: '#4CAF50' }}>Add New Plot</h3>
                <button onClick={() => setShowModal(false)}>×</button>
              </div>
              <div className="modal-body">
                <div className="form-group">
                  <label>Plot Name</label>
                  <input 
                    type="text"
                    value={plotForm.name}
                    onChange={(e) => setPlotForm({...plotForm, name: e.target.value})}
                    placeholder="e.g., Tomatoes Section A"
                  />
                </div>
                <div className="form-group">
                  <label>Crop Type</label>
                  <select 
                    value={plotForm.cropType}
                    onChange={(e) => setPlotForm({...plotForm, cropType: e.target.value})}
                  >
                    <option value="">Select Crop</option>
                    {availablePlantTypes.map(type => (
                      <option key={type} value={type}>{type.charAt(0).toUpperCase() + type.slice(1)}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Plot Status</label>
                  <select 
                    value={plotForm.status}
                    onChange={(e) => setPlotForm({...plotForm, status: e.target.value})}
                  >
                    {plotStatuses.map(status => (
                      <option key={status.value} value={status.value}>{status.label}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Planting Date</label>
                  <input 
                    type="date"
                    value={plotForm.plantingDate}
                    onChange={(e) => setPlotForm({...plotForm, plantingDate: e.target.value})}
                  />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Width (m)</label>
                    <input 
                      type="number"
                      min="0.5"
                      step="0.5"
                      value={plotForm.position.width}
                      onChange={(e) => setPlotForm({
                        ...plotForm, 
                        position: {...plotForm.position, width: Number(e.target.value)}
                      })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Height (m)</label>
                    <input 
                      type="number"
                      min="0.5"
                      step="0.5"
                      value={plotForm.position.height}
                      onChange={(e) => setPlotForm({
                        ...plotForm, 
                        position: {...plotForm.position, height: Number(e.target.value)}
                      })}
                    />
                  </div>
                </div>
                <div className="form-actions">
                  <button onClick={() => setShowModal(false)}>Cancel</button>
                  <button onClick={handleAddPlot} className="primary">Add Plot</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showModal && modalType === 'sensor' && (
          <div className="modal-overlay" onClick={() => setShowModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3 style={{ color: '#4CAF50' }}>Add New Sensor</h3>
                <button onClick={() => setShowModal(false)}>×</button>
              </div>
              <div className="modal-body">
                <div className="form-group">
                  <label>Sensor Type</label>
                  <select 
                    value={sensorForm.type}
                    onChange={(e) => {
                      const newType = e.target.value
                      setSensorForm({
                        ...sensorForm, 
                        type: newType,
                        firebaseName: generateSensorFirebaseName(newType)
                      })
                    }}
                  >
                    {sensorTypes.map(type => (
                      <option key={type.id} value={type.id}>{type.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Firebase Name</label>
                  <input 
                    type="text"
                    value={sensorForm.firebaseName}
                    onChange={(e) => setSensorForm({...sensorForm, firebaseName: e.target.value})}
                    placeholder="e.g., SoilSensor, SoilSensor2"
                  />
                  <p style={{fontSize: '12px', color: '#7f8c8d', marginTop: '4px'}}>
                    This name must match your Firebase database collection
                  </p>
                </div>
                <div className="form-group">
                  <label>Assign to Plots</label>
                  <div style={{ maxHeight: '120px', overflowY: 'auto', border: '1px solid #e1e8ed', borderRadius: '6px', padding: '8px' }}>
                    {greenhouse.plots.length === 0 ? (
                      <p style={{ color: '#7f8c8d', fontStyle: 'italic', margin: 0 }}>No plots available</p>
                    ) : (
                      greenhouse.plots.map(plot => (
                        <label key={plot.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={sensorForm.assignedPlots.includes(plot.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSensorForm({
                                  ...sensorForm,
                                  assignedPlots: [...sensorForm.assignedPlots, plot.id]
                                })
                              } else {
                                setSensorForm({
                                  ...sensorForm,
                                  assignedPlots: sensorForm.assignedPlots.filter(id => id !== plot.id)
                                })
                              }
                            }}
                          />
                          <span style={{ fontSize: '14px' }}>{plot.name} ({plot.cropType})</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
                <div className="form-actions">
                  <button onClick={() => setShowModal(false)}>Cancel</button>
                  <button onClick={handleAddSensor} className="primary">Add Sensor</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Greenhouse