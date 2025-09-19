import React, { useState, useEffect } from 'react';
import FarmerSidebar from './farmersidebar';
import './farmerinventory.css';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import AddItemModal from '../modals/AddItemModal'; // external modal
import EditItemModal from '../modals/EditItemModal'; // edit modal

const FarmerInventory = ({ userType = 'farmer' }) => {
  const [activeMenu, setActiveMenu] = useState('Inventory');
  const [activeTab, setActiveTab] = useState('Seed');
  const [searchTerm, setSearchTerm] = useState('');
  const [inventoryItems, setInventoryItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [stats, setStats] = useState({
    totalItems: 0,
    lowStockItems: 0,
    lastUpdate: '-',
  });

  // Fetch inventory data
  const fetchInventory = async () => {
    setLoading(true);
    try {
      const querySnapshot = await getDocs(collection(db, 'inventory'));
      const items = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      setInventoryItems(items);

      // Compute stats for current tab
      const totalItems = items.filter(
        (item) => item.category?.toLowerCase() === activeTab.toLowerCase()
      ).length;

      const lowStockItems = items.filter(
        (item) =>
          item.category?.toLowerCase() === activeTab.toLowerCase() &&
          item.stock <= (item.lowStockThreshold || 10)
      ).length;

      const dates = items
        .map((item) =>
          item.dateAdded?.seconds
            ? new Date(item.dateAdded.seconds * 1000)
            : null
        )
        .filter(Boolean);

      const lastUpdate =
        dates.length > 0
          ? new Date(Math.max(...dates.map((d) => d.getTime()))).toLocaleDateString()
          : '-';

      setStats({ totalItems, lowStockItems, lastUpdate });
    } catch (error) {
      console.error('Error fetching inventory:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInventory();
  }, [activeTab]);

  // Filter items by category + search
  const filteredItems = inventoryItems.filter(
    (item) =>
      item.category?.toLowerCase() === activeTab.toLowerCase() &&
      item.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Handle editing an item
  const handleEditItem = (itemId) => {
    console.log('Edit item:', itemId);
    const itemToEdit = inventoryItems.find(item => item.id === itemId);
    if (itemToEdit) {
      setEditingItem(itemToEdit);
      setShowEditModal(true);
    }
  };

  // Handle opening the add modal
  const handleAddItemClick = () => {
    console.log('Add button clicked, showing modal');
    setShowModal(true);
  };

  // Handle closing the add modal
  const handleCloseModal = () => {
    console.log('Closing add modal');
    setShowModal(false);
  };

  // Handle closing the edit modal
  const handleCloseEditModal = () => {
    console.log('Closing edit modal');
    setShowEditModal(false);
    setEditingItem(null);
  };

  // Handle item added successfully
  const handleItemAdded = () => {
    console.log('Item added, refreshing inventory');
    fetchInventory(); // refresh list after adding
    setShowModal(false); // close modal after successful add
  };

  // Handle item updated successfully
  const handleItemUpdated = () => {
    console.log('Item updated, refreshing inventory');
    fetchInventory(); // refresh list after updating
    setShowEditModal(false); // close modal after successful update
    setEditingItem(null);
  };

  return (
    <div className="fai-dashboard-container">
      {/* Farmer Sidebar Component */}
      <FarmerSidebar 
        activeMenu={activeMenu}
        setActiveMenu={setActiveMenu}
        userType={userType}
      />

      {/* Main Content */}
      <div className="fai-main">
        {/* Header */}
        <div className="fai-header">
          <div className="fai-header-left">
            <h1>Farm Inventory</h1>
          </div>

          <div className="fai-header-right">
            {/* Search Bar */}
            <div className="fai-search-container">
              <div className="fai-search-icon">🔍</div>
              <input
                type="text"
                placeholder="Search..."
                className="fai-search-input"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* Notification */}
            <div className="fai-notification-btn">
              <span className="fai-notification-icon">🔔</span>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="fai-content">
          {/* Tabs */}
          <div className="fai-tabs-container">
            <button 
              className={`fai-tab-button ${activeTab === 'Seed' ? 'active' : ''}`}
              onClick={() => setActiveTab('Seed')}
            >
              Seed
            </button>
            <button 
              className={`fai-tab-button ${activeTab === 'Fertilizers' ? 'active' : ''}`}
              onClick={() => setActiveTab('Fertilizers')}
            >
              Fertilizers
            </button>
            <button 
              className={`fai-tab-button ${activeTab === 'Tools' ? 'active' : ''}`}
              onClick={() => setActiveTab('Tools')}
            >
              Farm Tools
            </button>
          </div>

          {/* Stats Cards */}
          <div className="fai-stats">
            <div className="fai-stat-card">
              <div className="fai-stat-icon green">
                {activeTab === 'Seed' ? '🌱' : activeTab === 'Fertilizers' ? '🧪' : '🔧'}
              </div>
              <div className="fai-stat-content">
                <h3 className="fai-stat-title">Total {activeTab} Items</h3>
                <p className="fai-stat-number">{stats.totalItems} Items</p>
              </div>
            </div>

            <div className="fai-stat-card">
              <div className="fai-stat-icon yellow">⚠️</div>
              <div className="fai-stat-content">
                <h3 className="fai-stat-title">Low Stock Items</h3>
                <p className="fai-stat-number">{stats.lowStockItems} Items</p>
              </div>
            </div>

            <div className="fai-stat-card">
              <div className="fai-stat-icon blue">📅</div>
              <div className="fai-stat-content">
                <h3 className="fai-stat-title">Last Inventory Update</h3>
                <p className="fai-stat-number">{stats.lastUpdate}</p>
              </div>
            </div>

            <div className="fai-stat-card">
              <div className="fai-stat-icon orange">🚜</div>
              <div className="fai-stat-content">
                <h3 className="fai-stat-title">Ready to Use</h3>
                <p className="fai-stat-number">
                  {filteredItems.filter(item => 
                    item.stock > (item.lowStockThreshold || 10)
                  ).length} Items
                </p>
              </div>
            </div>
          </div>

          {/* Inventory Table */}
          <div className="fai-table-container">
            <div className="fai-table-header">
              <div className="fai-table-cell">ITEM</div>
              <div className="fai-table-cell">STOCK</div>
              <div className="fai-table-cell">PRICE / UNIT</div>
              <div className="fai-table-cell">DATE ADDED</div>
              <div className="fai-table-cell">EXPIRATION DATE</div>
              <div className="fai-table-cell">STATUS</div>
              <div className="fai-table-cell">ACTION</div>
            </div>

            <div className="fai-table-body">
              {loading ? (
                <div className="fai-table-row">
                  <div className="fai-table-cell" style={{gridColumn: '1 / -1', textAlign: 'center'}}>
                    Loading inventory...
                  </div>
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="fai-table-row">
                  <div className="fai-table-cell" style={{gridColumn: '1 / -1', textAlign: 'center'}}>
                    No {activeTab.toLowerCase()} items found.
                  </div>
                </div>
              ) : (
                filteredItems.map((item) => (
                  <div key={item.id} className="fai-table-row">
                    <div className="fai-table-cell fai-item-name">{item.name}</div>
                    <div className="fai-table-cell fai-stock-info">
                      {item.stock} {item.unit}
                    </div>
                    <div className="fai-table-cell fai-price-info">
                      ₱{item.pricePerUnit} / {item.unit}
                    </div>
                    <div className="fai-table-cell">
                      {item.dateAdded
                        ? new Date(item.dateAdded.seconds * 1000).toLocaleDateString()
                        : '-'}
                    </div>
                    <div className="fai-table-cell">
                      {item.expirationDate
                        ? new Date(item.expirationDate.seconds * 1000).toLocaleDateString()
                        : '-'}
                    </div>
                    <div className="fai-table-cell">
                      <span 
                        className={`fai-status-badge ${
                          item.stock <= (item.lowStockThreshold || 10) ? 'low' : 'sufficient'
                        }`}
                      >
                        {item.stock <= (item.lowStockThreshold || 10)
                          ? '⚠ Low Stock'
                          : '✓ Sufficient'}
                      </span>
                    </div>
                    <div className="fai-table-cell">
                      <button 
                        className="fai-edit-button"
                        onClick={() => handleEditItem(item.id)}
                        title="Edit item"
                      >
                        ✏️
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Floating Add Button */}
          <button 
            className="fai-add-button" 
            onClick={handleAddItemClick}
            title="Add new item"
          >
            <span className="fai-add-icon">+</span>
          </button>
        </div>
      </div>

      {/* Add Item Modal */}
      {showModal && (
        <AddItemModal
          activeTab={activeTab}
          onClose={handleCloseModal}
          onItemAdded={handleItemAdded}
        />
      )}

      {/* Edit Item Modal */}
      {showEditModal && editingItem && (
        <EditItemModal
          item={editingItem}
          onClose={handleCloseEditModal}
          onItemUpdated={handleItemUpdated}
        />
      )}
    </div>
  );
};

export default FarmerInventory;