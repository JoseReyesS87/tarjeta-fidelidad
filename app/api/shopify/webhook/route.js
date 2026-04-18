// app/api/shopify/webhook/route.js
//
// ─── Cómo configurar en Shopify ───────────────────────────────────────────────
//
// 1. En Shopify Admin → Settings → Notifications → Webhooks
// 2. Crear webhook:
//    - Event:  Orders / Order paid
//    - Format: JSON
//    - URL:    https://TU-DOMINIO.vercel.app/api/shopify/webhook
// 3. Copiar el "Webhook signing secret" y agregarlo a .env.local:
//    SHOPIFY_WEBHOOK_SECRET=tu_secret_aqui
//
// ─── Cómo vincula el cliente con su UID de Firebase ──────────────────────────
//
// El webhook usa el email del pedido para buscar al usuario en Firestore.
// Por eso al registrarse en tu app, el email DEBE ser el mismo que usan en Shopify.
// Si no existe el usuario en Firebase, el webhook se ignora (no crea usuarios nuevos).
//
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse }    from 'next/server';
import crypto              from 'crypto';
import { db }              from '@/lib/firebase';       // ajusta el path si es distinto
import { procesarCompraShopify } from '@/lib/puntos';
import { collection, query, where, getDocs } from 'firebase/firestore';

// Verifica la firma HMAC del webhook para asegurar que viene de Shopify
function verificarFirma(body, signature) {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!secret) {
    console.error('SHOPIFY_WEBHOOK_SECRET no configurado en .env.local');
    return false;
  }
  const hash = crypto
    .createHmac('sha256', secret)
    .update(body, 'utf8')
    .digest('base64');
  return hash === signature;
}

// Busca el UID de Firebase dado el email del pedido
async function buscarUidPorEmail(email) {
  if (!email) return null;
  const emailNormalizado = email.toLowerCase().trim();
  const q    = query(collection(db, 'usuarios'), where('perfil.email', '==', emailNormalizado));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return snap.docs[0].id;  // retorna el UID (doc ID)
}

export async function POST(request) {
  try {
    // Leer el body como texto para verificar firma
    const bodyText  = await request.text();
    const signature = request.headers.get('x-shopify-hmac-sha256');
    const topic     = request.headers.get('x-shopify-topic');

    // Solo procesar pedidos pagados
    if (topic !== 'orders/paid') {
      return NextResponse.json({ ok: true, msg: 'Topic ignorado' });
    }

    // Verificar que el webhook viene de Shopify
    if (!verificarFirma(bodyText, signature)) {
      console.error('Webhook con firma inválida — posible intento de fraude');
      return NextResponse.json({ error: 'Firma inválida' }, { status: 401 });
    }

    const orden = JSON.parse(bodyText);
    const email = orden.email || orden.contact_email;

    console.log(`[Shopify Webhook] Pedido #${orden.order_number} | Email: ${email} | Total: $${orden.total_price}`);

    // Buscar usuario en Firebase por email
    const uid = await buscarUidPorEmail(email);

    if (!uid) {
      // El cliente no está registrado en el programa de fidelización
      // Esto es normal — no todos los clientes de Shopify están en el programa
      console.log(`[Shopify Webhook] Email ${email} no encontrado en Firebase — se ignora`);
      return NextResponse.json({ ok: true, msg: 'Cliente no registrado en fidelización' });
    }

    // Procesar la compra y asignar puntos según el monto
    await procesarCompraShopify(uid, {
      total_price:   orden.total_price,
      order_number:  orden.order_number || orden.name,
    });

    console.log(`[Shopify Webhook] ✓ Puntos asignados al usuario ${uid}`);
    return NextResponse.json({ ok: true, msg: 'Puntos asignados correctamente' });

  } catch (error) {
    console.error('[Shopify Webhook] Error:', error);
    // Siempre responder 200 a Shopify aunque haya error interno
    // (si respondes 500, Shopify reintentará el webhook múltiples veces)
    return NextResponse.json({ ok: false, error: error.message });
  }
}

// Shopify envía POST — rechazar otros métodos
export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
