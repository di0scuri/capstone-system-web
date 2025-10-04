import React, { useState, useEffect } from 'react'
import Sidebar from './sidebar'
import './planting.css'
import { collection, getDocs, doc, updateDoc, addDoc, serverTimestamp, query, where, orderBy } from 'firebase/firestore'
import { db, storage } from '../firebase'
import { ref, get } from 'firebase/database'

const Planting = ({ userType = 'admin' }) => {
  const [activeMenu, setActiveMenu] = useState('Planting')
  const [searchTerm, setSearchTerm] = useState('')
  const [showEditModal, setShowEditModal] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showDetailsModal, setShowDetailsModal] = useState(false)
  const [selectedPlant, setSelectedPlant] = useState(null)
  const [plants, setPlantsData] = useState([])
  const [plantImages, setPlantImages] = useState({})
  const [loading, setLoading] = useState(true)
  const [addLoading, setAddLoading] = useState(false)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [plantDetails, setPlantDetails] = useState(null)
  const [interventions, setInterventions] = useState([])
  const [sensorHistory, setSensorHistory] = useState([])
  const [editFormData, setEditFormData] = useState({
    locationZone: '',
    status: '',
    currentSellingPrice: '',
    unit: ''
  })
  const [addPlantData, setAddPlantData] = useState({
    name: '',
    type: '',
    initialSeedQuantity: '',
    areaOccupiedSqM: '',
    locationZone: 'Default Zone',
    status: 'Seeding',
    currentSellingPrice: '',
    unit: 'per kilo'
  })
  const [availableSeeds, setAvailableSeeds] = useState(null)

  const plantTypeOptions = ['Tomato', 'Lettuce', 'Cabbage', 'Pechay', 'Eggplant', 'Pepper', 'Cucumber']
  const locationZoneOptions = ['Closed Greenhouse', 'Nursery 1', 'Nursery 2']
  const statusOptions = ['Seeding', 'Seedling', 'Growing', 'Flowering', 'Fruiting', 'Harvesting', 'Completed']
  const unitOptions = ['per kilo', 'per piece', 'per bundle', 'per pack', 'per dozen']

  const fetchLatestSensorReading = async () => {
    try {
      const sensorRef = ref(storage, 'SoilSensor')
      const snapshot = await get(sensorRef)
      
      if (snapshot.exists()) {
        const data = snapshot.val()
        const timestamps = Object.keys(data).sort().reverse()
        if (timestamps.length > 0) {
          return {
            timestamp: timestamps[0],
            ...data[timestamps[0]]
          }
        }
      }
      return null
    } catch (error) {
      console.error('Error fetching sensor reading:', error)
      return null
    }
  }

  const fetchSensorHistory = async () => {
    try {
      const sensorRef = ref(storage, 'SoilSensor')
      const snapshot = await get(sensorRef)
      
      if (snapshot.exists()) {
        const data = snapshot.val()
        const readings = Object.keys(data)
          .sort()
          .reverse()
          .slice(0, 10)
          .map(timestamp => ({
            timestamp,
            ...data[timestamp]
          }))
        return readings
      }
      return []
    } catch (error) {
      console.error('Error fetching sensor history:', error)
      return []
    }
  }

  const fetchPlantImages = async () => {
    try {
      const imagesRef = ref(storage, 'plantImages')
      const snapshot = await get(imagesRef)
      
      if (snapshot.exists()) {
        setPlantImages(snapshot.val())
      }
    } catch (error) {
      console.error('Error fetching plant images from RTDB:', error)
    }
  }

  const fetchPlants = async () => {
    setLoading(true)
    try {
      const querySnapshot = await getDocs(collection(db, 'plants'))
      const plantsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        datePlanted: doc.data().datePlanted?.toDate ? doc.data().datePlanted.toDate() : new Date()
      }))
      
      setPlantsData(plantsData)
      console.log(`Loaded ${plantsData.length} plants from Firestore`)
    } catch (error) {
      console.error('Error fetching plants:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const loadData = async () => {
      await Promise.all([fetchPlantImages(), fetchPlants()])
    }
    loadData()
  }, [])

  const filteredPlants = plants.filter(plant =>
    plant.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    plant.type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    plant.status?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const generatePlantLifecycleFromAI = async (plantData) => {
    try {
      console.log('🤖 Calling AI lifecycle API...')
      const response = await fetch('http://localhost:5000/api/analytics/generate-plant-lifecycle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plantType: plantData.type,
          plantName: plantData.name,
          datePlanted: new Date().toISOString(),
          initialQuantity: plantData.initialSeedQuantity,
          areaOccupied: plantData.areaOccupiedSqM,
          locationZone: plantData.locationZone
        })
      })

      const result = await response.json()
      console.log('📥 AI API Response:', result)
      
      if (result.success) {
        console.log('✅ AI Lifecycle generated successfully')
        console.log('📊 Events count:', result.events?.length)
        console.log('📊 OptimalNPK stages:', Object.keys(result.optimalNPK || {}))
        console.log('📊 Estimated harvest days:', result.estimatedHarvestDays)
        return result
      } else {
        console.error('❌ AI generation failed:', result.error)
        return null
      }
    } catch (error) {
      console.error('❌ Error calling AI lifecycle API:', error)
      return null
    }
  }

  const createPlantEventsFromAI = async (plantId, aiLifecyclePlan) => {
    if (!aiLifecyclePlan || !aiLifecyclePlan.events) {
      console.warn('⚠️ No events to create')
      return
    }

    try {
      console.log(`📅 Creating ${aiLifecyclePlan.events.length} events for plant ${plantId}...`)
      const events = aiLifecyclePlan.events.map(event => ({
        plantId,
        message: event.message,
        status: event.status || 'info',
        type: event.type,
        timestamp: new Date(event.timestamp),
        createdAt: serverTimestamp()
      }))

      for (const event of events) {
        await addDoc(collection(db, 'events'), event)
      }
      
      console.log(`✅ Created ${events.length} AI-generated events`)
    } catch (error) {
      console.error('❌ Error creating AI events:', error)
    }
  }

  const saveAIOptimalValues = async (plantId, aiLifecyclePlan) => {
    if (!aiLifecyclePlan || !aiLifecyclePlan.optimalNPK) {
      console.warn('⚠️ No optimal NPK data to save')
      return
    }

    try {
      console.log('💾 Saving AI optimal values to Firestore...')
      console.log('Stages:', Object.keys(aiLifecyclePlan.optimalNPK))
      
      await updateDoc(doc(db, 'plants', plantId), {
        optimalNPK: aiLifecyclePlan.optimalNPK,
        estimatedHarvestDays: aiLifecyclePlan.estimatedHarvestDays,
        aiRecommendations: aiLifecyclePlan.recommendations,
        aiGenerated: true
      })
      
      console.log('✅ AI optimal values saved successfully')
    } catch (error) {
      console.error('❌ Error saving AI optimal NPK:', error)
    }
  }

  const createDefaultPlantEvents = async (plantId, plantName, plantType, datePlanted) => {
    try {
      console.log('📅 Creating default plant event...')
      const plantDate = new Date(datePlanted)
      const events = [
        {
          plantId,
          message: `${plantName} planted - ${plantType}`,
          status: 'info',
          type: 'LIFECYCLE_STAGE',
          timestamp: plantDate,
          createdAt: serverTimestamp()
        }
      ]

      for (const event of events) {
        await addDoc(collection(db, 'events'), event)
      }
      console.log('✅ Default event created')
    } catch (error) {
      console.error('❌ Error creating default plant events:', error)
    }
  }

  const saveDefaultOptimalNPKValues = async (plantId) => {
    try {
      console.log('💾 Saving default optimal NPK values...')
      const optimalNPK = {
        Seeding: { N: 10, P: 15, K: 1200, Conductivity: 30, Moisture: 22, Temperature: 24, pH: 6.3 },
        Seedling: { N: 12, P: 16, K: 1300, Conductivity: 32, Moisture: 20, Temperature: 25, pH: 6.4 },
        Growing: { N: 15, P: 18, K: 1500, Conductivity: 35, Moisture: 18, Temperature: 25, pH: 6.5 },
        Flowering: { N: 13, P: 20, K: 1600, Conductivity: 38, Moisture: 18, Temperature: 26, pH: 6.5 },
        Fruiting: { N: 14, P: 22, K: 1800, Conductivity: 40, Moisture: 20, Temperature: 26, pH: 6.6 },
        Harvesting: { N: 12, P: 18, K: 1500, Conductivity: 35, Moisture: 18, Temperature: 25, pH: 6.5 }
      }

      await updateDoc(doc(db, 'plants', plantId), {
        optimalNPK,
        aiGenerated: false
      })
      console.log('✅ Default optimal NPK saved')
    } catch (error) {
      console.error('❌ Error saving default optimal NPK:', error)
    }
  }

  const handleAddPlant = () => {
    setShowAddModal(true)
    setAvailableSeeds(null)
    setAddPlantData({
      name: '',
      type: '',
      initialSeedQuantity: '',
      areaOccupiedSqM: '',
      locationZone: 'Default Zone',
      status: 'Seeding',
      currentSellingPrice: '',
      unit: 'per kilo'
    })
  }

  const handleCloseAddModal = () => {
    setShowAddModal(false)
  }

  const handleAddPlantInputChange = async (field, value) => {
    setAddPlantData(prev => ({
      ...prev,
      [field]: value
    }))

    if (field === 'type' && value) {
      const seeds = await fetchAvailableSeeds(value)
      setAvailableSeeds(seeds)
    }
  }

  const fetchAvailableSeeds = async (plantType) => {
    try {
      const inventoryQuery = query(
        collection(db, 'inventory'),
        where('category', '==', 'seed'),
        where('name', '==', plantType)
      )
      const snapshot = await getDocs(inventoryQuery)
      
      if (!snapshot.empty) {
        const seedDoc = snapshot.docs[0]
        return {
          id: seedDoc.id,
          ...seedDoc.data()
        }
      }
      return null
    } catch (error) {
      console.error('Error fetching seeds:', error)
      return null
    }
  }

  const deductSeedsFromInventory = async (plantType, quantity) => {
    try {
      const seedData = await fetchAvailableSeeds(plantType)
      
      if (!seedData) {
        throw new Error(`No ${plantType} seeds found in inventory`)
      }
      
      if (seedData.stock < quantity) {
        throw new Error(`Insufficient seeds. Available: ${seedData.stock}, Requested: ${quantity}`)
      }
      
      const seedRef = doc(db, 'inventory', seedData.id)
      await updateDoc(seedRef, {
        stock: seedData.stock - quantity,
        lastUpdated: serverTimestamp()
      })
      
      return true
    } catch (error) {
      console.error('Error deducting seeds:', error)
      throw error
    }
  }

  const handleCreatePlant = async () => {
    if (!addPlantData.name || !addPlantData.type || !addPlantData.initialSeedQuantity) {
      alert('Please fill in all required fields')
      return
    }

    setAddLoading(true)
    console.log('🌱 Starting plant creation process...')
    
    try {
      const requestedQuantity = parseInt(addPlantData.initialSeedQuantity)

      // Deduct seeds from inventory
      try {
        await deductSeedsFromInventory(addPlantData.type, requestedQuantity)
        console.log('✅ Seeds deducted from inventory')
      } catch (inventoryError) {
        alert(inventoryError.message)
        setAddLoading(false)
        return
      }

      // Create plant document
      const plantData = {
        name: addPlantData.name,
        type: addPlantData.type,
        initialSeedQuantity: requestedQuantity,
        currentCount: requestedQuantity,
        areaOccupiedSqM: parseFloat(addPlantData.areaOccupiedSqM) || 0,
        locationZone: addPlantData.locationZone,
        status: addPlantData.status,
        currentSellingPrice: parseFloat(addPlantData.currentSellingPrice) || 0,
        unit: addPlantData.unit,
        datePlanted: serverTimestamp(),
        createdAt: serverTimestamp()
      }

      const docRef = await addDoc(collection(db, 'plants'), plantData)
      console.log('✅ Plant document created with ID:', docRef.id)
      
      // Generate AI lifecycle
      const aiLifecycle = await generatePlantLifecycleFromAI(plantData)
      
      if (aiLifecycle && aiLifecycle.events && aiLifecycle.optimalNPK) {
        console.log('🤖 Saving AI-generated data...')
        console.log('Events:', aiLifecycle.events.length)
        console.log('OptimalNPK stages:', Object.keys(aiLifecycle.optimalNPK))
        
        await Promise.all([
          createPlantEventsFromAI(docRef.id, aiLifecycle),
          saveAIOptimalValues(docRef.id, aiLifecycle)
        ])
        
        console.log('✅ AI data saved successfully')
      } else {
        console.log('⚠️ AI generation failed, using defaults')
        await Promise.all([
          createDefaultPlantEvents(docRef.id, plantData.name, plantData.type, new Date()),
          saveDefaultOptimalNPKValues(docRef.id)
        ])
      }

      // Update local state
      setPlantsData(prev => [...prev, {
        id: docRef.id,
        ...plantData,
        datePlanted: new Date(),
        aiGenerated: aiLifecycle ? true : false
      }])

      handleCloseAddModal()
      await fetchPlants() // Refresh to get updated data
      alert(`Plant added successfully! ${aiLifecycle ? '(AI Optimized)' : ''}`)
    } catch (error) {
      console.error('❌ Error adding plant:', error)
      alert('Failed to add plant. Please try again.')
    } finally {
      setAddLoading(false)
    }
  }

  const handleEdit = (plant) => {
    setSelectedPlant(plant)
    setEditFormData({
      locationZone: plant.locationZone || '',
      status: plant.status || '',
      currentSellingPrice: plant.currentSellingPrice || '',
      unit: plant.unit || ''
    })
    setShowEditModal(true)
  }

  const handleCloseModal = () => {
    setShowEditModal(false)
    setSelectedPlant(null)
  }

  const handleInputChange = (field, value) => {
    setEditFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleSave = async () => {
    try {
      const plantRef = doc(db, 'plants', selectedPlant.id)
      const updateData = {
        locationZone: editFormData.locationZone,
        status: editFormData.status,
        currentSellingPrice: parseFloat(editFormData.currentSellingPrice) || 0,
        unit: editFormData.unit,
        lastUpdated: serverTimestamp()
      }

      await updateDoc(plantRef, updateData)

      setPlantsData(prev => prev.map(plant => 
        plant.id === selectedPlant.id 
          ? { ...plant, ...updateData }
          : plant
      ))
      
      handleCloseModal()
    } catch (error) {
      console.error('Error updating plant:', error)
      alert('Failed to update plant. Please try again.')
    }
  }

  const fetchUpcomingEvents = async (plantId) => {
    try {
      const eventsQuery = query(
        collection(db, 'events'),
        where('plantId', '==', plantId),
        orderBy('timestamp', 'asc')
      )
      
      const snapshot = await getDocs(eventsQuery)
      const events = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate ? doc.data().timestamp.toDate() : new Date()
      }))
      
      console.log(`Found ${events.length} events for plant ${plantId}`)
      return events
    } catch (error) {
      console.error('Error fetching events:', error)
      return []
    }
  }

  const fetchInterventions = async (currentReading, optimalValues) => {
    try {
      const inventoryQuery = query(collection(db, 'inventory'))
      const snapshot = await getDocs(inventoryQuery)
      
      const suggestions = []
      const inventory = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))

      if (currentReading.Nitrogen < optimalValues.N) {
        const nitrogenFertilizers = inventory.filter(item => 
          item.category === 'fertilizers' && 
          (item.name.toLowerCase().includes('nitrogen') || 
           item.name.toLowerCase().includes('compost'))
        )
        if (nitrogenFertilizers.length > 0) {
          suggestions.push({
            issue: 'Low Nitrogen (N)',
            current: currentReading.Nitrogen,
            optimal: optimalValues.N,
            intervention: nitrogenFertilizers[0]
          })
        }
      }

      if (currentReading.Phosphorus < optimalValues.P) {
        const phosphorusFertilizers = inventory.filter(item => 
          item.category === 'fertilizers' && 
          item.name.toLowerCase().includes('phosphorus')
        )
        if (phosphorusFertilizers.length > 0) {
          suggestions.push({
            issue: 'Low Phosphorus (P)',
            current: currentReading.Phosphorus,
            optimal: optimalValues.P,
            intervention: phosphorusFertilizers[0]
          })
        }
      }

      if (currentReading.Potassium < optimalValues.K) {
        const potassiumFertilizers = inventory.filter(item => 
          item.category === 'fertilizers' && 
          item.name.toLowerCase().includes('potassium')
        )
        if (potassiumFertilizers.length > 0) {
          suggestions.push({
            issue: 'Low Potassium (K)',
            current: currentReading.Potassium,
            optimal: optimalValues.K,
            intervention: potassiumFertilizers[0]
          })
        }
      }

      return suggestions
    } catch (error) {
      console.error('Error fetching interventions:', error)
      return []
    }
  }

  const handlePlantClick = async (plant) => {
    console.log('Opening plant details for:', plant.name)
    console.log('AI Generated:', plant.aiGenerated)
    console.log('Has optimalNPK:', !!plant.optimalNPK)
    
    setSelectedPlant(plant)
    setShowDetailsModal(true)
    setDetailsLoading(true)
    setPlantDetails(null)
    setInterventions([])
    setSensorHistory([])

    try {
      const [sensorReading, events, history] = await Promise.all([
        fetchLatestSensorReading(),
        fetchUpcomingEvents(plant.id),
        fetchSensorHistory()
      ])

      const optimalValues = plant.optimalNPK?.[plant.status] || {
        N: 15, P: 18, K: 1500, Conductivity: 35, Moisture: 20, Temperature: 25, pH: 6.5
      }

      let interventionSuggestions = []
      if (sensorReading) {
        interventionSuggestions = await fetchInterventions(sensorReading, optimalValues)
      }

      const daysUntilHarvest = plant.estimatedHarvestDays || 60
      const estimatedHarvest = new Date(plant.datePlanted.getTime() + daysUntilHarvest * 24 * 60 * 60 * 1000)
      const projectedRevenue = (plant.currentCount || plant.initialSeedQuantity) * 0.5 * plant.currentSellingPrice

      setPlantDetails({
        sensorReading,
        events,
        optimalValues,
        estimatedHarvest,
        projectedRevenue,
        aiGenerated: plant.aiGenerated || false,
        aiRecommendations: plant.aiRecommendations || null
      })
      setInterventions(interventionSuggestions)
      setSensorHistory(history)
    } catch (error) {
      console.error('Error loading plant details:', error)
    } finally {
      setDetailsLoading(false)
    }
  }

  const handleCloseDetailsModal = () => {
    setShowDetailsModal(false)
    setSelectedPlant(null)
    setPlantDetails(null)
    setInterventions([])
    setSensorHistory([])
  }

  const handleUpdatePlantCount = async (newCount) => {
    if (!selectedPlant) return

    try {
      const plantRef = doc(db, 'plants', selectedPlant.id)
      await updateDoc(plantRef, {
        currentCount: parseInt(newCount),
        lastUpdated: serverTimestamp()
      })

      setPlantsData(prev => prev.map(plant => 
        plant.id === selectedPlant.id 
          ? { ...plant, currentCount: parseInt(newCount) }
          : plant
      ))

      setSelectedPlant(prev => ({ ...prev, currentCount: parseInt(newCount) }))

      const projectedRevenue = parseInt(newCount) * 0.5 * selectedPlant.currentSellingPrice
      setPlantDetails(prev => ({
        ...prev,
        projectedRevenue
      }))

      alert('Plant count updated successfully!')
    } catch (error) {
      console.error('Error updating plant count:', error)
      alert('Failed to update plant count')
    }
  }

  const getPlantImage = (plant) => {
    if (plantImages[plant.id]) return plantImages[plant.id]
    if (plant.type && plantImages[plant.type]) return plantImages[plant.type]
    if (plant.name && plantImages[plant.name]) return plantImages[plant.name]
    if (plant.imageUrl && plant.imageUrl.startsWith('http')) return plant.imageUrl
    
    const fallbackImages = {
      'Tomato': 'https://images.unsplash.com/photo-1592841200221-a6898f307baa?w=300&h=200&fit=crop',
      'Lettuce': 'https://images.unsplash.com/photo-1622206151226-18ca2c9ab4a1?w=300&h=200&fit=crop',
      'Cabbage': 'https://images.unsplash.com/photo-1594282486558-4d2d2f2b8df5?w=300&h=200&fit=crop',
      'Pechay': 'https://images.unsplash.com/photo-1576045057995-568f588f82fb?w=300&h=200&fit=crop',
      'Eggplant': 'https://images.unsplash.com/photo-1659261200833-ec636e8131e9?w=300&h=200&fit=crop',
      'Pepper': 'https://images.unsplash.com/photo-1563565375-f3fdfdbefa83?w=300&h=200&fit=crop',
      'Cucumber': 'https://images.unsplash.com/photo-1568584711271-15b3c4e8b6b8?w=300&h=200&fit=crop'
    }
    
    return fallbackImages[plant.type] || 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=300&h=200&fit=crop'
  }

  const getEditColor = (status) => {
    const colorMap = {
      'Seeding': '#FF6B6B',
      'Seedling': '#4ECDC4',
      'Growing': '#45B7D1',
      'Flowering': '#96CEB4',
      'Fruiting': '#FECA57',
      'Harvesting': '#48CAE4',
      'Completed': '#6C5CE7'
    }
    return colorMap[status] || '#95A5A6'
  }

  const formatDate = (date) => {
    if (!date) return 'Unknown'
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit'
    })
  }

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'Unknown'
    const date = new Date(timestamp)
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  return (
    <div className="dashboard-container">
      <Sidebar 
        activeMenu={activeMenu}
        setActiveMenu={setActiveMenu}
        userType={userType}
      />

      <div className="planting-main">
        <div className="planting-header">
          <h1 className="planting-title">Hello, Admin!</h1>
          <div className="planting-header-actions">
            <div className="planting-search-box">
              <input
                type="text"
                placeholder="Search plants..."
                className="planting-search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <span className="planting-search-icon">🔍</span>
            </div>
            <div className="planting-bell">🔔</div>
          </div>
        </div>

        <div className="planting-body">
          <h2 className="planting-section-title">Your plants</h2>
          
          {loading ? (
            <div className="planting-loading">
              <div className="loading-spinner">Loading plants...</div>
            </div>
          ) : (
            <div className="planting-cards-container">
              {filteredPlants.length === 0 ? (
                <div className="planting-no-plants">
                  <p>No plants found. {searchTerm && `No results for "${searchTerm}"`}</p>
                </div>
              ) : (
                filteredPlants.map((plant) => (
                  <div 
                    key={plant.id} 
                    className="planting-card"
                    onClick={() => handlePlantClick(plant)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="planting-card-image">
                      <img 
                        src={getPlantImage(plant)} 
                        alt={plant.name || plant.type}
                        onError={(e) => {
                          e.target.src = 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=300&h=200&fit=crop'
                        }}
                      />
                      {plant.aiGenerated && (
                        <div style={{
                          position: 'absolute',
                          top: '8px',
                          right: '8px',
                          backgroundColor: '#4CAF50',
                          color: 'white',
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 'bold'
                        }}>
                          AI OPTIMIZED
                        </div>
                      )}
                    </div>
                    
                    <div className="planting-card-content">
                      <h3 className="planting-card-name">
                        {plant.name || `${plant.type} - ${formatDate(plant.datePlanted)}`}
                      </h3>
                      
                      <div className="planting-card-details">
                        <div className="planting-detail-row">
                          <span className="planting-detail-label">Area planted:</span>
                          <span className="planting-detail-value">
                            {plant.areaOccupiedSqM || 0} sqm
                          </span>
                        </div>
                        
                        <div className="planting-detail-row">
                          <span className="planting-detail-label">Status:</span>
                          <span className="planting-detail-value">{plant.status || 'Unknown'}</span>
                        </div>
                        
                        <div className="planting-detail-row">
                          <span className="planting-detail-label">Location:</span>
                          <span className="planting-detail-value">
                            {plant.locationZone || 'Not assigned'}
                          </span>
                        </div>
                        
                        <div className="planting-detail-row">
                          <span className="planting-detail-label">Date planted:</span>
                          <span className="planting-detail-value">
                            {formatDate(plant.datePlanted)}
                          </span>
                        </div>
                        
                        <div className="planting-detail-row">
                          <span className="planting-detail-label">Current count:</span>
                          <span className="planting-detail-value">
                            {plant.currentCount || plant.initialSeedQuantity || 0}
                          </span>
                        </div>

                        {plant.currentSellingPrice > 0 && (
                          <div className="planting-detail-row">
                            <span className="planting-detail-label">Selling Price:</span>
                            <span className="planting-detail-value">
                              ₱{plant.currentSellingPrice} {plant.unit || ''}
                            </span>
                          </div>
                        )}
                      </div>
                      
                      <button 
                        className="planting-edit-btn"
                        style={{ backgroundColor: getEditColor(plant.status) }}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleEdit(plant)
                        }}
                      >
                        EDIT
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <button 
          className="planting-fab"
          onClick={handleAddPlant}
          title="Add New Plant"
        >
          +
        </button>

        {/* Add Plant Modal */}
        {showAddModal && (
          <div className="planting-modal-overlay" onClick={handleCloseAddModal}>
            <div className="planting-modal planting-modal-large" onClick={(e) => e.stopPropagation()}>
              <div className="planting-modal-header">
                <h2 className="planting-modal-title">Add New Plant</h2>
                <button className="planting-modal-close" onClick={handleCloseAddModal}>✕</button>
              </div>
              
              <div className="planting-modal-body">
                <div className="planting-form-group">
                  <label className="planting-form-label">Plant Name *</label>
                  <input 
                    type="text"
                    className="planting-form-input"
                    value={addPlantData.name}
                    onChange={(e) => handleAddPlantInputChange('name', e.target.value)}
                    placeholder="Enter plant name"
                  />
                </div>

                <div className="planting-form-group">
                  <label className="planting-form-label">Plant Type *</label>
                  <select 
                    className="planting-form-select"
                    value={addPlantData.type}
                    onChange={(e) => handleAddPlantInputChange('type', e.target.value)}
                  >
                    <option value="">Select Type</option>
                    {plantTypeOptions.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>

                <div className="planting-form-group">
                  <label className="planting-form-label">Initial Seed Quantity *</label>
                  <input 
                    type="number"
                    className="planting-form-input"
                    value={addPlantData.initialSeedQuantity}
                    onChange={(e) => handleAddPlantInputChange('initialSeedQuantity', e.target.value)}
                    placeholder="Enter quantity"
                    min="1"
                  />
                </div>

                <div className="planting-form-group">
                  <label className="planting-form-label">Area Occupied (sqm)</label>
                  <input 
                    type="number"
                    className="planting-form-input"
                    value={addPlantData.areaOccupiedSqM}
                    onChange={(e) => handleAddPlantInputChange('areaOccupiedSqM', e.target.value)}
                    placeholder="Enter area"
                    min="0"
                    step="0.1"
                  />
                </div>

                <div className="planting-form-group">
                  <label className="planting-form-label">Location Zone</label>
                  <select 
                    className="planting-form-select"
                    value={addPlantData.locationZone}
                    onChange={(e) => handleAddPlantInputChange('locationZone', e.target.value)}
                  >
                    {locationZoneOptions.map(zone => (
                      <option key={zone} value={zone}>{zone}</option>
                    ))}
                  </select>
                </div>

                <div className="planting-form-group">
                  <label className="planting-form-label">Current Selling Price</label>
                  <input 
                    type="number"
                    className="planting-form-input"
                    value={addPlantData.currentSellingPrice}
                    onChange={(e) => handleAddPlantInputChange('currentSellingPrice', e.target.value)}
                    placeholder="Enter price"
                    min="0"
                    step="0.01"
                  />
                </div>

                <div className="planting-form-group">
                  <label className="planting-form-label">Unit</label>
                  <select 
                    className="planting-form-select"
                    value={addPlantData.unit}
                    onChange={(e) => handleAddPlantInputChange('unit', e.target.value)}
                  >
                    {unitOptions.map(unit => (
                      <option key={unit} value={unit}>{unit}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="planting-modal-footer">
                <button 
                  className="planting-modal-btn planting-modal-cancel"
                  onClick={handleCloseAddModal}
                  disabled={addLoading}
                >
                  Cancel
                </button>
                <button 
                  className="planting-modal-btn planting-modal-save"
                  onClick={handleCreatePlant}
                  disabled={addLoading}
                >
                  {addLoading ? 'Creating with AI...' : 'Create Plant'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Modal */}
        {showEditModal && selectedPlant && (
          <div className="planting-modal-overlay" onClick={handleCloseModal}>
            <div className="planting-modal" onClick={(e) => e.stopPropagation()}>
              <div className="planting-modal-header">
                <h2 className="planting-modal-title">
                  {selectedPlant.name || selectedPlant.type}
                </h2>
                <button className="planting-modal-close" onClick={handleCloseModal}>✕</button>
              </div>
              
              <div className="planting-modal-body">
                <div className="planting-form-group">
                  <label className="planting-form-label">Location Zone</label>
                  <select 
                    className="planting-form-select"
                    value={editFormData.locationZone}
                    onChange={(e) => handleInputChange('locationZone', e.target.value)}
                  >
                    <option value="">Select Location</option>
                    {locationZoneOptions.map(zone => (
                      <option key={zone} value={zone}>{zone}</option>
                    ))}
                  </select>
                </div>

                <div className="planting-form-group">
                  <label className="planting-form-label">Status</label>
                  <select 
                    className="planting-form-select"
                    value={editFormData.status}
                    onChange={(e) => handleInputChange('status', e.target.value)}
                  >
                    <option value="">Select Status</option>
                    {statusOptions.map(status => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </div>

                <div className="planting-form-group">
                  <label className="planting-form-label">Current Selling Price</label>
                  <input 
                    type="number"
                    className="planting-form-input"
                    value={editFormData.currentSellingPrice}
                    onChange={(e) => handleInputChange('currentSellingPrice', e.target.value)}
                    placeholder="Enter price"
                    min="0"
                    step="0.01"
                  />
                </div>

                <div className="planting-form-group">
                  <label className="planting-form-label">Unit</label>
                  <select 
                    className="planting-form-select"
                    value={editFormData.unit}
                    onChange={(e) => handleInputChange('unit', e.target.value)}
                  >
                    <option value="">Select Unit</option>
                    {unitOptions.map(unit => (
                      <option key={unit} value={unit}>{unit}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="planting-modal-footer">
                <button 
                  className="planting-modal-btn planting-modal-cancel"
                  onClick={handleCloseModal}
                >
                  Cancel
                </button>
                <button 
                  className="planting-modal-btn planting-modal-save"
                  onClick={handleSave}
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Plant Details Modal */}
        {showDetailsModal && selectedPlant && (
          <div className="planting-modal-overlay" onClick={handleCloseDetailsModal}>
            <div className="planting-modal planting-modal-large" onClick={(e) => e.stopPropagation()}>
              <div className="planting-modal-header">
                <h2 className="planting-modal-title">
                  {selectedPlant.name || selectedPlant.type} - Details
                  {plantDetails?.aiGenerated && (
                    <span style={{
                      marginLeft: '12px',
                      backgroundColor: '#4CAF50',
                      color: 'white',
                      padding: '4px 12px',
                      borderRadius: '12px',
                      fontSize: '12px',
                      fontWeight: 'normal'
                    }}>
                      AI Optimized
                    </span>
                  )}
                </h2>
                <button className="planting-modal-close" onClick={handleCloseDetailsModal}>✕</button>
              </div>
              
              <div className="planting-modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                {detailsLoading ? (
                  <div style={{ textAlign: 'center', padding: '40px' }}>
                    Loading details...
                  </div>
                ) : (
                  <>
                    {/* Plant Info */}
                    <div className="details-section">
                      <h3 className="details-section-title">Plant Information</h3>
                      <div className="details-grid">
                        <div className="details-item">
                          <span className="details-label">Stage:</span>
                          <span className="details-value" style={{ 
                            backgroundColor: getEditColor(selectedPlant.status),
                            color: 'white',
                            padding: '4px 12px',
                            borderRadius: '12px',
                            fontSize: '14px'
                          }}>
                            {selectedPlant.status}
                          </span>
                        </div>
                        <div className="details-item">
                          <span className="details-label">Date Planted:</span>
                          <span className="details-value">{formatDate(selectedPlant.datePlanted)}</span>
                        </div>
                        <div className="details-item">
                          <span className="details-label">Current Count:</span>
                          <span className="details-value">
                            <input 
                              type="number"
                              value={selectedPlant.currentCount || selectedPlant.initialSeedQuantity}
                              onChange={(e) => handleUpdatePlantCount(e.target.value)}
                              style={{
                                width: '80px',
                                padding: '4px 8px',
                                border: '1px solid #ddd',
                                borderRadius: '4px'
                              }}
                              min="0"
                            />
                            <small style={{ marginLeft: '8px', color: '#666' }}>
                              (Initial: {selectedPlant.initialSeedQuantity})
                            </small>
                          </span>
                        </div>
                        {plantDetails && (
                          <>
                            <div className="details-item">
                              <span className="details-label">Estimated Harvest:</span>
                              <span className="details-value">{formatDate(plantDetails.estimatedHarvest)}</span>
                            </div>
                            <div className="details-item">
                              <span className="details-label">Projected Revenue:</span>
                              <span className="details-value" style={{ 
                                color: '#4CAF50',
                                fontWeight: 'bold',
                                fontSize: '16px'
                              }}>
                                ₱{plantDetails.projectedRevenue.toFixed(2)}
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* AI Recommendations */}
                    {plantDetails?.aiRecommendations && (
                      <div className="details-section">
                        <h3 className="details-section-title" style={{ color: '#4CAF50' }}>
                          AI Care Recommendations
                        </h3>
                        <div style={{
                          backgroundColor: '#f0f9ff',
                          padding: '16px',
                          borderRadius: '8px',
                          border: '1px solid #4CAF50'
                        }}>
                          <p style={{ margin: 0, lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                            {plantDetails.aiRecommendations}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Latest Sensor Reading */}
                    {plantDetails?.sensorReading && (
                      <div className="details-section">
                        <h3 className="details-section-title">Latest Sensor Reading</h3>
                        <small style={{ color: '#666', marginBottom: '12px', display: 'block' }}>
                          {plantDetails.sensorReading.timestamp}
                        </small>
                        <div className="sensor-readings-grid">
                          <div className="sensor-reading-card">
                            <div className="sensor-label">Conductivity</div>
                            <div className="sensor-value">{plantDetails.sensorReading.Conductivity || 'N/A'}</div>
                            <div className="sensor-optimal">Optimal: {plantDetails.optimalValues.Conductivity}</div>
                          </div>
                          <div className="sensor-reading-card">
                            <div className="sensor-label">Nitrogen (N)</div>
                            <div className="sensor-value">{plantDetails.sensorReading.Nitrogen || 'N/A'}</div>
                            <div className="sensor-optimal">Optimal: {plantDetails.optimalValues.N}</div>
                          </div>
                          <div className="sensor-reading-card">
                            <div className="sensor-label">Phosphorus (P)</div>
                            <div className="sensor-value">{plantDetails.sensorReading.Phosphorus || 'N/A'}</div>
                            <div className="sensor-optimal">Optimal: {plantDetails.optimalValues.P}</div>
                          </div>
                          <div className="sensor-reading-card">
                            <div className="sensor-label">Potassium (K)</div>
                            <div className="sensor-value">{plantDetails.sensorReading.Potassium || 'N/A'}</div>
                            <div className="sensor-optimal">Optimal: {plantDetails.optimalValues.K}</div>
                          </div>
                          <div className="sensor-reading-card">
                            <div className="sensor-label">Moisture</div>
                            <div className="sensor-value">{plantDetails.sensorReading.Moisture || 'N/A'}%</div>
                            <div className="sensor-optimal">Optimal: {plantDetails.optimalValues.Moisture}%</div>
                          </div>
                          <div className="sensor-reading-card">
                            <div className="sensor-label">Temperature</div>
                            <div className="sensor-value">{plantDetails.sensorReading.Temperature || 'N/A'}°C</div>
                            <div className="sensor-optimal">Optimal: {plantDetails.optimalValues.Temperature}°C</div>
                          </div>
                          <div className="sensor-reading-card">
                            <div className="sensor-label">pH</div>
                            <div className="sensor-value">{plantDetails.sensorReading.pH || 'N/A'}</div>
                            <div className="sensor-optimal">Optimal: {plantDetails.optimalValues.pH}</div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Interventions */}
                    {interventions.length > 0 && (
                      <div className="details-section">
                        <h3 className="details-section-title" style={{ color: '#FF6B6B' }}>
                          Recommended Interventions
                        </h3>
                        <div className="interventions-list">
                          {interventions.map((intervention, index) => (
                            <div key={index} className="intervention-card">
                              <div className="intervention-issue">
                                <strong>{intervention.issue}</strong>
                                <span style={{ color: '#FF6B6B', marginLeft: '8px' }}>
                                  Current: {intervention.current} / Optimal: {intervention.optimal}
                                </span>
                              </div>
                              <div className="intervention-solution">
                                <span className="intervention-label">Recommended:</span>
                                <span className="intervention-name">{intervention.intervention.name}</span>
                                {intervention.intervention.stock && (
                                  <span className="intervention-stock">
                                    Available: {intervention.intervention.stock} {intervention.intervention.unit || ''}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Upcoming Events */}
                    {plantDetails?.events && plantDetails.events.length > 0 && (
                      <div className="details-section">
                        <h3 className="details-section-title">Upcoming Events & Schedule</h3>
                        <div className="events-list">
                          {plantDetails.events.map((event) => (
                            <div key={event.id} className="event-item">
                              <div className={`event-indicator ${event.status}`}></div>
                              <div className="event-content">
                                <div className="event-message">{event.message}</div>
                                <div className="event-date">{formatDate(event.timestamp)}</div>
                                <div style={{ fontSize: '11px', color: '#999', marginTop: '4px' }}>
                                  Type: {event.type}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Sensor History Table */}
                    {sensorHistory.length > 0 && (
                      <div className="details-section">
                        <h3 className="details-section-title">Sensor Reading History</h3>
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{
                            width: '100%',
                            borderCollapse: 'collapse',
                            fontSize: '13px'
                          }}>
                            <thead>
                              <tr style={{ backgroundColor: '#f8f9fa' }}>
                                <th style={{ padding: '12px 8px', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Timestamp</th>
                                <th style={{ padding: '12px 8px', textAlign: 'center', borderBottom: '2px solid #dee2e6' }}>Temp (°C)</th>
                                <th style={{ padding: '12px 8px', textAlign: 'center', borderBottom: '2px solid #dee2e6' }}>Moisture (%)</th>
                                <th style={{ padding: '12px 8px', textAlign: 'center', borderBottom: '2px solid #dee2e6' }}>pH</th>
                                <th style={{ padding: '12px 8px', textAlign: 'center', borderBottom: '2px solid #dee2e6' }}>EC</th>
                                <th style={{ padding: '12px 8px', textAlign: 'center', borderBottom: '2px solid #dee2e6' }}>N</th>
                                <th style={{ padding: '12px 8px', textAlign: 'center', borderBottom: '2px solid #dee2e6' }}>P</th>
                                <th style={{ padding: '12px 8px', textAlign: 'center', borderBottom: '2px solid #dee2e6' }}>K</th>
                              </tr>
                            </thead>
                            <tbody>
                              {sensorHistory.map((reading, index) => (
                                <tr key={index} style={{ 
                                  backgroundColor: index % 2 === 0 ? 'white' : '#f8f9fa',
                                  borderBottom: '1px solid #dee2e6'
                                }}>
                                  <td style={{ padding: '10px 8px', fontSize: '12px' }}>
                                    {formatTimestamp(reading.timestamp)}
                                  </td>
                                  <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: '500' }}>
                                    {reading.Temperature || '-'}
                                  </td>
                                  <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: '500' }}>
                                    {reading.Moisture || '-'}
                                  </td>
                                  <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: '500' }}>
                                    {reading.pH || '-'}
                                  </td>
                                  <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: '500' }}>
                                    {reading.Conductivity || '-'}
                                  </td>
                                  <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: '500', color: '#4CAF50' }}>
                                    {reading.Nitrogen || '-'}
                                  </td>
                                  <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: '500', color: '#FF9800' }}>
                                    {reading.Phosphorus || '-'}
                                  </td>
                                  <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: '500', color: '#2196F3' }}>
                                    {reading.Potassium || '-'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <p style={{ 
                          marginTop: '12px', 
                          fontSize: '12px', 
                          color: '#666',
                          textAlign: 'center' 
                        }}>
                          Showing last {sensorHistory.length} readings from Realtime Database
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="planting-modal-footer">
                <button 
                  className="planting-modal-btn planting-modal-cancel"
                  onClick={handleCloseDetailsModal}
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

export default Planting