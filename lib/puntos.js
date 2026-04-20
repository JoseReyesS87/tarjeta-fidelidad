// lib/puntos.js
import {
  doc, getDoc, updateDoc, addDoc, collection,
  serverTimestamp, increment, query, where,
  getDocs, orderBy, limit
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
  compra_fisica:   { puntos: 1,   label: 'Compra en tienda',       auto: false, limite: null       },
  compra_online:   { puntos: 1,   label: 'Compra online',          auto: true,  limite: null       },
  resena_google:   { puntos: 1,   label: 'Reseña en Google',       auto: false, limite: 'una_vez'  },
  resena_producto: { puntos: 0.5, label: 'Reseña de producto',     auto: true,  limite: 'una_vez'  },
  historia_ig:     { puntos: 0.5, label: 'Historia en Instagram',  auto: false, limite: 'mensual'  },
  referido:        { puntos: 1.5, label: 'Referido que compra',    auto: false, limite: null       },
  analizador_piel: { puntos: 0.5, label: 'Analizador de piel',     auto: true,  limite: 'una_vez'  },
  cumpleanos:      { puntos: 1,   label: 'Regalo de cumpleaños',   auto: true,  limite: 'anual'    },
  bienvenida:      { puntos: 1,   label: 'Puntos de bienvenida',   auto: true,  limite: 'una_vez'  },
};

// ─── Regla de puntos por monto de compra ─────────────────────────────────────
//
// Compras < $40.000  → 1 punto
// Compras ≥ $40.000  → 2 puntos
//
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

export function getPuntosActuales(userData)   { return userData?.lealtad?.puntos                 ?? 0; }
export function getPuntosHistoricos(userData) { return userData?.lealtad?.puntos_acumulados_total ?? 0; }
export function getTier(userData)             { return userData?.lealtad?.tier                   ?? 'bronze'; }

export async function getHistorialPuntos(uid, limite = 20) {
  const ref  = collection(db, 'usuarios', uid, 'transacciones_lealtad');
  const q    = query(ref, orderBy('timestamp', 'desc'), limit(limite));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ─── Verificar límite de acción ───────────────────────────────────────────────
//
// Lee el campo acciones_realizadas del usuario y compara según el tipo de límite.
// Lanza un Error si ya se alcanzó el límite — captúralo en el caller.
//
async function verificarLimiteAccion(uid, accion, accionInfo) {
  if (!accionInfo.limite) return; // sin límite → siempre permitido

  const userRef  = doc(db, 'usuarios', uid);
  const userSnap = await getDoc(userRef);
  const userData = userSnap.data();
  const realizadas = userData?.acciones_realizadas ?? {};
  const ultima     = realizadas[accion]; // Timestamp de Firestore o undefined

  if (!ultima) return; // nunca lo hizo → permitido

  const ahora   = new Date();
  const ultDate = ultima.toDate?.() ?? new Date(ultima);

  if (accionInfo.limite === 'una_vez') {
    throw new Error(`Ya ganaste puntos por: ${accionInfo.label}`);
  }

  if (accionInfo.limite === 'mensual') {
    const mismoMes = ultDate.getMonth()     === ahora.getMonth() &&
                     ultDate.getFullYear()  === ahora.getFullYear();
    if (mismoMes) throw new Error(`Ya ganaste puntos por ${accionInfo.label} este mes`);
  }

  if (accionInfo.limite === 'anual') {
    if (ultDate.getFullYear() === ahora.getFullYear())
      throw new Error(`Ya ganaste puntos por ${accionInfo.label} este año`);
  }
}

// ─── Agregar puntos ───────────────────────────────────────────────────────────
//
// opciones.omitir_limite = true → saltea la verificación (solo para admin)
//
export async function agregarPuntos(uid, accion, opciones = {}) {
  const accionInfo = ACCIONES[accion];
  if (!accionInfo) throw new Error(`Acción desconocida: ${accion}`);

  // Verificar límite antes de hacer cualquier escritura
  if (!opciones.omitir_limite) {
    await verificarLimiteAccion(uid, accion, accionInfo);
  }

  const puntosFinales   = opciones.puntos_custom ?? accionInfo.puntos;
  const userRef         = doc(db, 'usuarios', uid);
  const userSnap        = await getDoc(userRef);
  const userData        = userSnap.data();
  const saldoActual     = userData?.lealtad?.puntos ?? 0;
  const saldoResultante = saldoActual + puntosFinales;

  const updateData = {
    'lealtad.puntos':                  increment(puntosFinales),
    'lealtad.puntos_acumulados_total': increment(puntosFinales),
    'lealtad.tier':                    calcularTier(saldoResultante),
    'metadata.ultima_interaccion':     serverTimestamp(),
  };

  // Solo registrar timestamp de la acción si tiene límite configurado
  if (accionInfo.limite) {
    updateData[`acciones_realizadas.${accion}`] = serverTimestamp();
  }

  await updateDoc(userRef, updateData);

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
    descripcion:  accion.descripcion,
    aprobado_por: adminUid,
    omitir_limite: true, // admin aprueba manualmente → siempre válido
  });
}

export async function rechazarAccion(accionId) {
  await updateDoc(doc(db, 'acciones_pendientes', accionId), { estado: 'rechazado' });
}

// ─── Shopify webhook ──────────────────────────────────────────────────────────

export async function procesarCompraShopify(uid, orden) {
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
// ─────────────────────────────────────────────────────────────────────────────
// CUMPLEAÑOS — agregar esto a lib/puntos.js
// ─────────────────────────────────────────────────────────────────────────────

// 1. Guardar fecha de nacimiento del usuario (llamar desde TarjetaFidelizacion)
export async function guardarFechaNacimiento(uid, fechaNacimiento) {
  // fechaNacimiento formato: "DD/MM"  (ej: "15/03")
  const userRef = doc(db, 'usuarios', uid);
  await updateDoc(userRef, {
    'perfil.fecha_nacimiento': fechaNacimiento,
  });
}

// 2. Verificar y dar puntos de cumpleaños automáticamente
//    Llamar esta función al cargar la tarjeta (en useEffect de TarjetaFidelizacion)
export async function verificarCumpleanos(uid) {
  const userRef  = doc(db, 'usuarios', uid);
  const userSnap = await getDoc(userRef);
  const userData = userSnap.data();

  const fechaNac = userData?.perfil?.fecha_nacimiento; // "DD/MM"
  if (!fechaNac) return false; // sin fecha registrada

  const [dia, mes] = fechaNac.split('/').map(Number);
  const hoy = new Date();

  // ¿Es su mes de cumpleaños?
  if (hoy.getMonth() + 1 !== mes) return false;

  // Verificar si ya se le dio el punto este año (reutiliza lógica de limite:'anual')
  const realizadas = userData?.acciones_realizadas ?? {};
  const ultimaCumple = realizadas['cumpleanos'];
  if (ultimaCumple) {
    const ultDate = ultimaCumple.toDate?.() ?? new Date(ultimaCumple);
    if (ultDate.getFullYear() === hoy.getFullYear()) return false; // ya se dio este año
  }

  // Dar el punto de cumpleaños
  await agregarPuntos(uid, 'cumpleanos', {
    descripcion:  `🎂 ¡Feliz cumpleaños! Regalo de tu mes especial`,
    aprobado_por: 'sistema_auto',
  });

  return true; // retorna true si se dieron los puntos (para mostrar confetti/mensaje)
}


// ─────────────────────────────────────────────────────────────────────────────
// SNIPPET — agregar en TarjetaFidelizacion.jsx
// ─────────────────────────────────────────────────────────────────────────────

// En los imports, agregar:
// import { guardarFechaNacimiento, verificarCumpleanos } from '../lib/puntos';

// En el estado del componente principal, agregar:
// const [editandoCumple, setEditandoCumple]   = useState(false);
// const [fechaNacInput, setFechaNacInput]     = useState('');
// const [guardandoCumple, setGuardandoCumple] = useState(false);
// const [cumpleMsg, setCumpleMsg]             = useState(false);

// En el useEffect (cargarDatos), agregar al final:
//
//   const fueCumple = await verificarCumpleanos(uid);
//   if (fueCumple) setCumpleMsg(true); // mostrar mensaje sorpresa

// ─── Sección de cumpleaños para pegar dentro del JSX de TarjetaFidelizacion ──
// Pégala en la vista 'tarjeta', debajo de la sección de sellos o donde prefieras.
//
// const tieneFechaNac = !!usuario.perfil?.fecha_nacimiento;
//
// <div style={{ margin: '0 16px 12px', background: cumpleMsg
//     ? 'linear-gradient(135deg,#FFF0F4,#FFF8F0)'
//     : C.white,
//   borderRadius: 20, padding: '16px 18px',
//   border: `1.5px solid ${cumpleMsg ? C.rose : C.border}`,
//   boxShadow: cumpleMsg ? '0 4px 20px rgba(242,168,184,.2)' : '0 2px 8px rgba(45,27,46,.04)' }}>
//
//   {cumpleMsg && (
//     <div style={{ textAlign: 'center', marginBottom: 12 }}>
//       <div style={{ fontSize: 32, marginBottom: 4 }}>🎂✨</div>
//       <div style={{ fontSize: 15, fontWeight: 700, color: C.roseDark }}>¡Feliz cumpleaños!</div>
//       <div style={{ fontSize: 12, color: C.textSoft, marginTop: 2 }}>Te regalamos +1 pt en tu mes especial 🌸</div>
//     </div>
//   )}
//
//   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//     <div>
//       <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>🎂 Cumpleaños</div>
//       <div style={{ fontSize: 11, color: C.textSoft, marginTop: 2 }}>
//         {tieneFechaNac ? `Registrado: ${usuario.perfil.fecha_nacimiento}` : 'Agrégalo y gana +1 pt en tu mes'}
//       </div>
//     </div>
//     <button onClick={() => { setEditandoCumple(true); setFechaNacInput(usuario.perfil?.fecha_nacimiento || ''); }}
//       style={{ background: `${C.rose}20`, border: `1.5px solid ${C.rose}`, color: C.roseDark,
//         borderRadius: 10, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
//       {tieneFechaNac ? 'Editar' : 'Agregar'}
//     </button>
//   </div>
// </div>
//
// ─── Modal para ingresar fecha ───────────────────────────────────────────────
//
// {editandoCumple && (
//   <div style={{ position: 'fixed', inset: 0, background: 'rgba(45,27,46,.5)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'flex-end', zIndex: 300 }}
//     onClick={() => setEditandoCumple(false)}>
//     <div style={{ background: C.white, borderRadius: '28px 28px 0 0', padding: '10px 24px 52px', width: '100%', maxWidth: 430, margin: '0 auto' }}
//       onClick={e => e.stopPropagation()}>
//       <div style={{ width: 36, height: 4, background: C.border, borderRadius: 99, margin: '0 auto 22px' }} />
//       <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 6, fontFamily: "'Playfair Display', serif" }}>🎂 Tu cumpleaños</div>
//       <div style={{ fontSize: 13, color: C.textSoft, marginBottom: 20, lineHeight: 1.5 }}>
//         Ingresa tu día y mes. Cada año, en tu mes especial, te regalamos <strong style={{ color: C.roseDark }}>+1 punto</strong> automáticamente 🌸
//       </div>
//       <label style={{ display: 'block', fontSize: 12, color: C.textMid, marginBottom: 6, fontWeight: 600 }}>Fecha (DD/MM)</label>
//       <input
//         style={{ width: '100%', background: C.bgSoft, border: `1.5px solid ${C.border}`, borderRadius: 12, padding: '12px 14px',
//           color: C.text, fontSize: 18, marginBottom: 8, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit',
//           textAlign: 'center', letterSpacing: 4, fontWeight: 700 }}
//         value={fechaNacInput}
//         onChange={e => {
//           let v = e.target.value.replace(/[^0-9/]/g, '');
//           if (v.length === 2 && !v.includes('/')) v = v + '/';
//           if (v.length > 5) return;
//           setFechaNacInput(v);
//         }}
//         placeholder="15/03"
//         maxLength={5}
//       />
//       <div style={{ fontSize: 11, color: C.textSoft, marginBottom: 20 }}>Solo usamos el día y mes, no el año.</div>
//       <button
//         disabled={guardandoCumple || fechaNacInput.length !== 5}
//         onClick={async () => {
//           setGuardandoCumple(true);
//           await guardarFechaNacimiento(uid, fechaNacInput);
//           setGuardandoCumple(false);
//           setEditandoCumple(false);
//           cargarDatos(); // recargar para actualizar estado
//         }}
//         style={{ width: '100%', background: fechaNacInput.length === 5
//           ? `linear-gradient(135deg,${C.rose},${C.roseDark})` : C.border,
//           color: fechaNacInput.length === 5 ? '#fff' : C.textSoft,
//           border: 'none', borderRadius: 16, padding: 15, fontSize: 15,
//           fontWeight: 700, cursor: fechaNacInput.length === 5 ? 'pointer' : 'not-allowed',
//           fontFamily: 'inherit' }}>
//         {guardandoCumple ? 'Guardando...' : 'Guardar fecha 🎂'}
//       </button>
//     </div>
//   </div>
// )}