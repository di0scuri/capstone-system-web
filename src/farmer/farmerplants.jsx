import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, doc, updateDoc, query, where, orderBy, limit } from 'firebase/firestore';
import { ref as dbRef, get } from 'firebase/database';
import { db, storage } from '../firebase'; // Updated to include both db and storage
import FarmerSidebar from './farmersidebar';
import './farmerplants.css';

const FarmerPlants = () => {
  const [plants, setPlants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingSensorData, setLoadingSensorData] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPlantDetails, setShowPlantDetails] = useState(false);
  const [selectedPlant, setSelectedPlant] = useState(null);
  const [sensorReadings, setSensorReadings] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeMenu, setActiveMenu] = useState('Plants');
  
  const [newPlant, setNewPlant] = useState({
    name: '',
    seedType: '',
    plot: '',
    quantity: ''
  });

  // Get default plant image based on type
  const getDefaultPlantImage = (plantType) => {
    const imageMap = {
      'Tomato': 'https://images.unsplash.com/photo-1546470427-e5b89543047d?w=400&h=300&fit=crop',
      'Lettuce': 'https://images.unsplash.com/photo-1622206151226-18ca2c9ab4a1?w=400&h=300&fit=crop',
      'Cabbage': 'https://images.unsplash.com/photo-1594282486755-934e41b8849d?w=400&h=300&fit=crop',
      'Pechay': 'https://images.unsplash.com/photo-1576045057995-568f588f82fb?w=400&h=300&fit=crop',
      'Carrots': 'https://images.unsplash.com/photo-1445282768818-728615cc910a?w=400&h=300&fit=crop',
      'Cucumber': 'https://images.unsplash.com/photo-1449300079323-02e209d9d3a6?w=400&h=300&fit=crop'
    };
    
    return imageMap[plantType] || 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=400&h=300&fit=crop';
  };

  // Fetch plant image from Firebase Realtime Database
  const fetchPlantImage = async (imageUrl) => {
    try {
      if (!imageUrl) return getDefaultPlantImage('Unknown');
      
      // If imageUrl is already a full URL, return it
      if (imageUrl.startsWith('http')) {
        return imageUrl;
      }
      
      // If it's a Firebase storage URL, extract the path and fetch from storage
      if (imageUrl.includes('firebaseio.com') || imageUrl.includes('.json')) {
        // Extract path from storage URL
        // Format: https://your-project-default-storage.firebaseio.com/path/to/image.json
        let path = imageUrl;
        if (imageUrl.includes('firebaseio.com')) {
          const urlParts = imageUrl.split('/');
          path = urlParts.slice(3).join('/').replace('.json', '');
        }
        
        const imageRef = dbRef(storage, path);
        const snapshot = await get(imageRef);
        
        if (snapshot.exists()) {
          return snapshot.val();
        }
      }
      
      // If it's just a path, try to get it from storage
      const imageRef = dbRef(storage, imageUrl);
      const snapshot = await get(imageRef);
      
      if (snapshot.exists()) {
        return snapshot.val();
      } else {
        return getDefaultPlantImage('Unknown');
      }
      
    } catch (error) {
      console.error('Error fetching plant image:', error);
      return getDefaultPlantImage('Unknown');
    }
  };

  // Fetch plants from Firestore
  const fetchPlants = async () => {
    try {
      setLoading(true);
      const plantsCollection = collection(db, 'plants');
      const plantsSnapshot = await getDocs(plantsCollection);
      
      const plantsData = await Promise.all(
        plantsSnapshot.docs.map(async (doc) => {
          const data = doc.data();
          
          // Fetch the actual image from storage
          const imageUrl = await fetchPlantImage(data.imageUrl);
          
          return {
            id: doc.id,
            name: data.name || 'Unknown Plant',
            area: `Area: ${data.locationZone || 'Unknown Zone'}`,
            status: `Status: ${data.status || 'Unknown'}`,
            type: data.type || 'Unknown Type',
            datePlanted: data.datePlanted?.toDate ? data.datePlanted.toDate() : new Date(),
            initialSeedQuantity: data.initialSeedQuantity || 0,
            areaOccupiedSqM: data.areaOccupiedSqM || 0,
            ownerUid: data.ownerUid || '',
            seedId: data.seedId || '',
            imageUrl: imageUrl, // This will be the actual image URL from storage
            image: imageUrl || getDefaultPlantImage(data.type || data.name),
            // Initialize with empty sensor data - will be fetched when plant is clicked
            sensorData: {
              temp: '--',
              humidity: '--',
              ph: '--',
              ec: '--',
              nitrogen: '--',
              phosphorus: '--',
              potassium: '--'
            }
          };
        })
      );
      
      setPlants(plantsData);
    } catch (error) {
      console.error('Error fetching plants:', error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch sensor readings for a specific plant
  const fetchSensorReadings = async (plantId) => {
    try {
      setLoadingSensorData(true);
      
      // Query sensor readings for this plant, ordered by timestamp desc
      const sensorQuery = query(
        collection(db, 'sensorReadings'),
        where('plantId', '==', plantId),
        orderBy('timestamp', 'desc'),
        limit(10) // Get latest 10 readings
      );
      
      const sensorSnapshot = await getDocs(sensorQuery);
      
      const readings = sensorSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          timestamp: data.timestamp?.toDate ? data.timestamp.toDate() : new Date(data.timestamp),
          temperature: data.temperature || 0,
          humidity: data.humidity || 0,
          ph: data.ph || 0,
          ec: data.ec || 0,
          nitrogen: data.nitrogen || 0,
          phosphorus: data.phosphorus || 0,
          potassium: data.potassium || 0,
          userId: data.userId || ''
        };
      });
      
      setSensorReadings(readings);
      return readings;
      
    } catch (error) {
      console.error('Error fetching sensor readings:', error);
      setSensorReadings([]);
      return [];
    } finally {
      setLoadingSensorData(false);
    }
  };

  // Add new plant to Firestore
  const handleAddPlant = async () => {
    if (newPlant.name && newPlant.seedType && newPlant.plot && newPlant.quantity) {
      try {
        const plantData = {
          name: `${newPlant.name} - ${new Date().toLocaleDateString('en-US', { 
            month: '2-digit', 
            day: '2-digit', 
            year: 'numeric' 
          })}`,
          type: newPlant.name,
          status: 'Seeding',
          datePlanted: new Date(),
          initialSeedQuantity: parseInt(newPlant.quantity),
          locationZone: `Plot ${newPlant.plot}`,
          areaOccupiedSqM: 1.0, // Default value
          ownerUid: 'current_user_id', // Replace with actual user ID
          seedId: `seed_${newPlant.seedType.toLowerCase()}`, // You might want to link to actual seed documents
          imageUrl: '' // Will be set when image is uploaded to storage
        };

        const docRef = await addDoc(collection(db, 'plants'), plantData);
        console.log('Plant added with ID:', docRef.id);
        
        // Refresh the plants list
        await fetchPlants();
        
        // Reset form and close modal
        setNewPlant({ name: '', seedType: '', plot: '', quantity: '' });
        setShowAddModal(false);
        
      } catch (error) {
        console.error('Error adding plant:', error);
        alert('Failed to add plant. Please try again.');
      }
    } else {
      alert('Please fill in all fields');
    }
  };

  const handlePlantClick = async (plant) => {
    setSelectedPlant(plant);
    setShowPlantDetails(true);
    
    // Fetch sensor readings for this plant
    const readings = await fetchSensorReadings(plant.id);
    
    // Update the selected plant with latest sensor data if available
    if (readings && readings.length > 0) {
      const latestReading = readings[0];
      const updatedPlant = {
        ...plant,
        sensorData: {
          temp: `${latestReading.temperature}°C`,
          humidity: `${latestReading.humidity}%`,
          ph: latestReading.ph.toString(),
          ec: `${latestReading.ec} μS/cm`,
          nitrogen: latestReading.nitrogen,
          phosphorus: latestReading.phosphorus,
          potassium: latestReading.potassium
        },
        latestReadingTime: latestReading.timestamp
      };
      setSelectedPlant(updatedPlant);
    }
  };

  const filteredPlants = plants.filter(plant =>
    plant.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Fetch plants when component mounts
  useEffect(() => {
    fetchPlants();
  }, []);

  if (loading) {
    return (
      <div className="fp-main-layout">
        <FarmerSidebar 
          activeMenu={activeMenu} 
          setActiveMenu={setActiveMenu} 
        />
        <div className="fp-container">
          <div className="fp-loading">Loading plants...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fp-main-layout">
      <FarmerSidebar 
        activeMenu={activeMenu} 
        setActiveMenu={setActiveMenu} 
      />
      
      <div className="fp-container">
        <div className="fp-header">
          <h1 className="fp-greeting">Hello, Farmer!</h1>
          <div className="fp-header-actions">
            <div className="fp-search-container">
              <input
                type="text"
                placeholder="Search..."
                className="fp-search-input"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <span className="fp-search-icon">🔍</span>
            </div>
            <div className="fp-notification">
              <span className="fp-notification-icon">🔔</span>
            </div>
          </div>
        </div>

        <div className="fp-plants-section">
          <div className="fp-plants-header">
            <h2 className="fp-plants-title">Your plants</h2>
            <button
              className="fp-add-button"
              onClick={() => setShowAddModal(true)}
            >
              ADD NEW +
            </button>
          </div>

          <div className="fp-plants-grid">
            {filteredPlants.length === 0 ? (
              <div className="fp-no-plants">
                <p>No plants found. Add your first plant!</p>
              </div>
            ) : (
              filteredPlants.map((plant) => (
                <div
                  key={plant.id}
                  className="fp-plant-card"
                  onClick={() => handlePlantClick(plant)}
                >
                  <div className="fp-plant-image">
                    <img src={plant.image} alt={plant.name} />
                  </div>
                  <div className="fp-plant-info">
                    <h3 className="fp-plant-name">{plant.name}</h3>
                    <p className="fp-plant-area">{plant.area}</p>
                    <p className="fp-plant-status">{plant.status}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Add Plant Modal */}
        {showAddModal && (
          <div className="fp-modal-overlay">
            <div className="fp-modal">
              <div className="fp-modal-header">
                <h3>Add New Plant</h3>
                <button
                  className="fp-modal-close"
                  onClick={() => setShowAddModal(false)}
                >
                  ×
                </button>
              </div>
              <div className="fp-modal-content">
                <div className="fp-form-group">
                  <label>Plant Name</label>
                  <select
                    value={newPlant.name}
                    onChange={(e) => setNewPlant({ ...newPlant, name: e.target.value })}
                    className="fp-form-select"
                  >
                    <option value="">Select plant name</option>
                    <option value="Tomato">Tomato</option>
                    <option value="Lettuce">Lettuce</option>
                    <option value="Cabbage">Cabbage</option>
                    <option value="Pechay">Pechay</option>
                    <option value="Carrots">Carrots</option>
                    <option value="Cucumber">Cucumber</option>
                  </select>
                </div>

                <div className="fp-form-group">
                  <label>Seed Type (from inventory)</label>
                  <select
                    value={newPlant.seedType}
                    onChange={(e) => setNewPlant({ ...newPlant, seedType: e.target.value })}
                    className="fp-form-select"
                  >
                    <option value="">Select seed type</option>
                    <option value="Hybrid">Hybrid</option>
                    <option value="Organic">Organic</option>
                    <option value="Traditional">Traditional</option>
                  </select>
                </div>

                <div className="fp-form-group">
                  <label>Plot # (Suggested)</label>
                  <input
                    type="text"
                    value={newPlant.plot}
                    onChange={(e) => setNewPlant({ ...newPlant, plot: e.target.value })}
                    className="fp-form-input"
                    placeholder="Enter plot number"
                  />
                </div>

                <div className="fp-form-group">
                  <label>Quantity to Plant</label>
                  <input
                    type="number"
                    value={newPlant.quantity}
                    onChange={(e) => setNewPlant({ ...newPlant, quantity: e.target.value })}
                    className="fp-form-input"
                    placeholder="Enter quantity"
                  />
                </div>

                <div className="fp-modal-actions">
                  <button
                    className="fp-cancel-button"
                    onClick={() => setShowAddModal(false)}
                  >
                    Cancel
                  </button>
                  <button
                    className="fp-add-plant-button"
                    onClick={handleAddPlant}
                  >
                    Add Plant
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Plant Details Modal */}
        {showPlantDetails && selectedPlant && (
          <div className="fp-modal-overlay">
            <div className="fp-details-modal">
              <div className="fp-modal-header">
                <h3>🌱 Plant Details: {selectedPlant.name}</h3>
                <button
                  className="fp-modal-close"
                  onClick={() => setShowPlantDetails(false)}
                >
                  ×
                </button>
              </div>
              <div className="fp-details-content">
                <div className="fp-details-left">
                  <div className="fp-details-section">
                    <h4>Image</h4>
                    <div className="fp-plant-detail-image">
                      <img src={selectedPlant.image} alt={selectedPlant.name} />
                    </div>
                  </div>
                  <div className="fp-details-section">
                    <h4>Details</h4>
                    <div className="fp-plant-details-info">
                      <p><strong>Name:</strong> {selectedPlant.name}</p>
                      <p><strong>Type:</strong> {selectedPlant.type}</p>
                      <p><strong>Status:</strong> {selectedPlant.status}</p>
                      <p><strong>Date Planted:</strong> {selectedPlant.datePlanted.toLocaleDateString()}</p>
                      <p><strong>Initial Quantity:</strong> {selectedPlant.initialSeedQuantity}</p>
                      <p><strong>Area Occupied:</strong> {selectedPlant.areaOccupiedSqM} sq m</p>
                    </div>
                  </div>
                </div>
                
                <div className="fp-details-right">
                  <div className="fp-details-section">
                    <h4>Latest Sensor Readings</h4>
                    <div className="fp-sensor-grid">
                      <div className="fp-sensor-item temp">
                        <span className="fp-sensor-icon">🌡️</span>
                        <span className="fp-sensor-label">Temp</span>
                        <span className="fp-sensor-value">{selectedPlant.sensorData.temp}</span>
                      </div>
                      <div className="fp-sensor-item humidity">
                        <span className="fp-sensor-icon">💧</span>
                        <span className="fp-sensor-label">Humidity</span>
                        <span className="fp-sensor-value">{selectedPlant.sensorData.humidity}</span>
                      </div>
                      <div className="fp-sensor-item ph">
                        <span className="fp-sensor-icon">🧪</span>
                        <span className="fp-sensor-label">pH</span>
                        <span className="fp-sensor-value">{selectedPlant.sensorData.ph}</span>
                      </div>
                      <div className="fp-sensor-item ec">
                        <span className="fp-sensor-icon">⚡</span>
                        <span className="fp-sensor-label">EC</span>
                        <span className="fp-sensor-value">{selectedPlant.sensorData.ec}</span>
                      </div>
                    </div>
                    
                    <div className="fp-nutrients-grid">
                      <div className="fp-nutrient-item">
                        <span className="fp-nutrient-label">Nitrogen (N)</span>
                        <span className="fp-nutrient-value nitrogen">{selectedPlant.sensorData.nitrogen}</span>
                      </div>
                      <div className="fp-nutrient-item">
                        <span className="fp-nutrient-label">Phosphorus (P)</span>
                        <span className="fp-nutrient-value phosphorus">{selectedPlant.sensorData.phosphorus || '-'}</span>
                      </div>
                      <div className="fp-nutrient-item">
                        <span className="fp-nutrient-label">Potassium (K)</span>
                        <span className="fp-nutrient-value potassium">{selectedPlant.sensorData.potassium}</span>
                      </div>
                    </div>
                    
                    <p className="fp-reading-time">
                      Reading taken: {selectedPlant.latestReadingTime ? 
                        selectedPlant.latestReadingTime.toLocaleString() : 
                        'No recent readings'
                      }
                    </p>
                  </div>

                  <div className="fp-details-section">
                    <h4>📅 Plant Event History</h4>
                    <div className="fp-event-history">
                      <p>Planted on: {selectedPlant.datePlanted.toLocaleDateString()}</p>
                      <p>Initial quantity: {selectedPlant.initialSeedQuantity} seeds</p>
                    </div>
                  </div>

                  <div className="fp-details-section">
                    <h4>Full Sensor History</h4>
                    {loadingSensorData ? (
                      <p>Loading sensor data...</p>
                    ) : (
                      <div className="fp-sensor-history">
                        <table className="fp-history-table">
                          <thead>
                            <tr>
                              <th>TIMESTAMP</th>
                              <th>TEMP</th>
                              <th>HUMID</th>
                              <th>PH</th>
                              <th>EC</th>
                              <th>N</th>
                              <th>P</th>
                              <th>K</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sensorReadings.length > 0 ? (
                              sensorReadings.map((reading) => (
                                <tr key={reading.id}>
                                  <td>{reading.timestamp.toLocaleString()}</td>
                                  <td>{reading.temperature}</td>
                                  <td>{reading.humidity}</td>
                                  <td>{reading.ph}</td>
                                  <td>{reading.ec}</td>
                                  <td>{reading.nitrogen}</td>
                                  <td>{reading.phosphorus}</td>
                                  <td>{reading.potassium}</td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan="8">No sensor data available</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FarmerPlants;