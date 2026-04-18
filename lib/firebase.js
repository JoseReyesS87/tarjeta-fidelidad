// lib/firebase.js
// Reemplaza con tu configuración de Firebase
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

/*
ESTRUCTURA FIRESTORE:

usuarios/{uid}
  nombre: string
  email: string
  telefono: string
  tipo_piel: string          (del analizador)
  puntos_actuales: number
  puntos_historicos: number  (total acumulado)
  fecha_registro: timestamp
  canal_registro: string     (tienda_fisica | online)
  referido_por: string       (uid del referidor)
  referidos: array           (uids de referidos)
  recompensas_canjeadas: array

historial_puntos/{uid}/movimientos/{auto_id}
  fecha: timestamp
  accion: string
  puntos: number
  descripcion: string
  aprobado: boolean
  aprobado_por: string       (uid del admin)
  monto: number              (si es compra)

acciones_pendientes/{auto_id}
  uid_usuario: string
  nombre_usuario: string
  tipo: string               (historia_ig | resena_google | resena_producto | referido)
  descripcion: string
  fecha: timestamp
  imagen_url: string         (captura de pantalla si aplica)
  estado: string             (pendiente | aprobado | rechazado)

recompensas/{auto_id}
  uid_usuario: string
  nivel: number              (5 o 8)
  premio: string
  fecha_canje: timestamp
  entregado: boolean
*/
