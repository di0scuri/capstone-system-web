import React, { useState, useEffect } from 'react'
import Sidebar from './sidebar'
import './planting.css'
import { collection, getDocs, doc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { getDatabase, ref, get } from 'firebase/database'

const Planting = ({ userType = 'admin' }) => {
  const [activeMenu, setActiveMenu] = useState('Planting')
  const [searchTerm, setSearchTerm] = useState('')
  const [showEditModal, setShowEditModal] = useState(false)
  const [selectedPlant, setSelectedPlant] = useState(null)
  const [plants, setPlantsData] = useState([])
  const [plantImages, setPlantImages] = useState({})
  const [loading, setLoading] = useState(true)
  const [editFormData, setEditFormData] = useState({
    locationZone: '',
    status: '',
    currentSellingPrice: '',
    unit: ''
  })

  // Fetch plant images from Firebase Realtime Database
  const fetchPlantImages = async () => {
    try {
      const rtdb = getDatabase()
      const imagesRef = ref(rtdb, 'plantImages') // Adjust path as needed
      const snapshot = await get(imagesRef)
      
      if (snapshot.exists()) {
        setPlantImages(snapshot.val())
      }
    } catch (error) {
      console.error('Error fetching plant images from RTDB:', error)
    }
  }

  // Fetch plants data from Firestore
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

  // Filter plants based on search term
  const filteredPlants = plants.filter(plant =>
    plant.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    plant.type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    plant.status?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const locationZoneOptions = [
    'Default Zone', 'Zone A', 'Zone B', 'Zone C', 'Zone D',
    'Greenhouse 1', 'Greenhouse 2', 'Outdoor Plot 1', 'Outdoor Plot 2'
  ]

  const statusOptions = [
    'Seeding', 'Seedling', 'Growing', 'Flowering', 'Fruiting', 'Harvesting', 'Completed'
  ]

  const unitOptions = [
    'per kilo', 'per piece', 'per bundle', 'per pack', 'per dozen'
  ]

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
    setEditFormData({
      locationZone: '',
      status: '',
      currentSellingPrice: '',
      unit: ''
    })
  }

  const handleInputChange = (field, value) => {
    setEditFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleSave = async () => {
    try {
      // Update the plant in Firebase
      const plantRef = doc(db, 'plants', selectedPlant.id)
      const updateData = {
        locationZone: editFormData.locationZone,
        status: editFormData.status,
        currentSellingPrice: parseFloat(editFormData.currentSellingPrice) || 0,
        unit: editFormData.unit,
        lastUpdated: serverTimestamp()
      }

      await updateDoc(plantRef, updateData)

      // Create a log entry for the plant update
      const logData = {
        plantId: selectedPlant.id,
        plantName: selectedPlant.name,
        plantType: selectedPlant.type,
        action: 'Plant Updated',
        changes: {
          locationZone: { from: selectedPlant.locationZone, to: editFormData.locationZone },
          status: { from: selectedPlant.status, to: editFormData.status },
          currentSellingPrice: { from: selectedPlant.currentSellingPrice, to: editFormData.currentSellingPrice },
          unit: { from: selectedPlant.unit, to: editFormData.unit }
        },
        timestamp: serverTimestamp(),
        userId: 'admin' // Replace with actual user ID if available
      }

      await addDoc(collection(db, 'plant_logs'), logData)

      // Update local state
      setPlantsData(prev => prev.map(plant => 
        plant.id === selectedPlant.id 
          ? {
              ...plant,
              locationZone: editFormData.locationZone,
              status: editFormData.status,
              currentSellingPrice: parseFloat(editFormData.currentSellingPrice) || 0,
              unit: editFormData.unit
            }
          : plant
      ))
      
      console.log('Plant updated successfully:', {
        plantId: selectedPlant.id,
        plantName: selectedPlant.name,
        updatedData: editFormData
      })
      
      handleCloseModal()
    } catch (error) {
      console.error('Error updating plant:', error)
      alert('Failed to update plant. Please try again.')
    }
  }

  const getPlantImage = (plant) => {
    // First, try to get image from RTDB using plant ID
    if (plantImages[plant.id]) {
      return plantImages[plant.id]
    }
    
    // Then try using plant type as key
    if (plant.type && plantImages[plant.type]) {
      return plantImages[plant.type]
    }
    
    // Try using plant name as key
    if (plant.name && plantImages[plant.name]) {
      return plantImages[plant.name]
    }
    
    // Try imageUrl field from Firestore (if it exists)
    if (plant.imageUrl && plant.imageUrl.startsWith('http')) {
      return plant.imageUrl
    }
    
    // Fallback images based on plant type
    const fallbackImages = {
      'Tomato': 'https://images.unsplash.com/photo-1592841200221-a6898f307baa?w=300&h=200&fit=crop',
      'Lettuce': 'https://images.unsplash.com/photo-1622206151226-18ca2c9ab4a1?w=300&h=200&fit=crop',
      'Cabbage': 'https://images.unsplash.com/photo-1594282486558-4d2d2f2b8df5?w=300&h=200&fit=crop',
      'Pechay': 'https://images.unsplash.com/photo-1576045057995-568f588f82fb?w=300&h=200&fit=crop'
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

  const calculateAreaOccupied = (areaOccupiedSqM) => {
    if (!areaOccupiedSqM) return 'Unknown'
    return `${areaOccupiedSqM} sqm`
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
                  <div key={plant.id} className="planting-card">
                    <div className="planting-card-image">
                      <img 
                        src={getPlantImage(plant)} 
                        alt={plant.name || plant.type}
                        onError={(e) => {
                          e.target.src = 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=300&h=200&fit=crop'
                        }}
                      />
                    </div>
                    
                    <div className="planting-card-content">
                      <h3 className="planting-card-name">
                        {plant.name || `${plant.type} - ${formatDate(plant.datePlanted)}`}
                      </h3>
                      
                      <div className="planting-card-details">
                        <div className="planting-detail-row">
                          <span className="planting-detail-label">Area planted:</span>
                          <span className="planting-detail-value">
                            {calculateAreaOccupied(plant.areaOccupiedSqM)}
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
                          <span className="planting-detail-label">Seed quantity:</span>
                          <span className="planting-detail-value">
                            {plant.initialSeedQuantity || 0}
                          </span>
                        </div>

                        {plant.currentSellingPrice && (
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
                        onClick={() => handleEdit(plant)}
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

        {showEditModal && selectedPlant && (
          <div className="planting-modal-overlay" onClick={handleCloseModal}>
            <div className="planting-modal" onClick={(e) => e.stopPropagation()}>
              <div className="planting-modal-header">
                <h2 className="planting-modal-title">
                  {selectedPlant.name || selectedPlant.type}
                </h2>
                <button className="planting-modal-close" onClick={handleCloseModal}>
                  ✕
                </button>
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
      </div>
    </div>
  )
}

export default Planting