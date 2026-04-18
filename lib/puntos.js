// lib/puntos.js
import {
  doc, getDoc, updateDoc, addDoc, collection,
  serverTimestamp, increment, query, where,
  getDocs, orderBy, limit
} from 'firebase/firestore';
import { db } from './firebase';

// ─── Acciones y sus puntos base ───────────────────────────────────────────────
export const ACCIONES = {
  compra_fisica:   { puntos: 1,   label: 'Compra en tienda',       auto: false },
  compra_online:   { puntos: 1,   label: 'Compra online',          auto: true  },
  resena_google:   { puntos: 1,   label: 'Reseña en Google',       auto: false },
  resena_producto: { puntos: 0.5, label: 'Reseña de producto',     auto: true  },
  historia_ig:     { puntos: 0.5, label: 'Historia en Instagram',  auto: false },
  referido:        { puntos: 1.5, label: 'Referido que compra',    auto: false },
  analizador_piel: { puntos: 0.5, label: 'Analizador de piel',     auto: true  },
  cumpleanos:      { puntos: 1,   label: 'Regalo de cumpleaños',   auto: true  },
  bienvenida:      { puntos: 1,   label: 'Puntos de bienvenida',   auto: true  },
};

// ─── Regla de puntos por monto de compra ─────────────────────────────────────
//
// Compras < $40.000  → 1 punto
// Compras ≥ $40.000  → 2 puntos
//
// Cambia los valores aquí para ajustar la regla sin tocar otra lógica.
//
export const REGLA_COMPRA = {
  monto_minimo_doble: 40000,   // CLP — compras sobre este valor dan el doble
  puntos_normal:      1,
  puntos_doble:       2,
};

/**
 * Calcula cuántos puntos corresponden según el monto de la compra.
 * Funciona para compras online (Shopify) y físicas (admin manual).
 */
export function calcularPuntosCompra(monto) {
  if (!monto || isNaN(monto)) return REGLA_COMPRA.puntos_normal;
  return Number(monto) >= REGLA_COMPRA.monto_minimo_doble
    ? REGLA_COMPRA.puntos_doble
    : REGLA_COMPRA.puntos_normal;
}

// ─── Niveles con nombres aspiracionales y opciones de premio ─────────────────
export const NIVELES = [
  {
    nivel:    1,
    puntos:   5,
    label:    'Glow Starter',      // nombre aspiracional
    tier:     'bronze',
    color:    '#CD7F32',
    objetivo: 'Tu primer regalo — ¡ya casi!',
    pregunta: '¿Prefieres ahorrar o probar algo nuevo?',
    opciones: [
      {
        id:             'bronze_descuento',
        emoji:          '🏷️',
        label:          '10% OFF',
        desc:           'En tu próxima compra sin mínimo',
        tipo:           'descuento',
        codigo_shopify: 'MOON10',
      },
      {
        id:             'bronze_envio',
        emoji:          '📦',
        label:          'Envío gratis',
        desc:           'En tu próxima compra a cualquier parte',
        tipo:           'envio',
        codigo_shopify: 'ENVIOGRATIS',
      },
      {
        id:             'bronze_muestras',
        emoji:          '✨',
        label:          '2 muestras premium',
        desc:           'Seleccionadas según tu tipo de piel',
        tipo:           'producto',
        codigo_shopify: null,
      },
    ],
  },
  {
    nivel:    2,
    puntos:   8,
    label:    'Beauty Lover',
    tier:     'silver',
    color:    '#A8A9AD',
    objetivo: 'Un regalo más grande te espera',
    pregunta: '¿Prefieres ahorrar más o descubrir algo nuevo?',
    opciones: [
      {
        id:             'silver_descuento',
        emoji:          '💖',
        label:          '15% OFF',
        desc:           'En compras sobre $15.000',
        tipo:           'descuento',
        codigo_shopify: 'MOON15',
      },
      {
        id:             'silver_mini',
        emoji:          '🎁',
        label:          'Mini producto viral',
        desc:           'Del top ventas — sorpresa',
        tipo:           'producto',
        codigo_shopify: null,
      },
      {
        id:             'silver_kit',
        emoji:          '🌿',
        label:          'Kit según tu piel',
        desc:           'Armado con tu diagnóstico',
        tipo:           'kit',
        codigo_shopify: null,
      },
    ],
  },
  {
    nivel:    3,
    puntos:   12,
    label:    'Moonbow Elite',
    tier:     'gold',
    color:    '#FFD700',
    objetivo: 'Nuestra recompensa más exclusiva',
    pregunta: '¿Quieres un gran ahorro o un regalo especial?',
    opciones: [
      {
        id:             'gold_descuento',
        emoji:          '👑',
        label:          '20% OFF',
        desc:           'En compras sobre $25.000',
        tipo:           'descuento',
        codigo_shopify: 'MOON20',
      },
      {
        id:             'gold_producto',
        emoji:          '🎁',
        label:          'Producto regalo exclusivo',
        desc:           'Stock limitado — lo elegimos contigo',
        tipo:           'producto',
        codigo_shopify: null,
      },
      {
        id:             'gold_rutina',
        emoji:          '🧖‍♀️',
        label:          'Rutina personalizada',
        desc:           'Armada para ti + 15% OFF',
        tipo:           'kit',
        codigo_shopify: 'RUTINA15',
      },
    ],
  },
];

export const TOTAL_SELLOS = 12;

// ─── CRUD de usuario ──────────────────────────────────────────────────────────

export async function getUsuario(uid) {
  const ref  = doc(db, 'usuarios', uid);
  const snap = await getDoc(ref);
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export function getPuntosActuales(userData)  { return userData?.lealtad?.puntos                   ?? 0; }
export function getPuntosHistoricos(userData){ return userData?.lealtad?.puntos_acumulados_total   ?? 0; }
export function getTier(userData)            { return userData?.lealtad?.tier                     ?? 'bronze'; }

export async function getHistorialPuntos(uid, limite = 20) {
  const ref  = collection(db, 'usuarios', uid, 'transacciones_lealtad');
  const q    = query(ref, orderBy('timestamp', 'desc'), limit(limite));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ─── Agregar puntos ───────────────────────────────────────────────────────────

export async function agregarPuntos(uid, accion, opciones = {}) {
  const accionInfo    = ACCIONES[accion];
  if (!accionInfo) throw new Error(`Acción desconocida: ${accion}`);

  const puntosFinales = opciones.puntos_custom ?? accionInfo.puntos;

  const userRef  = doc(db, 'usuarios', uid);
  const userSnap = await getDoc(userRef);
  const userData = userSnap.data();
  const saldoActual    = userData?.lealtad?.puntos ?? 0;
  const saldoResultante = saldoActual + puntosFinales;

  await updateDoc(userRef, {
    'lealtad.puntos':                  increment(puntosFinales),
    'lealtad.puntos_acumulados_total': increment(puntosFinales),
    'lealtad.tier':                    calcularTier(saldoResultante),
    'metadata.ultima_interaccion':     serverTimestamp(),
  });

  await addDoc(collection(db, 'usuarios', uid, 'transacciones_lealtad'), {
    tipo:             'earn',
    motivo:           accion,
    puntos:           puntosFinales,
    saldo_resultante: saldoResultante,
    timestamp:        serverTimestamp(),
    metadata: {
      descripcion:  opciones.descripcion || accionInfo.label,
      aprobado_por: opciones.aprobado_por || 'sistema',
      monto:        opciones.monto        || null,
      orden_id:     opciones.orden_id     || null,
    },
  });

  return verificarRecompensa(saldoResultante);
}

// ─── Restar puntos ────────────────────────────────────────────────────────────

export async function restarPuntos(uid, puntosARestar, motivo, opciones = {}) {
  const userRef  = doc(db, 'usuarios', uid);
  const userSnap = await getDoc(userRef);
  const userData = userSnap.data();
  const saldoActual = userData?.lealtad?.puntos ?? 0;

  if (saldoActual < puntosARestar) throw new Error('Puntos insuficientes');

  const saldoResultante = saldoActual - puntosARestar;

  await updateDoc(userRef, {
    'lealtad.puntos': increment(-puntosARestar),
    'lealtad.tier':   calcularTier(saldoResultante),
  });

  await addDoc(collection(db, 'usuarios', uid, 'transacciones_lealtad'), {
    tipo:             'redeem',
    motivo,
    puntos:           -puntosARestar,
    saldo_resultante: saldoResultante,
    timestamp:        serverTimestamp(),
    metadata: {
      descripcion:  opciones.descripcion || motivo,
      aprobado_por: opciones.aprobado_por || 'sistema',
    },
  });
}

// ─── Tier ─────────────────────────────────────────────────────────────────────

function calcularTier(puntos) {
  if (puntos >= 12) return 'gold';
  if (puntos >= 8)  return 'silver';
  return 'bronze';
}

// ─── Verificar si hay recompensa disponible ───────────────────────────────────

export function verificarRecompensa(puntosActuales) {
  for (const nivel of [...NIVELES].reverse()) {
    if (puntosActuales >= nivel.puntos) {
      return {
        recompensaDisponible: true,
        nivel:  nivel.nivel,
        label:  nivel.label,
        tier:   nivel.tier,
        puntos: nivel.puntos,
      };
    }
  }
  return { recompensaDisponible: false };
}

// ─── Canjear recompensa (el usuario elige la opción) ─────────────────────────

export async function canjearRecompensa(uid, nivelNum, opcionId) {
  const nivelInfo = NIVELES.find(n => n.nivel === nivelNum);
  if (!nivelInfo) throw new Error('Nivel inválido');

  const opcion = nivelInfo.opciones.find(o => o.id === opcionId);
  if (!opcion) throw new Error('Opción inválida');

  await restarPuntos(uid, nivelInfo.puntos, 'canje_recompensa', {
    descripcion: `Canje ${nivelInfo.label}: ${opcion.label}`,
  });

  await addDoc(collection(db, 'recompensas'), {
    uid_usuario:    uid,
    nivel:          nivelNum,
    tier:           nivelInfo.tier,
    opcion_id:      opcionId,
    opcion_label:   opcion.label,
    opcion_tipo:    opcion.tipo,
    codigo_shopify: opcion.codigo_shopify,
    premio:         opcion.label,
    fecha_canje:    serverTimestamp(),
    entregado:      false,
  });

  return { codigo: opcion.codigo_shopify, opcion };
}

// ─── Acciones pendientes ──────────────────────────────────────────────────────

export async function crearAccionPendiente(uid, nombreUsuario, tipo, descripcion, imagenUrl = null, extras = {}) {
  await addDoc(collection(db, 'acciones_pendientes'), {
    uid_usuario:    uid,
    nombre_usuario: nombreUsuario,
    tipo,
    descripcion,
    imagen_url:     imagenUrl,
    fecha:          serverTimestamp(),
    estado:         'pendiente',
    ...extras,
  });
}

export async function getAccionesPendientes() {
  const q = query(
    collection(db, 'acciones_pendientes'),
    where('estado', '==', 'pendiente'),
    orderBy('fecha', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function aprobarAccion(accionId, adminUid) {
  const accionRef  = doc(db, 'acciones_pendientes', accionId);
  const accionSnap = await getDoc(accionRef);
  const accion     = accionSnap.data();
  await updateDoc(accionRef, { estado: 'aprobado' });
  await agregarPuntos(accion.uid_usuario, accion.tipo, {
    descripcion:  accion.descripcion,
    aprobado_por: adminUid,
  });
}

export async function rechazarAccion(accionId) {
  await updateDoc(doc(db, 'acciones_pendientes', accionId), { estado: 'rechazado' });
}

// ─── Shopify webhook — lógica de puntos por monto ────────────────────────────
//
// Esta función es llamada desde /app/api/shopify/webhook/route.js
// NO la llames directamente desde el cliente.
//
export async function procesarCompraShopify(uid, orden) {
  // Determinar puntos según monto
  const monto        = parseFloat(orden.total_price || 0);
  const puntosGanar  = calcularPuntosCompra(monto);
  const descripcion  = monto >= REGLA_COMPRA.monto_minimo_doble
    ? `Compra online #${orden.order_number} — ¡doble puntos por $${monto.toLocaleString('es-CL')}!`
    : `Compra online #${orden.order_number}`;

  await agregarPuntos(uid, 'compra_online', {
    puntos_custom: puntosGanar,
    monto,
    orden_id:     orden.order_number,
    descripcion,
    aprobado_por: 'shopify_webhook',
  });

  await updateDoc(doc(db, 'usuarios', uid), {
    'metadata.last_purchase_date': serverTimestamp(),
    'metadata.total_purchases':    increment(1),
    'metadata.total_gastado':      increment(monto),
  });
}

export function generarLinkReferido(uid) {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://moonbow.cl';
  return `${base}/fidelizacion/registro?ref=${uid}`;
}

export async function getTopClientes(limite = 10) {
  const q = query(
    collection(db, 'usuarios'),
    orderBy('lealtad.puntos_acumulados_total', 'desc'),
    limit(limite)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
