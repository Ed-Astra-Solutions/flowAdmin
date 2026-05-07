// Flow Admin - Sponsorship Events Management
// Depends on admin.js (auth helpers, showToast, openModal/closeModal)

let events = [];
let currentEvent = null;
let isEditingEvent = false;
let eventToDelete = null;
let activeGalleryEventId = null;

const COMPRESS_MAX_DIM = 2000;     // long edge, in pixels
const COMPRESS_QUALITY = 0.82;     // 0..1
const COMPRESS_MIME = 'image/webp'; // browsers without WebP encoding fall back to JPEG

const els = {
    tableBody: document.getElementById('eventsTableBody'),
    modal: document.getElementById('eventModal'),
    form: document.getElementById('eventForm'),
    modalTitle: document.getElementById('eventModalTitle'),
    submitBtn: document.getElementById('submitEventBtn'),
    deleteModal: document.getElementById('deleteEventModal'),
    deleteName: document.getElementById('deleteEventName'),
    confirmDeleteBtn: document.getElementById('confirmDeleteEventBtn'),
    totalEvents: document.getElementById('totalEvents'),
    publishedEvents: document.getElementById('publishedEvents'),
    featuredEvents: document.getElementById('featuredEvents'),
    totalImages: document.getElementById('totalImages'),
    searchInput: document.getElementById('searchInput'),
    galleryDropzone: document.getElementById('galleryDropzone'),
    galleryFileInput: document.getElementById('galleryFileInput'),
    galleryGrid: document.getElementById('galleryGrid'),
    galleryModalTitle: document.getElementById('galleryModalTitle'),
    uploadProgressContainer: document.getElementById('uploadProgressContainer')
};

document.addEventListener('DOMContentLoaded', async () => {
    if (typeof checkAuth === 'function') {
        const ok = await checkAuth();
        if (!ok) return;
    }
    await loadEvents();
    setupEventListeners();
});

function setupEventListeners() {
    if (els.form) els.form.addEventListener('submit', handleEventSubmit);
    if (els.confirmDeleteBtn) els.confirmDeleteBtn.addEventListener('click', confirmDeleteEvent);

    const titleInput = document.getElementById('eventTitle');
    const slugInput = document.getElementById('eventSlug');
    if (titleInput && slugInput) {
        titleInput.addEventListener('input', () => {
            if (!isEditingEvent || !slugInput.dataset.touched) {
                slugInput.value = slugify(titleInput.value);
            }
        });
        slugInput.addEventListener('input', () => { slugInput.dataset.touched = 'true'; });
    }

    if (els.searchInput) {
        els.searchInput.addEventListener('input', e => {
            const q = e.target.value.toLowerCase();
            const filtered = events.filter(ev =>
                ev.title.toLowerCase().includes(q) ||
                (ev.sponsorName || '').toLowerCase().includes(q) ||
                (ev.location || '').toLowerCase().includes(q)
            );
            renderEventsTable(filtered);
        });
    }

    // Gallery dropzone
    if (els.galleryDropzone && els.galleryFileInput) {
        els.galleryDropzone.addEventListener('click', () => els.galleryFileInput.click());
        els.galleryFileInput.addEventListener('change', e => handleFiles(e.target.files));

        ['dragenter', 'dragover'].forEach(evt =>
            els.galleryDropzone.addEventListener(evt, e => {
                e.preventDefault();
                els.galleryDropzone.classList.add('dragover');
            })
        );
        ['dragleave', 'drop'].forEach(evt =>
            els.galleryDropzone.addEventListener(evt, e => {
                e.preventDefault();
                els.galleryDropzone.classList.remove('dragover');
            })
        );
        els.galleryDropzone.addEventListener('drop', e => {
            if (e.dataTransfer && e.dataTransfer.files) handleFiles(e.dataTransfer.files);
        });
    }
}

function slugify(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function escapeHtml(s) {
    return String(s || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ========== LIST ==========

async function loadEvents() {
    try {
        const response = await fetch(`${API_BASE}/sponsorship-events/admin/all`, {
            headers: getAuthHeaders()
        });
        if (!response.ok) {
            if (response.status === 401) { logout(); return; }
            throw new Error('Failed to load events');
        }
        const data = await response.json();
        events = data.data || [];
        renderEventsTable(events);
        updateStats();
    } catch (e) {
        console.error(e);
        showToast('Failed to load events', 'error');
    }
}

function updateStats() {
    if (els.totalEvents) els.totalEvents.textContent = events.length;
    if (els.publishedEvents) els.publishedEvents.textContent = events.filter(e => e.isPublished).length;
    if (els.featuredEvents) els.featuredEvents.textContent = events.filter(e => e.isFeatured).length;
    if (els.totalImages) {
        const total = events.reduce((sum, e) => sum + ((e.gallery && e.gallery.length) || 0), 0);
        els.totalImages.textContent = total.toLocaleString();
    }
}

function renderEventsTable(list) {
    if (!els.tableBody) return;
    if (!list.length) {
        els.tableBody.innerHTML = `
            <tr><td colspan="6">
                <div class="empty-state">
                    <h3>No sponsorship events yet</h3>
                    <p>Click "New Event" to add the first one.</p>
                </div>
            </td></tr>`;
        return;
    }
    els.tableBody.innerHTML = list.map(ev => `
        <tr data-id="${ev._id}">
            <td>
                <div style="display:flex; gap:10px; align-items:center;">
                    ${ev.coverImage
                        ? `<img src="${ev.coverImage}" alt="" class="event-row-image">`
                        : '<div class="event-row-image"></div>'}
                    <div>
                        <div style="font-weight:600; color:var(--text);">${escapeHtml(ev.title)}</div>
                        <div style="font-size:12px; color:var(--text-muted);">${escapeHtml(ev.location || '—')}</div>
                    </div>
                </div>
            </td>
            <td>${escapeHtml(ev.sponsorName || '—')}</td>
            <td>${ev.eventDate ? new Date(ev.eventDate).toLocaleDateString() : '—'}</td>
            <td>
                <span class="status-badge ${ev.isPublished ? 'active' : 'inactive'}">
                    <span class="status-dot"></span>${ev.isPublished ? 'Published' : 'Draft'}
                </span>
                ${ev.isFeatured ? ' <span class="featured-tag">Featured</span>' : ''}
            </td>
            <td>${(ev.gallery || []).length}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-secondary btn-icon" onclick="openGalleryModal('${ev._id}')" title="Manage Gallery">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                            <circle cx="8.5" cy="8.5" r="1.5"/>
                            <polyline points="21 15 16 10 5 21"/>
                        </svg>
                    </button>
                    <button class="btn btn-secondary btn-icon" onclick="openEditEventModal('${ev._id}')" title="Edit">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                    <button class="btn btn-secondary btn-icon" onclick="toggleEventPublish('${ev._id}')" title="${ev.isPublished ? 'Unpublish' : 'Publish'}">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            ${ev.isPublished
                                ? '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>'
                                : '<polyline points="20 6 9 17 4 12"/>'}
                        </svg>
                    </button>
                    <button class="btn btn-danger btn-icon" onclick="openDeleteEventModal('${ev._id}')" title="Delete">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

// ========== EVENT CRUD ==========

function openAddEventModal() {
    isEditingEvent = false;
    currentEvent = null;
    els.form.reset();
    els.modalTitle.textContent = 'New Event';
    els.submitBtn.textContent = 'Create Event';
    document.getElementById('eventDisplayOrder').value = 0;
    document.getElementById('eventPublished').checked = true;
    document.getElementById('eventSlug').dataset.touched = '';
    openModal('eventModal');
}

function openEditEventModal(id) {
    const ev = events.find(x => x._id === id);
    if (!ev) return;
    isEditingEvent = true;
    currentEvent = ev;
    els.modalTitle.textContent = 'Edit Event';
    els.submitBtn.textContent = 'Save Changes';
    document.getElementById('eventTitle').value = ev.title || '';
    const slugEl = document.getElementById('eventSlug');
    slugEl.value = ev.slug || '';
    slugEl.dataset.touched = 'true';
    document.getElementById('eventSponsor').value = ev.sponsorName || '';
    document.getElementById('eventDate').value = ev.eventDate ? new Date(ev.eventDate).toISOString().slice(0, 10) : '';
    document.getElementById('eventLocation').value = ev.location || '';
    document.getElementById('eventDescription').value = ev.description || '';
    document.getElementById('eventDisplayOrder').value = ev.displayOrder || 0;
    document.getElementById('eventPublished').checked = !!ev.isPublished;
    document.getElementById('eventFeatured').checked = !!ev.isFeatured;
    openModal('eventModal');
}

function closeEventModal() { closeModal('eventModal'); }

async function handleEventSubmit(e) {
    e.preventDefault();
    const payload = {
        title: document.getElementById('eventTitle').value.trim(),
        slug: document.getElementById('eventSlug').value.trim() || slugify(document.getElementById('eventTitle').value),
        sponsorName: document.getElementById('eventSponsor').value.trim(),
        eventDate: document.getElementById('eventDate').value || null,
        location: document.getElementById('eventLocation').value.trim(),
        description: document.getElementById('eventDescription').value.trim(),
        displayOrder: parseInt(document.getElementById('eventDisplayOrder').value) || 0,
        isPublished: document.getElementById('eventPublished').checked,
        isFeatured: document.getElementById('eventFeatured').checked
    };

    try {
        const url = isEditingEvent
            ? `${API_BASE}/sponsorship-events/admin/${currentEvent._id}`
            : `${API_BASE}/sponsorship-events/admin`;
        const method = isEditingEvent ? 'PUT' : 'POST';
        const response = await fetch(url, {
            method,
            headers: getAuthHeaders(),
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (!response.ok) {
            if (response.status === 401) { logout(); return; }
            throw new Error(data.error || 'Failed to save event');
        }
        showToast(isEditingEvent ? 'Event updated' : 'Event created', 'success');
        closeEventModal();
        await loadEvents();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function toggleEventPublish(id) {
    try {
        const response = await fetch(`${API_BASE}/sponsorship-events/admin/${id}/toggle-publish`, {
            method: 'PATCH',
            headers: getAuthHeaders()
        });
        if (!response.ok) throw new Error('Failed');
        showToast('Status updated', 'success');
        await loadEvents();
    } catch (e) {
        showToast('Failed to update status', 'error');
    }
}

function openDeleteEventModal(id) {
    const ev = events.find(x => x._id === id);
    if (!ev) return;
    eventToDelete = id;
    els.deleteName.textContent = ev.title;
    openModal('deleteEventModal');
}

async function confirmDeleteEvent() {
    if (!eventToDelete) return;
    try {
        const response = await fetch(`${API_BASE}/sponsorship-events/admin/${eventToDelete}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        if (!response.ok) throw new Error('Failed');
        showToast('Event deleted', 'success');
        closeModal('deleteEventModal');
        eventToDelete = null;
        await loadEvents();
    } catch {
        showToast('Failed to delete event', 'error');
    }
}

// ========== GALLERY ==========

function openGalleryModal(id) {
    const ev = events.find(x => x._id === id);
    if (!ev) return;
    activeGalleryEventId = id;
    els.galleryModalTitle.textContent = `Gallery — ${ev.title}`;
    els.uploadProgressContainer.innerHTML = '';
    renderGalleryGrid(ev.gallery || []);
    openModal('galleryModal');
}

function renderGalleryGrid(gallery) {
    if (!gallery.length) {
        els.galleryGrid.innerHTML = `<div class="gallery-empty">No images yet — drop some above.</div>`;
        return;
    }
    const sorted = [...gallery].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    els.galleryGrid.innerHTML = sorted.map((img, idx) => `
        <div class="gallery-tile" data-id="${img._id}">
            <img src="${img.url}" alt="${escapeHtml(img.alt || '')}" loading="lazy">
            <div class="tile-actions">
                <button class="tile-btn" onclick="moveImage('${img._id}', -1)" ${idx === 0 ? 'disabled' : ''}>↑</button>
                <button class="tile-btn" onclick="moveImage('${img._id}', 1)" ${idx === sorted.length - 1 ? 'disabled' : ''}>↓</button>
                <button class="tile-btn danger" onclick="deleteGalleryImage('${img._id}')">✕</button>
            </div>
        </div>
    `).join('');
}

async function handleFiles(fileList) {
    if (!activeGalleryEventId || !fileList || !fileList.length) return;
    const files = Array.from(fileList).filter(f => f.type.startsWith('image/'));
    if (!files.length) {
        showToast('Please drop image files only', 'error');
        return;
    }

    const progressId = `prog-${Date.now()}`;
    const progressEl = document.createElement('div');
    progressEl.id = progressId;
    progressEl.className = 'upload-progress';
    progressEl.innerHTML = `
        <div>Compressing 0/${files.length}…</div>
        <div class="upload-bar"><div class="upload-bar-inner" style="width:0%"></div></div>
    `;
    els.uploadProgressContainer.appendChild(progressEl);
    const label = progressEl.querySelector('div');
    const bar = progressEl.querySelector('.upload-bar-inner');

    // Compress in parallel (small concurrency to avoid memory spikes on phones)
    const compressed = [];
    let done = 0;
    const concurrency = 4;
    let cursor = 0;

    async function worker() {
        while (cursor < files.length) {
            const i = cursor++;
            try {
                const result = await compressImage(files[i]);
                compressed[i] = result;
            } catch (err) {
                console.error('Compression failed:', err);
            }
            done++;
            label.textContent = `Compressing ${done}/${files.length}…`;
            bar.style.width = `${Math.round((done / files.length) * 50)}%`;
        }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, worker));
    const valid = compressed.filter(Boolean);
    if (!valid.length) {
        progressEl.remove();
        showToast('All images failed to compress', 'error');
        return;
    }

    // Upload in batches of 10 so big drops still progress visibly.
    const batchSize = 10;
    let uploaded = 0;
    for (let i = 0; i < valid.length; i += batchSize) {
        const batch = valid.slice(i, i + batchSize);
        const fd = new FormData();
        batch.forEach(item => {
            fd.append('images', item.blob, item.filename);
            fd.append('widths', String(item.width));
            fd.append('heights', String(item.height));
            fd.append('alts', '');
        });
        try {
            const response = await fetch(
                `${API_BASE}/sponsorship-events/admin/${activeGalleryEventId}/gallery`,
                {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('adminToken')}` },
                    body: fd
                }
            );
            const data = await response.json();
            if (!response.ok) {
                if (response.status === 401) { logout(); return; }
                throw new Error(data.error || 'Upload failed');
            }
            uploaded += batch.length;
            label.textContent = `Uploaded ${uploaded}/${valid.length}…`;
            bar.style.width = `${50 + Math.round((uploaded / valid.length) * 50)}%`;
        } catch (err) {
            console.error(err);
            showToast(err.message, 'error');
        }
    }

    label.textContent = `Done — ${uploaded}/${valid.length} uploaded`;
    bar.style.width = '100%';
    setTimeout(() => progressEl.remove(), 2500);

    await loadEvents();
    const updated = events.find(e => e._id === activeGalleryEventId);
    if (updated) renderGalleryGrid(updated.gallery || []);
}

/**
 * Compress image client-side: downscale to COMPRESS_MAX_DIM long edge, encode webp.
 * Returns { blob, width, height, filename }.
 */
async function compressImage(file) {
    const bitmap = await createImageBitmapSafe(file);
    let { width, height } = bitmap;
    const long = Math.max(width, height);
    const scale = long > COMPRESS_MAX_DIM ? COMPRESS_MAX_DIM / long : 1;
    const w = Math.round(width * scale);
    const h = Math.round(height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, w, h);
    if (bitmap.close) bitmap.close();

    const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), COMPRESS_MIME, COMPRESS_QUALITY);
    });

    // Some browsers (older Safari) won't encode webp — fall back to JPEG.
    let finalBlob = blob;
    let ext = 'webp';
    if (blob.type !== COMPRESS_MIME) {
        finalBlob = await new Promise((resolve, reject) => {
            canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/jpeg', COMPRESS_QUALITY);
        });
        ext = 'jpg';
    }

    const baseName = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 60) || 'image';
    return {
        blob: finalBlob,
        width: w,
        height: h,
        filename: `${baseName}.${ext}`
    };
}

async function createImageBitmapSafe(file) {
    if (typeof createImageBitmap === 'function') {
        try { return await createImageBitmap(file); } catch (e) { /* fall through */ }
    }
    // Fallback for browsers without createImageBitmap (old Safari)
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = e => { URL.revokeObjectURL(url); reject(e); };
        img.src = url;
    });
}

async function deleteGalleryImage(imageId) {
    if (!activeGalleryEventId) return;
    if (!confirm('Delete this image?')) return;
    try {
        const response = await fetch(
            `${API_BASE}/sponsorship-events/admin/${activeGalleryEventId}/gallery/${imageId}`,
            { method: 'DELETE', headers: getAuthHeaders() }
        );
        if (!response.ok) throw new Error('Failed');
        showToast('Image removed', 'success');
        await loadEvents();
        const updated = events.find(e => e._id === activeGalleryEventId);
        if (updated) renderGalleryGrid(updated.gallery || []);
    } catch {
        showToast('Failed to delete image', 'error');
    }
}

async function moveImage(imageId, delta) {
    if (!activeGalleryEventId) return;
    const ev = events.find(e => e._id === activeGalleryEventId);
    if (!ev) return;
    const sorted = [...(ev.gallery || [])].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    const idx = sorted.findIndex(g => g._id === imageId);
    const newIdx = idx + delta;
    if (idx < 0 || newIdx < 0 || newIdx >= sorted.length) return;

    const reordered = sorted.slice();
    const [item] = reordered.splice(idx, 1);
    reordered.splice(newIdx, 0, item);

    const order = reordered.map((g, i) => ({ imageId: g._id, sortOrder: i }));

    try {
        const response = await fetch(
            `${API_BASE}/sponsorship-events/admin/${activeGalleryEventId}/gallery/reorder`,
            {
                method: 'PATCH',
                headers: getAuthHeaders(),
                body: JSON.stringify({ order })
            }
        );
        if (!response.ok) throw new Error('Failed');
        await loadEvents();
        const updated = events.find(e => e._id === activeGalleryEventId);
        if (updated) renderGalleryGrid(updated.gallery || []);
    } catch {
        showToast('Failed to reorder', 'error');
    }
}
