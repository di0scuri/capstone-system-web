import React, { useState, useEffect } from 'react'
import './fertilizerRecommendations.css'
import { collection, getDocs, addDoc, updateDoc, doc, serverTimestamp, increment } from 'firebase/firestore'
import { db } from '../firebase'

const FertilizerRecommendations = ({ plantId, plantData, userType = 'admin' }) => {
  const [recommendations, setRecommendations] = useState([])
  const [inventory, setInventory] = useState([])
  const [loading, setLoading] = useState(true)
  const [showUseModal, setShowUseModal] = useState(false)
  const [selectedFertilizer, setSelectedFertilizer] = useState(null)
  const [useAmount, setUseAmount] = useState('')
  const [useNotes, setUseNotes] = useState('')
  const [processing, setProcessing] = useState(false)

  // Fetch recommendations and inventory
  useEffect(() => {
    if (plantId) {
      fetchRecommendations()
      fetchInventory()
    }
  }, [plantId])

  // Fetch fertilizer recommendations for this plant
  const fetchRecommendations = async () => {
    setLoading(true)
    try {
      const querySnapshot = await getDocs(collection(db, 'fertilizerRecommendations'))
      const recsData = querySnapshot.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        .filter(rec => rec.plantId === plantId)
        .sort((a, b) => {
          const dateA = rec.timestamp?.toDate ? rec.timestamp.toDate() : new Date(rec.timestamp)
          const dateB = rec.timestamp?.toDate ? rec.timestamp.toDate() : new Date(rec.timestamp)
          return dateB - dateA
        })

      setRecommendations(recsData)
    } catch (error) {
      console.error('Error fetching recommendations:', error)
    } finally {
      setLoading(false)
    }
  }

  // Fetch inventory items
  const fetchInventory = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'inventory'))
      const inventoryData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      setInventory(inventoryData)
    } catch (error) {
      console.error('Error fetching inventory:', error)
    }
  }

  // Check if fertilizer exists in inventory
  const findInInventory = (fertilizerName) => {
    // Normalize the name for comparison
    const normalizedName = fertilizerName.toLowerCase().trim()
    
    return inventory.find(item => {
      const itemName = (item.name || '').toLowerCase().trim()
      const itemCategory = (item.category || '').toLowerCase().trim()
      
      // Check if it matches name or if it's a fertilizer/seed category
      return (
        itemName.includes(normalizedName) ||
        normalizedName.includes(itemName) ||
        (itemCategory === 'fertilizer' && itemName === normalizedName)
      )
    })
  }

  // Handle open use modal
  const handleUseFertilizer = (recommendation) => {
    const inventoryItem = findInInventory(recommendation.fertilizerName)
    
    if (!inventoryItem) {
      alert('⚠️ This fertilizer is not in your inventory. Please add it first.')
      return
    }

    if (inventoryItem.stock <= 0) {
      alert('⚠️ This fertilizer is out of stock.')
      return
    }

    setSelectedFertilizer({
      ...recommendation,
      inventoryItem
    })
    setUseAmount(recommendation.recommendedAmount || '')
    setUseNotes('')
    setShowUseModal(true)
  }

  // Handle apply fertilizer
  const handleApplyFertilizer = async () => {
    if (!useAmount || parseFloat(useAmount) <= 0) {
      alert('Please enter a valid amount')
      return
    }

    const amount = parseFloat(useAmount)
    const availableStock = selectedFertilizer.inventoryItem.stock

    if (amount > availableStock) {
      alert(`⚠️ Not enough stock. Available: ${availableStock} ${selectedFertilizer.inventoryItem.unit}`)
      return
    }

    setProcessing(true)

    try {
      // 1. Update inventory stock
      const inventoryRef = doc(db, 'inventory', selectedFertilizer.inventoryItem.id)
      await updateDoc(inventoryRef, {
        stock: increment(-amount),
        lastUpdated: serverTimestamp()
      })

      // 2. Create inventory log entry
      const logData = {
        itemId: selectedFertilizer.inventoryItem.id,
        itemName: selectedFertilizer.inventoryItem.name,
        plantId: plantId,
        plantName: plantData?.plantName || plantData?.plantType || 'Unknown',
        type: 'Fertilizer Used',
        quantityChange: -amount,
        costOrValuePerUnit: selectedFertilizer.inventoryItem.pricePerUnit || 0,
        unit: selectedFertilizer.inventoryItem.unit || 'kg',
        notes: useNotes || `Applied fertilizer based on recommendation. Recommended: ${selectedFertilizer.recommendedAmount}${selectedFertilizer.unit}, Applied: ${amount}${selectedFertilizer.inventoryItem.unit}`,
        timestamp: serverTimestamp(),
        category: 'Fertilizer Application',
        recommendationId: selectedFertilizer.id,
        deficiency: selectedFertilizer.deficiency,
        currentLevel: selectedFertilizer.currentLevel,
        targetLevel: selectedFertilizer.targetLevel
      }

      await addDoc(collection(db, 'inventory_log'), logData)

      // 3. Create calendar event for fertilizer application
      const eventData = {
        plantId: plantId,
        plantName: plantData?.plantName || plantData?.plantType || 'Unknown',
        plotNumber: plantData?.plotNumber || null,
        type: 'FERTILIZING',
        status: 'success',
        priority: 'normal',
        title: `Applied ${selectedFertilizer.fertilizerName} - ${plantData?.plantName || 'Plant'}`,
        description: `Fertilizer Application\n\nFertilizer: ${selectedFertilizer.fertilizerName}\nAmount Applied: ${amount} ${selectedFertilizer.inventoryItem.unit}\nRecommended Amount: ${selectedFertilizer.recommendedAmount} ${selectedFertilizer.unit}\n\nDeficiency Addressed: ${selectedFertilizer.deficiency}\nCurrent Level: ${selectedFertilizer.currentLevel}\nTarget Level: ${selectedFertilizer.targetLevel}\n\n${useNotes ? `Notes: ${useNotes}` : ''}`,
        date: new Date().toISOString().split('T')[0],
        startTime: new Date().toTimeString().split(' ')[0].substring(0, 5),
        endTime: '',
        notes: useNotes,
        createdAt: serverTimestamp(),
        createdBy: userType,
        updatedAt: serverTimestamp()
      }

      await addDoc(collection(db, 'events'), eventData)

      alert('✅ Fertilizer applied successfully!\n\n' +
            `• Stock updated: -${amount} ${selectedFertilizer.inventoryItem.unit}\n` +
            `• Log entry created\n` +
            `• Calendar event added`)

      // Refresh data
      fetchInventory()
      setShowUseModal(false)
      setSelectedFertilizer(null)
      setUseAmount('')
      setUseNotes('')

    } catch (error) {
      console.error('Error applying fertilizer:', error)
      alert('❌ Failed to apply fertilizer. Please try again.')
    } finally {
      setProcessing(false)
    }
  }

  // Get nutrient status color
  const getStatusColor = (deficiency) => {
    const lowerDef = deficiency.toLowerCase()
    if (lowerDef.includes('low') || lowerDef.includes('deficient')) return '#ef4444'
    if (lowerDef.includes('high') || lowerDef.includes('excess')) return '#f59e0b'
    return '#10b981'
  }

  // Get priority badge
  const getPriorityBadge = (priority) => {
    const colors = {
      'HIGH': { bg: '#fee2e2', color: '#dc2626', label: 'High Priority' },
      'MEDIUM': { bg: '#fef3c7', color: '#d97706', label: 'Medium Priority' },
      'LOW': { bg: '#dbeafe', color: '#2563eb', label: 'Low Priority' }
    }
    const config = colors[priority] || colors.MEDIUM
    return (
      <span 
        className="priority-badge"
        style={{ background: config.bg, color: config.color }}
      >
        {config.label}
      </span>
    )
  }

  if (loading) {
    return (
      <div className="fertilizer-recommendations">
        <div className="loading">Loading recommendations...</div>
      </div>
    )
  }

  if (recommendations.length === 0) {
    return (
      <div className="fertilizer-recommendations">
        <div className="no-recommendations">
          <div className="no-rec-icon">🌿</div>
          <h3>No Fertilizer Recommendations</h3>
          <p>All nutrient levels are within optimal range</p>
        </div>
      </div>
    )
  }

  return (
    <div className="fertilizer-recommendations">
      <div className="recommendations-header">
        <h2 className="recommendations-title">
          <span className="title-icon">🌿</span>
          Fertilizer Recommendations
        </h2>
        <div className="recommendations-count">
          {recommendations.length} recommendation{recommendations.length !== 1 ? 's' : ''}
        </div>
      </div>

      <div className="recommendations-grid">
        {recommendations.map(rec => {
          const inventoryItem = findInInventory(rec.fertilizerName)
          const inStock = inventoryItem && inventoryItem.stock > 0
          const hasEnough = inventoryItem && inventoryItem.stock >= parseFloat(rec.recommendedAmount)

          return (
            <div 
              key={rec.id} 
              className="recommendation-card"
              style={{ borderLeftColor: getStatusColor(rec.deficiency) }}
            >
              <div className="rec-header">
                <div className="rec-title-section">
                  <h3 className="rec-fertilizer-name">{rec.fertilizerName}</h3>
                  {getPriorityBadge(rec.priority)}
                </div>
                
                {inventoryItem && (
                  <div className={`inventory-status ${inStock ? 'in-stock' : 'out-of-stock'}`}>
                    <span className="status-icon">{inStock ? '✓' : '✗'}</span>
                    <span className="status-text">
                      {inStock ? `${inventoryItem.stock} ${inventoryItem.unit} available` : 'Out of stock'}
                    </span>
                  </div>
                )}
              </div>

              <div className="rec-details">
                <div className="detail-row">
                  <span className="detail-label">Deficiency:</span>
                  <span 
                    className="detail-value deficiency"
                    style={{ color: getStatusColor(rec.deficiency) }}
                  >
                    {rec.deficiency}
                  </span>
                </div>

                <div className="detail-row">
                  <span className="detail-label">Current Level:</span>
                  <span className="detail-value">{rec.currentLevel}</span>
                </div>

                <div className="detail-row">
                  <span className="detail-label">Target Level:</span>
                  <span className="detail-value">{rec.targetLevel}</span>
                </div>

                <div className="detail-row highlight">
                  <span className="detail-label">Recommended Amount:</span>
                  <span className="detail-value amount">
                    {rec.recommendedAmount} {rec.unit}
                  </span>
                </div>

                {rec.applicationMethod && (
                  <div className="detail-row">
                    <span className="detail-label">Application:</span>
                    <span className="detail-value">{rec.applicationMethod}</span>
                  </div>
                )}

                {rec.notes && (
                  <div className="rec-notes">
                    <span className="notes-icon">📝</span>
                    <p>{rec.notes}</p>
                  </div>
                )}

                {rec.timestamp && (
                  <div className="rec-timestamp">
                    Recommended: {new Date(rec.timestamp?.toDate ? rec.timestamp.toDate() : rec.timestamp).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </div>
                )}
              </div>

              <div className="rec-actions">
                {inventoryItem ? (
                  <>
                    {inStock ? (
                      <button
                        className="use-fertilizer-btn"
                        onClick={() => handleUseFertilizer(rec)}
                        disabled={!hasEnough}
                      >
                        <span className="btn-icon">✓</span>
                        {hasEnough ? 'Use Fertilizer' : `Insufficient Stock (${inventoryItem.stock} ${inventoryItem.unit})`}
                      </button>
                    ) : (
                      <button className="out-of-stock-btn" disabled>
                        <span className="btn-icon">✗</span>
                        Out of Stock
                      </button>
                    )}
                  </>
                ) : (
                  <button className="not-in-inventory-btn" disabled>
                    <span className="btn-icon">⚠️</span>
                    Not in Inventory
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Use Fertilizer Modal */}
      {showUseModal && selectedFertilizer && (
        <div className="modal-overlay" onClick={() => !processing && setShowUseModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">
                <span className="modal-icon">🌿</span>
                Apply Fertilizer
              </h2>
              <button 
                className="modal-close"
                onClick={() => setShowUseModal(false)}
                disabled={processing}
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div className="fertilizer-info-section">
                <h3 className="info-title">Fertilizer Details</h3>
                
                <div className="info-grid">
                  <div className="info-item">
                    <span className="info-label">Fertilizer:</span>
                    <span className="info-value">{selectedFertilizer.fertilizerName}</span>
                  </div>

                  <div className="info-item">
                    <span className="info-label">Plant:</span>
                    <span className="info-value">{plantData?.plantName || plantData?.plantType}</span>
                  </div>

                  <div className="info-item">
                    <span className="info-label">Deficiency:</span>
                    <span className="info-value" style={{ color: getStatusColor(selectedFertilizer.deficiency) }}>
                      {selectedFertilizer.deficiency}
                    </span>
                  </div>

                  <div className="info-item">
                    <span className="info-label">Available Stock:</span>
                    <span className="info-value">
                      {selectedFertilizer.inventoryItem.stock} {selectedFertilizer.inventoryItem.unit}
                    </span>
                  </div>

                  <div className="info-item highlight">
                    <span className="info-label">Recommended Amount:</span>
                    <span className="info-value">
                      {selectedFertilizer.recommendedAmount} {selectedFertilizer.unit}
                    </span>
                  </div>
                </div>
              </div>

              <div className="amount-input-section">
                <label className="input-label">
                  Amount to Use <span className="required">*</span>
                </label>
                <div className="input-with-unit">
                  <input
                    type="number"
                    className="amount-input"
                    value={useAmount}
                    onChange={(e) => setUseAmount(e.target.value)}
                    placeholder={`e.g., ${selectedFertilizer.recommendedAmount}`}
                    min="0"
                    max={selectedFertilizer.inventoryItem.stock}
                    step="0.1"
                    disabled={processing}
                  />
                  <span className="input-unit">{selectedFertilizer.inventoryItem.unit}</span>
                </div>
                
                {parseFloat(useAmount) > 0 && (
                  <div className="amount-validation">
                    {parseFloat(useAmount) > selectedFertilizer.inventoryItem.stock && (
                      <span className="validation-error">
                        ⚠️ Exceeds available stock
                      </span>
                    )}
                    {parseFloat(useAmount) !== parseFloat(selectedFertilizer.recommendedAmount) && (
                      <span className="validation-warning">
                        ℹ️ Different from recommended amount
                      </span>
                    )}
                    {parseFloat(useAmount) === parseFloat(selectedFertilizer.recommendedAmount) && (
                      <span className="validation-success">
                        ✓ Matches recommended amount
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="notes-input-section">
                <label className="input-label">Notes (Optional)</label>
                <textarea
                  className="notes-textarea"
                  rows="3"
                  value={useNotes}
                  onChange={(e) => setUseNotes(e.target.value)}
                  placeholder="Add any notes about this application..."
                  disabled={processing}
                />
              </div>

              <div className="impact-summary">
                <h4 className="summary-title">Impact Summary</h4>
                <div className="summary-items">
                  <div className="summary-item">
                    <span className="summary-icon">📦</span>
                    <span className="summary-text">
                      Stock will decrease from <strong>{selectedFertilizer.inventoryItem.stock}</strong> to{' '}
                      <strong>{(selectedFertilizer.inventoryItem.stock - parseFloat(useAmount || 0)).toFixed(2)}</strong>{' '}
                      {selectedFertilizer.inventoryItem.unit}
                    </span>
                  </div>
                  <div className="summary-item">
                    <span className="summary-icon">📝</span>
                    <span className="summary-text">
                      Log entry will be created in inventory_log
                    </span>
                  </div>
                  <div className="summary-item">
                    <span className="summary-icon">📅</span>
                    <span className="summary-text">
                      Event will be added to calendar
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button
                className="modal-btn cancel-btn"
                onClick={() => setShowUseModal(false)}
                disabled={processing}
              >
                Cancel
              </button>
              <button
                className="modal-btn apply-btn"
                onClick={handleApplyFertilizer}
                disabled={processing || !useAmount || parseFloat(useAmount) <= 0 || parseFloat(useAmount) > selectedFertilizer.inventoryItem.stock}
              >
                {processing ? (
                  <>
                    <span className="btn-spinner">⏳</span>
                    Applying...
                  </>
                ) : (
                  <>
                    <span className="btn-icon">✓</span>
                    Apply Fertilizer
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default FertilizerRecommendations