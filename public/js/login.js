function toggleUserDropdown() {
    const dropdown = document.getElementById('user-dropdown');
    const arrow = document.getElementById('dropdown-arrow');
    if (dropdown) dropdown.classList.toggle('hidden');
    if (arrow) arrow.classList.toggle('rotate-180');
}

function switchView(target) {
    const viewPreview = document.getElementById('view-preview');
    const viewLogin = document.getElementById('view-login');
    const navPreview = document.getElementById('nav-preview');
    const navLogin = document.getElementById('nav-login');
    const errorAlert = document.getElementById('error-alert');

    if (errorAlert) {
        errorAlert.classList.add('hidden');
        errorAlert.classList.remove('flex');
    }

    if (target === 'preview') {
        viewPreview.classList.remove('hidden');
        viewLogin.classList.add('hidden');
        navPreview.className = "flex-1 md:flex-initial px-3 py-2 rounded-lg text-xs font-bold bg-white text-indigo-600 shadow-sm transition flex items-center justify-center gap-1.5";
        navLogin.className = "flex-1 md:flex-initial px-3 py-2 rounded-lg text-xs font-bold text-slate-600 hover:text-slate-900 transition flex items-center justify-center gap-1.5";
    } else {
        viewPreview.classList.add('hidden');
        viewLogin.classList.remove('hidden');
        navLogin.className = "flex-1 md:flex-initial px-3 py-2 rounded-lg text-xs font-bold bg-white text-indigo-600 shadow-sm transition flex items-center justify-center gap-1.5";
        navPreview.className = "flex-1 md:flex-initial px-3 py-2 rounded-lg text-xs font-bold text-slate-600 hover:text-slate-900 transition flex items-center justify-center gap-1.5";
    }
}

// မျက်နှာပြင်အလယ်တည့်တည့်တွင် Modal ပြရန် Helper Function
function showCenterModal(message, type = 'success', onComplete = null) {
    const existingModal = document.getElementById('custom-center-modal');
    if (existingModal) existingModal.remove();

    const overlay = document.createElement('div');
    overlay.id = 'custom-center-modal';
    overlay.className = 'fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm transition-opacity duration-300 opacity-0';

    let iconBg = type === 'success' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600';
    let icon = type === 'success' ? 
        `<svg class="w-8 h-8" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"></path></svg>` : 
        `<svg class="w-8 h-8" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"></path></svg>`;

    overlay.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4 text-center transform transition-all duration-300 scale-95 opacity-0" id="modal-content">
            <div class="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${iconBg}">
                ${icon}
            </div>
            <h3 class="text-lg font-bold text-slate-800 mb-2">${type === 'success' ? 'အောင်မြင်သည်' : 'အမှားအယွင်း'}</h3>
            <p class="text-sm text-slate-600 mb-6 leading-relaxed">${message}</p>
            ${type === 'success' ? '' : '<button id="modal-close-btn" class="w-full py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-medium rounded-xl transition">ပိတ်မည်</button>'}
        </div>
    `;

    document.body.appendChild(overlay);

    setTimeout(() => {
        overlay.classList.remove('opacity-0');
        document.getElementById('modal-content').classList.remove('scale-95', 'opacity-0');
        document.getElementById('modal-content').classList.add('scale-100', 'opacity-100');
    }, 10);

    if (type === 'success') {
        setTimeout(() => {
            overlay.classList.add('opacity-0');
            setTimeout(() => {
                overlay.remove();
                if (onComplete) onComplete();
            }, 300);
        }, 1500);
    } else {
        document.getElementById('modal-close-btn').onclick = () => {
            overlay.classList.add('opacity-0');
            setTimeout(() => overlay.remove(), 300);
        };
    }
}

// -------------------------------------------------------------
// လော့ဂ်အင်ဝင်သည့်အခါ Username နှင့် Role ကို LocalStorage သို့ သိမ်းရန်
// -------------------------------------------------------------
async function handleCredentialLogin() {
    const usernameInput = document.getElementById('login-username').value.trim();
    const passwordInput = document.getElementById('login-password').value.trim();
    const errorAlert = document.getElementById('error-alert');
    const errorMessage = document.getElementById('error-message');

    if (!usernameInput || !passwordInput) {
        errorMessage.textContent = "ကျေးဇူးပြု၍ Username နှင့် Password ကို အပြည့်အစုံ ဖြည့်သွင်းပါ။";
        errorAlert.classList.remove('hidden');
        errorAlert.classList.add('flex');
        return;
    }

    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: usernameInput, password: passwordInput })
        });

        const data = await res.json();

        if (res.ok && data.success) {
            localStorage.setItem('tinyml_auth', 'true');
            localStorage.setItem('username', data.username || usernameInput);
            localStorage.setItem('user_role', data.role);

            errorAlert.classList.add('hidden');
            errorAlert.classList.remove('flex');
            
            showCenterModal("Login အောင်မြင်ပါသည်: " + (data.username || usernameInput), 'success', () => {
                window.location.href = '/index.html';
            });

        } else {
            errorMessage.textContent = data.message || "Access Denied: Username သို့မဟုတ် Password မှားယွင်းနေပါသည်။";
            errorAlert.classList.remove('hidden');
            errorAlert.classList.add('flex');
        }
    } catch (error) {
        console.error("Login Error:", error);
        errorMessage.textContent = "ဆာဗာချိတ်ဆက်မှု အမှားအယွင်းရှိသည်။ Backend ဆာဗာ အလုပ်လုပ်နေခြင်း ရှိမရှိ စစ်ဆေးပါ။";
        errorAlert.classList.remove('hidden');
        errorAlert.classList.add('flex');
    }
}

async function handleGoogleLogin(response) {
    try {
        const res = await fetch('/api/auth/google', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: response.credential })
        });

        const data = await res.json();

        if (data.success) {
            localStorage.setItem('tinyml_auth', 'true');
            localStorage.setItem('username', data.name || data.email);
            localStorage.setItem('user_role', data.role || 'Google User');

            showCenterModal("Google ဖြင့် ဝင်ရောက်ခြင်း အောင်မြင်ပါသည်!", 'success', () => {
                window.location.href = '/index.html';
            });

        } else {
            showCenterModal("ဝင်ရောက်ခွင့် မရှိပါ: " + data.message, 'error');
        }
    } catch (error) {
        console.error("Google Login Error:", error);
        showCenterModal("ဆာဗာချိတ်ဆက်မှု အမှားအယွင်းရှိသည်။", 'error');
    }
}

// -------------------------------------------------------------
// Dashboard ရောက်သည်နှင့် User နာမည်နှင့် Account Type ဖော်ပြပေးရန်
// -------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
    const nameEl = document.getElementById('display-username');
    const roleEl = document.getElementById('display-role');
    const avatarEl = document.getElementById('user-avatar-initial');

    const savedName = localStorage.getItem('username');
    const savedRole = localStorage.getItem('user_role');

    if (savedName && nameEl) {
        nameEl.textContent = savedName;
        if (avatarEl) {
            avatarEl.textContent = savedName.substring(0, 2).toUpperCase();
        }
    }

    if (savedRole && roleEl) {
        roleEl.textContent = savedRole; // Database ထဲက Supervisor account ဆိုတာ ဒီနေရာမှာ ပေါ်လာပါမယ်
    }
});

// -------------------------------------------------------------
// User Dropdown & Password Change Functions (Token ကင်းစင်သောပုံစံ)
// -------------------------------------------------------------
function toggleUserDropdown() {
    const dropdown = document.getElementById('user-dropdown');
    const arrow = document.getElementById('dropdown-arrow');
    if (dropdown) dropdown.classList.toggle('hidden');
    if (arrow) arrow.classList.toggle('rotate-180');
}

function handleLogout() {
    localStorage.clear(); 
    window.location.href = 'login.html';
}

function openChangePasswordModal() {
    toggleUserDropdown();
    const modal = document.getElementById('password-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
}

function closeChangePasswordModal() {
    const modal = document.getElementById('password-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

// Token လုံးဝမသုံးဘဲ Username ဖြင့် Password အသစ်ပြောင်းမည့် Function
async function handlePasswordChangeSubmit(e) {
    e.preventDefault();
    const currentPassword = document.getElementById('current-pass').value.trim();
    const newPassword = document.getElementById('new-password').value.trim();
    
    const username = localStorage.getItem('username');

    if (!username) {
        showCenterModal("အသုံးပြုသူ အချက်အလက် မတွေ့ပါ။ ကျေးဇူးပြု၍ ပြန်လည် Login ဝင်ပါ။", 'error');
        return;
    }

    try {
        const res = await fetch('/api/auth/change-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, currentPassword, newPassword })
        });

        const data = await res.json();

        if (res.ok && data.success) {
            closeChangePasswordModal();
            showCenterModal("Password ပြောင်းလဲခြင်း အောင်မြင်ပါသည်။", 'success');
            e.target.reset();
        } else {
            showCenterModal(data.message || "Password ပြောင်းလဲရာတွင် အမှားအယွင်းရှိသည်။", 'error');
        }
    } catch (error) {
        console.error("Password Change Error:", error);
        showCenterModal("ဆာဗာချိတ်ဆက်မှု အမှားအယွင်းရှိသည်။", 'error');
    }
}

// Dropdown ပြင်ပကို နှိပ်လိုက်ပါက ပိတ်သွားစေရန်
window.addEventListener('click', function(e) {
    const dropdown = document.getElementById('user-dropdown');
    if (!dropdown) return;
    const userProfileArea = dropdown.parentElement;
    if (userProfileArea && !userProfileArea.contains(e.target)) {
        dropdown.classList.add('hidden');
        const arrow = document.getElementById('dropdown-arrow');
        if (arrow) arrow.classList.remove('rotate-180');
    }
});

 function toggleSection(contentId, arrowId) {
        const content = document.getElementById(contentId);
        const arrow = document.getElementById(arrowId);
        if (content.style.display === 'none') {
            content.style.display = 'grid';
            arrow.style.transform = 'rotate(0deg)';
        } else {
            content.style.display = 'none';
            arrow.style.transform = 'rotate(180deg)';
        }
    }
