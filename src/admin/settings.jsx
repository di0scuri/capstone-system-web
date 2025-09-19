import React, { useState, useEffect } from 'react'
import Sidebar from './sidebar'
import './settings.css'
import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { db, auth } from '../firebase'

const Settings = ({ userType = 'admin' }) => {
  const [activeMenu, setActiveMenu] = useState('Settings')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedUsers, setSelectedUsers] = useState([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('') // Added missing error state
  const [addUserData, setAddUserData] = useState({
    displayName: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'Farmer'
  })
  const [addUserLoading, setAddUserLoading] = useState(false)
  const [activeFilter, setActiveFilter] = useState('All')
  const [showFilterDropdown, setShowFilterDropdown] = useState(false)

  // Filter options
  const filterOptions = ['All', 'Admin', 'Farmer', 'Finance']

  // Fetch users from Firebase
  const fetchUsers = async () => {
    setLoading(true)
    try {
      const querySnapshot = await getDocs(collection(db, 'users'))
      const usersData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate ? doc.data().createdAt.toDate() : new Date(),
        lastLogin: doc.data().lastLogin?.toDate ? doc.data().lastLogin.toDate() : null,
        lastLogout: doc.data().lastLogout?.toDate ? doc.data().lastLogout.toDate() : null
      }))
      
      setUsers(usersData)
    } catch (error) {
      console.error('Error fetching users:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUsers()
  }, [])

  // Filter users based on active filter and search term
  const filteredUsers = users.filter(user => {
    const matchesSearch = user.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.email?.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesFilter = activeFilter === 'All' || user.role === activeFilter
    
    return matchesSearch && matchesFilter
  })

  // Calculate user counts for each filter
  const userCounts = {
    All: users.length,
    Admin: users.filter(u => u.role === 'Admin').length,
    Farmer: users.filter(u => u.role === 'Farmer').length,
    Finance: users.filter(u => u.role === 'Finance').length
  }

  // Handle filter change
  const handleFilterChange = (filter) => {
    setActiveFilter(filter)
    setShowFilterDropdown(false)
    setSelectedUsers([]) // Clear selected users when filter changes
  }

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedUsers(filteredUsers.map(user => user.id))
    } else {
      setSelectedUsers([])
    }
  }

  const handleSelectUser = (userId) => {
    setSelectedUsers(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    )
  }

  const handleAddNew = () => {
    setShowAddModal(true)
    setAddUserData({
      displayName: '',
      email: '',
      password: '',
      confirmPassword: '',
      role: 'Farmer'
    })
    setError('')
  }

  const handleCloseModal = () => {
    setShowAddModal(false)
    setAddUserData({
      displayName: '',
      email: '',
      password: '',
      confirmPassword: '',
      role: 'Farmer'
    })
    setError('')
  }

  const handleInputChange = (field, value) => {
    setAddUserData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleCreateUser = async () => {
    if (!addUserData.displayName.trim() || !addUserData.email.trim() || !addUserData.password.trim() || !addUserData.confirmPassword.trim()) {
      setError('Please fill in all required fields')
      return
    }

    if (addUserData.password.length < 6) {
      setError('Password must be at least 6 characters long')
      return
    }

    if (addUserData.password !== addUserData.confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setAddUserLoading(true)
    setError('')

    try {
      // Create user in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        addUserData.email,
        addUserData.password
      )
      
      const user = userCredential.user

      // Create user document in Firestore (without password)
      const userDocData = {
        displayName: addUserData.displayName,
        email: addUserData.email,
        role: addUserData.role,
        createdAt: serverTimestamp(),
        lastLogin: null,
        lastLogout: null,
        isActive: true
      }

      await setDoc(doc(db, 'users', user.uid), userDocData)

      // Update local state
      const newUser = {
        id: user.uid,
        ...userDocData,
        createdAt: new Date(),
        lastLogin: null,
        lastLogout: null
      }

      setUsers(prev => [...prev, newUser])
      handleCloseModal()

      alert('User created successfully!')
    } catch (error) {
      console.error('Error creating user:', error)
      
      // Handle specific Firebase Auth errors
      if (error.code === 'auth/email-already-in-use') {
        setError('Email is already in use')
      } else if (error.code === 'auth/invalid-email') {
        setError('Invalid email address')
      } else if (error.code === 'auth/weak-password') {
        setError('Password is too weak')
      } else {
        setError('Failed to create user. Please try again.')
      }
    } finally {
      setAddUserLoading(false)
    }
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showFilterDropdown && !event.target.closest('.settings-filter')) {
        setShowFilterDropdown(false)
      }
    }

    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [showFilterDropdown])

  const handleDeleteUser = async (userId) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return

    try {
      await deleteDoc(doc(db, 'users', userId))
      setUsers(prev => prev.filter(user => user.id !== userId))
      setSelectedUsers(prev => prev.filter(id => id !== userId))
      alert('User deleted successfully')
    } catch (error) {
      console.error('Error deleting user:', error)
      alert('Failed to delete user. Please try again.')
    }
  }

  const handleBulkDelete = async () => {
    if (selectedUsers.length === 0) return
    
    if (!window.confirm(`Are you sure you want to delete ${selectedUsers.length} user(s)?`)) return

    try {
      const deletePromises = selectedUsers.map(userId => 
        deleteDoc(doc(db, 'users', userId))
      )
      
      await Promise.all(deletePromises)
      
      setUsers(prev => prev.filter(user => !selectedUsers.includes(user.id)))
      setSelectedUsers([])
      alert(`Successfully deleted ${selectedUsers.length} user(s)`)
    } catch (error) {
      console.error('Error deleting users:', error)
      alert('Failed to delete some users. Please try again.')
    }
  }

  const handleAction = (userId) => {
    const user = users.find(u => u.id === userId)
    if (user) {
      const action = window.confirm(`Delete user: ${user.displayName}?`)
      if (action) {
        handleDeleteUser(userId)
      }
    }
  }

  const getUserAvatar = (user) => {
    if (user.photoURL) return user.photoURL
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || user.email)}&background=4CAF50&color=fff`
  }

  const formatDateTime = (date) => {
    if (!date) return '--'
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })
  }

  return (
    <div className="dashboard-container">
      {/* Sidebar */}
      <Sidebar 
        activeMenu={activeMenu}
        setActiveMenu={setActiveMenu}
        userType={userType}
      />

      {/* Main Content */}
      <div className="settings-main">
        {/* Header */}
        <div className="settings-header">
          <h1 className="settings-title">User Management</h1>
          <div className="settings-header-actions">
            <div className="settings-search-box">
              <input
                type="text"
                placeholder="Search users..."
                className="settings-search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <span className="settings-search-icon">🔍</span>
            </div>
            <div className="settings-bell">🔔</div>
          </div>
        </div>

        {/* Content */}
        <div className="settings-body">
          {/* Controls */}
          <div className="settings-controls">
            <div className="settings-filter" onClick={() => setShowFilterDropdown(!showFilterDropdown)}>
              <span className="filter-text">{activeFilter} ({userCounts[activeFilter]})</span>
              <span className="filter-arrow">▼</span>
              
              {showFilterDropdown && (
                <div className="filter-dropdown">
                  {filterOptions.map(option => (
                    <div
                      key={option}
                      className={`filter-option ${activeFilter === option ? 'active' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleFilterChange(option)
                      }}
                    >
                      <span className="option-text">{option}</span>
                      <span className="option-count">({userCounts[option]})</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="settings-actions">
              {selectedUsers.length > 0 && (
                <button className="settings-delete-btn" onClick={handleBulkDelete}>
                  🗑️ Delete Selected ({selectedUsers.length})
                </button>
              )}
              
              <button className="settings-add-btn" onClick={handleAddNew}>
                <span className="add-icon">+</span>
                ADD NEW
              </button>
            </div>

            <div className="settings-menu-icon">
              ⚙️
            </div>
          </div>

          {/* Table */}
          <div className="settings-table">
            {/* Table Header */}
            <div className="settings-table-header">
              <div className="header-cell checkbox-cell">
                <input
                  type="checkbox"
                  onChange={handleSelectAll}
                  checked={selectedUsers.length === filteredUsers.length && filteredUsers.length > 0}
                />
              </div>
              <div className="header-cell image-cell">Avatar</div>
              <div className="header-cell name-cell">
                Name
                <span className="sort-icon">⇅</span>
              </div>
              <div className="header-cell email-cell">Email</div>
              <div className="header-cell date-cell">Date Added</div>
              <div className="header-cell title-cell">
                Role
                <span className="sort-icon">⇅</span>
              </div>
              <div className="header-cell login-cell">Last Login</div>
              <div className="header-cell logout-cell">Last Logout</div>
              <div className="header-cell action-cell">Action</div>
            </div>

            {/* Table Body */}
            <div className="settings-table-body">
              {loading ? (
                <div className="settings-table-row loading-row">
                  <div className="table-cell" style={{gridColumn: '1 / -1', textAlign: 'center', padding: '40px'}}>
                    Loading users...
                  </div>
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="settings-table-row no-data-row">
                  <div className="table-cell" style={{gridColumn: '1 / -1', textAlign: 'center', padding: '40px'}}>
                    {searchTerm ? `No users found matching "${searchTerm}"` : 'No users found'}
                  </div>
                </div>
              ) : (
                filteredUsers.map((user) => (
                  <div key={user.id} className="settings-table-row">
                    <div className="table-cell checkbox-cell">
                      <input
                        type="checkbox"
                        checked={selectedUsers.includes(user.id)}
                        onChange={() => handleSelectUser(user.id)}
                      />
                    </div>
                    <div className="table-cell image-cell">
                      <img 
                        src={getUserAvatar(user)} 
                        alt={user.displayName || user.email} 
                        className="user-avatar" 
                      />
                    </div>
                    <div className="table-cell name-cell">
                      {user.displayName || 'Unnamed User'}
                    </div>
                    <div className="table-cell email-cell">
                      {user.email}
                    </div>
                    <div className="table-cell date-cell">
                      {user.createdAt ? user.createdAt.toLocaleDateString() : 'Unknown'}
                    </div>
                    <div className="table-cell title-cell">
                      <span className={`role-badge ${user.role?.toLowerCase() || 'unknown'}`}>
                        {user.role || 'Unknown'}
                      </span>
                    </div>
                    <div className="table-cell login-cell">
                      {formatDateTime(user.lastLogin)}
                    </div>
                    <div className="table-cell logout-cell">
                      {formatDateTime(user.lastLogout)}
                    </div>
                    <div className="table-cell action-cell">
                      <button 
                        className="action-btn"
                        onClick={() => handleAction(user.id)}
                        title="Delete User"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Add User Modal */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3 style={{ color: '#4CAF50' }}>Add New User</h3>
              <button className="modal-close" onClick={handleCloseModal}>×</button>
            </div>
            
            <div className="modal-body">
              {error && (
                <div className="error-message">
                  {error}
                </div>
              )}
              
              <div className="form-group">
                <label>Display Name *</label>
                <input
                  type="text"
                  value={addUserData.displayName}
                  onChange={(e) => handleInputChange('displayName', e.target.value)}
                  className="form-input"
                  placeholder="Enter user's full name"
                  required
                />
              </div>

              <div className="form-group">
                <label>Email *</label>
                <input
                  type="email"
                  value={addUserData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  className="form-input"
                  placeholder="Enter email address"
                  required
                />
              </div>

              <div className="form-group">
                <label>Password *</label>
                <input
                  type="password"
                  value={addUserData.password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                  className="form-input"
                  placeholder="Enter password (min. 6 characters)"
                  minLength="6"
                  required
                />
              </div>

              <div className="form-group">
                <label>Confirm Password *</label>
                <input
                  type="password"
                  value={addUserData.confirmPassword}
                  onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                  className="form-input"
                  placeholder="Confirm password"
                  minLength="6"
                  required
                />
                {addUserData.password && addUserData.confirmPassword && addUserData.password !== addUserData.confirmPassword && (
                  <small className="password-mismatch">Passwords do not match</small>
                )}
              </div>

              <div className="form-group">
                <label>Role *</label>
                <select
                  value={addUserData.role}
                  onChange={(e) => handleInputChange('role', e.target.value)}
                  className="form-select"
                  required
                >
                  <option value="Admin">Administrator</option>
                  <option value="Farmer">Farmer</option>
                  <option value="Finance">Finance</option>
                </select>
              </div>
            </div>

            <div className="modal-footer">
              <button 
                className="btn btn-cancel" 
                onClick={handleCloseModal}
                disabled={addUserLoading}
              >
                Cancel
              </button>
              <button 
                className="btn btn-primary" 
                onClick={handleCreateUser}
                disabled={addUserLoading}
              >
                {addUserLoading ? 'Creating...' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Settings