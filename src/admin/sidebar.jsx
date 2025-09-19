import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { signOut } from 'firebase/auth'
import { db, auth } from '../firebase'
import './sidebar.css'

const Sidebar = ({ activeMenu, setActiveMenu }) => {
  const navigate = useNavigate()
  const location = useLocation()

  // Function to update lastLogout timestamp
  const updateLastLogout = async (userId) => {
    try {
      console.log('Updating lastLogout timestamp for user:', userId);
      const userDocRef = doc(db, "users", userId);
      await updateDoc(userDocRef, {
        lastLogout: serverTimestamp()
      });
      console.log('LastLogout timestamp updated successfully');
    } catch (error) {
      console.error('Error updating lastLogout timestamp:', error);
      // Don't throw error since logout should continue even if timestamp update fails
    }
  }

  const handleLogout = async () => {
    try {
      // Get current user before signing out
      const currentUser = auth.currentUser;
      
      if (currentUser) {
        // Update lastLogout timestamp
        await updateLastLogout(currentUser.uid);
      }

      // Sign out from Firebase Auth
      await signOut(auth);
      
      // Clear localStorage
      localStorage.removeItem('user');
      localStorage.removeItem('userRole');
      
      console.log('User logged out successfully');
      
      // Navigate to user selection
      navigate('/user-selection');
    } catch (error) {
      console.error('Error during logout:', error);
      
      // Even if there's an error, still navigate to user selection
      // Clear localStorage as a fallback
      localStorage.removeItem('user');
      localStorage.removeItem('userRole');
      navigate('/user-selection');
    }
  }

  const handleMenuClick = (menuName) => {
    setActiveMenu && setActiveMenu(menuName)
    
    const routes = {
      'Overview': '/overview/admin',
      'Inventory': '/inventory/admin',
      'Costing & Pricing': '/costing/admin',
      'Planting': '/planting/admin',
      'Settings': '/settings/admin',
    }
    
    const route = routes[menuName]
    if (route) {
      navigate(route)
    }
  }

  // Detect current active menu from URL
  const getCurrentActiveMenu = () => {
    const path = location.pathname
    if (path.startsWith('/admin/overview')) return 'Overview'
    if (path.startsWith('/admin/inventory')) return 'Inventory'
    if (path.startsWith('/admin/costing')) return 'Costing & Pricing'
    if (path.startsWith('/admin/planting')) return 'Planting'
    if (path.startsWith('/admin/settings')) return 'Settings'
    return activeMenu || 'Overview'
  }

  const currentActiveMenu = getCurrentActiveMenu()

  const menuItems = [
    { name: 'Overview', icon: '📊' },
    { name: 'Inventory', icon: '📦'},
    { name: 'Costing & Pricing', icon: '💰'},
    { name: 'Planting', icon: '🌱' },
    { name: 'Settings', icon: '⚙️' },
  ]

  return (
    <div className="admin-sidebar">
      <div className="admin-sidebar-header">
        <div className="admin-logo-section">
          <div className="admin-logo-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L13.5 8.5L20 7L14.5 12L20 17L13.5 15.5L12 22L10.5 15.5L4 17L9.5 12L4 7L10.5 8.5L12 2Z" fill="currentColor"/>
            </svg>
          </div>
          <div className="admin-logo-text">
            <h2>AGRITRACK</h2>
            <p>Admin</p>
          </div>
        </div>
      </div>

      <nav className="admin-sidebar-nav">
        {menuItems.map((item, index) => (
          <button
            key={index}
            className={`admin-nav-item ${currentActiveMenu === item.name ? 'active' : ''}`}
            onClick={() => handleMenuClick(item.name)}
          >
            <span className="admin-nav-icon">{item.icon}</span>
            <span className="admin-nav-text">{item.name}</span>
          </button>
        ))}
      </nav>

      <div className="admin-sidebar-footer">
        <button className="admin-logout-btn" onClick={handleLogout}>
          <span className="admin-nav-icon">🚪</span>
          <span className="admin-nav-text">Log out</span>
        </button>
      </div>
    </div>
  )
}

export default Sidebar