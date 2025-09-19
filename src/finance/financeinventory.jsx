import React, { useState, useEffect } from 'react'
import FinanceSidebar from './financesidebar'
import './financeinventory.css'
import { collection, getDocs, query, orderBy, where } from 'firebase/firestore'
import { db } from '../firebase'

const FinanceInventory = ({ userType = 'finance' }) => {
  const [activeMenu, setActiveMenu] = useState('Inventory')
  const [activeTab, setActiveTab] = useState('Seed')
  const [searchTerm, setSearchTerm] = useState('')
  const [inventoryItems, setInventoryItems] = useState([])
  const [inventoryLogs, setInventoryLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    totalItems: 0,
    lowStockItems: 0,
    lastUpdate: '-',
    totalValue: 0
  })

  // Fetch inventory data from Firebase
  const fetchInventory = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'inventory'))
      const items = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        dateAdded: doc.data().dateAdded?.toDate ? doc.data().dateAdded.toDate() : new Date()
      }))
      
      setInventoryItems(items)
      return items
    } catch (error) {
      console.error('Error fetching inventory:', error)
      return []
    }
  }

  // Fetch inventory logs for financial analysis
  const fetchInventoryLogs = async () => {
    try {
      const logsQuery = query(
        collection(db, 'inventory_log'),
        orderBy('timestamp', 'desc')
      )
      const querySnapshot = await getDocs(logsQuery)
      const logs = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate ? doc.data().timestamp.toDate() : new Date()
      }))
      
      setInventoryLogs(logs)
      return logs
    } catch (error) {
      console.error('Error fetching inventory logs:', error)
      return []
    }
  }

  // Calculate financial metrics for each item
  const calculateItemFinancials = (item, logs) => {
    // Find logs related to this item
    const itemLogs = logs.filter(log => 
      log.itemId === item.id || 
      log.itemName?.toLowerCase() === item.name?.toLowerCase()
    )

    let totalCost = 0
    let totalQuantityPurchased = 0
    let totalRevenue = 0
    let totalQuantitySold = 0

    itemLogs.forEach(log => {
      const amount = (log.quantityChange || 0) * (log.costOrValuePerUnit || 0)
      
      if (log.type === 'Purchase' || log.type === 'Stock Increase' || log.type === 'Initial Stock') {
        totalCost += amount
        totalQuantityPurchased += log.quantityChange || 0
      }
      
      if (log.type === 'Sale' || log.type === 'Stock Decrease') {
        totalRevenue += amount
        totalQuantitySold += log.quantityChange || 0
      }
    })

    const currentValue = (item.stock || 0) * (item.pricePerUnit || 0)
    const averageCost = totalQuantityPurchased > 0 ? totalCost / totalQuantityPurchased : item.pricePerUnit || 0
    const profit = totalRevenue - totalCost
    const profitMargin = totalRevenue > 0 ? ((profit / totalRevenue) * 100) : 0

    return {
      totalCost,
      totalRevenue,
      currentValue,
      averageCost,
      profit,
      profitMargin,
      turnoverRate: totalQuantitySold / (item.stock || 1)
    }
  }

  // Calculate overall statistics
  const calculateStats = (items, logs) => {
    const filteredItems = items.filter(item => 
      item.category?.toLowerCase() === activeTab.toLowerCase()
    )

    const totalItems = filteredItems.length
    const lowStockItems = filteredItems.filter(item => 
      item.stock <= (item.lowStockThreshold || 10)
    ).length

    const totalValue = filteredItems.reduce((sum, item) => {
      const financials = calculateItemFinancials(item, logs)
      return sum + financials.currentValue
    }, 0)

    const dates = items
      .map(item => item.dateAdded)
      .filter(Boolean)

    const lastUpdate = dates.length > 0
      ? new Date(Math.max(...dates.map(d => d.getTime()))).toLocaleDateString()
      : '-'

    return {
      totalItems,
      lowStockItems,
      lastUpdate,
      totalValue
    }
  }

  // Load all data
  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      try {
        const [items, logs] = await Promise.all([
          fetchInventory(),
          fetchInventoryLogs()
        ])
        
        const statistics = calculateStats(items, logs)
        setStats(statistics)
      } catch (error) {
        console.error('Error loading inventory data:', error)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [activeTab])

  // Filter and prepare items for display
  const getDisplayItems = () => {
    const filteredItems = inventoryItems.filter(item => 
      item.category?.toLowerCase() === activeTab.toLowerCase() &&
      item.name?.toLowerCase().includes(searchTerm.toLowerCase())
    )

    return filteredItems.map(item => {
      const financials = calculateItemFinancials(item, inventoryLogs)
      
      return {
        id: item.id,
        item: item.name,
        stock: `${item.stock || 0} ${item.unit || 'units'}`,
        price: formatCurrency(item.pricePerUnit || 0) + ` / ${item.unit || 'unit'}`,
        totalValue: formatCurrency(financials.currentValue),
        status: (item.stock || 0) <= (item.lowStockThreshold || 10) ? 'Low Stock' : 'Sufficient',
        statusClass: (item.stock || 0) <= (item.lowStockThreshold || 10) ? 'low' : 'sufficient',
        averageCost: formatCurrency(financials.averageCost),
        profit: formatCurrency(financials.profit),
        profitMargin: financials.profitMargin.toFixed(1) + '%',
        turnoverRate: financials.turnoverRate.toFixed(2),
        lastUpdated: item.lastUpdated?.toDate?.()?.toLocaleDateString() || 'Unknown'
      }
    })
  }

  const displayItems = getDisplayItems()

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2
    }).format(amount || 0)
  }

  const handleAddItem = () => {
    console.log('Add new item clicked - Finance users cannot add items directly')
    alert('Finance users can view inventory data. Contact admin to add new items.')
  }

  const handleEditItem = (itemId) => {
    console.log('Edit item:', itemId)
    const item = displayItems.find(item => item.id === itemId)
    if (item) {
      alert(`Item Details:\nName: ${item.item}\nStock: ${item.stock}\nValue: ${item.totalValue}\nProfit Margin: ${item.profitMargin}`)
    }
  }

  if (loading) {
    return (
      <div className="fi-dashboard-container">
        <FinanceSidebar activeMenu={activeMenu} setActiveMenu={setActiveMenu} userType={userType} />
        <div className="fi-main">
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
            Loading inventory data...
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fi-dashboard-container">
      {/* Finance Sidebar Component */}
      <FinanceSidebar 
        activeMenu={activeMenu}
        setActiveMenu={setActiveMenu}
        userType={userType}
      />

      {/* Main Content */}
      <div className="fi-main">
        {/* Header */}
        <div className="fi-header">
          <div className="fi-header-left">
            <h1>Inventory Financial Overview</h1>
          </div>

          <div className="fi-header-right">
            {/* Search Bar */}
            <div className="fi-search-container">
              <div className="fi-search-icon">🔍</div>
              <input
                type="text"
                placeholder="Search inventory..."
                className="fi-search-input"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* Notification */}
            <div className="fi-notification-btn">
              <span className="fi-notification-icon">🔔</span>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="fi-content">
          {/* Tabs */}
          <div className="fi-tabs-container">
            <button 
              className={`fi-tab-button ${activeTab === 'Seed' ? 'active' : ''}`}
              onClick={() => setActiveTab('Seed')}
            >
              Seeds
            </button>
            <button 
              className={`fi-tab-button ${activeTab === 'Fertilizers' ? 'active' : ''}`}
              onClick={() => setActiveTab('Fertilizers')}
            >
              Fertilizers
            </button>
          </div>

          {/* Stats Cards */}
          <div className="fi-stats">
            <div className="fi-stat-card">
              <div className="fi-stat-icon green">🌱</div>
              <div className="fi-stat-content">
                <h3 className="fi-stat-title">Total {activeTab} Items</h3>
                <p className="fi-stat-number">{stats.totalItems} Items</p>
              </div>
            </div>

            <div className="fi-stat-card">
              <div className="fi-stat-icon yellow">⚠️</div>
              <div className="fi-stat-content">
                <h3 className="fi-stat-title">Low Stock Items</h3>
                <p className="fi-stat-number">{stats.lowStockItems} Items</p>
              </div>
            </div>

            <div className="fi-stat-card">
              <div className="fi-stat-icon blue">📅</div>
              <div className="fi-stat-content">
                <h3 className="fi-stat-title">Last Update</h3>
                <p className="fi-stat-number">{stats.lastUpdate}</p>
              </div>
            </div>

            <div className="fi-stat-card">
              <div className="fi-stat-icon purple">💰</div>
              <div className="fi-stat-content">
                <h3 className="fi-stat-title">Total Inventory Value</h3>
                <p className="fi-stat-number">{formatCurrency(stats.totalValue)}</p>
              </div>
            </div>
          </div>

          {/* Financial Summary */}
          <div className="fi-financial-summary">
            <div className="fi-summary-card">
              <h4>Financial Metrics</h4>
              <div className="fi-metrics-grid">
                <div className="fi-metric">
                  <span className="fi-metric-label">Total Investment</span>
                  <span className="fi-metric-value">
                    {formatCurrency(displayItems.reduce((sum, item) => {
                      const costValue = parseFloat(item.averageCost.replace(/[₱,]/g, ''))
                      const stockValue = parseFloat(item.stock.split(' ')[0])
                      return sum + (costValue * stockValue)
                    }, 0))}
                  </span>
                </div>
                <div className="fi-metric">
                  <span className="fi-metric-label">Current Value</span>
                  <span className="fi-metric-value">{formatCurrency(stats.totalValue)}</span>
                </div>
                <div className="fi-metric">
                  <span className="fi-metric-label">Potential Profit</span>
                  <span className="fi-metric-value">
                    {formatCurrency(displayItems.reduce((sum, item) => {
                      return sum + parseFloat(item.profit.replace(/[₱,]/g, ''))
                    }, 0))}
                  </span>
                </div>
                <div className="fi-metric">
                  <span className="fi-metric-label">Avg. Margin</span>
                  <span className="fi-metric-value">
                    {displayItems.length > 0 
                      ? (displayItems.reduce((sum, item) => {
                          return sum + parseFloat(item.profitMargin.replace('%', ''))
                        }, 0) / displayItems.length).toFixed(1) + '%'
                      : '0%'
                    }
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Inventory Table */}
          <div className="fi-table-container">
            <div className="fi-table-header">
              <div className="fi-table-cell">ITEM</div>
              <div className="fi-table-cell">STOCK</div>
              <div className="fi-table-cell">PRICE / UNIT</div>
              <div className="fi-table-cell">CURRENT VALUE</div>
              <div className="fi-table-cell">AVG COST</div>
              <div className="fi-table-cell">PROFIT MARGIN</div>
              <div className="fi-table-cell">STATUS</div>
              <div className="fi-table-cell">ACTION</div>
            </div>

            <div className="fi-table-body">
              {displayItems.length === 0 ? (
                <div className="fi-table-row">
                  <div className="fi-table-cell" style={{gridColumn: '1 / -1', textAlign: 'center', padding: '20px'}}>
                    {searchTerm ? `No items found matching "${searchTerm}"` : `No ${activeTab.toLowerCase()} items available`}
                  </div>
                </div>
              ) : (
                displayItems.map((item) => (
                  <div key={item.id} className="fi-table-row">
                    <div className="fi-table-cell fi-item-name">{item.item}</div>
                    <div className="fi-table-cell fi-stock-info">{item.stock}</div>
                    <div className="fi-table-cell fi-price-info">{item.price}</div>
                    <div className="fi-table-cell fi-value-info">{item.totalValue}</div>
                    <div className="fi-table-cell fi-cost-info">{item.averageCost}</div>
                    <div className="fi-table-cell fi-margin-info">{item.profitMargin}</div>
                    <div className="fi-table-cell">
                      <span className={`fi-status-badge ${item.statusClass}`}>
                        {item.statusClass === 'sufficient' ? '✓' : '⚠'} {item.status}
                      </span>
                    </div>
                    <div className="fi-table-cell">
                      <button 
                        className="fi-edit-button"
                        onClick={() => handleEditItem(item.id)}
                        title="View Details"
                      >
                        📊
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Finance Note */}
          <div className="fi-note">
            <p>📋 <strong>Finance View:</strong> This dashboard provides read-only financial analysis of inventory. 
            Contact administrators for inventory modifications.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default FinanceInventory