const API_URL = 'https://script.google.com/macros/s/AKfycbwiwrWHJN8qYS35pbwaqh5Yr9KHRix3o97nXmLEdLaZfjbc6k-G03YHwqfq7lWj04AZ/exec';

let currentUser = null;
let attendanceStatus = null;
let projectInfo = null;
let currentSelfieBase64 = null;
let currentLocation = null;
let currentMode = 'in';
let currentOutOfRadius = false;
let currentDistance = 0;
let recapYear = new Date().getFullYear();
let recapMonth = new Date().getMonth() + 1;
let doctorBase64 = null;

document.addEventListener('DOMContentLoaded', () => {
    const saved = localStorage.getItem('tb_session');
    if (saved) {
        try {
            currentUser = JSON.parse(saved);
            showMainScreen();
            refreshHome();
        } catch (e) { localStorage.removeItem('tb_session'); }
    }
});

// HELPERS
function showToast(msg, duration = 2500) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.style.display = 'block';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.style.display = 'none'; }, duration);
}
function showGlobalLoading(text = 'Memproses...') {
    document.getElementById('globalLoadingText').textContent = text;
    document.getElementById('globalLoading').style.display = 'flex';
}
function hideGlobalLoading() { document.getElementById('globalLoading').style.display = 'none'; }
function formatDate(date) {
    const days = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
    const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    return `${days[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}
function hhmm(text) { if (!text || text.length < 5) return ''; return text.substring(0, 5); }
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
        if (!text || text.trim().startsWith('<')) throw new Error('Server HTML. Cek deployment Apps Script.');
        return JSON.parse(text);
    } catch (e) { throw new Error(e.message || 'Gagal terhubung ke server.'); }
}
function togglePassword() {
    const inp = document.getElementById('password');
    const eyeOpen = document.getElementById('eyeOpen');
    const eyeClosed = document.getElementById('eyeClosed');
    if (inp.type === 'password') {
        inp.type = 'text'; eyeOpen.style.display = 'none'; eyeClosed.style.display = 'block';
    } else {
        inp.type = 'password'; eyeOpen.style.display = 'block'; eyeClosed.style.display = 'none';
    }
}

// LOGIN
async function handleLogin() {
    const username = document.getElementById('username').value.trim().toLowerCase();
    const password = document.getElementById('password').value;
    const errorEl = document.getElementById('loginError');
    errorEl.textContent = '';
    if (!username || !password) { errorEl.textContent = 'Isi username dan kata sandi.'; return; }
    const btn = document.getElementById('loginBtn');
    const txt = document.getElementById('loginBtnText');
    const spn = document.getElementById('loginSpinner');
    btn.disabled = true; txt.style.display = 'none'; spn.style.display = 'block';
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
    } catch (e) { errorEl.textContent = e.message || 'Gagal masuk.'; }
    finally { btn.disabled = false; txt.style.display = 'block'; spn.style.display = 'none'; }
}
function handleLogout() {
    if (!confirm('Keluar dari akun ini?')) return;
    if (currentUser?.token) apiCall({ action: 'logout', token: currentUser.token }).catch(() => {});
    localStorage.removeItem('tb_session');
    currentUser = null; attendanceStatus = null; projectInfo = null;
    document.getElementById('mainScreen').classList.remove('active');
    document.getElementById('loginScreen').classList.add('active');
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
}
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
    document.getElementById('homeContent').style.display = 'none';
    document.getElementById('rekapContent').style.display = 'none';
    document.getElementById('profilContent').style.display = 'none';
    if (tab === 'home') document.getElementById('homeContent').style.display = 'block';
    else if (tab === 'rekap') { document.getElementById('rekapContent').style.display = 'block'; loadRecap(); }
    else if (tab === 'profil') document.getElementById('profilContent').style.display = 'block';
    document.querySelectorAll('.nav-item[data-tab]').forEach(el => { el.classList.toggle('active', el.dataset.tab === tab); });
    window.scrollTo(0, 0);
}

// HOME
async function refreshHome() {
    if (!currentUser) return;
    const btn = document.getElementById('refreshBtn');
    btn.style.opacity = '0.5';
    try {
        const res = await apiCall({ action: 'home', token: currentUser.token });
        if (!res.success) throw new Error(res.message || 'Gagal memuat.');
        attendanceStatus = res.attendance;
        projectInfo = res.project;
        renderAttendanceStatus();
        renderProject();
    } catch (e) {
        if (e.message?.toLowerCase().includes('sesi')) { showToast('Sesi berakhir. Login ulang.'); handleLogout(); }
        else showToast(e.message || 'Gagal memuat status.');
    } finally { btn.style.opacity = '1'; }
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
        inEl.textContent = '--:--'; outEl.textContent = '--:--';
    }
    const btnMasuk = document.getElementById('btnMasuk');
    const btnPulang = document.getElementById('btnPulang');
    const canIn = !attendanceStatus || !attendanceStatus.checkedIn;
    const canOut = attendanceStatus && attendanceStatus.checkedIn && !attendanceStatus.checkedOut;
    btnMasuk.disabled = !canIn; btnPulang.disabled = !canOut;
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

// ATTENDANCE
function autoMode() {
    if (!attendanceStatus) return 'in';
    if (attendanceStatus.checkedIn && !attendanceStatus.checkedOut) return 'out';
    return 'in';
}
async function openAttendance(mode) {
    currentMode = mode; currentSelfieBase64 = null; currentLocation = null;
    currentOutOfRadius = false;
    document.getElementById('attendanceTitle').textContent = mode === 'in' ? 'Absen Masuk' : 'Absen Pulang';
    document.getElementById('attendanceModal').style.display = 'flex';
    document.getElementById('attendanceError').textContent = '';
    document.getElementById('selfiePreview').style.display = 'none';
    document.getElementById('btnCameraOpen').style.display = 'flex';
    document.getElementById('attendanceLateWrap').style.display = mode === 'in' ? 'block' : 'none';
    document.getElementById('lateReason').value = '';
    document.getElementById('outOfRadiusWrap').style.display = 'none';
    document.getElementById('outOfRadiusReason').value = '';
    document.getElementById('outReasonWrap').style.display = 'none';
    document.getElementById('outReason').value = '';
    document.getElementById('radiusWarningCard').style.display = 'none';
    updateLocationInfo('Mendapatkan lokasi GPS...');
    requestGPS();
}
function closeAttendance() {
    document.getElementById('attendanceModal').style.display = 'none';
    document.getElementById('selfieInput').value = '';
    currentSelfieBase64 = null;
}
function requestGPS() {
    if (!navigator.geolocation) { document.getElementById('locValue').textContent = 'GPS tidak didukung'; return; }
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            currentLocation = {
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                accuracy: pos.coords.accuracy
            };
            updateLocationInfo(`Lat: ${currentLocation.latitude.toFixed(6)}, Lng: ${currentLocation.longitude.toFixed(6)} (Akurasi ±${Math.round(currentLocation.accuracy)} m)`);
            checkRadius();
        },
        (err) => {
            let msg = 'Gagal GPS';
            if (err.code === 1) msg = 'Izin lokasi ditolak.';
            else if (err.code === 2) msg = 'Lokasi tidak tersedia.';
            else if (err.code === 3) msg = 'Waktu habis.';
            updateLocationInfo(msg);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
}
function checkRadius() {
    if (!currentLocation || !projectInfo) return;
    currentDistance = haversine(currentLocation.latitude, currentLocation.longitude, projectInfo.latitude, projectInfo.longitude);
    const tolerance = projectInfo.radiusMeters + currentLocation.accuracy;
    currentOutOfRadius = currentDistance > tolerance;
    
    const warningCard = document.getElementById('radiusWarningCard');
    const warningText = document.getElementById('radiusWarningText');
    const outRadiusWrap = document.getElementById('outOfRadiusWrap');
    
    if (currentOutOfRadius) {
        warningCard.style.display = 'block';
        warningCard.style.background = 'rgba(127, 29, 29, 0.6)';
        warningText.textContent = `⚠ Di luar radius (${Math.round(currentDistance)} m) — Alasan wajib diisi`;
        outRadiusWrap.style.display = 'block';
    } else {
        warningCard.style.display = 'block';
        warningCard.style.background = 'rgba(6, 78, 59, 0.6)';
        warningText.textContent = `✓ Di dalam radius (${Math.round(currentDistance)} m)`;
        outRadiusWrap.style.display = 'none';
    }
    
    // Kalau check-out, tampil field alasan pulang awal
    if (currentMode === 'out') {
        const now = new Date();
        const day = now.getDay();
        const isSaturday = day === 6;
        // Jam standar (default 16:00, Sabtu 14:00)
        const standardMinute = isSaturday ? 14 * 60 : 16 * 60;
        const nowMinute = now.getHours() * 60 + now.getMinutes();
        document.getElementById('outReasonWrap').style.display = nowMinute < standardMinute ? 'block' : 'none';
    }
}
function haversine(lat1, lon1, lat2, lon2) {
    const r = 6371000;
    const dLat = (lat2-lat1) * Math.PI / 180;
    const dLon = (lon2-lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
    return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function updateLocationInfo(text) { document.getElementById('locValue').textContent = text; }

async function handleSelfieSelected(event) {
    const file = event.target.files[0];
    if (!file) return;
    try {
        const compressed = await compressImage(file, 960, 0.8);
        currentSelfieBase64 = compressed;
        document.getElementById('selfieImg').src = compressed;
        document.getElementById('selfiePreview').style.display = 'flex';
        document.getElementById('btnCameraOpen').style.display = 'none';
    } catch (e) {
        document.getElementById('attendanceError').textContent = 'Gagal foto: ' + e.message;
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
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                let q = quality;
                let dataUrl = canvas.toDataURL('image/jpeg', q);
                while (dataUrl.length > 400000 && q > 0.4) {
                    q -= 0.1;
                    dataUrl = canvas.toDataURL('image/jpeg', q);
                }
                resolve(dataUrl);
            };
            img.onerror = () => reject(new Error('Gagal load'));
            img.src = e.target.result;
        };
        reader.onerror = () => reject(new Error('Gagal baca'));
        reader.readAsDataURL(file);
    });
}
async function submitAttendance() {
    const errorEl = document.getElementById('attendanceError');
    errorEl.textContent = '';
    if (!currentSelfieBase64) { errorEl.textContent = 'Ambil selfie dulu.'; return; }
    if (!currentLocation) { errorEl.textContent = 'GPS belum siap.'; requestGPS(); return; }
    
    const outOfRadiusReason = document.getElementById('outOfRadiusReason').value.trim();
    if (currentOutOfRadius && !outOfRadiusReason) {
        errorEl.textContent = 'Alasan di luar radius wajib diisi.';
        return;
    }
    
    let outReason = '';
    if (currentMode === 'out') {
        outReason = document.getElementById('outReason').value.trim();
        const now = new Date();
        const day = now.getDay();
        const isSaturday = day === 6;
        const standardMinute = isSaturday ? 14 * 60 : 16 * 60;
        const nowMinute = now.getHours() * 60 + now.getMinutes();
        if (nowMinute < standardMinute && !outReason) {
            errorEl.textContent = 'Alasan pulang awal wajib diisi.';
            return;
        }
    }
    
    const btn = document.getElementById('submitAbsenBtn');
    const txt = document.getElementById('submitAbsenText');
    const spn = document.getElementById('submitAbsenSpinner');
    btn.disabled = true; txt.style.display = 'none'; spn.style.display = 'block';
    showGlobalLoading('Mengirim absensi...');
    try {
        const payload = {
            action: currentMode === 'in' ? 'checkIn' : 'checkOut',
            token: currentUser.token,
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
            accuracy: currentLocation.accuracy,
            isMock: false,
            photoBase64: currentSelfieBase64.split(',')[1],
            photoMimeType: 'image/jpeg'
        };
        if (currentMode === 'in') payload.lateReason = document.getElementById('lateReason').value.trim();
        if (currentMode === 'out') payload.outReason = outReason;
        if (currentOutOfRadius) payload.outOfRadiusReason = outOfRadiusReason;
        
        const res = await apiCall(payload);
        if (!res.success) throw new Error(res.message || 'Absensi gagal.');
        showToast('✓ ' + res.message);
        closeAttendance();
        await refreshHome();
    } catch (e) {
        const msg = e.message || 'Gagal.';
        errorEl.textContent = msg;
        if (msg.toLowerCase().includes('sesi')) setTimeout(() => handleLogout(), 1500);
    } finally { btn.disabled = false; txt.style.display = 'block'; spn.style.display = 'none'; hideGlobalLoading(); }
}

// MAP
let leafletMap = null;
function openMap() {
    if (!projectInfo) { showToast('Belum ada proyek.'); return; }
    document.getElementById('mapModal').style.display = 'flex';
    document.getElementById('mapProjectName').textContent = projectInfo.projectName;
    document.getElementById('mapLocationInfo').innerHTML = `
        <p class="location-label">📍 Proyek</p>
        <p class="location-value" style="color:#0F172A;">${projectInfo.projectName}</p>
        <p style="font-size:12px;color:#64748B;margin-top:4px;">Radius ${Math.round(projectInfo.radiusMeters)} m</p>`;
    setTimeout(() => {
        if (leafletMap) { leafletMap.remove(); leafletMap = null; }
        const mapEl = document.getElementById('mapArea');
        mapEl.style.background = '#fff';
        leafletMap = L.map('mapArea').setView([projectInfo.latitude, projectInfo.longitude], 18);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(leafletMap);
        L.circle([projectInfo.latitude, projectInfo.longitude], { color: '#3B82F6', fillColor: '#3B82F6', fillOpacity: 0.2, radius: projectInfo.radiusMeters }).addTo(leafletMap);
        L.marker([projectInfo.latitude, projectInfo.longitude]).addTo(leafletMap).bindPopup(projectInfo.projectName);
    }, 100);
}
function closeMap() {
    document.getElementById('mapModal').style.display = 'none';
    if (leafletMap) { leafletMap.remove(); leafletMap = null; }
}

// REKAP
async function loadRecap() {
    document.getElementById('rekapSummary').innerHTML = '<p style="grid-column:1/-1;text-align:center;color:#64748b;">Memuat...</p>';
    document.getElementById('rekapList').innerHTML = '';
    document.getElementById('monthLabel').textContent = `${monthName(recapMonth)} ${recapYear}`;
    try {
        const res = await apiCall({ action: 'monthlyRecap', token: currentUser.token, year: recapYear, month: recapMonth });
        if (!res.success) throw new Error(res.message || 'Gagal.');
        const sum = res.summary || {};
        const otText = sum.totalOvertimeMinutes >= 60 ? `${Math.round(sum.totalOvertimeMinutes/60)}j` : `${sum.totalOvertimeMinutes}m`;
        document.getElementById('rekapSummary').innerHTML = `
            <div class="summary-item"><p class="summary-label">Hadir</p><p class="summary-value" style="color:#10B981;">${sum.daysPresent || 0}</p></div>
            <div class="summary-item"><p class="summary-label">Telat</p><p class="summary-value" style="color:#F59E0B;">${sum.lateDays || 0}</p></div>
            <div class="summary-item"><p class="summary-label">Lembur</p><p class="summary-value" style="color:#3B82F6;">${otText || '0'}</p></div>`;
        const records = res.records || [];
        if (records.length === 0) {
            document.getElementById('rekapList').innerHTML = '<p style="text-align:center;color:#64748b;padding:20px;">Belum ada absensi.</p>';
        } else {
            document.getElementById('rekapList').innerHTML = records.map(r => {
                let badges = '';
                if (r.late) badges += `<span style="background:#FEF3C7;color:#F59E0B;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;margin-left:4px;">Telat ${r.lateMinutes}m</span>`;
                if (r.overtimeMinutes > 0) badges += `<span style="background:#DBEAFE;color:#3B82F6;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;margin-left:4px;">Lembur ${r.overtimeMinutes}m</span>`;
                let extra = '';
                if (r.outOfRadius) extra += `<p style="font-size:11px;color:#F59E0B;margin-top:4px;">⚠ Luar radius: ${r.outOfRadiusReason || '-'}</p>`;
                if (r.lateReason) extra += `<p style="font-size:11px;color:#64748B;margin-top:2px;">Alasan telat: ${r.lateReason}</p>`;
                if (r.outReason) extra += `<p style="font-size:11px;color:#64748B;margin-top:2px;">Pulang awal: ${r.outReason}</p>`;
                return `<div class="recap-item">
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                        <p class="recap-date">${r.date}</p>
                        <div>${badges}</div>
                    </div>
                    <div class="recap-times">
                        <span>Masuk: ${hhmm(r.checkInTime) || '--'}</span>
                        <span>Pulang: ${hhmm(r.checkOutTime) || '--'}</span>
                    </div>
                    ${extra}
                </div>`;
            }).join('');
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

// LEAVE
function openLeave() {
    document.getElementById('leaveModal').style.display = 'flex';
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('leaveStart').value = today;
    document.getElementById('leaveEnd').value = today;
    document.getElementById('leaveForm').style.display = 'block';
    document.getElementById('leaveHistoryList').style.display = 'none';
    document.getElementById('leaveError').textContent = '';
    document.getElementById('leaveReason').value = '';
    document.getElementById('leaveType').addEventListener('change', checkDoctorRequirement);
    document.getElementById('leaveStart').addEventListener('change', checkDoctorRequirement);
    document.getElementById('leaveEnd').addEventListener('change', checkDoctorRequirement);
    loadLeaveBalance();
}
function closeLeave() { document.getElementById('leaveModal').style.display = 'none'; }
async function loadLeaveBalance() {
    if (!currentUser) return;
    try {
        const year = new Date().getFullYear();
        const res = await apiCall({ action: 'annualLeaveBalance', token: currentUser.token, year });
        if (res.success) {
            document.getElementById('leaveBalanceCard').style.display = 'block';
            document.getElementById('leaveBalanceYear').textContent = res.year;
            document.getElementById('leaveBalanceRemaining').textContent = res.remaining;
            document.getElementById('leaveBalanceQuota').textContent = res.quota;
            document.getElementById('leaveBalanceUsed').textContent = res.used;
        }
    } catch (e) {}
}
function checkDoctorRequirement() {
    const type = document.getElementById('leaveType').value;
    const start = new Date(document.getElementById('leaveStart').value);
    const end = new Date(document.getElementById('leaveEnd').value);
    const diffDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
    const wrap = document.getElementById('doctorWrap');
    wrap.style.display = (type === 'SICK' && diffDays > 2) ? 'block' : 'none';
}
async function previewDoctor(event) {
    const file = event.target.files[0];
    if (!file) { doctorBase64 = null; return; }
    try { doctorBase64 = await compressImage(file, 960, 0.7); }
    catch (e) { alert('Gagal proses foto'); }
}
async function submitLeave() {
    const type = document.getElementById('leaveType').value;
    const start = document.getElementById('leaveStart').value;
    const end = document.getElementById('leaveEnd').value;
    const reason = document.getElementById('leaveReason').value.trim();
    const errEl = document.getElementById('leaveError');
    if (!start || !end || reason.length < 5) { errEl.textContent = 'Lengkapi data (alasan min 5).'; return; }
    if (end < start) { errEl.textContent = 'Tanggal tidak valid.'; return; }
    const startDate = new Date(start); const endDate = new Date(end);
    const diffDays = Math.ceil((endDate - startDate) / (1000*60*60*24)) + 1;
    if (type === 'SICK' && diffDays > 2 && !doctorBase64) {
        errEl.textContent = 'Sakit >2 hari wajib surat dokter.'; return;
    }
    const btn = document.getElementById('submitLeaveBtn');
    btn.textContent = 'MENGIRIM...'; btn.disabled = true; errEl.textContent = '';
    try {
        const payload = {
            action: 'submitLeave', token: currentUser.token,
            leaveType: type, startDate: start, endDate: end, reason: reason
        };
        if (doctorBase64) {
            payload.doctorLetterBase64 = doctorBase64.split(',')[1];
            payload.doctorLetterMimeType = 'image/jpeg';
        }
        const res = await apiCall(payload);
        if (!res.success) throw new Error(res.message || 'Gagal.');
        alert('✓ ' + res.message);
        closeLeave();
    } catch (e) { errEl.textContent = e.message; }
    finally { btn.textContent = 'KIRIM PENGAJUAN'; btn.disabled = false; }
}
async function toggleLeaveHistory() {
    const form = document.getElementById('leaveForm');
    const hist = document.getElementById('leaveHistoryList');
    if (form.style.display === 'none') {
        form.style.display = 'block'; hist.style.display = 'none'; return;
    }
    form.style.display = 'none'; hist.style.display = 'block';
    const container = document.getElementById('leaveHistoryContent');
    container.innerHTML = 'Memuat...';
    try {
        const res = await apiCall({ action: 'myLeaves', token: currentUser.token });
        if (!res.success) throw new Error(res.message);
        if (!res.records || res.records.length === 0) {
            container.innerHTML = '<p style="text-align:center;padding:20px;color:#64748B;">Belum ada riwayat.</p>';
            return;
        }
        container.innerHTML = res.records.map(r => {
            let statusColor = r.status === 'PENDING' ? '#F59E0B' : (r.status === 'APPROVED' || r.status === 'APPLIED' ? '#10B981' : '#EF4444');
            let typeLabel = r.leaveType === 'SICK' ? 'Sakit' : (r.leaveType === 'PERSONAL' ? 'Izin Pribadi' : 'Cuti Tahunan');
            return `<div class="card" style="margin-bottom:10px;padding:15px;">
                <div style="display:flex;justify-content:space-between;margin-bottom:5px;">
                    <strong style="color:#0F172A;">${typeLabel}</strong>
                    <span style="color:${statusColor};font-size:12px;font-weight:bold;">${r.status}</span>
                </div>
                <p style="font-size:12px;color:#64748B;">${r.startDate} s/d ${r.endDate} (${r.totalDays} hari)</p>
                <p style="font-size:13px;margin-top:5px;color:#0F172A;">Alasan: ${r.reason}</p>
                ${r.adminNote ? `<p style="font-size:12px;color:#EF4444;margin-top:5px;">Catatan Admin: ${r.adminNote}</p>` : ''}
            </div>`;
        }).join('');
    } catch (e) { container.innerHTML = `<p style="text-align:center;color:#EF4444;">${e.message}</p>`; }
}

// PASSWORD
function openPasswordModal() {
    document.getElementById('passwordModal').style.display = 'flex';
    document.getElementById('oldPassword').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmPassword').value = '';
    document.getElementById('passwordError').textContent = '';
}
function closePasswordModal() { document.getElementById('passwordModal').style.display = 'none'; }
async function submitChangePassword() {
    const oldPw = document.getElementById('oldPassword').value;
    const newPw = document.getElementById('newPassword').value;
    const confirmPw = document.getElementById('confirmPassword').value;
    const errEl = document.getElementById('passwordError');
    if (!oldPw || !newPw || !confirmPw) { errEl.textContent = 'Lengkapi kolom.'; return; }
    if (newPw.length < 8) { errEl.textContent = 'Sandi baru min 8 karakter.'; return; }
    if (newPw !== confirmPw) { errEl.textContent = 'Konfirmasi tidak cocok.'; return; }
    const btn = document.getElementById('savePasswordBtn');
    btn.textContent = 'MENYIMPAN...'; btn.disabled = true; errEl.textContent = '';
    try {
        const res = await apiCall({ action: 'changePassword', token: currentUser.token, oldPassword: oldPw, newPassword: newPw });
        if (!res.success) throw new Error(res.message);
        alert('✓ ' + res.message + '\nAnda harus login ulang.');
        closePasswordModal();
        handleLogout();
    } catch (e) { errEl.textContent = e.message; }
    finally { btn.textContent = 'SIMPAN SANDI BARU'; btn.disabled = false; }
}
