async function loadCartPage() {
    const cart = getCart();
    const ids = Object.keys(cart);
    
    if (ids.length === 0) {
        document.getElementById('cartContent').innerHTML = `
            <div class="empty-cart" style="text-align:center;padding:50px">
                <i class="fas fa-shopping-cart" style="font-size:64px;color:#ccc"></i>
                <h2>Your cart is empty</h2>
                <a href="/" class="btn-primary">Continue Shopping</a>
            </div>`;
        return;
    }
    
    try {
        const items = [];
        let total = 0;
        for (const id of ids) {
            const res = await fetch(`/api/products/${id}`);
            const p = await res.json();
            const qty = cart[id];
            const sub = p.price * qty;
            total += sub;
            items.push({ ...p, quantity: qty, subtotal: sub });
        }
        
        document.getElementById('cartContent').innerHTML = `
            <table class="cart-table">
                <thead><tr><th>Product</th><th>Price</th><th>Quantity</th><th>Subtotal</th><th></th></tr></thead>
                <tbody>
                    ${items.map(p => `
                        <tr>
                            <td><img src="${p.image || 'https://via.placeholder.com/80'}" style="width:80px;height:80px;object-fit:cover;margin-right:15px">${p.name}</td>
                            <td>KSh ${p.price.toLocaleString()}</td>
                            <td><input type="number" id="qty_${p._id}" value="${p.quantity}" min="1" style="width:60px;padding:5px"></td>
                            <td>KSh ${p.subtotal.toLocaleString()}</td>
                            <td><button onclick="removeFromCart('${p._id}')" style="background:none;border:none;color:#e74c3c;cursor:pointer"><i class="fas fa-trash"></i> Remove</button></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            <div class="cart-actions">
                <button class="btn-update" onclick="updateAllQuantities()">Update Cart</button>
                <button class="btn-checkout" onclick="proceedToCheckout()">Proceed to Checkout</button>
            </div>
            <div class="cart-summary"><h3>Order Summary</h3><p>Total: <strong>KSh ${total.toLocaleString()}</strong></p></div>`;
    } catch (error) {
        console.error('Error loading cart:', error);
    }
}

function updateAllQuantities() {
    const cart = getCart();
    for (const id of Object.keys(cart)) {
        const input = document.getElementById(`qty_${id}`);
        if (input) {
            const val = parseInt(input.value);
            if (val > 0) cart[id] = val;
            else delete cart[id];
        }
    }
    saveCart(cart);
    loadCartPage();
    showNotification('Cart updated!');
}

function proceedToCheckout() {
    if (Object.keys(getCart()).length === 0) showNotification('Cart is empty!', 'error');
    else window.location.href = '/checkout';
}

if (window.location.pathname.includes('cart.html')) document.addEventListener('DOMContentLoaded', loadCartPage);
