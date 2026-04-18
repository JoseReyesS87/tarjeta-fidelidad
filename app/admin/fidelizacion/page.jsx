'use client';
// app/admin/fidelizacion/page.jsx

import { useState, useEffect } from 'react';
import { auth } from '@/lib/firebase';
import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from 'firebase/auth';
import PanelAdmin from '@/admin/PanelAdmin';

const ADMIN_UID = process.env.NEXT_PUBLIC_ADMIN_UID;

export default function AdminPage() {
  const [usuario, setUsuario] = useState(undefined);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setUsuario(user);
    });
    return () => unsub();
  }, []);

  async function handleLogin() {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (e) {
      console.error('Error:', e);
    }
  }

  if (usuario === undefined) {
    return (
      <div style={estilos.centrado}>
        <span style={{ color: '#e8c4a0', fontSize: 32 }}>✦</span>
      </div>
    );
  }

  if (!usuario) {
    return (
      <div style={estilos.centrado}>
        <div style={estilos.card}>
          <div style={estilos.logo}>✦ admin</div>
          <button style={estilos.btnGoogle} onClick={handleLogin}>
            Iniciar sesión con Google
          </button>
        </div>
      </div>
    );
  }

  if (usuario.uid !== ADMIN_UID) {
    return (
      <div style={estilos.centrado}>
        <div style={estilos.card}>
          <div style={{ color: '#f87171', fontSize: 32, marginBottom: 16 }}>✗</div>
          <div style={{ color: '#fff', marginBottom: 8 }}>Acceso no autorizado</div>
          <div style={{ color: '#555', fontSize: 13, marginBottom: 24 }}>{usuario.email}</div>
          <button style={estilos.btnSalir} onClick={() => signOut(auth)}>
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  return <PanelAdmin adminUid={usuario.uid} onLogout={() => signOut(auth)} />;
}

const estilos = {
  centrado: {
    minHeight: '100vh',
    background: '#0a0a0a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    background: '#151515',
    border: '1px solid #222',
    borderRadius: 20,
    padding: '40px 32px',
    textAlign: 'center',
    maxWidth: 320,
    width: '100%',
  },
  logo: {
    fontSize: 24,
    fontWeight: 800,
    color: '#e8c4a0',
    marginBottom: 24,
  },
  btnGoogle: {
    width: '100%',
    background: '#fff',
    color: '#000',
    border: 'none',
    borderRadius: 12,
    padding: '14px 20px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnSalir: {
    background: 'transparent',
    border: '1px solid #333',
    color: '#888',
    borderRadius: 10,
    padding: '10px 20px',
    cursor: 'pointer',
    fontSize: 13,
  },
};
