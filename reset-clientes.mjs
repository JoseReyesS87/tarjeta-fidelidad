// reset-clientes.mjs
//
// Resetea TODOS los clientes de la tarjeta de fidelización:
//   ✓ puntos actuales → 0
//   ✓ puntos_acumulados_total → 0
//   ✓ tier → 'bronze'
//   ✓ acciones_realizadas → {} (bienvenida, reseña, historia IG, etc.)
//   ✓ colección transacciones_lealtad → eliminada completamente
//
// USO:
//   1. Coloca este archivo en la raíz de tu proyecto Next.js
//   2. Asegúrate de tener: npm install firebase-admin
//   3. Descarga tu serviceAccountKey.json desde Firebase Console →
//      Configuración del proyecto → Cuentas de servicio → Generar nueva clave privada
//   4. Ejecuta: node reset-clientes.mjs
//
// ⚠️  IRREVERSIBLE — haz un export de Firestore antes si quieres respaldo.
//

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore }        from 'firebase-admin/firestore';
import { createRequire }       from 'module';

const require = createRequire(import.meta.url);

// ─── Configuración ────────────────────────────────────────────────────────────
const SERVICE_ACCOUNT_PATH = './serviceAccountKey.json'; // ajusta si es necesario

const serviceAccount = require(SERVICE_ACCOUNT_PATH);

initializeApp({ credential: cert(serviceAccount) });

const db = getFirestore();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Elimina todos los documentos de una subcolección en lotes de 500 */
async function borrarSubcoleccion(docRef, subcoleccion) {
  const colRef = docRef.collection(subcoleccion);
  let total = 0;

  while (true) {
    const snap = await colRef.limit(500).get();
    if (snap.empty) break;

    const batch = db.batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    total += snap.size;
  }

  return total;
}

// ─── Reset principal ──────────────────────────────────────────────────────────

async function resetearTodosLosClientes() {
  console.log('🔍 Obteniendo todos los usuarios...\n');

  const usuariosSnap = await db.collection('usuarios').get();

  if (usuariosSnap.empty) {
    console.log('No se encontraron usuarios en Firestore.');
    return;
  }

  console.log(`👥 Usuarios encontrados: ${usuariosSnap.size}\n`);
  console.log('─'.repeat(50));

  let exitosos = 0;
  let errores  = 0;

  for (const userDoc of usuariosSnap.docs) {
    const uid   = userDoc.id;
    const email = userDoc.data()?.email ?? '(sin email)';

    try {
      // 1. Resetear campos de lealtad y acciones_realizadas
      await userDoc.ref.update({
        'lealtad.puntos':                    0,
        'lealtad.puntos_acumulados_total':   0,
        'lealtad.tier':                      'bronze',
        'acciones_realizadas':               {},
      });

      // 2. Borrar todas las transacciones
      const txBorradas = await borrarSubcoleccion(userDoc.ref, 'transacciones_lealtad');

      console.log(`✅ ${email} (${uid}) — ${txBorradas} transacciones eliminadas`);
      exitosos++;

    } catch (err) {
      console.error(`❌ Error con ${email} (${uid}):`, err.message);
      errores++;
    }
  }

  console.log('\n' + '─'.repeat(50));
  console.log(`\n✅ Reset completado`);
  console.log(`   • Usuarios reseteados: ${exitosos}`);
  if (errores > 0) {
    console.log(`   • Errores:             ${errores} (revisa los mensajes arriba)`);
  }
}

resetearTodosLosClientes().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
