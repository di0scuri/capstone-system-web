import React, { useState, useEffect } from 'react'
import Sidebar from './sidebar'
import './planting.css'
import './planting-ranking.css'
import { collection, getDocs, doc, updateDoc, deleteDoc, addDoc, serverTimestamp, query, where } from 'firebase/firestore'
import { db, realtimeDb } from '../firebase'
import { ref, get } from 'firebase/database'
import './custom-alert.css'


const Planting = ({ userType = 'admin', userId = 'default-user' }) => {
  const [activeMenu, setActiveMenu] = useState('Planting')
  const [searchTerm, setSearchTerm] = useState('')
  const [showEditModal, setShowEditModal] = useState(false)
  const [showAddPlotModal, setShowAddPlotModal] = useState(false)
  const [showFertilizerModal, setShowFertilizerModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [selectedPlant, setSelectedPlant] = useState(null)
  const [plants, setPlantsData] = useState([])
  const [plantsList, setPlantsList] = useState({})
  const [loading, setLoading] = useState(true)
  const [editFormData, setEditFormData] = useState({
    locationZone: '',
    status: '',
    currentSellingPrice: '',
    unit: '',
    survivingPlants: '' // NEW: Track surviving plants
  })

  const [alertConfig, setAlertConfig] = useState({
    show: false,
    type: 'info',
    title: '',
    message: '',
    details: [],
    onConfirm: () => {},
    onCancel: () => {},
    confirmText: 'OK',
    cancelText: 'Cancel',
    showCancel: false
  })

  // Filter States
  const [showFilterDropdown, setShowFilterDropdown] = useState(false)
  const [filters, setFilters] = useState({
    locationZone: 'all',
    plantType: 'all',
    status: 'all',
    plotNumber: 'all'
  })

  // Add Plot States
  const [plotStep, setPlotStep] = useState('input')
  const [selectedPlotNumber, setSelectedPlotNumber] = useState('')
  const [selectedSoilSensor, setSelectedSoilSensor] = useState('')
  const [selectedPlantType, setSelectedPlantType] = useState('')
  const [availableSensors, setAvailableSensors] = useState([])
  const [sensorData, setSensorData] = useState(null)
  const [scanProgress, setScanProgress] = useState(0)
  const [recommendedSeedlings, setRecommendedSeedlings] = useState(0)
  const [fertilizerInfo, setFertilizerInfo] = useState(null)
  const [showPriceModal, setShowPriceModal] = useState(false)
  const [priceRecommendation, setPriceRecommendation] = useState(null)
  const [activeDetailTab, setActiveDetailTab] = useState('summary')
  const [plantEvents, setPlantEvents] = useState([])

  // NEW: Sensor status and ranking states
  const [sensorStatus, setSensorStatus] = useState(null)
  const [rankedPlants, setRankedPlants] = useState([])
  const [loadingSensorStatus, setLoadingSensorStatus] = useState(false)

  const locationZoneOptions = ['Closed Greenhouse', 'Nursery 1', 'Nursery 2']

  // Plot options (1-5) with standard size 30x20cm = 0.06 sq meters
  const plotOptions = [
    { number: 1, size: 0.06, displaySize: '30x20cm' },
    { number: 2, size: 0.06, displaySize: '30x20cm' },
    { number: 3, size: 0.06, displaySize: '30x20cm' },
    { number: 4, size: 0.06, displaySize: '30x20cm' },
    { number: 5, size: 0.06, displaySize: '30x20cm' }
  ]

  const unitOptions = ['per kilo', 'per piece', 'per bundle', 'per pack', 'per dozen']

  // Check if a plot is occupied
  const isPlotOccupied = (plotNumber) => {
    return plants.some(plant => plant.plotNumber === plotNumber.toString())
  }

  // Get available (unoccupied) plots
  const getAvailablePlots = () => {
    return plotOptions.filter(plot => !isPlotOccupied(plot.number.toString()))
  }

  // NEW: Calculate survival rate
  const calculateSurvivalRate = (plant) => {
    const recommended = parseInt(plant.recommendedSeedlings) || 0
    const surviving = parseInt(plant.survivingPlants ?? plant.recommendedSeedlings) || 0
    
    if (recommended === 0) return 100
    return Math.round((surviving / recommended) * 100)
  }

  // NEW: Get survival rate color
  const getSurvivalRateColor = (rate) => {
    if (rate >= 90) return '#10b981' // Green - Excellent
    if (rate >= 75) return '#3b82f6' // Blue - Good
    if (rate >= 60) return '#f59e0b' // Orange - Fair
    if (rate >= 40) return '#f97316' // Dark Orange - Poor
    return '#ef4444' // Red - Critical
  }

  // NEW: Get survival rate label
  const getSurvivalRateLabel = (rate) => {
    if (rate >= 90) return 'Excellent'
    if (rate >= 75) return 'Good'
    if (rate >= 60) return 'Fair'
    if (rate >= 40) return 'Poor'
    return 'Critical'
  }

  const CustomAlert = ({ show, type = 'info', title, message, details, onConfirm, onCancel, confirmText = 'OK', cancelText = 'Cancel', showCancel = false }) => {
    if (!show) return null

    const getIcon = () => {
      switch (type) {
        case 'success': return '✅'
        case 'error': return '❌'
        case 'warning': return '⚠️'
        case 'info': return 'ℹ️'
        default: return 'ℹ️'
      }
    }

    return (
      <div className="custom-alert-overlay" onClick={showCancel ? onCancel : null}>
        <div className={`custom-alert-modal ${type}`} onClick={(e) => e.stopPropagation()}>
          <div className="custom-alert-header">
            <div className="custom-alert-icon">{getIcon()}</div>
            <div className="custom-alert-content">
              <h3 className="custom-alert-title">{title}</h3>
              <p className="custom-alert-message">{message}</p>
            </div>
          </div>

          {details && details.length > 0 && (
            <div className="custom-alert-details">
              {details.map((detail, index) => (
                <div key={index} className="alert-detail-item">
                  <span className="alert-detail-label">{detail.label}:</span>
                  <span className="alert-detail-value">{detail.value}</span>
                </div>
              ))}
            </div>
          )}

          <div className="custom-alert-footer">
            {showCancel && (
              <button className="custom-alert-btn custom-alert-btn-cancel" onClick={onCancel}>
                {cancelText}
              </button>
            )}
            <button 
              className={`custom-alert-btn ${type === 'error' ? 'custom-alert-btn-danger' : type === 'success' ? 'custom-alert-btn-success' : 'custom-alert-btn-primary'}`}
              onClick={onConfirm}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const showAlert = (config) => {
    setAlertConfig({
      show: true,
      type: config.type || 'info',
      title: config.title || 'Alert',
      message: config.message || '',
      details: config.details || [],
      onConfirm: config.onConfirm || (() => closeAlert()),
      onCancel: config.onCancel || (() => closeAlert()),
      confirmText: config.confirmText || 'OK',
      cancelText: config.cancelText || 'Cancel',
      showCancel: config.showCancel || false
    })
  }

  const closeAlert = () => {
    setAlertConfig(prev => ({ ...prev, show: false }))
  }

  // ============================================
  // SENSOR STATUS CHECKING
  // ============================================

  const checkSensorStatus = async (sensorId) => {
    try {
      const sensorRef = ref(realtimeDb, sensorId)
      const snapshot = await get(sensorRef)
      
      if (!snapshot.exists()) {
        return { online: false, reason: 'Sensor not found' }
      }
      
      const data = snapshot.val()
      
      let latestTimestamp = null
      Object.keys(data).forEach(key => {
        if (key.includes('_') || key.includes('-')) {
          if (!latestTimestamp || key > latestTimestamp) {
            latestTimestamp = key
          }
        }
      })
      
      if (!latestTimestamp) {
        return { online: false, reason: 'No data available' }
      }
      
      const [datePart, timePart] = latestTimestamp.split('_')
      const [year, month, day] = datePart.split('-')
      const [hour, minute, second] = timePart.split(':')
      const lastReadingTime = new Date(year, month - 1, day, hour, minute, second)
      
      const now = new Date()
      const minutesSinceLastReading = (now - lastReadingTime) / (1000 * 60)
      
      if (minutesSinceLastReading <= 5) {
        return { 
          online: true, 
          lastReading: lastReadingTime,
          minutesAgo: Math.floor(minutesSinceLastReading)
        }
      } else {
        return { 
          online: false, 
          reason: 'No recent data',
          lastReading: lastReadingTime,
          minutesAgo: Math.floor(minutesSinceLastReading)
        }
      }
    } catch (error) {
      console.error('Error checking sensor status:', error)
      return { online: false, reason: 'Error checking sensor' }
    }
  }

  // ============================================
  // PLANT RANKING SYSTEM
  // ============================================

  const calculatePlantCompatibility = (sensorData, plantInfo) => {
    if (!sensorData || !plantInfo || !plantInfo.stages || plantInfo.stages.length === 0) {
      return 0
    }
    
    const firstStage = plantInfo.stages[0]
    
    let totalScore = 0
    let factors = 0
    
    if (firstStage.lowpH && firstStage.highpH && sensorData.ph) {
      const phMid = (firstStage.lowpH + firstStage.highpH) / 2
      const phRange = firstStage.highpH - firstStage.lowpH
      const phDiff = Math.abs(sensorData.ph - phMid)
      const phScore = Math.max(0, 100 - (phDiff / phRange) * 100)
      totalScore += phScore
      factors++
    }
    
    if (firstStage.lowN && firstStage.highN && sensorData.nitrogen !== undefined) {
      const nMid = (firstStage.lowN + firstStage.highN) / 2
      const nRange = firstStage.highN - firstStage.lowN
      const nDiff = Math.abs(sensorData.nitrogen - nMid)
      const nScore = Math.max(0, 100 - (nDiff / nRange) * 100)
      totalScore += nScore
      factors++
    }
    
    if (firstStage.lowP && firstStage.highP && sensorData.phosphorus !== undefined) {
      const pMid = (firstStage.lowP + firstStage.highP) / 2
      const pRange = firstStage.highP - firstStage.lowP
      const pDiff = Math.abs(sensorData.phosphorus - pMid)
      const pScore = Math.max(0, 100 - (pDiff / pRange) * 100)
      totalScore += pScore
      factors++
    }
    
    if (firstStage.lowK && firstStage.highK && sensorData.potassium !== undefined) {
      const kMid = (firstStage.lowK + firstStage.highK) / 2
      const kRange = firstStage.highK - firstStage.lowK
      const kDiff = Math.abs(sensorData.potassium - kMid)
      const kScore = Math.max(0, 100 - (kDiff / kRange) * 100)
      totalScore += kScore
      factors++
    }
    
    if (firstStage.lowTemp && firstStage.highTemp && sensorData.temperature !== undefined) {
      const tempMid = (firstStage.lowTemp + firstStage.highTemp) / 2
      const tempRange = firstStage.highTemp - firstStage.lowTemp
      const tempDiff = Math.abs(sensorData.temperature - tempMid)
      const tempScore = Math.max(0, 100 - (tempDiff / tempRange) * 100)
      totalScore += tempScore
      factors++
    }
    
    if (firstStage.lowHum && firstStage.highHum && sensorData.moisture !== undefined) {
      const humMid = (firstStage.lowHum + firstStage.highHum) / 2
      const humRange = firstStage.highHum - firstStage.lowHum
      const humDiff = Math.abs(sensorData.moisture - humMid)
      const humScore = Math.max(0, 100 - (humDiff / humRange) * 100)
      totalScore += humScore
      factors++
    }
    
    return factors > 0 ? Math.round(totalScore / factors) : 0
  }

  const getCompatibilityRating = (score) => {
    if (score >= 80) return { text: 'Excellent Match', color: '#10b981', stars: 5 }
    if (score >= 65) return { text: 'Good Match', color: '#3b82f6', stars: 4 }
    if (score >= 50) return { text: 'Fair Match', color: '#f59e0b', stars: 3 }
    if (score >= 35) return { text: 'Poor Match', color: '#f97316', stars: 2 }
    return { text: 'Not Recommended', color: '#ef4444', stars: 1 }
  }

  const rankPlantsBySensorData = (sensorData, plantsList) => {
    if (!sensorData || !plantsList) return []
    
    const rankedPlants = Object.entries(plantsList).map(([key, plant]) => {
      const score = calculatePlantCompatibility(sensorData, plant)
      const rating = getCompatibilityRating(score)
      
      return {
        key,
        plant,
        score,
        rating
      }
    })
    
    return rankedPlants.sort((a, b) => b.score - a.score)
  }

  // Fetch plantsList from Firebase
  useEffect(() => {
    const fetchPlantsList = async () => {
      try {
        const plantsListCollection = collection(db, 'plantsList')
        const plantsListSnapshot = await getDocs(plantsListCollection)
        const plantsListData = {}
        
        plantsListSnapshot.docs.forEach(doc => {
          plantsListData[doc.id] = doc.data()
        })
        
        setPlantsList(plantsListData)
      } catch (error) {
        console.error('Error fetching plantsList:', error)
      }
    }

    fetchPlantsList()
  }, [])

  // Fetch available soil sensors from Firebase Realtime Database
  useEffect(() => {
    const fetchSensors = async () => {
      try {
        const rootRef = ref(realtimeDb, '/')
        const snapshot = await get(rootRef)
        
        if (snapshot.exists()) {
          const allData = snapshot.val()
          const sensorsList = []
          
          Object.keys(allData).forEach(key => {
            if (key.startsWith('SoilSensor')) {
              sensorsList.push({
                id: key,
                name: key.replace('SoilSensor', 'Soil Sensor '),
                data: allData[key]
              })
            }
          })
          
          setAvailableSensors(sensorsList)
        }
      } catch (error) {
        console.error('Error fetching sensors:', error)
      }
    }

    fetchSensors()
  }, [])

  // Fetch plants data from Firestore
  useEffect(() => {
    const fetchPlants = async () => {
      try {
        const plantsCollection = collection(db, 'plants')
        const plantsSnapshot = await getDocs(plantsCollection)
        const plantsData = plantsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        setPlantsData(plantsData)
        setLoading(false)
      } catch (error) {
        console.error('Error fetching plants:', error)
        setLoading(false)
      }
    }

    fetchPlants()
  }, [])

  // Fetch events for a specific plant
  const fetchPlantEvents = async (plantId) => {
    try {
      const eventsCollection = collection(db, 'events')
      const q = query(eventsCollection, where('plantId', '==', plantId))
      const eventsSnapshot = await getDocs(q)
      const events = eventsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      events.sort((a, b) => {
        const timeA = a.timestamp?.toDate?.() || new Date(a.timestamp)
        const timeB = b.timestamp?.toDate?.() || new Date(b.timestamp)
        return timeA - timeB
      })
      setPlantEvents(events)
    } catch (error) {
      console.error('Error fetching plant events:', error)
      setPlantEvents([])
    }
  }

  // Get current stage based on plant age
  const getCurrentStage = (plantData, plantInfo) => {
    if (!plantData.plantedDate || !plantInfo?.stages) return null
    
    const plantedDate = new Date(plantData.plantedDate)
    const now = new Date()
    const daysSincePlanted = Math.floor((now - plantedDate) / (1000 * 60 * 60 * 24))
    
    for (let stage of plantInfo.stages) {
      if (daysSincePlanted >= stage.startDuration && daysSincePlanted <= stage.endDuration) {
        return stage
      }
    }
    
    return plantInfo.stages[plantInfo.stages.length - 1]
  }

  // Calculate recommended seedlings based on spacing
  const calculateRecommendedSeedlings = (plantKey, plotSize) => {
    const plantInfo = plantsList[plantKey]
    if (!plantInfo) return 0
    
    const minSpacing = parseFloat(plantInfo.minSpacingCM) || 20
    const maxSpacing = parseFloat(plantInfo.maxSpacingCM) || 25
    const avgSpacing = (minSpacing + maxSpacing) / 2
    
    const plotSizeCm2 = plotSize * 10000
    const spacingCm2 = avgSpacing * avgSpacing
    
    return Math.floor(plotSizeCm2 / spacingCm2)
  }

  // Fetch soil sensor data when sensor is selected
  const fetchSensorData = async (sensorId) => {
    try {
      const sensorRef = ref(realtimeDb, sensorId)
      const snapshot = await get(sensorRef)
      
      if (snapshot.exists()) {
        const data = snapshot.val()
        
        let latestData = null
        let latestTimestamp = null
        
        Object.keys(data).forEach(key => {
          if (key.includes('_') || key.includes('-')) {
            if (!latestTimestamp || key > latestTimestamp) {
              latestTimestamp = key
              latestData = data[key]
            }
          }
        })
        
        if (!latestData) {
          latestData = data
        }
        
        return {
          nitrogen: latestData.Nitrogen || latestData.nitrogen || 0,
          phosphorus: latestData.Phosphorus || latestData.phosphorus || 0,
          potassium: latestData.Potassium || latestData.potassium || 0,
          ph: latestData.pH || latestData.ph || 7,
          moisture: latestData.Moisture || latestData.moisture || 0,
          temperature: latestData.Temperature || latestData.temperature || 0,
          conductivity: latestData.Conductivity || latestData.conductivity || 0,
          timestamp: latestTimestamp
        }
      }
      return null
    } catch (error) {
      console.error('Error fetching sensor data:', error)
      return null
    }
  }

  const handleOpenEditModal = (plant) => {
    setSelectedPlant(plant)
    setEditFormData({
      locationZone: plant.locationZone || '',
      status: plant.status || '',
      currentSellingPrice: plant.currentSellingPrice || '',
      unit: plant.unit || '',
      survivingPlants: (plant.survivingPlants ?? plant.recommendedSeedlings)?.toString() || '' // NEW
    })
    setShowEditModal(true)
  }

  const handleCloseEditModal = () => {
    setShowEditModal(false)
    setSelectedPlant(null)
  }

  const handleEditInputChange = (e) => {
    const { name, value } = e.target
    setEditFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSaveEdit = async () => {
    try {
      if (selectedPlant) {
        // NEW: Validate surviving plants
        const survivingPlants = parseInt(editFormData.survivingPlants)
        const recommendedSeedlings = parseInt(selectedPlant.recommendedSeedlings)
        
        if (survivingPlants > recommendedSeedlings) {
          showAlert({
            type: 'warning',
            title: 'Invalid Number',
            message: 'Surviving plants cannot exceed the initial number of seedlings planted.',
            details: [
              { label: 'Initial Seedlings', value: recommendedSeedlings.toString() },
              { label: 'You entered', value: survivingPlants.toString() }
            ],
            confirmText: 'OK'
          })
          return
        }

        if (survivingPlants < 0) {
          showAlert({
            type: 'warning',
            title: 'Invalid Number',
            message: 'Surviving plants cannot be negative.',
            confirmText: 'OK'
          })
          return
        }

        const plantRef = doc(db, 'plants', selectedPlant.id)
        const updateData = {
          ...editFormData,
          survivingPlants: survivingPlants, // NEW: Store as number
          updatedAt: serverTimestamp()
        }

        // NEW: Create log entry if surviving plants changed
        if (selectedPlant.survivingPlants !== survivingPlants) {
          const previousCount = selectedPlant.survivingPlants ?? selectedPlant.recommendedSeedlings
          const difference = survivingPlants - previousCount
          const survivalRate = calculateSurvivalRate({ 
            ...selectedPlant, 
            survivingPlants 
          })

          await addDoc(collection(db, 'events'), {
            plantId: selectedPlant.id,
            type: 'PLANT_UPDATE',
            status: difference < 0 ? 'warning' : 'info',
            message: `Plant count updated: ${previousCount} → ${survivingPlants} (${difference >= 0 ? '+' : ''}${difference})`,
            timestamp: serverTimestamp(),
            createdAt: serverTimestamp(),
            userId: userId,
            details: {
              previousCount,
              newCount: survivingPlants,
              difference,
              survivalRate: `${survivalRate}%`,
              survivalRating: getSurvivalRateLabel(survivalRate)
            }
          })
        }

        await updateDoc(plantRef, updateData)
        
        setPlantsData(prev =>
          prev.map(plant =>
            plant.id === selectedPlant.id
              ? { ...plant, ...updateData }
              : plant
          )
        )
        
        showAlert({
          type: 'success',
          title: 'Plant Updated',
          message: 'Plant information has been successfully updated.',
          confirmText: 'OK'
        })
        
        handleCloseEditModal()
      }
    } catch (error) {
      console.error('Error updating plant:', error)
      showAlert({
        type: 'error',
        title: 'Update Failed',
        message: 'Failed to update plant information.',
        details: [{ label: 'Error', value: error.message }],
        confirmText: 'OK'
      })
    }
  }

  const handleOpenAddPlotModal = () => {
    const availablePlots = getAvailablePlots()
    
    if (availablePlots.length === 0) {
      showAlert({
        type: 'warning',
        title: 'All Plots Occupied',
        message: 'All plots are currently occupied. Please harvest or remove existing plants before adding new ones.',
        details: [
          { label: 'Total Plots', value: plotOptions.length.toString() },
          { label: 'Available Plots', value: '0' },
          { label: 'Occupied Plots', value: plotOptions.length.toString() }
        ],
        confirmText: 'Got it'
      })
      return
    }

    setShowAddPlotModal(true)
    setPlotStep('input')
    setSelectedPlotNumber('')
    setSelectedSoilSensor('')
    setSelectedPlantType('')
    setSensorData(null)
    setScanProgress(0)
    setSensorStatus(null)
    setRankedPlants([])
  }

  const handleCloseAddPlotModal = () => {
    setShowAddPlotModal(false)
    setPlotStep('input')
    setSelectedPlotNumber('')
    setSelectedSoilSensor('')
    setSelectedPlantType('')
    setSensorData(null)
    setSensorStatus(null)
    setRankedPlants([])
  }

  const handlePlotSelect = (plotNum) => {
    if (isPlotOccupied(plotNum)) {
      showAlert({
        type: 'warning',
        title: 'Plot Already Occupied',
        message: `Plot ${plotNum} is already occupied. Please select another available plot.`,
        confirmText: 'Choose Another'
      })
      return
    }
    setSelectedPlotNumber(plotNum)
  }

  const handleSensorSelect = async (sensorId) => {
    setSelectedSoilSensor(sensorId)
    setLoadingSensorStatus(true)
    setSensorStatus(null)
    setRankedPlants([])
    setSelectedPlantType('')
    
    if (!sensorId) {
      setLoadingSensorStatus(false)
      return
    }
    
    const status = await checkSensorStatus(sensorId)
    setSensorStatus(status)
    setLoadingSensorStatus(false)
    
    if (!status.online) {
      showAlert({
        type: 'error',
        title: 'Sensor Offline',
        message: `Sensor ${sensorId} is currently offline and cannot be used.`,
        details: [
          { label: 'Reason', value: status.reason },
          ...(status.lastReading ? [{ label: 'Last reading', value: `${status.minutesAgo} minutes ago` }] : [])
        ],
        confirmText: 'Choose Another Sensor',
        onConfirm: () => {
          setSelectedSoilSensor('')
          closeAlert()
        }
      })
      return
    }
    
    const data = await fetchSensorData(sensorId)
    if (data) {
      setSensorData(data)
      const ranked = rankPlantsBySensorData(data, plantsList)
      setRankedPlants(ranked)
    }
  }

  const handlePlantTypeSelect = (plantKey) => {
    setSelectedPlantType(plantKey)
    const plotData = plotOptions.find(p => p.number === parseInt(selectedPlotNumber))
    if (plotData) {
      const seedlings = calculateRecommendedSeedlings(plantKey, plotData.size)
      setRecommendedSeedlings(seedlings)
    }
  }

  const handleStartScan = async () => {
    if (!selectedPlotNumber || !selectedSoilSensor || !selectedPlantType) {
      showAlert({
        type: 'warning',
        title: 'Missing Information',
        message: 'Please complete all selections before starting the soil scan.',
        details: [
          { label: 'Plot Number', value: selectedPlotNumber || 'Not selected' },
          { label: 'Soil Sensor', value: selectedSoilSensor || 'Not selected' },
          { label: 'Plant Type', value: selectedPlantType ? plantsList[selectedPlantType]?.name : 'Not selected' }
        ],
        confirmText: 'Got it'
      })
      return
    }

    if (isPlotOccupied(selectedPlotNumber)) {
      showAlert({
        type: 'error',
        title: 'Plot Already Occupied',
        message: `Plot ${selectedPlotNumber} is already occupied. Please select another available plot.`,
        confirmText: 'Choose Another Plot',
        onConfirm: () => {
          setPlotStep('input')
          setSelectedPlotNumber('')
          closeAlert()
        }
      })
      return
    }

    setLoadingSensorStatus(true)
    const status = await checkSensorStatus(selectedSoilSensor)
    setLoadingSensorStatus(false)
    
    if (!status.online) {
      showAlert({
        type: 'error',
        title: 'Sensor Went Offline',
        message: `Sensor ${selectedSoilSensor} went offline during the process.`,
        details: [
          { label: 'Reason', value: status.reason }
        ],
        confirmText: 'Back to Selection',
        onConfirm: () => {
          setPlotStep('input')
          closeAlert()
        }
      })
      return
    }

    setPlotStep('scanning')
    setScanProgress(0)

    const data = await fetchSensorData(selectedSoilSensor)
    
    if (!data) {
      showAlert({
        type: 'error',
        title: 'Failed to Fetch Sensor Data',
        message: 'Unable to retrieve data from the sensor. The sensor may have gone offline.',
        confirmText: 'Try Again',
        onConfirm: () => {
          setPlotStep('input')
          closeAlert()
        }
      })
      return
    }

    setSensorData(data)

    for (let i = 0; i <= 100; i += 5) {
      await new Promise(resolve => setTimeout(resolve, 100))
      setScanProgress(i)
    }

    setPlotStep('confirm')
  }

  const handleConfirmPlanting = async () => {
    try {
      if (isPlotOccupied(selectedPlotNumber)) {
        showAlert({
          type: 'error',
          title: 'Plot Already Occupied',
          message: `Plot ${selectedPlotNumber} is already occupied. Cannot add plant.`,
          confirmText: 'OK',
          onConfirm: () => {
            handleCloseAddPlotModal()
            closeAlert()
          }
        })
        return
      }

      const plotData = plotOptions.find(p => p.number === parseInt(selectedPlotNumber))
      const plantInfo = plantsList[selectedPlantType]

      if (!plantInfo) {
        showAlert({
          type: 'error',
          title: 'Plant Information Not Found',
          message: 'Unable to find information for the selected plant.',
          confirmText: 'OK'
        })
        return
      }

      const plantedDate = new Date()
      const daysToHarvest = parseInt(plantInfo.daysToHarvest) || 30
      const expectedHarvestDate = new Date(plantedDate.getTime() + daysToHarvest * 24 * 60 * 60 * 1000)

      const formattedDate = plantedDate.toISOString().split('T')[0]
      const generatedPlantName = `${plantInfo.name} - Plot ${selectedPlotNumber} - ${formattedDate}`

      const newPlant = {
        plotNumber: selectedPlotNumber,
        plotSize: plotData.displaySize,
        soilSensor: selectedSoilSensor,
        plantType: selectedPlantType,
        plantName: generatedPlantName,
        scientificName: plantInfo.sName || '',
        recommendedSeedlings,
        survivingPlants: recommendedSeedlings, // NEW: Initialize with recommended amount
        locationZone: 'Nursery 1',
        status: 'Germination',
        plantedDate: plantedDate.toISOString(),
        expectedHarvestDate: expectedHarvestDate.toISOString(),
        daysToHarvest: daysToHarvest,
        sensorData: sensorData,
        currentSellingPrice: plantInfo.pricing || '',
        unit: plantInfo.pricingUnit || 'per kilo',
        minSpacing: plantInfo.minSpacingCM || '20',
        maxSpacing: plantInfo.maxSpacingCM || '25',
        description: plantInfo.description || '',
        stages: plantInfo.stages || [],
        createdAt: serverTimestamp(),
        userId: userId
      }

      const docRef = await addDoc(collection(db, 'plants'), newPlant)
      
      // Create initial event for planting in events collection
      await addDoc(collection(db, 'events'), {
        plantId: docRef.id,
        type: 'LIFECYCLE_STAGE',
        status: 'info',
        message: `Stage start: Germination for ${plantInfo.name} - ${plantedDate.toLocaleDateString()}`,
        timestamp: serverTimestamp(),
        createdAt: serverTimestamp(),
        userId: userId
      })

      // ADD TO CALENDAR - Initial planting event
      await addDoc(collection(db, 'calendar'), {
        plantId: docRef.id,
        plantName: generatedPlantName,
        type: 'LIFECYCLE_STAGE',
        stage: 'Germination',
        date: plantedDate.toISOString(),
        message: `🌱 Planting: ${plantInfo.name} in Plot ${selectedPlotNumber}`,
        status: 'info',
        createdAt: serverTimestamp(),
        userId: userId
      })

      // Create events for each stage change
      if (plantInfo.stages && plantInfo.stages.length > 0) {
        for (let i = 0; i < plantInfo.stages.length; i++) {
          const stage = plantInfo.stages[i]
          const stageDate = new Date(plantedDate.getTime() + stage.startDuration * 24 * 60 * 60 * 1000)
          
          await addDoc(collection(db, 'events'), {
            plantId: docRef.id,
            type: 'LIFECYCLE_STAGE',
            status: 'info',
            message: `Stage start: ${stage.stage} for ${plantInfo.name} - ${stageDate.toLocaleDateString()}`,
            timestamp: stageDate.toISOString(),
            createdAt: serverTimestamp(),
            userId: userId
          })

          await addDoc(collection(db, 'calendar'), {
            plantId: docRef.id,
            plantName: generatedPlantName,
            type: 'LIFECYCLE_STAGE',
            stage: stage.stage,
            date: stageDate.toISOString(),
            message: `📊 ${stage.stage}: ${plantInfo.name} (Plot ${selectedPlotNumber})`,
            status: 'info',
            notes: stage.notes || '',
            watering: stage.watering || '',
            createdAt: serverTimestamp(),
            userId: userId
          })
        }
      }

      // ADD TO CALENDAR - Harvest date
      await addDoc(collection(db, 'calendar'), {
        plantId: docRef.id,
        plantName: generatedPlantName,
        type: 'HARVEST',
        stage: 'Harvest',
        date: expectedHarvestDate.toISOString(),
        message: `🌾 Harvest Ready: ${plantInfo.name} (Plot ${selectedPlotNumber})`,
        status: 'success',
        createdAt: serverTimestamp(),
        userId: userId
      })
      
      setPlantsData(prev => [...prev, { id: docRef.id, ...newPlant }])
      
      handleCloseAddPlotModal()
      
      showAlert({
        type: 'success',
        title: 'Plot Added Successfully!',
        message: `${plantInfo.name} has been planted in Plot ${selectedPlotNumber}.`,
        details: [
          { label: 'Plant', value: plantInfo.name },
          { label: 'Plot', value: `Plot ${selectedPlotNumber}` },
          { label: 'Seedlings', value: recommendedSeedlings.toString() },
          { label: 'Expected Harvest', value: expectedHarvestDate.toLocaleDateString() },
          { label: 'Days to Harvest', value: `${daysToHarvest} days` }
        ],
        confirmText: 'View Plants'
      })
    } catch (error) {
      console.error('Error adding plant:', error)
      showAlert({
        type: 'error',
        title: 'Failed to Add Plot',
        message: 'An error occurred while adding the plot. Please try again.',
        details: [
          { label: 'Error', value: error.message }
        ],
        confirmText: 'Try Again'
      })
    }
  }

  const handleOpenFertilizerModal = (plant) => {
    const plantInfo = plantsList[plant.plantType]
    const currentStage = getCurrentStage(plant, plantInfo)
    
    if (currentStage && plant.sensorData) {
      const deficits = {
        nitrogen: Math.max(0, currentStage.highN - (plant.sensorData.nitrogen || 0)),
        phosphorus: Math.max(0, currentStage.highP - (plant.sensorData.phosphorus || 0)),
        potassium: Math.max(0, currentStage.highK - (plant.sensorData.potassium || 0)),
        ph: Math.abs(currentStage.highpH - (plant.sensorData.ph || 7))
      }

      setFertilizerInfo({
        plantName: plant.plantName,
        stage: currentStage.stage,
        current: plant.sensorData,
        ideal: {
          nitrogen: currentStage.highN,
          phosphorus: currentStage.highP,
          potassium: currentStage.highK,
          ph: currentStage.highpH
        },
        range: {
          nitrogen: `${currentStage.lowN} - ${currentStage.highN}`,
          phosphorus: `${currentStage.lowP} - ${currentStage.highP}`,
          potassium: `${currentStage.lowK} - ${currentStage.highK}`,
          ph: `${currentStage.lowpH} - ${currentStage.highpH}`
        },
        deficit: deficits
      })
      
      setShowFertilizerModal(true)
    }
  }

  const handleCloseFertilizerModal = () => {
    setShowFertilizerModal(false)
    setFertilizerInfo(null)
  }

  const handleOpenPriceModal = (plant) => {
    const plantInfo = plantsList[plant.plantType]
    
    if (plantInfo) {
      const estimatedYield = parseFloat(plantInfo.daysToHarvest) / 30 * 5
      const basePrice = parseFloat(plantInfo.pricing) || 100
      const estimatedRevenue = Math.round(estimatedYield * basePrice)

      setPriceRecommendation({
        recommendedPrice: basePrice,
        minPrice: Math.round(basePrice * 0.8),
        maxPrice: Math.round(basePrice * 1.2),
        avgMarketPrice: basePrice,
        unit: plantInfo.pricingUnit || 'per kilo',
        qualityScore: 85,
        priceStrategy: 'Market Rate',
        factors: ['Quality', 'Season', 'Demand'],
        competitors: [basePrice - 10, basePrice + 5, basePrice, basePrice + 10],
        estimatedYield: estimatedYield.toFixed(1),
        estimatedRevenue
      })
      
      setShowPriceModal(true)
    }
  }

  const handleClosePriceModal = () => {
    setShowPriceModal(false)
    setPriceRecommendation(null)
  }

  const handleOpenDetailModal = async (plant) => {
    setSelectedPlant(plant)
    setActiveDetailTab('summary')
    await fetchPlantEvents(plant.id)
    setShowDetailModal(true)
  }

  const handleCloseDetailModal = () => {
    setShowDetailModal(false)
    setSelectedPlant(null)
    setActiveDetailTab('summary')
    setPlantEvents([])
  }

  const handleFilterChange = (filterType, value) => {
    setFilters(prev => ({
      ...prev,
      [filterType]: value
    }))
  }

  const handleClearFilters = () => {
    setFilters({
      locationZone: 'all',
      plantType: 'all',
      status: 'all',
      plotNumber: 'all'
    })
  }

  const hasActiveFilters = () => {
    return Object.values(filters).some(value => value !== 'all')
  }

  const getUniqueFilterOptions = () => {
    const uniquePlantTypes = [...new Set(plants.map(p => p.plantType).filter(Boolean))]
    const uniqueLocations = [...new Set(plants.map(p => p.locationZone).filter(Boolean))]
    const uniqueStatuses = [...new Set(plants.map(p => {
      const plantInfo = plantsList[p.plantType]
      const currentStage = getCurrentStage(p, plantInfo)
      return currentStage?.stage || p.status
    }).filter(Boolean))]
    const uniquePlotNumbers = [...new Set(plants.map(p => p.plotNumber).filter(Boolean))].sort((a, b) => a - b)

    return {
      plantTypes: uniquePlantTypes,
      locations: uniqueLocations,
      statuses: uniqueStatuses,
      plotNumbers: uniquePlotNumbers
    }
  }

  const filterOptions = getUniqueFilterOptions()

  const filteredPlants = plants.filter(plant => {
    const matchesSearch = plant.plantName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      plant.plantType?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      plant.locationZone?.toLowerCase().includes(searchTerm.toLowerCase())

    if (!matchesSearch) return false

    if (filters.locationZone !== 'all' && plant.locationZone !== filters.locationZone) {
      return false
    }

    if (filters.plantType !== 'all' && plant.plantType !== filters.plantType) {
      return false
    }

    if (filters.status !== 'all') {
      const plantInfo = plantsList[plant.plantType]
      const currentStage = getCurrentStage(plant, plantInfo)
      const plantStatus = currentStage?.stage || plant.status
      if (plantStatus !== filters.status) {
        return false
      }
    }

    if (filters.plotNumber !== 'all' && plant.plotNumber !== filters.plotNumber) {
      return false
    }

    return true
  })

  const getStatusColor = (status) => {
    const colors = {
      'Waiting for Planting': '#FFA500',
      'Seeding': '#FFD700',
      'Germination': '#FFD700',
      'Seedling': '#90EE90',
      'Growing': '#32CD32',
      'Vegetative Growth': '#32CD32',
      'Flowering': '#FF69B4',
      'Fruiting': '#FF8C00',
      'Harvesting': '#8B4513',
      'Harvest': '#8B4513',
      'Ready to Harvest': '#228B22',
      'Completed': '#808080'
    }
    return colors[status] || '#666'
  }

  const getPlantEmoji = (plantType) => {
    const emojis = {
      'lettuce': '🥬',
      'tomato': '🍅',
      'cabbage': '🥬',
      'pepper': '🌶️',
      'eggplant': '🍆',
      'cucumber': '🥒',
      'pechay': '🥬',
      'bokchoy': '🥬',
      'celery': '🌿'
    }
    return emojis[plantType?.toLowerCase()] || '🌱'
  }

  if (loading) {
    return (
      <div className="planting-container">
        <Sidebar activeMenu={activeMenu} setActiveMenu={setActiveMenu} userType={userType} />
        <div className="planting-content">
          <div className="loading">Loading...</div>
        </div>
        <CustomAlert
          show={alertConfig.show}
          type={alertConfig.type}
          title={alertConfig.title}
          message={alertConfig.message}
          details={alertConfig.details}
          onConfirm={alertConfig.onConfirm}
          onCancel={alertConfig.onCancel}
          confirmText={alertConfig.confirmText}
          cancelText={alertConfig.cancelText}
          showCancel={alertConfig.showCancel}
        />
      </div>
    )
  }

  const availablePlotsCount = getAvailablePlots().length

  return (
    <div className="planting-container">
      <Sidebar activeMenu={activeMenu} setActiveMenu={setActiveMenu} userType={userType} />
      
      <div className="planting-content">
        <div className="planting-header">
          <div className="planting-title-section">
            <h1 className="planting-title">🌱 Planting Management</h1>
            <p className="planting-subtitle">
              Monitor and manage your crops • {availablePlotsCount} of {plotOptions.length} plots available
            </p>
          </div>

          <div className="planting-actions">
            <div className="planting-search">
              <input
                type="text"
                placeholder="Search plants..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="planting-search-input"
              />
            </div>

            <div className="filter-container">
              <button 
                className={`planting-filter-btn ${hasActiveFilters() ? 'active' : ''}`}
                onClick={() => setShowFilterDropdown(!showFilterDropdown)}
              >
                🔍 Filter
                {hasActiveFilters() && <span className="filter-badge">{Object.values(filters).filter(v => v !== 'all').length}</span>}
              </button>

              {showFilterDropdown && (
                <div className="filter-dropdown">
                  <div className="filter-dropdown-header">
                    <h3>Filter Plants</h3>
                    {hasActiveFilters() && (
                      <button 
                        className="clear-filters-btn"
                        onClick={handleClearFilters}
                      >
                        Clear All
                      </button>
                    )}
                  </div>

                  <div className="filter-section">
                    <label>Location Zone</label>
                    <select
                      value={filters.locationZone}
                      onChange={(e) => handleFilterChange('locationZone', e.target.value)}
                      className="filter-select"
                    >
                      <option value="all">All Locations</option>
                      {filterOptions.locations.map(location => (
                        <option key={location} value={location}>{location}</option>
                      ))}
                    </select>
                  </div>

                  <div className="filter-section">
                    <label>Plant Type</label>
                    <select
                      value={filters.plantType}
                      onChange={(e) => handleFilterChange('plantType', e.target.value)}
                      className="filter-select"
                    >
                      <option value="all">All Plants</option>
                      {filterOptions.plantTypes.map(type => (
                        <option key={type} value={type}>
                          {plantsList[type]?.name || type}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="filter-section">
                    <label>Growth Stage</label>
                    <select
                      value={filters.status}
                      onChange={(e) => handleFilterChange('status', e.target.value)}
                      className="filter-select"
                    >
                      <option value="all">All Stages</option>
                      {filterOptions.statuses.map(status => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>
                  </div>

                  <div className="filter-section">
                    <label>Plot Number</label>
                    <select
                      value={filters.plotNumber}
                      onChange={(e) => handleFilterChange('plotNumber', e.target.value)}
                      className="filter-select"
                    >
                      <option value="all">All Plots</option>
                      {filterOptions.plotNumbers.map(plotNum => (
                        <option key={plotNum} value={plotNum}>Plot {plotNum}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>

            <button 
              className="planting-add-btn" 
              onClick={handleOpenAddPlotModal}
              disabled={availablePlotsCount === 0}
              style={{ 
                opacity: availablePlotsCount === 0 ? 0.5 : 1,
                cursor: availablePlotsCount === 0 ? 'not-allowed' : 'pointer'
              }}
            >
              + Select Plot
            </button>
          </div>
        </div>

        {hasActiveFilters() && (
          <div className="active-filters">
            <span className="active-filters-label">Active Filters:</span>
            {filters.locationZone !== 'all' && (
              <span className="filter-tag">
                Location: {filters.locationZone}
                <button onClick={() => handleFilterChange('locationZone', 'all')}>✕</button>
              </span>
            )}
            {filters.plantType !== 'all' && (
              <span className="filter-tag">
                Plant: {plantsList[filters.plantType]?.name || filters.plantType}
                <button onClick={() => handleFilterChange('plantType', 'all')}>✕</button>
              </span>
            )}
            {filters.status !== 'all' && (
              <span className="filter-tag">
                Stage: {filters.status}
                <button onClick={() => handleFilterChange('status', 'all')}>✕</button>
              </span>
            )}
            {filters.plotNumber !== 'all' && (
              <span className="filter-tag">
                Plot: {filters.plotNumber}
                <button onClick={() => handleFilterChange('plotNumber', 'all')}>✕</button>
              </span>
            )}
          </div>
        )}

        <div className="results-count">
          Showing {filteredPlants.length} of {plants.length} plants
        </div>

        <div className="planting-grid">
          {filteredPlants.length === 0 ? (
            <div className="planting-empty">
              <p>
                {hasActiveFilters() 
                  ? 'No plants match your filters. Try adjusting your filter criteria.'
                  : plants.length === 0
                  ? 'No plants found. Click "Select Plot" to add your first plot!'
                  : 'No plants match your search.'}
              </p>
            </div>
          ) : (
            filteredPlants.map((plant) => {
              const plantInfo = plantsList[plant.plantType]
              const currentStage = getCurrentStage(plant, plantInfo)
              const survivalRate = calculateSurvivalRate(plant)
              const survivalColor = getSurvivalRateColor(survivalRate)
              const survivalLabel = getSurvivalRateLabel(survivalRate)
              const survivingCount = plant.survivingPlants ?? plant.recommendedSeedlings
              
              return (
                <div 
                  key={plant.id} 
                  className={`planting-card planting-card-${plant.plantType?.toLowerCase()}`}
                  onClick={() => handleOpenDetailModal(plant)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="planting-card-header">
                    <span className="planting-plant-icon">{getPlantEmoji(plant.plantType)}</span>
                    <div className="planting-plant-info">
                      <h3 className="planting-plant-name">{plant.plantName}</h3>
                      <p className="planting-plant-type">{plant.scientificName}</p>
                    </div>
                  </div>

                  <div className="planting-card-body">
                    <div className="planting-info-row">
                      <span className="planting-info-label">Plot:</span>
                      <span className="planting-info-value">Plot {plant.plotNumber} ({plant.plotSize})</span>
                    </div>
                    
                    <div className="planting-info-row">
                      <span className="planting-info-label">Sensor:</span>
                      <span className="planting-info-value">{plant.soilSensor}</span>
                    </div>

                    <div className="planting-info-row">
                      <span className="planting-info-label">Location:</span>
                      <span className="planting-info-value">{plant.locationZone}</span>
                    </div>

                    {/* NEW: Surviving plants display */}
                    <div className="planting-info-row">
                      <span className="planting-info-label">Plants:</span>
                      <span className="planting-info-value">
                        <strong style={{ color: survivalColor }}>
                          {survivingCount}
                        </strong>
                        {' / '}{plant.recommendedSeedlings}
                        <span style={{ 
                          marginLeft: '0.5rem', 
                          fontSize: '0.85em',
                          color: survivalColor
                        }}>
                          ({survivalRate}% {survivalLabel})
                        </span>
                      </span>
                    </div>

                    {currentStage && (
                      <div className="planting-info-row">
                        <span className="planting-info-label">Stage:</span>
                        <span className="planting-info-value">{currentStage.stage}</span>
                      </div>
                    )}

                    <div className="planting-status-badge" style={{ backgroundColor: getStatusColor(currentStage?.stage || plant.status) }}>
                      {currentStage?.stage || plant.status}
                    </div>
                  </div>

                  <div className="planting-card-footer" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="planting-card-btn"
                      onClick={() => handleOpenEditModal(plant)}
                    >
                      Edit
                    </button>
                    <button
                      className="planting-card-btn"
                      onClick={() => handleOpenFertilizerModal(plant)}
                    >
                      Fertilizer
                    </button>
                    <button
                      className="planting-card-btn"
                      onClick={() => handleOpenPriceModal(plant)}
                    >
                      Price
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Continue with all modals... I'll add the updated Edit Modal with surviving plants field */}
        
        {/* Edit Modal - UPDATED */}
        {showEditModal && selectedPlant && (
          <div className="planting-modal-overlay" onClick={handleCloseEditModal}>
            <div className="planting-modal" onClick={(e) => e.stopPropagation()}>
              <div className="planting-modal-header">
                <h2 className="planting-modal-title">Edit Plant</h2>
                <button className="planting-modal-close" onClick={handleCloseEditModal}>
                  ✕
                </button>
              </div>

              <div className="planting-modal-body">
                {/* NEW: Surviving Plants Field */}
                <div className="planting-form-group">
                  <label>
                    Surviving Plants 🌱
                    <span style={{ 
                      marginLeft: '0.5rem', 
                      fontSize: '0.85em', 
                      color: '#666' 
                    }}>
                      (Initial: {selectedPlant.recommendedSeedlings})
                    </span>
                  </label>
                  <input
                    type="number"
                    name="survivingPlants"
                    value={editFormData.survivingPlants}
                    onChange={handleEditInputChange}
                    className="planting-form-input"
                    placeholder="Enter number of surviving plants"
                    min="0"
                    max={selectedPlant.recommendedSeedlings}
                  />
                  {editFormData.survivingPlants && (
                    <small style={{ 
                      display: 'block', 
                      marginTop: '0.5rem',
                      color: getSurvivalRateColor(
                        (parseInt(editFormData.survivingPlants) / parseInt(selectedPlant.recommendedSeedlings)) * 100
                      )
                    }}>
                      Survival Rate: {Math.round((parseInt(editFormData.survivingPlants) / parseInt(selectedPlant.recommendedSeedlings)) * 100)}% 
                      ({getSurvivalRateLabel(
                        (parseInt(editFormData.survivingPlants) / parseInt(selectedPlant.recommendedSeedlings)) * 100
                      )})
                    </small>
                  )}
                </div>

                <div className="planting-form-group">
                  <label>Location Zone</label>
                  <select
                    name="locationZone"
                    value={editFormData.locationZone}
                    onChange={handleEditInputChange}
                    className="planting-form-select"
                  >
                    <option value="">Select location</option>
                    {locationZoneOptions.map(option => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>

                <div className="planting-form-group">
                  <label>Current Selling Price (₱)</label>
                  <input
                    type="number"
                    name="currentSellingPrice"
                    value={editFormData.currentSellingPrice}
                    onChange={handleEditInputChange}
                    className="planting-form-input"
                    placeholder="Enter price"
                  />
                </div>

                <div className="planting-form-group">
                  <label>Unit</label>
                  <select
                    name="unit"
                    value={editFormData.unit}
                    onChange={handleEditInputChange}
                    className="planting-form-select"
                  >
                    <option value="">Select unit</option>
                    {unitOptions.map(option => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="planting-modal-footer">
                <button
                  className="planting-modal-btn planting-modal-cancel"
                  onClick={handleCloseEditModal}
                >
                  Cancel
                </button>
                <button
                  className="planting-modal-btn planting-modal-save"
                  onClick={handleSaveEdit}
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Fertilizer Modal */}
        {showFertilizerModal && fertilizerInfo && (
          <div className="planting-modal-overlay" onClick={handleCloseFertilizerModal}>
            <div className="fertilizer-modal planting-modal" onClick={(e) => e.stopPropagation()}>
              <div className="planting-modal-header">
                <h2 className="planting-modal-title">🌿 Fertilizer Recommendations</h2>
                <button className="planting-modal-close" onClick={handleCloseFertilizerModal}>
                  ✕
                </button>
              </div>

              <div className="planting-modal-body">
                <div className="fertilizer-intro">
                  <h3>{fertilizerInfo.plantName}</h3>
                  <p>Current Stage: <strong>{fertilizerInfo.stage}</strong></p>
                  <p>Based on current soil analysis, here are the nutrient adjustments needed:</p>
                </div>

                <div className="fertilizer-content">
                  <div className="nutrients-grid">
                    <div className="nutrient-card">
                      <h4>Nitrogen (N)</h4>
                      <div className="nutrient-values">
                        <span>Current: {fertilizerInfo.current?.nitrogen || 0} ppm</span>
                        <span>Ideal: {fertilizerInfo.ideal?.nitrogen || 0} ppm</span>
                        <span className="range">Range: {fertilizerInfo.range?.nitrogen} ppm</span>
                        {fertilizerInfo.deficit?.nitrogen > 0 && (
                          <span className="deficit">
                            Deficit: {fertilizerInfo.deficit.nitrogen.toFixed(0)} ppm
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="nutrient-card">
                      <h4>Phosphorus (P)</h4>
                      <div className="nutrient-values">
                        <span>Current: {fertilizerInfo.current?.phosphorus || 0} ppm</span>
                        <span>Ideal: {fertilizerInfo.ideal?.phosphorus || 0} ppm</span>
                        <span className="range">Range: {fertilizerInfo.range?.phosphorus} ppm</span>
                        {fertilizerInfo.deficit?.phosphorus > 0 && (
                          <span className="deficit">
                            Deficit: {fertilizerInfo.deficit.phosphorus.toFixed(0)} ppm
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="nutrient-card">
                      <h4>Potassium (K)</h4>
                      <div className="nutrient-values">
                        <span>Current: {fertilizerInfo.current?.potassium || 0} ppm</span>
                        <span>Ideal: {fertilizerInfo.ideal?.potassium || 0} ppm</span>
                        <span className="range">Range: {fertilizerInfo.range?.potassium} ppm</span>
                        {fertilizerInfo.deficit?.potassium > 0 && (
                          <span className="deficit">
                            Deficit: {fertilizerInfo.deficit.potassium.toFixed(0)} ppm
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="nutrient-card">
                      <h4>pH Level</h4>
                      <div className="nutrient-values">
                        <span>Current: {fertilizerInfo.current?.ph?.toFixed(2) || 0}</span>
                        <span>Ideal: {fertilizerInfo.ideal?.ph?.toFixed(2) || 0}</span>
                        <span className="range">Range: {fertilizerInfo.range?.ph}</span>
                        {fertilizerInfo.deficit?.ph > 0.5 && (
                          <span className="deficit">
                            Adjustment needed: {fertilizerInfo.deficit.ph.toFixed(1)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="fertilizer-note">
                  <p>
                    <strong>Note:</strong> Apply fertilizers according to package instructions. 
                    Monitor soil regularly and adjust application as needed. These recommendations 
                    are based on the {fertilizerInfo.stage} stage requirements.
                  </p>
                </div>
              </div>

              <div className="planting-modal-footer">
                <button
                  className="planting-modal-btn planting-modal-save"
                  onClick={handleCloseFertilizerModal}
                >
                  Got it!
                </button>
              </div>
            </div>
          </div>
        )}

                {/* Price Recommendation Modal */}
        {showPriceModal && priceRecommendation && (
          <div className="planting-modal-overlay" onClick={handleClosePriceModal}>
            <div className="price-modal planting-modal" onClick={(e) => e.stopPropagation()}>
              <div className="planting-modal-header">
                <h2 className="planting-modal-title">💰 Price Recommendation</h2>
                <button className="planting-modal-close" onClick={handleClosePriceModal}>
                  ✕
                </button>
              </div>

              <div className="planting-modal-body">
                <div className="price-strategy-badge">
                  <span className={`strategy-badge strategy-${priceRecommendation.priceStrategy.toLowerCase().replace(' ', '-')}`}>
                    {priceRecommendation.priceStrategy}
                  </span>
                  <span className="quality-score">
                    Quality Score: <strong>{priceRecommendation.qualityScore}%</strong>
                  </span>
                </div>

                <div className="price-highlight-card">
                  <div className="price-icon">💵</div>
                  <div className="price-content">
                    <p className="price-label">Recommended Selling Price</p>
                    <h3 className="price-amount">₱{priceRecommendation.recommendedPrice}</h3>
                    <p className="price-unit">{priceRecommendation.unit}</p>
                  </div>
                </div>

                <div className="price-section">
                  <h3 className="section-title">Market Price Analysis</h3>
                  <div className="price-range-container">
                    <div className="price-range-bar">
                      <div className="range-marker min-marker" style={{ left: '0%' }}>
                        <span className="marker-label">Min</span>
                        <span className="marker-value">₱{priceRecommendation.minPrice}</span>
                      </div>
                      <div 
                        className="range-marker avg-marker" 
                        style={{ left: `${((priceRecommendation.avgMarketPrice - priceRecommendation.minPrice) / (priceRecommendation.maxPrice - priceRecommendation.minPrice)) * 100}%` }}
                      >
                        <span className="marker-label">Avg</span>
                        <span className="marker-value">₱{priceRecommendation.avgMarketPrice}</span>
                      </div>
                      <div 
                        className="range-marker recommended-marker" 
                        style={{ left: `${((priceRecommendation.recommendedPrice - priceRecommendation.minPrice) / (priceRecommendation.maxPrice - priceRecommendation.minPrice)) * 100}%` }}
                      >
                        <span className="marker-label">Your Price</span>
                        <span className="marker-value">₱{priceRecommendation.recommendedPrice}</span>
                      </div>
                      <div className="range-marker max-marker" style={{ left: '100%' }}>
                        <span className="marker-label">Max</span>
                        <span className="marker-value">₱{priceRecommendation.maxPrice}</span>
                      </div>
                      <div className="range-bar-fill" />
                    </div>
                  </div>
                </div>

                <div className="price-section">
                  <h3 className="section-title">Revenue Projection</h3>
                  <div className="revenue-grid">
                    <div className="revenue-card">
                      <span className="revenue-icon">📦</span>
                      <div className="revenue-info">
                        <p className="revenue-label">Estimated Yield</p>
                        <p className="revenue-value">{priceRecommendation.estimatedYield} kg</p>
                      </div>
                    </div>
                    <div className="revenue-card">
                      <span className="revenue-icon">💵</span>
                      <div className="revenue-info">
                        <p className="revenue-label">Estimated Revenue</p>
                        <p className="revenue-value revenue-highlight">₱{priceRecommendation.estimatedRevenue.toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="price-section">
                  <h3 className="section-title">Competitor Prices</h3>
                  <div className="competitor-grid">
                    {priceRecommendation.competitors?.map((price, index) => (
                      <div key={index} className="competitor-card">
                        <span className="competitor-icon">🏪</span>
                        <div className="competitor-info">
                          <p className="competitor-name">Competitor {index + 1}</p>
                          <p className="competitor-price">₱{price}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="price-section">
                  <h3 className="section-title">Key Pricing Factors</h3>
                  <div className="factors-list">
                    {priceRecommendation.factors?.map((factor, index) => (
                      <div key={index} className="factor-item">
                        <span className="factor-icon">✓</span>
                        <span className="factor-text">{factor}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="price-note">
                  <p>
                    <strong>💡 Pricing Tip:</strong> This recommendation is based on current market trends 
                    and your crop information. Adjust based on local demand and seasonality.
                  </p>
                </div>
              </div>

              <div className="planting-modal-footer">
                <button
                  className="planting-modal-btn planting-modal-cancel"
                  onClick={handleClosePriceModal}
                >
                  Cancel
                </button>
                <button
                  className="planting-modal-btn planting-modal-save"
                  onClick={async () => {
                    try {
                      if (selectedPlant) {
                        const plantRef = doc(db, 'plants', selectedPlant.id)
                        await updateDoc(plantRef, {
                          currentSellingPrice: priceRecommendation.recommendedPrice,
                          updatedAt: serverTimestamp()
                        })
                        
                        setPlantsData(prev =>
                          prev.map(plant =>
                            plant.id === selectedPlant.id
                              ? { ...plant, currentSellingPrice: priceRecommendation.recommendedPrice }
                              : plant
                          )
                        )
                        
                        alert(`Price set to ₱${priceRecommendation.recommendedPrice} ${priceRecommendation.unit}`)
                        handleClosePriceModal()
                      }
                    } catch (error) {
                      console.error('Error updating price:', error)
                      alert('Failed to update price')
                    }
                  }}
                >
                  Apply Price
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Plant Detail Modal with Tabs */}
        {showDetailModal && selectedPlant && (
          <div className="planting-modal-overlay" onClick={handleCloseDetailModal}>
            <div className="detail-modal planting-modal planting-modal-large" onClick={(e) => e.stopPropagation()}>
              <div className="planting-modal-header">
                <div className="detail-header-content">
                  <span className="detail-plant-icon">{getPlantEmoji(selectedPlant.plantType)}</span>
                  <div>
                    <h2 className="planting-modal-title">{selectedPlant.plantName}</h2>
                    <p className="detail-plant-subtitle">{selectedPlant.scientificName} - Plot {selectedPlant.plotNumber}</p>
                  </div>
                </div>
                <button className="planting-modal-close" onClick={handleCloseDetailModal}>
                  ✕
                </button>
              </div>

              <div className="detail-tabs">
                <button
                  className={`detail-tab ${activeDetailTab === 'summary' ? 'active' : ''}`}
                  onClick={() => setActiveDetailTab('summary')}
                >
                  📊 Summary
                </button>
                <button
                  className={`detail-tab ${activeDetailTab === 'soil' ? 'active' : ''}`}
                  onClick={() => setActiveDetailTab('soil')}
                >
                  🌱 Soil Data
                </button>
                <button
                  className={`detail-tab ${activeDetailTab === 'costs' ? 'active' : ''}`}
                  onClick={() => setActiveDetailTab('costs')}
                >
                  💰 Production Costs
                </button>
                <button
                  className={`detail-tab ${activeDetailTab === 'events' ? 'active' : ''}`}
                  onClick={() => setActiveDetailTab('events')}
                >
                  📅 Events
                </button>
              </div>

              <div className="planting-modal-body">
                {activeDetailTab === 'summary' && (
                  <div className="detail-content">
                    <h3>Plant Summary</h3>
                    
                    <div classNamea="detail-grid">
                      <div className="detail-card">
                        <h4>Plot Information</h4>
                        <div className="detail-info-list">
                          <div className="detail-info-item">
                            <span className="detail-label">Plot Number:</span>
                            <span className="detail-value">Plot {selectedPlant.plotNumber}</span>
                          </div>
                          <div className="detail-info-item">
                            <span className="detail-label">Plot Size:</span>
                            <span className="detail-value">{selectedPlant.plotSize}</span>
                          </div>
                          <div className="detail-info-item">
                            <span className="detail-label">Location:</span>
                            <span className="detail-value">{selectedPlant.locationZone}</span>
                          </div>
                          <div className="detail-info-item">
                            <span className="detail-label">Soil Sensor:</span>
                            <span className="detail-value">{selectedPlant.soilSensor}</span>
                          </div>
                          <div className="detail-info-item">
                            <span className="detail-label">Spacing:</span>
                            <span className="detail-value">{selectedPlant.minSpacing} - {selectedPlant.maxSpacing} cm</span>
                          </div>
                        </div>
                      </div>

                      <div className="detail-card">
                        <h4>Growth Status</h4>
                        <div className="detail-info-list">
                          <div className="detail-info-item">
                            <span className="detail-label">Current Stage:</span>
                            <span className="detail-value">
                              <span 
                                className="status-badge-inline" 
                                style={{ backgroundColor: getStatusColor(getCurrentStage(selectedPlant, plantsList[selectedPlant.plantType])?.stage || selectedPlant.status) }}
                              >
                                {getCurrentStage(selectedPlant, plantsList[selectedPlant.plantType])?.stage || selectedPlant.status}
                              </span>
                            </span>
                          </div>
                          <div className="detail-info-item">
                            <span className="detail-label">Planted Date:</span>
                            <span className="detail-value">
                              {selectedPlant.plantedDate ? new Date(selectedPlant.plantedDate).toLocaleDateString() : 'N/A'}
                            </span>
                          </div>
                          <div className="detail-info-item">
                            <span className="detail-label">Expected Harvest:</span>
                            <span className="detail-value">
                              {selectedPlant.expectedHarvestDate ? new Date(selectedPlant.expectedHarvestDate).toLocaleDateString() : 'N/A'}
                            </span>
                          </div>
                          <div className="detail-info-item">
                            <span className="detail-label">Days to Harvest:</span>
                            <span className="detail-value">{selectedPlant.daysToHarvest} days</span>
                          </div>
                          <div className="detail-info-item">
                            <span className="detail-label">Seedlings:</span>
                            <span className="detail-value">{selectedPlant.recommendedSeedlings}</span>
                          </div>
                        </div>
                      </div>

                      <div className="detail-card">
                        <h4>Production Details</h4>
                        <div className="detail-info-list">
                          <div className="detail-info-item">
                            <span className="detail-label">Current Price:</span>
                            <span className="detail-value">
                              {selectedPlant.currentSellingPrice ? `₱${selectedPlant.currentSellingPrice}` : 'Not set'}
                            </span>
                          </div>
                          <div className="detail-info-item">
                            <span className="detail-label">Unit:</span>
                            <span className="detail-value">{selectedPlant.unit}</span>
                          </div>
                          <div className="detail-info-item">
                            <span className="detail-label">Description:</span>
                            <span className="detail-value">{selectedPlant.description}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeDetailTab === 'soil' && (
                  <div className="detail-content">
                    <h3>Soil Sensor Readings</h3>
                    <p className="detail-subtitle">Data from {selectedPlant.soilSensor}</p>

                    {selectedPlant.sensorData ? (
                      <>
                        <div className="soil-data-grid">
                          <div className="soil-data-card">
                            <div className="soil-data-icon">🔬</div>
                            <div className="soil-data-content">
                              <h4>pH Level</h4>
                              <p className="soil-value">{selectedPlant.sensorData.ph?.toFixed(2) || 'N/A'}</p>
                              <p className="soil-label">Acidity/Alkalinity</p>
                              {(() => {
                                const plantInfo = plantsList[selectedPlant.plantType]
                                const currentStage = getCurrentStage(selectedPlant, plantInfo)
                                if (currentStage) {
                                  return <p className="soil-range">Range: {currentStage.lowpH} - {currentStage.highpH}</p>
                                }
                              })()}
                            </div>
                          </div>

                          <div className="soil-data-card">
                            <div className="soil-data-icon">🍃</div>
                            <div className="soil-data-content">
                              <h4>Nitrogen (N)</h4>
                              <p className="soil-value">{selectedPlant.sensorData.nitrogen || 'N/A'} ppm</p>
                              <p className="soil-label">Leaf Growth</p>
                              {(() => {
                                const plantInfo = plantsList[selectedPlant.plantType]
                                const currentStage = getCurrentStage(selectedPlant, plantInfo)
                                if (currentStage) {
                                  return <p className="soil-range">Range: {currentStage.lowN} - {currentStage.highN} ppm</p>
                                }
                              })()}
                            </div>
                          </div>

                          <div className="soil-data-card">
                            <div className="soil-data-icon">🌿</div>
                            <div className="soil-data-content">
                              <h4>Phosphorus (P)</h4>
                              <p className="soil-value">{selectedPlant.sensorData.phosphorus || 'N/A'} ppm</p>
                              <p className="soil-label">Root Development</p>
                              {(() => {
                                const plantInfo = plantsList[selectedPlant.plantType]
                                const currentStage = getCurrentStage(selectedPlant, plantInfo)
                                if (currentStage) {
                                  return <p className="soil-range">Range: {currentStage.lowP} - {currentStage.highP} ppm</p>
                                }
                              })()}
                            </div>
                          </div>

                          <div className="soil-data-card">
                            <div className="soil-data-icon">🌸</div>
                            <div className="soil-data-content">
                              <h4>Potassium (K)</h4>
                              <p className="soil-value">{selectedPlant.sensorData.potassium || 'N/A'} ppm</p>
                              <p className="soil-label">Overall Health</p>
                              {(() => {
                                const plantInfo = plantsList[selectedPlant.plantType]
                                const currentStage = getCurrentStage(selectedPlant, plantInfo)
                                if (currentStage) {
                                  return <p className="soil-range">Range: {currentStage.lowK} - {currentStage.highK} ppm</p>
                                }
                              })()}
                            </div>
                          </div>

                          <div className="soil-data-card">
                            <div className="soil-data-icon">💧</div>
                            <div className="soil-data-content">
                              <h4>Moisture</h4>
                              <p className="soil-value">{selectedPlant.sensorData.moisture || 'N/A'}%</p>
                              <p className="soil-label">Water Content</p>
                              {(() => {
                                const plantInfo = plantsList[selectedPlant.plantType]
                                const currentStage = getCurrentStage(selectedPlant, plantInfo)
                                if (currentStage) {
                                  return <p className="soil-range">Range: {currentStage.lowHum} - {currentStage.highHum}%</p>
                                }
                              })()}
                            </div>
                          </div>

                          <div className="soil-data-card">
                            <div className="soil-data-icon">🌡️</div>
                            <div className="soil-data-content">
                              <h4>Temperature</h4>
                              <p className="soil-value">{selectedPlant.sensorData.temperature || 'N/A'}°C</p>
                              <p className="soil-label">Soil Temperature</p>
                              {(() => {
                                const plantInfo = plantsList[selectedPlant.plantType]
                                const currentStage = getCurrentStage(selectedPlant, plantInfo)
                                if (currentStage) {
                                  return <p className="soil-range">Range: {currentStage.lowTemp} - {currentStage.highTemp}°C</p>
                                }
                              })()}
                            </div>
                          </div>
                        </div>

                        {(() => {
                          const plantInfo = plantsList[selectedPlant.plantType]
                          const currentStage = getCurrentStage(selectedPlant, plantInfo)
                          if (currentStage) {
                            return (
                              <div className="stage-requirements">
                                <h4>Current Stage: {currentStage.stage}</h4>
                                <p className="stage-duration">
                                  Day {currentStage.startDuration} - {currentStage.endDuration} 
                                  ({currentStage.endDuration - currentStage.startDuration + 1} days)
                                </p>
                                <div className="stage-notes">
                                  <p><strong>Notes:</strong> {currentStage.notes}</p>
                                  <p><strong>Watering:</strong> {currentStage.watering}</p>
                                </div>
                              </div>
                            )
                          }
                        })()}
                      </>
                    ) : (
                      <div className="no-data-message">
                        <p>No soil sensor data available for this plant.</p>
                      </div>
                    )}

                    <div className="soil-actions">
                      <button
                        className="planting-modal-btn planting-modal-save"
                        onClick={() => {
                          handleCloseDetailModal()
                          handleOpenFertilizerModal(selectedPlant)
                        }}
                      >
                        View Fertilizer Recommendations
                      </button>
                    </div>
                  </div>
                )}

                {activeDetailTab === 'costs' && (
                  <div className="detail-content">
                    <h3>Production Costs</h3>
                    
                    <div className="costs-summary-card">
                      <h4>Cost Breakdown</h4>
                      <div className="costs-list">
                        <div className="cost-item">
                          <span className="cost-label">Seeds/Seedlings:</span>
                          <span className="cost-value">₱{(selectedPlant.recommendedSeedlings * 5).toLocaleString()}</span>
                        </div>
                        <div className="cost-item">
                          <span className="cost-label">Fertilizers:</span>
                          <span className="cost-value">₱500</span>
                        </div>
                        <div className="cost-item">
                          <span className="cost-label">Pesticides:</span>
                          <span className="cost-value">₱300</span>
                        </div>
                        <div className="cost-item">
                          <span className="cost-label">Water & Utilities:</span>
                          <span className="cost-value">₱200</span>
                        </div>
                        <div className="cost-item">
                          <span className="cost-label">Labor:</span>
                          <span className="cost-value">₱1,000</span>
                        </div>
                        <div className="cost-item total">
                          <span className="cost-label"><strong>Total Cost:</strong></span>
                          <span className="cost-value">
                            <strong>₱{((selectedPlant.recommendedSeedlings * 5) + 500 + 300 + 200 + 1000).toLocaleString()}</strong>
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="profit-projection">
                      <h4>Profit Projection</h4>
                      <div className="profit-details">
                        <div className="profit-item">
                          <span className="profit-label">Expected Revenue:</span>
                          <span className="profit-value success">
                            {selectedPlant.currentSellingPrice 
                              ? `₱${(5 * selectedPlant.currentSellingPrice).toLocaleString()}`
                              : 'Set price first'}
                          </span>
                        </div>
                        <div className="profit-item">
                          <span className="profit-label">Total Costs:</span>
                          <span className="profit-value">
                            ₱{((selectedPlant.recommendedSeedlings * 5) + 2000).toLocaleString()}
                          </span>
                        </div>
                        <div className="profit-item highlight">
                          <span className="profit-label"><strong>Net Profit:</strong></span>
                          <span className="profit-value success">
                            <strong>
                              {selectedPlant.currentSellingPrice 
                                ? `₱${((5 * selectedPlant.currentSellingPrice) - ((selectedPlant.recommendedSeedlings * 5) + 2000)).toLocaleString()}`
                                : 'N/A'}
                            </strong>
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="costs-actions">
                      <button
                        className="planting-modal-btn planting-modal-save"
                        onClick={() => {
                          handleCloseDetailModal()
                          handleOpenPriceModal(selectedPlant)
                        }}
                      >
                        Get Price Recommendation
                      </button>
                    </div>
                  </div>
                )}

                {activeDetailTab === 'events' && (
                  <div className="detail-content">
                    <h3>Plant Events & History</h3>
                    
                    <div className="events-timeline">
                      {plantEvents.length > 0 ? (
                        plantEvents.map((event, index) => (
                          <div key={event.id} className="timeline-item">
                            <div className="timeline-marker">
                              {event.type === 'LIFECYCLE_STAGE' ? '🌱' : '📌'}
                            </div>
                            <div className="timeline-content">
                              <h4>{event.message}</h4>
                              <p className="timeline-date">
                                {event.timestamp?.toDate 
                                  ? event.timestamp.toDate().toLocaleString() 
                                  : new Date(event.timestamp).toLocaleString()}
                              </p>
                              <span className={`event-status-badge ${event.status}`}>
                                {event.status}
                              </span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="no-events-message">
                          <p>No events recorded yet for this plant.</p>
                        </div>
                      )}
                    </div>

                    <div className="events-note">
                      <p>
                        <strong>Note:</strong> Event tracking helps you monitor plant progress and make informed decisions.
                        Stage changes are automatically tracked based on the plant's lifecycle.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="planting-modal-footer">
                <button
                  className="planting-modal-btn planting-modal-cancel"
                  onClick={handleCloseDetailModal}
                >
                  Close
                </button>
                <button
                  className="planting-modal-btn planting-modal-save"
                  onClick={() => {
                    handleCloseDetailModal()
                    handleOpenEditModal(selectedPlant)
                  }}
                >
                  Edit Plant
                </button>
              </div>
            </div>
          </div>
        )}

        <CustomAlert
          show={alertConfig.show}
          type={alertConfig.type}
          title={alertConfig.title}
          message={alertConfig.message}
          details={alertConfig.details}
          onConfirm={alertConfig.onConfirm}
          onCancel={alertConfig.onCancel}
          confirmText={alertConfig.confirmText}
          cancelText={alertConfig.cancelText}
          showCancel={alertConfig.showCancel}
        />
      </div>
    </div>
  )
}

export default Planting