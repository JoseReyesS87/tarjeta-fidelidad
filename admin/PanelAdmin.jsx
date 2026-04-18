'use client';
// admin/PanelAdmin.jsx — v4 con opciones de premio y código Shopify

import { useState, useEffect } from 'react';
import {
  getAccionesPendientes, aprobarAccion, rechazarAccion,
  agregarPuntos, getTopClientes, getUsuario, ACCIONES
} from '../lib/puntos';
import { collection, query, orderBy, limit, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

const C = {
  bg:       '#FDF8F5',
  white:    '#FFFFFF',
  bgSoft:   '#FEF3F0',
  rose:     '#F2A8B8',
  roseDark: '#D9607A',
  peach:    '#F7C5A8',
  gold:     '#D4A96A',
  silver:   '#A8A9AD',
  text:     '#2D1B2E',
  textMid:  '#6B4A5E',
  textSoft: '#A8849A',
  border:   '#EDD8E4',
  green:    '#5BB896',
  greenBg:  '#EDFAF4',
  red:      '#E8857E',
  redBg:    '#FEF0EF',
};

const TIER_COLORS = {
  bronze: { from: '#F2C4A0', to: '#E89878' },
  silver: { from: '#D0D0D4', to: '#A8A9AD' },
  gold:   { from: '#F7D98B', to: '#D4A96A' },
};

export default function PanelAdmin({ adminUid }) {
  const [vista, setVista]               = useState('pendientes');
  const [pendientes, setPendientes]     = useState([]);
  const [topClientes, setTopClientes]   = useState([]);
  const [recompensas, setRecompensas]   = useState([]);
  const [cargando, setCargando]         = useState(true);
  const [mensaje, setMensaje]           = useState(null);
  const [modalPuntos, setModalPuntos]   = useState(false);
  const [uidManual, setUidManual]       = useState('');
  const [accionManual, setAccionManual] = useState('compra_fisica');
  const [montoManual, setMontoManual]   = useState('');
  const [usuarioFound, setUsuarioFound] = useState(null);

  useEffect(() => { cargarDatos(); }, [vista]);

  async function cargarDatos() {
    setCargando(true);
    if (vista === 'pendientes') {
      setPendientes(await getAccionesPendientes());
    } else if (vista === 'clientes') {
      setTopClientes(await getTopClientes(20));
    } else if (vista === 'recompensas') {
      const q = query(collection(db, 'recompensas'), orderBy('fecha_canje', 'desc'), limit(30));
      const snap = await getDocs(q);
      setRecompensas(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }
    setCargando(false);
  }

  async function handleAprobar(id)  { await aprobarAccion(id, adminUid);  mostrarMensaje('🌸 Puntos aprobados'); cargarDatos(); }
  async function handleRechazar(id) { await rechazarAccion(id);           mostrarMensaje('Acción rechazada');   cargarDatos(); }

  async function handleMarcarEntregado(recompensaId) {
    await updateDoc(doc(db, 'recompensas', recompensaId), { entregado: true });
    mostrarMensaje('✓ Marcada como entregada');
    cargarDatos();
  }

  async function handleBuscarUsuario() {
    setUsuarioFound(await getUsuario(uidManual));
  }

  async function handleAgregarPuntosManual() {
    if (!usuarioFound) return;
    await agregarPuntos(uidManual, accionManual, { monto: montoManual ? parseInt(montoManual) : null, aprobado_por: adminUid });
    mostrarMensaje(`✦ Puntos añadidos a ${usuarioFound.perfil?.nombre || 'cliente'}`);
    setModalPuntos(false); setUidManual(''); setUsuarioFound(null); setMontoManual('');
  }

  function mostrarMensaje(texto) { setMensaje(texto); setTimeout(() => setMensaje(null), 3000); }

  const iconoAccion = { historia_ig: '📸', resena_google: '⭐', resena_producto: '💬', referido: '👭', compra_fisica: '🛍️', compra_online: '🛒' };

  function DatosVerificacion({ accion }) {
    if (accion.tipo === 'resena_google') return (
      <div style={aS.verBox}>
        <div style={aS.verLabel}>🔍 Verificar reseña</div>
        {accion.link_resena
          ? <a href={accion.link_resena} target="_blank" rel="noopener noreferrer" style={aS.verLink}>Ver en Google Maps →</a>
          : <div style={aS.verVacio}>Sin link proporcionado</div>}
      </div>
    );
    if (accion.tipo === 'historia_ig') return (
      <div style={aS.verBox}>
        <div style={aS.verLabel}>🔍 Verificar historia</div>
        {accion.handle_ig
          ? <a href={`https://instagram.com/${accion.handle_ig.replace('@','')}`} target="_blank" rel="noopener noreferrer" style={aS.verLink}>Ver perfil: {accion.handle_ig} →</a>
          : <div style={aS.verVacio}>{accion.imagen_url ? 'Revisar screenshot arriba' : 'Sin datos adicionales'}</div>}
      </div>
    );
    if (accion.tipo === 'referido') return (
      <div style={aS.verBox}>
        <div style={aS.verLabel}>🔍 Referida</div>
        {accion.nombre_referido && <div style={aS.verDato}>👤 {accion.nombre_referido}</div>}
        {accion.uid_referido && <div style={{ ...aS.verDato, fontSize: 10, color: C.textSoft, wordBreak: 'break-all' }}>UID: {accion.uid_referido}</div>}
        {!accion.uid_referido && !accion.nombre_referido && <div style={aS.verVacio}>Sin datos del referido</div>}
      </div>
    );
    return null;
  }

  // Badge de tier
  function TierBadge({ tier }) {
    const t = TIER_COLORS[tier] || TIER_COLORS.bronze;
    const labels = { bronze: 'Bronce', silver: 'Plata', gold: 'Oro' };
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: `linear-gradient(135deg,${t.from},${t.to})`, borderRadius: 99, padding: '3px 10px', fontSize: 10, fontWeight: 700, color: '#fff' }}>
        ✦ {labels[tier] || tier}
      </span>
    );
  }

  return (
    <div style={{ background: C.bg, minHeight: '100vh', maxWidth: 430, margin: '0 auto', fontFamily: "'DM Sans', -apple-system, sans-serif", color: C.text, paddingBottom: 24 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:ital,wght@1,500&display=swap');
        *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
        @keyframes slideUp  {from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes bounceIn {0%{opacity:0;transform:translateX(-50%) scale(.85)}55%{transform:translateX(-50%) scale(1.04)}100%{opacity:1;transform:translateX(-50%) scale(1)}}
      `}</style>

      {/* Header */}
      <div style={{ padding: '20px 20px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: C.white, borderBottom: `1px solid ${C.border}` }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 500, color: C.text, fontFamily: "'Playfair Display', serif", fontStyle: 'italic' }}>moonbow <span style={{ color: C.rose }}>✦</span></div>
          <div style={{ fontSize: 11, color: C.textSoft, marginTop: 2, letterSpacing: .5 }}>Panel de administración</div>
        </div>
        <button onClick={() => setModalPuntos(true)}
          style={{ background: `linear-gradient(135deg,${C.rose},${C.roseDark})`, color: '#fff', border: 'none', borderRadius: 12, padding: '10px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: `0 4px 12px rgba(217,96,122,.3)`, fontFamily: 'inherit' }}>
          + Puntos
        </button>
      </div>

      {/* Toast */}
      {mensaje && (
        <div style={{ position: 'fixed', top: 24, left: '50%', background: C.white, border: `1px solid ${C.border}`, color: C.roseDark, padding: '12px 20px', borderRadius: 16, fontSize: 13, fontWeight: 600, zIndex: 999, whiteSpace: 'nowrap', boxShadow: '0 8px 24px rgba(45,27,46,.12)', animation: 'bounceIn .4s ease' }}>
          {mensaje}
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, padding: '14px 16px 0' }}>
        {[
          { num: pendientes.length,                             label: 'Pendientes', color: C.rose     },
          { num: topClientes.length,                            label: 'Clientes',   color: C.lavender || '#C9B8E8' },
          { num: recompensas.filter(r => !r.entregado).length,  label: 'Por dar',    color: C.gold     },
        ].map((s, i) => (
          <div key={i} style={{ background: C.white, borderRadius: 16, padding: '14px 12px', textAlign: 'center', border: `1px solid ${C.border}`, boxShadow: '0 2px 8px rgba(45,27,46,.04)' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: s.color, fontFamily: "'Playfair Display', serif" }}>{s.num}</div>
            <div style={{ fontSize: 11, color: C.textSoft, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Nav */}
      <div style={{ display: 'flex', padding: '12px 16px 0', gap: 8 }}>
        {[
          { id: 'pendientes',  label: '⏳ Pendientes' },
          { id: 'clientes',    label: '👭 Clientes'   },
          { id: 'recompensas', label: '🎁 Recompensas'},
        ].map(item => (
          <button key={item.id} onClick={() => setVista(item.id)}
            style={{ flex: 1, padding: '9px 6px', background: vista === item.id ? `linear-gradient(135deg,${C.bgSoft},#FFF0FB)` : C.white, border: `1.5px solid ${vista === item.id ? C.rose : C.border}`, borderRadius: 12, color: vista === item.id ? C.roseDark : C.textSoft, fontSize: 12, fontWeight: vista === item.id ? 700 : 400, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .2s' }}>
            {item.label}
          </button>
        ))}
      </div>

      <div style={{ padding: 16 }}>
        {cargando && <div style={{ textAlign: 'center', color: C.textSoft, padding: 48, fontSize: 24 }}>🌸</div>}

        {/* ── PENDIENTES ── */}
        {!cargando && vista === 'pendientes' && (
          <div style={{ animation: 'slideUp .3s ease' }}>
            {pendientes.length === 0 ? (
              <div style={{ textAlign: 'center', color: C.textSoft, padding: '48px 0' }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>✦</div>
                Sin acciones pendientes
              </div>
            ) : pendientes.map((accion, i) => (
              <div key={accion.id} style={{ background: C.white, borderRadius: 20, padding: 18, marginBottom: 12, border: `1px solid ${C.border}`, boxShadow: '0 2px 12px rgba(45,27,46,.06)', animation: `slideUp .3s ease ${i * .06}s both` }}>
                <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
                  <div style={{ width: 46, height: 46, borderRadius: 14, background: `${C.rose}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
                    {iconoAccion[accion.tipo] || '📋'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{accion.nombre_usuario}</div>
                    <div style={{ fontSize: 12, color: C.textMid, marginTop: 2 }}>{accion.descripcion}</div>
                    <div style={{ fontSize: 11, color: C.textSoft, marginTop: 3 }}>{accion.fecha?.toDate?.()?.toLocaleDateString('es-CL')}</div>
                  </div>
                  <div style={{ background: `${C.peach}30`, border: `1px solid ${C.peach}`, borderRadius: 10, padding: '4px 10px', fontSize: 13, fontWeight: 700, color: C.gold, alignSelf: 'flex-start', whiteSpace: 'nowrap' }}>
                    +{ACCIONES[accion.tipo]?.puntos} pts
                  </div>
                </div>
                {accion.imagen_url && <img src={accion.imagen_url} alt="Evidencia" style={{ width: '100%', borderRadius: 14, marginBottom: 12, border: `1px solid ${C.border}` }} />}
                <DatosVerificacion accion={accion} />
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <button onClick={() => handleRechazar(accion.id)}
                    style={{ flex: 1, padding: '11px 0', background: C.redBg, border: `1.5px solid ${C.red}60`, color: C.red, borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                    ✕ Rechazar
                  </button>
                  <button onClick={() => handleAprobar(accion.id)}
                    style={{ flex: 2, padding: '11px 0', background: C.greenBg, border: `1.5px solid ${C.green}80`, color: '#3A9E78', borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                    ✓ Aprobar puntos
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── CLIENTES ── */}
        {!cargando && vista === 'clientes' && (
          <div style={{ animation: 'slideUp .3s ease' }}>
            {topClientes.map((cliente, i) => (
              <div key={cliente.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 0', borderBottom: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 11, color: C.textSoft, width: 22, textAlign: 'center', fontWeight: 600 }}>#{i + 1}</div>
                <div style={{ width: 36, height: 36, borderRadius: 11, background: `linear-gradient(135deg,${C.rose}28,${C.peach}20)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>🌸</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{cliente.perfil?.nombre || cliente.perfil?.email || 'Sin nombre'}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    <TierBadge tier={cliente.lealtad?.tier || 'bronze'} />
                    <span style={{ fontSize: 10, color: C.textSoft }}>{(cliente.lealtad?.puntos_acumulados_total || 0).toFixed(0)} pts totales</span>
                  </div>
                </div>
                <div style={{ textAlign: 'center', flexShrink: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: C.roseDark }}>{(cliente.lealtad?.puntos || 0).toFixed(0)}</div>
                  <div style={{ fontSize: 9, color: C.textSoft }}>disponibles</div>
                </div>
                <button onClick={() => { setUidManual(cliente.id); setUsuarioFound(cliente); setModalPuntos(true); }}
                  style={{ width: 32, height: 32, background: `${C.rose}20`, border: `1.5px solid ${C.rose}`, color: C.roseDark, borderRadius: 10, fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }}>
                  +
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ── RECOMPENSAS ── */}
        {!cargando && vista === 'recompensas' && (
          <div style={{ animation: 'slideUp .3s ease' }}>
            {recompensas.length === 0 ? (
              <div style={{ textAlign: 'center', color: C.textSoft, padding: '48px 0' }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>🎁</div>
                Sin recompensas aún
              </div>
            ) : recompensas.map(r => (
              <div key={r.id} style={{ background: C.white, borderRadius: 18, padding: '16px', marginBottom: 10, border: `1px solid ${C.border}`, boxShadow: '0 2px 8px rgba(45,27,46,.04)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: r.entregado ? 0 : 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <TierBadge tier={r.tier || 'bronze'} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{r.opcion_label || r.premio}</span>
                    </div>
                    {/* Código Shopify */}
                    {r.codigo_shopify && (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: `${C.peach}30`, border: `1px solid ${C.peach}`, borderRadius: 8, padding: '3px 10px', marginBottom: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: C.gold, letterSpacing: 1 }}>🏷️ {r.codigo_shopify}</span>
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: C.textSoft }}>{r.fecha_canje?.toDate?.()?.toLocaleDateString('es-CL')}</div>
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 99, background: r.entregado ? C.greenBg : `${C.peach}30`, color: r.entregado ? '#3A9E78' : C.gold, flexShrink: 0 }}>
                    {r.entregado ? '✓ Entregado' : 'Pendiente'}
                  </div>
                </div>
                {/* Tipo de entrega */}
                {!r.entregado && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div style={{ flex: 1, fontSize: 11, color: C.textSoft, fontStyle: 'italic' }}>
                      {r.opcion_tipo === 'descuento' ? '→ Código ya disponible para la clienta' :
                       r.opcion_tipo === 'envio'     ? '→ Aplicar envío gratis en su próximo pedido' :
                       r.opcion_tipo === 'producto'  ? '→ Entrega física en tienda o envío' :
                       r.opcion_tipo === 'kit'       ? '→ Armar kit según perfil de piel' : ''}
                    </div>
                    <button onClick={() => handleMarcarEntregado(r.id)}
                      style={{ background: C.greenBg, border: `1.5px solid ${C.green}80`, color: '#3A9E78', borderRadius: 10, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' }}>
                      Marcar entregado ✓
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal añadir puntos */}
      {modalPuntos && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(45,27,46,.5)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'flex-end', zIndex: 200 }}
          onClick={() => { setModalPuntos(false); setUsuarioFound(null); setUidManual(''); }}>
          <div style={{ background: C.white, borderRadius: '28px 28px 0 0', padding: '10px 24px 52px', width: '100%', maxWidth: 430, margin: '0 auto', boxShadow: '0 -8px 40px rgba(45,27,46,.15)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ width: 36, height: 4, background: C.border, borderRadius: 99, margin: '0 auto 22px' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: C.text, fontFamily: "'Playfair Display', serif", fontStyle: 'italic' }}>Añadir puntos</div>
              <button onClick={() => { setModalPuntos(false); setUsuarioFound(null); setUidManual(''); }}
                style={{ background: C.bgSoft, border: 'none', borderRadius: 12, width: 34, height: 34, cursor: 'pointer', color: C.textMid, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>
            {!usuarioFound ? (
              <div>
                <label style={aS.label}>UID del cliente</label>
                <input style={aS.input} value={uidManual} onChange={e => setUidManual(e.target.value)} placeholder="UID en Firebase" />
                <button onClick={handleBuscarUsuario} style={aS.btnSecundario}>Buscar cliente</button>
              </div>
            ) : (
              <div>
                <div style={{ background: `linear-gradient(135deg,${C.bgSoft},#FFF0FB)`, borderRadius: 14, padding: 14, marginBottom: 18, border: `1.5px solid ${C.border}` }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: C.roseDark }}>{usuarioFound.perfil?.nombre || usuarioFound.perfil?.email}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                    <TierBadge tier={usuarioFound.lealtad?.tier || 'bronze'} />
                    <span style={{ fontSize: 13, color: C.textSoft }}>{(usuarioFound.lealtad?.puntos || 0).toFixed(0)} pts actuales</span>
                  </div>
                </div>
                <label style={aS.label}>Tipo de acción</label>
                <select style={aS.select} value={accionManual} onChange={e => setAccionManual(e.target.value)}>
                  {Object.entries(ACCIONES).map(([key, val]) => (
                    <option key={key} value={key}>{val.label} (+{val.puntos} pts)</option>
                  ))}
                </select>
                {accionManual === 'compra_fisica' && (
                  <>
                    <label style={aS.label}>Monto compra (CLP)</label>
                    <input style={aS.input} type="number" value={montoManual} onChange={e => setMontoManual(e.target.value)} placeholder="Ej: 15000" />
                  </>
                )}
                <button onClick={handleAgregarPuntosManual} style={aS.btnPrimario}>
                  Confirmar +{ACCIONES[accionManual]?.puntos} pts a {usuarioFound.perfil?.nombre?.split(' ')[0] || 'cliente'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Estilos inline para TierBadge (necesita acceso a C.lavender) */}
      <style>{`.tier-badge-lavender{background:linear-gradient(135deg,#D8C8F0,#C9B8E8)}`}</style>
    </div>
  );
}

// Estilos compartidos
const aS = {
  label:        { display: 'block', fontSize: 12, color: '#6B4A5E', marginBottom: 6, fontWeight: 500 },
  input:        { width: '100%', background: '#FEF3F0', border: '1.5px solid #EDD8E4', borderRadius: 12, padding: '12px 14px', color: '#2D1B2E', fontSize: 14, marginBottom: 14, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' },
  select:       { width: '100%', background: '#FEF3F0', border: '1.5px solid #EDD8E4', borderRadius: 12, padding: '12px 14px', color: '#2D1B2E', fontSize: 14, marginBottom: 14, cursor: 'pointer', fontFamily: 'inherit' },
  btnPrimario:  { width: '100%', background: 'linear-gradient(135deg,#F2A8B8,#D9607A)', color: '#fff', border: 'none', borderRadius: 16, padding: 14, fontSize: 14, fontWeight: 700, cursor: 'pointer', boxShadow: '0 6px 20px rgba(217,96,122,.35)', fontFamily: 'inherit' },
  btnSecundario:{ width: '100%', background: '#FEF3F0', border: '1.5px solid #EDD8E4', color: '#6B4A5E', borderRadius: 14, padding: 13, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  verBox:       { background: '#FEF3F0', borderRadius: 12, padding: '10px 12px', marginBottom: 12, border: '1px solid #EDD8E4' },
  verLabel:     { fontSize: 10, color: '#A8849A', marginBottom: 5, textTransform: 'uppercase', letterSpacing: .5, fontWeight: 600 },
  verLink:      { display: 'block', color: '#D9607A', fontSize: 13, textDecoration: 'underline', fontWeight: 500 },
  verDato:      { fontSize: 12, color: '#6B4A5E', marginTop: 3 },
  verVacio:     { fontSize: 12, color: '#A8849A', fontStyle: 'italic' },
};
