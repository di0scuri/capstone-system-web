import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './login.css'
import { db, auth } from "../firebase"; // adjust path if needed
import { collection, query, where, getDoc, doc, getDocs, updateDoc, serverTimestamp } from "firebase/firestore";
import { signInWithEmailAndPassword } from "firebase/auth"

const Login = ({ userType = 'admin' }) => {
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const navigate = useNavigate()

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
    // Clear error when user starts typing
    if (error) setError('')
  }

  // Function to update lastLogin timestamp
  const updateLastLogin = async (userId) => {
    try {
      console.log('Updating lastLogin timestamp for user:', userId);
      const userDocRef = doc(db, "users", userId);
      await updateDoc(userDocRef, {
        lastLogin: serverTimestamp()
      });
      console.log('LastLogin timestamp updated successfully');
    } catch (error) {
      console.error('Error updating lastLogin timestamp:', error);
      // Don't throw error since this is not critical for login flow
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      console.log('Attempting login with:', formData.username);
      
      // Login with Firebase Auth
      const userCredential = await signInWithEmailAndPassword(
        auth,
        formData.username,
        formData.password
      )
      const user = userCredential.user;
      console.log('Authentication successful for user:', user.uid);

      // Store authentication data in localStorage for persistence
      localStorage.setItem('user', JSON.stringify({
        uid: user.uid,
        email: user.email,
        displayName: user.displayName
      }));

      // Add a delay to ensure Firebase Auth state is established
      await new Promise(resolve => setTimeout(resolve, 1000));

      try {
        // Fetch role from Firestore
        console.log('Fetching user role from Firestore for UID:', user.uid);
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);
        
        console.log('User document exists:', userDoc.exists());
        console.log('Document data:', userDoc.data());
        
        if (userDoc.exists()) {
          const userData = userDoc.data();
          const role = userData.role;
          console.log('User role found:', role);
          
          // Update lastLogin timestamp
          await updateLastLogin(user.uid);
          
          // Store role in localStorage
          localStorage.setItem('userRole', role.toLowerCase());
          
          // Force navigation with window.location for more reliable routing
          const normalizedRole = role.toLowerCase();
          if (normalizedRole === 'admin') {
            window.location.href = '/admindashboard';
          } else if (normalizedRole === 'farmer') {
            window.location.href = '/farmerdashboard';
          } else if (normalizedRole === 'finance') {
            window.location.href = '/costing';
          } else {
            window.location.href = `/dashboard/${normalizedRole}`;
          }
          return; // Exit early to prevent further execution
        } else {
          console.error('No user document found in Firestore for UID:', user.uid);
          
          // Try alternative approach - search by email
          console.log('Trying alternative approach - searching by email...');
          const usersRef = collection(db, "users");
          const emailQuery = query(usersRef, where("email", "==", user.email));
          const querySnapshot = await getDocs(emailQuery);
          
          if (!querySnapshot.empty) {
            const foundUserDoc = querySnapshot.docs[0];
            const userData = foundUserDoc.data();
            const role = userData.role;
            console.log('User found by email with role:', role);
            
            // Update lastLogin timestamp using the document ID from the query
            await updateLastLogin(foundUserDoc.id);
            
            localStorage.setItem('userRole', role.toLowerCase());
            
            const normalizedRole = role.toLowerCase();
            if (normalizedRole === 'admin') {
              window.location.href = '/admindashboard';
            } else if (normalizedRole === 'farmer') {
              window.location.href = '/farmerdashboard';
            } else if (normalizedRole === 'finance') {
              window.location.href = '/costing';
            }
            return;
          } else {
            // If no user document found, use the userType from login selection
            console.log('No user document found, using userType:', userType);
            localStorage.setItem('userRole', userType.toLowerCase());
            
            // Try to update lastLogin with user.uid even if document doesn't exist
            // This will create the field if the document exists but doesn't have lastLogin
            try {
              await updateLastLogin(user.uid);
            } catch (updateError) {
              console.warn('Could not update lastLogin for user without Firestore document');
            }
            
            if (userType === 'farmer') {
              window.location.href = '/farmerdashboard';
            } else if (userType === 'admin') {
              window.location.href = '/admindashboard';
            } else if (userType === 'finance') {
              window.location.href = '/costing';
            }
            return;
          }
        }
      } catch (firestoreError) {
        console.error('Firestore error:', firestoreError);
        
        // Fallback: use userType and force navigation
        console.log('Using fallback navigation for userType:', userType);
        localStorage.setItem('userRole', userType.toLowerCase());
        
        // Try to update lastLogin even with Firestore error
        try {
          await updateLastLogin(user.uid);
        } catch (updateError) {
          console.warn('Could not update lastLogin due to Firestore error');
        }
        
        if (userType === 'admin') {
          window.location.href = '/admindashboard';
        } else if (userType === 'farmer') {
          window.location.href = '/farmerdashboard';
        } else if (userType === 'finance') {
          window.location.href = '/costing';
        } else {
          window.location.href = '/dashboard';
        }
      }
    } catch (authError) {
      console.error('Authentication error:', authError);
      
      if (authError.code === 'auth/user-not-found') {
        setError("No account found with this email address.");
      } else if (authError.code === 'auth/wrong-password') {
        setError("Incorrect password. Please try again.");
      } else if (authError.code === 'auth/invalid-email') {
        setError("Invalid email address format.");
      } else if (authError.code === 'auth/too-many-requests') {
        setError("Too many failed attempts. Please try again later.");
      } else if (authError.code === 'auth/invalid-credential') {
        setError("Invalid credentials. Please check your email and password.");
      } else {
        setError("Login failed. Please check your credentials and try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  const handleBackToUserSelection = () => {
    navigate('/user-selection')
  }

  const togglePassword = () => {
    setShowPassword(!showPassword)
  }

  const getUserConfig = () => {
    const configs = {
      admin: {
        title: 'ADMIN LOGIN',
        subtitle: 'System Administrator Access',
        primaryColor: '#4CAF50',
        secondaryColor: '#388E3C'
      },
      farmer: {
        title: 'FARMER LOGIN',
        subtitle: 'Farm Management Portal',
        primaryColor: '#8BC34A',
        secondaryColor: '#689F38'
      },
      finance: {
        title: 'FINANCE LOGIN',
        subtitle: 'Financial Operations Dashboard',
        primaryColor: '#66BB6A',
        secondaryColor: '#4CAF50'
      }
    }
    return configs[userType] || configs.admin
  }

  const config = getUserConfig()

  // For testing - you can remove this in production
  const handleTestLogin = () => {
    if (userType === 'farmer') {
      navigate('/farmerdashboard');
    } else if (userType === 'admin') {
      navigate('/admindashboard');
    } else if (userType === 'finance') {
      navigate('/financedashboard');
    }
  }
  
  return (
    <div className="login-page">
      <div className="background-image"></div>
      
      <div className="green-overlay"></div>
      
      <div className="login-content">
        <button className="back-button" onClick={handleBackToUserSelection}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M15 10H5M5 10L10 15M5 10L10 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Back to User Selection
        </button>

        <div className="logo-container">
          <div className="logo-circle">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L13.5 8.5L20 7L14.5 12L20 17L13.5 15.5L12 22L10.5 15.5L4 17L9.5 12L4 7L10.5 8.5L12 2Z" fill="currentColor"/>
            </svg>
          </div>
        </div>
        
        <h1 className="site-title">AGRITRACK</h1>
        
        <div className="login-form-container">
          <h2 className="form-title" style={{ color: config.primaryColor }}>
            {config.title}
          </h2>
          <p className="form-subtitle">{config.subtitle}</p>
          
          {error && (
            <div className="error-message" style={{ 
              background: '#ffebee', 
              color: '#c62828', 
              padding: '12px', 
              borderRadius: '6px', 
              marginBottom: '16px',
              border: '1px solid #ffcdd2'
            }}>
              {error}
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="login-form">
            <div className="input-group">
              <input
                type="email"
                name="username"
                placeholder="Email"
                value={formData.username}
                onChange={handleInputChange}
                className="form-input"
                required
                disabled={loading}
              />
            </div>
            
            <div className="input-group password-group">
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                placeholder="Password"
                value={formData.password}
                onChange={handleInputChange}
                className="form-input"
                required
                disabled={loading}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={togglePassword}
                disabled={loading}
              >
                {showPassword ? '🙈' : '👁'}
              </button>
            </div>
            
            <button 
              type="submit" 
              className="login-button"
              style={{
                background: loading ? '#ccc' : `linear-gradient(135deg, ${config.primaryColor}, ${config.secondaryColor})`,
                cursor: loading ? 'not-allowed' : 'pointer'
              }}
              disabled={loading}
            >
              {loading ? 'Logging in...' : `Login as ${userType.charAt(0).toUpperCase() + userType.slice(1)}`}
            </button>
            
            {/* Test button - remove in production */}
            <button 
              type="button" 
              className="test-button"
              onClick={handleTestLogin}
              style={{
                background: 'transparent',
                border: '2px solid #ddd',
                color: '#666',
                padding: '12px 24px',
                borderRadius: '6px',
                marginTop: '8px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              Test Login (Skip Authentication)
            </button>
            
            <button type="button" className="switch-user-button" onClick={handleBackToUserSelection}>
              Switch User Type
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default Login