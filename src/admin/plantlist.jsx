    import React, { useState, useEffect } from 'react'
    import { collection, getDocs } from 'firebase/firestore'
    import { db } from '../firebase' // Make sure this path matches your firebase config file
    import Sidebar from './sidebar'
    import './plantlist.css'

    const PlantMasterList = ({ userType = 'admin' }) => {
    const [activeMenu, setActiveMenu] = useState('PlantList')
    const [searchTerm, setSearchTerm] = useState('')
    const [selectedPlant, setSelectedPlant] = useState(null)
    const [showModal, setShowModal] = useState(false)
    const [plantsDatabase, setPlantsDatabase] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    // Fetch plants from Firebase Firestore
    useEffect(() => {
        const fetchPlants = async () => {
        try {
            setLoading(true)
            const plantsRef = collection(db, 'plantsList')
            const querySnapshot = await getDocs(plantsRef)
            
            const plantsData = []
            let idCounter = 1
            
            querySnapshot.forEach((doc) => {
            const data = doc.data()
            
            // Transform Firestore data to match component format
            const plantData = {
                id: idCounter++,
                name: data.name || '',
                scientificName: data.sName || '',
                daysToHarvest: data.daysToHarvest || 0,
                pricing: data.pricing ? `₱${data.pricing}` : '',
                unit: data.pricingUnit || '',
                spacing: `${data.minSpacingCM || ''}-${data.maxSpacingCM || ''} cm`,
                description: data.description || '',
                stages: data.stages ? data.stages.map(stage => ({
                stage: stage.stage || '',
                duration: `Day ${stage.startDuration || 0}-${stage.endDuration || 0}`,
                watering: stage.watering || '',
                N: `${stage.lowN || 0}-${stage.highN || 0}`,
                P: `${stage.lowP || 0}-${stage.highP || 0}`,
                K: `${stage.lowK || 0}-${stage.highK || 0}`,
                temperature: `${stage.lowTemp || 0}-${stage.highTemp || 0}°C`,
                ec: `${stage.lowEc || 0}-${stage.highEc || 0} mS/cm`,
                humidity: `${stage.lowHum || 0}-${stage.highHum || 0}%`,
                pH: `${stage.lowpH || 0}-${stage.highpH || 0}`,
                notes: stage.notes || ''
                })) : []
            }
            
            plantsData.push(plantData)
            })
            
            setPlantsDatabase(plantsData)
            setError(null)
        } catch (err) {
            console.error('Error fetching plants:', err)
            setError('Failed to load plant data. Please try again later.')
        } finally {
            setLoading(false)
        }
        }

        fetchPlants()
    }, [])

    // Filter plants based on search
    const filteredPlants = plantsDatabase.filter(plant =>
        plant.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        plant.scientificName.toLowerCase().includes(searchTerm.toLowerCase())
    )

    const handleRowClick = (plant) => {
        setSelectedPlant(plant)
        setShowModal(true)
    }

    const handleCloseModal = () => {
        setShowModal(false)
        setSelectedPlant(null)
    }

    const getStageColor = (stage) => {
        const colors = {
        'Germination': '#FF6B6B',
        'Seedling': '#4ECDC4',
        'Vegetative Growth': '#45B7D1',
        'Flowering': '#96CEB4',
        'Fruit Development': '#FECA57',
        'Head Formation': '#48CAE4',
        'Stalk Development': '#A8E6CF',
        'Maturation & Harvest': '#6C5CE7',
        'Ripening & Harvest': '#FD79A8',
        'Harvest': '#A29BFE'
        }
        return colors[stage] || '#95A5A6'
    }

    return (
        <div className="dashboard-container">
        <Sidebar 
            activeMenu={activeMenu}
            setActiveMenu={setActiveMenu}
            userType={userType}
        />

        <div className="plantlist-main">
            {/* Header */}
            <div className="plantlist-header">
            <h1 className="plantlist-title">Plant Database</h1>
            <div className="plantlist-header-actions">
                <div className="plantlist-search-box">
                <input
                    type="text"
                    placeholder="Search plants..."
                    className="plantlist-search"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
                <span className="plantlist-search-icon">🔍</span>
                </div>
                <div className="plantlist-bell">🔔</div>
            </div>
            </div>

            {/* Content */}
            <div className="plantlist-body">
            <div className="plantlist-info-card">
                <p>📚 Comprehensive plant database with growth requirements for each stage</p>
            </div>

            {/* Loading State */}
            {loading && (
                <div style={{ textAlign: 'center', padding: '40px', fontSize: '18px' }}>
                Loading plant data...
                </div>
            )}

            {/* Error State */}
            {error && (
                <div style={{ 
                backgroundColor: '#fee', 
                color: '#c33', 
                padding: '20px', 
                borderRadius: '8px', 
                marginBottom: '20px',
                textAlign: 'center'
                }}>
                {error}
                </div>
            )}

            {/* Table */}
            {!loading && !error && (
                <div className="plantlist-table-container">
                <table className="plantlist-table">
                    <thead>
                    <tr>
                        <th>Plant Name</th>
                        <th>Scientific Name</th>
                        <th>Days to Harvest</th>
                        <th>Pricing</th>
                        <th>Spacing</th>
                        <th>Description</th>
                    </tr>
                    </thead>
                    <tbody>
                    {filteredPlants.length === 0 ? (
                        <tr>
                        <td colSpan="6" className="no-data">
                            {searchTerm 
                            ? `No plants found matching "${searchTerm}"`
                            : 'No plants available in database'
                            }
                        </td>
                        </tr>
                    ) : (
                        filteredPlants.map((plant) => (
                        <tr 
                            key={plant.id} 
                            onClick={() => handleRowClick(plant)}
                            className="plantlist-row"
                        >
                            <td className="plant-name-cell">
                            <span className="plant-name">{plant.name}</span>
                            </td>
                            <td className="scientific-name">{plant.scientificName}</td>
                            <td>{plant.daysToHarvest} days</td>
                            <td>{plant.pricing} {plant.unit}</td>
                            <td>{plant.spacing}</td>
                            <td className="description">{plant.description}</td>
                        </tr>
                        ))
                    )}
                    </tbody>
                </table>
                </div>
            )}
            </div>

            {/* Modal */}
            {showModal && selectedPlant && (
            <div className="plantlist-modal-overlay" onClick={handleCloseModal}>
                <div className="plantlist-modal" onClick={(e) => e.stopPropagation()}>
                <div className="plantlist-modal-header">
                    <div>
                    <h2 className="plantlist-modal-title">{selectedPlant.name}</h2>
                    <p className="plantlist-modal-subtitle">{selectedPlant.scientificName}</p>
                    </div>
                    <button className="plantlist-modal-close" onClick={handleCloseModal}>✕</button>
                </div>
                
                <div className="plantlist-modal-body">
                    {/* General Info */}
                    <div className="modal-info-grid">
                    <div className="info-item">
                        <span className="info-label">Days to Harvest:</span>
                        <span className="info-value">{selectedPlant.daysToHarvest} days</span>
                    </div>
                    <div className="info-item">
                        <span className="info-label">Pricing:</span>
                        <span className="info-value">{selectedPlant.pricing} {selectedPlant.unit}</span>
                    </div>
                    <div className="info-item">
                        <span className="info-label">Spacing:</span>
                        <span className="info-value">{selectedPlant.spacing}</span>
                    </div>
                    <div className="info-item">
                        <span className="info-label">Description:</span>
                        <span className="info-value">{selectedPlant.description}</span>
                    </div>
                    </div>

                    {/* Stage-by-Stage Requirements */}
                    <h3 className="stages-title">Growth Stage Requirements</h3>
                    <div className="stages-container">
                    {selectedPlant.stages.map((stage, index) => (
                        <div key={index} className="stage-card">
                        <div 
                            className="stage-header" 
                            style={{ backgroundColor: getStageColor(stage.stage) }}
                        >
                            <h4>{stage.stage}</h4>
                            <span className="stage-duration">{stage.duration}</span>
                        </div>
                        
                        <div className="stage-body">
                            <div className="stage-section">
                            <h5>💧 Watering</h5>
                            <p>{stage.watering}</p>
                            </div>

                            <div className="stage-section">
                            <h5>🌱 NPK Requirements</h5>
                            <div className="npk-grid">
                                <div className="npk-item">
                                <span className="npk-label">Nitrogen (N):</span>
                                <span className="npk-value">{stage.N} ppm</span>
                                </div>
                                <div className="npk-item">
                                <span className="npk-label">Phosphorus (P):</span>
                                <span className="npk-value">{stage.P} ppm</span>
                                </div>
                                <div className="npk-item">
                                <span className="npk-label">Potassium (K):</span>
                                <span className="npk-value">{stage.K} ppm</span>
                                </div>
                            </div>
                            </div>

                            <div className="stage-section">
                            <h5>🌡️ Environmental Conditions</h5>
                            <div className="conditions-grid">
                                <div className="condition-item">
                                <span className="condition-label">Temperature:</span>
                                <span className="condition-value">{stage.temperature}</span>
                                </div>
                                <div className="condition-item">
                                <span className="condition-label">EC:</span>
                                <span className="condition-value">{stage.ec}</span>
                                </div>
                                <div className="condition-item">
                                <span className="condition-label">Humidity:</span>
                                <span className="condition-value">{stage.humidity}</span>
                                </div>
                                <div className="condition-item">
                                <span className="condition-label">pH:</span>
                                <span className="condition-value">{stage.pH}</span>
                                </div>
                            </div>
                            </div>

                            {stage.notes && (
                            <div className="stage-section">
                                <h5>📝 Notes</h5>
                                <p className="stage-notes">{stage.notes}</p>
                            </div>
                            )}
                        </div>
                        </div>
                    ))}
                    </div>
                </div>

                <div className="plantlist-modal-footer">
                    <button className="btn-close" onClick={handleCloseModal}>Close</button>
                </div>
                </div>
            </div>
            )}
        </div>
        </div>
    )
    }

    export default PlantMasterList