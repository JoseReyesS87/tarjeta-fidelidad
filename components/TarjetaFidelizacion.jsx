'use client';
// components/TarjetaFidelizacion.jsx — v5

import { useState, useEffect, useRef } from 'react';
import {
  getUsuario, getHistorialPuntos, canjearRecompensa,
  crearAccionPendiente, generarLinkReferido,
  NIVELES, TOTAL_SELLOS, REGLA_COMPRA,
} from '../lib/puntos';

// ─── Paleta ───────────────────────────────────────────────────────────────────
const C = {
  bg:        '#FDF8F5',
  white:     '#FFFFFF',
  bgSoft:    '#FEF3F0',
  rose:      '#F2A8B8',
  roseDark:  '#D9607A',
  peach:     '#F7C5A8',
  peachDark: '#E8935A',
  lavender:  '#C9B8E8',
  mint:      '#A8D8C8',
  gold:      '#D4A96A',
  silver:    '#A8A9AD',
  text:      '#2D1B2E',
  textMid:   '#6B4A5E',
  textSoft:  '#A8849A',
  border:    '#EDD8E4',
  green:     '#5BB896',
  greenBg:   '#EDFAF4',
  red:       '#E8857E',
  urgent:    '#FF6B6B',
};

const TIER_COLORS = {
  bronze: { from: '#F2C4A0', to: '#E89878' },
  silver: { from: '#D0D0D4', to: '#A8A9AD' },
  gold:   { from: '#F7D98B', to: '#D4A96A' },
};

// ─── Calcular progreso CORRECTO entre niveles ─────────────────────────────────
//
// FIX: antes calculaba pts / proxNivel.puntos → daba 100% con 5/5 aunque
// el nivel fuera el primero. Ahora calcula desde el nivel anterior:
//   progreso = (pts - ptsNivelAnterior) / (ptsProxNivel - ptsNivelAnterior)
//
function calcularProgreso(pts, niveles) {
  const proxNivel = niveles.find(n => pts < n.puntos);
  if (!proxNivel) return { progreso: 100, proxNivel: null, ptsFaltan: 0, ptsDesde: 0 };

  const idxProx      = niveles.indexOf(proxNivel);
  const nivelPrevio  = idxProx > 0 ? niveles[idxProx - 1] : null;
  const ptsDesde     = nivelPrevio ? nivelPrevio.puntos : 0;
  const rango        = proxNivel.puntos - ptsDesde;
  const avance       = pts - ptsDesde;
  const progreso     = Math.min(Math.max((avance / rango) * 100, 0), 100);
  const ptsFaltan    = proxNivel.puntos - pts;

  return { progreso, proxNivel, ptsFaltan, ptsDesde };
}

function accionesFaltantes(ptsFaltantes) {
  if (ptsFaltantes <= 0.5) return 'una reseña o historia';
  if (ptsFaltantes <= 1)   return 'una compra';
  if (ptsFaltantes <= 1.5) return 'una compra y una reseña';
  return `${ptsFaltantes.toFixed(1)} pts más`;
}

// ─── Fondo decorativo ─────────────────────────────────────────────────────────
function KBeautyBg() {
  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: -100, right: -100, width: 320, height: 320, borderRadius: '50%', background: 'radial-gradient(circle, rgba(242,168,184,0.14) 0%, transparent 70%)' }} />
      <div style={{ position: 'absolute', top: 200, left: -80, width: 240, height: 240, borderRadius: '50%', background: 'radial-gradient(circle, rgba(201,184,232,0.10) 0%, transparent 70%)' }} />
      <div style={{ position: 'absolute', bottom: 200, right: -60, width: 260, height: 260, borderRadius: '50%', background: 'radial-gradient(circle, rgba(168,216,200,0.09) 0%, transparent 70%)' }} />
    </div>
  );
}

// ─── Sellos de rutina ─────────────────────────────────────────────────────────
const PASOS_RUTINA = [
  { label: 'Limpieza',   emoji: '🧼' },
  { label: 'Tónico',     emoji: '💧' },
  { label: 'Sérum',      emoji: '✨' },
  { label: 'Mascarilla', emoji: '🌿' },
  { label: 'Contorno',   emoji: '👁️' },
  { label: 'Crema',      emoji: '🫧' },
  { label: 'SPF',        emoji: '☀️' },
  { label: 'Extra',      emoji: '🌸' },
  { label: 'Esencia',    emoji: '🍯' },
  { label: 'Exfoliant',  emoji: '💎' },
  { label: 'Bruma',      emoji: '🌫️' },
  { label: 'Ojo',        emoji: '🔮' },
];

function SelloRutina({ paso, activo, numero }) {
  const [tip, setTip] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, position: 'relative' }}
      onMouseEnter={() => setTip(true)} onMouseLeave={() => setTip(false)}
      onTouchStart={() => setTip(true)} onTouchEnd={() => setTip(false)}>
      <div style={{ width: '100%', aspectRatio: '1', borderRadius: '50%', background: activo ? `linear-gradient(135deg,${C.rose}35,${C.peach}25)` : 'rgba(237,216,228,0.28)', border: `2px solid ${activo ? C.rose : C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: activo ? 16 : 14, boxShadow: activo ? `0 3px 12px rgba(242,168,184,0.32)` : 'none', transition: 'all 0.35s cubic-bezier(0.34,1.56,0.64,1)', transform: activo ? 'scale(1)' : 'scale(0.92)', filter: activo ? 'none' : 'grayscale(50%) opacity(0.5)', position: 'relative' }}>
        {paso.emoji}
        {activo && <div style={{ position: 'absolute', bottom: -2, right: -2, width: 13, height: 13, borderRadius: '50%', background: `linear-gradient(135deg,${C.roseDark},${C.peachDark})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 6, fontWeight: 800, color: '#fff', border: '1.5px solid #fff' }}>{numero}</div>}
      </div>
      <div style={{ fontSize: 8, color: activo ? C.roseDark : C.textSoft, fontWeight: activo ? 600 : 400, textAlign: 'center' }}>{paso.label}</div>
      {tip && (
        <div style={{ position: 'absolute', bottom: '112%', left: '50%', transform: 'translateX(-50%)', background: C.text, color: '#fff', fontSize: 10, padding: '4px 9px', borderRadius: 7, whiteSpace: 'nowrap', zIndex: 50, pointerEvents: 'none' }}>
          {activo ? `✓ ${paso.label}` : `Desbloquea ${paso.label}`}
          <div style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: `5px solid ${C.text}` }} />
        </div>
      )}
    </div>
  );
}

// ─── Modal selección de premio ────────────────────────────────────────────────
function ModalPremio({ nivel, onConfirmar, onCerrar, canjeando }) {
  const [seleccion, setSeleccion] = useState(null);
  const t = TIER_COLORS[nivel.tier] || TIER_COLORS.bronze;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(45,27,46,0.55)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'flex-end', zIndex: 300 }} onClick={onCerrar}>
      <div style={{ background: C.white, borderRadius: '28px 28px 0 0', padding: '10px 22px 52px', width: '100%', maxWidth: 430, width: '100%', margin: '0 auto', boxShadow: '0 -8px 40px rgba(45,27,46,0.14)' }} onClick={e => e.stopPropagation()}>
        <div style={{ width: 36, height: 4, background: C.border, borderRadius: 99, margin: '0 auto 20px' }} />
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: `linear-gradient(135deg,${t.from},${t.to})`, borderRadius: 99, padding: '5px 16px', fontSize: 12, fontWeight: 700, color: '#fff', marginBottom: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }}>
            ✦ {nivel.label}
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.text, fontFamily: "'Playfair Display', serif", marginBottom: 4 }}>Elige tu recompensa</div>
          <div style={{ fontSize: 13, color: C.textSoft }}>{nivel.pregunta}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
          {nivel.opciones.map(opcion => {
            const elegida = seleccion === opcion.id;
            return (
              <div key={opcion.id} onClick={() => setSeleccion(opcion.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 14, background: elegida ? `linear-gradient(135deg,${C.bgSoft},#FFF0FB)` : C.bgSoft, border: `2px solid ${elegida ? C.roseDark : C.border}`, borderRadius: 18, padding: '14px 16px', cursor: 'pointer', transition: 'all 0.2s', boxShadow: elegida ? `0 4px 16px rgba(217,96,122,0.15)` : 'none' }}>
                <div style={{ fontSize: 28, flexShrink: 0 }}>{opcion.emoji}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 2 }}>{opcion.label}</div>
                  <div style={{ fontSize: 12, color: C.textSoft }}>{opcion.desc}</div>
                </div>
                <div style={{ width: 22, height: 22, borderRadius: '50%', border: `2px solid ${elegida ? C.roseDark : C.border}`, background: elegida ? C.roseDark : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.2s' }}>
                  {elegida && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }} />}
                </div>
              </div>
            );
          })}
        </div>
        <button onClick={() => seleccion && onConfirmar(seleccion)} disabled={!seleccion || canjeando}
          style={{ width: '100%', background: seleccion ? `linear-gradient(135deg,${C.rose},${C.roseDark})` : C.border, color: seleccion ? '#fff' : C.textSoft, border: 'none', borderRadius: 16, padding: 15, fontSize: 15, fontWeight: 700, cursor: seleccion && !canjeando ? 'pointer' : 'not-allowed', boxShadow: seleccion ? `0 6px 20px rgba(217,96,122,0.3)` : 'none', transition: 'all 0.2s', fontFamily: 'inherit' }}>
          {canjeando ? 'Canjeando...' : seleccion ? 'Confirmar elección ✦' : 'Elige una opción primero'}
        </button>
      </div>
    </div>
  );
}

// ─── Modal código obtenido ────────────────────────────────────────────────────
function ModalCodigo({ codigo, opcion, onCerrar }) {
  const [copiado, setCopiado] = useState(false);
  function copiar() { navigator.clipboard.writeText(codigo); setCopiado(true); setTimeout(() => setCopiado(false), 2500); }

  if (!codigo) return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(45,27,46,0.55)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400, padding: 20 }}>
      <div style={{ background: C.white, borderRadius: 28, padding: '36px 28px', width: '100%', maxWidth: 380, textAlign: 'center', boxShadow: '0 20px 60px rgba(45,27,46,0.2)' }}>
        <div style={{ fontSize: 52, marginBottom: 16 }}>{opcion.emoji}</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: C.text, fontFamily: "'Playfair Display', serif", marginBottom: 8 }}>¡Recompensa canjeada!</div>
        <div style={{ background: C.bgSoft, borderRadius: 16, padding: '14px 18px', marginBottom: 22, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 12, color: C.textSoft, marginBottom: 4 }}>¿Qué sigue?</div>
          <div style={{ fontSize: 13, color: C.textMid, lineHeight: 1.5 }}>Pasa por nuestra tienda de Providencia o escríbenos en Instagram <strong style={{ color: C.roseDark }}>@moonbowclub</strong> para coordinar tu {opcion.label} 🌸</div>
        </div>
        <button onClick={onCerrar} style={{ width: '100%', background: `linear-gradient(135deg,${C.rose},${C.roseDark})`, color: '#fff', border: 'none', borderRadius: 14, padding: 14, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Entendido ✦</button>
      </div>
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(45,27,46,0.55)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400, padding: 20 }}>
      <div style={{ background: C.white, borderRadius: 28, padding: '36px 28px', width: '100%', maxWidth: 380, textAlign: 'center', boxShadow: '0 20px 60px rgba(45,27,46,0.2)' }}>
        <div style={{ fontSize: 52, marginBottom: 12 }}>🎉</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: C.text, fontFamily: "'Playfair Display', serif", marginBottom: 6 }}>¡Tu código está listo!</div>
        <div style={{ fontSize: 13, color: C.textSoft, marginBottom: 22 }}>Úsalo en moonbow.cl al hacer tu próxima compra</div>
        <div style={{ background: `linear-gradient(135deg,${C.bgSoft},#FFF0FB)`, border: `2px dashed ${C.rose}`, borderRadius: 18, padding: '20px 24px', marginBottom: 18 }}>
          <div style={{ fontSize: 11, color: C.textSoft, marginBottom: 8, letterSpacing: 1, textTransform: 'uppercase' }}>Tu código de descuento</div>
          <div style={{ fontSize: 32, fontWeight: 800, color: C.roseDark, letterSpacing: 3, fontFamily: "'Playfair Display', serif" }}>{codigo}</div>
          <div style={{ fontSize: 12, color: C.textMid, marginTop: 8 }}>{opcion.desc}</div>
        </div>
        <button onClick={copiar} style={{ width: '100%', background: copiado ? `linear-gradient(135deg,${C.green},#3A9E78)` : `linear-gradient(135deg,${C.rose},${C.roseDark})`, color: '#fff', border: 'none', borderRadius: 14, padding: 14, fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 10, transition: 'all 0.3s', fontFamily: 'inherit' }}>
          {copiado ? '✓ ¡Copiado!' : '📋 Copiar código'}
        </button>
        <a href="https://moonbow.cl" target="_blank" rel="noopener noreferrer"
          style={{ display: 'block', background: C.bgSoft, border: `1px solid ${C.border}`, color: C.roseDark, borderRadius: 14, padding: 13, fontSize: 14, fontWeight: 600, textDecoration: 'none', marginBottom: 10 }}>
          Ir a moonbow.cl →
        </a>
        <button onClick={onCerrar} style={{ background: 'none', border: 'none', color: C.textSoft, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Cerrar</button>
      </div>
    </div>
  );
}

// ─── Modal solicitud de puntos ────────────────────────────────────────────────
function ModalSolicitud({ tipo, onConfirmar, onCerrar, enviando }) {
  const [linkResena, setLinkResena] = useState('');
  const [handleIg, setHandleIg]     = useState('');
  const [imagenFile, setImagenFile] = useState(null);
  const [preview, setPreview]       = useState(null);
  const fileRef = useRef();

  function handleImagen(e) { const f = e.target.files[0]; if (!f) return; setImagenFile(f); setPreview(URL.createObjectURL(f)); }
  function handleSubmit()  {
    if (tipo === 'resena_google' && !linkResena.trim()) return;
    if (tipo === 'historia_ig'  && !imagenFile)         return;
    onConfirmar({ linkResena, handleIg, imagenFile });
  }

  const cfg = {
    resena_google: { emoji: '⭐', titulo: 'Reseña en Google',      pts: '+1 pt',  color: '#FFD97D' },
    historia_ig:   { emoji: '📸', titulo: 'Historia en Instagram', pts: '+½ pt', color: C.lavender },
  }[tipo];

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(45,27,46,0.5)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'flex-end', zIndex: 300 }} onClick={onCerrar}>
      <div style={{ background: C.white, borderRadius: '28px 28px 0 0', padding: '10px 24px 52px', width: '100%', maxWidth: 430, width: '100%', margin: '0 auto', boxShadow: '0 -8px 40px rgba(45,27,46,0.12)' }} onClick={e => e.stopPropagation()}>
        <div style={{ width: 36, height: 4, background: C.border, borderRadius: 99, margin: '0 auto 22px' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <div>
            <div style={{ display: 'inline-block', background: `${cfg.color}40`, borderRadius: 10, padding: '3px 10px', fontSize: 11, fontWeight: 700, color: C.textMid, marginBottom: 8 }}>{cfg.pts} de recompensa</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.text, fontFamily: "'Playfair Display', serif" }}>{cfg.emoji} {cfg.titulo}</div>
          </div>
          <button onClick={onCerrar} style={{ background: C.bgSoft, border: 'none', borderRadius: 12, width: 34, height: 34, cursor: 'pointer', color: C.textMid, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>
        {tipo === 'resena_google' && (
          <>
            <p style={{ fontSize: 13, color: C.textMid, marginBottom: 16, lineHeight: 1.6 }}>Deja tu reseña en Google y pega el link aquí para validar tus puntos 🌸</p>
            <a href="https://g.page/r/moonbow-club/review" target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: C.bgSoft, border: `1.5px solid ${C.border}`, color: C.roseDark, borderRadius: 14, padding: '12px 16px', fontSize: 13, fontWeight: 600, textDecoration: 'none', marginBottom: 16 }}>
              Ir a Google Maps →
            </a>
            <label style={mS.label}>Pega el link de tu reseña *</label>
            <input style={mS.input} value={linkResena} onChange={e => setLinkResena(e.target.value)} placeholder="https://maps.google.com/..." />
          </>
        )}
        {tipo === 'historia_ig' && (
          <>
            <p style={{ fontSize: 13, color: C.textMid, marginBottom: 16, lineHeight: 1.6 }}>Sube un screenshot etiquetando a <strong style={{ color: C.roseDark }}>@moonbowclub</strong> ✨</p>
            <label style={mS.label}>Tu @ de Instagram (opcional)</label>
            <input style={mS.input} value={handleIg} onChange={e => setHandleIg(e.target.value)} placeholder="@tuusuario" />
            <label style={mS.label}>Screenshot de tu historia *</label>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImagen} />
            {preview
              ? <div style={{ marginBottom: 14 }}><img src={preview} alt="Preview" style={{ width: '100%', borderRadius: 14, marginBottom: 8, border: `1px solid ${C.border}` }} /><button onClick={() => fileRef.current.click()} style={{ background: 'none', border: 'none', color: C.textSoft, fontSize: 12, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>Cambiar imagen</button></div>
              : <button onClick={() => fileRef.current.click()} style={{ width: '100%', background: C.bgSoft, border: `2px dashed ${C.border}`, borderRadius: 14, padding: '20px', color: C.textSoft, fontSize: 13, cursor: 'pointer', marginBottom: 14, fontFamily: 'inherit' }}>📷 Seleccionar imagen</button>
            }
          </>
        )}
        <button onClick={handleSubmit} disabled={enviando}
          style={{ width: '100%', background: `linear-gradient(135deg,${C.rose},${C.roseDark})`, color: '#fff', border: 'none', borderRadius: 16, padding: 15, fontSize: 15, fontWeight: 700, cursor: enviando ? 'not-allowed' : 'pointer', boxShadow: `0 6px 20px rgba(217,96,122,0.3)`, opacity: enviando ? 0.7 : 1, fontFamily: 'inherit' }}>
          {enviando ? 'Enviando...' : `Ganar ${cfg.pts} ahora ✦`}
        </button>
      </div>
    </div>
  );
}

const mS = {
  label: { display: 'block', fontSize: 12, color: C.textMid, marginBottom: 6, fontWeight: 600 },
  input: { width: '100%', background: C.bgSoft, border: `1.5px solid ${C.border}`, borderRadius: 12, padding: '12px 14px', color: C.text, fontSize: 14, marginBottom: 14, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' },
};

// ─── Componente principal ─────────────────────────────────────────────────────
export default function TarjetaFidelizacion({ uid, onLogout }) {
  const [usuario, setUsuario]               = useState(null);
  const [historial, setHistorial]           = useState([]);
  const [vista, setVista]                   = useState('tarjeta');
  const [cargando, setCargando]             = useState(true);
  const [mensaje, setMensaje]               = useState(null);
  const [linkReferido, setLinkReferido]     = useState('');
  const [modalSolicitud, setModalSolicitud] = useState(null);
  const [enviando, setEnviando]             = useState(false);
  const [modalPremio, setModalPremio]       = useState(null);
  const [canjeando, setCanjeando]           = useState(false);
  const [modalCodigo, setModalCodigo]       = useState(null);

  useEffect(() => { cargarDatos(); }, [uid]);

  async function cargarDatos() {
    setCargando(true);
    const [user, hist] = await Promise.all([getUsuario(uid), getHistorialPuntos(uid, 10)]);
    setUsuario(user);
    setHistorial(hist);
    setLinkReferido(generarLinkReferido(uid));
    setCargando(false);
  }

  async function handleConfirmarSolicitud({ linkResena, handleIg, imagenFile }) {
    setEnviando(true);
    try {
      let imagenUrl = null;
      if (imagenFile) imagenUrl = await subirImagen(imagenFile, uid);
      const extras = {};
      if (modalSolicitud === 'resena_google' && linkResena) extras.link_resena = linkResena.trim();
      if (modalSolicitud === 'historia_ig'   && handleIg)   extras.handle_ig   = handleIg.trim();
      const desc = { resena_google: 'Reseña en Google', historia_ig: 'Historia en Instagram' };
      await crearAccionPendiente(uid, usuario?.perfil?.nombre || '', modalSolicitud, desc[modalSolicitud], imagenUrl, extras);
      setModalSolicitud(null);
      mostrarMensaje('🌸 ¡Listo! Revisaremos tu solicitud en 24 hrs');
    } catch (e) {
      mostrarMensaje('Error: ' + e.message);
    } finally {
      setEnviando(false);
    }
  }

  async function handleConfirmarPremio(opcionId) {
    if (!modalPremio) return;
    setCanjeando(true);
    try {
      const resultado = await canjearRecompensa(uid, modalPremio.nivel, opcionId);
      await cargarDatos();
      setModalPremio(null);
      setModalCodigo({ codigo: resultado.codigo, opcion: resultado.opcion });
    } catch (e) {
      mostrarMensaje('Error al canjear: ' + e.message);
      setModalPremio(null);
    } finally {
      setCanjeando(false);
    }
  }

  async function subirImagen(file, uid) {
    const { getStorage, ref, uploadBytes, getDownloadURL } = await import('firebase/storage');
    const storage = getStorage();
    const storageRef = ref(storage, `evidencias/${uid}/${Date.now()}_${file.name}`);
    const snap = await uploadBytes(storageRef, file);
    return getDownloadURL(snap.ref);
  }

  function mostrarMensaje(texto) { setMensaje(texto); setTimeout(() => setMensaje(null), 4000); }

  function compartirLink() {
    const texto = `Hola! Descubrí Moonbow, la mejor tienda de K-beauty en Chile 🌸 Compra con mi link y tú ganas 10% OFF + yo gano puntos: ${linkReferido}`;
    if (navigator.share) { navigator.share({ title: 'Únete a Moonbow', text: texto, url: linkReferido }); }
    else { navigator.clipboard.writeText(texto); mostrarMensaje('✓ Mensaje copiado — ¡compártelo!'); }
  }

  if (cargando) return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
      <div style={{ fontSize: 36, animation: 'spin 2s linear infinite' }}>🌸</div>
      <div style={{ fontSize: 11, color: C.textSoft, letterSpacing: 2 }}>cargando tu tarjeta</div>
      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (!usuario) return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textSoft }}>Usuario no encontrado</div>
  );

  const pts              = usuario?.lealtad?.puntos ?? 0;
  const ptsTotal         = usuario?.lealtad?.puntos_acumulados_total ?? 0;
  const sellosLlenos     = Math.min(Math.floor(pts), TOTAL_SELLOS);
  const nivelesDesbloq   = NIVELES.filter(n => pts >= n.puntos);
  const nivelActual      = [...NIVELES].reverse().find(n => pts >= n.puntos);
  const { progreso, proxNivel, ptsFaltan } = calcularProgreso(pts, NIVELES);
  const urgente          = ptsFaltan > 0 && ptsFaltan <= 1;
  const nombre           = usuario.perfil?.nombre?.split(' ')[0] || 'amiga';
  const tier             = TIER_COLORS[nivelActual?.tier] || null;

  return (
    <div style={{ background: C.bg, minHeight: '100vh', maxWidth: 430, width: '100%', margin: '0 auto', fontFamily: "'DM Sans', -apple-system, sans-serif", color: C.text, paddingBottom: 104, position: 'relative' }}>
      <KBeautyBg />
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&family=Playfair+Display:ital,wght@0,500;1,500&display=swap');
        *{-webkit-tap-highlight-color:transparent;box-sizing:border-box}
        @keyframes slideUp  {from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        @keyframes bounceIn {0%{opacity:0;transform:translateX(-50%) scale(.85)}55%{transform:translateX(-50%) scale(1.04)}100%{opacity:1;transform:translateX(-50%) scale(1)}}
        @keyframes pulse    {0%,100%{opacity:1}50%{opacity:.6}}
        .btn-cta{transition:all .15s}.btn-cta:hover{transform:translateY(-1px);filter:brightness(1.04)}.btn-cta:active{transform:translateY(0)}
        .accion-card{transition:all .15s}.accion-card:hover{transform:translateY(-1px);box-shadow:0 6px 20px rgba(45,27,46,.08)!important}
      `}</style>

      <div style={{ position: 'relative', zIndex: 1 }}>

        {/* Header */}
        <div style={{ padding: '20px 20px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 500, color: C.text, fontFamily: "'Playfair Display', serif", fontStyle: 'italic' }}>moonbow <span style={{ color: C.rose }}>✦</span></div>
            <div style={{ fontSize: 12, color: C.textSoft, marginTop: 1 }}>Hola, {nombre} 🌸</div>
          </div>
          {onLogout && <button onClick={onLogout} style={{ background: C.white, border: `1px solid ${C.border}`, color: C.textMid, borderRadius: 10, padding: '6px 14px', fontSize: 11, cursor: 'pointer', fontWeight: 500 }}>Salir</button>}
        </div>

        {/* Toast */}
        {mensaje && (
          <div style={{ position: 'fixed', top: 22, left: '50%', background: C.white, border: `1.5px solid ${C.border}`, color: C.roseDark, padding: '12px 20px', borderRadius: 16, fontSize: 13, fontWeight: 700, zIndex: 999, whiteSpace: 'nowrap', boxShadow: '0 8px 28px rgba(45,27,46,.14)', animation: 'bounceIn .4s ease' }}>
            {mensaje}
          </div>
        )}

        {/* ── Tarjeta principal ── */}
        <div style={{ margin: '6px 16px 10px', background: 'linear-gradient(145deg,#FFF0F4,#FEF8FF,#FFF8F2)', border: `1.5px solid ${C.border}`, borderRadius: 28, padding: '22px 20px 20px', position: 'relative', overflow: 'hidden', boxShadow: '0 8px 32px rgba(242,168,184,.18)' }}>
          <div style={{ position: 'absolute', top: -40, right: -40, width: 140, height: 140, borderRadius: '50%', background: 'radial-gradient(circle,rgba(242,168,184,.22) 0%,transparent 70%)' }} />
          <div style={{ position: 'relative' }}>

            {/* Badge nivel */}
            {nivelActual && tier && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: `linear-gradient(135deg,${tier.from},${tier.to})`, borderRadius: 99, padding: '4px 14px', fontSize: 11, fontWeight: 700, color: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,.12)', marginBottom: 12 }}>
                ✦ {nivelActual.label}
              </div>
            )}

            {/* Puntos */}
            <div style={{ fontSize: 11, color: C.textSoft, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 2 }}>puntos disponibles</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
              <span style={{ fontSize: 56, fontWeight: 500, color: C.roseDark, lineHeight: 1, fontFamily: "'Playfair Display', serif" }}>
                {pts % 1 === 0 ? pts : pts.toFixed(1)}
              </span>
              <span style={{ fontSize: 16, color: C.textSoft }}>pts</span>
            </div>
            {/* Traducción de puntos a beneficio */}
            <div style={{ fontSize: 12, color: C.textSoft, marginBottom: 4 }}>{ptsTotal} acumulados en total</div>
            <div style={{ fontSize: 12, color: C.textMid, fontWeight: 500, marginBottom: 18 }}>
              {pts >= 12 ? '👑 Nivel máximo — ¡Eres Moonbow Elite!'
               : pts >= 8  ? `💖 Te acercas a 20% OFF + regalo exclusivo`
               : pts >= 5  ? `🏷️ ¡Ya tienes 10% OFF disponible!`
               : proxNivel ? `🎁 Con ${ptsFaltan.toFixed(1)} pts más → ${proxNivel.opciones[0].label}`
               : ''}
            </div>

            {/* Sellos rutina */}
            <div style={{ fontSize: 11, color: C.textMid, fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              Tu rutina completa
              <span style={{ fontSize: 10, color: C.textSoft, fontWeight: 400 }}>— toca para ver</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 7, marginBottom: 14 }}>
              {PASOS_RUTINA.map((paso, i) => (
                <SelloRutina key={i} paso={paso} activo={i < sellosLlenos} numero={i + 1} />
              ))}
            </div>

            {/* ── Barra de progreso CORREGIDA ── */}
            {proxNivel && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.textSoft, marginBottom: 6 }}>
                  {/* Muestra el inicio del segmento actual, no 0 */}
                  <span>{calcularProgreso(pts, NIVELES).ptsDesde} pts</span>
                  <span style={{ fontWeight: 700, color: urgente ? C.urgent : C.roseDark }}>
                    {urgente
                      ? `🔥 ¡Solo ${accionesFaltantes(ptsFaltan)}!`
                      : `Faltan ${ptsFaltan.toFixed(1)} pts para ${proxNivel.label}`}
                  </span>
                  <span>{proxNivel.puntos} pts</span>
                </div>
                <div style={{ height: 7, background: `${C.rose}22`, borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${progreso}%`, background: urgente ? `linear-gradient(90deg,${C.urgent},#FF9B9B)` : `linear-gradient(90deg,${C.rose},${C.roseDark})`, borderRadius: 99, transition: 'width .9s cubic-bezier(0.34,1.56,0.64,1)', boxShadow: urgente ? '0 0 10px rgba(255,107,107,.5)' : '0 0 8px rgba(217,96,122,.4)' }} />
                </div>
                <div style={{ fontSize: 11, color: C.textMid, marginTop: 6, textAlign: 'center', fontStyle: 'italic' }}>
                  {urgente
                    ? `¡Casi! Con ${accionesFaltantes(ptsFaltan)} desbloqueas: ${proxNivel.opciones[0].label}`
                    : proxNivel.objetivo}
                </div>
              </div>
            )}
            {!proxNivel && (
              <div style={{ textAlign: 'center', fontSize: 13, color: C.gold, fontWeight: 700, marginTop: 8 }}>✦ ¡Moonbow Elite! Nuestra clienta más exclusiva 👑</div>
            )}
          </div>
        </div>

        {/* Banner recompensa disponible */}
        {nivelesDesbloq.length > 0 && (
          <div style={{ margin: '0 16px 10px', background: 'linear-gradient(135deg,#EDFAF4,#F0FFF8)', border: `1.5px solid ${C.green}60`, borderRadius: 18, padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 4px 16px rgba(91,184,150,.15)' }}>
            <div style={{ fontSize: 26 }}>🎁</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>¡{nivelesDesbloq.length > 1 ? `${nivelesDesbloq.length} recompensas listas!` : 'Tu recompensa está lista!'}</div>
              <div style={{ fontSize: 12, color: C.textMid, marginTop: 1 }}>Tú eliges qué quieres 🌸</div>
            </div>
            <button onClick={() => setVista('canjear')} className="btn-cta"
              style={{ background: `linear-gradient(135deg,${C.green},#3A9E78)`, color: '#fff', border: 'none', borderRadius: 12, padding: '9px 15px', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '0 4px 12px rgba(91,184,150,.35)', fontFamily: 'inherit' }}>
              Elegir →
            </button>
          </div>
        )}

        {/* Nav fijo */}
        <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 430, background: 'rgba(253,248,245,.95)', backdropFilter: 'blur(20px)', borderTop: `1px solid ${C.border}`, display: 'flex', padding: '10px 0 20px', zIndex: 100 }}>
          {[
            { id: 'tarjeta',   icon: '◈', label: 'Tarjeta'   },
            { id: 'ganar',     icon: '✦', label: 'Ganar'     },
            { id: 'historial', icon: '◎', label: 'Historial' },
            { id: 'canjear',   icon: '🎁', label: 'Canjear'  },
          ].map(item => (
            <button key={item.id} onClick={() => setVista(item.id)}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, background: 'none', border: 'none', cursor: 'pointer', color: vista === item.id ? C.roseDark : C.textSoft, fontFamily: 'inherit', padding: '4px 0', transition: 'color .2s' }}>
              <span style={{ fontSize: 17, transition: 'transform .25s cubic-bezier(0.34,1.56,0.64,1)', transform: vista === item.id ? 'scale(1.25)' : 'scale(1)' }}>{item.icon}</span>
              <span style={{ fontSize: 9, fontWeight: vista === item.id ? 700 : 400, letterSpacing: .3 }}>{item.label}</span>
              {vista === item.id && <div style={{ width: 4, height: 4, borderRadius: '50%', background: C.rose }} />}
            </button>
          ))}
        </div>

        {/* ── Contenido ── */}
        <div style={{ padding: '0 16px', animation: 'slideUp .3s ease' }}>

          {/* ── GANAR ── */}
          {vista === 'ganar' && (
            <div>
              {/* Acción destacada única (foco visual) */}
              <div style={{ background: `linear-gradient(135deg,${C.mint}25,#EDFFF8)`, borderRadius: 20, padding: '16px 18px', marginBottom: 16, border: `2px solid ${C.mint}80`, position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 8, right: 12, fontSize: 9, fontWeight: 800, color: '#2D6E5A', background: C.mint, borderRadius: 99, padding: '3px 9px', letterSpacing: .5 }}>HAZ ESTO PRIMERO</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ fontSize: 32 }}>🔬</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: 3 }}>Diagnóstico de piel gratis</div>
                    <div style={{ fontSize: 12, color: C.textMid, lineHeight: 1.4 }}>Descubre tu rutina ideal <strong style={{ color: '#2D6E5A' }}>y gana ½ pt</strong> — en 30 segundos</div>
                  </div>
                </div>
                <a href="https://moonbow-skin-ai.vercel.app/" target="_blank" rel="noopener noreferrer" className="btn-cta"
                  style={{ display: 'block', textAlign: 'center', background: `linear-gradient(135deg,${C.mint},#3DAA84)`, color: '#fff', borderRadius: 13, padding: '11px', fontSize: 13, fontWeight: 700, textDecoration: 'none', marginTop: 12, boxShadow: '0 4px 12px rgba(91,184,150,.3)' }}>
                  Hacer diagnóstico ahora →
                </a>
              </div>

              <div style={{ marginBottom: 10 }}>
                <h2 style={{ fontSize: 18, fontWeight: 500, color: C.text, margin: '0 0 4px', fontFamily: "'Playfair Display', serif" }}>Todas las formas de ganar ✨</h2>
                <p style={{ fontSize: 12, color: C.textSoft, margin: '0 0 14px' }}>
                  Compras sobre ${(REGLA_COMPRA.monto_minimo_doble / 1000).toFixed(0)}k → <strong style={{ color: C.roseDark }}>doble puntos</strong> 🔥
                </p>
              </div>

              {/* Hero referidos */}
              <div style={{ background: `linear-gradient(135deg,${C.bgSoft},#FFF0FB)`, borderRadius: 20, padding: '15px 17px', marginBottom: 8, border: `1.5px solid ${C.rose}60`, boxShadow: '0 4px 16px rgba(242,168,184,.2)', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: -20, right: -10, fontSize: 64, opacity: .06 }}>👭</div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 14, background: `${C.rose}30`, border: `1px solid ${C.rose}60`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>👭</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Invita a una amiga</span>
                      <span style={{ background: C.roseDark, color: '#fff', fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 99 }}>POPULAR</span>
                    </div>
                    <div style={{ fontSize: 12, color: C.textMid }}>
                      <strong style={{ color: C.roseDark }}>Tú ganas 1.5 pts</strong> · <strong style={{ color: C.peachDark }}>Ella gana 10% OFF</strong>
                    </div>
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: C.roseDark }}>+1.5<span style={{ fontSize: 10 }}> pts</span></div>
                </div>
                <div style={{ background: C.white, borderRadius: 10, padding: '8px 12px', fontSize: 11, color: C.textMid, wordBreak: 'break-all', marginBottom: 10, border: `1px solid ${C.border}` }}>{linkReferido}</div>
                <button onClick={compartirLink} className="btn-cta"
                  style={{ width: '100%', background: `linear-gradient(135deg,${C.rose},${C.roseDark})`, color: '#fff', border: 'none', borderRadius: 13, padding: '12px', fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: `0 4px 14px rgba(217,96,122,.3)`, fontFamily: 'inherit' }}>
                  Invitar amigas — ambas ganan ✦
                </button>
              </div>

              {/* Resto de acciones — ordenadas por valor para el negocio */}
              {[
                { tipo: 'compra_fisica',  icon:'🛍️', pts:'+1–2', label:'Compra en tienda',      desc:`+1 pt normal · +2 pts sobre $${(REGLA_COMPRA.monto_minimo_doble/1000).toFixed(0)}k`, cta: null,         bg: C.peach    },
                { tipo: 'resena_google',  icon:'⭐',  pts:'+1',   label:'Reseña en Google',       desc:'Comparte tu experiencia',                                              cta:'Ganar +1 pt', bg:'#FFD97D'  },
                { tipo: 'historia_ig',    icon:'📸',  pts:'+½',   label:'Historia en Instagram',  desc:'Etiqueta @moonbowclub',                                                cta:'Ganar +½ pt', bg: C.lavender},
                { tipo: 'resena_producto',icon:'💬',  pts:'+½',   label:'Reseña de producto',     desc:'Escribe en moonbow.cl',                                                cta: null,         bg: C.mint     },
                { tipo: 'cumpleanos',     icon:'🎂',  pts:'+1',   label:'Tu cumpleaños',          desc:'Sorpresa el mes de tu cumple',                                         cta: null,         bg: C.peach    },
              ].map(a => (
                <div key={a.tipo} className="accion-card" style={{ display: 'flex', alignItems: 'center', gap: 11, background: C.white, borderRadius: 16, padding: '12px 14px', marginBottom: 7, border: `1px solid ${C.border}`, boxShadow: '0 2px 6px rgba(45,27,46,.04)' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: `${a.bg}25`, border: `1px solid ${a.bg}50`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>{a.icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 1 }}>{a.label}</div>
                    <div style={{ fontSize: 11, color: C.textSoft }}>{a.desc}</div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: C.roseDark, flexShrink: 0 }}>{a.pts}<span style={{ fontSize: 9 }}> pt</span></div>
                  {a.cta && (
                    <button onClick={() => setModalSolicitud(a.tipo)} className="btn-cta"
                      style={{ background: `${C.rose}22`, border: `1.5px solid ${C.rose}`, color: C.roseDark, borderRadius: 10, padding: '6px 11px', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', marginLeft: 4, flexShrink: 0, fontFamily: 'inherit' }}>
                      {a.cta}
                    </button>
                  )}
                </div>
              ))}

              <div style={{ background: `linear-gradient(135deg,${C.lavender}18,#F8F5FF)`, borderRadius: 14, padding: '13px 15px', marginTop: 8, border: `1px solid ${C.lavender}50` }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.textMid, marginBottom: 3 }}>💡 Compras online también suman</div>
                <div style={{ fontSize: 12, color: C.textSoft, lineHeight: 1.5 }}>Cada pedido en <strong style={{ color: C.roseDark }}>moonbow.cl</strong> suma puntos automáticamente según el monto.</div>
              </div>
            </div>
          )}

          {/* ── HISTORIAL ── */}
          {vista === 'historial' && (
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 500, color: C.text, margin: '0 0 20px', fontFamily: "'Playfair Display', serif" }}>Historial ◎</h2>
              {historial.length === 0 ? (
                <div style={{ textAlign: 'center', color: C.textSoft, padding: '48px 0' }}>
                  <div style={{ fontSize: 40, marginBottom: 14 }}>🌸</div>
                  <div style={{ fontSize: 14, marginBottom: 14 }}>Aún no tienes movimientos</div>
                  <button onClick={() => setVista('ganar')} style={{ background: `linear-gradient(135deg,${C.rose},${C.roseDark})`, color: '#fff', border: 'none', borderRadius: 12, padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Ganar mis primeros puntos →
                  </button>
                </div>
              ) : historial.map((mov, i) => (
                <div key={mov.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 0', borderBottom: `1px solid ${C.border}`, animation: `slideUp .3s ease ${i * .05}s both` }}>
                  <div style={{ display: 'flex', gap: 11, alignItems: 'center' }}>
                    <div style={{ width: 36, height: 36, borderRadius: 11, background: mov.puntos > 0 ? `${C.rose}20` : `${C.red}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: mov.puntos > 0 ? C.roseDark : C.red, fontWeight: 700 }}>
                      {mov.puntos > 0 ? '✦' : '◇'}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, color: C.text, fontWeight: 500, marginBottom: 1 }}>{mov.metadata?.descripcion || mov.motivo}</div>
                      <div style={{ fontSize: 11, color: C.textSoft }}>{mov.timestamp?.toDate?.()?.toLocaleDateString('es-CL') || '—'}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: mov.puntos > 0 ? C.green : C.red }}>
                    {mov.puntos > 0 ? '+' : ''}{mov.puntos} pts
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── CANJEAR ── */}
          {vista === 'canjear' && (
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 500, color: C.text, margin: '0 0 6px', fontFamily: "'Playfair Display', serif" }}>Elige tu premio 🎁</h2>
              <p style={{ fontSize: 13, color: C.textSoft, margin: '0 0 20px' }}>
                Tienes <strong style={{ color: C.roseDark }}>{pts % 1 === 0 ? pts : pts.toFixed(1)} pts</strong> · Tú decides qué quieres
              </p>

              {NIVELES.map(nivel => {
                const desbloqueado = pts >= nivel.puntos;
                const { progreso: progNivel } = calcularProgreso(Math.min(pts, nivel.puntos), [nivel]);
                const t = TIER_COLORS[nivel.tier] || TIER_COLORS.bronze;

                return (
                  <div key={nivel.nivel} style={{ background: desbloqueado ? 'linear-gradient(135deg,#FFF0F4,#FFF8F0)' : C.white, borderRadius: 22, padding: 20, marginBottom: 14, border: `1.5px solid ${desbloqueado ? C.rose : C.border}`, boxShadow: desbloqueado ? '0 8px 28px rgba(242,168,184,.2)' : '0 2px 8px rgba(45,27,46,.04)', opacity: desbloqueado ? 1 : 0.6, transition: 'all .3s' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: `linear-gradient(135deg,${t.from},${t.to})`, borderRadius: 99, padding: '4px 13px', fontSize: 11, fontWeight: 700, color: '#fff' }}>
                        ✦ {nivel.label}
                      </div>
                      <div style={{ fontSize: 17, fontWeight: 800, color: C.text }}>{nivel.puntos} pts</div>
                      {desbloqueado && <div style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: C.green, background: C.greenBg, borderRadius: 99, padding: '3px 10px' }}>✓ Lista</div>}
                    </div>

                    <div style={{ height: 5, background: `${C.rose}20`, borderRadius: 99, overflow: 'hidden', marginBottom: 12 }}>
                      <div style={{ height: '100%', width: `${Math.min((pts / nivel.puntos) * 100, 100)}%`, background: desbloqueado ? `linear-gradient(90deg,${C.green},#3A9E78)` : `linear-gradient(90deg,${C.rose},${C.roseDark})`, borderRadius: 99, transition: 'width .8s ease' }} />
                    </div>

                    <div style={{ display: 'flex', gap: 8, marginBottom: desbloqueado ? 14 : 0 }}>
                      {nivel.opciones.map(op => (
                        <div key={op.id} style={{ flex: 1, background: desbloqueado ? C.white : `${C.border}40`, borderRadius: 12, padding: '10px 8px', textAlign: 'center', border: `1px solid ${desbloqueado ? C.border : 'transparent'}` }}>
                          <div style={{ fontSize: 20, marginBottom: 4 }}>{op.emoji}</div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: desbloqueado ? C.text : C.textSoft }}>{op.label}</div>
                        </div>
                      ))}
                    </div>

                    {desbloqueado ? (
                      <button onClick={() => setModalPremio(nivel)} className="btn-cta"
                        style={{ width: '100%', background: `linear-gradient(135deg,${C.rose},${C.roseDark})`, color: '#fff', border: 'none', borderRadius: 14, padding: 13, fontSize: 14, fontWeight: 700, cursor: 'pointer', boxShadow: `0 5px 18px rgba(217,96,122,.3)`, fontFamily: 'inherit', marginTop: 4 }}>
                        ✦ Elegir mi premio
                      </button>
                    ) : (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                        <div style={{ fontSize: 12, color: C.textSoft, fontStyle: 'italic' }}>Faltan {(nivel.puntos - pts).toFixed(1)} pts</div>
                        <button onClick={() => setVista('ganar')} style={{ background: 'none', border: `1px solid ${C.border}`, color: C.textMid, borderRadius: 8, padding: '5px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                          Ganar puntos →
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modales */}
      {modalSolicitud && <ModalSolicitud tipo={modalSolicitud} enviando={enviando} onConfirmar={handleConfirmarSolicitud} onCerrar={() => setModalSolicitud(null)} />}
      {modalPremio    && <ModalPremio    nivel={modalPremio}    canjeando={canjeando} onConfirmar={handleConfirmarPremio}  onCerrar={() => setModalPremio(null)} />}
      {modalCodigo    && <ModalCodigo    codigo={modalCodigo.codigo} opcion={modalCodigo.opcion} onCerrar={() => { setModalCodigo(null); setVista('tarjeta'); }} />}
    </div>
  );
}
