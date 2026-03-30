function checkAdminAuth() {
    const token = localStorage.getItem('adminToken');
    if (!token && !window.location.pathname.includes('login.html')) {
        window.location.href = '/admin/login';
        return false;
    }
    return true;
}

function getAuthHeader() {
    return { 'Authorization': `Bearer ${localStorage.getItem('adminToken')}` };
}

async function adminLogin(username, password) {
    try {
        const res = await fetch('/api/auth/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (res.ok && data.success) {
            localStorage.setItem('adminToken', data.token);
            localStorage.setItem('adminUser', JSON.stringify(data.user));
            window.location.href = '/admin/dashboard';
            return true;
        }
        alert(data.error || 'Invalid credentials');
        return false;
    } catch (error) {
        alert('Login failed');
        return false;
    }
}

function adminLogout() {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUser');
    window.location.href = '/admin/login';
}

document.addEventListener('DOMContentLoaded', () => {
    if (!window.location.pathname.includes('login.html')) checkAdminAuth();
});
