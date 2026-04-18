'use client';
// app/fidelizacion/page.jsx

import { useState, useEffect } from 'react';
import { auth, db } from '@/lib/firebase';
import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getUsuario } from '@/lib/puntos';
import TarjetaFidelizacion from '@/components/TarjetaFidelizacion';

export default function FidelizacionPage() {
  const [authUser, setAuthUser]   = useState(undefined); // undefined = cargando
  const [dbUser, setDbUser]       = useState(undefined);
  const [nombre, setNombre]       = useState('');
  const [guardando, setGuardando] = useState(false);

  // Escuchar auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setAuthUser(user);
      if (user) {
        const data = await getUsuario(user.uid);
        setDbUser(data); // null si no existe en Firestore
      } else {
        setDbUser(undefined);
      }
    });
    return () => unsub();
  }, []);

  async function handleLogin() {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (e) {
      console.error('Error al iniciar sesión:', e);
    }
  }

  async function handleRegistro(e) {
    e.preventDefault();
    if (!nombre.trim()) return;
    setGuardando(true);

    try {
      // Buscar referido en URL si viene de un link
      const params = new URLSearchParams(window.location.search);
      const refUid = params.get('ref');

      await setDoc(doc(db, 'usuarios', authUser.uid), {
        perfil: {
          nombre: nombre.trim(),
          email:  authUser.email,
        },
        lealtad: {
          puntos:                 200,
          puntos_acumulados_total: 200,
          tier:                   'bronze',
        },
        metadata: {
          created_at:        serverTimestamp(),
          ultima_interaccion: serverTimestamp(),
          total_purchases:   0,
          last_purchase_date: null,
          canal_registro:    'web',
          referido_por:      refUid || null,
        },
      });

      // Registrar transacción de bienvenida
      const { addDoc, collection } = await import('firebase/firestore');
      await addDoc(collection(db, 'usuarios', authUser.uid, 'transacciones_lealtad'), {
        tipo:             'earn',
        motivo:           'bienvenida',
        puntos:           200,
        saldo_resultante: 200,
        timestamp:        serverTimestamp(),
        metadata: {
          descripcion:  'Puntos de bienvenida',
          aprobado_por: 'sistema',
          monto:        null,
          orden_id:     null,
        },
      });

      // Si vino referido, sumar puntos al referidor
      if (refUid) {
        const { agregarPuntos } = await import('@/lib/puntos');
        await agregarPuntos(refUid, 'referido', {
          descripcion: `Referido: ${nombre.trim()}`,
          aprobado_por: 'sistema',
        });
      }

      // Recargar datos
      const data = await getUsuario(authUser.uid);
      setDbUser(data);
    } catch (err) {
      console.error('Error al registrar:', err);
    } finally {
      setGuardando(false);
    }
  }

  // ── Estados de UI ──────────────────────────────────────────────────────────

  // Cargando auth
  if (authUser === undefined) {
    return <Pantalla><Spinner /></Pantalla>;
  }

  // No autenticado → Login
  if (!authUser) {
    return (
      <div style={estilos.loginContenedor}>
        <div style={estilos.loginCard}>
          <div style={estilos.loginLogo}>✦ fiel</div>
          <h1 style={estilos.loginTitulo}>Tu tarjeta de puntos</h1>
          <p style={estilos.loginDesc}>
            Acumula puntos en cada compra y canjéalos por productos y descuentos exclusivos.
          </p>
          <button style={estilos.btnGoogle} onClick={handleLogin}>
            <GoogleIcon />
            Continuar con Google
          </button>
        </div>
      </div>
    );
  }

  // Autenticado pero cargando datos de Firestore
  if (dbUser === undefined) {
    return <Pantalla><Spinner /></Pantalla>;
  }

  // Autenticado pero no registrado → Formulario de registro
  if (!dbUser) {
    return (
      <div style={estilos.loginContenedor}>
        <div style={estilos.loginCard}>
          <div style={estilos.loginLogo}>✦ fiel</div>
          <h1 style={estilos.loginTitulo}>¡Bienvenida!</h1>
          <p style={estilos.loginDesc}>
            Completa tu perfil para activar tu tarjeta y recibir <strong style={{ color: '#e8c4a0' }}>200 puntos de bienvenida</strong>.
          </p>

          <form onSubmit={handleRegistro}>
            <label style={estilos.label}>Tu nombre</label>
            <input
              style={estilos.input}
              type="text"
              placeholder="Ej: María González"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              required
              autoFocus
            />

            <div style={estilos.emailMostrado}>
              📧 {authUser.email}
            </div>

            <button
              type="submit"
              style={{
                ...estilos.btnGoogle,
                background: 'linear-gradient(135deg, #c9956a, #e8c4a0)',
                color: '#000',
                marginTop: 8,
                opacity: guardando ? 0.7 : 1,
              }}
              disabled={guardando}
            >
              {guardando ? 'Activando...' : '✦ Activar mi tarjeta'}
            </button>
          </form>

          <button
            style={estilos.btnSalir}
            onClick={() => signOut(auth)}
          >
            Usar otra cuenta
          </button>
        </div>
      </div>
    );
  }

  // Todo OK → Mostrar tarjeta
  return <TarjetaFidelizacion uid={authUser.uid} onLogout={() => signOut(auth)} />;
}

// ── Componentes auxiliares ─────────────────────────────────────────────────
function Pantalla({ children }) {
  return (
    <div style={{ minHeight: '100vh', background: '#0d0d0d', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {children}
    </div>
  );
}

function Spinner() {
  return <div style={{ color: '#e8c4a0', fontSize: 32 }}>✦</div>;
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" style={{ marginRight: 10 }}>
      <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"/>
      <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17z"/>
      <path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18l2.67-2.07z"/>
      <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 1.83 5.4L4.5 7.49a4.77 4.77 0 0 1 4.48-3.3z"/>
    </svg>
  );
}

// ── Estilos ────────────────────────────────────────────────────────────────
const estilos = {
  loginContenedor: {
    minHeight: '100vh',
    background: '#0d0d0d',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  loginCard: {
    background: '#151515',
    border: '1px solid #222',
    borderRadius: 24,
    padding: '40px 32px',
    maxWidth: 380,
    width: '100%',
    textAlign: 'center',
  },
  loginLogo: {
    fontSize: 28,
    fontWeight: 800,
    color: '#e8c4a0',
    marginBottom: 24,
    letterSpacing: 2,
  },
  loginTitulo: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 700,
    margin: '0 0 12px',
  },
  loginDesc: {
    color: '#666',
    fontSize: 14,
    lineHeight: 1.6,
    marginBottom: 24,
  },
  label: {
    display: 'block',
    fontSize: 12,
    color: '#888',
    marginBottom: 6,
    textAlign: 'left',
  },
  input: {
    width: '100%',
    background: '#1a1a1a',
    border: '1px solid #333',
    borderRadius: 12,
    padding: '14px 16px',
    color: '#fff',
    fontSize: 15,
    marginBottom: 12,
    boxSizing: 'border-box',
    outline: 'none',
  },
  emailMostrado: {
    fontSize: 12,
    color: '#444',
    marginBottom: 16,
    textAlign: 'left',
  },
  btnGoogle: {
    width: '100%',
    background: '#fff',
    color: '#000',
    border: 'none',
    borderRadius: 12,
    padding: '14px 20px',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSalir: {
    marginTop: 16,
    background: 'transparent',
    border: 'none',
    color: '#444',
    fontSize: 12,
    cursor: 'pointer',
    textDecoration: 'underline',
  },
};
