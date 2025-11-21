import React, { useState, useEffect } from 'react'
import Sidebar from './sidebar'
import './production.css'
import { collection, getDocs, addDoc, updateDoc, doc, serverTimestamp, query, where } from 'firebase/firestore'
import { db } from '../firebase'

const PlantProduction = ({ userType = 'admin' }) => {
  const hasAccess = userType === 'admin' || userType === 'finance'
  
  const [activeMenu, setActiveMenu] = useState('Production')
  const [activeTab, setActiveTab] = useState('Overview')
  const [searchTerm, setSearchTerm] = useState('')
  const [plants, setPlants] = useState([])
  const [selectedPlant, setSelectedPlant] = useState(null)
  const [showCostingModal, setShowCostingModal] = useState(false)
  const [showViewModal, setShowViewModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [costingData, setCostingData] = useState(null)
  const [costRecords, setCostRecords] = useState([])
  const [totalProductionCost, setTotalProductionCost] = useState(0)

  if (!hasAccess) {
    return (
      <div className="dashboard-container">
        <Sidebar activeMenu={activeMenu} setActiveMenu={setActiveMenu} userType={userType} />
        <div className="production-main" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '80vh', padding: '40px', textAlign: 'center' }}>
          <div style={{ background: '#fee', border: '2px solid #fcc', borderRadius: '12px', padding: '40px', maxWidth: '500px' }}>
            <div style={{ fontSize: '64px', marginBottom: '20px' }}>⛔</div>
            <h2 style={{ color: '#c33', marginBottom: '10px' }}>Access Denied</h2>
            <p style={{ color: '#666', fontSize: '16px' }}>
              You don't have permission to access Production Costing.
              <br />This feature is only available to Admin and Finance users.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const [costs, setCosts] = useState({
    landPreparation: { clearing: 0, plowing: 0, harrowing: 0, greenhouseSetup: 0, irrigationSetup: 0, labor: 0 },
    plantingMaterials: { seeds: 0, seedlings: 0, seedTreatment: 0, nurseryMaterials: 0, transportation: 0 },
    inputs: { fertilizers: 0, pesticides: 0, herbicides: 0, growthRegulators: 0, compost: 0, mulch: 0, soilConditioners: 0 },
    labor: { planting: 0, watering: 0, weeding: 0, pestControl: 0, maintenance: 0, harvesting: 0, postHarvest: 0 },
    equipment: { depreciation: 0, rental: 0, fuel: 0, maintenance: 0, smallTools: 0 },
    irrigation: { waterSource: 0, electricity: 0, pumpMaintenance: 0, systemMaintenance: 0 },
    harvesting: { harvestLabor: 0, packagingMaterials: 0, cleaning: 0, sorting: 0, storage: 0, transport: 0 },
    overhead: { administration: 0, management: 0, repairs: 0, insurance: 0, taxes: 0, permits: 0 },
    marketing: { transportToMarket: 0, marketFees: 0, commission: 0, advertising: 0 },
    contingency: { emergencyFund: 0, weatherDamage: 0, pestOutbreak: 0 }
  })

  // Fetch plants
  const fetchPlants = async () => {
    setLoading(true)
    try {
      const querySnapshot = await getDocs(collection(db, 'plants'))
      const plantsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        datePlanted: doc.data().datePlanted?.toDate ? doc.data().datePlanted.toDate() : new Date()
      }))
      setPlants(plantsData)
    } catch (error) {
      console.error('Error fetching plants:', error)
    } finally {
      setLoading(false)
    }
  }

  // Fetch all cost records
  const fetchCostRecords = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'productionCosts'))
      const records = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate ? doc.data().createdAt.toDate() : new Date()
      }))
      setCostRecords(records)
      
      const total = records.reduce((sum, record) => sum + (record.totalCost || 0), 0)
      setTotalProductionCost(total)
    } catch (error) {
      console.error('Error fetching cost records:', error)
    }
  }

  useEffect(() => {
    fetchPlants()
    fetchCostRecords()
  }, [])

  const calculateCategoryTotal = (category) => {
    return Object.values(category).reduce((sum, value) => sum + parseFloat(value || 0), 0)
  }

  const calculateGrandTotal = () => {
    let total = 0
    Object.values(costs).forEach(category => {
      total += calculateCategoryTotal(category)
    })
    return total
  }

  const getCostBreakdown = () => {
    return {
      landPreparation: calculateCategoryTotal(costs.landPreparation),
      plantingMaterials: calculateCategoryTotal(costs.plantingMaterials),
      inputs: calculateCategoryTotal(costs.inputs),
      labor: calculateCategoryTotal(costs.labor),
      equipment: calculateCategoryTotal(costs.equipment),
      irrigation: calculateCategoryTotal(costs.irrigation),
      harvesting: calculateCategoryTotal(costs.harvesting),
      overhead: calculateCategoryTotal(costs.overhead),
      marketing: calculateCategoryTotal(costs.marketing),
      contingency: calculateCategoryTotal(costs.contingency)
    }
  }

  const handleCostChange = (category, field, value) => {
    setCosts(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [field]: value
      }
    }))
  }

  const handleAddCosting = (plant) => {
    setSelectedPlant(plant)
    setCosts({
      landPreparation: { clearing: 0, plowing: 0, harrowing: 0, greenhouseSetup: 0, irrigationSetup: 0, labor: 0 },
      plantingMaterials: { seeds: 0, seedlings: 0, seedTreatment: 0, nurseryMaterials: 0, transportation: 0 },
      inputs: { fertilizers: 0, pesticides: 0, herbicides: 0, growthRegulators: 0, compost: 0, mulch: 0, soilConditioners: 0 },
      labor: { planting: 0, watering: 0, weeding: 0, pestControl: 0, maintenance: 0, harvesting: 0, postHarvest: 0 },
      equipment: { depreciation: 0, rental: 0, fuel: 0, maintenance: 0, smallTools: 0 },
      irrigation: { waterSource: 0, electricity: 0, pumpMaintenance: 0, systemMaintenance: 0 },
      harvesting: { harvestLabor: 0, packagingMaterials: 0, cleaning: 0, sorting: 0, storage: 0, transport: 0 },
      overhead: { administration: 0, management: 0, repairs: 0, insurance: 0, taxes: 0, permits: 0 },
      marketing: { transportToMarket: 0, marketFees: 0, commission: 0, advertising: 0 },
      contingency: { emergencyFund: 0, weatherDamage: 0, pestOutbreak: 0 }
    })
    setShowCostingModal(true)
  }

  const handleSaveCosting = async () => {
    if (!selectedPlant) return

    const breakdown = getCostBreakdown()
    const grandTotal = calculateGrandTotal()
    const costPerSqm = grandTotal / (selectedPlant.areaOccupiedSqM || 1)
    const estimatedYield = selectedPlant.totalEstimatedYield || selectedPlant.initialSeedQuantity || 0
    const costPerUnit = estimatedYield > 0 ? grandTotal / estimatedYield : 0

    const costingRecord = {
      plantId: selectedPlant.id,
      plantName: selectedPlant.name,
      plantType: selectedPlant.type,
      plotNumber: selectedPlant.plotNumber,
      areaOccupied: selectedPlant.areaOccupiedSqM,
      detailedCosts: costs,
      breakdown,
      totalCost: grandTotal,
      costPerSqm: costPerSqm,
      estimatedYield: estimatedYield,
      costPerUnit: costPerUnit,
      profitMargin: 0,
      createdAt: serverTimestamp(),
      createdBy: userType,
      lastModifiedBy: userType,
      lastModifiedAt: serverTimestamp()
    }

    try {
      await addDoc(collection(db, 'productionCosts'), costingRecord)
      await updateDoc(doc(db, 'plants', selectedPlant.id), {
        hasCosting: true,
        totalProductionCost: grandTotal,
        costPerUnit: costPerUnit,
        lastCostingUpdate: serverTimestamp(),
        lastCostingBy: userType
      })

      alert(`✅ Production costing saved!\n\nTotal Cost: ₱${grandTotal.toLocaleString()}\nCost per m²: ₱${costPerSqm.toFixed(2)}\nCost per unit: ₱${costPerUnit.toFixed(2)}`)
      setShowCostingModal(false)
      fetchPlants()
      fetchCostRecords()
    } catch (error) {
      console.error('Error saving costing:', error)
      alert('Error saving costing data')
    }
  }

  const handleViewCosting = async (plant) => {
    setSelectedPlant(plant)
    try {
      const q = query(collection(db, 'productionCosts'), where('plantId', '==', plant.id))
      const snapshot = await getDocs(q)
      
      if (!snapshot.empty) {
        const data = snapshot.docs[0].data()
        setCostingData(data)
        setShowViewModal(true)
      } else {
        alert('No costing data found for this plant')
      }
    } catch (error) {
      console.error('Error fetching costing:', error)
      alert('Error loading costing data')
    }
  }

  const filteredPlants = plants.filter(plant =>
    plant.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    plant.type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    plant.plotNumber?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const formatDate = (date) => {
    if (!date) return 'N/A'
    if (date.toDate) date = date.toDate()
    return new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  }

  // Calculate statistics for Overview
  const totalPlants = plants.length
  const plantsWithCosting = plants.filter(p => p.hasCosting).length
  const plantsWithoutCosting = totalPlants - plantsWithCosting
  const avgCostPerPlant = plantsWithCosting > 0 ? totalProductionCost / plantsWithCosting : 0

  return (
    <div className="dashboard-container">
      <Sidebar activeMenu={activeMenu} setActiveMenu={setActiveMenu} userType={userType} />

      <div className="production-main">
        {/* Header */}
        <div className="production-page-header">
          <div className="production-header-content">
            <div className="production-header-icon">💰</div>
            <div>
              <h1 className="production-page-title">Production Costing</h1>
              <p className="production-page-subtitle">Manage production costs for all plants</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="production-tabs">
          <button 
            className={`production-tab ${activeTab === 'Overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('Overview')}
          >
            📊 Overview
          </button>
          <button 
            className={`production-tab ${activeTab === 'Manage Costs' ? 'active' : ''}`}
            onClick={() => setActiveTab('Manage Costs')}
          >
            💵 Manage Costs
          </button>
          <button 
            className={`production-tab ${activeTab === 'Cost Records' ? 'active' : ''}`}
            onClick={() => setActiveTab('Cost Records')}
          >
            📋 Cost Records
          </button>
        </div>

        {/* Tab Content */}
        <div className="production-tab-content">
          {/* OVERVIEW TAB */}
          {activeTab === 'Overview' && (
            <div className="overview-content">
              <div className="overview-stats">
                <div className="stat-card">
                  <div className="stat-icon">💰</div>
                  <div className="stat-info">
                    <p className="stat-label">Total Production Cost</p>
                    <p className="stat-value">₱{totalProductionCost.toLocaleString()}</p>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon">🌱</div>
                  <div className="stat-info">
                    <p className="stat-label">Total Plants</p>
                    <p className="stat-value">{totalPlants}</p>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon">✅</div>
                  <div className="stat-info">
                    <p className="stat-label">Plants with Costing</p>
                    <p className="stat-value">{plantsWithCosting}</p>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon">📊</div>
                  <div className="stat-info">
                    <p className="stat-label">Avg Cost per Plant</p>
                    <p className="stat-value">₱{avgCostPerPlant.toLocaleString(undefined, {maximumFractionDigits: 0})}</p>
                  </div>
                </div>
              </div>

              <div className="overview-grid">
                <div className="overview-chart-card">
                  <h3>Cost Distribution</h3>
                  <div className="chart-placeholder">
                    <p>Plants with Costing: {plantsWithCosting}</p>
                    <p>Plants without Costing: {plantsWithoutCosting}</p>
                    <div className="simple-bar-chart">
                      <div className="bar-item">
                        <span className="bar-label">With Costing</span>
                        <div className="bar-container">
                          <div className="bar-fill" style={{ width: `${totalPlants > 0 ? (plantsWithCosting / totalPlants) * 100 : 0}%`, background: '#10b981' }}></div>
                        </div>
                        <span className="bar-value">{plantsWithCosting}</span>
                      </div>
                      <div className="bar-item">
                        <span className="bar-label">Without Costing</span>
                        <div className="bar-container">
                          <div className="bar-fill" style={{ width: `${totalPlants > 0 ? (plantsWithoutCosting / totalPlants) * 100 : 0}%`, background: '#f59e0b' }}></div>
                        </div>
                        <span className="bar-value">{plantsWithoutCosting}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="overview-summary-card">
                  <h3>Recent Activity</h3>
                  <div className="activity-list">
                    {costRecords.slice(0, 5).map((record, index) => (
                      <div key={index} className="activity-item">
                        <div className="activity-icon">📝</div>
                        <div className="activity-info">
                          <p className="activity-title">{record.plantName}</p>
                          <p className="activity-date">{formatDate(record.createdAt)}</p>
                        </div>
                        <div className="activity-cost">₱{record.totalCost?.toLocaleString()}</div>
                      </div>
                    ))}
                    {costRecords.length === 0 && (
                      <p style={{ textAlign: 'center', color: '#999', padding: '20px' }}>No cost records yet</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* MANAGE COSTS TAB */}
          {activeTab === 'Manage Costs' && (
            <div className="manage-costs-content">
              <div className="manage-header">
                <h2>Plants Production Costs</h2>
                <div className="production-search-box">
                  <input
                    type="text"
                    placeholder="Search plants..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="production-search"
                  />
                  <span className="production-search-icon">🔍</span>
                </div>
              </div>

              {loading ? (
                <div className="production-loading">Loading plants...</div>
              ) : (
                <div className="production-table-container">
                  <table className="production-table">
                    <thead>
                      <tr>
                        <th>PLANT NAME</th>
                        <th>TYPE</th>
                        <th>PLOT</th>
                        <th>AREA (M²)</th>
                        <th>STATUS</th>
                        <th>TOTAL COST</th>
                        <th>COST/UNIT</th>
                        <th>ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPlants.length === 0 ? (
                        <tr>
                          <td colSpan="8" style={{ textAlign: 'center', padding: '40px' }}>
                            No plants found
                          </td>
                        </tr>
                      ) : (
                        filteredPlants.map(plant => (
                          <tr key={plant.id}>
                            <td>{plant.name}</td>
                            <td>{plant.type}</td>
                            <td><span className="plot-badge">{plant.plotNumber || 'N/A'}</span></td>
                            <td>{plant.areaOccupiedSqM || 0}</td>
                            <td>
                              <span className="status-badge" style={{ 
                                background: plant.status === 'Completed' ? '#10b981' : 
                                           plant.status === 'Growing' ? '#3b82f6' : '#f59e0b' 
                              }}>
                                {plant.status}
                              </span>
                            </td>
                            <td>
                              {plant.totalProductionCost ? (
                                <span className="cost-value">₱{plant.totalProductionCost.toLocaleString()}</span>
                              ) : (
                                <span className="no-cost">—</span>
                              )}
                            </td>
                            <td>
                              {plant.costPerUnit ? (
                                <span className="cost-value">₱{plant.costPerUnit.toFixed(2)}</span>
                              ) : (
                                <span className="no-cost">—</span>
                              )}
                            </td>
                            <td>
                              <div className="action-buttons">
                                {!plant.hasCosting ? (
                                  <button className="action-btn add-btn" onClick={() => handleAddCosting(plant)}>
                                    Add Costing
                                  </button>
                                ) : (
                                  <>
                                    <button className="action-btn view-btn" onClick={() => handleViewCosting(plant)}>
                                      View
                                    </button>
                                    <button className="action-btn edit-btn" onClick={() => handleAddCosting(plant)}>
                                      Update
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* COST RECORDS TAB */}
          {activeTab === 'Cost Records' && (
            <div className="cost-records-content">
              <h2>All Cost Records</h2>
              <div className="records-table-container">
                <table className="production-table">
                  <thead>
                    <tr>
                      <th>DATE</th>
                      <th>PLANT NAME</th>
                      <th>TYPE</th>
                      <th>PLOT</th>
                      <th>TOTAL COST</th>
                      <th>COST/M²</th>
                      <th>COST/UNIT</th>
                      <th>CREATED BY</th>
                      <th>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {costRecords.length === 0 ? (
                      <tr>
                        <td colSpan="9" style={{ textAlign: 'center', padding: '40px' }}>
                          No cost records found
                        </td>
                      </tr>
                    ) : (
                      costRecords.map(record => (
                        <tr key={record.id}>
                          <td>{formatDate(record.createdAt)}</td>
                          <td>{record.plantName}</td>
                          <td>{record.plantType}</td>
                          <td><span className="plot-badge">{record.plotNumber || 'N/A'}</span></td>
                          <td className="cost-value">₱{record.totalCost?.toLocaleString()}</td>
                          <td>₱{record.costPerSqm?.toFixed(2)}</td>
                          <td>₱{record.costPerUnit?.toFixed(2)}</td>
                          <td>
                            <span className="created-by-badge">{record.createdBy?.toUpperCase()}</span>
                          </td>
                          <td>
                            <button 
                              className="action-btn view-btn"
                              onClick={() => {
                                setCostingData(record)
                                setSelectedPlant({ name: record.plantName })
                                setShowViewModal(true)
                              }}
                            >
                              View Details
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Add/Edit Costing Modal */}
        {showCostingModal && selectedPlant && (
          <div className="production-modal-overlay" onClick={() => setShowCostingModal(false)}>
            <div className="production-modal" onClick={(e) => e.stopPropagation()}>
              <div className="production-modal-header">
                <h2 className="production-modal-title">💰 Production Costing - {selectedPlant.name}</h2>
                <button className="production-modal-close" onClick={() => setShowCostingModal(false)}>✕</button>
              </div>

              <div className="production-modal-body">
                <div className="plant-info-card">
                  <div className="info-row">
                    <span className="info-label">Plot:</span>
                    <span className="info-value">{selectedPlant.plotNumber}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Area:</span>
                    <span className="info-value">{selectedPlant.areaOccupiedSqM} m²</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Status:</span>
                    <span className="info-value">{selectedPlant.status}</span>
                  </div>
                </div>

                <div className="cost-categories">
                  {/* 1. Land Preparation */}
                  <div className="cost-category">
                    <div className="category-header">
                      <span className="category-icon">🌾</span>
                      <h3 className="category-title">1. Land Preparation</h3>
                      <span className="category-total">₱{calculateCategoryTotal(costs.landPreparation).toLocaleString()}</span>
                    </div>
                    <div className="category-inputs">
                      <input type="number" placeholder="Land clearing" value={costs.landPreparation.clearing} 
                        onChange={(e) => handleCostChange('landPreparation', 'clearing', e.target.value)} />
                      <input type="number" placeholder="Plowing" value={costs.landPreparation.plowing}
                        onChange={(e) => handleCostChange('landPreparation', 'plowing', e.target.value)} />
                      <input type="number" placeholder="Harrowing/Leveling" value={costs.landPreparation.harrowing}
                        onChange={(e) => handleCostChange('landPreparation', 'harrowing', e.target.value)} />
                      <input type="number" placeholder="Greenhouse setup" value={costs.landPreparation.greenhouseSetup}
                        onChange={(e) => handleCostChange('landPreparation', 'greenhouseSetup', e.target.value)} />
                      <input type="number" placeholder="Irrigation setup" value={costs.landPreparation.irrigationSetup}
                        onChange={(e) => handleCostChange('landPreparation', 'irrigationSetup', e.target.value)} />
                      <input type="number" placeholder="Labor" value={costs.landPreparation.labor}
                        onChange={(e) => handleCostChange('landPreparation', 'labor', e.target.value)} />
                    </div>
                  </div>

                  {/* 2. Planting Materials */}
                  <div className="cost-category">
                    <div className="category-header">
                      <span className="category-icon">🌱</span>
                      <h3 className="category-title">2. Planting Materials</h3>
                      <span className="category-total">₱{calculateCategoryTotal(costs.plantingMaterials).toLocaleString()}</span>
                    </div>
                    <div className="category-inputs">
                      <input type="number" placeholder="Seeds" value={costs.plantingMaterials.seeds}
                        onChange={(e) => handleCostChange('plantingMaterials', 'seeds', e.target.value)} />
                      <input type="number" placeholder="Seedlings" value={costs.plantingMaterials.seedlings}
                        onChange={(e) => handleCostChange('plantingMaterials', 'seedlings', e.target.value)} />
                      <input type="number" placeholder="Seed treatment" value={costs.plantingMaterials.seedTreatment}
                        onChange={(e) => handleCostChange('plantingMaterials', 'seedTreatment', e.target.value)} />
                      <input type="number" placeholder="Nursery materials" value={costs.plantingMaterials.nurseryMaterials}
                        onChange={(e) => handleCostChange('plantingMaterials', 'nurseryMaterials', e.target.value)} />
                      <input type="number" placeholder="Transportation" value={costs.plantingMaterials.transportation}
                        onChange={(e) => handleCostChange('plantingMaterials', 'transportation', e.target.value)} />
                    </div>
                  </div>

                  {/* 3. Input Costs */}
                  <div className="cost-category">
                    <div className="category-header">
                      <span className="category-icon">💧</span>
                      <h3 className="category-title">3. Input Costs</h3>
                      <span className="category-total">₱{calculateCategoryTotal(costs.inputs).toLocaleString()}</span>
                    </div>
                    <div className="category-inputs">
                      <input type="number" placeholder="Fertilizers" value={costs.inputs.fertilizers}
                        onChange={(e) => handleCostChange('inputs', 'fertilizers', e.target.value)} />
                      <input type="number" placeholder="Pesticides" value={costs.inputs.pesticides}
                        onChange={(e) => handleCostChange('inputs', 'pesticides', e.target.value)} />
                      <input type="number" placeholder="Herbicides" value={costs.inputs.herbicides}
                        onChange={(e) => handleCostChange('inputs', 'herbicides', e.target.value)} />
                      <input type="number" placeholder="Growth regulators" value={costs.inputs.growthRegulators}
                        onChange={(e) => handleCostChange('inputs', 'growthRegulators', e.target.value)} />
                      <input type="number" placeholder="Compost" value={costs.inputs.compost}
                        onChange={(e) => handleCostChange('inputs', 'compost', e.target.value)} />
                      <input type="number" placeholder="Mulch" value={costs.inputs.mulch}
                        onChange={(e) => handleCostChange('inputs', 'mulch', e.target.value)} />
                      <input type="number" placeholder="Soil conditioners" value={costs.inputs.soilConditioners}
                        onChange={(e) => handleCostChange('inputs', 'soilConditioners', e.target.value)} />
                    </div>
                  </div>

                  {/* 4. Labor Costs */}
                  <div className="cost-category">
                    <div className="category-header">
                      <span className="category-icon">👨‍🌾</span>
                      <h3 className="category-title">4. Labor Costs</h3>
                      <span className="category-total">₱{calculateCategoryTotal(costs.labor).toLocaleString()}</span>
                    </div>
                    <div className="category-inputs">
                      <input type="number" placeholder="Planting" value={costs.labor.planting}
                        onChange={(e) => handleCostChange('labor', 'planting', e.target.value)} />
                      <input type="number" placeholder="Watering" value={costs.labor.watering}
                        onChange={(e) => handleCostChange('labor', 'watering', e.target.value)} />
                      <input type="number" placeholder="Weeding" value={costs.labor.weeding}
                        onChange={(e) => handleCostChange('labor', 'weeding', e.target.value)} />
                      <input type="number" placeholder="Pest control" value={costs.labor.pestControl}
                        onChange={(e) => handleCostChange('labor', 'pestControl', e.target.value)} />
                      <input type="number" placeholder="Maintenance" value={costs.labor.maintenance}
                        onChange={(e) => handleCostChange('labor', 'maintenance', e.target.value)} />
                      <input type="number" placeholder="Harvesting" value={costs.labor.harvesting}
                        onChange={(e) => handleCostChange('labor', 'harvesting', e.target.value)} />
                      <input type="number" placeholder="Post-harvest handling" value={costs.labor.postHarvest}
                        onChange={(e) => handleCostChange('labor', 'postHarvest', e.target.value)} />
                    </div>
                  </div>

                  {/* 5. Equipment & Machinery */}
                  <div className="cost-category">
                    <div className="category-header">
                      <span className="category-icon">⚙️</span>
                      <h3 className="category-title">5. Equipment & Machinery</h3>
                      <span className="category-total">₱{calculateCategoryTotal(costs.equipment).toLocaleString()}</span>
                    </div>
                    <div className="category-inputs">
                      <input type="number" placeholder="Depreciation" value={costs.equipment.depreciation}
                        onChange={(e) => handleCostChange('equipment', 'depreciation', e.target.value)} />
                      <input type="number" placeholder="Rental" value={costs.equipment.rental}
                        onChange={(e) => handleCostChange('equipment', 'rental', e.target.value)} />
                      <input type="number" placeholder="Fuel" value={costs.equipment.fuel}
                        onChange={(e) => handleCostChange('equipment', 'fuel', e.target.value)} />
                      <input type="number" placeholder="Maintenance" value={costs.equipment.maintenance}
                        onChange={(e) => handleCostChange('equipment', 'maintenance', e.target.value)} />
                      <input type="number" placeholder="Small tools" value={costs.equipment.smallTools}
                        onChange={(e) => handleCostChange('equipment', 'smallTools', e.target.value)} />
                    </div>
                  </div>

                  {/* 6. Irrigation & Water */}
                  <div className="cost-category">
                    <div className="category-header">
                      <span className="category-icon">🚿</span>
                      <h3 className="category-title">6. Irrigation & Water</h3>
                      <span className="category-total">₱{calculateCategoryTotal(costs.irrigation).toLocaleString()}</span>
                    </div>
                    <div className="category-inputs">
                      <input type="number" placeholder="Water source development" value={costs.irrigation.waterSource}
                        onChange={(e) => handleCostChange('irrigation', 'waterSource', e.target.value)} />
                      <input type="number" placeholder="Electricity" value={costs.irrigation.electricity}
                        onChange={(e) => handleCostChange('irrigation', 'electricity', e.target.value)} />
                      <input type="number" placeholder="Pump maintenance" value={costs.irrigation.pumpMaintenance}
                        onChange={(e) => handleCostChange('irrigation', 'pumpMaintenance', e.target.value)} />
                      <input type="number" placeholder="System maintenance" value={costs.irrigation.systemMaintenance}
                        onChange={(e) => handleCostChange('irrigation', 'systemMaintenance', e.target.value)} />
                    </div>
                  </div>

                  {/* 7. Harvesting & Post-Harvest */}
                  <div className="cost-category">
                    <div className="category-header">
                      <span className="category-icon">🧺</span>
                      <h3 className="category-title">7. Harvesting & Post-Harvest</h3>
                      <span className="category-total">₱{calculateCategoryTotal(costs.harvesting).toLocaleString()}</span>
                    </div>
                    <div className="category-inputs">
                      <input type="number" placeholder="Harvest labor" value={costs.harvesting.harvestLabor}
                        onChange={(e) => handleCostChange('harvesting', 'harvestLabor', e.target.value)} />
                      <input type="number" placeholder="Packaging materials" value={costs.harvesting.packagingMaterials}
                        onChange={(e) => handleCostChange('harvesting', 'packagingMaterials', e.target.value)} />
                      <input type="number" placeholder="Cleaning" value={costs.harvesting.cleaning}
                        onChange={(e) => handleCostChange('harvesting', 'cleaning', e.target.value)} />
                      <input type="number" placeholder="Sorting & grading" value={costs.harvesting.sorting}
                        onChange={(e) => handleCostChange('harvesting', 'sorting', e.target.value)} />
                      <input type="number" placeholder="Storage" value={costs.harvesting.storage}
                        onChange={(e) => handleCostChange('harvesting', 'storage', e.target.value)} />
                      <input type="number" placeholder="Transport" value={costs.harvesting.transport}
                        onChange={(e) => handleCostChange('harvesting', 'transport', e.target.value)} />
                    </div>
                  </div>

                  {/* 8. Overhead */}
                  <div className="cost-category">
                    <div className="category-header">
                      <span className="category-icon">🏢</span>
                      <h3 className="category-title">8. Overhead</h3>
                      <span className="category-total">₱{calculateCategoryTotal(costs.overhead).toLocaleString()}</span>
                    </div>
                    <div className="category-inputs">
                      <input type="number" placeholder="Administration" value={costs.overhead.administration}
                        onChange={(e) => handleCostChange('overhead', 'administration', e.target.value)} />
                      <input type="number" placeholder="Management" value={costs.overhead.management}
                        onChange={(e) => handleCostChange('overhead', 'management', e.target.value)} />
                      <input type="number" placeholder="Repairs" value={costs.overhead.repairs}
                        onChange={(e) => handleCostChange('overhead', 'repairs', e.target.value)} />
                      <input type="number" placeholder="Insurance" value={costs.overhead.insurance}
                        onChange={(e) => handleCostChange('overhead', 'insurance', e.target.value)} />
                      <input type="number" placeholder="Taxes" value={costs.overhead.taxes}
                        onChange={(e) => handleCostChange('overhead', 'taxes', e.target.value)} />
                      <input type="number" placeholder="Permits" value={costs.overhead.permits}
                        onChange={(e) => handleCostChange('overhead', 'permits', e.target.value)} />
                    </div>
                  </div>

                  {/* 9. Marketing */}
                  <div className="cost-category">
                    <div className="category-header">
                      <span className="category-icon">💰</span>
                      <h3 className="category-title">9. Marketing & Distribution</h3>
                      <span className="category-total">₱{calculateCategoryTotal(costs.marketing).toLocaleString()}</span>
                    </div>
                    <div className="category-inputs">
                      <input type="number" placeholder="Transport to market" value={costs.marketing.transportToMarket}
                        onChange={(e) => handleCostChange('marketing', 'transportToMarket', e.target.value)} />
                      <input type="number" placeholder="Market fees" value={costs.marketing.marketFees}
                        onChange={(e) => handleCostChange('marketing', 'marketFees', e.target.value)} />
                      <input type="number" placeholder="Commission" value={costs.marketing.commission}
                        onChange={(e) => handleCostChange('marketing', 'commission', e.target.value)} />
                      <input type="number" placeholder="Advertising" value={costs.marketing.advertising}
                        onChange={(e) => handleCostChange('marketing', 'advertising', e.target.value)} />
                    </div>
                  </div>

                  {/* 10. Contingency */}
                  <div className="cost-category">
                    <div className="category-header">
                      <span className="category-icon">📊</span>
                      <h3 className="category-title">10. Contingency</h3>
                      <span className="category-total">₱{calculateCategoryTotal(costs.contingency).toLocaleString()}</span>
                    </div>
                    <div className="category-inputs">
                      <input type="number" placeholder="Emergency fund" value={costs.contingency.emergencyFund}
                        onChange={(e) => handleCostChange('contingency', 'emergencyFund', e.target.value)} />
                      <input type="number" placeholder="Weather damage reserve" value={costs.contingency.weatherDamage}
                        onChange={(e) => handleCostChange('contingency', 'weatherDamage', e.target.value)} />
                      <input type="number" placeholder="Pest outbreak reserve" value={costs.contingency.pestOutbreak}
                        onChange={(e) => handleCostChange('contingency', 'pestOutbreak', e.target.value)} />
                    </div>
                  </div>
                </div>

                <div className="cost-summary">
                  <div className="summary-row">
                    <span className="summary-label">Total Production Cost:</span>
                    <span className="summary-value grand-total">₱{calculateGrandTotal().toLocaleString()}</span>
                  </div>
                  <div className="summary-row">
                    <span className="summary-label">Cost per m²:</span>
                    <span className="summary-value">₱{(calculateGrandTotal() / (selectedPlant.areaOccupiedSqM || 1)).toFixed(2)}</span>
                  </div>
                  <div className="summary-row">
                    <span className="summary-label">Estimated Yield:</span>
                    <span className="summary-value">{selectedPlant.totalEstimatedYield || selectedPlant.initialSeedQuantity || 0} kg</span>
                  </div>
                  <div className="summary-row">
                    <span className="summary-label">Cost per Unit:</span>
                    <span className="summary-value">
                      ₱{((selectedPlant.totalEstimatedYield || selectedPlant.initialSeedQuantity) > 0 
                        ? calculateGrandTotal() / (selectedPlant.totalEstimatedYield || selectedPlant.initialSeedQuantity) 
                        : 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="production-modal-footer">
                <button className="production-modal-btn cancel-btn" onClick={() => setShowCostingModal(false)}>Cancel</button>
                <button className="production-modal-btn save-btn" onClick={handleSaveCosting}>Save Costing</button>
              </div>
            </div>
          </div>
        )}

        {/* View Costing Modal */}
        {showViewModal && costingData && (
          <div className="production-modal-overlay" onClick={() => setShowViewModal(false)}>
            <div className="production-modal view-modal" onClick={(e) => e.stopPropagation()}>
              <div className="production-modal-header">
                <h2 className="production-modal-title">📊 Production Cost Details - {costingData.plantName}</h2>
                <button className="production-modal-close" onClick={() => setShowViewModal(false)}>✕</button>
              </div>

              <div className="production-modal-body">
                <div className="summary-cards">
                  <div className="summary-card">
                    <span className="card-icon">💰</span>
                    <div className="card-content">
                      <p className="card-label">Total Cost</p>
                      <p className="card-value">₱{costingData.totalCost?.toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="summary-card">
                    <span className="card-icon">📏</span>
                    <div className="card-content">
                      <p className="card-label">Cost per m²</p>
                      <p className="card-value">₱{costingData.costPerSqm?.toFixed(2)}</p>
                    </div>
                  </div>
                  <div className="summary-card">
                    <span className="card-icon">📦</span>
                    <div className="card-content">
                      <p className="card-label">Cost per Unit</p>
                      <p className="card-value">₱{costingData.costPerUnit?.toFixed(2)}</p>
                    </div>
                  </div>
                  <div className="summary-card">
                    <span className="card-icon">🌾</span>
                    <div className="card-content">
                      <p className="card-label">Est. Yield</p>
                      <p className="card-value">{costingData.estimatedYield} kg</p>
                    </div>
                  </div>
                </div>

                {costingData.createdBy && (
                  <div style={{ background: '#f3f4f6', padding: '12px', borderRadius: '8px', marginBottom: '20px', fontSize: '14px', color: '#6b7280' }}>
                    <strong>Created by:</strong> {costingData.createdBy.toUpperCase()}
                    {costingData.lastModifiedBy && costingData.lastModifiedBy !== costingData.createdBy && (
                      <span style={{ marginLeft: '20px' }}>
                        <strong>Last modified by:</strong> {costingData.lastModifiedBy.toUpperCase()}
                      </span>
                    )}
                  </div>
                )}

                <div className="breakdown-section">
                  <h3 className="section-title">Cost Breakdown by Category</h3>
                  <div className="breakdown-list">
                    {Object.entries(costingData.breakdown || {}).map(([key, value]) => {
                      const percentage = (value / (costingData.totalCost || 1) * 100).toFixed(1)
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
                            <div className="breakdown-fill" style={{ width: `${percentage}%` }} />
                          </div>
                          <span className="breakdown-percentage">{percentage}%</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>

              <div className="production-modal-footer">
                <button className="production-modal-btn save-btn" onClick={() => setShowViewModal(false)}>Close</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default PlantProduction