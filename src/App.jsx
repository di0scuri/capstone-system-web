import React, { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { auth, db } from './firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'

// Pages
import User from './admin/user'
import Login from './admin/login'
import AdminDashboard from './admin/admindashboard'
import FarmerDashboard from './farmer/farmerdashboard'
import FinanceDashboard from './finance/financedashboard'
import Inventory from './admin/inventory'
import Costing from './admin/costing'
import Planting from './admin/planting'
import Settings from './admin/settings'
import Greenhouse from './admin/greenhouse'
import Sensors from './admin/sensors'
import FarmerPlants from './farmer/farmerplants'
import FarmerInventory from './farmer/farmerinventory'
import FarmerCalendar from './farmer/farmercalendar'
import FarmerSensors from './farmer/farmersensors'
import FinanceInventory from './finance/financeinventory'
import FinanceCosting from './finance/financecosting'
import './App.css'

// Protected Route Component
const ProtectedRoute = ({ children, allowedRoles, user }) => {
  // If no user passed from App, check localStorage as fallback
  let currentUser = user;
  
  if (!currentUser) {
    const storedUser = localStorage.getItem('user');
    const isAuthenticated = localStorage.getItem('isAuthenticated');
    
    if (storedUser && isAuthenticated) {
      try {
        currentUser = JSON.parse(storedUser);
      } catch (e) {
        console.error('Error parsing stored user data:', e);
        currentUser = null;
      }
    }
  }

  // Check if user is authenticated
  if (!currentUser) {
    return <Navigate to="/user-selection" replace />
  }

  // Check role if specified (handle case insensitive comparison and array of roles)
  if (allowedRoles) {
    const rolesArray = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
    const userRole = currentUser.role ? currentUser.role.toLowerCase() : '';
    const hasAccess = rolesArray.some(role => role.toLowerCase() === userRole);
    
    if (!hasAccess) {
      console.log(`Role mismatch: User role "${currentUser.role}" vs Required roles "${rolesArray.join(', ')}"`);
      return <Navigate to="/user-selection" replace />
    }
  }

  return children
}

function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          // Fetch role from Firestore
          const userDoc = await getDoc(doc(db, "users", firebaseUser.uid))
          if (userDoc.exists()) {
            const userData = { uid: firebaseUser.uid, ...userDoc.data() };
            setUser(userData);
            // Also store in localStorage for consistency
            localStorage.setItem('user', JSON.stringify(userData));
            localStorage.setItem('isAuthenticated', 'true');
            console.log('Firebase user authenticated:', userData);
          } else {
            console.log('No Firestore document for user:', firebaseUser.uid);
            setUser(null);
          }
        } catch (error) {
          console.error('Error fetching user document:', error);
          // Check localStorage as fallback
          const storedUser = localStorage.getItem('user');
          const isAuthenticated = localStorage.getItem('isAuthenticated');
          
          if (storedUser && isAuthenticated) {
            try {
              const parsedUser = JSON.parse(storedUser);
              setUser(parsedUser);
              console.log('Using stored user data:', parsedUser);
            } catch (e) {
              console.error('Error parsing stored user:', e);
              setUser(null);
            }
          } else {
            setUser(null);
          }
        }
      } else {
        console.log('No Firebase user, checking localStorage...');
        // Check localStorage as fallback when no Firebase user
        const storedUser = localStorage.getItem('user');
        const isAuthenticated = localStorage.getItem('isAuthenticated');
        
        if (storedUser && isAuthenticated) {
          try {
            const parsedUser = JSON.parse(storedUser);
            setUser(parsedUser);
            console.log('Using localStorage user:', parsedUser);
          } catch (e) {
            console.error('Error parsing stored user:', e);
            setUser(null);
          }
        } else {
          setUser(null);
        }
      }
      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  if (loading) return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      height: '100vh',
      fontSize: '18px'
    }}>
      Loading...
    </div>
  );

  return (
    <Router>
      <div className="App">
        <Routes>
          {/* Default route redirects to user selection */}
          <Route path="/" element={<Navigate to="/user-selection" replace />} />

          {/* User selection page */}
          <Route path="/user-selection" element={<User />} />

          {/* Login pages for different user types */}
          <Route path="/login/admin" element={<Login userType="admin" />} />
          <Route path="/login/farmer" element={<Login userType="farmer" />} />
          <Route path="/login/finance" element={<Login userType="finance" />} />

          {/* Dashboard routes (protected) */}
          <Route
            path="/dashboard/admin"
            element={
              <ProtectedRoute user={user} allowedRoles="Admin">
                <AdminDashboard userType="admin" user={user} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/farmer"
            element={
              <ProtectedRoute user={user} allowedRoles="Farmer">
                <FarmerDashboard userType="farmer" user={user} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/finance"
            element={
              <ProtectedRoute user={user} allowedRoles="Finance">
                <FinanceDashboard userType="finance" user={user} />
              </ProtectedRoute>
            }
          />

          {/* Admin routes */}
          <Route
            path="/overview/admin"
            element={
              <ProtectedRoute user={user} allowedRoles="Admin">
                <AdminDashboard userType="admin" user={user} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admindashboard"
            element={
              <ProtectedRoute user={user} allowedRoles="Admin">
                <AdminDashboard userType="admin" user={user} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/inventory/admin"
            element={
              <ProtectedRoute user={user} allowedRoles="Admin">
                <Inventory userType="admin" user={user} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/inventory"
            element={
              <ProtectedRoute user={user} allowedRoles="Admin">
                <Inventory userType="admin" user={user} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/costing/admin"
            element={
              <ProtectedRoute user={user} allowedRoles="Admin">
                <Costing userType="admin" user={user} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/costing"
            element={
              <ProtectedRoute user={user} allowedRoles="Admin">
                <Costing userType="admin" user={user} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/planting/admin"
            element={
              <ProtectedRoute user={user} allowedRoles="Admin">
                <Planting userType="admin" user={user} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/planting"
            element={
              <ProtectedRoute user={user} allowedRoles="Admin">
                <Planting userType="admin" user={user} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings/admin"
            element={
              <ProtectedRoute user={user} allowedRoles="Admin">
                <Settings userType="admin" user={user} />
              </ProtectedRoute>
            }
          />

          {/* Greenhouse routes - ADMIN ONLY */}
          <Route
            path="/greenhouse/admin"
            element={
              <ProtectedRoute user={user} allowedRoles="Admin">
                <Greenhouse userType="admin" user={user} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/greenhouse"
            element={
              <ProtectedRoute user={user} allowedRoles="Admin">
                <Greenhouse userType="admin" user={user} />
              </ProtectedRoute>
            }
          />

          {/* Sensors routes - ADMIN AND FARMER */}
          <Route
            path="/sensors/admin"
            element={
              <ProtectedRoute user={user} allowedRoles={["Admin", "Farmer"]}>
                <Sensors userType="admin" user={user} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/sensors"
            element={
              <ProtectedRoute user={user} allowedRoles={["Admin", "Farmer"]}>
                <Sensors userType={user?.role?.toLowerCase() === 'farmer' ? 'farmer' : 'admin'} user={user} />
              </ProtectedRoute>
            }
          />

          {/* Farmer routes */}
          <Route
            path="/farmer/overview"
            element={
              <ProtectedRoute user={user} allowedRoles="Farmer">
                <FarmerDashboard userType="farmer" user={user} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/farmer/plants"
            element={
              <ProtectedRoute user={user} allowedRoles="Farmer">
                <FarmerPlants userType="farmer" user={user} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/farmer/calendar"
            element={
              <ProtectedRoute user={user} allowedRoles="Farmer">
                <FarmerCalendar userType="farmer" user={user} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/farmercalendar"
            element={
              <ProtectedRoute user={user} allowedRoles="Farmer">
                <FarmerCalendar userType="farmer" user={user} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/farmer/inventory"
            element={
              <ProtectedRoute user={user} allowedRoles="Farmer">
                <FarmerInventory userType="farmer" user={user} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/farmer/sensors"
            element={
              <ProtectedRoute user={user} allowedRoles="Farmer">
                <Sensors userType="farmer" user={user} />
              </ProtectedRoute>
            }
          />

          {/* Finance routes */}
          <Route
            path="/finance/overview"
            element={
              <ProtectedRoute user={user} allowedRoles="Finance">
                <FinanceDashboard userType="finance" user={user} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/finance/inventory"
            element={
              <ProtectedRoute user={user} allowedRoles="Finance">
                <FinanceInventory userType="finance" user={user} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/finance/costing-pricing"
            element={
              <ProtectedRoute user={user} allowedRoles="Finance">
                <FinanceCosting userType="finance" user={user} />
              </ProtectedRoute>
            }
          />

          {/* Catch all route - redirect to user selection */}
          <Route path="*" element={<Navigate to="/user-selection" replace />} />
        </Routes>
      </div>
    </Router>
  )
}

export default App