import React, { useState, useEffect } from 'react'
import FinanceSidebar from './financesidebar'
import './financedashboard.css'
import { collection, getDocs, query, orderBy, limit, where } from 'firebase/firestore'
import { db } from '../firebase'

const FinanceDashboard = ({ userType = 'finance' }) => {
  const [activeMenu, setActiveMenu] = useState('Overview')
  const [searchTerm, setSearchTerm] = useState('')
  const [financialData, setFinancialData] = useState({
    totalRevenue: 0,
    netProfit: 0,
    totalExpenses: 0,
    roi: 0,
    // Production-specific
    productionCosts: 0,
    harvestRevenue: 0,
    productionProfit: 0,
    productionROI: 0
  })
  const [productionStats, setProductionStats] = useState({
    plantsWithCosting: 0,
    plantsNeedingCosting: 0,
    totalHarvests: 0,
    avgProfitPerHarvest: 0
  })
  const [transactions, setTransactions] = useState([])
  const [chartData, setChartData] = useState([])
  const [recentHarvests, setRecentHarvests] = useState([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState('Monthly View')

  // Fetch production statistics
  const fetchProductionStats = async () => {
    try {
      const plantsSnapshot = await getDocs(collection(db, 'plants'))
      const plants = plantsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      
      const plantsWithCosting = plants.filter(p => p.hasCosting).length
      const activePlants = plants.filter(p => p.status !== 'Harvested').length
      const plantsNeedingCosting = activePlants - plantsWithCosting
      
      const harvestsSnapshot = await getDocs(collection(db, 'harvests'))
      const harvests = harvestsSnapshot.docs.map(doc => doc.data())
      const totalHarvests = harvests.length
      
      const avgProfitPerHarvest = totalHarvests > 0
        ? harvests.reduce((sum, h) => sum + (h.profit || 0), 0) / totalHarvests
        : 0
      
      setProductionStats({
        plantsWithCosting,
        plantsNeedingCosting,
        totalHarvests,
        avgProfitPerHarvest: avgProfitPerHarvest.toFixed(2)
      })
    } catch (error) {
      console.error('Error fetching production stats:', error)
    }
  }

  // Fetch recent harvests
  const fetchRecentHarvests = async () => {
    try {
      const harvestsQuery = query(
        collection(db, 'harvests'),
        orderBy('harvestDate', 'desc'),
        limit(5)
      )
      const snapshot = await getDocs(harvestsQuery)
      const harvests = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      setRecentHarvests(harvests)
    } catch (error) {
      console.error('Error fetching recent harvests:', error)
      setRecentHarvests([])
    }
  }

  // Fetch inventory logs for financial calculations
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
      
      return logs
    } catch (error) {
      console.error('Error fetching inventory logs:', error)
      return []
    }
  }

  // Calculate financial metrics including production
  const calculateFinancials = async (logs) => {
    let inventoryRevenue = 0
    let inventoryExpenses = 0
    const transactions = []

    logs.forEach(log => {
      const amount = (log.quantityChange || 0) * (log.costOrValuePerUnit || 0)
      
      if (log.type === 'Sale' || log.type === 'Stock Decrease') {
        inventoryRevenue += amount
      }
      
      if (log.type === 'Purchase' || log.type === 'Stock Increase' || log.type === 'Initial Stock') {
        inventoryExpenses += amount
        
        transactions.push({
          date: log.timestamp.toLocaleDateString('en-US', { 
            year: 'numeric',
            month: '2-digit', 
            day: '2-digit' 
          }).replace(/\//g, '.'),
          product: log.itemName || 'Unknown Item',
          amount: formatCurrency(amount),
          status: 'Completed',
          type: log.type
        })
      }
    })

    // Fetch production costs
    const costsSnapshot = await getDocs(collection(db, 'productionCosts'))
    const productionCosts = costsSnapshot.docs.reduce((sum, doc) => {
      return sum + (doc.data().totalCost || 0)
    }, 0)

    // Fetch harvest revenue
    const harvestsSnapshot = await getDocs(collection(db, 'harvests'))
    const harvestRevenue = harvestsSnapshot.docs.reduce((sum, doc) => {
      return sum + (doc.data().totalRevenue || 0)
    }, 0)

    // Calculate production profit and ROI
    const productionProfit = harvestRevenue - productionCosts
    const productionROI = productionCosts > 0 ? ((productionProfit / productionCosts) * 100) : 0

    // Combined totals
    const totalRevenue = inventoryRevenue + harvestRevenue
    const totalExpenses = inventoryExpenses + productionCosts
    const netProfit = totalRevenue - totalExpenses
    const roi = totalExpenses > 0 ? ((netProfit / totalExpenses) * 100) : 0

    return {
      totalRevenue,
      totalExpenses,
      netProfit,
      roi,
      productionCosts,
      harvestRevenue,
      productionProfit,
      productionROI,
      transactions: transactions.slice(0, 10)
    }
  }

  // Generate chart data for the last 12 months
  const generateChartData = (logs) => {
    const monthlyData = Array.from({ length: 12 }, (_, i) => {
      const date = new Date()
      date.setMonth(date.getMonth() - (11 - i))
      return {
        month: date.toLocaleDateString('en-US', { month: 'short' }),
        revenue: 0,
        expenses: 0
      }
    })

    logs.forEach(log => {
      const logDate = log.timestamp
      const monthIndex = logDate.getMonth()
      const currentYear = new Date().getFullYear()
      
      if (logDate.getFullYear() === currentYear) {
        const amount = (log.quantityChange || 0) * (log.costOrValuePerUnit || 0)
        
        if (log.type === 'Sale' || log.type === 'Stock Decrease') {
          monthlyData[monthIndex].revenue += amount
        }
        if (log.type === 'Purchase' || log.type === 'Stock Increase' || log.type === 'Initial Stock') {
          monthlyData[monthIndex].expenses += amount
        }
      }
    })

    return monthlyData
  }

  // Load all financial data
  useEffect(() => {
    const loadFinancialData = async () => {
      setLoading(true)
      try {
        const logs = await fetchInventoryLogs()
        const financials = await calculateFinancials(logs)
        const chartData = generateChartData(logs)
        
        setFinancialData({
          totalRevenue: financials.totalRevenue,
          netProfit: financials.netProfit,
          totalExpenses: financials.totalExpenses,
          roi: financials.roi,
          productionCosts: financials.productionCosts,
          harvestRevenue: financials.harvestRevenue,
          productionProfit: financials.productionProfit,
          productionROI: financials.productionROI
        })
        
        setTransactions(financials.transactions)
        setChartData(chartData)
        
        await Promise.all([
          fetchProductionStats(),
          fetchRecentHarvests()
        ])
      } catch (error) {
        console.error('Error loading financial data:', error)
      } finally {
        setLoading(false)
      }
    }

    loadFinancialData()
    
    const interval = setInterval(() => {
      fetchProductionStats()
      fetchRecentHarvests()
    }, 30000)
    
    return () => clearInterval(interval)
  }, [])

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP'
    }).format(amount || 0)
  }

  // Calculate percentage change
  const calculatePercentageChange = (current, previous = 0) => {
    if (previous === 0) return current > 0 ? '+100.00%' : '0.00%'
    const change = ((current - previous) / previous) * 100
    return `${change >= 0 ? '↑' : '↓'} ${Math.abs(change).toFixed(2)}%`
  }

  // Generate SVG path for chart
  const generateChartPath = (data, key, maxValue) => {
    const width = 480
    const height = 200
    const padding = 20
    
    const points = data.map((item, index) => {
      const x = padding + (index * (width - 2 * padding)) / (data.length - 1)
      const y = height - padding - ((item[key] / maxValue) * (height - 2 * padding))
      return `${x},${y}`
    })
    
    return `M ${points.join(' L ')}`
  }

  const filteredTransactions = transactions.filter(transaction =>
    transaction.product.toLowerCase().includes(searchTerm.toLowerCase()) ||
    transaction.type.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const getQualityColor = (quality) => {
    switch (quality) {
      case 'A': return '#10b981'
      case 'B': return '#3b82f6'
      case 'C': return '#f59e0b'
      case 'D': return '#ef4444'
      default: return '#6b7280'
    }
  }

  const financialCards = [
    {
      title: 'Total Revenue',
      amount: formatCurrency(financialData.totalRevenue),
      subtitle: `Production: ${formatCurrency(financialData.harvestRevenue)}`,
      change: calculatePercentageChange(financialData.totalRevenue),
      since: 'Since last month',
      icon: '↗'
    },
    {
      title: 'Net Profit',
      amount: formatCurrency(financialData.netProfit),
      subtitle: `Production: ${formatCurrency(financialData.productionProfit)}`,
      change: calculatePercentageChange(financialData.netProfit),
      since: 'Since last month',
      icon: financialData.netProfit >= 0 ? '↗' : '↘'
    },
    {
      title: 'Expenses',
      amount: formatCurrency(financialData.totalExpenses),
      subtitle: `Production: ${formatCurrency(financialData.productionCosts)}`,
      change: calculatePercentageChange(financialData.totalExpenses), 
      since: 'Since last month',
      icon: '↗'
    },
    {
      title: 'ROI',
      amount: `${financialData.roi.toFixed(2)}%`,
      subtitle: `Production: ${financialData.productionROI.toFixed(1)}%`,
      change: calculatePercentageChange(financialData.roi),
      since: 'Since last month', 
      icon: financialData.roi >= 0 ? '↗' : '↘'
    }
  ]

  const maxChartValue = Math.max(
    ...chartData.map(d => Math.max(d.revenue, d.expenses)),
    1000
  )

  if (loading) {
    return (
      <div className="fd-dashboard-container">
        <FinanceSidebar activeMenu={activeMenu} setActiveMenu={setActiveMenu} userType={userType} />
        <div className="fd-main">
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
            Loading financial data...
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fd-dashboard-container">
      <FinanceSidebar 
        activeMenu={activeMenu}
        setActiveMenu={setActiveMenu}
        userType={userType}
      />

      <div className="fd-main">
        {/* Header */}
        <div className="fd-header">
          <h1 className="fd-title">Financial Report</h1>
          <div className="fd-header-actions">
            <div className="fd-search-box">
              <input
                type="text"
                placeholder="Search transactions..."
                className="fd-search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <span className="fd-search-icon">🔍</span>
            </div>
            <div className="fd-bell">
              🔔
              {productionStats.plantsNeedingCosting > 0 && (
                <span className="fd-notification-badge"></span>
              )}
            </div>
          </div>
        </div>

        {/* Production Stats Bar */}
        <div className="fd-production-bar">
          <div className="fd-prod-stat">
            <div className="fd-prod-icon" style={{ backgroundColor: '#e8f5e9', color: '#10b981' }}>💵</div>
            <div className="fd-prod-content">
              <span className="fd-prod-label">Plants with Costing</span>
              <span className="fd-prod-value">{productionStats.plantsWithCosting}</span>
            </div>
          </div>
          <div className={`fd-prod-stat ${productionStats.plantsNeedingCosting > 0 ? 'alert' : ''}`}>
            <div className="fd-prod-icon" style={{ backgroundColor: '#fff7ed', color: '#f59e0b' }}>⚠️</div>
            <div className="fd-prod-content">
              <span className="fd-prod-label">Need Costing</span>
              <span className="fd-prod-value">{productionStats.plantsNeedingCosting}</span>
            </div>
          </div>
          <div className="fd-prod-stat">
            <div className="fd-prod-icon" style={{ backgroundColor: '#ede9fe', color: '#9333ea' }}>✅</div>
            <div className="fd-prod-content">
              <span className="fd-prod-label">Total Harvests</span>
              <span className="fd-prod-value">{productionStats.totalHarvests}</span>
            </div>
          </div>
          <div className="fd-prod-stat">
            <div className="fd-prod-icon" style={{ backgroundColor: '#dbeafe', color: '#3b82f6' }}>📊</div>
            <div className="fd-prod-content">
              <span className="fd-prod-label">Avg Profit/Harvest</span>
              <span className="fd-prod-value">₱{parseFloat(productionStats.avgProfitPerHarvest).toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="fd-body">
          {/* Top Section */}
          <div className="fd-top">
            {/* Financial Cards */}
            <div className="fd-cards">
              {financialCards.map((card, index) => (
                <div key={index} className="fd-card">
                  <div className="fd-card-header">
                    <span className="fd-card-icon">{card.icon}</span>
                    <span className="fd-card-title">{card.title}</span>
                  </div>
                  <div className="fd-card-amount">{card.amount}</div>
                  {card.subtitle && (
                    <div className="fd-card-subtitle">{card.subtitle}</div>
                  )}
                  <div className="fd-card-footer">
                    <span className="fd-card-since">{card.since}</span>
                    <span className="fd-card-change">{card.change}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Chart */}
            <div className="fd-chart">
              <div className="fd-chart-header">
                <h3>Financial Overview</h3>
                <div className="fd-chart-controls">
                  <div className="fd-legend">
                    <div className="fd-legend-item">
                      <span className="fd-legend-dot blue"></span>
                      <span>Revenue</span>
                    </div>
                    <div className="fd-legend-item">
                      <span className="fd-legend-dot red"></span>
                      <span>Expenses</span>
                    </div>
                  </div>
                  <select 
                    className="fd-view-select"
                    value={viewMode}
                    onChange={(e) => setViewMode(e.target.value)}
                  >
                    <option>Monthly View</option>
                    <option>Weekly View</option>
                    <option>Yearly View</option>
                  </select>
                </div>
              </div>
              
              <div className="fd-chart-area">
                <div className="fd-chart-y-axis">
                  <span>{formatCurrency(maxChartValue)}</span>
                  <span>{formatCurrency(maxChartValue * 0.75)}</span>
                  <span>{formatCurrency(maxChartValue * 0.5)}</span>
                  <span>{formatCurrency(maxChartValue * 0.25)}</span>
                  <span>₱0</span>
                </div>
                
                <div className="fd-chart-canvas">
                  {chartData.length > 0 ? (
                    <svg viewBox="0 0 500 250" className="fd-svg">
                      <defs>
                        <pattern id="fdGrid" width="25" height="25" patternUnits="userSpaceOnUse">
                          <path d="M 25 0 L 0 0 0 25" fill="none" stroke="#f5f5f5" strokeWidth="1"/>
                        </pattern>
                      </defs>
                      <rect width="100%" height="100%" fill="url(#fdGrid)" />
                      
                      <path
                        d={`${generateChartPath(chartData, 'revenue', maxChartValue)} L 480 220 L 20 220 Z`}
                        fill="rgba(74, 144, 226, 0.2)"
                      />
                      
                      <path
                        d={generateChartPath(chartData, 'revenue', maxChartValue)}
                        fill="none"
                        stroke="#4A90E2"
                        strokeWidth="3"
                      />
                      
                      <path
                        d={generateChartPath(chartData, 'expenses', maxChartValue)}
                        fill="none"
                        stroke="#E94B3C"
                        strokeWidth="3"
                      />
                      
                      {chartData.map((data, index) => (
                        <g key={index}>
                          <circle 
                            cx={20 + (index * 460) / (chartData.length - 1)} 
                            cy={220 - 20 - ((data.revenue / maxChartValue) * 180)}
                            r="3" 
                            fill="#4A90E2" 
                          />
                          <circle 
                            cx={20 + (index * 460) / (chartData.length - 1)} 
                            cy={220 - 20 - ((data.expenses / maxChartValue) * 180)}
                            r="3" 
                            fill="#E94B3C" 
                          />
                        </g>
                      ))}
                    </svg>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '250px' }}>
                      No chart data available
                    </div>
                  )}
                </div>
                
                <div className="fd-chart-x-axis">
                  {chartData.map((data, index) => (
                    <span key={index}>{data.month}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Recent Harvests */}
          {recentHarvests.length > 0 && (
            <div className="fd-harvests">
              <div className="fd-harvests-header">
                <h3>Recent Harvests</h3>
              </div>
              <div className="fd-harvests-grid">
                {recentHarvests.map((harvest) => (
                  <div key={harvest.id} className="fd-harvest-card">
                    <div className="fd-harvest-header">
                      <strong>{harvest.plantName}</strong>
                      <span 
                        className="fd-harvest-quality"
                        style={{ backgroundColor: getQualityColor(harvest.quality) }}
                      >
                        {harvest.quality}
                      </span>
                    </div>
                    <div className="fd-harvest-details">
                      <span>Yield: {harvest.actualYield} {harvest.yieldUnit}</span>
                      <span className={harvest.profit >= 0 ? 'fd-profit-positive' : 'fd-profit-negative'}>
                        {formatCurrency(harvest.profit || 0)}
                      </span>
                    </div>
                    <div className="fd-harvest-date">
                      {harvest.harvestDate ? new Date(harvest.harvestDate).toLocaleDateString() : 'N/A'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Expense Transactions */}
          <div className="fd-transactions">
            <div className="fd-transactions-header">
              <h3>Recent Transactions</h3>
              <button className="fd-view-all">View all →</button>
            </div>
            
            <div className="fd-table">
              <div className="fd-table-header">
                <div>Date</div>
                <div>Product</div>
                <div>Amount</div>
                <div>Status</div>
              </div>
              
              <div className="fd-table-body">
                {filteredTransactions.length === 0 ? (
                  <div className="fd-table-row">
                    <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '20px', color: '#666' }}>
                      {searchTerm ? `No transactions found for "${searchTerm}"` : 'No transactions available'}
                    </div>
                  </div>
                ) : (
                  filteredTransactions.map((transaction, index) => (
                    <div key={index} className="fd-table-row">
                      <div>{transaction.date}</div>
                      <div>{transaction.product}</div>
                      <div>{transaction.amount}</div>
                      <div>
                        <span className={`fd-status ${transaction.status.toLowerCase()}`}>
                          {transaction.status}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Summary Statistics */}
          <div className="fd-summary">
            <div className="fd-summary-card">
              <h4>This Month</h4>
              <p>Revenue: {formatCurrency(chartData[chartData.length - 1]?.revenue || 0)}</p>
              <p>Expenses: {formatCurrency(chartData[chartData.length - 1]?.expenses || 0)}</p>
              <p>Profit: {formatCurrency((chartData[chartData.length - 1]?.revenue || 0) - (chartData[chartData.length - 1]?.expenses || 0))}</p>
            </div>
            
            <div className="fd-summary-card">
              <h4>Year to Date</h4>
              <p>Total Revenue: {formatCurrency(financialData.totalRevenue)}</p>
              <p>Total Expenses: {formatCurrency(financialData.totalExpenses)}</p>
              <p>Net Profit: {formatCurrency(financialData.netProfit)}</p>
            </div>

            <div className="fd-summary-card production">
              <h4>Production Summary</h4>
              <p>Production Costs: {formatCurrency(financialData.productionCosts)}</p>
              <p>Harvest Revenue: {formatCurrency(financialData.harvestRevenue)}</p>
              <p>Production Profit: {formatCurrency(financialData.productionProfit)}</p>
              <p>Production ROI: {financialData.productionROI.toFixed(1)}%</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default FinanceDashboard