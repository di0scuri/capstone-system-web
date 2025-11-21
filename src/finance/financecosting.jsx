import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../firebase';
import { collection, getDocs, doc, updateDoc, addDoc, deleteDoc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import FinanceSidebar from './financesidebar';
import './financecosting.css';

const FinanceCosting = () => {
  const [authLoading, setAuthLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const navigate = useNavigate();

  const [activeMenu, setActiveMenu] = useState('Costing & Pricing');
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedPlant, setSelectedPlant] = useState(null);
  const [plants, setPlants] = useState([]);
  const [inventoryLogs, setInventoryLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [financialData, setFinancialData] = useState({
    totalRevenue: 0,
    totalExpenses: 0,
    netProfit: 0,
    simpleROI: 0,
    productionCosts: 0,
    harvestRevenue: 0,
    productionProfit: 0
  });
  const [productionStats, setProductionStats] = useState({
    plantsWithCosting: 0,
    plantsNeedingCosting: 0,
    totalProductionCost: 0
  });

  const [formData, setFormData] = useState({
    plant: '',
    retailPrice: '',
    wholesalePrice: '',
    unit: 'piece'
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUser(user);
        setAuthenticated(true);
      } else {
        setAuthenticated(false);
        navigate('/user-selection', { replace: true });
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, [navigate]);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2
    }).format(amount || 0);
  };

  const fetchProductionStats = async () => {
    try {
      const plantsSnapshot = await getDocs(collection(db, 'plants'));
      const plants = plantsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      const activePlants = plants.filter(p => p.status !== 'Harvested');
      const plantsWithCosting = activePlants.filter(p => p.hasCosting).length;
      const plantsNeedingCosting = activePlants.length - plantsWithCosting;
      
      const costsSnapshot = await getDocs(collection(db, 'productionCosts'));
      const totalProductionCost = costsSnapshot.docs.reduce((sum, doc) => {
        return sum + (doc.data().totalCost || 0);
      }, 0);
      
      setProductionStats({
        plantsWithCosting,
        plantsNeedingCosting,
        totalProductionCost
      });
    } catch (error) {
      console.error('Error fetching production stats:', error);
    }
  };

  const fetchPlants = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'pricing'));
      const plantsData = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          plant: data.plant || '',
          retailPrice: data.retailPrice || 0,
          wholesalePrice: data.wholesalePrice || 0,
          unit: data.unit || 'piece',
          createdAt: data.createdAt,
          updatedAt: data.updatedAt
        };
      });
      setPlants(plantsData);
    } catch (error) {
      console.error('Error fetching pricing data:', error);
    }
  };

  const fetchInventoryLogs = async () => {
    try {
      const logsQuery = query(
        collection(db, 'inventory_log'),
        orderBy('timestamp', 'desc')
      );
      const querySnapshot = await getDocs(logsQuery);
      const logs = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate ? doc.data().timestamp.toDate() : new Date()
      }));
      
      setInventoryLogs(logs);
      
      let inventoryRevenue = 0;
      let inventoryExpenses = 0;

      logs.forEach(log => {
        const amount = (log.quantityChange || 0) * (log.costOrValuePerUnit || 0);
        if (log.type === 'Sale' || log.type === 'Stock Decrease') {
          inventoryRevenue += amount;
        }
        if (log.type === 'Purchase' || log.type === 'Stock Increase' || log.type === 'Initial Stock') {
          inventoryExpenses += amount;
        }
      });

      const costsSnapshot = await getDocs(collection(db, 'productionCosts'));
      const productionCosts = costsSnapshot.docs.reduce((sum, doc) => {
        return sum + (doc.data().totalCost || 0);
      }, 0);

      const harvestsSnapshot = await getDocs(collection(db, 'harvests'));
      const harvestRevenue = harvestsSnapshot.docs.reduce((sum, doc) => {
        return sum + (doc.data().totalRevenue || 0);
      }, 0);

      const productionProfit = harvestRevenue - productionCosts;
      const totalRevenue = inventoryRevenue + harvestRevenue;
      const totalExpenses = inventoryExpenses + productionCosts;
      const netProfit = totalRevenue - totalExpenses;
      const simpleROI = totalExpenses > 0 ? ((netProfit / totalExpenses) * 100) : 0;

      setFinancialData({
        totalRevenue,
        totalExpenses,
        netProfit,
        simpleROI,
        productionCosts,
        harvestRevenue,
        productionProfit
      });
    } catch (error) {
      console.error('Error fetching inventory logs:', error);
    }
  };

  useEffect(() => {
    if (!authenticated || authLoading) return;

    const loadData = async () => {
      setLoading(true);
      try {
        await Promise.all([
          fetchPlants(), 
          fetchInventoryLogs(),
          fetchProductionStats()
        ]);
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
    
    const interval = setInterval(() => {
      fetchProductionStats();
    }, 30000);
    
    return () => clearInterval(interval);
  }, [authenticated, authLoading]);

  const handleAddPlant = async () => {
    if (!formData.plant || !formData.retailPrice || !formData.wholesalePrice || !formData.unit) {
      alert('Please fill in all fields');
      return;
    }

    try {
      const newPlant = {
        plant: formData.plant,
        retailPrice: parseFloat(formData.retailPrice),
        wholesalePrice: parseFloat(formData.wholesalePrice),
        unit: formData.unit,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      const docRef = await addDoc(collection(db, 'pricing'), newPlant);

      await addDoc(collection(db, 'plant_logs'), {
        plantId: docRef.id,
        plantName: formData.plant,
        action: 'Plant Added',
        newRetailPrice: parseFloat(formData.retailPrice),
        newWholesalePrice: parseFloat(formData.wholesalePrice),
        newUnit: formData.unit,
        timestamp: serverTimestamp(),
        userId: currentUser?.uid || 'finance'
      });

      setPlants(prev => [...prev, { id: docRef.id, ...newPlant }]);
      setShowAddModal(false);
      setFormData({ plant: '', retailPrice: '', wholesalePrice: '', unit: 'piece' });
    } catch (error) {
      console.error('Error adding plant:', error);
      alert('Failed to add plant. Please try again.');
    }
  };

  const handleEditPlant = async () => {
    if (!selectedPlant || !formData.retailPrice || !formData.wholesalePrice || !formData.unit) {
      alert('Please fill in all fields');
      return;
    }

    try {
      const plantRef = doc(db, 'pricing', selectedPlant.id);
      await updateDoc(plantRef, {
        retailPrice: parseFloat(formData.retailPrice),
        wholesalePrice: parseFloat(formData.wholesalePrice),
        unit: formData.unit,
        updatedAt: serverTimestamp()
      });

      await addDoc(collection(db, 'plant_logs'), {
        plantId: selectedPlant.id,
        plantName: selectedPlant.plant,
        action: 'Price Updated',
        oldRetailPrice: selectedPlant.retailPrice,
        newRetailPrice: parseFloat(formData.retailPrice),
        oldWholesalePrice: selectedPlant.wholesalePrice,
        newWholesalePrice: parseFloat(formData.wholesalePrice),
        oldUnit: selectedPlant.unit,
        newUnit: formData.unit,
        timestamp: serverTimestamp(),
        userId: currentUser?.uid || 'finance'
      });

      setPlants(prev => 
        prev.map(plant =>
          plant.id === selectedPlant.id
            ? { 
                ...plant, 
                retailPrice: parseFloat(formData.retailPrice),
                wholesalePrice: parseFloat(formData.wholesalePrice),
                unit: formData.unit
              }
            : plant
        )
      );

      setShowEditModal(false);
      setSelectedPlant(null);
      setFormData({ plant: '', retailPrice: '', wholesalePrice: '', unit: 'piece' });
    } catch (error) {
      console.error('Error updating plant:', error);
      alert('Failed to update plant. Please try again.');
    }
  };

  const handleDeletePlant = async (plantId) => {
    if (!window.confirm('Are you sure you want to delete this plant?')) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'pricing', plantId));
      setPlants(prev => prev.filter(plant => plant.id !== plantId));
    } catch (error) {
      console.error('Error deleting plant:', error);
      alert('Failed to delete plant. Please try again.');
    }
  };

  const openEditModal = (plant) => {
    setSelectedPlant(plant);
    setFormData({
      plant: plant.plant,
      retailPrice: plant.retailPrice?.toString() || '0',
      wholesalePrice: plant.wholesalePrice?.toString() || '0',
      unit: plant.unit || 'piece'
    });
    setShowEditModal(true);
  };

  const filteredPlants = plants.filter(plant =>
    plant.plant?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const statsCards = [
    {
      title: 'Total Revenue',
      amount: formatCurrency(financialData.totalRevenue),
      subtitle: `Production: ${formatCurrency(financialData.harvestRevenue)}`,
      color: '#4CAF50',
      bgColor: '#E8F5E9',
      icon: '💰'
    },
    {
      title: 'Total Expenses',
      amount: formatCurrency(financialData.totalExpenses),
      subtitle: `Production: ${formatCurrency(financialData.productionCosts)}`,
      color: '#F44336',
      bgColor: '#FFEBEE',
      icon: '💸'
    },
    {
      title: 'Net Profit',
      amount: formatCurrency(financialData.netProfit),
      subtitle: `Production: ${formatCurrency(financialData.productionProfit)}`,
      color: financialData.netProfit >= 0 ? '#4CAF50' : '#F44336',
      bgColor: financialData.netProfit >= 0 ? '#E8F5E9' : '#FFEBEE',
      icon: '📈'
    },
    {
      title: 'Simple ROI',
      amount: `${financialData.simpleROI.toFixed(1)}%`,
      subtitle: `${productionStats.plantsWithCosting} plants with costing`,
      color: '#2196F3',
      bgColor: '#E3F2FD',
      icon: '📊'
    }
  ];

  if (authLoading) {
    return (
      <div className="dashboard-container">
        <div className="main-content" style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          height: '100vh',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
        }}>
          <div style={{ 
            textAlign: 'center', 
            color: 'white',
            padding: '40px',
            background: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '20px',
            backdropFilter: 'blur(10px)'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '20px' }}>💰</div>
            <h2 style={{ margin: '10px 0', fontSize: '24px' }}>Checking Authentication...</h2>
            <p style={{ margin: '5px 0', opacity: 0.8 }}>Please wait</p>
          </div>
        </div>
      </div>
    );
  }

  if (!authenticated) return null;

  if (loading) {
    return (
      <div className="dashboard-container">
        <FinanceSidebar activeMenu={activeMenu} setActiveMenu={setActiveMenu} />
        <div className="main-content">
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '70vh', flexDirection: 'column' }}>
            <div style={{ fontSize: '64px', marginBottom: '20px' }}>📊</div>
            <h2>Loading financial data...</h2>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <FinanceSidebar 
        activeMenu={activeMenu} 
        setActiveMenu={setActiveMenu} 
      />
      
      <div className="main-content">
        <div className="dashboard-header">
          <div className="header-left">
            <h1>Costing and Pricing</h1>
            <p className="date-text">Financial Management Dashboard</p>
          </div>
          <div className="header-right">
            <div className="search-container-ad">
              <input
                type="text"
                placeholder="Search plants..."
                className="search-input-ad"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <div className="search-icon-ad">🔍</div>
            </div>
            <div className="notification-icon">
              🔔
              {productionStats.plantsNeedingCosting > 0 && (
                <span className="notification-badge"></span>
              )}
            </div>
          </div>
        </div>

        {/* Production Alert Bar */}
        {productionStats.plantsNeedingCosting > 0 && (
          <div className="fco-alert-banner">
            <div className="fco-alert-icon">⚠️</div>
            <div className="fco-alert-content">
              <strong>{productionStats.plantsNeedingCosting} active plants</strong> need production costing data. 
              <button 
                className="fco-alert-btn"
                onClick={() => navigate('/production')}
              >
                Add Costs →
              </button>
            </div>
          </div>
        )}

        <div className="stats-grid">
          {statsCards.map((card, index) => (
            <div key={index} className="stat-card">
              <div 
                className="stat-icon" 
                style={{ 
                  backgroundColor: card.bgColor,
                  color: card.color 
                }}
              >
                {card.icon}
              </div>
              <div className="stat-content">
                <h3 className="stat-title">{card.title}</h3>
                <p className="stat-amount">{card.amount}</p>
                {card.subtitle && (
                  <p className="stat-subtitle">{card.subtitle}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="fco-table-section">
          <div className="fco-table-header-section">
            <h2 className="fco-section-title">Plant Pricing</h2>
            <p className="fco-section-subtitle">Manage plant prices and units</p>
          </div>

          <div className="fco-table-container">
            <table className="fco-table">
              <thead>
                <tr>
                  <th>Plant</th>
                  <th>Retail Price</th>
                  <th>Wholesale Price</th>
                  <th>Unit</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPlants.length === 0 ? (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', padding: '40px' }}>
                      {searchTerm ? `No plants found matching "${searchTerm}"` : 'No plants added yet. Click the + button to add a plant.'}
                    </td>
                  </tr>
                ) : (
                  filteredPlants.map((plant) => (
                    <tr key={plant.id}>
                      <td className="fco-plant-name">{plant.plant}</td>
                      <td className="fco-plant-price">{formatCurrency(plant.retailPrice || 0)}</td>
                      <td className="fco-plant-price fco-wholesale">{formatCurrency(plant.wholesalePrice || 0)}</td>
                      <td className="fco-plant-unit">{plant.unit || 'piece'}</td>
                      <td className="fco-plant-actions">
                        <button
                          className="fco-action-btn edit"
                          onClick={() => openEditModal(plant)}
                          title="Edit"
                        >
                          ✏️
                        </button>
                        <button
                          className="fco-action-btn delete"
                          onClick={() => handleDeletePlant(plant.id)}
                          title="Delete"
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <button 
          className="fco-fab"
          onClick={() => setShowAddModal(true)}
          title="Add Plant"
        >
          +
        </button>
      </div>

      {showAddModal && (
        <div className="fco-modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="fco-modal" onClick={(e) => e.stopPropagation()}>
            <div className="fco-modal-header">
              <h3>Add New Plant</h3>
              <button
                className="fco-modal-close"
                onClick={() => setShowAddModal(false)}
              >
                ×
              </button>
            </div>
            
            <div className="fco-modal-content">
              <div className="fco-form-group">
                <label>Plant Name</label>
                <input
                  type="text"
                  value={formData.plant}
                  onChange={(e) => setFormData({...formData, plant: e.target.value})}
                  className="fco-form-input"
                  placeholder="e.g., Lettuce, Tomato"
                />
              </div>

              <div className="fco-form-group">
                <label>Retail Price</label>
                <input
                  type="number"
                  value={formData.retailPrice}
                  onChange={(e) => setFormData({...formData, retailPrice: e.target.value})}
                  className="fco-form-input"
                  placeholder="Enter retail price"
                  min="0"
                  step="0.01"
                />
              </div>

              <div className="fco-form-group">
                <label>Wholesale Price</label>
                <input
                  type="number"
                  value={formData.wholesalePrice}
                  onChange={(e) => setFormData({...formData, wholesalePrice: e.target.value})}
                  className="fco-form-input"
                  placeholder="Enter wholesale price"
                  min="0"
                  step="0.01"
                />
              </div>

              <div className="fco-form-group">
                <label>Unit</label>
                <select
                  value={formData.unit}
                  onChange={(e) => setFormData({...formData, unit: e.target.value})}
                  className="fco-form-select"
                >
                  <option value="piece">Piece</option>
                  <option value="kg">Kilogram (kg)</option>
                  <option value="bag">Bag</option>
                </select>
              </div>

              <div className="fco-modal-actions">
                <button
                  className="fco-cancel-button"
                  onClick={() => setShowAddModal(false)}
                >
                  Cancel
                </button>
                <button
                  className="fco-save-button"
                  onClick={handleAddPlant}
                >
                  Add Plant
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showEditModal && selectedPlant && (
        <div className="fco-modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="fco-modal" onClick={(e) => e.stopPropagation()}>
            <div className="fco-modal-header">
              <h3>Edit Plant</h3>
              <button
                className="fco-modal-close"
                onClick={() => setShowEditModal(false)}
              >
                ×
              </button>
            </div>
            
            <div className="fco-modal-content">
              <div className="fco-form-group">
                <label>Plant Name</label>
                <input
                  type="text"
                  value={formData.plant}
                  className="fco-form-input"
                  disabled
                  style={{ background: '#f5f5f5', cursor: 'not-allowed' }}
                />
              </div>

              <div className="fco-form-group">
                <label>Retail Price</label>
                <input
                  type="number"
                  value={formData.retailPrice}
                  onChange={(e) => setFormData({...formData, retailPrice: e.target.value})}
                  className="fco-form-input"
                  placeholder="Enter retail price"
                  min="0"
                  step="0.01"
                />
              </div>

              <div className="fco-form-group">
                <label>Wholesale Price</label>
                <input
                  type="number"
                  value={formData.wholesalePrice}
                  onChange={(e) => setFormData({...formData, wholesalePrice: e.target.value})}
                  className="fco-form-input"
                  placeholder="Enter wholesale price"
                  min="0"
                  step="0.01"
                />
              </div>

              <div className="fco-form-group">
                <label>Unit</label>
                <select
                  value={formData.unit}
                  onChange={(e) => setFormData({...formData, unit: e.target.value})}
                  className="fco-form-select"
                >
                  <option value="piece">Piece</option>
                  <option value="kg">Kilogram (kg)</option>
                  <option value="bag">Bag</option>
                </select>
              </div>

              <div className="fco-modal-actions">
                <button
                  className="fco-cancel-button"
                  onClick={() => setShowEditModal(false)}
                >
                  Cancel
                </button>
                <button
                  className="fco-save-button"
                  onClick={handleEditPlant}
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FinanceCosting;