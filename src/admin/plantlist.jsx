import React, { useState } from 'react'
import Sidebar from './sidebar'
import './plantlist.css'

const PlantList = ({ userType = 'admin' }) => {
  const [activeMenu, setActiveMenu] = useState('PlantList')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedPlant, setSelectedPlant] = useState(null)
  const [showModal, setShowModal] = useState(false)

  // Plant database with comprehensive information
  const plantsDatabase = [
    {
      id: 1,
      name: 'Lettuce',
      scientificName: 'Lactuca sativa',
      daysToHarvest: 30,
      pricing: '₱80-120',
      unit: 'per kilo',
      spacing: '20-25 cm',
      description: 'Cool-season leafy green vegetable',
      stages: [
        {
          stage: 'Seeding',
          duration: '5-7 days',
          watering: 'Keep soil consistently moist, water 2-3 times daily with misting',
          N: 12,
          P: 15,
          K: 1200,
          temperature: '18-22°C',
          ec: '0.8-1.2 mS/cm',
          humidity: '70-80%',
          pH: '6.0-6.5',
          notes: 'Maintain high humidity for germination'
        },
        {
          stage: 'Seedling',
          duration: '7-10 days',
          watering: 'Water once daily in morning, avoid overhead watering',
          N: 15,
          P: 18,
          K: 1400,
          temperature: '16-20°C',
          ec: '1.2-1.5 mS/cm',
          humidity: '65-75%',
          pH: '6.0-6.5',
          notes: 'Provide 12-14 hours of light daily'
        },
        {
          stage: 'Growing',
          duration: '10-15 days',
          watering: 'Water once daily, ensure good drainage',
          N: 18,
          P: 20,
          K: 1600,
          temperature: '15-18°C',
          ec: '1.5-2.0 mS/cm',
          humidity: '60-70%',
          pH: '6.0-7.0',
          notes: 'Monitor for tip burn, increase air circulation'
        },
        {
          stage: 'Harvesting',
          duration: '5-8 days',
          watering: 'Reduce watering frequency before harvest',
          N: 10,
          P: 15,
          K: 1500,
          temperature: '12-16°C',
          ec: '1.2-1.5 mS/cm',
          humidity: '60-65%',
          pH: '6.0-6.5',
          notes: 'Harvest in early morning for best quality'
        }
      ]
    },
    {
      id: 2,
      name: 'Cabbage',
      scientificName: 'Brassica oleracea',
      daysToHarvest: 70,
      pricing: '₱60-80',
      unit: 'per kilo',
      spacing: '40-50 cm',
      description: 'Cool-season cruciferous vegetable',
      stages: [
        {
          stage: 'Seeding',
          duration: '7-10 days',
          watering: 'Keep soil moist, water 2 times daily',
          N: 14,
          P: 18,
          K: 1300,
          temperature: '20-24°C',
          ec: '1.0-1.5 mS/cm',
          humidity: '70-80%',
          pH: '6.0-6.8',
          notes: 'Seeds germinate best in warm conditions'
        },
        {
          stage: 'Seedling',
          duration: '14-21 days',
          watering: 'Water daily, maintain consistent moisture',
          N: 18,
          P: 20,
          K: 1500,
          temperature: '18-22°C',
          ec: '1.5-2.0 mS/cm',
          humidity: '65-75%',
          pH: '6.5-7.0',
          notes: 'Gradually acclimate to outdoor conditions'
        },
        {
          stage: 'Growing',
          duration: '35-42 days',
          watering: 'Deep watering 2-3 times per week',
          N: 22,
          P: 25,
          K: 1800,
          temperature: '15-20°C',
          ec: '2.0-2.5 mS/cm',
          humidity: '60-70%',
          pH: '6.5-7.0',
          notes: 'Heavy feeder, requires consistent nutrients'
        },
        {
          stage: 'Head Formation',
          duration: '14-21 days',
          watering: 'Consistent watering critical for head development',
          N: 18,
          P: 22,
          K: 2000,
          temperature: '13-18°C',
          ec: '2.0-2.5 mS/cm',
          humidity: '60-65%',
          pH: '6.5-7.0',
          notes: 'Avoid water stress to prevent splitting'
        },
        {
          stage: 'Harvesting',
          duration: '7-10 days',
          watering: 'Reduce watering as harvest approaches',
          N: 12,
          P: 15,
          K: 1600,
          temperature: '10-15°C',
          ec: '1.5-2.0 mS/cm',
          humidity: '55-65%',
          pH: '6.5-7.0',
          notes: 'Harvest when heads are firm and solid'
        }
      ]
    },
    {
      id: 3,
      name: 'Bokchoy',
      scientificName: 'Brassica rapa subsp. chinensis',
      daysToHarvest: 45,
      pricing: '₱100-150',
      unit: 'per kilo',
      spacing: '15-20 cm',
      description: 'Asian leafy green vegetable',
      stages: [
        {
          stage: 'Seeding',
          duration: '5-7 days',
          watering: 'Keep soil moist, water 2-3 times daily',
          N: 13,
          P: 16,
          K: 1250,
          temperature: '18-22°C',
          ec: '1.0-1.4 mS/cm',
          humidity: '70-80%',
          pH: '6.0-7.0',
          notes: 'Fast germination in warm conditions'
        },
        {
          stage: 'Seedling',
          duration: '10-14 days',
          watering: 'Water daily in morning',
          N: 16,
          P: 19,
          K: 1450,
          temperature: '16-20°C',
          ec: '1.4-1.8 mS/cm',
          humidity: '65-75%',
          pH: '6.0-7.0',
          notes: 'Thin seedlings to proper spacing'
        },
        {
          stage: 'Growing',
          duration: '20-28 days',
          watering: 'Regular watering, 1-2 times daily',
          N: 19,
          P: 22,
          K: 1700,
          temperature: '15-20°C',
          ec: '1.8-2.2 mS/cm',
          humidity: '60-70%',
          pH: '6.5-7.0',
          notes: 'Fast-growing, monitor for pests'
        },
        {
          stage: 'Harvesting',
          duration: '5-7 days',
          watering: 'Maintain consistent moisture',
          N: 14,
          P: 17,
          K: 1500,
          temperature: '12-18°C',
          ec: '1.5-2.0 mS/cm',
          humidity: '60-65%',
          pH: '6.5-7.0',
          notes: 'Harvest when leaves are tender'
        }
      ]
    },
    {
      id: 4,
      name: 'Tomato',
      scientificName: 'Solanum lycopersicum',
      daysToHarvest: 75,
      pricing: '₱80-120',
      unit: 'per kilo',
      spacing: '60-90 cm',
      description: 'Warm-season fruiting vegetable',
      stages: [
        {
          stage: 'Seeding',
          duration: '7-14 days',
          watering: 'Keep soil moist, water 2 times daily',
          N: 12,
          P: 15,
          K: 1200,
          temperature: '24-27°C',
          ec: '1.0-1.5 mS/cm',
          humidity: '70-80%',
          pH: '6.0-6.5',
          notes: 'Warm soil accelerates germination'
        },
        {
          stage: 'Seedling',
          duration: '14-21 days',
          watering: 'Water daily, avoid overwatering',
          N: 15,
          P: 18,
          K: 1400,
          temperature: '22-26°C',
          ec: '1.5-2.0 mS/cm',
          humidity: '65-75%',
          pH: '6.0-6.5',
          notes: 'Provide adequate light to prevent legginess'
        },
        {
          stage: 'Growing',
          duration: '21-28 days',
          watering: 'Deep watering 2-3 times per week',
          N: 18,
          P: 20,
          K: 1600,
          temperature: '20-26°C',
          ec: '2.0-2.5 mS/cm',
          humidity: '60-70%',
          pH: '6.0-6.8',
          notes: 'Support plants with stakes or cages'
        },
        {
          stage: 'Flowering',
          duration: '10-14 days',
          watering: 'Consistent watering, avoid water stress',
          N: 15,
          P: 25,
          K: 1800,
          temperature: '18-24°C',
          ec: '2.5-3.0 mS/cm',
          humidity: '55-65%',
          pH: '6.0-6.5',
          notes: 'Critical for fruit set, gentle shaking helps pollination'
        },
        {
          stage: 'Fruiting',
          duration: '21-35 days',
          watering: 'Regular watering, maintain even moisture',
          N: 12,
          P: 22,
          K: 2000,
          temperature: '20-26°C',
          ec: '2.5-3.5 mS/cm',
          humidity: '55-65%',
          pH: '6.0-6.5',
          notes: 'High potassium for fruit development'
        },
        {
          stage: 'Harvesting',
          duration: '14-21 days',
          watering: 'Reduce watering slightly for flavor concentration',
          N: 10,
          P: 15,
          K: 1800,
          temperature: '18-24°C',
          ec: '2.0-2.5 mS/cm',
          humidity: '50-60%',
          pH: '6.0-6.5',
          notes: 'Harvest when fully colored but still firm'
        }
      ]
    },
    {
      id: 5,
      name: 'Celery',
      scientificName: 'Apium graveolens',
      daysToHarvest: 85,
      pricing: '₱150-200',
      unit: 'per kilo',
      spacing: '20-25 cm',
      description: 'Cool-season vegetable requiring consistent moisture',
      stages: [
        {
          stage: 'Seeding',
          duration: '14-21 days',
          watering: 'Keep constantly moist, water 3 times daily with misting',
          N: 11,
          P: 14,
          K: 1150,
          temperature: '18-21°C',
          ec: '0.8-1.2 mS/cm',
          humidity: '75-85%',
          pH: '6.0-6.5',
          notes: 'Slow germination, requires patience and consistent moisture'
        },
        {
          stage: 'Seedling',
          duration: '21-28 days',
          watering: 'Water daily, never let soil dry out',
          N: 14,
          P: 17,
          K: 1350,
          temperature: '16-19°C',
          ec: '1.2-1.6 mS/cm',
          humidity: '70-80%',
          pH: '6.0-6.5',
          notes: 'Very sensitive to water stress'
        },
        {
          stage: 'Growing',
          duration: '35-42 days',
          watering: 'Consistent watering critical, 1-2 times daily',
          N: 17,
          P: 20,
          K: 1600,
          temperature: '15-18°C',
          ec: '1.6-2.2 mS/cm',
          humidity: '65-75%',
          pH: '6.5-7.0',
          notes: 'Heavy feeder, requires rich soil'
        },
        {
          stage: 'Stalk Development',
          duration: '14-21 days',
          watering: 'Maintain even moisture for tender stalks',
          N: 19,
          P: 22,
          K: 1800,
          temperature: '13-16°C',
          ec: '2.0-2.5 mS/cm',
          humidity: '65-70%',
          pH: '6.5-7.0',
          notes: 'Blanch stalks for milder flavor if desired'
        },
        {
          stage: 'Harvesting',
          duration: '7-14 days',
          watering: 'Continue regular watering until harvest',
          N: 13,
          P: 16,
          K: 1500,
          temperature: '10-15°C',
          ec: '1.8-2.2 mS/cm',
          humidity: '60-70%',
          pH: '6.5-7.0',
          notes: 'Harvest when stalks are full-sized and firm'
        }
      ]
    }
  ]

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
      'Seeding': '#FF6B6B',
      'Seedling': '#4ECDC4',
      'Growing': '#45B7D1',
      'Flowering': '#96CEB4',
      'Fruiting': '#FECA57',
      'Head Formation': '#48CAE4',
      'Stalk Development': '#A8E6CF',
      'Harvesting': '#6C5CE7'
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

          {/* Table */}
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
                      No plants found matching "{searchTerm}"
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

export default PlantList