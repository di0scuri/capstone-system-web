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
  const [showProductionCostModal, setShowProductionCostModal] = useState(false)
  const [showHarvestModal, setShowHarvestModal] = useState(false) // NEW
  const [selectedPlant, setSelectedPlant] = useState(null)
  const [plants, setPlantsData] = useState([])
  const [plantsList, setPlantsList] = useState({})
  const [loading, setLoading] = useState(true)
  const [productionCostData, setProductionCostData] = useState(null)
  const [harvestData, setHarvestData] = useState({ // NEW
    actualYield: '',
    yieldUnit: 'kg',
    quality: 'A',
    notes: '',
    harvestDate: new Date().toISOString().split('T')[0]
  })
  const [editFormData, setEditFormData] = useState({
    locationZone: '',
    status: '',
    currentSellingPrice: '',
    unit: '',
    survivingPlants: ''
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
  const [activeDetailTab, setActiveDetailTab] = useState('summary')
  const [plantEvents, setPlantEvents] = useState([])

  // Sensor status and ranking states
  const [sensorStatus, setSensorStatus] = useState(null)
  const [rankedPlants, setRankedPlants] = useState([])
  const [loadingSensorStatus, setLoadingSensorStatus] = useState(false)

  const locationZoneOptions = ['Closed Greenhouse', 'Nursery 1', 'Nursery 2']

  const [customPlotSize, setCustomPlotSize] = useState({ length: 30, width: 20 }) // in cm
  const [isSubmitting, setIsSubmitting] = useState(false) // Prevent double submission
  

  // Plot options (1-5) with standard size 30x20cm = 0.06 sq meters
// Plot options (1-5) - size will be calculated based on custom input
  const plotOptions = [
    { number: 1 },
    { number: 2 },
    { number: 3 },
    { number: 4 },
    { number: 5 }
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

  // Calculate survival rate
  const calculateSurvivalRate = (plant) => {
    const recommended = parseInt(plant.recommendedSeedlings) || 0
    const surviving = parseInt(plant.survivingPlants ?? plant.recommendedSeedlings) || 0
    
    if (recommended === 0) return 100
    return Math.round((surviving / recommended) * 100)
  }

  // Get survival rate color
  const getSurvivalRateColor = (rate) => {
    if (rate >= 90) return '#10b981' // Green - Excellent
    if (rate >= 75) return '#3b82f6' // Blue - Good
    if (rate >= 60) return '#f59e0b' // Orange - Fair
    if (rate >= 40) return '#f97316' // Dark Orange - Poor
    return '#ef4444' // Red - Critical
  }

  // Get survival rate label
  const getSurvivalRateLabel = (rate) => {
    if (rate >= 90) return 'Excellent'
    if (rate >= 75) return 'Good'
    if (rate >= 60) return 'Fair'
    if (rate >= 40) return 'Poor'
    return 'Critical'
  }

  // NEW: Calculate sensor data percentage based on ideal range
  const calculateSensorPercentage = (current, low, high) => {
    if (!current || !low || !high) return 0
    
    const mid = (low + high) / 2
    const range = high - low
    
    // If within range, calculate how close to ideal (mid)
    if (current >= low && current <= high) {
      const distanceFromMid = Math.abs(current - mid)
      const percentageFromMid = (distanceFromMid / (range / 2)) * 100
      return Math.max(0, 100 - percentageFromMid)
    }
    
    // If outside range, calculate how far
    if (current < low) {
      const deficit = low - current
      return Math.max(0, 100 - (deficit / low) * 100)
    }
    
    // current > high
    const excess = current - high
    return Math.max(0, 100 - (excess / high) * 100)
  }

  // NEW: Get percentage color
  const getPercentageColor = (percentage) => {
    if (percentage >= 80) return '#10b981' // Green
    if (percentage >= 60) return '#3b82f6' // Blue
    if (percentage >= 40) return '#f59e0b' // Orange
    return '#ef4444' // Red
  }

  // Calculate plot size in square meters from cm dimensions
  const calculatePlotSize = (lengthCm, widthCm) => {
    return (lengthCm * widthCm) / 10000 // Convert cm² to m²
  }

// Get display size string
  const getDisplaySize = (lengthCm, widthCm) => {
    return `${lengthCm}x${widthCm}cm`
  }

  

  // NEW: Fetch production cost data
  const fetchProductionCost = async (plantId) => {
    try {
      const q = query(collection(db, 'productionCosts'), where('plantId', '==', plantId))
      const snapshot = await getDocs(q)
      
      if (!snapshot.empty) {
        return snapshot.docs[0].data()
      }
      return null
    } catch (error) {
      console.error('Error fetching production cost:', error)
      return null
    }
  }

  // NEW: Handle view production cost
  const handleViewProductionCost = async (plant) => {
    setSelectedPlant(plant)
    const costData = await fetchProductionCost(plant.id)
    
    if (costData) {
      setProductionCostData(costData)
      setShowProductionCostModal(true)
    } else {
      showAlert({
        type: 'info',
        title: 'No Production Cost Data',
        message: 'This plant does not have production costing data yet. Go to Production Costing page to add costs.',
        confirmText: 'OK'
      })
    }
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

  // Check sensor status
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

  // Plant ranking system
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
  const calculateRecommendedSeedlings = (plantKey, plotSizeM2) => {
    const plantInfo = plantsList[plantKey]
    if (!plantInfo) return 0
    
    const minSpacing = parseFloat(plantInfo.minSpacingCM) || 20
    const maxSpacing = parseFloat(plantInfo.maxSpacingCM) || 25
    const avgSpacing = (minSpacing + maxSpacing) / 2
    
    const plotSizeCm2 = plotSizeM2 * 10000
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
      survivingPlants: (plant.survivingPlants ?? plant.recommendedSeedlings)?.toString() || ''
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
          survivingPlants: survivingPlants,
          updatedAt: serverTimestamp()
        }

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
    setCustomPlotSize({ length: 30, width: 20 }) // Reset to default
    setSensorData(null)
    setScanProgress(0)
    setSensorStatus(null)
    setRankedPlants([])
    setIsSubmitting(false) // Reset submission state
  }

  const handleCloseAddPlotModal = () => {
    setShowAddPlotModal(false)
    setPlotStep('input')
    setSelectedPlotNumber('')
    setSelectedSoilSensor('')
    setSelectedPlantType('')
    setCustomPlotSize({ length: 30, width: 20 })
    setSensorData(null)
    setSensorStatus(null)
    setRankedPlants([])
    setIsSubmitting(false) // Reset submission state
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
  const plotSizeM2 = calculatePlotSize(customPlotSize.length, customPlotSize.width)
  const seedlings = calculateRecommendedSeedlings(plantKey, plotSizeM2)
  setRecommendedSeedlings(seedlings)
  }


  const handlePlotSizeChange = (dimension, value) => {
  const numValue = parseInt(value) || 0
  const newSize = {
    ...customPlotSize,
    [dimension]: numValue
  }
  setCustomPlotSize(newSize)
  
  // Recalculate seedlings if plant is already selected
  if (selectedPlantType) {
    const plotSizeM2 = calculatePlotSize(newSize.length, newSize.width)
    const seedlings = calculateRecommendedSeedlings(selectedPlantType, plotSizeM2)
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
    // Prevent double submission
    if (isSubmitting) {
      return
    }

    try {
      setIsSubmitting(true) // Set submitting flag

      if (!userId || userId === 'default-user') {
        showAlert({
          type: 'error',
          title: 'Authentication Required',
          message: 'You must be logged in to add plants.',
          confirmText: 'OK'
        })
        setIsSubmitting(false)
        return
      }

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
        setIsSubmitting(false)
        return
      }

      const plotSizeM2 = calculatePlotSize(customPlotSize.length, customPlotSize.width)
      const displaySize = getDisplaySize(customPlotSize.length, customPlotSize.width)
      const plantInfo = plantsList[selectedPlantType]

      if (!plantInfo) {
        showAlert({
          type: 'error',
          title: 'Plant Information Not Found',
          message: 'Unable to find information for the selected plant.',
          confirmText: 'OK'
        })
        setIsSubmitting(false)
        return
      }

      const plantedDate = new Date()
      const daysToHarvest = parseInt(plantInfo.daysToHarvest) || 30
      const expectedHarvestDate = new Date(plantedDate.getTime() + daysToHarvest * 24 * 60 * 60 * 1000)

      const formattedDate = plantedDate.toISOString().split('T')[0]
      const generatedPlantName = `${plantInfo.name} - Plot ${selectedPlotNumber} - ${formattedDate}`

      const newPlant = {
        plotNumber: selectedPlotNumber,
        plotSize: displaySize,
        plotSizeM2: plotSizeM2,
        soilSensor: selectedSoilSensor,
        plantType: selectedPlantType,
        plantName: generatedPlantName,
        scientificName: plantInfo.sName || '',
        recommendedSeedlings,
        survivingPlants: recommendedSeedlings,
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
      
      await addDoc(collection(db, 'events'), {
        plantId: docRef.id,
        type: 'LIFECYCLE_STAGE',
        status: 'info',
        message: `Stage start: Germination for ${plantInfo.name} - ${plantedDate.toLocaleDateString()}`,
        timestamp: serverTimestamp(),
        createdAt: serverTimestamp(),
        userId: userId
      })

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
          { label: 'Plot Size', value: displaySize },
          { label: 'Seedlings', value: recommendedSeedlings.toString() },
          { label: 'Expected Harvest', value: expectedHarvestDate.toLocaleDateString() },
          { label: 'Days to Harvest', value: `${daysToHarvest} days` }
        ],
        confirmText: 'View Plants'
      })
    } catch (error) {
      console.error('Error adding plant:', error)
      
      let errorMessage = 'An error occurred while adding the plot.'
      let errorDetails = [{ label: 'Error', value: error.message }]
      
      if (error.code === 'permission-denied') {
        errorMessage = 'You do not have permission to add plants. Please check your authentication.'
        errorDetails = [
          { label: 'Error Code', value: error.code },
          { label: 'User ID', value: userId || 'Not authenticated' },
          { label: 'Solution', value: 'Please log out and log back in' }
        ]
      }
      
      showAlert({
        type: 'error',
        title: 'Failed to Add Plot',
        message: errorMessage,
        details: errorDetails,
        confirmText: 'Try Again'
      })
    } finally {
      setIsSubmitting(false) // Reset submitting flag
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

  // NEW: Harvest handlers
  const handleOpenHarvestModal = (plant) => {
    setSelectedPlant(plant)
    
    // Check if plant is ready for harvest
    const plantedDate = new Date(plant.plantedDate)
    const expectedHarvestDate = new Date(plant.expectedHarvestDate)
    const today = new Date()
    
    const daysUntilHarvest = Math.ceil((expectedHarvestDate - today) / (1000 * 60 * 60 * 24))
    
    if (daysUntilHarvest > 7) {
      showAlert({
        type: 'warning',
        title: 'Not Ready for Harvest',
        message: `This plant is not ready for harvest yet. Expected harvest date is ${daysUntilHarvest} days away.`,
        details: [
          { label: 'Expected Harvest', value: expectedHarvestDate.toLocaleDateString() },
          { label: 'Days Remaining', value: `${daysUntilHarvest} days` }
        ],
        confirmText: 'OK'
      })
      return
    }
    
    // Pre-fill harvest data
    setHarvestData({
      actualYield: '',
      yieldUnit: plant.unit?.replace('per ', '') || 'kg',
      quality: 'A',
      notes: '',
      harvestDate: new Date().toISOString().split('T')[0]
    })
    
    setShowHarvestModal(true)
  }

  const handleCloseHarvestModal = () => {
    setShowHarvestModal(false)
    setSelectedPlant(null)
    setHarvestData({
      actualYield: '',
      yieldUnit: 'kg',
      quality: 'A',
      notes: '',
      harvestDate: new Date().toISOString().split('T')[0]
    })
  }

  const handleHarvestInputChange = (e) => {
    const { name, value } = e.target
    setHarvestData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleConfirmHarvest = async () => {
    try {
      if (!harvestData.actualYield || parseFloat(harvestData.actualYield) <= 0) {
        showAlert({
          type: 'warning',
          title: 'Invalid Yield',
          message: 'Please enter a valid yield amount.',
          confirmText: 'OK'
        })
        return
      }

      const actualYield = parseFloat(harvestData.actualYield)
      const plantInfo = plantsList[selectedPlant.plantType]
      
      // Calculate revenue and profit
      const sellingPrice = parseFloat(selectedPlant.currentSellingPrice) || 0
      const totalRevenue = actualYield * sellingPrice
      
      // Get production cost if available
      let productionCost = 0
      let profit = 0
      let roi = 0
      
      try {
        const costQuery = query(collection(db, 'productionCosts'), where('plantId', '==', selectedPlant.id))
        const costSnapshot = await getDocs(costQuery)
        if (!costSnapshot.empty) {
          productionCost = costSnapshot.docs[0].data().totalCost || 0
          profit = totalRevenue - productionCost
          roi = productionCost > 0 ? (profit / productionCost) * 100 : 0
        }
      } catch (error) {
        console.error('Error fetching production cost:', error)
      }

      // Create harvest record
      const harvestRecord = {
        plantId: selectedPlant.id,
        plantName: selectedPlant.plantName,
        plantType: selectedPlant.plantType,
        plotNumber: selectedPlant.plotNumber,
        harvestDate: harvestData.harvestDate,
        actualYield: actualYield,
        yieldUnit: harvestData.yieldUnit,
        quality: harvestData.quality,
        sellingPrice: sellingPrice,
        totalRevenue: totalRevenue,
        productionCost: productionCost,
        profit: profit,
        roi: roi,
        notes: harvestData.notes,
        plantedDate: selectedPlant.plantedDate,
        expectedHarvestDate: selectedPlant.expectedHarvestDate,
        survivingPlants: selectedPlant.survivingPlants || selectedPlant.recommendedSeedlings,
        recommendedSeedlings: selectedPlant.recommendedSeedlings,
        createdAt: serverTimestamp(),
        userId: userId
      }

      // Add to harvests collection
      await addDoc(collection(db, 'harvests'), harvestRecord)

      // Update plant status to Harvested
      const plantRef = doc(db, 'plants', selectedPlant.id)
      await updateDoc(plantRef, {
        status: 'Harvested',
        harvestDate: harvestData.harvestDate,
        actualYield: actualYield,
        harvestedAt: serverTimestamp()
      })

      // Create harvest event
      await addDoc(collection(db, 'events'), {
        plantId: selectedPlant.id,
        type: 'HARVEST',
        status: 'success',
        message: `Harvested: ${actualYield} ${harvestData.yieldUnit} of ${plantInfo?.name || selectedPlant.plantType} (Quality: ${harvestData.quality})`,
        timestamp: serverTimestamp(),
        createdAt: serverTimestamp(),
        userId: userId,
        details: {
          yield: actualYield,
          unit: harvestData.yieldUnit,
          quality: harvestData.quality,
          revenue: totalRevenue,
          profit: profit,
          roi: roi.toFixed(1)
        }
      })

      // Add to calendar
      await addDoc(collection(db, 'calendar'), {
        plantId: selectedPlant.id,
        plantName: selectedPlant.plantName,
        type: 'HARVEST_COMPLETE',
        stage: 'Harvested',
        date: harvestData.harvestDate,
        message: `✅ Harvested: ${plantInfo?.name} - ${actualYield} ${harvestData.yieldUnit}`,
        status: 'success',
        createdAt: serverTimestamp(),
        userId: userId
      })

      // Update local state
      setPlantsData(prev =>
        prev.map(plant =>
          plant.id === selectedPlant.id
            ? { ...plant, status: 'Harvested', harvestDate: harvestData.harvestDate, actualYield: actualYield }
            : plant
        )
      )

      handleCloseHarvestModal()

      // Show success alert with details
      showAlert({
        type: 'success',
        title: '🎉 Harvest Complete!',
        message: `Successfully harvested ${actualYield} ${harvestData.yieldUnit} of ${plantInfo?.name}.`,
        details: [
          { label: 'Yield', value: `${actualYield} ${harvestData.yieldUnit}` },
          { label: 'Quality Grade', value: harvestData.quality },
          { label: 'Revenue', value: `₱${totalRevenue.toLocaleString()}` },
          ...(productionCost > 0 ? [
            { label: 'Production Cost', value: `₱${productionCost.toLocaleString()}` },
            { label: 'Profit', value: `₱${profit.toLocaleString()}` },
            { label: 'ROI', value: `${roi.toFixed(1)}%` }
          ] : [])
        ],
        confirmText: 'View Harvest Records'
      })
    } catch (error) {
      console.error('Error recording harvest:', error)
      showAlert({
        type: 'error',
        title: 'Harvest Failed',
        message: 'Failed to record harvest. Please try again.',
        details: [{ label: 'Error', value: error.message }],
        confirmText: 'OK'
      })
    }
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
              
              // Check if ready for harvest
              const expectedHarvestDate = new Date(plant.expectedHarvestDate)
              const today = new Date()
              const daysUntilHarvest = Math.ceil((expectedHarvestDate - today) / (1000 * 60 * 60 * 24))
              const isReadyForHarvest = daysUntilHarvest <= 7 && plant.status !== 'Harvested'
              
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
                    {plant.status === 'Harvested' ? (
                      <div className="harvested-badge">
                        ✅ Harvested on {plant.harvestDate ? new Date(plant.harvestDate).toLocaleDateString() : 'N/A'}
                      </div>
                    ) : isReadyForHarvest ? (
                      <>
                        <button
                          className="planting-card-btn harvest-btn"
                          onClick={() => handleOpenHarvestModal(plant)}
                        >
                          🌾 Harvest
                        </button>
                        <button
                          className="planting-card-btn"
                          onClick={() => handleOpenEditModal(plant)}
                        >
                          Edit
                        </button>
                      </>
                    ) : (
                      <>
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
                          onClick={() => handleViewProductionCost(plant)}
                        >
                          Production
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Continue with modals - I'll show the key updates for soil data tab and production cost modal */}
        
        {/* NEW: Production Cost Modal (Read-Only) */}
        {showProductionCostModal && productionCostData && selectedPlant && (
          <div className="production-modal-overlay" onClick={() => setShowProductionCostModal(false)}>
            <div className="production-modal view-modal" onClick={(e) => e.stopPropagation()}>
              <div className="production-modal-header">
                <h2 className="production-modal-title">
                  💰 Production Cost Summary - {selectedPlant.plantName}
                </h2>
                <button className="production-modal-close" onClick={() => setShowProductionCostModal(false)}>
                  ✕
                </button>
              </div>

              <div className="production-modal-body">
                <div style={{ 
                  background: '#e0f2fe', 
                  padding: '12px', 
                  borderRadius: '8px', 
                  marginBottom: '20px',
                  fontSize: '14px',
                  color: '#0369a1'
                }}>
                  ℹ️ <strong>View Only:</strong> Production costs can only be edited in the Production Costing page.
                </div>

                {/* Summary Cards */}
                <div className="summary-cards">
                  <div className="summary-card">
                    <span className="card-icon">💰</span>
                    <div className="card-content">
                      <p className="card-label">Total Cost</p>
                      <p className="card-value">₱{productionCostData.totalCost.toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="summary-card">
                    <span className="card-icon">📏</span>
                    <div className="card-content">
                      <p className="card-label">Cost per m²</p>
                      <p className="card-value">₱{productionCostData.costPerSqm.toFixed(2)}</p>
                    </div>
                  </div>
                  <div className="summary-card">
                    <span className="card-icon">📦</span>
                    <div className="card-content">
                      <p className="card-label">Cost per Unit</p>
                      <p className="card-value">₱{productionCostData.costPerUnit.toFixed(2)}</p>
                    </div>
                  </div>
                  <div className="summary-card">
                    <span className="card-icon">🌾</span>
                    <div className="card-content">
                      <p className="card-label">Plants</p>
                      <p className="card-value">{productionCostData.survivingPlants || productionCostData.estimatedYield || 0}</p>
                    </div>
                  </div>
                </div>

                {/* NEW: Price and Revenue Information */}
                {selectedPlant.currentSellingPrice && (
                  <div style={{
                    background: '#f0fdf4',
                    border: '2px solid #10b981',
                    borderRadius: '8px',
                    padding: '20px',
                    marginTop: '20px',
                    marginBottom: '20px'
                  }}>
                    <h3 style={{ margin: '0 0 15px 0', color: '#065f46', fontSize: '1.1em' }}>
                      💵 Pricing & Revenue Analysis
                    </h3>
                    <div className="summary-cards" style={{ marginTop: '15px' }}>
                      <div className="summary-card">
                        <span className="card-icon">💵</span>
                        <div className="card-content">
                          <p className="card-label">Selling Price</p>
                          <p className="card-value" style={{ color: '#10b981' }}>
                            ₱{parseFloat(selectedPlant.currentSellingPrice).toLocaleString()} {selectedPlant.unit}
                          </p>
                        </div>
                      </div>
                      <div className="summary-card">
                        <span className="card-icon">📊</span>
                        <div className="card-content">
                          <p className="card-label">Expected Revenue</p>
                          <p className="card-value" style={{ color: '#10b981' }}>
                            ₱{(
                              parseFloat(selectedPlant.currentSellingPrice) * 
                              (selectedPlant.survivingPlants ?? selectedPlant.recommendedSeedlings ?? 0)
                            ).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="summary-card">
                        <span className="card-icon">💹</span>
                        <div className="card-content">
                          <p className="card-label">Profit Margin</p>
                          <p className="card-value" style={{ 
                            color: (parseFloat(selectedPlant.currentSellingPrice) * 
                              (selectedPlant.survivingPlants ?? selectedPlant.recommendedSeedlings ?? 0)) - 
                              productionCostData.totalCost > 0 ? '#10b981' : '#ef4444'
                          }}>
                            ₱{(
                              (parseFloat(selectedPlant.currentSellingPrice) * 
                              (selectedPlant.survivingPlants ?? selectedPlant.recommendedSeedlings ?? 0)) - 
                              productionCostData.totalCost
                            ).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="summary-card">
                        <span className="card-icon">📈</span>
                        <div className="card-content">
                          <p className="card-label">ROI</p>
                          <p className="card-value" style={{ 
                            color: ((parseFloat(selectedPlant.currentSellingPrice) * 
                              (selectedPlant.survivingPlants ?? selectedPlant.recommendedSeedlings ?? 0)) - 
                              productionCostData.totalCost) / productionCostData.totalCost * 100 > 0 ? '#10b981' : '#ef4444'
                          }}>
                            {(
                              ((parseFloat(selectedPlant.currentSellingPrice) * 
                              (selectedPlant.survivingPlants ?? selectedPlant.recommendedSeedlings ?? 0)) - 
                              productionCostData.totalCost) / productionCostData.totalCost * 100
                            ).toFixed(1)}%
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {!selectedPlant.currentSellingPrice && (
                  <div style={{
                    background: '#fef3c7',
                    border: '2px solid #f59e0b',
                    borderRadius: '8px',
                    padding: '15px',
                    marginTop: '20px',
                    marginBottom: '20px',
                    textAlign: 'center',
                    color: '#92400e'
                  }}>
                    ⚠️ <strong>No selling price set.</strong> Set a price in the Edit menu to calculate revenue and profit.
                  </div>
                )}

                {/* Created/Modified By Info */}
                {productionCostData.createdBy && (
                  <div style={{ 
                    background: '#f3f4f6', 
                    padding: '12px', 
                    borderRadius: '8px', 
                    marginBottom: '20px',
                    fontSize: '14px',
                    color: '#6b7280'
                  }}>
                    <strong>Created by:</strong> {productionCostData.createdBy.toUpperCase()}
                    {productionCostData.lastModifiedBy && productionCostData.lastModifiedBy !== productionCostData.createdBy && (
                      <span style={{ marginLeft: '20px' }}>
                        <strong>Last modified by:</strong> {productionCostData.lastModifiedBy.toUpperCase()}
                      </span>
                    )}
                  </div>
                )}

                {/* Cost Breakdown */}
                <div className="breakdown-section">
                  <h3 className="section-title">Cost Breakdown by Category</h3>
                  <div className="breakdown-list">
                    {Object.entries(productionCostData.breakdown).map(([key, value]) => {
                      const percentage = (value / productionCostData.totalCost * 100).toFixed(1)
                      const labels = {
                        landPreparation: '🌾 Land Preparation',
                        plantingMaterials: '🌱 Planting Materials',
                        inputs: '💧 Input Costs',
                        labor: '👨‍🌾 Labor',
                        equipment: '⚙️ Equipment & Machinery',
                        irrigation: '🚿 Irrigation & Water',
                        harvesting: '🧺 Harvesting & Post-Harvest',
                        overhead: '🏢 Overhead',
                        marketing: '💰 Marketing',
                        contingency: '📊 Contingency'
                      }
                      return (
                        <div key={key} className="breakdown-item">
                          <div className="breakdown-header">
                            <span className="breakdown-label">{labels[key]}</span>
                            <span className="breakdown-value">₱{value.toLocaleString()}</span>
                          </div>
                          <div className="breakdown-bar">
                            <div 
                              className="breakdown-fill" 
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                          <span className="breakdown-percentage">{percentage}%</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>

              <div className="production-modal-footer">
                <button 
                  className="production-modal-btn save-btn"
                  onClick={() => setShowProductionCostModal(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Modal - Updated with surviving plants */}
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

        {/* Detail Modal with updated Soil Data Tab */}
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
                    
                    <div className="detail-grid">
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
                            <span className="detail-value">
                              {selectedPlant.survivingPlants ?? selectedPlant.recommendedSeedlings} / {selectedPlant.recommendedSeedlings}
                            </span>
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
                          {(() => {
                            const plantInfo = plantsList[selectedPlant.plantType]
                            const currentStage = getCurrentStage(selectedPlant, plantInfo)
                            
                            if (!currentStage) return null
                            
                            const phPercent = calculateSensorPercentage(
                              selectedPlant.sensorData.ph,
                              currentStage.lowpH,
                              currentStage.highpH
                            )
                            const nPercent = calculateSensorPercentage(
                              selectedPlant.sensorData.nitrogen,
                              currentStage.lowN,
                              currentStage.highN
                            )
                            const pPercent = calculateSensorPercentage(
                              selectedPlant.sensorData.phosphorus,
                              currentStage.lowP,
                              currentStage.highP
                            )
                            const kPercent = calculateSensorPercentage(
                              selectedPlant.sensorData.potassium,
                              currentStage.lowK,
                              currentStage.highK
                            )
                            const moistPercent = calculateSensorPercentage(
                              selectedPlant.sensorData.moisture,
                              currentStage.lowHum,
                              currentStage.highHum
                            )
                            const tempPercent = calculateSensorPercentage(
                              selectedPlant.sensorData.temperature,
                              currentStage.lowTemp,
                              currentStage.highTemp
                            )
                            
                            return (
                              <>
                                <div className="soil-data-card">
                                  <div className="soil-data-icon">🔬</div>
                                  <div className="soil-data-content">
                                    <h4>pH Level</h4>
                                    <p className="soil-value">{selectedPlant.sensorData.ph?.toFixed(2) || 'N/A'}</p>
                                    <p className="soil-label">Acidity/Alkalinity</p>
                                    <p className="soil-range">Range: {currentStage.lowpH} - {currentStage.highpH}</p>
                                    <div style={{
                                      marginTop: '8px',
                                      padding: '6px 12px',
                                      background: getPercentageColor(phPercent),
                                      color: 'white',
                                      borderRadius: '4px',
                                      fontWeight: 'bold',
                                      fontSize: '0.9em'
                                    }}>
                                      {phPercent.toFixed(0)}% Optimal
                                    </div>
                                  </div>
                                </div>

                                <div className="soil-data-card">
                                  <div className="soil-data-icon">🍃</div>
                                  <div className="soil-data-content">
                                    <h4>Nitrogen (N)</h4>
                                    <p className="soil-value">{selectedPlant.sensorData.nitrogen || 'N/A'} ppm</p>
                                    <p className="soil-label">Leaf Growth</p>
                                    <p className="soil-range">Range: {currentStage.lowN} - {currentStage.highN} ppm</p>
                                    <div style={{
                                      marginTop: '8px',
                                      padding: '6px 12px',
                                      background: getPercentageColor(nPercent),
                                      color: 'white',
                                      borderRadius: '4px',
                                      fontWeight: 'bold',
                                      fontSize: '0.9em'
                                    }}>
                                      {nPercent.toFixed(0)}% Optimal
                                    </div>
                                  </div>
                                </div>

                                <div className="soil-data-card">
                                  <div className="soil-data-icon">🌿</div>
                                  <div className="soil-data-content">
                                    <h4>Phosphorus (P)</h4>
                                    <p className="soil-value">{selectedPlant.sensorData.phosphorus || 'N/A'} ppm</p>
                                    <p className="soil-label">Root Development</p>
                                    <p className="soil-range">Range: {currentStage.lowP} - {currentStage.highP} ppm</p>
                                    <div style={{
                                      marginTop: '8px',
                                      padding: '6px 12px',
                                      background: getPercentageColor(pPercent),
                                      color: 'white',
                                      borderRadius: '4px',
                                      fontWeight: 'bold',
                                      fontSize: '0.9em'
                                    }}>
                                      {pPercent.toFixed(0)}% Optimal
                                    </div>
                                  </div>
                                </div>

                                <div className="soil-data-card">
                                  <div className="soil-data-icon">🌸</div>
                                  <div className="soil-data-content">
                                    <h4>Potassium (K)</h4>
                                    <p className="soil-value">{selectedPlant.sensorData.potassium || 'N/A'} ppm</p>
                                    <p className="soil-label">Overall Health</p>
                                    <p className="soil-range">Range: {currentStage.lowK} - {currentStage.highK} ppm</p>
                                    <div style={{
                                      marginTop: '8px',
                                      padding: '6px 12px',
                                      background: getPercentageColor(kPercent),
                                      color: 'white',
                                      borderRadius: '4px',
                                      fontWeight: 'bold',
                                      fontSize: '0.9em'
                                    }}>
                                      {kPercent.toFixed(0)}% Optimal
                                    </div>
                                  </div>
                                </div>

                                <div className="soil-data-card">
                                  <div className="soil-data-icon">💧</div>
                                  <div className="soil-data-content">
                                    <h4>Moisture</h4>
                                    <p className="soil-value">{selectedPlant.sensorData.moisture || 'N/A'}%</p>
                                    <p className="soil-label">Water Content</p>
                                    <p className="soil-range">Range: {currentStage.lowHum} - {currentStage.highHum}%</p>
                                    <div style={{
                                      marginTop: '8px',
                                      padding: '6px 12px',
                                      background: getPercentageColor(moistPercent),
                                      color: 'white',
                                      borderRadius: '4px',
                                      fontWeight: 'bold',
                                      fontSize: '0.9em'
                                    }}>
                                      {moistPercent.toFixed(0)}% Optimal
                                    </div>
                                  </div>
                                </div>

                                <div className="soil-data-card">
                                  <div className="soil-data-icon">🌡️</div>
                                  <div className="soil-data-content">
                                    <h4>Temperature</h4>
                                    <p className="soil-value">{selectedPlant.sensorData.temperature || 'N/A'}°C</p>
                                    <p className="soil-label">Soil Temperature</p>
                                    <p className="soil-range">Range: {currentStage.lowTemp} - {currentStage.highTemp}°C</p>
                                    <div style={{
                                      marginTop: '8px',
                                      padding: '6px 12px',
                                      background: getPercentageColor(tempPercent),
                                      color: 'white',
                                      borderRadius: '4px',
                                      fontWeight: 'bold',
                                      fontSize: '0.9em'
                                    }}>
                                      {tempPercent.toFixed(0)}% Optimal
                                    </div>
                                  </div>
                                </div>
                              </>
                            )
                          })()}
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

                {/* Other tabs remain the same but add link to production costs */}
                {activeDetailTab === 'costs' && (
                  <div className="detail-content">
                    <h3>Production Costs</h3>
                    
                    <div style={{
                      background: '#f0f9ff',
                      border: '2px solid #0369a1',
                      borderRadius: '8px',
                      padding: '20px',
                      marginBottom: '20px',
                      textAlign: 'center'
                    }}>
                      <p style={{ marginBottom: '15px', color: '#0369a1', fontSize: '1.1em' }}>
                        <strong>📊 View Production Costs in Detail</strong>
                      </p>
                      <button
                        className="planting-modal-btn planting-modal-save"
                        onClick={() => {
                          handleCloseDetailModal()
                          handleViewProductionCost(selectedPlant)
                        }}
                        style={{ fontSize: '1em', padding: '12px 24px' }}
                      >
                        💰 View Production Costing
                      </button>
                      <p style={{ marginTop: '15px', fontSize: '0.9em', color: '#64748b' }}>
                        Click here to see the detailed cost breakdown. <br />
                        Costs can be edited in the Production Costing page.
                      </p>
                    </div>

                    {/* Quick summary if data exists */}
                    {selectedPlant.totalProductionCost && (
                      <div className="costs-summary-card">
                        <h4>Quick Summary</h4>
                        <div className="costs-list">
                          <div className="cost-item total">
                            <span className="cost-label"><strong>Total Production Cost:</strong></span>
                            <span className="cost-value">
                              <strong>₱{selectedPlant.totalProductionCost.toLocaleString()}</strong>
                            </span>
                          </div>
                          <div className="cost-item">
                            <span className="cost-label">Cost per Unit:</span>
                            <span className="cost-value">₱{selectedPlant.costPerUnit?.toFixed(2) || 'N/A'}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Events Tab */}
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

        {/* Add Plot Modal */}
        {showAddPlotModal && (
          <div className="planting-modal-overlay" onClick={handleCloseAddPlotModal}>
            <div className="planting-modal planting-modal-large" onClick={(e) => e.stopPropagation()}>
              <div className="planting-modal-header">
                <h2 className="planting-modal-title">
                  {plotStep === 'input' && '📍 Select Plot, Sensor & Plant'}
                  {plotStep === 'scanning' && '🔍 Scanning Soil...'}
                  {plotStep === 'confirm' && '✅ Confirm Planting'}
                </h2>
                <button className="planting-modal-close" onClick={handleCloseAddPlotModal}>
                  ✕
                </button>
              </div>

              <div className="planting-modal-body">
                {plotStep === 'input' && (
                  <div className="plot-input-step">
                    {getAvailablePlots().length === 0 ? (
                      <div className="no-plots-available">
                        <p style={{ textAlign: 'center', padding: '2rem', color: '#d32f2f', fontSize: '1.1rem' }}>
                          ⚠️ All plots are currently occupied. Please harvest or remove existing plants before adding new ones.
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="planting-form-group">
                          <label>Select Plot Number</label>
                          <select
                            value={selectedPlotNumber}
                            onChange={(e) => handlePlotSelect(e.target.value)}
                            className="planting-form-select"
                          >
                            <option value="">Choose a plot...</option>
                            {getAvailablePlots().map(plot => (
                              <option key={plot.number} value={plot.number}>
                                Plot {plot.number} (Available)
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="planting-form-group">
                          <label>Plot Size (cm)</label>
                          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                            <div style={{ flex: 1 }}>
                              <label style={{ fontSize: '0.85em', color: '#666' }}>Length (cm)</label>
                              <input
                                type="number"
                                value={customPlotSize.length}
                                onChange={(e) => handlePlotSizeChange('length', e.target.value)}
                                className="planting-form-input"
                                placeholder="Length"
                                min="10"
                                max="500"
                              />
                            </div>
                            <span style={{ marginTop: '1.5rem', fontSize: '1.2em', color: '#666' }}>×</span>
                            <div style={{ flex: 1 }}>
                              <label style={{ fontSize: '0.85em', color: '#666' }}>Width (cm)</label>
                              <input
                                type="number"
                                value={customPlotSize.width}
                                onChange={(e) => handlePlotSizeChange('width', e.target.value)}
                                className="planting-form-input"
                                placeholder="Width"
                                min="10"
                                max="500"
                              />
                            </div>
                          </div>
                          <small style={{ display: 'block', marginTop: '0.5rem', color: '#666' }}>
                            Plot size: {getDisplaySize(customPlotSize.length, customPlotSize.width)} 
                            ({calculatePlotSize(customPlotSize.length, customPlotSize.width).toFixed(4)} m²)
                          </small>
                        </div>

                        <div className="planting-form-group">
                          <label>Assign Soil Sensor</label>
                          <select
                            value={selectedSoilSensor}
                            onChange={(e) => handleSensorSelect(e.target.value)}
                            className="planting-form-select"
                            disabled={loadingSensorStatus}
                          >
                            <option value="">Choose a sensor...</option>
                            {availableSensors.map(sensor => (
                              <option key={sensor.id} value={sensor.id}>
                                {sensor.name}
                              </option>
                            ))}
                          </select>
                          
                          {loadingSensorStatus && (
                            <div className="sensor-status-loading">
                              <span className="loading-spinner">🔄</span>
                              Checking sensor status...
                            </div>
                          )}
                          
                          {sensorStatus && (
                            <div className={`sensor-status ${sensorStatus.online ? 'online' : 'offline'}`}>
                              {sensorStatus.online ? (
                                <>
                                  <span className="status-icon">🟢</span>
                                  <span className="status-text">
                                    Sensor Online • Last reading: {sensorStatus.minutesAgo} min ago
                                  </span>
                                </>
                              ) : (
                                <>
                                  <span className="status-icon">🔴</span>
                                  <span className="status-text">
                                    Sensor Offline • {sensorStatus.reason}
                                  </span>
                                </>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="planting-form-group">
                          <label>
                            Select Plant Type
                            {rankedPlants.length > 0 && (
                              <span className="ranking-indicator"> (Ranked by Soil Compatibility)</span>
                            )}
                          </label>
                          
                          {rankedPlants.length > 0 ? (
                            <div className="ranked-plants-list">
                              {rankedPlants.map(({ key, plant, score, rating }) => (
                                <div
                                  key={key}
                                  className={`ranked-plant-item ${selectedPlantType === key ? 'selected' : ''}`}
                                  onClick={() => handlePlantTypeSelect(key)}
                                  style={{ 
                                    borderLeft: `4px solid ${rating.color}`,
                                    cursor: 'pointer'
                                  }}
                                >
                                  <div className="plant-item-header">
                                    <div className="plant-name">
                                      {getPlantEmoji(key)} {plant.name}
                                    </div>
                                    <div className="compatibility-badge" style={{ backgroundColor: rating.color }}>
                                      {score}%
                                    </div>
                                  </div>
                                  
                                  <div className="plant-item-details">
                                    <div className="stars">
                                      {'⭐'.repeat(rating.stars)}{'☆'.repeat(5 - rating.stars)}
                                    </div>
                                    <div className="rating-text" style={{ color: rating.color }}>
                                      {rating.text}
                                    </div>
                                  </div>
                                  
                                  <div className="plant-quick-info">
                                    <span>🕐 {plant.daysToHarvest} days</span>
                                    <span>💰 ₱{plant.pricing} {plant.pricingUnit}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <select
                              value={selectedPlantType}
                              onChange={(e) => handlePlantTypeSelect(e.target.value)}
                              className="planting-form-select"
                              disabled={!selectedSoilSensor || !sensorStatus?.online}
                            >
                              <option value="">
                                {!selectedSoilSensor 
                                  ? 'Select a sensor first...' 
                                  : !sensorStatus?.online
                                  ? 'Sensor is offline...'
                                  : 'Choose a plant...'}
                              </option>
                              {Object.keys(plantsList).map(key => (
                                <option key={key} value={key}>
                                  {plantsList[key].name}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>

                        {selectedPlantType && plantsList[selectedPlantType] && (
                          <div className="plant-info-display">
                            <h3>Plant Information</h3>
                            <div className="plant-info-grid">
                              <div className="plant-info-item">
                                <span className="info-label">Scientific Name:</span>
                                <span className="info-value">{plantsList[selectedPlantType].sName}</span>
                              </div>
                              <div className="plant-info-item">
                                <span className="info-label">Description:</span>
                                <span className="info-value">{plantsList[selectedPlantType].description}</span>
                              </div>
                              <div className="plant-info-item">
                                <span className="info-label">Days to Harvest:</span>
                                <span className="info-value">{plantsList[selectedPlantType].daysToHarvest} days</span>
                              </div>
                              <div className="plant-info-item">
                                <span className="info-label">Recommended Seedlings:</span>
                                <span className="info-value highlight">{recommendedSeedlings} seedlings</span>
                              </div>
                            </div>
                          </div>
                        )}

                        <button
                          className="planting-modal-btn planting-modal-save"
                          onClick={handleStartScan}
                          disabled={!selectedPlotNumber || !selectedSoilSensor || !selectedPlantType || loadingSensorStatus || customPlotSize.length < 10 || customPlotSize.width < 10}
                        >
                          {loadingSensorStatus ? 'Checking Sensor...' : 'Start Soil Scan'}
                        </button>
                      </>
                    )}
                  </div>
                )}

                {plotStep === 'scanning' && (
                  <div className="plot-scanning-step">
                    <div className="scanning-animation">
                      <div className="scanning-icon">🔍</div>
                      <p>Analyzing soil conditions from {selectedSoilSensor}...</p>
                    </div>
                    
                    <div className="progress-bar">
                      <div 
                        className="progress-bar-fill" 
                        style={{ width: `${scanProgress}%` }}
                      ></div>
                    </div>
                    <p className="progress-text">{scanProgress}%</p>

                    {sensorData && (
                      <div className="sensor-readings">
                        <h3>Current Soil Readings</h3>
                        <div className="readings-grid">
                          <div className="reading-item">
                            <span className="reading-label">pH Level:</span>
                            <span className="reading-value">{sensorData.ph?.toFixed(1) || 'N/A'}</span>
                          </div>
                          <div className="reading-item">
                            <span className="reading-label">Nitrogen:</span>
                            <span className="reading-value">{sensorData.nitrogen || 'N/A'} ppm</span>
                          </div>
                          <div className="reading-item">
                            <span className="reading-label">Phosphorus:</span>
                            <span className="reading-value">{sensorData.phosphorus || 'N/A'} ppm</span>
                          </div>
                          <div className="reading-item">
                            <span className="reading-label">Potassium:</span>
                            <span className="reading-value">{sensorData.potassium || 'N/A'} ppm</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {plotStep === 'confirm' && (
                  <div className="plot-confirm-step">
                    <div className="confirm-summary">
                      <h3>Planting Confirmation</h3>
                      
                      <div className="confirm-details">
                        <div className="confirm-item">
                          <span className="confirm-label">Plot Number:</span>
                          <span className="confirm-value">Plot {selectedPlotNumber}</span>
                        </div>

                        <div className="confirm-item">
                          <span className="confirm-label">Plot Size:</span>
                          <span className="confirm-value">
                            {getDisplaySize(customPlotSize.length, customPlotSize.width)} 
                            ({calculatePlotSize(customPlotSize.length, customPlotSize.width).toFixed(4)} m²)
                          </span>
                        </div>
                        
                        <div className="confirm-item">
                          <span className="confirm-label">Soil Sensor:</span>
                          <span className="confirm-value">{selectedSoilSensor}</span>
                        </div>

                        <div className="confirm-item">
                          <span className="confirm-label">Selected Plant:</span>
                          <span className="confirm-value">
                            {getPlantEmoji(selectedPlantType)} {plantsList[selectedPlantType]?.name}
                          </span>
                        </div>

                        <div className="confirm-item highlight">
                          <span className="confirm-label">Recommended Seedlings:</span>
                          <span className="confirm-value">{recommendedSeedlings} seedlings</span>
                        </div>
                      </div>
                    </div>

                    <div className="planting-modal-footer">
                      <button
                        className="planting-modal-btn planting-modal-cancel"
                        onClick={() => setPlotStep('input')}
                        disabled={isSubmitting}
                      >
                        Back
                      </button>
                      <button
                        className="planting-modal-btn planting-modal-save"
                        onClick={handleConfirmPlanting}
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? 'Adding Plant...' : 'Confirm & Add Plot'}
                      </button>
                    </div>
                  </div>
                )}
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
                      </div>
                    </div>
                  </div>
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

        {/* Harvest Modal */}
        {showHarvestModal && selectedPlant && (
          <div className="planting-modal-overlay" onClick={handleCloseHarvestModal}>
            <div className="harvest-modal planting-modal" onClick={(e) => e.stopPropagation()}>
              <div className="planting-modal-header">
                <h2 className="planting-modal-title">🌾 Harvest Plant</h2>
                <button className="planting-modal-close" onClick={handleCloseHarvestModal}>
                  ✕
                </button>
              </div>

              <div className="planting-modal-body">
                {/* Plant Summary */}
                <div className="harvest-summary-card">
                  <h3>{selectedPlant.plantName}</h3>
                  <div className="harvest-summary-grid">
                    <div className="harvest-summary-item">
                      <span className="summary-label">Plot:</span>
                      <span className="summary-value">Plot {selectedPlant.plotNumber}</span>
                    </div>
                    <div className="harvest-summary-item">
                      <span className="summary-label">Planted:</span>
                      <span className="summary-value">
                        {selectedPlant.plantedDate ? new Date(selectedPlant.plantedDate).toLocaleDateString() : 'N/A'}
                      </span>
                    </div>
                    <div className="harvest-summary-item">
                      <span className="summary-label">Expected Harvest:</span>
                      <span className="summary-value">
                        {selectedPlant.expectedHarvestDate ? new Date(selectedPlant.expectedHarvestDate).toLocaleDateString() : 'N/A'}
                      </span>
                    </div>
                    <div className="harvest-summary-item">
                      <span className="summary-label">Surviving Plants:</span>
                      <span className="summary-value">
                        {selectedPlant.survivingPlants ?? selectedPlant.recommendedSeedlings}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Harvest Form */}
                <div className="harvest-form">
                  <div className="planting-form-group">
                    <label>
                      Harvest Date <span style={{ color: '#d32f2f' }}>*</span>
                    </label>
                    <input
                      type="date"
                      name="harvestDate"
                      value={harvestData.harvestDate}
                      onChange={handleHarvestInputChange}
                      className="planting-form-input"
                      max={new Date().toISOString().split('T')[0]}
                    />
                  </div>

                  <div className="harvest-yield-group">
                    <div className="planting-form-group" style={{ flex: 2 }}>
                      <label>
                        Actual Yield <span style={{ color: '#d32f2f' }}>*</span>
                      </label>
                      <input
                        type="number"
                        name="actualYield"
                        value={harvestData.actualYield}
                        onChange={handleHarvestInputChange}
                        className="planting-form-input"
                        placeholder="Enter yield amount"
                        min="0"
                        step="0.1"
                      />
                    </div>

                    <div className="planting-form-group" style={{ flex: 1 }}>
                      <label>Unit</label>
                      <select
                        name="yieldUnit"
                        value={harvestData.yieldUnit}
                        onChange={handleHarvestInputChange}
                        className="planting-form-select"
                      >
                        <option value="kg">kg</option>
                        <option value="piece">piece</option>
                        <option value="bundle">bundle</option>
                        <option value="pack">pack</option>
                        <option value="dozen">dozen</option>
                      </select>
                    </div>
                  </div>

                  <div className="planting-form-group">
                    <label>Quality Grade</label>
                    <select
                      name="quality"
                      value={harvestData.quality}
                      onChange={handleHarvestInputChange}
                      className="planting-form-select"
                    >
                      <option value="A">Grade A - Premium</option>
                      <option value="B">Grade B - Good</option>
                      <option value="C">Grade C - Fair</option>
                      <option value="D">Grade D - Poor</option>
                    </select>
                  </div>

                  <div className="planting-form-group">
                    <label>Notes (Optional)</label>
                    <textarea
                      name="notes"
                      value={harvestData.notes}
                      onChange={handleHarvestInputChange}
                      className="planting-form-textarea"
                      placeholder="Add any notes about the harvest..."
                      rows="3"
                    />
                  </div>
                </div>

                {/* Revenue Preview */}
                {selectedPlant.currentSellingPrice && harvestData.actualYield && (
                  <div className="harvest-preview">
                    <h4>Revenue Preview</h4>
                    <div className="preview-grid">
                      <div className="preview-item">
                        <span className="preview-label">Yield:</span>
                        <span className="preview-value">
                          {harvestData.actualYield} {harvestData.yieldUnit}
                        </span>
                      </div>
                      <div className="preview-item">
                        <span className="preview-label">Price per unit:</span>
                        <span className="preview-value">
                          ₱{parseFloat(selectedPlant.currentSellingPrice).toLocaleString()}
                        </span>
                      </div>
                      <div className="preview-item highlight">
                        <span className="preview-label">Total Revenue:</span>
                        <span className="preview-value">
                          ₱{(parseFloat(harvestData.actualYield) * parseFloat(selectedPlant.currentSellingPrice)).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {!selectedPlant.currentSellingPrice && (
                  <div className="harvest-warning">
                    ⚠️ No selling price set. Revenue will not be calculated.
                  </div>
                )}
              </div>

              <div className="planting-modal-footer">
                <button
                  className="planting-modal-btn planting-modal-cancel"
                  onClick={handleCloseHarvestModal}
                >
                  Cancel
                </button>
                <button
                  className="planting-modal-btn planting-modal-save harvest-confirm-btn"
                  onClick={handleConfirmHarvest}
                  disabled={!harvestData.actualYield || parseFloat(harvestData.actualYield) <= 0}
                >
                  🌾 Confirm Harvest
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