// ============================================================
// KONFIGURASI — ganti URL dengan Apps Script Anda
// ============================================================
const API_URL = 'https://script.google.com/macros/s/AKfycbwiwrWHJN8qYS35pbwaqh5Yr9KHRix3o97nXmLEdLaZfjbc6k-G03YHwqfq7lWj04AZ/exec';

// State global
let currentUser = null;
let attendanceStatus = null;
let projectInfo = null;
let profilePhotoFileId = '';
let camStream = null;
let currentSelfieBase64 = null;
let currentLocation = null;
let currentMode = 'in';
let recapYear = new Date().getFullYear();
let recapMonth = new Date().getMonth() + 1;
let lateLimitMinutes = 8 * 60 + 15; // 08:15

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    const saved = localStorage.getItem('tb_session');
    if (saved) {
        try {
            currentUser = JSON.parse(saved);
            showMainScreen();
            refreshHome();
        } catch (e) {
            localStorage.removeItem('tb_session');
        }
    }
});

// ============================================================
// HELPER
// ============================================================
function showToast(msg, duration = 2500) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.style.display = 'block';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.style.display = 'none'; }, duration);
}

function showGlobalLoading(text = 'Memproses...') {
    document.getElementById('globalLoadingText').textContent = text;
    document.getElementById('globalLoading').style.display = 'flex';
}
function hideGlobalLoading() {
    document.getElementById('globalLoading').style.display = 'none';
}

function formatDate(date) {
    const days = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
    const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    return `${days[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

function hhmm(text) {
    if (!text || text.length < 5) return '';
    return text.substring(0, 5);
}

function monthName(m) {
    const names = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
    return names[m-1] || '-';
}

async function apiCall(payload) {
    try {
        const res = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
        });
        const text = await res.text();
        if (!text || text.trim().startsWith('<')) {
            throw new Error('Server mengembalikan HTML. Cek deployment Apps Script (visibility: Anyone).');
        }
        return JSON.parse(text);
    } catch (e) {
        throw new Error(e.message || 'Gagal terhubung ke server.');
    }
}

// ============================================================
// LOGIN
// ============================================================
function togglePassword() {
    const inp = document.getElementById('password');
    const eyeOpen = document.getElementById('eyeOpen');
    const eyeClosed = document.getElementById('eyeClosed');
    if (inp.type === 'password') {
        inp.type = 'text';
        eyeOpen.style.display = 'none';
        eyeClosed.style.display = 'block';
    } else {
        inp.type = 'password';
        eyeOpen.style.display = 'block';
        eyeClosed.style.display = 'none';
    }
}

async function handleLogin() {
    const username = document.getElementById('username').value.trim().toLowerCase();
    const password = document.getElementById('password').value;
    const errorEl = document.getElementById('loginError');
    errorEl.textContent = '';

    if (!username || !password) {
        errorEl.textContent = 'Isi username dan kata sandi.';
        return;
    }

    const btn = document.getElementById('loginBtn');
    const txt = document.getElementById('loginBtnText');
    const spn = document.getElementById('loginSpinner');
    btn.disabled = true;
    txt.style.display = 'none';
    spn.style.display = 'block';

    try {
        const res = await apiCall({ action: 'login', username, password });
        if (!res.success) throw new Error(res.message || 'Login gagal.');
        
        currentUser = {
            token: res.token,
            employeeId: res.user.employeeId,
            name: res.user.name,
            username: res.user.username,
            role: res.user.role,
            position: res.user.position,
            profilePhotoFileId: res.user.profilePhotoFileId || '',
            assignedProjectIds: res.user.assignedProjectIds || ''
        };
        localStorage.setItem('tb_session', JSON.stringify(currentUser));
        document.getElementById('password').value = '';
        showMainScreen();
        refreshHome();
    } catch (e) {
        errorEl.textContent = e.message || 'Gagal masuk.';
    } finally {
        btn.disabled = false;
        txt.style.display = 'block';
        spn.style.display = 'none';
    }
}

function handleLogout() {
    if (!confirm('Keluar dari akun ini?')) return;
    if (currentUser?.token) {
        apiCall({ action: 'logout', token: currentUser.token }).catch(() => {});
    }
    localStorage.removeItem('tb_session');
    currentUser = null;
    attendanceStatus = null;
    projectInfo = null;
    document.getElementById('mainScreen').classList.remove('active');
    document.getElementById('loginScreen').classList.add('active');
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
}

// ============================================================
// SCREEN MANAGEMENT
// ============================================================
function showMainScreen() {
    document.getElementById('loginScreen').classList.remove('active');
    document.getElementById('mainScreen').classList.add('active');
    
    document.getElementById('headerName').textContent = currentUser.name;
    document.getElementById('headerPosition').textContent = currentUser.position;
    document.getElementById('profileName').textContent = currentUser.name;
    document.getElementById('profilePosition').textContent = currentUser.position;
    document.getElementById('detailId').textContent = currentUser.employeeId;
    document.getElementById('detailUsername').textContent = currentUser.username;
    document.getElementById('detailPosition').textContent = currentUser.position;
    document.getElementById('detailRole').textContent = currentUser.role;
    
    document.getElementById('todayDate').textContent = formatDate(new Date());
    document.getElementById('monthLabel').textContent = `${monthName(recapMonth)} ${recapYear}`;
}

function switchTab(tab) {
    // Hide all content
    document.getElementById('homeContent').style.display = 'none';
    document.getElementById('rekapContent').style.display = 'none';
    document.getElementById('profilContent').style.display = 'none';
    
    // Show selected
    if (tab === 'home') document.getElementById('homeContent').style.display = 'block';
    else if (tab === 'rekap') { 
        document.getElementById('rekapContent').style.display = 'block';
        loadRecap();
    }
    else if (tab === 'profil') document.getElementById('profilContent').style.display = 'block';
    
    // Update nav
    document.querySelectorAll('.nav-item[data-tab]').forEach(el => {
        el.classList.toggle('active', el.dataset.tab === tab);
    });
    
    window.scrollTo(0, 0);
}

// ============================================================
// HOME / STATUS
// ============================================================
async function refreshHome() {
    if (!currentUser) return;
    const btn = document.getElementById('refreshBtn');
    btn.style.opacity = '0.5';
    try {
        const res = await apiCall({ action: 'home', token: currentUser.token });
        if (!res.success) throw new Error(res.message || 'Gagal memuat.');
        
        attendanceStatus = res.attendance;
        projectInfo = res.project;
        profilePhotoFileId = res.profilePhotoFileId || '';
        
        renderAttendanceStatus();
        renderProject();
    } catch (e) {
        if (e.message?.toLowerCase().includes('sesi')) {
            showToast('Sesi berakhir. Login ulang.');
            handleLogout();
        } else {
            showToast(e.message || 'Gagal memuat status.');
        }
    } finally {
        btn.style.opacity = '1';
    }
}

function renderAttendanceStatus() {
    const inEl = document.getElementById('checkInTime');
    const outEl = document.getElementById('checkOutTime');
    
    if (attendanceStatus) {
        inEl.textContent = hhmm(attendanceStatus.checkInTime) || '--:--';
        inEl.classList.toggle('active', attendanceStatus.checkedIn);
        outEl.textContent = hhmm(attendanceStatus.checkOutTime) || '--:--';
        outEl.classList.toggle('active', attendanceStatus.checkedOut);
    } else {
        inEl.textContent = '--:--';
        outEl.textContent = '--:--';
    }
    
    // Update buttons
    const btnMasuk = document.getElementById('btnMasuk');
    const btnPulang = document.getElementById('btnPulang');
    const canIn = !attendanceStatus || !attendanceStatus.checkedIn;
    const canOut = attendanceStatus && attendanceStatus.checkedIn && !attendanceStatus.checkedOut;
    
    btnMasuk.disabled = !canIn;
    btnPulang.disabled = !canOut;
}

function renderProject() {
    if (projectInfo) {
        document.getElementById('projectName').textContent = projectInfo.projectName;
        document.getElementById('projectRadius').textContent = `Radius ${Math.round(projectInfo.radiusMeters)} m`;
    } else {
        document.getElementById('projectName').textContent = 'Belum ada proyek';
        document.getElementById('projectRadius').textContent = '-';
    }
}

// ============================================================
// ATTENDANCE (Kamera + GPS)
// ============================================================
function autoMode() {
    if (!attendanceStatus) return 'in';
    if (attendanceStatus.checkedIn && !attendanceStatus.checkedOut) return 'out';
    if (attendanceStatus.checkedOut) return 'in'; // fallback
    return 'in';
}

async function openAttendance(mode) {
    currentMode = mode;
    currentSelfieBase64 = null;
    currentLocation = null;
    
    document.getElementById('attendanceTitle').textContent = mode === 'in' ? 'Absen Masuk' : 'Absen Pulang';
    document.getElementById('attendanceModal').style.display = 'flex';
    document.getElementById('attendanceError').textContent = '';
    document.getElementById('selfiePreview').style.display = 'none';
    document.querySelector('.btn-camera').style.display = 'flex';
    
    // Late reason only for check-in
    document.getElementById('attendanceLateWrap').style.display = mode === 'in' ? 'block' : 'none';
    document.getElementById('lateReason').value = '';
    
    // Ambil GPS
    updateLocationInfo('Mendapatkan lokasi GPS...');
    requestGPS();
}

function closeAttendance() {
    document.getElementById('attendanceModal').style.display = 'none';
    document.getElementById('selfieInput').value = '';
    currentSelfieBase64 = null;
}

function requestGPS() {
    if (!navigator.geolocation) {
        document.getElementById('locValue').textContent = 'GPS tidak didukung browser';
        return;
    }
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            currentLocation = {
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                accuracy: pos.coords.accuracy
            };
            updateLocationInfo(`Lat: ${currentLocation.latitude.toFixed(6)}, Lng: ${currentLocation.longitude.toFixed(6)} (Akurasi ±${Math.round(currentLocation.accuracy)} m)`);
        },
        (err) => {
            let msg = 'Gagal mendapatkan lokasi';
            if (err.code === 1) msg = 'Izin lokasi ditolak. Aktifkan di pengaturan Safari.';
            else if (err.code === 2) msg = 'Lokasi tidak tersedia.';
            else if (err.code === 3) msg = 'Waktu habis. Coba lagi.';
            updateLocationInfo(msg);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
}

function updateLocationInfo(text) {
    document.getElementById('locValue').textContent = text;
}

async function handleSelfieSelected(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Compress ke ~300 KB
    try {
        const compressed = await compressImage(file, 960, 0.8);
        currentSelfieBase64 = compressed;
        
        document.getElementById('selfieImg').src = compressed;
        document.getElementById('selfiePreview').style.display = 'flex';
        document.querySelector('.btn-camera').style.display = 'none';
    } catch (e) {
        document.getElementById('attendanceError').textContent = 'Gagal memproses foto: ' + e.message;
    }
}

function compressImage(file, maxSize, quality) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let w = img.width, h = img.height;
                if (w > h && w > maxSize) { h *= maxSize / w; w = maxSize; }
                else if (h > maxSize) { w *= maxSize / h; h = maxSize; }
                canvas.width = w;
                canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                
                // Loop compress sampai < 300 KB
                let q = quality;
                let dataUrl = canvas.toDataURL('image/jpeg', q);
                while (dataUrl.length > 400000 && q > 0.4) {
                    q -= 0.1;
                    dataUrl = canvas.toDataURL('image/jpeg', q);
                }
                resolve(dataUrl);
            };
            img.onerror = () => reject(new Error('Gagal load gambar'));
            img.src = e.target.result;
        };
        reader.onerror = () => reject(new Error('Gagal baca file'));
        reader.readAsDataURL(file);
    });
}

async function submitAttendance() {
    const errorEl = document.getElementById('attendanceError');
    errorEl.textContent = '';
    
    if (!currentSelfieBase64) {
        errorEl.textContent = 'Ambil selfie dulu.';
        return;
    }
    if (!currentLocation) {
        errorEl.textContent = 'GPS belum siap. Tunggu sebentar atau cek izin lokasi.';
        requestGPS();
        return;
    }
    
    const btn = document.getElementById('submitAbsenBtn');
    const txt = document.getElementById('submitAbsenText');
    const spn = document.getElementById('submitAbsenSpinner');
    btn.disabled = true;
    txt.style.display = 'none';
    spn.style.display = 'block';
    
    showGlobalLoading('Mengirim absensi...');
    
    try {
        const payload = {
            action: currentMode === 'in' ? 'checkIn' : 'checkOut',
            token: currentUser.token,
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
            accuracy: currentLocation.accuracy,
            isMock: false,
            photoBase64: currentSelfieBase64.split(',')[1], // strip data:image/...
            photoMimeType: 'image/jpeg'
        };
        
        if (currentMode === 'in') {
            payload.lateReason = document.getElementById('lateReason').value.trim();
        }
        
        const res = await apiCall(payload);
        
        if (!res.success) {
            throw new Error(res.message || 'Absensi gagal.');
        }
        
        showToast('✓ ' + res.message);
        closeAttendance();
        await refreshHome();
    } catch (e) {
        const msg = e.message || 'Gagal absen.';
        errorEl.textContent = msg;
        if (msg.toLowerCase().includes('sesi')) {
            setTimeout(() => handleLogout(), 1500);
        }
    } finally {
        btn.disabled = false;
        txt.style.display = 'block';
        spn.style.display = 'none';
        hideGlobalLoading();
    }
}

// ============================================================
// MAP (Lokasi Proyek)
// ============================================================
function openMap() {
    if (!projectInfo) {
        showToast('Belum ada proyek aktif.');
        return;
    }
    document.getElementById('mapModal').style.display = 'flex';
    document.getElementById('mapProjectName').textContent = projectInfo.projectName;
    
    document.getElementById('mapLocationInfo').innerHTML = `
        <p class="location-label">📍 Proyek</p>
        <p class="location-value">${projectInfo.projectName}</p>
        <p style="font-size:12px;color:rgba(255,255,255,0.7);margin-top:4px;">
            Radius ${Math.round(projectInfo.radiusMeters)} m
        </p>
        <p style="font-size:12px;color:rgba(255,255,255,0.7);margin-top:8px;">
            📌 Koordinat: ${projectInfo.latitude.toFixed(6)}, ${projectInfo.longitude.toFixed(6)}
        </p>
        <p style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:12px;">
            Tap tombol Absen di beranda untuk absensi.
        </p>
    `;
    
    // Placeholder peta
    const mapArea = document.getElementById('mapArea');
    mapArea.innerHTML = `
        <div style="height:100%;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;color:#64748B;">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" stroke-width="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                <circle cx="12" cy="10" r="3"/>
            </svg>
            <p style="font-size:14px;">${projectInfo.projectName}</p>
            <p style="font-size:12px;">Radius ${Math.round(projectInfo.radiusMeters)} m</p>
        </div>
    `;
}

function closeMap() {
    document.getElementById('mapModal').style.display = 'none';
}

// ============================================================
// REKAP BULANAN
// ============================================================
async function loadRecap() {
    document.getElementById('rekapSummary').innerHTML = '<p style="grid-column:1/-1;text-align:center;color:#64748b;">Memuat...</p>';
    document.getElementById('rekapList').innerHTML = '';
    document.getElementById('monthLabel').textContent = `${monthName(recapMonth)} ${recapYear}`;
    
    try {
        const res = await apiCall({ action: 'monthlyRecap', token: currentUser.token, year: recapYear, month: recapMonth });
        if (!res.success) throw new Error(res.message || 'Gagal.');
        
        const sum = res.summary || {};
        document.getElementById('rekapSummary').innerHTML = `
            <div class="summary-item">
                <p class="summary-label">Hadir</p>
                <p class="summary-value" style="color:#10B981;">${sum.daysPresent || 0}</p>
            </div>
            <div class="summary-item">
                <p class="summary-label">Telat</p>
                <p class="summary-value" style="color:#F59E0B;">${sum.lateDays || 0}</p>
            </div>
            <div class="summary-item">
                <p class="summary-label">Lembur</p>
                <p class="summary-value" style="color:#3B82F6;">${sum.totalOvertimeHours || 0}j</p>
            </div>
        `;
        
        const records = res.records || [];
        if (records.length === 0) {
            document.getElementById('rekapList').innerHTML = '<p style="text-align:center;color:#64748b;padding:20px;">Belum ada absensi bulan ini.</p>';
        } else {
            document.getElementById('rekapList').innerHTML = records.map(r => `
                <div class="recap-item">
                    <p class="recap-date">${r.date}</p>
                    <div class="recap-times">
                        <span>Masuk: ${hhmm(r.checkInTime) || '--'}</span>
                        <span>Pulang: ${hhmm(r.checkOutTime) || '--'}</span>
                    </div>
                </div>
            `).join('');
        }
    } catch (e) {
        document.getElementById('rekapSummary').innerHTML = `<p style="grid-column:1/-1;text-align:center;color:#EF4444;">${e.message}</p>`;
    }
}

function changeMonth(delta) {
    recapMonth += delta;
    if (recapMonth > 12) { recapMonth = 1; recapYear++; }
    if (recapMonth < 1) { recapMonth = 12; recapYear--; }
    loadRecap();
}

// ============================================================
// LEAVE (Placeholder)
// ============================================================
function openLeave() {
    document.getElementById('leaveModal').style.display = 'flex';
}
function closeLeave() {
    document.getElementById('leaveModal').style.display = 'none';
}
