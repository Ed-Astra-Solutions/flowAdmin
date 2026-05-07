// Flow Admin - Blogs Management
// Depends on admin.js (auth helpers, showToast, openModal/closeModal)

let blogs = [];
let currentBlog = null;
let isEditingBlog = false;
let blogToDelete = null;

const blogElements = {
    tableBody: document.getElementById('blogsTableBody'),
    modal: document.getElementById('blogModal'),
    form: document.getElementById('blogForm'),
    modalTitle: document.getElementById('blogModalTitle'),
    submitBtn: document.getElementById('submitBlogBtn'),
    deleteModal: document.getElementById('deleteBlogModal'),
    deleteName: document.getElementById('deleteBlogName'),
    confirmDeleteBtn: document.getElementById('confirmDeleteBlogBtn'),
    totalBlogs: document.getElementById('totalBlogs'),
    publishedBlogs: document.getElementById('publishedBlogs'),
    featuredBlogs: document.getElementById('featuredBlogs'),
    totalViews: document.getElementById('totalViews'),
    faqsContainer: document.getElementById('faqsContainer'),
    searchInput: document.getElementById('searchInput')
};

document.addEventListener('DOMContentLoaded', async () => {
    if (typeof checkAuth === 'function') {
        const ok = await checkAuth();
        if (!ok) return;
    }
    await loadBlogs();
    setupBlogEventListeners();
});

function setupBlogEventListeners() {
    if (blogElements.form) {
        blogElements.form.addEventListener('submit', handleBlogSubmit);
    }
    if (blogElements.confirmDeleteBtn) {
        blogElements.confirmDeleteBtn.addEventListener('click', confirmDeleteBlog);
    }
    setupCoverUploader();
    const titleInput = document.getElementById('blogTitle');
    const slugInput = document.getElementById('blogSlug');
    if (titleInput && slugInput) {
        titleInput.addEventListener('input', () => {
            if (!isEditingBlog || !slugInput.dataset.touched) {
                slugInput.value = slugify(titleInput.value);
            }
        });
        slugInput.addEventListener('input', () => {
            slugInput.dataset.touched = 'true';
        });
    }
    if (blogElements.searchInput) {
        blogElements.searchInput.addEventListener('input', (e) => {
            const q = e.target.value.toLowerCase();
            const filtered = blogs.filter(b =>
                b.title.toLowerCase().includes(q) ||
                (b.category || '').toLowerCase().includes(q) ||
                (b.tags || []).some(t => t.toLowerCase().includes(q))
            );
            renderBlogsTable(filtered);
        });
    }
}

function slugify(str) {
    return String(str || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
}

async function loadBlogs() {
    try {
        const response = await fetch(`${API_BASE}/blogs/admin/all`, {
            headers: getAuthHeaders()
        });
        if (!response.ok) {
            if (response.status === 401) { logout(); return; }
            throw new Error('Failed to load blogs');
        }
        const data = await response.json();
        blogs = data.data || [];
        renderBlogsTable(blogs);
        updateBlogStats();
    } catch (error) {
        console.error(error);
        showToast('Failed to load blogs', 'error');
    }
}

function updateBlogStats() {
    if (blogElements.totalBlogs) blogElements.totalBlogs.textContent = blogs.length;
    if (blogElements.publishedBlogs) blogElements.publishedBlogs.textContent = blogs.filter(b => b.isPublished).length;
    if (blogElements.featuredBlogs) blogElements.featuredBlogs.textContent = blogs.filter(b => b.isFeatured).length;
    if (blogElements.totalViews) {
        const v = blogs.reduce((sum, b) => sum + (b.views || 0), 0);
        blogElements.totalViews.textContent = v.toLocaleString();
    }
}

function renderBlogsTable(list) {
    if (!blogElements.tableBody) return;
    if (!list.length) {
        blogElements.tableBody.innerHTML = `
            <tr><td colspan="6">
                <div class="empty-state">
                    <h3>No blogs yet</h3>
                    <p>Click "New Blog Post" to create your first article.</p>
                </div>
            </td></tr>`;
        return;
    }
    blogElements.tableBody.innerHTML = list.map(b => `
        <tr data-id="${b._id}">
            <td>
                <div style="display:flex; gap:10px; align-items:center;">
                    ${b.coverImage ? `<img src="${b.coverImage}" alt="" class="blog-row-image">` : '<div class="blog-row-image"></div>'}
                    <div>
                        <div style="font-weight:600; color:var(--text);">${escapeHtml(b.title)}</div>
                        <div style="font-size:12px; color:var(--text-muted);">/blog/${b.slug}</div>
                    </div>
                </div>
            </td>
            <td><span class="blog-tag">${escapeHtml(b.category || '—')}</span></td>
            <td>
                <span class="status-badge ${b.isPublished ? 'active' : 'inactive'}">
                    <span class="status-dot"></span>${b.isPublished ? 'Published' : 'Draft'}
                </span>
                ${b.isFeatured ? ' <span class="blog-tag" style="background:rgba(255,193,7,0.15); color:#ffc107;">Featured</span>' : ''}
            </td>
            <td>${(b.views || 0).toLocaleString()}</td>
            <td>${b.publishedAt ? new Date(b.publishedAt).toLocaleDateString() : '—'}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-secondary btn-icon" onclick="openEditBlogModal('${b._id}')" title="Edit">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                    <button class="btn btn-secondary btn-icon" onclick="toggleBlogPublish('${b._id}')" title="${b.isPublished ? 'Unpublish' : 'Publish'}">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            ${b.isPublished
                                ? '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>'
                                : '<polyline points="20 6 9 17 4 12"/>'}
                        </svg>
                    </button>
                    <button class="btn btn-danger btn-icon" onclick="openDeleteBlogModal('${b._id}')" title="Delete">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

function escapeHtml(s) {
    return String(s || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function openAddBlogModal() {
    isEditingBlog = false;
    currentBlog = null;
    blogElements.form.reset();
    blogElements.modalTitle.textContent = 'New Blog Post';
    blogElements.submitBtn.textContent = 'Create Blog';
    document.getElementById('blogReadTime').value = 5;
    document.getElementById('blogAuthor').value = 'Flow Hydration Team';
    document.getElementById('blogPublished').checked = true;
    document.getElementById('blogSlug').dataset.touched = '';
    blogElements.faqsContainer.innerHTML = '';
    updateCoverPreview('');
    openModal('blogModal');
}

function openEditBlogModal(id) {
    const b = blogs.find(x => x._id === id);
    if (!b) return;
    isEditingBlog = true;
    currentBlog = b;
    blogElements.modalTitle.textContent = 'Edit Blog Post';
    blogElements.submitBtn.textContent = 'Save Changes';
    document.getElementById('blogTitle').value = b.title || '';
    const slugEl = document.getElementById('blogSlug');
    slugEl.value = b.slug || '';
    slugEl.dataset.touched = 'true';
    document.getElementById('blogCategory').value = b.category || '';
    document.getElementById('blogExcerpt').value = b.excerpt || '';
    document.getElementById('blogCoverImage').value = b.coverImage || '';
    updateCoverPreview(b.coverImage || '');
    document.getElementById('blogAuthor').value = b.author || '';
    document.getElementById('blogReadTime').value = b.readTime || 5;
    document.getElementById('blogTags').value = (b.tags || []).join(', ');
    document.getElementById('blogContent').value = b.content || '';
    document.getElementById('blogKeyTakeaways').value = (b.keyTakeaways || []).join('\n');
    document.getElementById('seoMetaTitle').value = b.seo?.metaTitle || '';
    document.getElementById('seoMetaDescription').value = b.seo?.metaDescription || '';
    document.getElementById('seoMetaKeywords').value = b.seo?.metaKeywords || '';
    document.getElementById('blogPublished').checked = b.isPublished;
    document.getElementById('blogFeatured').checked = b.isFeatured;
    blogElements.faqsContainer.innerHTML = '';
    (b.faq || []).forEach(f => addFaqRow(f.question, f.answer));
    openModal('blogModal');
}

function closeBlogModal() {
    closeModal('blogModal');
}

function addFaqRow(q = '', a = '') {
    const row = document.createElement('div');
    row.className = 'faq-item';
    row.innerHTML = `
        <input type="text" placeholder="Question" value="${escapeHtml(q)}">
        <textarea rows="2" placeholder="Answer">${escapeHtml(a)}</textarea>
        <button type="button" class="remove-btn" onclick="this.parentElement.remove()">Remove</button>
    `;
    blogElements.faqsContainer.appendChild(row);
}

function collectFaqs() {
    const rows = blogElements.faqsContainer.querySelectorAll('.faq-item');
    const faqs = [];
    rows.forEach(r => {
        const q = r.querySelector('input').value.trim();
        const a = r.querySelector('textarea').value.trim();
        if (q && a) faqs.push({ question: q, answer: a });
    });
    return faqs;
}

async function handleBlogSubmit(e) {
    e.preventDefault();
    const tags = document.getElementById('blogTags').value
        .split(',').map(t => t.trim()).filter(Boolean);
    const keyTakeaways = document.getElementById('blogKeyTakeaways').value
        .split('\n').map(t => t.trim()).filter(Boolean);
    const faq = collectFaqs();

    const payload = {
        title: document.getElementById('blogTitle').value.trim(),
        slug: document.getElementById('blogSlug').value.trim() || slugify(document.getElementById('blogTitle').value),
        excerpt: document.getElementById('blogExcerpt').value.trim(),
        content: document.getElementById('blogContent').value,
        coverImage: document.getElementById('blogCoverImage').value.trim(),
        author: document.getElementById('blogAuthor').value.trim(),
        category: document.getElementById('blogCategory').value.trim() || 'Hydration',
        readTime: parseInt(document.getElementById('blogReadTime').value) || 5,
        tags,
        keyTakeaways,
        faq,
        seo: {
            metaTitle: document.getElementById('seoMetaTitle').value.trim(),
            metaDescription: document.getElementById('seoMetaDescription').value.trim(),
            metaKeywords: document.getElementById('seoMetaKeywords').value.trim()
        },
        isPublished: document.getElementById('blogPublished').checked,
        isFeatured: document.getElementById('blogFeatured').checked
    };

    try {
        const url = isEditingBlog ? `${API_BASE}/blogs/admin/${currentBlog._id}` : `${API_BASE}/blogs/admin`;
        const method = isEditingBlog ? 'PUT' : 'POST';
        const response = await fetch(url, {
            method,
            headers: getAuthHeaders(),
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (!response.ok) {
            if (response.status === 401) { logout(); return; }
            throw new Error(data.error || 'Failed to save blog');
        }
        showToast(isEditingBlog ? 'Blog updated' : 'Blog created', 'success');
        closeBlogModal();
        await loadBlogs();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function toggleBlogPublish(id) {
    try {
        const response = await fetch(`${API_BASE}/blogs/admin/${id}/toggle-publish`, {
            method: 'PATCH',
            headers: getAuthHeaders()
        });
        if (!response.ok) throw new Error('Failed');
        showToast('Status updated', 'success');
        await loadBlogs();
    } catch (e) {
        showToast('Failed to update status', 'error');
    }
}

function openDeleteBlogModal(id) {
    const b = blogs.find(x => x._id === id);
    if (!b) return;
    blogToDelete = id;
    blogElements.deleteName.textContent = b.title;
    openModal('deleteBlogModal');
}

async function confirmDeleteBlog() {
    if (!blogToDelete) return;
    try {
        const response = await fetch(`${API_BASE}/blogs/admin/${blogToDelete}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        if (!response.ok) throw new Error('Failed');
        showToast('Blog deleted', 'success');
        closeModal('deleteBlogModal');
        blogToDelete = null;
        await loadBlogs();
    } catch (e) {
        showToast('Failed to delete blog', 'error');
    }
}

// ========== COVER IMAGE UPLOAD ==========

const COVER_MAX_DIM = 1600;     // long edge in px
const COVER_QUALITY = 0.82;     // 0..1
const COVER_MIME = 'image/webp'; // JPEG fallback applied automatically

function setupCoverUploader() {
    const urlInput = document.getElementById('blogCoverImage');
    const fileInput = document.getElementById('blogCoverFileInput');
    const uploadBtn = document.getElementById('blogCoverUploadBtn');
    const clearBtn = document.getElementById('blogCoverClearBtn');
    if (!urlInput || !fileInput || !uploadBtn) return;

    urlInput.addEventListener('input', () => updateCoverPreview(urlInput.value.trim()));
    uploadBtn.addEventListener('click', () => fileInput.click());
    clearBtn.addEventListener('click', () => {
        urlInput.value = '';
        updateCoverPreview('');
        fileInput.value = '';
    });
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        await uploadCoverImage(file);
        // Reset so same file can be re-selected
        fileInput.value = '';
    });
}

function updateCoverPreview(url) {
    const preview = document.getElementById('blogCoverPreview');
    const clearBtn = document.getElementById('blogCoverClearBtn');
    if (!preview) return;
    if (url) {
        preview.innerHTML = `<img src="${url}" alt="Cover preview" onerror="this.parentElement.innerHTML='<span>Image failed</span>'">`;
        if (clearBtn) clearBtn.style.display = 'inline-flex';
    } else {
        preview.innerHTML = '<span>No image</span>';
        if (clearBtn) clearBtn.style.display = 'none';
    }
}

async function uploadCoverImage(file) {
    const status = document.getElementById('blogCoverStatus');
    const uploadBtn = document.getElementById('blogCoverUploadBtn');
    const urlInput = document.getElementById('blogCoverImage');

    if (!file.type.startsWith('image/')) {
        if (status) { status.textContent = 'Not an image'; status.className = 'cover-upload-status error'; }
        return;
    }

    try {
        if (status) { status.textContent = 'Compressing…'; status.className = 'cover-upload-status'; }
        if (uploadBtn) uploadBtn.disabled = true;

        const compressed = await compressCoverImage(file);

        if (status) status.textContent = 'Uploading…';
        const fd = new FormData();
        fd.append('cover', compressed.blob, compressed.filename);

        const response = await fetch(`${API_BASE}/blogs/admin/upload-cover`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('adminToken')}` },
            body: fd
        });
        const data = await response.json();
        if (!response.ok) {
            if (response.status === 401) { logout(); return; }
            throw new Error(data.error || data.message || 'Upload failed');
        }

        urlInput.value = data.data.url;
        updateCoverPreview(data.data.url);
        if (status) {
            const kb = Math.round(compressed.blob.size / 1024);
            status.textContent = `Uploaded (${kb} KB)`;
            status.className = 'cover-upload-status success';
        }
        showToast('Cover image uploaded', 'success');
    } catch (err) {
        console.error('Cover upload failed:', err);
        if (status) { status.textContent = err.message || 'Upload failed'; status.className = 'cover-upload-status error'; }
        showToast(err.message || 'Upload failed', 'error');
    } finally {
        if (uploadBtn) uploadBtn.disabled = false;
    }
}

async function compressCoverImage(file) {
    const bitmap = await loadBitmap(file);
    const longEdge = Math.max(bitmap.width, bitmap.height);
    const scale = longEdge > COVER_MAX_DIM ? COVER_MAX_DIM / longEdge : 1;
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    if (bitmap.close) bitmap.close();

    let blob = await canvasToBlob(canvas, COVER_MIME, COVER_QUALITY);
    let ext = 'webp';
    if (!blob || blob.type !== COVER_MIME) {
        blob = await canvasToBlob(canvas, 'image/jpeg', COVER_QUALITY);
        ext = 'jpg';
    }
    if (!blob) throw new Error('Could not encode image');

    const baseName = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 60) || 'cover';
    return { blob, width: w, height: h, filename: `${baseName}.${ext}` };
}

function canvasToBlob(canvas, mime, quality) {
    return new Promise(resolve => canvas.toBlob(resolve, mime, quality));
}

async function loadBitmap(file) {
    if (typeof createImageBitmap === 'function') {
        try { return await createImageBitmap(file); } catch {}
    }
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = e => { URL.revokeObjectURL(url); reject(e); };
        img.src = url;
    });
}
