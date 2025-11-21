import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { signOut } from 'firebase/auth'
import { db, auth } from '../firebase'
import './financesidebar.css'

const FinanceSidebar = ({ activeMenu, setActiveMenu }) => {
  const navigate = useNavigate()
  const location = useLocation()

  const updateLastLogout = async (userId) => {
    try {
      const userDocRef = doc(db, "users", userId);
      await updateDoc(userDocRef, {
        lastLogout: serverTimestamp()
      });
    } catch (error) {
      console.error('Error updating lastLogout timestamp:', error);
    }
  }

  const handleLogout = async () => {
    try {
      const currentUser = auth.currentUser;
      
      if (currentUser) {
        await updateLastLogout(currentUser.uid);
      }

      await signOut(auth);
      localStorage.removeItem('user');
      localStorage.removeItem('userRole');
      navigate('/user-selection');
    } catch (error) {
      console.error('Error during logout:', error);
      localStorage.removeItem('user');
      localStorage.removeItem('userRole');
      navigate('/user-selection');
    }
  }

  const handleMenuClick = (menuName) => {
    setActiveMenu && setActiveMenu(menuName)
    
    const routes = {
      'Overview': '/finance/overview',
      'Inventory': '/finance/inventory',
      'Costing & Pricing': '/finance/costing-pricing',
      'Production': '/production',
      'Harvests': '/harvests',
      'Reports': '/reports'
    }
    
    const route = routes[menuName]
    if (route) {
      navigate(route)
    }
  }

  const getCurrentActiveMenu = () => {
    const path = location.pathname
    if (path.includes('/finance/overview')) return 'Overview'
    if (path.includes('/finance/inventory')) return 'Inventory'
    if (path.includes('/finance/costing-pricing')) return 'Costing & Pricing'
    if (path.includes('/production')) return 'Production'
    if (path.includes('/harvests')) return 'Harvests'
    if (path.includes('/reports')) return 'Reports'
    return activeMenu || 'Overview'
  }

  const currentActiveMenu = getCurrentActiveMenu()

  const menuItems = [
    { name: 'Overview', icon: '📊', section: 'main' },
    { name: 'Inventory', icon: '📦', section: 'main' },
    { name: 'Costing & Pricing', icon: '💰', section: 'main' },
    { name: 'Production', icon: '🌿', section: 'production', label: 'Production Costs' },
    { name: 'Harvests', icon: '🌾', section: 'production' },
    { name: 'Reports', icon: '📈', section: 'production' }
  ]

  return (
    <div className="finance-sidebar">
      <div className="finance-sidebar-header">
        <div className="finance-logo-section">
          <div className="finance-logo-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L13.5 8.5L20 7L14.5 12L20 17L13.5 15.5L12 22L10.5 15.5L4 17L9.5 12L4 7L10.5 8.5L12 2Z" fill="currentColor"/>
            </svg>
          </div>
          <div className="finance-logo-text">
            <h2>AGRITRACK</h2>
            <p>Finance</p>
          </div>
        </div>
      </div>

      <nav className="finance-sidebar-nav">
        {menuItems.filter(item => item.section === 'main').map((item, index) => (
          <button
            key={index}
            className={`finance-nav-item ${currentActiveMenu === item.name ? 'active' : ''}`}
            onClick={() => handleMenuClick(item.name)}
          >
            <span className="finance-nav-icon">{item.icon}</span>
            <span className="finance-nav-text">{item.label || item.name}</span>
          </button>
        ))}

        <div className="finance-nav-divider">
          <span>Production</span>
        </div>

        {menuItems.filter(item => item.section === 'production').map((item, index) => (
          <button
            key={index}
            className={`finance-nav-item ${currentActiveMenu === item.name ? 'active' : ''}`}
            onClick={() => handleMenuClick(item.name)}
          >
            <span className="finance-nav-icon">{item.icon}</span>
            <span className="finance-nav-text">{item.label || item.name}</span>
          </button>
        ))}
      </nav>

      <div className="finance-sidebar-footer">
        <button className="finance-logout-btn" onClick={handleLogout}>
          <span className="finance-nav-icon">🚪</span>
          <span className="finance-nav-text">Log out</span>
        </button>
      </div>
    </div>
  )
}

export default FinanceSidebar