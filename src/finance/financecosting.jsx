import React, { useState, useEffect } from 'react';
import FinanceSidebar from './financesidebar';
import './financecosting.css';
import { collection, getDocs, doc, updateDoc, addDoc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';

const FinanceCosting = () => {
  const [activeMenu, setActiveMenu] = useState('Costing & Pricing');
  const [searchTerm, setSearchTerm] = useState('');
  const [showModifyModal, setShowModifyModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedPlant, setSelectedPlant] = useState(null);
  const [plants, setPlants] = useState([]);
  const [inventoryLogs, setInventoryLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [financialData, setFinancialData] = useState({
    totalRevenue: 0,
    totalExpenses: 0,
    netProfit: 0,
    simpleROI: 0
  });

  const [modifyData, setModifyData] = useState({
    price: '',
    unit: ''
  });

  const fetchPlants = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'plants'));
      const plantsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        datePlanted: doc.data().datePlanted?.toDate ? doc.data().datePlanted.toDate() : new Date()
      }));
      
      setPlants(plantsData);
    } catch (error) {
      console.error('Error fetching plants:', error);
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
      
      // Calculate overall financial metrics from inventory logs
      let totalRevenue = 0;
      let totalExpenses = 0;

      logs.forEach(log => {
        const amount = (log.quantityChange || 0) * (log.costOrValuePerUnit || 0);
        
        // Revenue: Sales, Stock Decrease (assuming sales)
        if (log.type === 'Sale' || log.type === 'Stock Decrease') {
          totalRevenue += amount;
        }
        
        // Expenses: Purchases, Stock Increase, Initial Stock
        if (log.type === 'Purchase' || log.type === 'Stock Increase' || log.type === 'Initial Stock') {
          totalExpenses += amount;
        }
      });

      const netProfit = totalRevenue - totalExpenses;
      const simpleROI = totalExpenses > 0 ? ((netProfit / totalExpenses) * 100) : 0;

      // Update financial data state
      setFinancialData({
        totalRevenue,
        totalExpenses,
        netProfit,
        simpleROI
      });
    } catch (error) {
      console.error('Error fetching inventory logs:', error);
    }
  };

  const calculatePlantFinancials = (plantId, plantType) => {
    const plantLogs = inventoryLogs.filter(log => 
      log.itemName?.toLowerCase().includes(plantType.toLowerCase()) ||
      log.type === 'Sale' || log.type === 'Purchase'
    );

    let totalRevenue = 0;
    let totalExpenses = 0;
    let salesData = [];

    plantLogs.forEach(log => {
      const amount = (log.quantityChange || 0) * (log.costOrValuePerUnit || 0);
      
      if (log.type === 'Sale' || log.type === 'Stock Decrease') {
        totalRevenue += amount;
        salesData.push({
          date: log.timestamp,
          amount: amount
        });
      }
      
      if (log.type === 'Purchase' || log.type === 'Stock Increase' || log.type === 'Initial Stock') {
        totalExpenses += amount;
      }
    });

    const netProfit = totalRevenue - totalExpenses;
    const simpleROI = totalExpenses > 0 ? ((netProfit / totalExpenses) * 100) : 0;

    const monthlyData = Array.from({ length: 12 }, (_, i) => {
      const date = new Date();
      date.setMonth(date.getMonth() - (11 - i));
      
      const monthSales = salesData.filter(sale => 
        sale.date.getMonth() === date.getMonth() && 
        sale.date.getFullYear() === date.getFullYear()
      );
      
      return monthSales.reduce((sum, sale) => sum + sale.amount, 0);
    });

    return {
      productionCost: totalExpenses,
      simpleROI: simpleROI,
      totalExpenses: totalExpenses,
      netProfit: netProfit,
      totalRevenue: totalRevenue,
      salesData: {
        thisHarvest: monthlyData,
        lastHarvest: monthlyData.map(val => val * 0.85)
      }
    };
  };

  const getPlantImage = (plantType) => {
    const images = {
      'Tomato': 'https://images.unsplash.com/photo-1592841200221-a6898f307baa?w=400&h=300&fit=crop',
      'Lettuce': 'https://images.unsplash.com/photo-1622206151226-18ca2c9ab4a1?w=400&h=300&fit=crop',
      'Cabbage': 'https://images.unsplash.com/photo-1594282486558-4d2d2f2b8df5?w=400&h=300&fit=crop',
      'Pechay': 'https://images.unsplash.com/photo-1576045057995-568f588f82fb?w=400&h=300&fit=crop'
    };
    return images[plantType] || 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=400&h=300&fit=crop';
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        await Promise.all([fetchPlants(), fetchInventoryLogs()]);
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const plantsWithFinancials = plants.map(plant => {
    const financials = calculatePlantFinancials(plant.id, plant.type);
    return {
      ...plant,
      currentPrice: plant.currentSellingPrice || 0,
      unit: plant.unit || 'per piece',
      image: getPlantImage(plant.type),
      ...financials
    };
  });

  const handleEditClick = (plant) => {
    setSelectedPlant(plant);
    setModifyData({
      price: plant.currentPrice?.toString() || '0',
      unit: plant.unit || 'per piece'
    });
    setShowModifyModal(true);
  };

  const handlePlantClick = (plant) => {
    setSelectedPlant(plant);
    setShowDetailModal(true);
  };

  const handleSavePrice = async () => {
    if (selectedPlant && modifyData.price) {
      try {
        const plantRef = doc(db, 'plants', selectedPlant.id);
        await updateDoc(plantRef, {
          currentSellingPrice: parseFloat(modifyData.price),
          unit: modifyData.unit,
          lastUpdated: serverTimestamp()
        });

        await addDoc(collection(db, 'plant_logs'), {
          plantId: selectedPlant.id,
          plantName: selectedPlant.name || selectedPlant.type,
          action: 'Price Updated',
          oldPrice: selectedPlant.currentPrice,
          newPrice: parseFloat(modifyData.price),
          oldUnit: selectedPlant.unit,
          newUnit: modifyData.unit,
          timestamp: serverTimestamp(),
          userId: 'finance'
        });

        setPlants(prevPlants => 
          prevPlants.map(plant =>
            plant.id === selectedPlant.id
              ? { 
                  ...plant, 
                  currentSellingPrice: parseFloat(modifyData.price),
                  unit: modifyData.unit
                }
              : plant
          )
        );

        setShowModifyModal(false);
        setSelectedPlant(null);
        setModifyData({ price: '', unit: '' });
      } catch (error) {
        console.error('Error updating plant price:', error);
        alert('Failed to update price. Please try again.');
      }
    }
  };

  const filteredPlants = plantsWithFinancials.filter(plant =>
    (plant.name?.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (plant.type?.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const generateChartPath = (data) => {
    const maxValue = Math.max(...data, 1);
    const minValue = Math.min(...data);
    const range = maxValue - minValue || 1;
    
    return data.map((value, index) => {
      const x = (index / (data.length - 1)) * 400;
      const y = 100 - ((value - minValue) / range) * 80;
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP'
    }).format(amount || 0);
  };

  const statsCards = [
    {
      title: 'Total Revenue',
      amount: formatCurrency(financialData.totalRevenue),
      color: '#4CAF50',
      bgColor: '#E8F5E9',
      icon: '💰'
    },
    {
      title: 'Total Expenses',
      amount: formatCurrency(financialData.totalExpenses),
      color: '#F44336',
      bgColor: '#FFEBEE',
      icon: '💸'
    },
    {
      title: 'Net Profit',
      amount: formatCurrency(financialData.netProfit),
      color: financialData.netProfit >= 0 ? '#4CAF50' : '#F44336',
      bgColor: financialData.netProfit >= 0 ? '#E8F5E9' : '#FFEBEE',
      icon: '📈'
    },
    {
      title: 'Simple ROI',
      amount: `${financialData.simpleROI.toFixed(1)}%`,
      color: '#2196F3',
      bgColor: '#E3F2FD',
      icon: '📊'
    }
  ];

  if (loading) {
    return (
      <div className="dashboard-container">
        <FinanceSidebar activeMenu={activeMenu} setActiveMenu={setActiveMenu} />
        <div className="main-content">
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
            <div>Loading financial data...</div>
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
        {/* Header */}
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
            <div className="notification-icon">🔔</div>
          </div>
        </div>

        {/* Stats Cards */}
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
              </div>
            </div>
          ))}
        </div>

        {/* Plants Section */}
        <div className="fco-plants-wrapper">
          <div className="fco-plants-header">
            <h2 className="fco-section-title">Plant Inventory</h2>
            <p className="fco-section-subtitle">Manage pricing and view financial metrics</p>
          </div>
          
          {filteredPlants.length === 0 ? (
            <div className="fco-no-plants">
              <p>No plants found. {searchTerm && `No results for "${searchTerm}"`}</p>
            </div>
          ) : (
            <div className="fco-plants-grid">
              {filteredPlants.map((plant) => (
                <div
                  key={plant.id}
                  className="fco-plant-card"
                  onClick={() => handlePlantClick(plant)}
                >
                  <div className="fco-plant-image">
                    <img src={plant.image} alt={plant.name || plant.type} />
                    <div className="fco-plant-overlay">
                      <button
                        className="fco-edit-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditClick(plant);
                        }}
                      >
                        Edit Price
                      </button>
                    </div>
                  </div>
                  <div className="fco-plant-info">
                    <h3 className="fco-plant-name">{plant.name || plant.type}</h3>
                    <div className="fco-plant-metrics">
                      <div className="fco-metric-row">
                        <span className="fco-metric-label">Price:</span>
                        <span className="fco-metric-value">{formatCurrency(plant.currentPrice)}</span>
                      </div>
                      <div className="fco-metric-row">
                        <span className="fco-metric-label">Unit:</span>
                        <span className="fco-metric-value">{plant.unit}</span>
                      </div>
                      <div className="fco-metric-row">
                        <span className="fco-metric-label">ROI:</span>
                        <span className="fco-metric-value" style={{
                          color: plant.simpleROI >= 0 ? '#4CAF50' : '#F44336'
                        }}>
                          {plant.simpleROI?.toFixed(1)}%
                        </span>
                      </div>
                      <div className="fco-metric-row">
                        <span className="fco-metric-label">Status:</span>
                        <span className="fco-metric-value">{plant.status || 'Growing'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modify Pricing Modal */}
      {showModifyModal && selectedPlant && (
        <div className="fco-modal-overlay">
          <div className="fco-modal">
            <div className="fco-modal-header">
              <h3>Modify Pricing</h3>
              <button
                className="fco-modal-close"
                onClick={() => setShowModifyModal(false)}
              >
                ×
              </button>
            </div>
            
            <div className="fco-modal-content">
              <h2 className="fco-modal-plant-name">{selectedPlant.name || selectedPlant.type}</h2>
              
              <div className="fco-form-group">
                <label>Current Selling Price</label>
                <input
                  type="number"
                  value={modifyData.price}
                  onChange={(e) => setModifyData({...modifyData, price: e.target.value})}
                  className="fco-form-input"
                  placeholder="Enter price"
                  min="0"
                  step="0.01"
                />
              </div>

              <div className="fco-form-group">
                <label>Unit</label>
                <select
                  value={modifyData.unit}
                  onChange={(e) => setModifyData({...modifyData, unit: e.target.value})}
                  className="fco-form-select"
                >
                  <option value="per kilo">per kilo</option>
                  <option value="per piece">per piece</option>
                  <option value="per bundle">per bundle</option>
                  <option value="per pack">per pack</option>
                  <option value="per dozen">per dozen</option>
                </select>
              </div>

              <div className="fco-current-metrics">
                <h4>Current Metrics</h4>
                <div className="fco-metrics-list">
                  <p>
                    <span>Production Cost:</span>
                    <strong>{formatCurrency(selectedPlant.productionCost)}</strong>
                  </p>
                  <p>
                    <span>Total Expenses:</span>
                    <strong>{formatCurrency(selectedPlant.totalExpenses)}</strong>
                  </p>
                  <p>
                    <span>Net Profit:</span>
                    <strong style={{
                      color: selectedPlant.netProfit >= 0 ? '#4CAF50' : '#F44336'
                    }}>
                      {formatCurrency(selectedPlant.netProfit)}
                    </strong>
                  </p>
                  <p>
                    <span>ROI:</span>
                    <strong style={{
                      color: selectedPlant.simpleROI >= 0 ? '#4CAF50' : '#F44336'
                    }}>
                      {selectedPlant.simpleROI?.toFixed(1)}%
                    </strong>
                  </p>
                </div>
              </div>

              <div className="fco-modal-actions">
                <button
                  className="fco-cancel-button"
                  onClick={() => setShowModifyModal(false)}
                >
                  Cancel
                </button>
                <button
                  className="fco-save-button"
                  onClick={handleSavePrice}
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Plant Detail Modal */}
      {showDetailModal && selectedPlant && (
        <div className="fco-modal-overlay">
          <div className="fco-detail-modal">
            <div className="fco-modal-header">
              <h2>{selectedPlant.name || selectedPlant.type}</h2>
              <button
                className="fco-modal-close"
                onClick={() => setShowDetailModal(false)}
              >
                ×
              </button>
            </div>
            
            <div className="fco-detail-content">
              <div className="fco-detail-left">
                <div className="fco-plant-detail-image">
                  <img src={selectedPlant.image} alt={selectedPlant.name || selectedPlant.type} />
                </div>
                <div className="fco-plant-details">
                  <h4>Plant Information</h4>
                  <p><strong>Date Planted:</strong> {selectedPlant.datePlanted?.toLocaleDateString() || 'Unknown'}</p>
                  <p><strong>Location:</strong> {selectedPlant.locationZone || 'Not specified'}</p>
                  <p><strong>Status:</strong> {selectedPlant.status || 'Growing'}</p>
                  <p><strong>Area:</strong> {selectedPlant.areaOccupiedSqM || 0} sqm</p>
                </div>
              </div>
              
              <div className="fco-detail-right">
                <div className="fco-metrics-grid">
                  <div className="fco-metric-card">
                    <div className="fco-metric-icon production">🌱</div>
                    <div className="fco-metric-content">
                      <span className="fco-metric-label">Production Cost</span>
                      <span className="fco-metric-value">{formatCurrency(selectedPlant.productionCost)}</span>
                    </div>
                  </div>
                  
                  <div className="fco-metric-card">
                    <div className="fco-metric-icon roi">📊</div>
                    <div className="fco-metric-content">
                      <span className="fco-metric-label">ROI</span>
                      <span className="fco-metric-value">{selectedPlant.simpleROI?.toFixed(1)}%</span>
                    </div>
                  </div>
                  
                  <div className="fco-metric-card">
                    <div className="fco-metric-icon expenses">💸</div>
                    <div className="fco-metric-content">
                      <span className="fco-metric-label">Total Expenses</span>
                      <span className="fco-metric-value">{formatCurrency(selectedPlant.totalExpenses)}</span>
                    </div>
                  </div>
                  
                  <div className="fco-metric-card">
                    <div className="fco-metric-icon profit">💰</div>
                    <div className="fco-metric-content">
                      <span className="fco-metric-label">Net Profit</span>
                      <span className="fco-metric-value">{formatCurrency(selectedPlant.netProfit)}</span>
                    </div>
                  </div>
                </div>

                <div className="fco-chart-section">
                  <div className="fco-chart-header">
                    <h4>Sales Performance</h4>
                    <select className="fco-period-select">
                      <option>Last 12 months</option>
                      <option>Last 6 months</option>
                      <option>Last 3 months</option>
                    </select>
                  </div>

                  <div className="fco-chart-container">
                    {selectedPlant.salesData?.thisHarvest?.length > 0 ? (
                      <svg viewBox="0 0 400 120" className="fco-chart-svg">
                        <defs>
                          <linearGradient id="thisHarvestGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stopColor="rgba(76, 175, 80, 0.3)" />
                            <stop offset="100%" stopColor="rgba(76, 175, 80, 0.05)" />
                          </linearGradient>
                        </defs>
                        
                        <path
                          d={`${generateChartPath(selectedPlant.salesData.thisHarvest)} L 400 100 L 0 100 Z`}
                          fill="url(#thisHarvestGradient)"
                        />
                        
                        <path
                          d={generateChartPath(selectedPlant.salesData.thisHarvest)}
                          fill="none"
                          stroke="#4CAF50"
                          strokeWidth="2"
                        />
                        
                        <path
                          d={generateChartPath(selectedPlant.salesData.lastHarvest)}
                          fill="none"
                          stroke="#F44336"
                          strokeWidth="2"
                          strokeDasharray="5,5"
                        />
                      </svg>
                    ) : (
                      <div className="fco-no-chart-data">No sales data available</div>
                    )}
                  </div>
                  
                  <div className="fco-chart-legend">
                    <div className="fco-legend-item">
                      <span className="fco-legend-dot this-harvest"></span>
                      <span className="fco-legend-text">Current Period</span>
                    </div>
                    <div className="fco-legend-item">
                      <span className="fco-legend-dot last-harvest"></span>
                      <span className="fco-legend-text">Previous Period</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FinanceCosting;