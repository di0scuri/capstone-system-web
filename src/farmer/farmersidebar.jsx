import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { signOut } from 'firebase/auth'
import { db, auth } from '../firebase'
import './farmersidebar.css'

const FarmerSidebar = ({ activeMenu, setActiveMenu }) => {
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
      'Overview': '/farmer/overview',
      'Plants': '/farmer/plants',
      'Calendar': '/farmer/calendar',
      'Inventory': '/farmer/inventory',
      'Harvests': '/harvests',
      'Reports': '/reports'
    }

    const route = routes[menuName]
    if (route) navigate(route)
  }

  const getCurrentActiveMenu = () => {
    const path = location.pathname
    if (path.startsWith('/farmer/overview') || path.startsWith('/dashboard/farmer')) return 'Overview'
    if (path.startsWith('/farmer/plants')) return 'Plants'
    if (path.startsWith('/farmer/calendar')) return 'Calendar'
    if (path.startsWith('/farmer/inventory')) return 'Inventory'
    if (path.startsWith('/harvests')) return 'Harvests'
    if (path.startsWith('/reports')) return 'Reports'
    return activeMenu || 'Overview'
  }

  const currentActiveMenu = getCurrentActiveMenu()

  const menuItems = [
    { name: 'Overview', icon: '📊', section: 'main' },
    { name: 'Plants', icon: '🌱', section: 'main' },
    { name: 'Calendar', icon: '📅', section: 'main' },
    { name: 'Inventory', icon: '📦', section: 'main' },
    { name: 'Harvests', icon: '🌾', section: 'production' },
    { name: 'Reports', icon: '📈', section: 'production' }
  ]

  return (
    <div className="farmer-sidebar">
      <div className="farmer-sidebar-header">
        <div className="farmer-logo-section">
          <div className="farmer-logo-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L13.5 8.5L20 7L14.5 12L20 17L13.5 15.5L12 22L10.5 15.5L4 17L9.5 12L4 7L10.5 8.5L12 2Z" fill="currentColor"/>
            </svg>
          </div>
          <div className="farmer-logo-text">
            <h2>AGRITRACK</h2>
            <p>Farmer</p>
          </div>
        </div>
      </div>

      <nav className="farmer-sidebar-nav">
        {menuItems.filter(item => item.section === 'main').map((item, index) => (
          <button
            key={index}
            className={`farmer-nav-item ${currentActiveMenu === item.name ? 'active' : ''}`}
            onClick={() => handleMenuClick(item.name)}
          >
            <span className="farmer-nav-icon">{item.icon}</span>
            <span className="farmer-nav-text">{item.name}</span>
          </button>
        ))}

        <div className="farmer-nav-divider">
          <span>Performance</span>
        </div>

        {menuItems.filter(item => item.section === 'production').map((item, index) => (
          <button
            key={index}
            className={`farmer-nav-item ${currentActiveMenu === item.name ? 'active' : ''}`}
            onClick={() => handleMenuClick(item.name)}
          >
            <span className="farmer-nav-icon">{item.icon}</span>
            <span className="farmer-nav-text">{item.name}</span>
          </button>
        ))}
      </nav>

      <div className="farmer-sidebar-footer">
        <button className="farmer-logout-btn" onClick={handleLogout}>
          <span className="farmer-nav-icon">🚪</span>
          <span className="farmer-nav-text">Log out</span>
        </button>
      </div>
    </div>
  )
}

export default FarmerSidebar