// lib/puntos.js — v2 optimizado
import {
  doc, getDoc, updateDoc, addDoc, collection,
  serverTimestamp, increment, query, where,
  getDocs, orderBy, limit, writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';

// ─── Acciones y sus puntos base ───────────────────────────────────────────────
//
// limite:
//   null       → sin límite (compras, referidos)
//   'una_vez'  → solo se gana una vez en toda la vida
//   'mensual'  → una vez por mes calendario
//   'anual'    → una vez por año calendario
//
export const ACCIONES = {
  compra_fisica:   { puntos: 1,   label: 'Compra en tienda',      auto: false, limite: null      },
  compra_online:   { puntos: 1,   label: 'Compra online',         auto: true,  limite: null      },
  resena_google:   { puntos: 1,   label: 'Reseña en Google',      auto: false, limite: 'una_vez' },
  resena_producto: { puntos: 0.5, label: 'Reseña de producto',    auto: true,  limite: 'una_vez' },
  historia_ig:     { puntos: 0.5, label: 'Historia en Instagram', auto: false, limite: 'mensual' },
  referido:        { puntos: 1.5, label: 'Referido que compra',   auto: false, limite: null      },
  analizador_piel: { puntos: 0.5, label: 'Analizador de piel',    auto: true,  limite: 'una_vez' },
  cumpleanos:      { puntos: 1,   label: 'Regalo de cumpleaños',  auto: true,  limite: 'anual'   },
  bienvenida:      { puntos: 1,   label: 'Puntos de bienvenida',  auto: true,  limite: 'una_vez' },
  newsletter:      { puntos: 0.5, label: 'Suscripción newsletter',auto: false, limite: 'una_vez' },
};

// ─── Regla de puntos por monto de compra ─────────────────────────────────────
// Compras < $40.000  → 1 punto  |  Compras ≥ $40.000 → 2 puntos
export const REGLA_COMPRA = {
  monto_minimo_doble: 40000,
  puntos_normal:      1,
  puntos_doble:       2,
};

export function calcularPuntosCompra(monto) {
  if (!monto || isNaN(monto)) return REGLA_COMPRA.puntos_normal;
  return Number(monto) >= REGLA_COMPRA.monto_minimo_doble
    ? REGLA_COMPRA.puntos_doble
    : REGLA_COMPRA.puntos_normal;
}

// ─── Niveles ──────────────────────────────────────────────────────────────────
export const NIVELES = [
  {
    nivel:    1,
    puntos:   5,
    label:    'Glow Starter',
    tier:     'bronze',
    color:    '#CD7F32',
    objetivo: 'Tu primer regalo exclusivo — ¡ya casi!',
    pregunta: '¿Qué recompensa prefieres?',
    opciones: [
      {
        id:             'bronze_muestras',
        emoji:          '🎁',
        label:          'Kit de muestras a elección',
        desc:           'Muestras premium curadas por nuestras expertas',
        tipo:           'producto',
        codigo_shopify: null,
        valor_estimado: 12000,
      },
      {
        id:             'bronze_envio',
        emoji:          '📦',
        label:          'Envío gratis a todo Chile',
        desc:           'En tu próxima compra a cualquier parte de Chile',
        tipo:           'envio',
        codigo_shopify: 'ENVIOGRATIS',
        valor_estimado: 5000,
      },
    ],
  },
  {
    nivel:    2,
    puntos:   8,
    label:    'Beauty Lover',
    tier:     'silver',
    color:    '#A8A9AD',
    objetivo: 'Un regalo exclusivo te espera',
    pregunta: '¿Qué recompensa prefieres?',
    opciones: [
      {
        id:             'silver_mini',
        emoji:          '🎁',
        label:          'Mini producto viral',
        desc:           'Del top ventas — sorpresa exclusiva solo para ti',
        tipo:           'producto',
        codigo_shopify: null,
        valor_estimado: 12000,
      },
      {
        id:             'silver_descuento',
        emoji:          '✨',
        label:          '10% OFF en tu próxima compra',
        desc:           'Descuento aplicado automáticamente en tu siguiente pedido',
        tipo:           'descuento',
        codigo_shopify: 'SILVER10OFF',
        valor_estimado: null,
      },
    ],
  },
  {
    nivel:    3,
    puntos:   12,
    label:    'Moonbow Elite',
    tier:     'gold',
    color:    '#FFD700',
    objetivo: 'Nuestra recompensa más exclusiva — no disponible en tienda',
    pregunta: '¿Qué recompensa prefieres?',
    opciones: [
      {
        id:               'gold_moonbow_box',
        emoji:            '🎁',
        label:            'Moonbow Box exclusiva',
        desc:             'Kit curado — no disponible en tienda',
        tipo:             'producto',
        codigo_shopify:   null,
        valor_estimado:   15000,
        requiere_skin_ia: true,
      },
      {
        id:               'gold_full_size',
        emoji:            '✨',
        label:            'Producto full size sorpresa',
        desc:             'Un producto tamaño completo elegido especialmente para ti',
        tipo:             'producto',
        codigo_shopify:   null,
        valor_estimado:   15000,
        requiere_skin_ia: false,
      },
    ],
  },
];

export const TOTAL_SELLOS = 12;

// ─── Helpers de tier ──────────────────────────────────────────────────────────
function calcularTier(puntos) {
  if (puntos >= 12) return 'gold';
  if (puntos >= 8)  return 'silver';
  return 'bronze';
}

export function getPuntosActuales(userData)   { return userData?.lealtad?.puntos                 ?? 0; }
export function getPuntosHistoricos(userData) { return userData?.lealtad?.puntos_acumulados_total ?? 0; }
export function getTier(userData)             { return userData?.lealtad?.tier                   ?? 'bronze'; }

// ─── Buscar documento de usuario por uid (ID automático) ─────────────────────
//
// FIX CRÍTICO: Los documentos en /usuarios usan IDs automáticos de Firestore,
// no el UID de Firebase Auth. Buscamos por el campo `uid` o `email`.
//
async function buscarDocUsuario(uid, email = null) {
  // Primero intentar por campo uid (más directo)
  let q = query(
    collection(db, 'usuarios'),
    where('uid', '==', uid),
    limit(1)
  );
  let snap = await getDocs(q);

  // Fallback: buscar por email si se provee y no se encontró por uid
  if (snap.empty && email) {
    q = query(
      collection(db, 'usuarios'),
      where('email', '==', email),
      limit(1)
    );
    snap = await getDocs(q);
  }

  if (snap.empty) return null;
  const d = snap.docs[0];
  return { docRef: d.ref, docId: d.id, data: d.data() };
}

// ─── CRUD de usuario ──────────────────────────────────────────────────────────

// Retorna { id, ...data } o null. Acepta uid de Auth o email como fallback.
export async function getUsuario(uid, email = null) {
  const result = await buscarDocUsuario(uid, email);
  if (!result) return null;
  return { id: result.docId, ...result.data };
}

export async function getHistorialPuntos(uid, limite = 20) {
  const result = await buscarDocUsuario(uid);
  if (!result) return [];
  const ref = collection(db, 'usuarios', result.docId, 'transacciones_lealtad');
  const q   = query(ref, orderBy('timestamp', 'desc'), limit(limite));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ─── Skin diagnosis (sub-colección 'analisis') ────────────────────────────────
//
// FIX: La sub-colección en tu DB es 'analisis', no 'diagnosticos_piel'
//
export async function getSkinDiagnosis(uid) {
  try {
    const result = await buscarDocUsuario(uid);
    if (!result) return null;
    const ref  = collection(db, 'usuarios', result.docId, 'analisis');
    const q    = query(ref, orderBy('timestamp', 'desc'), limit(1));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return snap.docs[0].data()?.tipo_piel ?? null;
  } catch {
    return null;
  }
}

export function getElitePrizeLabel(tipoPiel) {
  if (!tipoPiel) return 'Kit Full-Size Exclusivo Moonbow';
  return `Kit de Rescate para Piel ${tipoPiel}`;
}

// ─── Verificar límite de acción ───────────────────────────────────────────────
//
// Recibe userData ya cargado para evitar un getDoc extra.
//
function verificarLimiteAccion(accion, accionInfo, userData) {
  if (!accionInfo.limite) return; // sin límite → siempre permitido

  const realizadas = userData?.acciones_realizadas ?? {};
  const ultima     = realizadas[accion];

  if (!ultima) return; // nunca lo hizo → permitido

  const ahora   = new Date();
  const ultDate = ultima.toDate?.() ?? new Date(ultima);

  if (accionInfo.limite === 'una_vez') {
    throw new Error(`Ya ganaste puntos por: ${accionInfo.label}`);
  }
  if (accionInfo.limite === 'mensual') {
    const mismoMes =
      ultDate.getMonth()    === ahora.getMonth() &&
      ultDate.getFullYear() === ahora.getFullYear();
    if (mismoMes) throw new Error(`Ya ganaste puntos por ${accionInfo.label} este mes`);
  }
  if (accionInfo.limite === 'anual') {
    if (ultDate.getFullYear() === ahora.getFullYear())
      throw new Error(`Ya ganaste puntos por ${accionInfo.label} este año`);
  }
}

// ─── Agregar puntos ───────────────────────────────────────────────────────────
//
// OPT: Un solo getDoc por operación — se pasa userData si ya está disponible.
// opciones.omitir_limite = true → saltea la verificación (solo para admin)
//
export async function agregarPuntos(uid, accion, opciones = {}) {
  const accionInfo = ACCIONES[accion];
  if (!accionInfo) throw new Error(`Acción desconocida: ${accion}`);

  // Buscar documento (una sola lectura)
  const result = await buscarDocUsuario(uid, opciones.email);
  if (!result) throw new Error('Usuario no encontrado');
  const { docRef, docId, data: userData } = result;

  // Verificar límite con los datos ya cargados (sin lectura extra)
  if (!opciones.omitir_limite) {
    verificarLimiteAccion(accion, accionInfo, userData);
  }

  const puntosFinales   = opciones.puntos_custom ?? accionInfo.puntos;
  const saldoActual     = userData?.lealtad?.puntos ?? 0;
  const saldoResultante = saldoActual + puntosFinales;

  const updateData = {
    'lealtad.puntos':                  increment(puntosFinales),
    'lealtad.puntos_acumulados_total': increment(puntosFinales),
    'lealtad.tier':                    calcularTier(saldoResultante),
    'metadata.ultima_interaccion':     serverTimestamp(),
  };

  if (accionInfo.limite) {
    updateData[`acciones_realizadas.${accion}`] = serverTimestamp();
  }

  // Batch: updateDoc + addDoc en una sola operación atómica
  const batch = writeBatch(db);
  batch.update(docRef, updateData);
  const txRef = doc(collection(db, 'usuarios', docId, 'transacciones_lealtad'));
  batch.set(txRef, {
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
  await batch.commit();

  return verificarRecompensa(saldoResultante);
}

// ─── Restar puntos ────────────────────────────────────────────────────────────

export async function restarPuntos(uid, puntosARestar, motivo, opciones = {}) {
  const result = await buscarDocUsuario(uid);
  if (!result) throw new Error('Usuario no encontrado');
  const { docRef, docId, data: userData } = result;

  const saldoActual = userData?.lealtad?.puntos ?? 0;
  if (saldoActual < puntosARestar) throw new Error('Puntos insuficientes');

  const saldoResultante = saldoActual - puntosARestar;

  const batch = writeBatch(db);
  batch.update(docRef, {
    'lealtad.puntos': increment(-puntosARestar),
    'lealtad.tier':   calcularTier(saldoResultante),
  });
  const txRef = doc(collection(db, 'usuarios', docId, 'transacciones_lealtad'));
  batch.set(txRef, {
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
  await batch.commit();
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

// ─── Canjear recompensa ───────────────────────────────────────────────────────

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
    descripcion:   accion.descripcion,
    aprobado_por:  adminUid,
    omitir_limite: true,
  });
}

export async function rechazarAccion(accionId) {
  await updateDoc(doc(db, 'acciones_pendientes', accionId), { estado: 'rechazado' });
}

// ─── Shopify webhook ──────────────────────────────────────────────────────────

export async function procesarCompraShopify(uid, orden) {
  const monto       = parseFloat(orden.total_price || 0);
  const puntosGanar = calcularPuntosCompra(monto);
  const descripcion = monto >= REGLA_COMPRA.monto_minimo_doble
    ? `Compra online #${orden.order_number} — ¡doble puntos por $${monto.toLocaleString('es-CL')}!`
    : `Compra online #${orden.order_number}`;

  // agregarPuntos ya hace un buscarDocUsuario; reutilizamos el resultado
  // para el updateDoc de metadata en el mismo batch
  const result = await buscarDocUsuario(uid);
  if (!result) throw new Error('Usuario no encontrado');

  const accionInfo    = ACCIONES['compra_online'];
  const saldoActual   = result.data?.lealtad?.puntos ?? 0;
  const saldoFinal    = saldoActual + puntosGanar;

  const batch = writeBatch(db);

  // Puntos
  batch.update(result.docRef, {
    'lealtad.puntos':                  increment(puntosGanar),
    'lealtad.puntos_acumulados_total': increment(puntosGanar),
    'lealtad.tier':                    calcularTier(saldoFinal),
    'metadata.ultima_interaccion':     serverTimestamp(),
    'metadata.last_purchase_date':     serverTimestamp(),
    'metadata.total_purchases':        increment(1),
    'metadata.total_gastado':          increment(monto),
  });

  // Transacción
  const txRef = doc(collection(db, 'usuarios', result.docId, 'transacciones_lealtad'));
  batch.set(txRef, {
    tipo:             'earn',
    motivo:           'compra_online',
    puntos:           puntosGanar,
    saldo_resultante: saldoFinal,
    timestamp:        serverTimestamp(),
    metadata: {
      descripcion,
      aprobado_por: 'shopify_webhook',
      monto,
      orden_id:     orden.order_number,
    },
  });

  await batch.commit();
  return verificarRecompensa(saldoFinal);
}

// ─── Cumpleaños ───────────────────────────────────────────────────────────────

export async function guardarFechaNacimiento(uid, fechaNacimiento) {
  // fechaNacimiento formato: "DD/MM" (ej: "15/03")
  const [, mesStr] = fechaNacimiento.split('/');
  const mes = Number(mesStr);
  const hoy = new Date();

  const result = await buscarDocUsuario(uid);
  if (!result) throw new Error('Usuario no encontrado');
  const userData = result.data;

  // Anti-abuso: si el mes coincide con el actual y ya se cobró este año → error
  if (mes === hoy.getMonth() + 1) {
    const ultimaCumple = userData?.acciones_realizadas?.cumpleanos;
    if (ultimaCumple) {
      const ultDate = ultimaCumple.toDate?.() ?? new Date(ultimaCumple);
      if (ultDate.getFullYear() === hoy.getFullYear()) {
        throw new Error('Ya recibiste tu punto de cumpleaños este año. Podrás actualizar tu fecha a partir del próximo año.');
      }
    }
  }

  await updateDoc(result.docRef, {
    'perfil.fecha_nacimiento': fechaNacimiento,
  });
}

export async function verificarCumpleanos(uid) {
  const result = await buscarDocUsuario(uid);
  if (!result) return false;
  const userData = result.data;

  const fechaNac = userData?.perfil?.fecha_nacimiento;
  if (!fechaNac) return false;

  const [, mesStr] = fechaNac.split('/');
  const mes = Number(mesStr);
  const hoy = new Date();

  if (hoy.getMonth() + 1 !== mes) return false;

  const ultimaCumple = userData?.acciones_realizadas?.cumpleanos;
  if (ultimaCumple) {
    const ultDate        = ultimaCumple.toDate?.() ?? new Date(ultimaCumple);
    const diasTranscurr  = (hoy - ultDate) / (1000 * 60 * 60 * 24);
    if (ultDate.getFullYear() === hoy.getFullYear()) return false;
    if (diasTranscurr < 330) return false;
  }

  await agregarPuntos(uid, 'cumpleanos', {
    descripcion:  '🎂 ¡Feliz cumpleaños! Regalo de tu mes especial',
    aprobado_por: 'sistema_auto',
  });

  return true;
}

// ─── Utils ────────────────────────────────────────────────────────────────────

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