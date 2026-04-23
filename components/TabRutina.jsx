'use client';
// components/TabRutina.jsx — v3 (barcode scanner + Shopify Storefront API)
// Cambios vs v2:
//   1. ModalProducto ahora incluye escaneo de código de barras con BarcodeDetector API
//   2. Búsqueda de producto en Shopify Storefront API por barcode
//   3. Preview del producto encontrado (imagen, nombre, precio) antes de confirmar
//   4. Se guarda shopify_variant_id, shopify_product_url, shopify_image junto al paso
//   5. Botón "Reponer mismo →" usa variant_id para agregar directo al carro de moonbow.cl
//   6. Fallback al catálogo general si no hay variant_id guardado

import { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '@/lib/firebase';
import {
  doc, getDoc, setDoc, updateDoc, serverTimestamp,
  collection, addDoc,
} from 'firebase/firestore';
import { C } from '@/lib/colores';

// ─── Shopify config ───────────────────────────────────────────────────────────
// La búsqueda por barcode se hace via API Route del servidor (/api/shopify-barcode)
// para que el Admin token nunca quede expuesto en el cliente.
// El Storefront token solo se usa para el botón de carro (URL directa).

// ─── Pasos de rutina con config por defecto ───────────────────────────────────
const PASOS_CONFIG = [
  { id: 'limpieza',   label: 'Limpieza',   emoji: '🧼', dias_promedio: 60, orden: 1 },
  { id: 'tonico',     label: 'Tónico',     emoji: '💧', dias_promedio: 45, orden: 2 },
  { id: 'esencia',    label: 'Esencia',    emoji: '🍯', dias_promedio: 50, orden: 3 },
  { id: 'serum',      label: 'Sérum',      emoji: '✨', dias_promedio: 45, orden: 4 },
  { id: 'mascarilla', label: 'Mascarilla', emoji: '🌿', dias_promedio: 30, orden: 5 },
  { id: 'ojo',        label: 'Contorno',   emoji: '👁️', dias_promedio: 60, orden: 6 },
  { id: 'crema',      label: 'Crema',      emoji: '🫧', dias_promedio: 60, orden: 7 },
  { id: 'spf',        label: 'SPF',        emoji: '☀️', dias_promedio: 30, orden: 8 },
];

const ALERTA_DIAS       = 7;
const PTS_DIA_COMPLETO  = 0.2;
const PTS_BONUS_SEMANAL = 2;
const DIAS_BONUS        = 5;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function hoy() {
  return new Date().toISOString().split('T')[0];
}

function semanaActual() {
  const d   = new Date();
  const dia = d.getDay() || 7;
  const lunes = new Date(d);
  lunes.setDate(d.getDate() - dia + 1);
  return lunes.toISOString().split('T')[0];
}

function diasRestantes(step) {
  if (!step?.start_date || !step?.estimated_days_total) return null;
  return Math.max(0, step.estimated_days_total - (step.uses_count || 0));
}

function porcentajeUso(step) {
  if (!step?.estimated_days_total) return 0;
  return Math.min(100, ((step.uses_count || 0) / step.estimated_days_total) * 100);
}

function colorBarra(pct) {
  if (pct >= 85) return C.urgent;
  if (pct >= 60) return C.gold;
  return C.green;
}

function calcularRacha(historial) {
  let racha = 0;
  const hoyD = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(hoyD);
    d.setDate(hoyD.getDate() - i);
    const key = d.toISOString().split('T')[0];
    if ((historial[key] || []).length > 0) {
      racha++;
    } else if (i > 0) {
      break;
    }
  }
  return racha;
}

// ─── DB helpers ───────────────────────────────────────────────────────────────
async function getRutinaDoc(uid) {
  const ref  = doc(db, 'usuarios', uid, 'rutina', 'estado');
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

async function guardarRutina(uid, data) {
  const ref = doc(db, 'usuarios', uid, 'rutina', 'estado');
  await setDoc(ref, data, { merge: true });
}

async function sumarPuntosRutina(uid, ptsActuales, puntos, motivo, descripcion) {
  const nuevoSaldo = parseFloat((ptsActuales + puntos).toFixed(2));

  const userRef = doc(db, 'usuarios', uid);
  await updateDoc(userRef, {
    'lealtad.puntos':                  nuevoSaldo,
    'lealtad.puntos_acumulados_total': nuevoSaldo,
    'metadata.ultima_interaccion':     serverTimestamp(),
  });

  await addDoc(collection(db, 'usuarios', uid, 'transacciones_lealtad'), {
    tipo:             'earn',
    motivo,
    puntos,
    saldo_resultante: nuevoSaldo,
    timestamp:        serverTimestamp(),
    metadata: {
      descripcion,
      aprobado_por: 'sistema',
      monto:        null,
      orden_id:     null,
    },
  });

  return nuevoSaldo;
}

// ─── Buscar producto por barcode via API Route (Admin API en servidor) ────────
// El barcode se manda al endpoint propio → el servidor consulta Shopify Admin API
// → devuelve el producto. El Admin token nunca toca el cliente.
async function buscarProductoPorBarcode(barcode) {
  const res = await fetch(`/api/shopify-barcode?barcode=${encodeURIComponent(barcode)}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`Error del servidor: ${res.status}`);
  }

  const json = await res.json();
  return json.producto || null; // null si no se encontró
}

// ─── Modal: escaneo de código de barras ──────────────────────────────────────
function ModalEscaneo({ onProductoEncontrado, onCerrar }) {
  const videoRef   = useRef(null);
  const streamRef  = useRef(null);
  const detectorRef = useRef(null);
  const rafRef     = useRef(null);

  const [estado,   setEstado]   = useState('iniciando'); // iniciando | escaneando | buscando | error
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    async function iniciarCamara() {
      try {
        // Verificar soporte de BarcodeDetector
        if (!('BarcodeDetector' in window)) {
          setEstado('error');
          setErrorMsg('Tu navegador no soporta el escáner de códigos. Ingresa el nombre manualmente.');
          return;
        }

        detectorRef.current = new window.BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'],
        });

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        });

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        setEstado('escaneando');
        escanearLoop();
      } catch (e) {
        setEstado('error');
        setErrorMsg('No se pudo acceder a la cámara. Verifica los permisos.');
      }
    }

    iniciarCamara();

    return () => {
      // Cleanup: detener cámara y loop
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, []);

  async function escanearLoop() {
    if (!videoRef.current || !detectorRef.current) return;
    try {
      const barcodes = await detectorRef.current.detect(videoRef.current);
      if (barcodes.length > 0) {
        const rawValue = barcodes[0].rawValue;
        setEstado('buscando');
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        // Detener cámara al detectar
        if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());

        try {
          const producto = await buscarProductoPorBarcode(rawValue);
          if (producto) {
            onProductoEncontrado(producto);
          } else {
            setEstado('error');
            setErrorMsg(`Código ${rawValue} no encontrado en Moonbow. Ingresa el nombre manualmente.`);
          }
        } catch (e) {
          setEstado('error');
          setErrorMsg('Error al buscar el producto. Verifica tu conexión.');
        }
        return;
      }
    } catch (e) {
      // Error de detección puntual, seguir escaneando
    }
    rafRef.current = requestAnimationFrame(escanearLoop);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,5,12,0.92)', backdropFilter: 'blur(16px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 600 }}>

      {/* Header */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '20px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>📷 Escanear código</div>
        <button onClick={onCerrar} style={{ background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff', borderRadius: 10, padding: '8px 14px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
          Cancelar
        </button>
      </div>

      {/* Video / Estado */}
      {(estado === 'iniciando' || estado === 'escaneando') && (
        <div style={{ position: 'relative', width: '85vw', maxWidth: 340, aspectRatio: '1/1', borderRadius: 24, overflow: 'hidden', border: '2px solid rgba(242,168,184,0.5)' }}>
          <video
            ref={videoRef}
            muted
            playsInline
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
          {/* Visor tipo scanner */}
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: '70%', height: '30%', border: '2px solid rgba(242,168,184,0.9)', borderRadius: 8, position: 'relative' }}>
              {/* Esquinas */}
              {[['top','left'],['top','right'],['bottom','left'],['bottom','right']].map(([v,h]) => (
                <div key={`${v}${h}`} style={{
                  position: 'absolute',
                  [v]: -2, [h]: -2,
                  width: 16, height: 16,
                  borderTop:    v === 'top'    ? '3px solid #F2A8B8' : 'none',
                  borderBottom: v === 'bottom' ? '3px solid #F2A8B8' : 'none',
                  borderLeft:   h === 'left'   ? '3px solid #F2A8B8' : 'none',
                  borderRight:  h === 'right'  ? '3px solid #F2A8B8' : 'none',
                }} />
              ))}
              {/* Línea de scan animada */}
              <div style={{
                position: 'absolute', left: 0, right: 0, height: 2,
                background: 'linear-gradient(90deg, transparent, #F2A8B8, transparent)',
                animation: 'scanLine 1.8s ease-in-out infinite',
              }} />
            </div>
          </div>
        </div>
      )}

      {estado === 'buscando' && (
        <div style={{ textAlign: 'center', color: '#fff' }}>
          <div style={{ fontSize: 48, marginBottom: 16, animation: 'spin 1.2s linear infinite' }}>✦</div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Buscando en Moonbow...</div>
        </div>
      )}

      {estado === 'error' && (
        <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 20, padding: '28px 24px', maxWidth: 300, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 14 }}>😕</div>
          <div style={{ fontSize: 14, color: '#fff', lineHeight: 1.6, marginBottom: 20 }}>{errorMsg}</div>
          <button onClick={onCerrar} style={{ background: `linear-gradient(135deg,${C.rose},${C.roseDark})`, color: '#fff', border: 'none', borderRadius: 12, padding: '12px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            Ingresar manualmente
          </button>
        </div>
      )}

      {estado === 'escaneando' && (
        <div style={{ marginTop: 24, fontSize: 13, color: 'rgba(255,255,255,0.6)', textAlign: 'center' }}>
          Apunta al código de barras del producto
        </div>
      )}

      <style>{`
        @keyframes scanLine {
          0%   { top: 0%; }
          50%  { top: calc(100% - 2px); }
          100% { top: 0%; }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// ─── Modal: preview de producto encontrado en Shopify ─────────────────────────
function ModalPreviewProducto({ producto, onConfirmar, onRechazar }) {
  const precio = producto.price
    ? new Intl.NumberFormat('es-CL', { style: 'currency', currency: producto.currency || 'CLP', minimumFractionDigits: 0 }).format(producto.price)
    : null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(45,27,46,0.7)', backdropFilter: 'blur(14px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 650, padding: '0 20px' }}>
      <div style={{ background: C.white, borderRadius: 28, padding: '28px 22px', width: '100%', maxWidth: 360, boxShadow: '0 24px 64px rgba(45,27,46,.25)' }}>

        <div style={{ fontSize: 13, color: C.textSoft, fontWeight: 600, marginBottom: 16, textAlign: 'center' }}>
          ✓ Producto encontrado
        </div>

        {/* Imagen */}
        {producto.image && (
          <div style={{ width: 100, height: 100, borderRadius: 18, overflow: 'hidden', margin: '0 auto 16px', border: `1px solid ${C.border}` }}>
            <img src={producto.image} alt={producto.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        )}

        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text, lineHeight: 1.3, marginBottom: 6 }}>{producto.title}</div>
          {precio && (
            <div style={{ fontSize: 15, fontWeight: 800, color: C.roseDark }}>{precio}</div>
          )}
          <div style={{ fontSize: 11, color: C.textSoft, marginTop: 4 }}>moonbow.cl</div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onRechazar}
            style={{ flex: 1, background: `${C.border}50`, border: 'none', borderRadius: 12, padding: '12px 0', fontSize: 13, fontWeight: 600, color: C.textMid, cursor: 'pointer', fontFamily: 'inherit' }}>
            No es este
          </button>
          <button
            onClick={() => onConfirmar(producto)}
            style={{ flex: 2, background: `linear-gradient(135deg,${C.rose},${C.roseDark})`, color: '#fff', border: 'none', borderRadius: 12, padding: '12px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            ✓ Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal: asignar producto a un paso ────────────────────────────────────────
function ModalProducto({ paso, stepData, onGuardar, onCerrar }) {
  const [nombre,       setNombre]       = useState(stepData?.product_name         || '');
  const [ml,           setMl]           = useState(stepData?.product_ml           || '');
  const [dias,         setDias]         = useState(stepData?.estimated_days_total || paso.dias_promedio);
  const [guardando,    setGuardando]    = useState(false);
  const [escaneando,   setEscaneando]   = useState(false);
  const [productoShopify, setProductoShopify] = useState(null); // producto encontrado pendiente de confirmar

  // Si ya hay datos de Shopify guardados, mostrarlos
  const [shopifyInfo, setShopifyInfo] = useState(
    stepData?.shopify_variant_id
      ? { variantId: stepData.shopify_variant_id, productUrl: stepData.shopify_product_url, image: stepData.shopify_image }
      : null
  );

  function handleProductoEncontrado(producto) {
    setEscaneando(false);
    setProductoShopify(producto);
  }

  function handleConfirmarProducto(producto) {
    setNombre(producto.title);
    setShopifyInfo({
      variantId:  producto.variantId,
      productUrl: producto.productUrl,
      image:      producto.image,
    });
    setProductoShopify(null);
  }

  async function handleGuardar(e) {
    e.preventDefault();
    if (!nombre.trim()) return;
    setGuardando(true);
    await onGuardar({
      product_name:         nombre.trim(),
      product_ml:           ml ? parseInt(ml) : null,
      estimated_days_total: parseInt(dias) || paso.dias_promedio,
      start_date:           stepData?.start_date || hoy(),
      uses_count:           stepData?.uses_count || 0,
      // Datos Shopify (null si no se escaneó)
      shopify_variant_id:   shopifyInfo?.variantId  || null,
      shopify_product_url:  shopifyInfo?.productUrl || null,
      shopify_image:        shopifyInfo?.image       || null,
    });
    setGuardando(false);
    onCerrar();
  }

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(45,27,46,0.55)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'flex-end', zIndex: 400 }} onClick={onCerrar}>
        <div style={{ background: C.white, borderRadius: '28px 28px 0 0', padding: '10px 22px 48px', width: '100%', maxWidth: 430, margin: '0 auto', boxShadow: '0 -8px 40px rgba(45,27,46,.14)' }} onClick={e => e.stopPropagation()}>
          <div style={{ width: 36, height: 4, background: C.border, borderRadius: 99, margin: '0 auto 20px' }} />

          <h3 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: '0 0 4px' }}>
            {paso.emoji} {paso.label}
          </h3>
          <p style={{ fontSize: 13, color: C.textSoft, margin: '0 0 20px' }}>
            {stepData ? 'Editar producto asignado' : 'Asigna un producto a este paso'}
          </p>

          {/* Botón escanear código de barras */}
          <button
            type="button"
            onClick={() => setEscaneando(true)}
            style={{
              width: '100%',
              background: shopifyInfo
                ? `${C.green}15`
                : `linear-gradient(135deg,${C.lavender}20,${C.rose}10)`,
              border: `1.5px dashed ${shopifyInfo ? C.green : C.lavender}`,
              borderRadius: 14,
              padding: '13px 16px',
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}>
            {shopifyInfo?.image && (
              <img src={shopifyInfo.image} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
            )}
            {!shopifyInfo?.image && (
              <div style={{ fontSize: 24, flexShrink: 0 }}>📷</div>
            )}
            <div style={{ textAlign: 'left', flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: shopifyInfo ? C.green : C.textMid }}>
                {shopifyInfo ? '✓ Producto vinculado a Moonbow' : 'Escanear código de barras'}
              </div>
              <div style={{ fontSize: 11, color: C.textSoft }}>
                {shopifyInfo
                  ? 'Toca para volver a escanear'
                  : 'Activa la cámara para identificar el producto'}
              </div>
            </div>
            {shopifyInfo && (
              <div style={{ fontSize: 18 }}>🔗</div>
            )}
          </button>

          <form onSubmit={handleGuardar}>
            <label style={sty.label}>Nombre del producto</label>
            <input
              style={sty.input}
              type="text"
              placeholder="Ej: Centella Ampoule"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              required
              autoFocus={!shopifyInfo}
            />

            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={sty.label}>Volumen (ml) <span style={{ color: C.textSoft }}>opcional</span></label>
                <input style={sty.input} type="number" placeholder="50" value={ml} onChange={e => setMl(e.target.value)} min="1" />
              </div>
              <div style={{ flex: 1 }}>
                <label style={sty.label}>Días estimados</label>
                <input style={sty.input} type="number" placeholder={paso.dias_promedio} value={dias} onChange={e => setDias(e.target.value)} min="7" required />
              </div>
            </div>

            <div style={{ background: `${C.lavender}20`, borderRadius: 12, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: C.textMid }}>
              💡 Cada vez que marques "usado hoy" se descuenta un día. El promedio para {paso.label.toLowerCase()} es ~{paso.dias_promedio} días.
            </div>

            <button type="submit" disabled={guardando}
              style={{ width: '100%', background: `linear-gradient(135deg,${C.rose},${C.roseDark})`, color: '#fff', border: 'none', borderRadius: 14, padding: 14, fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: guardando ? 0.7 : 1, fontFamily: 'inherit' }}>
              {guardando ? 'Guardando...' : '✓ Guardar'}
            </button>
          </form>

          <button onClick={onCerrar} style={sty.btnCerrar}>Cancelar</button>
        </div>
      </div>

      {/* Modal cámara */}
      {escaneando && (
        <ModalEscaneo
          onProductoEncontrado={handleProductoEncontrado}
          onCerrar={() => setEscaneando(false)}
        />
      )}

      {/* Modal preview producto Shopify */}
      {productoShopify && (
        <ModalPreviewProducto
          producto={productoShopify}
          onConfirmar={handleConfirmarProducto}
          onRechazar={() => { setProductoShopify(null); setEscaneando(true); }}
        />
      )}
    </>
  );
}

// ─── Modal: confirmación de puntos ganados ────────────────────────────────────
function ModalPuntosGanados({ puntos, mensaje, onCerrar }) {
  useEffect(() => {
    const t = setTimeout(onCerrar, 2800);
    return () => clearTimeout(t);
  }, [onCerrar]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(45,27,46,0.4)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500 }} onClick={onCerrar}>
      <div style={{ background: C.white, borderRadius: 28, padding: '36px 32px', textAlign: 'center', maxWidth: 300, boxShadow: '0 20px 60px rgba(45,27,46,.2)', animation: 'popIn .4s cubic-bezier(0.34,1.56,0.64,1)' }}>
        <div style={{ fontSize: 52, marginBottom: 12 }}>✨</div>
        <div style={{ fontSize: 26, fontWeight: 800, color: C.roseDark, marginBottom: 6 }}>+{puntos} pts</div>
        <div style={{ fontSize: 14, color: C.textMid, lineHeight: 1.5 }}>{mensaje}</div>
      </div>
      <style>{`@keyframes popIn { from { transform: scale(.7); opacity: 0; } to { transform: scale(1); opacity: 1; } }`}</style>
    </div>
  );
}

// ─── Tarjeta de paso de rutina ────────────────────────────────────────────────
function TarjetaPaso({ paso, stepData, usadoHoy, onMarcarUso, onEditar, cargando }) {
  const dias    = diasRestantes(stepData);
  const pct     = porcentajeUso(stepData);
  const alerta  = dias !== null && dias <= ALERTA_DIAS;
  const agotado = dias !== null && dias <= 0;

  function handleReponer() {
    if (stepData?.shopify_variant_id) {
      window.open(`https://moonbow.cl/cart/add?id=${stepData.shopify_variant_id}&quantity=1`, '_blank');
    } else {
      window.open('https://moonbow.cl/collections/all', '_blank');
    }
  }

  return (
    <div style={{
      background: usadoHoy
        ? `linear-gradient(135deg,${C.rose}18,${C.peach}10)`
        : C.white,
      border: `1.5px solid ${usadoHoy ? C.rose : alerta ? C.urgent + '60' : C.border}`,
      borderRadius: 18,
      padding: '14px 14px 12px',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      boxShadow: usadoHoy ? `0 4px 18px rgba(242,168,184,.22)` : '0 2px 8px rgba(45,27,46,.04)',
      transition: 'all .3s',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {usadoHoy && (
        <div style={{ position: 'absolute', top: -20, right: -20, fontSize: 48, opacity: 0.06 }}>✓</div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Imagen Shopify si existe, si no el emoji */}
        {stepData?.shopify_image ? (
          <div style={{ width: 32, height: 32, borderRadius: 8, overflow: 'hidden', flexShrink: 0, border: `1px solid ${C.border}` }}>
            <img src={stepData.shopify_image} alt={stepData.product_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        ) : (
          <div style={{ fontSize: 22, lineHeight: 1 }}>{paso.emoji}</div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{paso.label}</div>
          {stepData?.product_name && (
            <div style={{ fontSize: 11, color: C.textSoft, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {stepData.product_name}
            </div>
          )}
        </div>
        {usadoHoy && (
          <div style={{ width: 20, height: 20, borderRadius: '50%', background: `linear-gradient(135deg,${C.rose},${C.roseDark})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#fff', fontWeight: 800, flexShrink: 0 }}>✓</div>
        )}
      </div>

      {stepData && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 10, color: alerta ? C.urgent : C.textSoft, fontWeight: alerta ? 700 : 400 }}>
              {agotado ? '⚠️ Agotado' : alerta ? `⚠️ ~${dias} días` : dias !== null ? `~${dias} días` : ''}
            </span>
            <span style={{ fontSize: 10, color: C.textSoft }}>{Math.round(pct)}% usado</span>
          </div>
          <div style={{ height: 4, background: `${C.border}80`, borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: colorBarra(pct), borderRadius: 99, transition: 'width .6s ease' }} />
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 6 }}>
        {!usadoHoy && !agotado && (
          <button
            onClick={() => onMarcarUso(paso.id)}
            disabled={cargando}
            style={{
              flex: 1,
              background: stepData
                ? `linear-gradient(135deg,${C.rose},${C.roseDark})`
                : `${C.border}60`,
              color: stepData ? '#fff' : C.textMid,
              border: 'none',
              borderRadius: 10,
              padding: '8px 4px',
              fontSize: 11,
              fontWeight: 700,
              cursor: cargando ? 'default' : 'pointer',
              opacity: cargando ? 0.6 : 1,
              fontFamily: 'inherit',
              transition: 'all .2s',
            }}>
            {cargando ? '...' : stepData ? '✓ Marcar uso' : '+ Asignar'}
          </button>
        )}

        {usadoHoy && (
          <div style={{ flex: 1, background: C.greenBg, border: `1px solid ${C.green}40`, borderRadius: 10, padding: '8px 4px', fontSize: 11, fontWeight: 700, color: C.green, textAlign: 'center' }}>
            ✓ Listo hoy
          </div>
        )}

        <button
          onClick={() => onEditar(paso)}
          style={{ width: 34, background: `${C.border}40`, border: 'none', borderRadius: 10, fontSize: 14, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          ✎
        </button>
      </div>

      {alerta && !agotado && (
        <div style={{ background: `${C.urgent}10`, border: `1px solid ${C.urgent}30`, borderRadius: 10, padding: '8px 10px', fontSize: 11, color: C.urgent, fontWeight: 600 }}>
          ⚠️ Te quedan ~{dias} días de {paso.label.toLowerCase()}
          <div style={{ marginTop: 4 }}>
            <button
              onClick={handleReponer}
              style={{ background: C.urgent, color: '#fff', border: 'none', borderRadius: 7, padding: '4px 10px', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              Reponer ahora →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function TabRutina({ uid, ptsActuales, onPuntosActualizados }) {
  const [rutina,        setRutina]        = useState(null);
  const [cargando,      setCargando]      = useState(true);
  const [pasosCargando, setPasosCargando] = useState({});
  const [modalPaso,     setModalPaso]     = useState(null);
  const [modalPuntos,   setModalPuntos]   = useState(null);
  const [seccion,       setSeccion]       = useState('rutina');
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!uid) {
      setCargando(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setCargando(true);
      try {
        const data = await getRutinaDoc(uid);
        if (!cancelled) {
          setRutina(data || { steps: {}, historial_dias: {}, semana_actual: semanaActual(), dias_semana: 0 });
        }
      } catch (e) {
        console.error('Error cargando rutina:', e);
      } finally {
        if (!cancelled) setCargando(false);
      }
    })();
    return () => { cancelled = true; };
  }, [uid]);

  // ── Estado derivado ──────────────────────────────────────────────────────────
  const hoyStr         = hoy();
  const usadosHoy      = rutina?.historial_dias?.[hoyStr] || [];
  const steps          = rutina?.steps || {};
  const totalPasos     = PASOS_CONFIG.length;
  const completadosHoy = usadosHoy.length;
  const pctHoy         = Math.round((completadosHoy / totalPasos) * 100);
  const racha          = calcularRacha(rutina?.historial_dias || {});
  const diasSemana     = rutina?.dias_semana || 0;

  const conAlerta = PASOS_CONFIG.filter(p => {
    const d = diasRestantes(steps[p.id]);
    return d !== null && d <= ALERTA_DIAS;
  });

  const handleMarcarUso = useCallback(async (pasoId) => {
    if (!uid) return;
    if (usadosHoy.includes(pasoId)) return;

    const paso = PASOS_CONFIG.find(p => p.id === pasoId);

    if (!steps[pasoId]) {
      setModalPaso(paso);
      return;
    }

    setPasosCargando(prev => ({ ...prev, [pasoId]: true }));

    try {
      const nuevoUsadosHoy = [...usadosHoy, pasoId];
      const nuevoUses      = (steps[pasoId]?.uses_count || 0) + 1;
      const nuevaHistorial = { ...(rutina?.historial_dias || {}), [hoyStr]: nuevoUsadosHoy };

      setRutina(prev => ({
        ...prev,
        steps: { ...prev.steps, [pasoId]: { ...prev.steps[pasoId], uses_count: nuevoUses } },
        historial_dias: nuevaHistorial,
      }));

      const esCompletado      = nuevoUsadosHoy.length === totalPasos;
      const semanaClave       = semanaActual();
      const mismasSemana      = (rutina?.semana_actual || semanaClave) === semanaClave;
      const diasSemanaNew     = mismasSemana ? (rutina?.dias_semana || 0) : 0;
      const primerDiaCompleto = esCompletado && !(rutina?.dias_completos_semana || []).includes(hoyStr);
      const diasSemanaFinal   = primerDiaCompleto ? diasSemanaNew + 1 : diasSemanaNew;

      const nuevaRutina = {
        steps: {
          ...steps,
          [pasoId]: { ...steps[pasoId], uses_count: nuevoUses },
        },
        historial_dias: nuevaHistorial,
        semana_actual: semanaClave,
        dias_semana: mismasSemana ? diasSemanaFinal : 1,
        dias_completos_semana: primerDiaCompleto
          ? [...(rutina?.dias_completos_semana || []), hoyStr]
          : (rutina?.dias_completos_semana || []),
        last_check: serverTimestamp(),
      };
      await guardarRutina(uid, nuevaRutina);

      if (primerDiaCompleto) {
        const ptsSaldo = typeof ptsActuales === 'number' ? ptsActuales : 0;
        const nuevoSaldo = await sumarPuntosRutina(uid, ptsSaldo, PTS_DIA_COMPLETO, 'rutina_diaria', 'Rutina diaria completada ✨');
        if (mounted.current) {
          setModalPuntos({ puntos: PTS_DIA_COMPLETO, mensaje: '¡Rutina completada hoy! Sigue así ✨' });
          if (onPuntosActualizados) onPuntosActualizados(nuevoSaldo);
        }

        if (diasSemanaFinal >= DIAS_BONUS && !rutina?.bonus_semanal_cobrado?.[semanaClave]) {
          const nuevoSaldo2 = await sumarPuntosRutina(uid, nuevoSaldo, PTS_BONUS_SEMANAL, 'bonus_semanal_rutina', `Bonus semanal: ${diasSemanaFinal} días de rutina`);
          await guardarRutina(uid, { bonus_semanal_cobrado: { ...(rutina?.bonus_semanal_cobrado || {}), [semanaClave]: true } });
          if (mounted.current) {
            setTimeout(() => {
              if (mounted.current) setModalPuntos({ puntos: PTS_BONUS_SEMANAL, mensaje: `¡Bonus semanal! ${diasSemanaFinal} días seguidos 🏅` });
              if (onPuntosActualizados) onPuntosActualizados(nuevoSaldo2);
            }, 3200);
          }
        }
      }

    } catch (e) {
      console.error('Error marcando uso:', e);
    } finally {
      if (mounted.current) setPasosCargando(prev => ({ ...prev, [pasoId]: false }));
    }
  }, [uid, rutina, usadosHoy, steps, hoyStr, ptsActuales, onPuntosActualizados, totalPasos]);

  const handleGuardarProducto = useCallback(async (producto) => {
    if (!modalPaso || !uid) return;
    const pasoId = modalPaso.id;
    const nuevaRutina = {
      steps: { ...steps, [pasoId]: { ...steps[pasoId], ...producto } },
      last_check: serverTimestamp(),
    };
    setRutina(prev => ({
      ...prev,
      steps: { ...prev.steps, [pasoId]: { ...prev.steps[pasoId], ...producto } },
    }));
    await guardarRutina(uid, nuevaRutina);
  }, [uid, modalPaso, steps]);

  // ── Loading / guard ──────────────────────────────────────────────────────────
  if (cargando) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0', gap: 12 }}>
        <div style={{ fontSize: 28, animation: 'spin 2s linear infinite' }}>✦</div>
        <div style={{ fontSize: 13, color: C.textSoft }}>Cargando tu rutina...</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!uid) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 20px', color: C.textSoft, fontSize: 13 }}>
        No se pudo cargar la rutina. Intenta cerrar sesión y volver a entrar.
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: 24, position: 'relative', zIndex: 1 }}>

      {/* ── Banner de progreso diario ──────────────────────────────────────────── */}
      <div style={{
        background: pctHoy === 100
          ? `linear-gradient(135deg,${C.rose}30,${C.peach}20)`
          : `linear-gradient(135deg,#FFF0F4,#FFF8F0)`,
        borderRadius: 20,
        padding: '16px 18px',
        marginBottom: 16,
        border: `1.5px solid ${pctHoy === 100 ? C.rose : C.border}`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 2 }}>
              {pctHoy === 100 ? '🎉 ¡Rutina completa!' : 'Rutina de hoy'}
            </div>
            <div style={{ fontSize: 12, color: C.textSoft }}>
              {completadosHoy}/{totalPasos} pasos · {pctHoy}% completado
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: C.roseDark }}>{racha}</div>
            <div style={{ fontSize: 10, color: C.textSoft }}>días seguidos 🔥</div>
          </div>
        </div>

        <div style={{ height: 6, background: `${C.border}60`, borderRadius: 99, overflow: 'hidden', marginBottom: 10 }}>
          <div style={{
            height: '100%',
            width: `${pctHoy}%`,
            background: pctHoy === 100
              ? `linear-gradient(90deg,${C.green},#3A9E78)`
              : `linear-gradient(90deg,${C.rose},${C.roseDark})`,
            borderRadius: 99,
            transition: 'width .8s ease',
          }} />
        </div>

        {pctHoy < 100 && (
          <div style={{ fontSize: 11, color: C.roseDark, fontWeight: 600 }}>
            ✨ Completa tu rutina hoy y gana +{PTS_DIA_COMPLETO} pts
          </div>
        )}
        {pctHoy === 100 && (
          <div style={{ fontSize: 11, color: C.green, fontWeight: 600 }}>
            ✓ Ganaste +{PTS_DIA_COMPLETO} pts hoy · Semana: {diasSemana}/{DIAS_BONUS} días para bonus
          </div>
        )}
      </div>

      {/* ── Tabs internas: Rutina / Reposición ────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {['rutina', 'reposicion'].map(tab => (
          <button key={tab} onClick={() => setSeccion(tab)}
            style={{
              flex: 1,
              padding: '9px 4px',
              borderRadius: 12,
              border: `1.5px solid ${seccion === tab ? C.rose : C.border}`,
              background: seccion === tab ? `linear-gradient(135deg,${C.rose}20,${C.peach}10)` : C.white,
              fontSize: 12,
              fontWeight: 700,
              color: seccion === tab ? C.roseDark : C.textMid,
              cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              transition: 'all .2s',
            }}>
            {tab === 'rutina' ? '🌸 Rutina' : `⚠️ Reponer${conAlerta.length > 0 ? ` (${conAlerta.length})` : ''}`}
          </button>
        ))}
      </div>

      {/* ── VISTA: Grid de rutina ───────────────────────────────────────────── */}
      {seccion === 'rutina' && (
        <div>
          <div style={{ fontSize: 12, color: C.textSoft, marginBottom: 12 }}>
            Toca un paso para marcarlo como usado hoy
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {PASOS_CONFIG.map(paso => (
              <TarjetaPaso
                key={paso.id}
                paso={paso}
                stepData={steps[paso.id]}
                usadoHoy={usadosHoy.includes(paso.id)}
                onMarcarUso={handleMarcarUso}
                onEditar={setModalPaso}
                cargando={!!pasosCargando[paso.id]}
              />
            ))}
          </div>

          {/* Bono semanal */}
          <div style={{ background: `linear-gradient(135deg,${C.lavender}20,#F8F5FF)`, borderRadius: 16, padding: '14px 16px', marginTop: 16, border: `1px solid ${C.lavender}50` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.textMid }}>🏅 Bonus semanal</div>
              <div style={{ fontSize: 12, fontWeight: 800, color: C.roseDark }}>+{PTS_BONUS_SEMANAL} pts</div>
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} style={{ flex: 1, height: 6, borderRadius: 99, background: i < diasSemana ? `linear-gradient(90deg,${C.rose},${C.roseDark})` : `${C.border}60`, transition: 'background .3s' }} />
              ))}
            </div>
            <div style={{ fontSize: 11, color: C.textSoft }}>
              {diasSemana >= DIAS_BONUS
                ? '✓ ¡Bonus desbloqueado esta semana!'
                : `Completa ${DIAS_BONUS} días esta semana · ${diasSemana}/${DIAS_BONUS} completados`}
            </div>
          </div>
        </div>
      )}

      {/* ── VISTA: Reposición ───────────────────────────────────────────────── */}
      {seccion === 'reposicion' && (
        <div>
          {conAlerta.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div style={{ fontSize: 44, marginBottom: 14 }}>🌿</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 8 }}>
                ¡Todo en orden!
              </div>
              <div style={{ fontSize: 13, color: C.textSoft, lineHeight: 1.6 }}>
                Ningún producto está por agotarse en los próximos {ALERTA_DIAS} días.
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 12, color: C.textSoft, marginBottom: 12 }}>
                {conAlerta.length} producto{conAlerta.length > 1 ? 's' : ''} por agotarse
              </div>
              {conAlerta.map(paso => {
                const s   = steps[paso.id];
                const d   = diasRestantes(s);
                const pct = porcentajeUso(s);
                const tieneVariant = !!s?.shopify_variant_id;

                return (
                  <div key={paso.id} style={{ background: C.white, borderRadius: 18, padding: '16px', marginBottom: 10, border: `1.5px solid ${d <= 3 ? C.urgent + '60' : C.gold + '60'}` }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
                      {/* Imagen del producto si existe */}
                      {s?.shopify_image ? (
                        <div style={{ width: 40, height: 40, borderRadius: 10, overflow: 'hidden', flexShrink: 0, border: `1px solid ${C.border}` }}>
                          <img src={s.shopify_image} alt={s.product_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                      ) : (
                        <div style={{ fontSize: 28 }}>{paso.emoji}</div>
                      )}
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{paso.label}</div>
                        <div style={{ fontSize: 11, color: C.textSoft }}>{s?.product_name || '—'}</div>
                        {tieneVariant && (
                          <div style={{ fontSize: 10, color: C.green, fontWeight: 600, marginTop: 2 }}>🔗 Vinculado a Moonbow</div>
                        )}
                      </div>
                      <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                        <div style={{ fontSize: 15, fontWeight: 800, color: d <= 3 ? C.urgent : C.gold }}>~{d} días</div>
                        <div style={{ fontSize: 10, color: C.textSoft }}>restantes</div>
                      </div>
                    </div>

                    <div style={{ height: 5, background: `${C.border}60`, borderRadius: 99, overflow: 'hidden', marginBottom: 12 }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: colorBarra(pct), borderRadius: 99 }} />
                    </div>

                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => {
                          if (tieneVariant) {
                            window.open(`https://moonbow.cl/cart/add?id=${s.shopify_variant_id}&quantity=1`, '_blank');
                          } else {
                            window.open('https://moonbow.cl/collections/all', '_blank');
                          }
                        }}
                        style={{ flex: 2, background: `linear-gradient(135deg,${C.rose},${C.roseDark})`, color: '#fff', border: 'none', borderRadius: 12, padding: '10px 0', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                        {tieneVariant ? '🛒 Agregar al carro →' : 'Reponer mismo →'}
                      </button>
                      <button
                        onClick={() => window.open('https://moonbow.cl/collections/all', '_blank')}
                        style={{ flex: 1, background: `${C.lavender}30`, border: `1px solid ${C.lavender}60`, color: C.textMid, borderRadius: 12, padding: '10px 0', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                        Alternativa
                      </button>
                    </div>
                  </div>
                );
              })}

              <div style={{ background: `${C.gold}15`, borderRadius: 14, padding: '12px 14px', marginTop: 8, border: `1px solid ${C.gold}40` }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#8B6914', marginBottom: 3 }}>💡 Compra antes de que se agote</div>
                <div style={{ fontSize: 12, color: C.textMid, lineHeight: 1.5 }}>Suma puntos en cada recompra y mantén tu racha de rutina. ¡Tu piel te lo agradecerá!</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Modales ──────────────────────────────────────────────────────────── */}
      {modalPaso && (
        <ModalProducto
          paso={modalPaso}
          stepData={steps[modalPaso.id]}
          onGuardar={handleGuardarProducto}
          onCerrar={() => setModalPaso(null)}
        />
      )}
      {modalPuntos && (
        <ModalPuntosGanados
          puntos={modalPuntos.puntos}
          mensaje={modalPuntos.mensaje}
          onCerrar={() => setModalPuntos(null)}
        />
      )}

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(12px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ─── Estilos compartidos ──────────────────────────────────────────────────────
const sty = {
  label: {
    display: 'block',
    fontSize: 12,
    color: C.textSoft,
    marginBottom: 6,
    textAlign: 'left',
  },
  input: {
    width: '100%',
    background: '#F9F4F7',
    border: `1px solid ${C.border}`,
    borderRadius: 12,
    padding: '12px 14px',
    color: C.text,
    fontSize: 14,
    marginBottom: 12,
    boxSizing: 'border-box',
    outline: 'none',
    fontFamily: 'inherit',
  },
  btnCerrar: {
    width: '100%',
    marginTop: 12,
    background: 'transparent',
    border: 'none',
    color: C.textSoft,
    fontSize: 13,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
};