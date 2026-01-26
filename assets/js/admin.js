/**
 * Flow Admin Console - Main JavaScript
 */

// API Configuration
const API_BASE = '/api';

// Auth Configuration
const AUTH_API = '/api/admin';

// State
let products = [];
let currentProduct = null;
let isEditing = false;
let currentAdmin = null;

// ========== AUTH HELPERS ==========
function getAuthHeaders() {
    const token = localStorage.getItem('adminToken');
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };
}

function isAuthenticated() {
    return !!localStorage.getItem('adminToken');
}

function isSuperAdmin() {
    const adminData = localStorage.getItem('adminData');
    if (!adminData) return false;
    try {
        const admin = JSON.parse(adminData);
        return admin.role === 'superadmin';
    } catch {
        return false;
    }
}

function getCurrentAdmin() {
    const adminData = localStorage.getItem('adminData');
    if (!adminData) return null;
    try {
        return JSON.parse(adminData);
    } catch {
        return null;
    }
}

function logout() {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminData');
    window.location.href = '/admin/login.html';
}

async function checkAuth() {
    if (!isAuthenticated()) {
        window.location.href = '/admin/login.html';
        return false;
    }
    
    try {
        const response = await fetch(`${AUTH_API}/me`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) {
            logout();
            return false;
        }
        
        const data = await response.json();
        currentAdmin = data.data;
        localStorage.setItem('adminData', JSON.stringify(currentAdmin));
        updateUserInfo();
        return true;
    } catch (error) {
        console.error('Auth check failed:', error);
        logout();
        return false;
    }
}

function updateUserInfo() {
    const admin = getCurrentAdmin();
    if (!admin) return;
    
    const userNameEl = document.querySelector('.user-name');
    const userRoleEl = document.querySelector('.user-role');
    const userAvatarEl = document.querySelector('.user-avatar');
    const adminsNavItem = document.getElementById('adminsNavItem');
    
    if (userNameEl) userNameEl.textContent = admin.name || 'Admin';
    if (userRoleEl) userRoleEl.textContent = admin.role === 'superadmin' ? 'Super Admin' : 'Admin';
    if (userAvatarEl) userAvatarEl.textContent = (admin.name || 'A').charAt(0).toUpperCase();
    
    // Show "Manage Admins" link only for superadmins
    if (adminsNavItem && admin.role === 'superadmin') {
        adminsNavItem.style.display = 'flex';
    }
}

// DOM Elements
const elements = {
    productsTableBody: document.getElementById('productsTableBody'),
    productModal: document.getElementById('productModal'),
    productForm: document.getElementById('productForm'),
    modalTitle: document.getElementById('modalTitle'),
    deleteModal: document.getElementById('deleteModal'),
    toastContainer: document.getElementById('toastContainer'),
    searchInput: document.getElementById('searchInput'),
    totalProducts: document.getElementById('totalProducts'),
    activeProducts: document.getElementById('activeProducts'),
    featuredProducts: document.getElementById('featuredProducts'),
    loadingSpinner: document.getElementById('loadingSpinner')
};

// ========== INITIALIZATION ==========
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

async function initializeApp() {
    // Check authentication first
    const isAuthed = await checkAuth();
    if (!isAuthed) return;
    
    await loadProducts();
    setupEventListeners();
    updateStats();
}

// ========== EVENT LISTENERS ==========
function setupEventListeners() {
    // Search
    if (elements.searchInput) {
        elements.searchInput.addEventListener('input', debounce(handleSearch, 300));
    }

    // Modal close on overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeAllModals();
            }
        });
    });

    // Escape key to close modals
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeAllModals();
        }
    });

    // Form submission
    if (elements.productForm) {
        elements.productForm.addEventListener('submit', handleProductSubmit);
    }

    // Sidebar toggle for mobile
    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.querySelector('.sidebar');
    if (menuToggle && sidebar) {
        menuToggle.addEventListener('click', () => {
            sidebar.classList.toggle('open');
        });
    }
}

// ========== PRODUCTS CRUD ==========
async function loadProducts() {
    showLoading(true);
    try {
        const response = await fetch(`${API_BASE}/products/admin/all`, {
            headers: getAuthHeaders()
        });
        if (!response.ok) {
            if (response.status === 401) {
                logout();
                return;
            }
            throw new Error('Failed to load products');
        }
        const data = await response.json();
        products = data.data || [];
        renderProductsTable();
        updateStats();
    } catch (error) {
        console.error('Error loading products:', error);
        showToast('Failed to load products', 'error');
    } finally {
        showLoading(false);
    }
}

function renderProductsTable() {
    if (!elements.productsTableBody) return;

    if (products.length === 0) {
        elements.productsTableBody.innerHTML = `
            <tr>
                <td colspan="6">
                    <div class="empty-state">
                        <div class="empty-icon">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                            </svg>
                        </div>
                        <h3>No products yet</h3>
                        <p>Start by adding your first product to the catalog.</p>
                        <button class="btn btn-primary" onclick="openAddProductModal()">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                            </svg>
                            Add Product
                        </button>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    elements.productsTableBody.innerHTML = products.map(product => {
        // Handle flavours - they can be objects with 'name' property or plain strings
        const flavourNames = (product.flavours || []).map(f => typeof f === 'object' ? f.name : f);
        
        return `
        <tr data-id="${product._id}">
            <td>
                <div class="product-cell">
                    <div class="product-thumb">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                        </svg>
                    </div>
                    <div class="product-info">
                        <h4>${product.name}</h4>
                        <span>${product.slug}</span>
                    </div>
                </div>
            </td>
            <td>
                <div class="flavours-list">
                    ${flavourNames.slice(0, 2).map(f => `<span class="flavour-tag">${f}</span>`).join('')}
                    ${flavourNames.length > 2 ? `<span class="flavour-more">+${flavourNames.length - 2}</span>` : ''}
                </div>
            </td>
            <td>₹${getLowestPrice(product.packSizes).toLocaleString()}</td>
            <td>${(product.packSizes || []).length} sizes</td>
            <td>
                <span class="status-badge ${product.isActive ? 'active' : 'inactive'}">
                    <span class="status-dot"></span>
                    ${product.isActive ? 'Active' : 'Inactive'}
                </span>
            </td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-secondary btn-icon" onclick="openEditProductModal('${product._id}')" title="Edit">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                    <button class="btn btn-danger btn-icon" onclick="openDeleteModal('${product._id}')" title="Delete">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                    </button>
                </div>
            </td>
        </tr>
    `}).join('');
}

function getLowestPrice(packSizes) {
    if (!packSizes || packSizes.length === 0) return 0;
    return Math.min(...packSizes.map(p => p.price));
}

// ========== PRODUCT MODAL ==========
function openAddProductModal() {
    isEditing = false;
    currentProduct = null;
    if (elements.modalTitle) elements.modalTitle.textContent = 'Add New Product';
    resetProductForm();
    addPackSizeRow(); // Add one empty pack size row
    openModal('productModal');
}

async function openEditProductModal(productId) {
    isEditing = true;
    currentProduct = products.find(p => p._id === productId);
    if (!currentProduct) {
        showToast('Product not found', 'error');
        return;
    }
    
    if (elements.modalTitle) elements.modalTitle.textContent = 'Edit Product';
    populateProductForm(currentProduct);
    openModal('productModal');
}

function populateProductForm(product) {
    // Basic fields
    document.getElementById('productName').value = product.name || '';
    document.getElementById('productSlug').value = product.slug || '';
    document.getElementById('productShortDesc').value = product.shortDescription || '';
    document.getElementById('productDesc').value = product.description || '';
    document.getElementById('productActive').checked = product.isActive;
    document.getElementById('productFeatured').checked = product.isFeatured;

    // Flavours
    document.querySelectorAll('input[name="flavours"]').forEach(checkbox => {
        checkbox.checked = product.flavours.includes(checkbox.value);
    });

    // Pack sizes
    const packSizesContainer = document.getElementById('packSizesContainer');
    packSizesContainer.innerHTML = '';
    if (product.packSizes && product.packSizes.length > 0) {
        product.packSizes.forEach(packSize => {
            addPackSizeRow(packSize);
        });
    } else {
        addPackSizeRow();
    }

    // Ingredients
    document.getElementById('productIngredients').value = (product.ingredients || []).join(', ');

    // Highlights
    document.getElementById('productHighlights').value = (product.highlights || []).join('\n');
}

function resetProductForm() {
    if (elements.productForm) elements.productForm.reset();
    document.getElementById('packSizesContainer').innerHTML = '';
}

async function handleProductSubmit(e) {
    e.preventDefault();
    
    const formData = getFormData();
    if (!validateFormData(formData)) return;

    const submitBtn = document.getElementById('submitProductBtn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="loading-spinner" style="width:20px;height:20px;margin:0 auto;"></span>';

    try {
        const url = isEditing 
            ? `${API_BASE}/products/admin/${currentProduct._id}`
            : `${API_BASE}/products/admin`;
        
        const method = isEditing ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method,
            headers: getAuthHeaders(),
            body: JSON.stringify(formData)
        });

        if (!response.ok) {
            if (response.status === 401) {
                logout();
                return;
            }
            const error = await response.json();
            throw new Error(error.error || 'Failed to save product');
        }

        showToast(isEditing ? 'Product updated successfully' : 'Product created successfully', 'success');
        closeAllModals();
        await loadProducts();
    } catch (error) {
        console.error('Error saving product:', error);
        showToast(error.message, 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = isEditing ? 'Update Product' : 'Create Product';
    }
}

function getFormData() {
    // Get flavours
    const flavours = Array.from(document.querySelectorAll('input[name="flavours"]:checked'))
        .map(cb => cb.value);

    // Get pack sizes
    const packSizes = Array.from(document.querySelectorAll('.pack-size-item')).map(item => ({
        size: item.querySelector('.pack-size').value,
        sachets: parseInt(item.querySelector('.pack-sachets').value) || 0,
        price: parseFloat(item.querySelector('.pack-price').value) || 0,
        originalPrice: parseFloat(item.querySelector('.pack-original-price').value) || 0,
        savings: item.querySelector('.pack-savings').value || ''
    })).filter(p => p.size && p.price > 0);

    // Get ingredients
    const ingredientsStr = document.getElementById('productIngredients').value;
    const ingredients = ingredientsStr.split(',').map(i => i.trim()).filter(i => i);

    // Get highlights
    const highlightsStr = document.getElementById('productHighlights').value;
    const highlights = highlightsStr.split('\n').map(h => h.trim()).filter(h => h);

    return {
        name: document.getElementById('productName').value.trim(),
        slug: document.getElementById('productSlug').value.trim(),
        shortDescription: document.getElementById('productShortDesc').value.trim(),
        description: document.getElementById('productDesc').value.trim(),
        flavours,
        packSizes,
        ingredients,
        highlights,
        isActive: document.getElementById('productActive').checked,
        isFeatured: document.getElementById('productFeatured').checked
    };
}

function validateFormData(data) {
    if (!data.name) {
        showToast('Product name is required', 'error');
        return false;
    }
    if (!data.slug) {
        showToast('Product slug is required', 'error');
        return false;
    }
    if (data.flavours.length === 0) {
        showToast('Select at least one flavour', 'error');
        return false;
    }
    if (data.packSizes.length === 0) {
        showToast('Add at least one pack size', 'error');
        return false;
    }
    return true;
}

// ========== PACK SIZES ==========
function addPackSizeRow(data = {}) {
    const container = document.getElementById('packSizesContainer');
    const row = document.createElement('div');
    row.className = 'pack-size-item';
    row.innerHTML = `
        <input type="text" class="pack-size" placeholder="Size" value="${data.size || ''}">
        <input type="number" class="pack-sachets" placeholder="Sachets" value="${data.sachets || ''}">
        <input type="number" class="pack-price" placeholder="Price (₹)" value="${data.price || ''}">
        <input type="number" class="pack-original-price" placeholder="Original (₹)" value="${data.originalPrice || ''}">
        <input type="text" class="pack-savings" placeholder="Savings text" value="${data.savings || ''}">
        <button type="button" class="remove-pack-btn" onclick="removePackSizeRow(this)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
        </button>
    `;
    container.appendChild(row);
}

function removePackSizeRow(btn) {
    const row = btn.closest('.pack-size-item');
    const container = document.getElementById('packSizesContainer');
    if (container.children.length > 1) {
        row.remove();
    } else {
        showToast('At least one pack size is required', 'error');
    }
}

// ========== DELETE ==========
let productToDelete = null;

function openDeleteModal(productId) {
    productToDelete = productId;
    const product = products.find(p => p._id === productId);
    if (product) {
        document.getElementById('deleteProductName').textContent = product.name;
    }
    openModal('deleteModal');
}

async function confirmDelete() {
    if (!productToDelete) return;

    const deleteBtn = document.getElementById('confirmDeleteBtn');
    deleteBtn.disabled = true;
    deleteBtn.textContent = 'Deleting...';

    try {
        const response = await fetch(`${API_BASE}/products/admin/${productToDelete}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });

        if (!response.ok) {
            if (response.status === 401) {
                logout();
                return;
            }
            throw new Error('Failed to delete product');
        }

        showToast('Product deleted successfully', 'success');
        closeAllModals();
        await loadProducts();
    } catch (error) {
        console.error('Error deleting product:', error);
        showToast('Failed to delete product', 'error');
    } finally {
        deleteBtn.disabled = false;
        deleteBtn.textContent = 'Delete';
        productToDelete = null;
    }
}

// ========== SEED DATABASE ==========
async function seedDatabase() {
    if (!confirm('This will add sample products to the database. Continue?')) return;

    try {
        const response = await fetch(`${API_BASE}/products/admin/seed`, {
            method: 'POST',
            headers: getAuthHeaders()
        });

        if (!response.ok) {
            if (response.status === 401) {
                logout();
                return;
            }
            throw new Error('Failed to seed database');
        }

        showToast('Database seeded successfully', 'success');
        await loadProducts();
    } catch (error) {
        console.error('Error seeding database:', error);
        showToast('Failed to seed database', 'error');
    }
}

// ========== SEARCH ==========
function handleSearch(e) {
    const query = e.target.value.toLowerCase().trim();
    
    if (!query) {
        renderProductsTable();
        return;
    }

    const filtered = products.filter(product => 
        product.name.toLowerCase().includes(query) ||
        product.slug.toLowerCase().includes(query) ||
        product.flavours.some(f => f.toLowerCase().includes(query))
    );

    renderFilteredProducts(filtered);
}

function renderFilteredProducts(filteredProducts) {
    // Temporarily replace products array for rendering
    const originalProducts = products;
    products = filteredProducts;
    renderProductsTable();
    products = originalProducts;
}

// ========== STATS ==========
function updateStats() {
    if (elements.totalProducts) {
        elements.totalProducts.textContent = products.length;
    }
    if (elements.activeProducts) {
        elements.activeProducts.textContent = products.filter(p => p.isActive).length;
    }
    if (elements.featuredProducts) {
        elements.featuredProducts.textContent = products.filter(p => p.isFeatured).length;
    }
}

// ========== MODALS ==========
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

function closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.classList.remove('active');
    });
    document.body.style.overflow = '';
}

// ========== TOAST NOTIFICATIONS ==========
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <svg class="toast-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            ${type === 'success' 
                ? '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>'
                : '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>'}
        </svg>
        <span class="toast-message">${message}</span>
    `;

    if (elements.toastContainer) {
        elements.toastContainer.appendChild(toast);
        
        // Trigger animation
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        // Auto remove
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

// ========== LOADING STATE ==========
function showLoading(show) {
    if (elements.loadingSpinner) {
        elements.loadingSpinner.style.display = show ? 'block' : 'none';
    }
}

// ========== UTILITIES ==========
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Auto-generate slug from name
document.getElementById('productName')?.addEventListener('input', function() {
    if (!isEditing) {
        const slug = this.value
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '');
        document.getElementById('productSlug').value = slug;
    }
});
